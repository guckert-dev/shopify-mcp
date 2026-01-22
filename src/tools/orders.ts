/**
 * Order management tools
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
  ORDERS_QUERY,
  ORDER_DETAIL_QUERY,
  ORDER_CANCEL_MUTATION,
} from "../services/queries.js";
import { ResponseFormat, CHARACTER_LIMIT } from "../constants.js";
import {
  ResponseFormatSchema,
  PaginationSchema,
  ShopifyIdSchema,
} from "../schemas/common.js";
import { Order, Connection, PageInfo } from "../types.js";

// ============================================
// LIST ORDERS
// ============================================

const ListOrdersInputSchema = z
  .object({
    query: z
      .string()
      .optional()
      .describe(
        "Search query to filter orders. Supports Shopify search syntax: 'status:open', 'fulfillment_status:unfulfilled', 'financial_status:paid', 'created_at:>2024-01-01', 'email:customer@example.com', 'name:#1234'"
      ),
    financial_status: z
      .enum(["pending", "authorized", "partially_paid", "paid", "partially_refunded", "refunded", "voided"])
      .optional()
      .describe("Filter by financial status"),
    fulfillment_status: z
      .enum(["unfulfilled", "partial", "fulfilled", "restocked"])
      .optional()
      .describe("Filter by fulfillment status"),
    response_format: ResponseFormatSchema,
  })
  .merge(PaginationSchema)
  .strict();

type ListOrdersInput = z.infer<typeof ListOrdersInputSchema>;

interface OrdersResponse {
  orders: Connection<Order> & { pageInfo: PageInfo };
}

// ============================================
// GET ORDER
// ============================================

const GetOrderInputSchema = z.object({
  id: ShopifyIdSchema.describe("Order ID (numeric or GID format)"),
  response_format: ResponseFormatSchema,
}).strict();

type GetOrderInput = z.infer<typeof GetOrderInputSchema>;

interface OrderDetailResponse {
  order: Order | null;
}

// ============================================
// CANCEL ORDER
// ============================================

const CancelOrderInputSchema = z.object({
  id: ShopifyIdSchema.describe("Order ID to cancel"),
  reason: z
    .enum(["CUSTOMER", "FRAUD", "INVENTORY", "DECLINED", "OTHER"])
    .default("OTHER")
    .describe("Reason for cancellation"),
  refund: z
    .boolean()
    .default(false)
    .describe("Whether to refund the order"),
  restock: z
    .boolean()
    .default(true)
    .describe("Whether to restock inventory"),
}).strict();

type CancelOrderInput = z.infer<typeof CancelOrderInputSchema>;

// ============================================
// HELPER FUNCTIONS
// ============================================

function formatOrderSummary(order: Order): string {
  const total = order.totalPriceSet?.shopMoney;
  const customer = order.customer;
  const customerName = customer
    ? `${customer.firstName || ""} ${customer.lastName || ""}`.trim() || customer.email
    : order.email || "Guest";

  return [
    `## Order ${order.name}`,
    `- **Customer**: ${customerName}`,
    `- **Total**: ${total ? formatMoney(total.amount, total.currencyCode) : "N/A"}`,
    `- **Financial Status**: ${order.displayFinancialStatus || "Unknown"}`,
    `- **Fulfillment Status**: ${order.displayFulfillmentStatus || "Unknown"}`,
    `- **Created**: ${formatDate(order.createdAt)}`,
    order.tags?.length ? `- **Tags**: ${order.tags.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function formatOrderDetail(order: Order): string {
  const total = order.totalPriceSet?.shopMoney;
  const subtotal = order.subtotalPriceSet?.shopMoney;
  const shipping = order.totalShippingPriceSet?.shopMoney;
  const tax = order.totalTaxSet?.shopMoney;
  const customer = order.customer;

  const lines: string[] = [
    `# Order ${order.name}`,
    "",
    "## Summary",
    `- **ID**: ${extractNumericId(order.id)}`,
    `- **Email**: ${order.email || "N/A"}`,
    `- **Created**: ${formatDate(order.createdAt)}`,
    `- **Updated**: ${formatDate(order.updatedAt)}`,
    `- **Financial Status**: ${order.displayFinancialStatus || "Unknown"}`,
    `- **Fulfillment Status**: ${order.displayFulfillmentStatus || "Unknown"}`,
    "",
  ];

  // Customer info
  if (customer) {
    lines.push(
      "## Customer",
      `- **Name**: ${customer.firstName || ""} ${customer.lastName || ""}`.trim(),
      `- **Email**: ${customer.email}`,
      `- **ID**: ${extractNumericId(customer.id)}`,
      ""
    );
  }

  // Pricing
  lines.push(
    "## Pricing",
    `- **Subtotal**: ${subtotal ? formatMoney(subtotal.amount, subtotal.currencyCode) : "N/A"}`,
    `- **Shipping**: ${shipping ? formatMoney(shipping.amount, shipping.currencyCode) : "N/A"}`,
    `- **Tax**: ${tax ? formatMoney(tax.amount, tax.currencyCode) : "N/A"}`,
    `- **Total**: ${total ? formatMoney(total.amount, total.currencyCode) : "N/A"}`,
    ""
  );

  // Line items
  const lineItems = order.lineItems?.edges || [];
  if (lineItems.length > 0) {
    lines.push("## Line Items", "");
    for (const { node: item } of lineItems) {
      const price = item.originalUnitPriceSet?.shopMoney;
      lines.push(
        `### ${item.title}`,
        `- **Quantity**: ${item.quantity}`,
        `- **SKU**: ${item.sku || "N/A"}`,
        `- **Unit Price**: ${price ? formatMoney(price.amount, price.currencyCode) : "N/A"}`
      );
      if (item.variant) {
        lines.push(`- **Variant**: ${item.variant.title}`);
      }
      lines.push("");
    }
  }

  // Shipping address
  const shippingAddr = order.shippingAddress;
  if (shippingAddr) {
    lines.push(
      "## Shipping Address",
      `${shippingAddr.firstName} ${shippingAddr.lastName}`,
      shippingAddr.address1
    );
    if (shippingAddr.address2) {
      lines.push(shippingAddr.address2);
    }
    lines.push(
      `${shippingAddr.city}, ${shippingAddr.province} ${shippingAddr.zip}`,
      shippingAddr.country
    );
    if (shippingAddr.phone) {
      lines.push(`Phone: ${shippingAddr.phone}`);
    }
    lines.push("");
  }

  // Fulfillments
  const fulfillments = order.fulfillments || [];
  if (fulfillments.length > 0) {
    lines.push("## Fulfillments", "");
    for (const fulfillment of fulfillments) {
      lines.push(
        `### Fulfillment ${extractNumericId(fulfillment.id)}`,
        `- **Status**: ${fulfillment.status}`,
        `- **Created**: ${formatDate(fulfillment.createdAt)}`
      );
      for (const tracking of fulfillment.trackingInfo || []) {
        lines.push(`- **Tracking**: ${tracking.company} - ${tracking.number}`);
        if (tracking.url) {
          lines.push(`  - URL: ${tracking.url}`);
        }
      }
      lines.push("");
    }
  }

  // Notes and tags
  if (order.note) {
    lines.push("## Notes", order.note, "");
  }
  if (order.tags?.length) {
    lines.push("## Tags", order.tags.join(", "), "");
  }

  return lines.join("\n");
}

// ============================================
// REGISTER TOOLS
// ============================================

export function registerOrderTools(server: McpServer): void {
  // LIST ORDERS
  server.registerTool(
    "shopify_list_orders",
    {
      title: "List Shopify Orders",
      description: `List and search orders from the Shopify store with filtering and pagination.

This tool retrieves orders with various filtering options. Results are sorted by creation date (newest first).

Args:
  - query (string, optional): Shopify search syntax. Examples:
    - 'status:open' - Open orders only
    - 'fulfillment_status:unfulfilled' - Unfulfilled orders
    - 'financial_status:paid' - Paid orders
    - 'created_at:>2024-01-01' - Orders after date
    - 'email:customer@example.com' - By customer email
    - 'name:#1234' - By order number
  - financial_status (string, optional): Filter by payment status
  - fulfillment_status (string, optional): Filter by fulfillment status
  - first (number): Results to return (1-100, default: 20)
  - after (string, optional): Pagination cursor from previous response
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  List of orders with: id, name, customer info, totals, status, dates, tags
  Includes pagination info (hasNextPage, endCursor) for fetching more results

Examples:
  - "Show me recent orders" -> no filters
  - "Find unfulfilled orders" -> fulfillment_status: "unfulfilled"
  - "Orders from john@example.com" -> query: "email:john@example.com"
  - "Paid orders from January" -> query: "financial_status:paid created_at:>2024-01-01 created_at:<2024-02-01"`,
      inputSchema: ListOrdersInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: ListOrdersInput) => {
      try {
        // Build query string from filters
        let queryParts: string[] = [];
        if (params.query) queryParts.push(params.query);
        if (params.financial_status) queryParts.push(`financial_status:${params.financial_status}`);
        if (params.fulfillment_status) queryParts.push(`fulfillment_status:${params.fulfillment_status}`);

        const variables = {
          first: params.first,
          after: params.after || null,
          query: queryParts.length > 0 ? queryParts.join(" ") : null,
        };

        const data = await executeGraphQL<OrdersResponse>(ORDERS_QUERY, variables);
        const orders = data.orders.edges.map((e) => e.node);
        const pageInfo = data.orders.pageInfo;

        if (orders.length === 0) {
          return {
            content: [{ type: "text", text: "No orders found matching your criteria." }],
          };
        }

        const output = {
          total_returned: orders.length,
          orders: orders.map((order) => ({
            id: extractNumericId(order.id),
            gid: order.id,
            name: order.name,
            email: order.email,
            customer: order.customer
              ? {
                  id: extractNumericId(order.customer.id),
                  name: `${order.customer.firstName || ""} ${order.customer.lastName || ""}`.trim(),
                  email: order.customer.email,
                }
              : null,
            financial_status: order.displayFinancialStatus,
            fulfillment_status: order.displayFulfillmentStatus,
            total: order.totalPriceSet?.shopMoney
              ? {
                  amount: order.totalPriceSet.shopMoney.amount,
                  currency: order.totalPriceSet.shopMoney.currencyCode,
                }
              : null,
            created_at: order.createdAt,
            updated_at: order.updatedAt,
            tags: order.tags,
          })),
          pagination: {
            has_next_page: pageInfo.hasNextPage,
            has_previous_page: pageInfo.hasPreviousPage,
            end_cursor: pageInfo.endCursor,
            start_cursor: pageInfo.startCursor,
          },
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          const lines = [
            `# Orders (${orders.length} results)`,
            "",
            ...orders.map((order) => formatOrderSummary(order)),
            "",
            "---",
            pageInfo.hasNextPage
              ? `*More orders available. Use after: "${pageInfo.endCursor}" to get the next page.*`
              : "*No more orders available.*",
          ];
          textContent = lines.join("\n");

          // Truncate if too long
          if (textContent.length > CHARACTER_LIMIT) {
            textContent =
              textContent.slice(0, CHARACTER_LIMIT - 100) +
              "\n\n---\n*Response truncated. Use pagination or add filters to see more specific results.*";
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

  // GET ORDER DETAIL
  server.registerTool(
    "shopify_get_order",
    {
      title: "Get Shopify Order Details",
      description: `Retrieve complete details for a specific order by ID.

This tool returns full order information including line items, customer details, addresses, fulfillments, and pricing breakdown.

Args:
  - id (string): Order ID - can be numeric (e.g., '5678901234') or full GID
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  Complete order details including:
  - Order summary (name, status, dates)
  - Customer information
  - Full pricing breakdown (subtotal, shipping, tax, total)
  - All line items with quantities and prices
  - Shipping and billing addresses
  - Fulfillment history with tracking info
  - Notes and tags

Examples:
  - "Show order details for #1234" -> First use list_orders to find the ID
  - "Get full info for order 5678901234" -> id: "5678901234"`,
      inputSchema: GetOrderInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: GetOrderInput) => {
      try {
        const orderId = toGid("Order", params.id);
        const data = await executeGraphQL<OrderDetailResponse>(ORDER_DETAIL_QUERY, {
          id: orderId,
        });

        if (!data.order) {
          return {
            content: [
              {
                type: "text",
                text: `Error: Order not found. Please check the ID '${params.id}' is correct.`,
              },
            ],
            isError: true,
          };
        }

        const order = data.order;
        const lineItems = order.lineItems?.edges?.map((e) => e.node) || [];

        const output = {
          id: extractNumericId(order.id),
          gid: order.id,
          name: order.name,
          email: order.email,
          created_at: order.createdAt,
          updated_at: order.updatedAt,
          financial_status: order.displayFinancialStatus,
          fulfillment_status: order.displayFulfillmentStatus,
          customer: order.customer
            ? {
                id: extractNumericId(order.customer.id),
                name: `${order.customer.firstName || ""} ${order.customer.lastName || ""}`.trim(),
                email: order.customer.email,
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
            sku: item.sku,
            unit_price: item.originalUnitPriceSet?.shopMoney,
            variant: item.variant
              ? {
                  id: extractNumericId(item.variant.id),
                  title: item.variant.title,
                }
              : null,
          })),
          shipping_address: order.shippingAddress,
          billing_address: order.billingAddress,
          fulfillments: order.fulfillments?.map((f) => ({
            id: extractNumericId(f.id),
            status: f.status,
            created_at: f.createdAt,
            tracking: f.trackingInfo,
          })),
          note: order.note,
          tags: order.tags,
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          textContent = formatOrderDetail(order);
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

  // CANCEL ORDER
  server.registerTool(
    "shopify_cancel_order",
    {
      title: "Cancel Shopify Order",
      description: `Cancel an existing order in the Shopify store.

This is a DESTRUCTIVE operation that will cancel the order. Optionally refund the customer and restock inventory.

Args:
  - id (string): Order ID to cancel
  - reason ('CUSTOMER' | 'FRAUD' | 'INVENTORY' | 'DECLINED' | 'OTHER'): Cancellation reason (default: 'OTHER')
  - refund (boolean): Whether to refund the payment (default: false)
  - restock (boolean): Whether to restock inventory (default: true)

Returns:
  Confirmation of cancellation with job ID

IMPORTANT: This action cannot be undone. The order will be marked as cancelled.

Examples:
  - "Cancel order 123456789 - customer requested" -> id: "123456789", reason: "CUSTOMER"
  - "Cancel fraudulent order and refund" -> reason: "FRAUD", refund: true`,
      inputSchema: CancelOrderInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params: CancelOrderInput) => {
      try {
        const orderId = toGid("Order", params.id);

        const data = await executeGraphQL<{
          orderCancel: {
            job: { id: string; done: boolean } | null;
            userErrors: Array<{ field: string[]; message: string }>;
          };
        }>(ORDER_CANCEL_MUTATION, {
          orderId,
          reason: params.reason,
          refund: params.refund,
          restock: params.restock,
        });

        if (data.orderCancel.userErrors?.length > 0) {
          const errors = data.orderCancel.userErrors.map((e) => e.message).join("; ");
          return {
            content: [{ type: "text", text: `Error cancelling order: ${errors}` }],
            isError: true,
          };
        }

        const output = {
          success: true,
          order_id: params.id,
          reason: params.reason,
          refunded: params.refund,
          restocked: params.restock,
          job_id: data.orderCancel.job?.id,
        };

        return {
          content: [
            {
              type: "text",
              text: `Order ${params.id} has been cancelled.\n- Reason: ${params.reason}\n- Refunded: ${params.refund}\n- Restocked: ${params.restock}`,
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
