/**
 * Draft order management tools
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
import {
  DRAFT_ORDERS_QUERY,
  DRAFT_ORDER_DETAIL_QUERY,
  DRAFT_ORDER_CREATE_MUTATION,
  DRAFT_ORDER_COMPLETE_MUTATION,
  DRAFT_ORDER_DELETE_MUTATION,
} from "../services/queries.js";
import { ResponseFormat, CHARACTER_LIMIT } from "../constants.js";
import { ResponseFormatSchema, PaginationSchema, ShopifyIdSchema } from "../schemas/common.js";
import { PageInfo, Address } from "../types.js";

// ============================================
// TYPES
// ============================================

interface DraftOrderLineItem {
  id: string;
  title: string;
  quantity: number;
  originalUnitPriceSet: {
    shopMoney: {
      amount: string;
      currencyCode: string;
    };
  };
}

interface DraftOrder {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  invoiceUrl?: string;
  customer: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
  } | null;
  totalPriceSet: {
    shopMoney: {
      amount: string;
      currencyCode: string;
    };
  };
  subtotalPriceSet: {
    shopMoney: {
      amount: string;
      currencyCode: string;
    };
  };
  totalTaxSet: {
    shopMoney: {
      amount: string;
      currencyCode: string;
    };
  };
  totalShippingPriceSet?: {
    shopMoney: {
      amount: string;
      currencyCode: string;
    };
  };
  lineItems: {
    edges: Array<{ node: DraftOrderLineItem }>;
  };
  shippingAddress?: Address;
  billingAddress?: Address;
  note2?: string;
  tags: string[];
}

interface DraftOrdersResponse {
  draftOrders: {
    edges: Array<{ node: DraftOrder; cursor: string }>;
    pageInfo: PageInfo;
  };
}

interface DraftOrderDetailResponse {
  draftOrder: DraftOrder | null;
}

// ============================================
// SCHEMAS
// ============================================

const ListDraftOrdersInputSchema = z
  .object({
    query: z
      .string()
      .optional()
      .describe("Search query: 'status:open', 'status:invoice_sent', 'status:completed'"),
    response_format: ResponseFormatSchema,
  })
  .merge(PaginationSchema)
  .strict();

type ListDraftOrdersInput = z.infer<typeof ListDraftOrdersInputSchema>;

const GetDraftOrderInputSchema = z.object({
  id: ShopifyIdSchema.describe("Draft order ID"),
  response_format: ResponseFormatSchema,
}).strict();

type GetDraftOrderInput = z.infer<typeof GetDraftOrderInputSchema>;

const CreateDraftOrderInputSchema = z.object({
  customer_id: ShopifyIdSchema.optional().describe("Customer ID to associate (optional)"),
  email: z.string().email().optional().describe("Customer email if no customer_id"),
  line_items: z
    .array(
      z.object({
        variant_id: ShopifyIdSchema.optional().describe("Product variant ID"),
        title: z.string().optional().describe("Custom line item title (if no variant)"),
        quantity: z.number().int().positive().describe("Quantity"),
        price: z.string().optional().describe("Custom price (if no variant or override)"),
      })
    )
    .min(1)
    .describe("Line items for the draft order"),
  shipping_address: z
    .object({
      first_name: z.string(),
      last_name: z.string(),
      address1: z.string(),
      address2: z.string().optional(),
      city: z.string(),
      province: z.string().optional(),
      country: z.string(),
      zip: z.string(),
      phone: z.string().optional(),
    })
    .optional()
    .describe("Shipping address"),
  note: z.string().optional().describe("Internal note"),
  tags: z.array(z.string()).optional().describe("Tags for the draft order"),
  use_customer_default_address: z
    .boolean()
    .default(false)
    .describe("Use customer's default address"),
}).strict();

type CreateDraftOrderInput = z.infer<typeof CreateDraftOrderInputSchema>;

const CompleteDraftOrderInputSchema = z.object({
  id: ShopifyIdSchema.describe("Draft order ID to complete/convert to order"),
}).strict();

type CompleteDraftOrderInput = z.infer<typeof CompleteDraftOrderInputSchema>;

const DeleteDraftOrderInputSchema = z.object({
  id: ShopifyIdSchema.describe("Draft order ID to delete"),
}).strict();

type DeleteDraftOrderInput = z.infer<typeof DeleteDraftOrderInputSchema>;

// ============================================
// HELPER FUNCTIONS
// ============================================

function formatDraftOrderSummary(order: DraftOrder): string {
  const total = order.totalPriceSet?.shopMoney;
  const customer = order.customer;
  const customerName = customer
    ? `${customer.firstName || ""} ${customer.lastName || ""}`.trim() || customer.email
    : "No customer";

  return [
    `## Draft ${order.name}`,
    `- **Status**: ${order.status}`,
    `- **Customer**: ${customerName}`,
    `- **Total**: ${total ? formatMoney(total.amount, total.currencyCode) : "N/A"}`,
    `- **Items**: ${order.lineItems.edges.length}`,
    `- **Created**: ${formatDate(order.createdAt)}`,
    order.tags?.length ? `- **Tags**: ${order.tags.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

// ============================================
// REGISTER TOOLS
// ============================================

export function registerDraftOrderTools(server: McpServer): void {
  // LIST DRAFT ORDERS
  server.registerTool(
    "shopify_list_draft_orders",
    {
      title: "List Draft Orders",
      description: `List draft orders (quotes/invoices) in the Shopify store.

Draft orders are orders created by the merchant that haven't been paid yet. They can be sent to customers as invoices.

Args:
  - query (string, optional): Filter by status ('status:open', 'status:invoice_sent', 'status:completed')
  - first (number): Results to return (1-100, default: 20)
  - after (string, optional): Pagination cursor
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  List of draft orders with: name, status, customer, total, line items count

Examples:
  - "Show all draft orders" -> no filters
  - "Find open draft orders" -> query: "status:open"
  - "Draft orders waiting for payment" -> query: "status:invoice_sent"`,
      inputSchema: ListDraftOrdersInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: ListDraftOrdersInput) => {
      try {
        const variables = {
          first: params.first,
          after: params.after || null,
          query: params.query || null,
        };

        const data = await executeGraphQL<DraftOrdersResponse>(DRAFT_ORDERS_QUERY, variables);
        const orders = data.draftOrders.edges.map((e) => e.node);
        const pageInfo = data.draftOrders.pageInfo;

        if (orders.length === 0) {
          return {
            content: [{ type: "text", text: "No draft orders found matching your criteria." }],
          };
        }

        const output = {
          total_returned: orders.length,
          draft_orders: orders.map((order) => ({
            id: extractNumericId(order.id),
            gid: order.id,
            name: order.name,
            status: order.status,
            customer: order.customer
              ? {
                  id: extractNumericId(order.customer.id),
                  name: `${order.customer.firstName || ""} ${order.customer.lastName || ""}`.trim(),
                  email: order.customer.email,
                }
              : null,
            total: order.totalPriceSet?.shopMoney,
            line_items_count: order.lineItems.edges.length,
            created_at: order.createdAt,
            updated_at: order.updatedAt,
            tags: order.tags,
          })),
          pagination: {
            has_next_page: pageInfo.hasNextPage,
            end_cursor: pageInfo.endCursor,
          },
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          const lines = [
            `# Draft Orders (${orders.length} results)`,
            "",
            ...orders.map((order) => formatDraftOrderSummary(order)),
            "",
            "---",
            pageInfo.hasNextPage
              ? `*More draft orders available. Use after: "${pageInfo.endCursor}" to get the next page.*`
              : "*No more draft orders available.*",
          ];
          textContent = lines.join("\n");

          if (textContent.length > CHARACTER_LIMIT) {
            textContent =
              textContent.slice(0, CHARACTER_LIMIT - 100) +
              "\n\n---\n*Response truncated. Use pagination to see more results.*";
          }
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

  // GET DRAFT ORDER
  server.registerTool(
    "shopify_get_draft_order",
    {
      title: "Get Draft Order Details",
      description: `Get full details for a specific draft order.

Args:
  - id (string, required): Draft order ID
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  Complete draft order details including line items, addresses, and invoice URL

Examples:
  - "Show draft order D123" -> id: "123"`,
      inputSchema: GetDraftOrderInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: GetDraftOrderInput) => {
      try {
        const draftOrderId = toGid("DraftOrder", params.id);
        const data = await executeGraphQL<DraftOrderDetailResponse>(DRAFT_ORDER_DETAIL_QUERY, {
          id: draftOrderId,
        });

        if (!data.draftOrder) {
          return {
            content: [{ type: "text", text: `Error: Draft order not found with ID '${params.id}'.` }],
            isError: true,
          };
        }

        const order = data.draftOrder;
        const lineItems = order.lineItems.edges.map((e) => e.node);

        const output = {
          id: extractNumericId(order.id),
          gid: order.id,
          name: order.name,
          status: order.status,
          invoice_url: order.invoiceUrl,
          customer: order.customer
            ? {
                id: extractNumericId(order.customer.id),
                name: `${order.customer.firstName || ""} ${order.customer.lastName || ""}`.trim(),
                email: order.customer.email,
                phone: order.customer.phone,
              }
            : null,
          pricing: {
            subtotal: order.subtotalPriceSet?.shopMoney,
            shipping: order.totalShippingPriceSet?.shopMoney,
            tax: order.totalTaxSet?.shopMoney,
            total: order.totalPriceSet?.shopMoney,
          },
          line_items: lineItems.map((item) => ({
            id: extractNumericId(item.id),
            title: item.title,
            quantity: item.quantity,
            unit_price: item.originalUnitPriceSet?.shopMoney,
          })),
          shipping_address: order.shippingAddress,
          billing_address: order.billingAddress,
          note: order.note2,
          tags: order.tags,
          created_at: order.createdAt,
          updated_at: order.updatedAt,
          completed_at: order.completedAt,
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          const total = order.totalPriceSet?.shopMoney;
          const lines: string[] = [
            `# Draft Order ${order.name}`,
            "",
            `- **Status**: ${order.status}`,
            `- **Created**: ${formatDate(order.createdAt)}`,
          ];

          if (order.invoiceUrl) {
            lines.push(`- **Invoice URL**: ${order.invoiceUrl}`);
          }

          if (order.customer) {
            lines.push(
              "",
              "## Customer",
              `- ${order.customer.firstName} ${order.customer.lastName}`,
              `- ${order.customer.email}`
            );
            if (order.customer.phone) {
              lines.push(`- ${order.customer.phone}`);
            }
          }

          lines.push(
            "",
            "## Pricing",
            `- **Total**: ${total ? formatMoney(total.amount, total.currencyCode) : "N/A"}`,
            "",
            "## Line Items",
            ""
          );

          for (const item of lineItems) {
            const price = item.originalUnitPriceSet?.shopMoney;
            lines.push(
              `- **${item.title}** x ${item.quantity}`,
              `  - Unit Price: ${price ? formatMoney(price.amount, price.currencyCode) : "N/A"}`
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

  // CREATE DRAFT ORDER
  server.registerTool(
    "shopify_create_draft_order",
    {
      title: "Create Draft Order",
      description: `Create a new draft order (quote/invoice).

Draft orders can be sent to customers as invoices or converted directly to orders.

Args:
  - customer_id (string, optional): Existing customer ID
  - email (string, optional): Customer email if no customer_id
  - line_items (array, required): Items for the order
    - variant_id: Product variant ID (optional if using custom item)
    - title: Custom item title (required if no variant_id)
    - quantity: Number of items
    - price: Custom price (optional)
  - shipping_address (object, optional): Shipping address
  - note (string, optional): Internal note
  - tags (string[], optional): Tags
  - use_customer_default_address (boolean): Use customer's saved address

Returns:
  Created draft order with invoice URL

Examples:
  - "Create draft for customer 123 with variant 456" ->
    customer_id: "123", line_items: [{variant_id: "456", quantity: 1}]
  - "Create custom quote" ->
    email: "customer@example.com", line_items: [{title: "Custom Service", quantity: 1, price: "500.00"}]`,
      inputSchema: CreateDraftOrderInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params: CreateDraftOrderInput) => {
      try {
        const input: Record<string, unknown> = {
          useCustomerDefaultAddress: params.use_customer_default_address,
        };

        if (params.customer_id) {
          input.customerId = toGid("Customer", params.customer_id);
        }
        if (params.email) {
          input.email = params.email;
        }
        if (params.note) {
          input.note = params.note;
        }
        if (params.tags) {
          input.tags = params.tags;
        }

        // Build line items
        input.lineItems = params.line_items.map((item) => {
          const lineItem: Record<string, unknown> = {
            quantity: item.quantity,
          };
          if (item.variant_id) {
            lineItem.variantId = toGid("ProductVariant", item.variant_id);
          }
          if (item.title) {
            lineItem.title = item.title;
          }
          if (item.price) {
            lineItem.originalUnitPrice = item.price;
          }
          return lineItem;
        });

        // Build shipping address
        if (params.shipping_address) {
          input.shippingAddress = {
            firstName: params.shipping_address.first_name,
            lastName: params.shipping_address.last_name,
            address1: params.shipping_address.address1,
            address2: params.shipping_address.address2,
            city: params.shipping_address.city,
            province: params.shipping_address.province,
            country: params.shipping_address.country,
            zip: params.shipping_address.zip,
            phone: params.shipping_address.phone,
          };
        }

        const data = await executeGraphQL<{
          draftOrderCreate: {
            draftOrder: {
              id: string;
              name: string;
              status: string;
              invoiceUrl: string;
              totalPriceSet: {
                shopMoney: { amount: string; currencyCode: string };
              };
            } | null;
            userErrors: Array<{ field: string[]; message: string }>;
          };
        }>(DRAFT_ORDER_CREATE_MUTATION, { input });

        if (data.draftOrderCreate.userErrors?.length > 0) {
          const errors = data.draftOrderCreate.userErrors.map((e) => e.message).join("; ");
          return {
            content: [{ type: "text", text: `Error creating draft order: ${errors}` }],
            isError: true,
          };
        }

        const draftOrder = data.draftOrderCreate.draftOrder;
        if (!draftOrder) {
          return {
            content: [{ type: "text", text: "Error: Draft order creation returned no data." }],
            isError: true,
          };
        }

        const total = draftOrder.totalPriceSet?.shopMoney;
        const output = {
          success: true,
          draft_order: {
            id: extractNumericId(draftOrder.id),
            gid: draftOrder.id,
            name: draftOrder.name,
            status: draftOrder.status,
            invoice_url: draftOrder.invoiceUrl,
            total: total,
          },
        };

        return {
          content: [
            {
              type: "text",
              text: `Draft order created successfully!\n\n- **Name**: ${draftOrder.name}\n- **Status**: ${draftOrder.status}\n- **Total**: ${total ? formatMoney(total.amount, total.currencyCode) : "N/A"}\n- **Invoice URL**: ${draftOrder.invoiceUrl}`,
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

  // COMPLETE DRAFT ORDER
  server.registerTool(
    "shopify_complete_draft_order",
    {
      title: "Complete Draft Order",
      description: `Convert a draft order into a real order.

This marks the draft as completed and creates an actual order in the system.

Args:
  - id (string, required): Draft order ID to complete

Returns:
  The created order information

Examples:
  - "Convert draft D123 to a real order" -> id: "123"`,
      inputSchema: CompleteDraftOrderInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params: CompleteDraftOrderInput) => {
      try {
        const draftOrderId = toGid("DraftOrder", params.id);

        const data = await executeGraphQL<{
          draftOrderComplete: {
            draftOrder: {
              id: string;
              status: string;
              order: {
                id: string;
                name: string;
              } | null;
            } | null;
            userErrors: Array<{ field: string[]; message: string }>;
          };
        }>(DRAFT_ORDER_COMPLETE_MUTATION, { id: draftOrderId });

        if (data.draftOrderComplete.userErrors?.length > 0) {
          const errors = data.draftOrderComplete.userErrors.map((e) => e.message).join("; ");
          return {
            content: [{ type: "text", text: `Error completing draft order: ${errors}` }],
            isError: true,
          };
        }

        const draftOrder = data.draftOrderComplete.draftOrder;
        const order = draftOrder?.order;

        const output = {
          success: true,
          draft_order_id: params.id,
          draft_status: draftOrder?.status,
          order: order
            ? {
                id: extractNumericId(order.id),
                name: order.name,
              }
            : null,
        };

        let textContent = `Draft order completed successfully!`;
        if (order) {
          textContent += `\n\n- **New Order**: ${order.name}\n- **Order ID**: ${extractNumericId(order.id)}`;
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

  // DELETE DRAFT ORDER
  server.registerTool(
    "shopify_delete_draft_order",
    {
      title: "Delete Draft Order",
      description: `Delete a draft order.

This permanently removes the draft order. This action cannot be undone.

Args:
  - id (string, required): Draft order ID to delete

Returns:
  Confirmation of deletion

Examples:
  - "Delete draft order D123" -> id: "123"`,
      inputSchema: DeleteDraftOrderInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params: DeleteDraftOrderInput) => {
      try {
        const draftOrderId = toGid("DraftOrder", params.id);

        const data = await executeGraphQL<{
          draftOrderDelete: {
            deletedId: string | null;
            userErrors: Array<{ field: string[]; message: string }>;
          };
        }>(DRAFT_ORDER_DELETE_MUTATION, { input: { id: draftOrderId } });

        if (data.draftOrderDelete.userErrors?.length > 0) {
          const errors = data.draftOrderDelete.userErrors.map((e) => e.message).join("; ");
          return {
            content: [{ type: "text", text: `Error deleting draft order: ${errors}` }],
            isError: true,
          };
        }

        const output = {
          success: true,
          deleted_id: params.id,
        };

        return {
          content: [{ type: "text", text: `Draft order ${params.id} deleted successfully.` }],
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
