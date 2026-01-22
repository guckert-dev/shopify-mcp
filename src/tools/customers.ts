/**
 * Customer management tools
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
import { CUSTOMERS_QUERY, CUSTOMER_DETAIL_QUERY } from "../services/queries.js";
import { ResponseFormat, CHARACTER_LIMIT } from "../constants.js";
import { ResponseFormatSchema, PaginationSchema, ShopifyIdSchema } from "../schemas/common.js";
import { Customer, Connection, PageInfo, Address } from "../types.js";

// ============================================
// LIST CUSTOMERS
// ============================================

const ListCustomersInputSchema = z
  .object({
    query: z
      .string()
      .optional()
      .describe(
        "Search query to filter customers. Supports: 'email:*@example.com', 'first_name:John', 'last_name:Doe', 'phone:+1*', 'orders_count:>5', 'total_spent:>100', 'tag:vip', 'state:enabled'"
      ),
    response_format: ResponseFormatSchema,
  })
  .merge(PaginationSchema)
  .strict();

type ListCustomersInput = z.infer<typeof ListCustomersInputSchema>;

interface CustomersResponse {
  customers: Connection<Customer> & { pageInfo: PageInfo };
}

// ============================================
// GET CUSTOMER
// ============================================

const GetCustomerInputSchema = z.object({
  id: ShopifyIdSchema.describe("Customer ID (numeric or GID format)"),
  response_format: ResponseFormatSchema,
}).strict();

type GetCustomerInput = z.infer<typeof GetCustomerInputSchema>;

interface CustomerDetailResponse {
  customer: (Customer & {
    orders: {
      edges: Array<{
        node: {
          id: string;
          name: string;
          createdAt: string;
          displayFinancialStatus: string;
          displayFulfillmentStatus: string;
          totalPriceSet: {
            shopMoney: {
              amount: string;
              currencyCode: string;
            };
          };
        };
      }>;
    };
  }) | null;
}

// ============================================
// SEARCH CUSTOMERS
// ============================================

const SearchCustomersInputSchema = z.object({
  email: z.string().optional().describe("Search by email (exact or partial with *)"),
  name: z.string().optional().describe("Search by first or last name"),
  phone: z.string().optional().describe("Search by phone number"),
  tag: z.string().optional().describe("Search by customer tag"),
  response_format: ResponseFormatSchema,
}).merge(PaginationSchema).strict();

type SearchCustomersInput = z.infer<typeof SearchCustomersInputSchema>;

// ============================================
// HELPER FUNCTIONS
// ============================================

function formatAddress(address: Address | null): string {
  if (!address) return "No address";

  const parts = [
    `${address.firstName || ""} ${address.lastName || ""}`.trim(),
    address.address1,
    address.address2,
    `${address.city}, ${address.province} ${address.zip}`.trim(),
    address.country,
    address.phone ? `Phone: ${address.phone}` : null,
  ].filter(Boolean);

  return parts.join("\n");
}

function formatCustomerSummary(customer: Customer): string {
  const totalSpent = customer.totalSpentV2;
  const name = `${customer.firstName || ""} ${customer.lastName || ""}`.trim() || "No name";

  return [
    `## ${name}`,
    `- **ID**: ${extractNumericId(customer.id)}`,
    `- **Email**: ${customer.email}${customer.verifiedEmail ? " ✓" : ""}`,
    customer.phone ? `- **Phone**: ${customer.phone}` : null,
    `- **Orders**: ${customer.ordersCount}`,
    `- **Total Spent**: ${totalSpent ? formatMoney(totalSpent.amount, totalSpent.currencyCode) : "N/A"}`,
    `- **State**: ${customer.state}`,
    customer.tags?.length ? `- **Tags**: ${customer.tags.join(", ")}` : null,
    `- **Created**: ${formatDate(customer.createdAt)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function formatCustomerDetail(customer: CustomerDetailResponse["customer"]): string {
  if (!customer) return "Customer not found";

  const name = `${customer.firstName || ""} ${customer.lastName || ""}`.trim() || "No name";
  const totalSpent = customer.totalSpentV2;
  const orders = customer.orders?.edges?.map((e) => e.node) || [];

  const lines = [
    `# Customer: ${name}`,
    "",
    "## Contact Information",
    `- **ID**: ${extractNumericId(customer.id)}`,
    `- **Email**: ${customer.email}${customer.verifiedEmail ? " (verified)" : " (not verified)"}`,
    customer.phone ? `- **Phone**: ${customer.phone}` : "- **Phone**: Not provided",
    `- **State**: ${customer.state}`,
    "",
    "## Purchase History",
    `- **Total Orders**: ${customer.ordersCount}`,
    `- **Total Spent**: ${totalSpent ? formatMoney(totalSpent.amount, totalSpent.currencyCode) : "N/A"}`,
    "",
  ];

  // Tags
  if (customer.tags?.length) {
    lines.push(`**Tags**: ${customer.tags.join(", ")}`, "");
  }

  // Notes
  if (customer.note) {
    lines.push("## Notes", customer.note, "");
  }

  // Default address
  lines.push("## Default Address", formatAddress(customer.defaultAddress), "");

  // Additional addresses
  if (customer.addresses && customer.addresses.length > 1) {
    lines.push("## Additional Addresses", "");
    for (let i = 0; i < customer.addresses.length; i++) {
      const addr = customer.addresses[i];
      if (addr !== customer.defaultAddress) {
        lines.push(`### Address ${i + 1}`, formatAddress(addr), "");
      }
    }
  }

  // Recent orders
  if (orders.length > 0) {
    lines.push("## Recent Orders", "");
    for (const order of orders) {
      const total = order.totalPriceSet?.shopMoney;
      lines.push(
        `### Order ${order.name}`,
        `- **Total**: ${total ? formatMoney(total.amount, total.currencyCode) : "N/A"}`,
        `- **Financial Status**: ${order.displayFinancialStatus}`,
        `- **Fulfillment Status**: ${order.displayFulfillmentStatus}`,
        `- **Date**: ${formatDate(order.createdAt)}`,
        ""
      );
    }
  }

  // Dates
  lines.push(
    "## Account Info",
    `- **Created**: ${formatDate(customer.createdAt)}`,
    `- **Updated**: ${formatDate(customer.updatedAt)}`
  );

  return lines.join("\n");
}

// ============================================
// REGISTER TOOLS
// ============================================

export function registerCustomerTools(server: McpServer): void {
  // LIST CUSTOMERS
  server.registerTool(
    "shopify_list_customers",
    {
      title: "List Shopify Customers",
      description: `List and search customers from the Shopify store with filtering and pagination.

This tool retrieves customers with various filtering options. Results are sorted by update date (newest first).

Args:
  - query (string, optional): Shopify search syntax. Examples:
    - 'email:*@example.com' - Customers with email domain
    - 'first_name:John' - By first name
    - 'last_name:Doe' - By last name
    - 'phone:+1*' - By phone prefix
    - 'orders_count:>5' - Customers with more than 5 orders
    - 'total_spent:>100' - High-value customers
    - 'tag:vip' - Customers with specific tag
    - 'state:enabled' - Active customers only
  - first (number): Results to return (1-100, default: 20)
  - after (string, optional): Pagination cursor
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  List of customers with: id, name, email, phone, orders count, total spent, state, tags
  Includes pagination info for fetching more results

Examples:
  - "Show me all customers" -> no filters
  - "Find VIP customers" -> query: "tag:vip"
  - "High-spending customers" -> query: "total_spent:>1000"
  - "Customers with 10+ orders" -> query: "orders_count:>=10"`,
      inputSchema: ListCustomersInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: ListCustomersInput) => {
      try {
        const variables = {
          first: params.first,
          after: params.after || null,
          query: params.query || null,
        };

        const data = await executeGraphQL<CustomersResponse>(CUSTOMERS_QUERY, variables);
        const customers = data.customers.edges.map((e) => e.node);
        const pageInfo = data.customers.pageInfo;

        if (customers.length === 0) {
          return {
            content: [{ type: "text", text: "No customers found matching your criteria." }],
          };
        }

        const output = {
          total_returned: customers.length,
          customers: customers.map((customer) => ({
            id: extractNumericId(customer.id),
            gid: customer.id,
            first_name: customer.firstName,
            last_name: customer.lastName,
            email: customer.email,
            email_verified: customer.verifiedEmail,
            phone: customer.phone,
            orders_count: customer.ordersCount,
            total_spent: customer.totalSpentV2
              ? {
                  amount: customer.totalSpentV2.amount,
                  currency: customer.totalSpentV2.currencyCode,
                }
              : null,
            state: customer.state,
            tags: customer.tags,
            note: customer.note,
            created_at: customer.createdAt,
            updated_at: customer.updatedAt,
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
            `# Customers (${customers.length} results)`,
            "",
            ...customers.map((customer) => formatCustomerSummary(customer)),
            "",
            "---",
            pageInfo.hasNextPage
              ? `*More customers available. Use after: "${pageInfo.endCursor}" to get the next page.*`
              : "*No more customers available.*",
          ];
          textContent = lines.join("\n");

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

  // GET CUSTOMER DETAIL
  server.registerTool(
    "shopify_get_customer",
    {
      title: "Get Shopify Customer Details",
      description: `Retrieve complete details for a specific customer by ID.

This tool returns full customer information including addresses, order history, and account details.

Args:
  - id (string): Customer ID (numeric or GID format)
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  Complete customer details including:
  - Contact information (name, email, phone)
  - Purchase history (order count, total spent)
  - All addresses (default and additional)
  - Recent orders (last 10)
  - Tags and notes
  - Account status and dates

Examples:
  - "Show customer details for ID 1234567890" -> id: "1234567890"
  - "Get full info for john@example.com" -> First search by email, then get by ID`,
      inputSchema: GetCustomerInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: GetCustomerInput) => {
      try {
        const customerId = toGid("Customer", params.id);
        const data = await executeGraphQL<CustomerDetailResponse>(CUSTOMER_DETAIL_QUERY, {
          id: customerId,
        });

        if (!data.customer) {
          return {
            content: [
              {
                type: "text",
                text: `Error: Customer not found. Please check the ID '${params.id}' is correct.`,
              },
            ],
            isError: true,
          };
        }

        const customer = data.customer;
        const orders = customer.orders?.edges?.map((e) => e.node) || [];

        const output = {
          id: extractNumericId(customer.id),
          gid: customer.id,
          first_name: customer.firstName,
          last_name: customer.lastName,
          email: customer.email,
          email_verified: customer.verifiedEmail,
          phone: customer.phone,
          orders_count: customer.ordersCount,
          total_spent: customer.totalSpentV2
            ? {
                amount: customer.totalSpentV2.amount,
                currency: customer.totalSpentV2.currencyCode,
              }
            : null,
          state: customer.state,
          tags: customer.tags,
          note: customer.note,
          default_address: customer.defaultAddress,
          addresses: customer.addresses,
          recent_orders: orders.map((order) => ({
            id: extractNumericId(order.id),
            name: order.name,
            total: order.totalPriceSet?.shopMoney,
            financial_status: order.displayFinancialStatus,
            fulfillment_status: order.displayFulfillmentStatus,
            created_at: order.createdAt,
          })),
          created_at: customer.createdAt,
          updated_at: customer.updatedAt,
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          textContent = formatCustomerDetail(customer);
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

  // SEARCH CUSTOMERS (convenience method)
  server.registerTool(
    "shopify_search_customers",
    {
      title: "Search Shopify Customers",
      description: `Search for customers by common fields like email, name, or phone.

This is a convenience tool that builds the search query for you. For advanced searches, use shopify_list_customers with the query parameter.

Args:
  - email (string, optional): Search by email (use * for wildcards, e.g., '*@company.com')
  - name (string, optional): Search by first or last name
  - phone (string, optional): Search by phone number
  - tag (string, optional): Search by customer tag
  - first (number): Results to return (1-100, default: 20)
  - after (string, optional): Pagination cursor
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

At least one search parameter (email, name, phone, or tag) must be provided.

Returns:
  List of matching customers

Examples:
  - "Find customer by email" -> email: "john@example.com"
  - "Search for customers named Smith" -> name: "Smith"
  - "Find all Gmail customers" -> email: "*@gmail.com"`,
      inputSchema: SearchCustomersInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: SearchCustomersInput) => {
      try {
        // Build query from provided parameters
        const queryParts: string[] = [];

        if (params.email) {
          queryParts.push(`email:${params.email}`);
        }
        if (params.name) {
          // Search both first and last name
          queryParts.push(`(first_name:${params.name} OR last_name:${params.name})`);
        }
        if (params.phone) {
          queryParts.push(`phone:${params.phone}`);
        }
        if (params.tag) {
          queryParts.push(`tag:${params.tag}`);
        }

        if (queryParts.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "Error: At least one search parameter (email, name, phone, or tag) must be provided.",
              },
            ],
            isError: true,
          };
        }

        const variables = {
          first: params.first,
          after: params.after || null,
          query: queryParts.join(" "),
        };

        const data = await executeGraphQL<CustomersResponse>(CUSTOMERS_QUERY, variables);
        const customers = data.customers.edges.map((e) => e.node);
        const pageInfo = data.customers.pageInfo;

        if (customers.length === 0) {
          return {
            content: [{ type: "text", text: "No customers found matching your search criteria." }],
          };
        }

        const output = {
          search_query: queryParts.join(" "),
          total_returned: customers.length,
          customers: customers.map((customer) => ({
            id: extractNumericId(customer.id),
            gid: customer.id,
            first_name: customer.firstName,
            last_name: customer.lastName,
            email: customer.email,
            phone: customer.phone,
            orders_count: customer.ordersCount,
            total_spent: customer.totalSpentV2,
            state: customer.state,
            tags: customer.tags,
          })),
          pagination: {
            has_next_page: pageInfo.hasNextPage,
            end_cursor: pageInfo.endCursor,
          },
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          const lines = [
            `# Customer Search Results (${customers.length} found)`,
            `*Query: ${queryParts.join(" ")}*`,
            "",
            ...customers.map((customer) => formatCustomerSummary(customer)),
            "",
            "---",
            pageInfo.hasNextPage
              ? `*More results available. Use after: "${pageInfo.endCursor}" to get the next page.*`
              : "*No more results.*",
          ];
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
}
