/**
 * Fulfillment management tools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  executeGraphQL,
  handleApiError,
  formatDate,
  toGid,
  extractNumericId,
} from "../services/shopify-client.js";
import {
  FULFILLMENT_ORDERS_QUERY,
  FULFILLMENT_CREATE_MUTATION,
  FULFILLMENT_TRACKING_UPDATE_MUTATION,
} from "../services/queries.js";
import { ResponseFormat } from "../constants.js";
import { ResponseFormatSchema, ShopifyIdSchema } from "../schemas/common.js";

// ============================================
// SCHEMAS
// ============================================

const GetFulfillmentOrdersInputSchema = z.object({
  order_id: ShopifyIdSchema.describe("Order ID to get fulfillment orders for"),
  response_format: ResponseFormatSchema,
}).strict();

type GetFulfillmentOrdersInput = z.infer<typeof GetFulfillmentOrdersInputSchema>;

const CreateFulfillmentInputSchema = z.object({
  order_id: ShopifyIdSchema.describe("Order ID to fulfill"),
  location_id: ShopifyIdSchema.describe("Location ID fulfilling the order (get from shopify_list_locations)"),
  tracking_number: z.string().optional().describe("Shipping tracking number"),
  tracking_url: z.string().url().optional().describe("URL to track shipment"),
  tracking_company: z.string().optional().describe("Shipping carrier name (e.g., 'UPS', 'FedEx', 'USPS')"),
  notify_customer: z.boolean().default(true).describe("Send notification email to customer"),
  line_items: z
    .array(
      z.object({
        id: ShopifyIdSchema.describe("Fulfillment order line item ID"),
        quantity: z.number().int().positive().describe("Quantity to fulfill"),
      })
    )
    .optional()
    .describe("Specific line items to fulfill (omit to fulfill all)"),
}).strict();

type CreateFulfillmentInput = z.infer<typeof CreateFulfillmentInputSchema>;

const UpdateTrackingInputSchema = z.object({
  fulfillment_id: ShopifyIdSchema.describe("Fulfillment ID to update"),
  tracking_number: z.string().optional().describe("New tracking number"),
  tracking_url: z.string().url().optional().describe("New tracking URL"),
  tracking_company: z.string().optional().describe("Shipping carrier name"),
  notify_customer: z.boolean().default(false).describe("Send notification to customer about tracking update"),
}).strict();

type UpdateTrackingInput = z.infer<typeof UpdateTrackingInputSchema>;

// ============================================
// TYPES
// ============================================

interface FulfillmentOrderLineItem {
  id: string;
  totalQuantity: number;
  remainingQuantity: number;
  lineItem: {
    title: string;
    sku: string | null;
  };
}

interface FulfillmentOrder {
  id: string;
  status: string;
  requestStatus: string;
  assignedLocation: {
    location: {
      id: string;
      name: string;
    };
  } | null;
  lineItems: {
    edges: Array<{ node: FulfillmentOrderLineItem }>;
  };
}

interface FulfillmentOrdersResponse {
  order: {
    id: string;
    name: string;
    fulfillmentOrders: {
      edges: Array<{ node: FulfillmentOrder }>;
    };
  } | null;
}

// ============================================
// REGISTER TOOLS
// ============================================

export function registerFulfillmentTools(server: McpServer): void {
  // GET FULFILLMENT ORDERS
  server.registerTool(
    "shopify_get_fulfillment_orders",
    {
      title: "Get Fulfillment Orders for Order",
      description: `Get fulfillment orders and unfulfilled items for a specific order.

This tool shows what items need to be fulfilled and from which locations. Use this before creating a fulfillment to get the correct fulfillment order line item IDs.

Args:
  - order_id (string, required): Order ID to check
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  List of fulfillment orders with:
  - Fulfillment order ID and status
  - Assigned location
  - Line items with quantities (total and remaining)

Examples:
  - "What needs to be fulfilled for order 123?" -> order_id: "123"
  - "Check fulfillment status for order #1234" -> First get order ID, then use this tool`,
      inputSchema: GetFulfillmentOrdersInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: GetFulfillmentOrdersInput) => {
      try {
        const orderId = toGid("Order", params.order_id);
        const data = await executeGraphQL<FulfillmentOrdersResponse>(FULFILLMENT_ORDERS_QUERY, {
          orderId,
        });

        if (!data.order) {
          return {
            content: [{ type: "text", text: `Error: Order not found with ID '${params.order_id}'.` }],
            isError: true,
          };
        }

        const fulfillmentOrders = data.order.fulfillmentOrders.edges.map((e) => e.node);

        const output = {
          order_id: extractNumericId(data.order.id),
          order_name: data.order.name,
          fulfillment_orders: fulfillmentOrders.map((fo) => ({
            id: extractNumericId(fo.id),
            gid: fo.id,
            status: fo.status,
            request_status: fo.requestStatus,
            location: fo.assignedLocation?.location
              ? {
                  id: extractNumericId(fo.assignedLocation.location.id),
                  name: fo.assignedLocation.location.name,
                }
              : null,
            line_items: fo.lineItems.edges.map((e) => ({
              id: extractNumericId(e.node.id),
              gid: e.node.id,
              title: e.node.lineItem.title,
              sku: e.node.lineItem.sku,
              total_quantity: e.node.totalQuantity,
              remaining_quantity: e.node.remainingQuantity,
            })),
          })),
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          const lines: string[] = [
            `# Fulfillment Orders for ${data.order.name}`,
            "",
          ];

          if (fulfillmentOrders.length === 0) {
            lines.push("No fulfillment orders found.");
          } else {
            for (const fo of fulfillmentOrders) {
              lines.push(
                `## Fulfillment Order ${extractNumericId(fo.id)}`,
                `- **Status**: ${fo.status}`,
                `- **Request Status**: ${fo.requestStatus}`
              );
              if (fo.assignedLocation?.location) {
                lines.push(`- **Location**: ${fo.assignedLocation.location.name}`);
              }
              lines.push("", "### Items to Fulfill", "");

              for (const { node: item } of fo.lineItems.edges) {
                lines.push(
                  `- **${item.lineItem.title}** (SKU: ${item.lineItem.sku || "N/A"})`,
                  `  - Total: ${item.totalQuantity}, Remaining: ${item.remainingQuantity}`,
                  `  - Line Item ID: ${extractNumericId(item.id)}`
                );
              }
              lines.push("");
            }
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

  // CREATE FULFILLMENT
  server.registerTool(
    "shopify_create_fulfillment",
    {
      title: "Create Fulfillment",
      description: `Create a fulfillment for an order to mark items as shipped.

This tool marks order items as fulfilled and optionally adds tracking information. Use shopify_get_fulfillment_orders first to get the correct line item IDs.

Args:
  - order_id (string, required): Order ID to fulfill
  - location_id (string, required): Location fulfilling the order
  - tracking_number (string, optional): Shipping tracking number
  - tracking_url (string, optional): URL for tracking
  - tracking_company (string, optional): Carrier name (UPS, FedEx, USPS, etc.)
  - notify_customer (boolean): Send shipping notification (default: true)
  - line_items (array, optional): Specific items to fulfill
    - id: Fulfillment order line item ID
    - quantity: Quantity to fulfill

Returns:
  Created fulfillment with ID, status, and tracking info

Examples:
  - "Ship order 123 with USPS tracking 9400111..." ->
    order_id: "123", tracking_number: "9400111...", tracking_company: "USPS"
  - "Mark order as shipped from warehouse 1" ->
    order_id: "123", location_id: "456"`,
      inputSchema: CreateFulfillmentInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params: CreateFulfillmentInput) => {
      try {
        // First get fulfillment orders to get the proper structure
        const orderId = toGid("Order", params.order_id);
        const foData = await executeGraphQL<FulfillmentOrdersResponse>(FULFILLMENT_ORDERS_QUERY, {
          orderId,
        });

        if (!foData.order) {
          return {
            content: [{ type: "text", text: `Error: Order not found with ID '${params.order_id}'.` }],
            isError: true,
          };
        }

        const fulfillmentOrders = foData.order.fulfillmentOrders.edges.map((e) => e.node);
        const locationId = toGid("Location", params.location_id);

        // Find fulfillment order for this location
        const targetFO = fulfillmentOrders.find(
          (fo) => fo.assignedLocation?.location?.id === locationId || !fo.assignedLocation
        );

        if (!targetFO) {
          return {
            content: [
              {
                type: "text",
                text: `Error: No fulfillment order found for location '${params.location_id}'. Available fulfillment orders may be assigned to different locations.`,
              },
            ],
            isError: true,
          };
        }

        // Build fulfillment input
        const fulfillmentInput: Record<string, unknown> = {
          notifyCustomer: params.notify_customer,
          lineItemsByFulfillmentOrder: [
            {
              fulfillmentOrderId: targetFO.id,
              fulfillmentOrderLineItems: params.line_items
                ? params.line_items.map((li) => ({
                    id: toGid("FulfillmentOrderLineItem", li.id),
                    quantity: li.quantity,
                  }))
                : targetFO.lineItems.edges.map((e) => ({
                    id: e.node.id,
                    quantity: e.node.remainingQuantity,
                  })),
            },
          ],
        };

        // Add tracking info if provided
        if (params.tracking_number || params.tracking_url || params.tracking_company) {
          fulfillmentInput.trackingInfo = {
            number: params.tracking_number,
            url: params.tracking_url,
            company: params.tracking_company,
          };
        }

        const data = await executeGraphQL<{
          fulfillmentCreateV2: {
            fulfillment: {
              id: string;
              status: string;
              createdAt: string;
              trackingInfo: Array<{ number: string; url: string; company: string }>;
            } | null;
            userErrors: Array<{ field: string[]; message: string }>;
          };
        }>(FULFILLMENT_CREATE_MUTATION, { fulfillment: fulfillmentInput });

        if (data.fulfillmentCreateV2.userErrors?.length > 0) {
          const errors = data.fulfillmentCreateV2.userErrors.map((e) => e.message).join("; ");
          return {
            content: [{ type: "text", text: `Error creating fulfillment: ${errors}` }],
            isError: true,
          };
        }

        const fulfillment = data.fulfillmentCreateV2.fulfillment;
        if (!fulfillment) {
          return {
            content: [{ type: "text", text: "Error: Fulfillment creation returned no data." }],
            isError: true,
          };
        }

        const output = {
          success: true,
          fulfillment: {
            id: extractNumericId(fulfillment.id),
            gid: fulfillment.id,
            status: fulfillment.status,
            created_at: fulfillment.createdAt,
            tracking: fulfillment.trackingInfo,
          },
        };

        const trackingInfo = fulfillment.trackingInfo?.[0];
        let textContent = `Fulfillment created successfully!\n\n- **ID**: ${extractNumericId(fulfillment.id)}\n- **Status**: ${fulfillment.status}\n- **Created**: ${formatDate(fulfillment.createdAt)}`;

        if (trackingInfo) {
          textContent += `\n- **Tracking**: ${trackingInfo.company || "Unknown"} - ${trackingInfo.number}`;
          if (trackingInfo.url) {
            textContent += `\n- **Tracking URL**: ${trackingInfo.url}`;
          }
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

  // UPDATE TRACKING
  server.registerTool(
    "shopify_update_tracking",
    {
      title: "Update Fulfillment Tracking",
      description: `Update tracking information for an existing fulfillment.

Use this to add or modify tracking numbers and URLs after a fulfillment has been created.

Args:
  - fulfillment_id (string, required): Fulfillment ID to update
  - tracking_number (string, optional): New tracking number
  - tracking_url (string, optional): New tracking URL
  - tracking_company (string, optional): Carrier name
  - notify_customer (boolean): Send update notification (default: false)

Returns:
  Updated fulfillment with new tracking info

Examples:
  - "Add tracking number to fulfillment 789" ->
    fulfillment_id: "789", tracking_number: "1Z999...", tracking_company: "UPS"
  - "Update tracking URL and notify customer" ->
    fulfillment_id: "789", tracking_url: "https://...", notify_customer: true`,
      inputSchema: UpdateTrackingInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: UpdateTrackingInput) => {
      try {
        const fulfillmentId = toGid("Fulfillment", params.fulfillment_id);

        const trackingInfoInput: Record<string, unknown> = {
          notifyCustomer: params.notify_customer,
        };

        if (params.tracking_number) trackingInfoInput.number = params.tracking_number;
        if (params.tracking_url) trackingInfoInput.url = params.tracking_url;
        if (params.tracking_company) trackingInfoInput.company = params.tracking_company;

        const data = await executeGraphQL<{
          fulfillmentTrackingInfoUpdateV2: {
            fulfillment: {
              id: string;
              status: string;
              trackingInfo: Array<{ number: string; url: string; company: string }>;
            } | null;
            userErrors: Array<{ field: string[]; message: string }>;
          };
        }>(FULFILLMENT_TRACKING_UPDATE_MUTATION, {
          fulfillmentId,
          trackingInfoInput,
        });

        if (data.fulfillmentTrackingInfoUpdateV2.userErrors?.length > 0) {
          const errors = data.fulfillmentTrackingInfoUpdateV2.userErrors.map((e) => e.message).join("; ");
          return {
            content: [{ type: "text", text: `Error updating tracking: ${errors}` }],
            isError: true,
          };
        }

        const fulfillment = data.fulfillmentTrackingInfoUpdateV2.fulfillment;
        if (!fulfillment) {
          return {
            content: [{ type: "text", text: "Error: Tracking update returned no data." }],
            isError: true,
          };
        }

        const trackingInfo = fulfillment.trackingInfo?.[0];
        const output = {
          success: true,
          fulfillment_id: extractNumericId(fulfillment.id),
          status: fulfillment.status,
          tracking: trackingInfo || null,
        };

        let textContent = `Tracking updated successfully!\n\n- **Fulfillment ID**: ${extractNumericId(fulfillment.id)}`;
        if (trackingInfo) {
          textContent += `\n- **Carrier**: ${trackingInfo.company || "Unknown"}`;
          textContent += `\n- **Tracking Number**: ${trackingInfo.number || "N/A"}`;
          if (trackingInfo.url) {
            textContent += `\n- **Tracking URL**: ${trackingInfo.url}`;
          }
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
}
