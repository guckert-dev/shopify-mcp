/**
 * Discount code management tools
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
  DISCOUNT_CODES_QUERY,
  DISCOUNT_CODE_BASIC_CREATE_MUTATION,
  DISCOUNT_CODE_DEACTIVATE_MUTATION,
} from "../services/queries.js";
import { ResponseFormat, CHARACTER_LIMIT } from "../constants.js";
import { ResponseFormatSchema, PaginationSchema, ShopifyIdSchema } from "../schemas/common.js";
import { PageInfo } from "../types.js";

// ============================================
// TYPES
// ============================================

interface DiscountCode {
  code: string;
  usageCount: number;
}

interface DiscountCodeBasic {
  title: string;
  status: string;
  startsAt: string;
  endsAt: string | null;
  usageLimit: number | null;
  asyncUsageCount: number;
  codes: { edges: Array<{ node: DiscountCode }> };
  customerGets?: {
    value: {
      percentage?: number;
      amount?: { amount: string; currencyCode: string };
    };
  };
  minimumRequirement?: {
    greaterThanOrEqualToSubtotal?: { amount: string; currencyCode: string };
    greaterThanOrEqualToQuantity?: number;
  };
}

interface DiscountCodeNode {
  id: string;
  codeDiscount: DiscountCodeBasic;
}

interface DiscountCodesResponse {
  codeDiscountNodes: {
    edges: Array<{ node: DiscountCodeNode; cursor: string }>;
    pageInfo: PageInfo;
  };
}

// ============================================
// SCHEMAS
// ============================================

const ListDiscountsInputSchema = z
  .object({
    query: z
      .string()
      .optional()
      .describe("Search query to filter discounts by title or code"),
    status: z
      .enum(["ACTIVE", "EXPIRED", "SCHEDULED"])
      .optional()
      .describe("Filter by discount status"),
    response_format: ResponseFormatSchema,
  })
  .merge(PaginationSchema)
  .strict();

type ListDiscountsInput = z.infer<typeof ListDiscountsInputSchema>;

const CreateDiscountInputSchema = z.object({
  title: z.string().min(1).max(255).describe("Internal title for the discount"),
  code: z.string().min(1).max(20).describe("Discount code customers will enter (e.g., 'SAVE20')"),
  discount_type: z
    .enum(["percentage", "fixed_amount"])
    .describe("Type of discount"),
  discount_value: z
    .number()
    .positive()
    .describe("Discount value: percentage (0-100) or fixed amount in store currency"),
  starts_at: z
    .string()
    .optional()
    .describe("Start date (ISO 8601). Defaults to now if not provided."),
  ends_at: z
    .string()
    .optional()
    .describe("End date (ISO 8601). Leave empty for no expiration."),
  usage_limit: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Maximum total uses. Leave empty for unlimited."),
  once_per_customer: z
    .boolean()
    .default(false)
    .describe("Limit to one use per customer"),
  minimum_subtotal: z
    .number()
    .positive()
    .optional()
    .describe("Minimum order subtotal required"),
  minimum_quantity: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Minimum quantity of items required"),
}).strict();

type CreateDiscountInput = z.infer<typeof CreateDiscountInputSchema>;

const DeactivateDiscountInputSchema = z.object({
  id: ShopifyIdSchema.describe("Discount ID to deactivate"),
}).strict();

type DeactivateDiscountInput = z.infer<typeof DeactivateDiscountInputSchema>;

// ============================================
// HELPER FUNCTIONS
// ============================================

function formatDiscountValue(discount: DiscountCodeBasic): string {
  if (discount.customerGets?.value?.percentage) {
    return `${discount.customerGets.value.percentage * 100}% off`;
  }
  if (discount.customerGets?.value?.amount) {
    return `${formatMoney(discount.customerGets.value.amount.amount, discount.customerGets.value.amount.currencyCode)} off`;
  }
  return "Unknown discount";
}

function formatDiscountSummary(node: DiscountCodeNode): string {
  const discount = node.codeDiscount;
  const codes = discount.codes?.edges?.map((e) => e.node) || [];
  const primaryCode = codes[0]?.code || "N/A";

  const lines = [
    `## ${discount.title}`,
    `- **Code**: \`${primaryCode}\``,
    `- **Status**: ${discount.status}`,
    `- **Value**: ${formatDiscountValue(discount)}`,
    `- **Uses**: ${discount.asyncUsageCount}${discount.usageLimit ? ` / ${discount.usageLimit}` : " (unlimited)"}`,
    `- **Starts**: ${formatDate(discount.startsAt)}`,
  ];

  if (discount.endsAt) {
    lines.push(`- **Ends**: ${formatDate(discount.endsAt)}`);
  }

  if (discount.minimumRequirement?.greaterThanOrEqualToSubtotal) {
    lines.push(
      `- **Minimum**: ${formatMoney(
        discount.minimumRequirement.greaterThanOrEqualToSubtotal.amount,
        discount.minimumRequirement.greaterThanOrEqualToSubtotal.currencyCode
      )}`
    );
  }

  return lines.join("\n");
}

// ============================================
// REGISTER TOOLS
// ============================================

export function registerDiscountTools(server: McpServer): void {
  // LIST DISCOUNTS
  server.registerTool(
    "shopify_list_discounts",
    {
      title: "List Discount Codes",
      description: `List and search discount codes in the Shopify store.

This tool retrieves discount codes with their details, usage statistics, and requirements.

Args:
  - query (string, optional): Search by title or code
  - status ('ACTIVE' | 'EXPIRED' | 'SCHEDULED', optional): Filter by status
  - first (number): Results to return (1-100, default: 20)
  - after (string, optional): Pagination cursor
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  List of discounts with: code, title, status, value, usage count, dates, requirements

Examples:
  - "Show all active discounts" -> status: "ACTIVE"
  - "Find discounts with 'SUMMER'" -> query: "SUMMER"
  - "List expired discounts" -> status: "EXPIRED"`,
      inputSchema: ListDiscountsInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: ListDiscountsInput) => {
      try {
        let queryParts: string[] = [];
        if (params.query) queryParts.push(params.query);
        if (params.status) queryParts.push(`status:${params.status}`);

        const variables = {
          first: params.first,
          after: params.after || null,
          query: queryParts.length > 0 ? queryParts.join(" ") : null,
        };

        const data = await executeGraphQL<DiscountCodesResponse>(DISCOUNT_CODES_QUERY, variables);
        const discounts = data.codeDiscountNodes.edges.map((e) => e.node);
        const pageInfo = data.codeDiscountNodes.pageInfo;

        if (discounts.length === 0) {
          return {
            content: [{ type: "text", text: "No discount codes found matching your criteria." }],
          };
        }

        const output = {
          total_returned: discounts.length,
          discounts: discounts.map((node) => {
            const discount = node.codeDiscount;
            const codes = discount.codes?.edges?.map((e) => e.node) || [];
            return {
              id: extractNumericId(node.id),
              gid: node.id,
              title: discount.title,
              code: codes[0]?.code,
              status: discount.status,
              starts_at: discount.startsAt,
              ends_at: discount.endsAt,
              usage_count: discount.asyncUsageCount,
              usage_limit: discount.usageLimit,
              value: discount.customerGets?.value,
              minimum_requirement: discount.minimumRequirement,
            };
          }),
          pagination: {
            has_next_page: pageInfo.hasNextPage,
            end_cursor: pageInfo.endCursor,
          },
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          const lines = [
            `# Discount Codes (${discounts.length} results)`,
            "",
            ...discounts.map((node) => formatDiscountSummary(node)),
            "",
            "---",
            pageInfo.hasNextPage
              ? `*More discounts available. Use after: "${pageInfo.endCursor}" to get the next page.*`
              : "*No more discounts available.*",
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

  // CREATE DISCOUNT
  server.registerTool(
    "shopify_create_discount",
    {
      title: "Create Discount Code",
      description: `Create a new discount code in the Shopify store.

This tool creates percentage or fixed-amount discount codes with optional requirements.

Args:
  - title (string, required): Internal name for the discount
  - code (string, required): Code customers enter (e.g., 'SAVE20', 'WELCOME10')
  - discount_type ('percentage' | 'fixed_amount'): Type of discount
  - discount_value (number, required): Amount - percentage (1-100) or fixed amount
  - starts_at (string, optional): Start date in ISO 8601 format
  - ends_at (string, optional): End date (leave empty for no expiration)
  - usage_limit (number, optional): Max total uses
  - once_per_customer (boolean): One use per customer (default: false)
  - minimum_subtotal (number, optional): Minimum order amount
  - minimum_quantity (number, optional): Minimum items required

Returns:
  Created discount with code and ID

Examples:
  - "20% off discount" -> code: "SAVE20", discount_type: "percentage", discount_value: 20
  - "$10 off orders over $50" -> code: "TEN", discount_type: "fixed_amount", discount_value: 10, minimum_subtotal: 50
  - "Limited 100 uses" -> usage_limit: 100, once_per_customer: true`,
      inputSchema: CreateDiscountInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params: CreateDiscountInput) => {
      try {
        const basicCodeDiscount: Record<string, unknown> = {
          title: params.title,
          code: params.code,
          startsAt: params.starts_at || new Date().toISOString(),
          combinesWith: {
            orderDiscounts: false,
            productDiscounts: false,
            shippingDiscounts: true,
          },
          customerSelection: {
            all: true,
          },
          appliesOncePerCustomer: params.once_per_customer,
        };

        // Set discount value
        if (params.discount_type === "percentage") {
          basicCodeDiscount.customerGets = {
            value: {
              percentage: params.discount_value / 100,
            },
            items: {
              all: true,
            },
          };
        } else {
          basicCodeDiscount.customerGets = {
            value: {
              discountAmount: {
                amount: params.discount_value.toString(),
                appliesOnEachItem: false,
              },
            },
            items: {
              all: true,
            },
          };
        }

        // Set dates
        if (params.ends_at) {
          basicCodeDiscount.endsAt = params.ends_at;
        }

        // Set usage limit
        if (params.usage_limit) {
          basicCodeDiscount.usageLimit = params.usage_limit;
        }

        // Set minimum requirement
        if (params.minimum_subtotal) {
          basicCodeDiscount.minimumRequirement = {
            subtotal: {
              greaterThanOrEqualToSubtotal: params.minimum_subtotal.toString(),
            },
          };
        } else if (params.minimum_quantity) {
          basicCodeDiscount.minimumRequirement = {
            quantity: {
              greaterThanOrEqualToQuantity: params.minimum_quantity.toString(),
            },
          };
        }

        const data = await executeGraphQL<{
          discountCodeBasicCreate: {
            codeDiscountNode: {
              id: string;
              codeDiscount: {
                title: string;
                status: string;
                codes: { edges: Array<{ node: { code: string } }> };
              };
            } | null;
            userErrors: Array<{ field: string[]; message: string }>;
          };
        }>(DISCOUNT_CODE_BASIC_CREATE_MUTATION, { basicCodeDiscount });

        if (data.discountCodeBasicCreate.userErrors?.length > 0) {
          const errors = data.discountCodeBasicCreate.userErrors.map((e) => e.message).join("; ");
          return {
            content: [{ type: "text", text: `Error creating discount: ${errors}` }],
            isError: true,
          };
        }

        const discount = data.discountCodeBasicCreate.codeDiscountNode;
        if (!discount) {
          return {
            content: [{ type: "text", text: "Error: Discount creation returned no data." }],
            isError: true,
          };
        }

        const createdCode = discount.codeDiscount.codes.edges[0]?.node.code;

        const output = {
          success: true,
          discount: {
            id: extractNumericId(discount.id),
            gid: discount.id,
            title: discount.codeDiscount.title,
            code: createdCode,
            status: discount.codeDiscount.status,
          },
        };

        return {
          content: [
            {
              type: "text",
              text: `Discount code created successfully!\n\n- **Title**: ${discount.codeDiscount.title}\n- **Code**: \`${createdCode}\`\n- **Status**: ${discount.codeDiscount.status}\n- **ID**: ${extractNumericId(discount.id)}`,
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

  // DEACTIVATE DISCOUNT
  server.registerTool(
    "shopify_deactivate_discount",
    {
      title: "Deactivate Discount Code",
      description: `Deactivate an existing discount code.

This tool disables a discount code so it can no longer be used by customers.

Args:
  - id (string, required): Discount ID to deactivate

Returns:
  Confirmation of deactivation

Examples:
  - "Disable discount 123" -> id: "123"
  - "Turn off the SUMMER20 discount" -> First list discounts to find ID, then deactivate`,
      inputSchema: DeactivateDiscountInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: DeactivateDiscountInput) => {
      try {
        const discountId = toGid("DiscountCodeNode", params.id);

        const data = await executeGraphQL<{
          discountCodeDeactivate: {
            codeDiscountNode: {
              id: string;
              codeDiscount: {
                title: string;
                status: string;
              };
            } | null;
            userErrors: Array<{ field: string[]; message: string }>;
          };
        }>(DISCOUNT_CODE_DEACTIVATE_MUTATION, { id: discountId });

        if (data.discountCodeDeactivate.userErrors?.length > 0) {
          const errors = data.discountCodeDeactivate.userErrors.map((e) => e.message).join("; ");
          return {
            content: [{ type: "text", text: `Error deactivating discount: ${errors}` }],
            isError: true,
          };
        }

        const discount = data.discountCodeDeactivate.codeDiscountNode;

        const output = {
          success: true,
          discount_id: params.id,
          title: discount?.codeDiscount?.title,
          status: discount?.codeDiscount?.status || "EXPIRED",
        };

        return {
          content: [
            {
              type: "text",
              text: `Discount deactivated successfully!\n\n- **Title**: ${discount?.codeDiscount?.title || "Unknown"}\n- **New Status**: ${discount?.codeDiscount?.status || "EXPIRED"}`,
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
