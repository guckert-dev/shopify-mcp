/**
 * Refund management tools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  executeGraphQL,
  handleApiError,
  formatMoney,
  formatDate,
  toGid,
  extractNumericId,
} from "../services/shopify-client.js";
import { ORDER_REFUND_QUERY, REFUND_CREATE_MUTATION } from "../services/queries.js";
import { ResponseFormat } from "../constants.js";
import { ResponseFormatSchema, ShopifyIdSchema } from "../schemas/common.js";

// ============================================
// TYPES
// ============================================

interface RefundLineItem {
  lineItem: {
    id: string;
    title: string;
  };
  quantity: number;
  subtotalSet: {
    shopMoney: {
      amount: string;
      currencyCode: string;
    };
  };
}

interface Refund {
  id: string;
  createdAt: string;
  note: string | null;
  totalRefundedSet: {
    shopMoney: {
      amount: string;
      currencyCode: string;
    };
  };
  refundLineItems: {
    edges: Array<{ node: RefundLineItem }>;
  };
}

interface OrderRefundsResponse {
  order: {
    id: string;
    name: string;
    refunds: Refund[];
  } | null;
}

// ============================================
// SCHEMAS
// ============================================

const GetRefundsInputSchema = z.object({
  order_id: ShopifyIdSchema.describe("Order ID to get refunds for"),
  response_format: ResponseFormatSchema,
}).strict();

type GetRefundsInput = z.infer<typeof GetRefundsInputSchema>;

const CreateRefundInputSchema = z.object({
  order_id: ShopifyIdSchema.describe("Order ID to refund"),
  note: z.string().optional().describe("Internal note about the refund reason"),
  notify_customer: z.boolean().default(true).describe("Send refund notification to customer"),
  refund_line_items: z
    .array(
      z.object({
        line_item_id: ShopifyIdSchema.describe("Line item ID to refund"),
        quantity: z.number().int().positive().describe("Quantity to refund"),
        restock_type: z
          .enum(["NO_RESTOCK", "CANCEL", "RETURN", "LEGACY_RESTOCK"])
          .default("RETURN")
          .describe("How to handle inventory"),
      })
    )
    .optional()
    .describe("Specific line items to refund (omit for full refund calculation)"),
  shipping_refund_amount: z
    .string()
    .optional()
    .describe("Amount to refund for shipping (as string, e.g., '5.00')"),
}).strict();

type CreateRefundInput = z.infer<typeof CreateRefundInputSchema>;

// ============================================
// REGISTER TOOLS
// ============================================

export function registerRefundTools(server: McpServer): void {
  // GET REFUNDS
  server.registerTool(
    "shopify_get_refunds",
    {
      title: "Get Order Refunds",
      description: `Get all refunds for a specific order.

This tool shows refund history including amounts, refunded items, and notes.

Args:
  - order_id (string, required): Order ID to check refunds for
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  List of refunds with: amount, date, note, refunded line items

Examples:
  - "Show refunds for order 123" -> order_id: "123"
  - "Check if order was refunded" -> order_id: "123"`,
      inputSchema: GetRefundsInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: GetRefundsInput) => {
      try {
        const orderId = toGid("Order", params.order_id);
        const data = await executeGraphQL<OrderRefundsResponse>(ORDER_REFUND_QUERY, { orderId });

        if (!data.order) {
          return {
            content: [{ type: "text", text: `Error: Order not found with ID '${params.order_id}'.` }],
            isError: true,
          };
        }

        const refunds = data.order.refunds || [];

        const output = {
          order_id: extractNumericId(data.order.id),
          order_name: data.order.name,
          total_refunds: refunds.length,
          refunds: refunds.map((refund) => {
            const lineItems = refund.refundLineItems.edges.map((e) => e.node);
            return {
              id: extractNumericId(refund.id),
              created_at: refund.createdAt,
              note: refund.note,
              total_refunded: refund.totalRefundedSet?.shopMoney,
              line_items: lineItems.map((item) => ({
                line_item_id: extractNumericId(item.lineItem.id),
                title: item.lineItem.title,
                quantity: item.quantity,
                subtotal: item.subtotalSet?.shopMoney,
              })),
            };
          }),
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          const lines: string[] = [
            `# Refunds for Order ${data.order.name}`,
            "",
          ];

          if (refunds.length === 0) {
            lines.push("No refunds have been issued for this order.");
          } else {
            let totalRefunded = 0;
            let currency = "USD";

            for (const refund of refunds) {
              const amount = refund.totalRefundedSet?.shopMoney;
              if (amount) {
                totalRefunded += parseFloat(amount.amount);
                currency = amount.currencyCode;
              }

              lines.push(
                `## Refund ${extractNumericId(refund.id)}`,
                `- **Amount**: ${amount ? formatMoney(amount.amount, amount.currencyCode) : "N/A"}`,
                `- **Date**: ${formatDate(refund.createdAt)}`
              );

              if (refund.note) {
                lines.push(`- **Note**: ${refund.note}`);
              }

              const lineItems = refund.refundLineItems.edges.map((e) => e.node);
              if (lineItems.length > 0) {
                lines.push("", "**Refunded Items:**");
                for (const item of lineItems) {
                  const itemAmount = item.subtotalSet?.shopMoney;
                  lines.push(
                    `- ${item.lineItem.title} x ${item.quantity}` +
                      (itemAmount ? ` (${formatMoney(itemAmount.amount, itemAmount.currencyCode)})` : "")
                  );
                }
              }
              lines.push("");
            }

            lines.push(
              "---",
              `**Total Refunded**: ${formatMoney(totalRefunded.toString(), currency)}`
            );
          }

          textContent = lines.join("\n");
        } else {
          textContent = JSON.stringify(output, null, 2);
        }

        return {
          content: [{ type: "text", text: textContent }],
          structuredContent: output,
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: handleApiError(error) }],
          isError: true,
        };
      }
    }
  );

  // CREATE REFUND
  server.registerTool(
    "shopify_create_refund",
    {
      title: "Create Refund",
      description: `Create a refund for an order.

This tool processes a refund, optionally restocking inventory and notifying the customer.

Args:
  - order_id (string, required): Order ID to refund
  - note (string, optional): Internal note about the refund
  - notify_customer (boolean): Send notification email (default: true)
  - refund_line_items (array, optional): Specific items to refund
    - line_item_id: Line item ID
    - quantity: Quantity to refund
    - restock_type: 'NO_RESTOCK', 'CANCEL', 'RETURN', 'LEGACY_RESTOCK'
  - shipping_refund_amount (string, optional): Amount to refund for shipping

IMPORTANT: This creates an actual refund. Use shopify_get_order first to review line items.

Returns:
  Created refund with total amount

Examples:
  - "Full refund for order 123" -> order_id: "123"
  - "Refund 2 units of item 456" ->
    order_id: "123", refund_line_items: [{line_item_id: "456", quantity: 2, restock_type: "RETURN"}]
  - "Refund with shipping" -> order_id: "123", shipping_refund_amount: "10.00"`,
      inputSchema: CreateRefundInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params: CreateRefundInput) => {
      try {
        const orderId = toGid("Order", params.order_id);

        const input: Record<string, unknown> = {
          orderId,
          notify: params.notify_customer,
        };

        if (params.note) {
          input.note = params.note;
        }

        if (params.refund_line_items && params.refund_line_items.length > 0) {
          input.refundLineItems = params.refund_line_items.map((item) => ({
            lineItemId: toGid("LineItem", item.line_item_id),
            quantity: item.quantity,
            restockType: item.restock_type,
          }));
        }

        if (params.shipping_refund_amount) {
          input.shipping = {
            fullRefund: false,
            amount: params.shipping_refund_amount,
          };
        }

        const data = await executeGraphQL<{
          refundCreate: {
            refund: {
              id: string;
              createdAt: string;
              totalRefundedSet: {
                shopMoney: {
                  amount: string;
                  currencyCode: string;
                };
              };
            } | null;
            userErrors: Array<{ field: string[]; message: string }>;
          };
        }>(REFUND_CREATE_MUTATION, { input });

        if (data.refundCreate.userErrors?.length > 0) {
          const errors = data.refundCreate.userErrors.map((e) => e.message).join("; ");
          return {
            content: [{ type: "text", text: `Error creating refund: ${errors}` }],
            isError: true,
          };
        }

        const refund = data.refundCreate.refund;
        if (!refund) {
          return {
            content: [{ type: "text", text: "Error: Refund creation returned no data." }],
            isError: true,
          };
        }

        const amount = refund.totalRefundedSet?.shopMoney;
        const output = {
          success: true,
          refund: {
            id: extractNumericId(refund.id),
            created_at: refund.createdAt,
            total_refunded: amount,
          },
          order_id: params.order_id,
          notify_customer: params.notify_customer,
        };

        return {
          content: [
            {
              type: "text",
              text: `Refund created successfully!\n\n- **Refund ID**: ${extractNumericId(refund.id)}\n- **Amount**: ${amount ? formatMoney(amount.amount, amount.currencyCode) : "N/A"}\n- **Customer Notified**: ${params.notify_customer ? "Yes" : "No"}\n- **Created**: ${formatDate(refund.createdAt)}`,
            },
          ],
          structuredContent: output,
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: handleApiError(error) }],
          isError: true,
        };
      }
    }
  );
}
