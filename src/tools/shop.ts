/**
 * Shop information tools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { executeGraphQL, handleApiError, formatDate } from "../services/shopify-client.js";
import { SHOP_INFO_QUERY } from "../services/queries.js";
import { ResponseFormat } from "../constants.js";
import { ResponseFormatSchema } from "../schemas/common.js";
import { ShopInfo } from "../types.js";

// Input schema
const GetShopInfoInputSchema = z.object({
  response_format: ResponseFormatSchema,
}).strict();

type GetShopInfoInput = z.infer<typeof GetShopInfoInputSchema>;

// Response type
interface ShopInfoResponse {
  shop: ShopInfo;
}

export function registerShopTools(server: McpServer): void {
  server.registerTool(
    "shopify_get_shop_info",
    {
      title: "Get Shopify Shop Information",
      description: `Retrieve basic information about the connected Shopify store.

This tool returns store details including name, email, domain, currency, plan, and billing address. Use this to verify connectivity and understand the store context.

Args:
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  For JSON format:
  {
    "id": string,           // Shop GID
    "name": string,         // Store name
    "email": string,        // Store email
    "domain": string,       // Primary domain
    "myshopifyDomain": string,  // Myshopify domain
    "currencyCode": string, // Currency code (e.g., "USD")
    "plan": string,         // Shopify plan name
    "location": string,     // Store location
    "createdAt": string,    // Store creation date
    "updatedAt": string     // Last update date
  }

Examples:
  - Use when: "What store am I connected to?"
  - Use when: "Show me shop details"
  - Use when: Verifying the connection is working

Error Handling:
  - Returns authentication error if token is invalid
  - Returns connection error if shop domain is incorrect`,
      inputSchema: GetShopInfoInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: GetShopInfoInput) => {
      try {
        const data = await executeGraphQL<ShopInfoResponse>(SHOP_INFO_QUERY);
        const shop = data.shop;

        const output = {
          id: shop.id,
          name: shop.name,
          email: shop.email,
          domain: shop.primaryDomain?.host || shop.myshopifyDomain,
          myshopifyDomain: shop.myshopifyDomain,
          currencyCode: shop.currencyCode,
          plan: shop.plan?.displayName || "Unknown",
          location: shop.billingAddress
            ? `${shop.billingAddress.city}, ${shop.billingAddress.country}`
            : "Not set",
          createdAt: shop.createdAt,
          updatedAt: shop.updatedAt,
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          textContent = [
            `# Shop Information: ${shop.name}`,
            "",
            `**Domain**: ${output.domain}`,
            `**Myshopify Domain**: ${shop.myshopifyDomain}`,
            `**Email**: ${shop.email}`,
            `**Currency**: ${shop.currencyCode}`,
            `**Plan**: ${output.plan}`,
            `**Location**: ${output.location}`,
            "",
            `*Created*: ${formatDate(shop.createdAt)}`,
            `*Last Updated*: ${formatDate(shop.updatedAt)}`,
          ].join("\n");
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
