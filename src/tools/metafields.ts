/**
 * Metafields tools for Shopify MCP Server
 * Includes: reading and writing custom metafields on products, orders, customers
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  executeGraphQL,
  extractNumericId,
  toGid,
} from "../services/shopify-client.js";
import {
  METAFIELDS_QUERY,
  METAFIELD_SET_MUTATION,
} from "../services/queries.js";
import { ResponseFormatSchema, ShopifyIdSchema } from "../schemas/common.js";
import { ResponseFormat } from "../constants.js";

// Resource type enum
const ResourceTypeSchema = z.enum(["Product", "Customer", "Order", "Variant", "Collection"]);
type ResourceType = z.infer<typeof ResourceTypeSchema>;

// Metafield type enum
const MetafieldTypeSchema = z.enum([
  "single_line_text_field",
  "multi_line_text_field",
  "number_integer",
  "number_decimal",
  "boolean",
  "date",
  "date_time",
  "json",
  "url",
  "money",
  "rating",
  "color",
]);

export function registerMetafieldTools(server: McpServer): void {
  // ============================================
  // GET METAFIELDS
  // ============================================

  server.registerTool(
    "shopify_get_metafields",
    {
      description:
        "Get metafields (custom data) for a product, customer, order, variant, or collection. Metafields store additional information not captured by standard fields.",
      inputSchema: z.object({
        resource_type: ResourceTypeSchema.describe("Type of resource to get metafields from"),
        resource_id: ShopifyIdSchema.describe("Resource ID"),
        namespace: z.string().optional().describe("Optional: Filter by namespace"),
        format: ResponseFormatSchema,
      }),
    },
    async (args) => {
      const { resource_type, resource_id, namespace, format } = args;
      const resourceId = toGid(resource_type, resource_id);

      const data = await executeGraphQL<any>(METAFIELDS_QUERY, {
        ownerId: resourceId,
      });

      let metafields = data.node?.metafields?.edges || [];

      // Filter by namespace if provided
      if (namespace) {
        metafields = metafields.filter(
          (edge: any) => edge.node.namespace === namespace
        );
      }

      const output = {
        resourceType: resource_type,
        resourceId: extractNumericId(resourceId),
        metafields: metafields.map((edge: any) => ({
          id: extractNumericId(edge.node.id),
          namespace: edge.node.namespace,
          key: edge.node.key,
          value: edge.node.value,
          type: edge.node.type,
        })),
      };

      let textContent: string;
      if (format === "markdown") {
        const lines = [
          `# Metafields for ${resource_type}`,
          `**Resource ID**: ${output.resourceId}`,
          `**Metafields Found**: ${output.metafields.length}`,
          "",
        ];

        if (output.metafields.length === 0) {
          lines.push("*No metafields found for this resource.*");
        } else {
          // Group by namespace
          const byNamespace: Record<string, typeof output.metafields> = {};
          for (const mf of output.metafields) {
            if (!byNamespace[mf.namespace]) {
              byNamespace[mf.namespace] = [];
            }
            byNamespace[mf.namespace].push(mf);
          }

          for (const [ns, mfs] of Object.entries(byNamespace)) {
            lines.push(`## Namespace: ${ns}`, "");
            for (const mf of mfs) {
              lines.push(
                `### ${mf.key}`,
                `- **ID**: ${mf.id}`,
                `- **Type**: ${mf.type}`,
                `- **Value**: ${mf.value.length > 200 ? mf.value.substring(0, 200) + "..." : mf.value}`,
                ""
              );
            }
          }
        }

        textContent = lines.join("\n");
      } else {
        textContent = JSON.stringify(output, null, 2);
      }

      return {
        content: [{ type: "text" as const, text: textContent }],
      };
    }
  );

  // ============================================
  // SET METAFIELDS
  // ============================================

  server.registerTool(
    "shopify_set_metafield",
    {
      description:
        "Create or update a metafield on a product, customer, order, variant, or collection. Use for storing custom data like warranty info, supplier codes, internal notes, etc.",
      inputSchema: z.object({
        resource_type: ResourceTypeSchema.describe("Type of resource to set metafield on"),
        resource_id: ShopifyIdSchema.describe("Resource ID"),
        namespace: z.string().describe("Metafield namespace (e.g., 'custom', 'my_app')"),
        key: z.string().describe("Metafield key (e.g., 'warranty_months', 'supplier_code')"),
        value: z.string().describe("Metafield value"),
        type: MetafieldTypeSchema.default("single_line_text_field").describe("Metafield type"),
        format: ResponseFormatSchema,
      }),
    },
    async (args) => {
      const { resource_type, resource_id, namespace, key, value, type, format } = args;
      const resourceId = toGid(resource_type, resource_id);

      const data = await executeGraphQL<any>(METAFIELD_SET_MUTATION, {
        metafields: [
          {
            ownerId: resourceId,
            namespace,
            key,
            value,
            type,
          },
        ],
      });

      const result = data.metafieldsSet;
      const errors = result?.userErrors || [];

      if (errors.length > 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error setting metafield:\n${errors
                .map((e: any) => `- ${e.field}: ${e.message}`)
                .join("\n")}`,
            },
          ],
        };
      }

      const metafields = result?.metafields || [];
      const metafield = metafields[0];

      const output = {
        success: true,
        metafield: metafield
          ? {
              id: extractNumericId(metafield.id),
              namespace: metafield.namespace,
              key: metafield.key,
              value: metafield.value,
              type: metafield.type,
            }
          : null,
      };

      let textContent: string;
      if (format === "markdown") {
        if (output.metafield) {
          textContent = [
            `# Metafield Set Successfully`,
            "",
            `**Namespace**: ${output.metafield.namespace}`,
            `**Key**: ${output.metafield.key}`,
            `**Value**: ${output.metafield.value}`,
            `**Type**: ${output.metafield.type}`,
            `**ID**: ${output.metafield.id}`,
          ].join("\n");
        } else {
          textContent = "Metafield operation completed but no data returned.";
        }
      } else {
        textContent = JSON.stringify(output, null, 2);
      }

      return {
        content: [{ type: "text" as const, text: textContent }],
      };
    }
  );

  // ============================================
  // SET MULTIPLE METAFIELDS
  // ============================================

  server.registerTool(
    "shopify_set_metafields_bulk",
    {
      description:
        "Create or update multiple metafields at once. Efficient for batch operations.",
      inputSchema: z.object({
        metafields: z.array(z.object({
          resource_type: ResourceTypeSchema,
          resource_id: z.string(),
          namespace: z.string(),
          key: z.string(),
          value: z.string(),
          type: MetafieldTypeSchema.optional(),
        })).describe("Array of metafields to set"),
        format: ResponseFormatSchema,
      }),
    },
    async (args) => {
      const { metafields: metafieldsInput, format } = args;

      const metafields = metafieldsInput.map((mf) => ({
        ownerId: toGid(mf.resource_type, mf.resource_id),
        namespace: mf.namespace,
        key: mf.key,
        value: mf.value,
        type: mf.type || "single_line_text_field",
      }));

      const data = await executeGraphQL<any>(METAFIELD_SET_MUTATION, {
        metafields,
      });

      const result = data.metafieldsSet;
      const errors = result?.userErrors || [];

      if (errors.length > 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error setting metafields:\n${errors
                .map((e: any) => `- ${e.field}: ${e.message}`)
                .join("\n")}`,
            },
          ],
        };
      }

      const createdMetafields = result?.metafields || [];

      const output = {
        success: true,
        count: createdMetafields.length,
        metafields: createdMetafields.map((mf: any) => ({
          id: extractNumericId(mf.id),
          namespace: mf.namespace,
          key: mf.key,
          value: mf.value,
          type: mf.type,
        })),
      };

      let textContent: string;
      if (format === "markdown") {
        const lines = [
          `# Metafields Set Successfully`,
          "",
          `**Total Set**: ${output.count}`,
          "",
        ];

        for (const mf of output.metafields) {
          lines.push(
            `- **${mf.namespace}.${mf.key}** = ${mf.value} (${mf.type})`
          );
        }

        textContent = lines.join("\n");
      } else {
        textContent = JSON.stringify(output, null, 2);
      }

      return {
        content: [{ type: "text" as const, text: textContent }],
      };
    }
  );
}
