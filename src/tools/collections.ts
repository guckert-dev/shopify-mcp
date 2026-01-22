/**
 * Collection management tools
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
  COLLECTIONS_QUERY,
  COLLECTION_DETAIL_QUERY,
  COLLECTION_ADD_PRODUCTS_MUTATION,
  COLLECTION_REMOVE_PRODUCTS_MUTATION,
} from "../services/queries.js";
import { ResponseFormat, CHARACTER_LIMIT } from "../constants.js";
import { ResponseFormatSchema, PaginationSchema, ShopifyIdSchema } from "../schemas/common.js";
import { PageInfo } from "../types.js";

// ============================================
// TYPES
// ============================================

interface CollectionRule {
  column: string;
  condition: string;
  relation: string;
}

interface Collection {
  id: string;
  title: string;
  handle: string;
  descriptionHtml: string | null;
  productsCount: number;
  sortOrder: string;
  ruleSet: {
    appliedDisjunctively: boolean;
    rules: CollectionRule[];
  } | null;
  image: {
    url: string;
    altText: string | null;
  } | null;
  updatedAt: string;
  products?: {
    edges: Array<{
      node: {
        id: string;
        title: string;
        handle: string;
        status: string;
        totalInventory: number;
        priceRangeV2: {
          minVariantPrice: {
            amount: string;
            currencyCode: string;
          };
        };
      };
    }>;
    pageInfo: PageInfo;
  };
}

interface CollectionsResponse {
  collections: {
    edges: Array<{ node: Collection; cursor: string }>;
    pageInfo: PageInfo;
  };
}

interface CollectionDetailResponse {
  collection: Collection | null;
}

// ============================================
// SCHEMAS
// ============================================

const ListCollectionsInputSchema = z
  .object({
    query: z
      .string()
      .optional()
      .describe("Search query to filter collections by title"),
    response_format: ResponseFormatSchema,
  })
  .merge(PaginationSchema)
  .strict();

type ListCollectionsInput = z.infer<typeof ListCollectionsInputSchema>;

const GetCollectionInputSchema = z.object({
  id: ShopifyIdSchema.describe("Collection ID"),
  products_limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(20)
    .describe("Number of products to include (1-50, default: 20)"),
  response_format: ResponseFormatSchema,
}).strict();

type GetCollectionInput = z.infer<typeof GetCollectionInputSchema>;

const AddProductsToCollectionInputSchema = z.object({
  collection_id: ShopifyIdSchema.describe("Collection ID to add products to"),
  product_ids: z
    .array(ShopifyIdSchema)
    .min(1)
    .max(250)
    .describe("Product IDs to add (max 250)"),
}).strict();

type AddProductsToCollectionInput = z.infer<typeof AddProductsToCollectionInputSchema>;

const RemoveProductsFromCollectionInputSchema = z.object({
  collection_id: ShopifyIdSchema.describe("Collection ID to remove products from"),
  product_ids: z
    .array(ShopifyIdSchema)
    .min(1)
    .max(250)
    .describe("Product IDs to remove (max 250)"),
}).strict();

type RemoveProductsFromCollectionInput = z.infer<typeof RemoveProductsFromCollectionInputSchema>;

// ============================================
// HELPER FUNCTIONS
// ============================================

function formatCollectionSummary(collection: Collection): string {
  const isAutomated = collection.ruleSet && collection.ruleSet.rules.length > 0;

  return [
    `## ${collection.title}`,
    `- **ID**: ${extractNumericId(collection.id)}`,
    `- **Handle**: ${collection.handle}`,
    `- **Products**: ${collection.productsCount}`,
    `- **Type**: ${isAutomated ? "Automated (Smart)" : "Manual"}`,
    `- **Sort**: ${collection.sortOrder}`,
    `- **Updated**: ${formatDate(collection.updatedAt)}`,
  ].join("\n");
}

// ============================================
// REGISTER TOOLS
// ============================================

export function registerCollectionTools(server: McpServer): void {
  // LIST COLLECTIONS
  server.registerTool(
    "shopify_list_collections",
    {
      title: "List Collections",
      description: `List product collections in the Shopify store.

Collections are groups of products, either manually curated or automatically populated based on rules.

Args:
  - query (string, optional): Search by collection title
  - first (number): Results to return (1-100, default: 20)
  - after (string, optional): Pagination cursor
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  List of collections with: title, handle, product count, type (manual/automated), sort order

Examples:
  - "Show all collections" -> no filters
  - "Find 'Summer' collections" -> query: "Summer"`,
      inputSchema: ListCollectionsInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: ListCollectionsInput) => {
      try {
        const variables = {
          first: params.first,
          after: params.after || null,
          query: params.query || null,
        };

        const data = await executeGraphQL<CollectionsResponse>(COLLECTIONS_QUERY, variables);
        const collections = data.collections.edges.map((e) => e.node);
        const pageInfo = data.collections.pageInfo;

        if (collections.length === 0) {
          return {
            content: [{ type: "text", text: "No collections found matching your criteria." }],
          };
        }

        const output = {
          total_returned: collections.length,
          collections: collections.map((col) => ({
            id: extractNumericId(col.id),
            gid: col.id,
            title: col.title,
            handle: col.handle,
            products_count: col.productsCount,
            is_automated: col.ruleSet && col.ruleSet.rules.length > 0,
            sort_order: col.sortOrder,
            image: col.image?.url,
            updated_at: col.updatedAt,
          })),
          pagination: {
            has_next_page: pageInfo.hasNextPage,
            end_cursor: pageInfo.endCursor,
          },
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          const lines = [
            `# Collections (${collections.length} results)`,
            "",
            ...collections.map((col) => formatCollectionSummary(col)),
            "",
            "---",
            pageInfo.hasNextPage
              ? `*More collections available. Use after: "${pageInfo.endCursor}" to get the next page.*`
              : "*No more collections available.*",
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

  // GET COLLECTION
  server.registerTool(
    "shopify_get_collection",
    {
      title: "Get Collection Details",
      description: `Get full details for a specific collection including its products.

Args:
  - id (string, required): Collection ID
  - products_limit (number): Number of products to include (1-50, default: 20)
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  Collection details with: title, description, type, rules (if automated), and products

Examples:
  - "Show collection 123 with products" -> id: "123"
  - "Get collection details with 50 products" -> id: "123", products_limit: 50`,
      inputSchema: GetCollectionInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: GetCollectionInput) => {
      try {
        const collectionId = toGid("Collection", params.id);
        const data = await executeGraphQL<CollectionDetailResponse>(COLLECTION_DETAIL_QUERY, {
          id: collectionId,
          productsFirst: params.products_limit,
        });

        if (!data.collection) {
          return {
            content: [{ type: "text", text: `Error: Collection not found with ID '${params.id}'.` }],
            isError: true,
          };
        }

        const collection = data.collection;
        const isAutomated = collection.ruleSet && collection.ruleSet.rules.length > 0;
        const products = collection.products?.edges.map((e) => e.node) || [];

        const output = {
          id: extractNumericId(collection.id),
          gid: collection.id,
          title: collection.title,
          handle: collection.handle,
          description_html: collection.descriptionHtml,
          products_count: collection.productsCount,
          is_automated: isAutomated,
          sort_order: collection.sortOrder,
          rules: isAutomated
            ? {
                disjunctive: collection.ruleSet?.appliedDisjunctively,
                conditions: collection.ruleSet?.rules.map((r) => ({
                  column: r.column,
                  relation: r.relation,
                  condition: r.condition,
                })),
              }
            : null,
          image: collection.image,
          products: products.map((p) => ({
            id: extractNumericId(p.id),
            title: p.title,
            handle: p.handle,
            status: p.status,
            inventory: p.totalInventory,
            min_price: p.priceRangeV2?.minVariantPrice,
          })),
          products_has_more: collection.products?.pageInfo.hasNextPage,
          updated_at: collection.updatedAt,
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          const lines: string[] = [
            `# ${collection.title}`,
            "",
            `- **ID**: ${extractNumericId(collection.id)}`,
            `- **Handle**: ${collection.handle}`,
            `- **Products**: ${collection.productsCount}`,
            `- **Type**: ${isAutomated ? "Automated (Smart Collection)" : "Manual"}`,
            `- **Sort Order**: ${collection.sortOrder}`,
            `- **Updated**: ${formatDate(collection.updatedAt)}`,
          ];

          if (collection.descriptionHtml) {
            lines.push("", "## Description", collection.descriptionHtml);
          }

          if (isAutomated && collection.ruleSet) {
            lines.push(
              "",
              "## Automation Rules",
              `*Matching: ${collection.ruleSet.appliedDisjunctively ? "ANY rule (OR)" : "ALL rules (AND)"}*`,
              ""
            );
            for (const rule of collection.ruleSet.rules) {
              lines.push(`- ${rule.column} ${rule.relation} "${rule.condition}"`);
            }
          }

          if (products.length > 0) {
            lines.push("", "## Products", "");
            for (const product of products) {
              const price = product.priceRangeV2?.minVariantPrice;
              lines.push(
                `### ${product.title}`,
                `- ID: ${extractNumericId(product.id)}`,
                `- Status: ${product.status}`,
                `- Inventory: ${product.totalInventory}`
              );
              if (price) {
                lines.push(`- From: ${formatMoney(price.amount, price.currencyCode)}`);
              }
              lines.push("");
            }

            if (collection.products?.pageInfo.hasNextPage) {
              lines.push("*More products in this collection...*");
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

  // ADD PRODUCTS TO COLLECTION
  server.registerTool(
    "shopify_add_products_to_collection",
    {
      title: "Add Products to Collection",
      description: `Add products to a manual collection.

Note: This only works for manual collections, not automated/smart collections which are rule-based.

Args:
  - collection_id (string, required): Collection ID to add products to
  - product_ids (string[], required): Array of product IDs to add (max 250)

Returns:
  Updated collection with new product count

Examples:
  - "Add product 123 to collection 456" ->
    collection_id: "456", product_ids: ["123"]
  - "Add multiple products" ->
    collection_id: "456", product_ids: ["123", "124", "125"]`,
      inputSchema: AddProductsToCollectionInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: AddProductsToCollectionInput) => {
      try {
        const collectionId = toGid("Collection", params.collection_id);
        const productIds = params.product_ids.map((id) => toGid("Product", id));

        const data = await executeGraphQL<{
          collectionAddProducts: {
            collection: {
              id: string;
              title: string;
              productsCount: number;
            } | null;
            userErrors: Array<{ field: string[]; message: string }>;
          };
        }>(COLLECTION_ADD_PRODUCTS_MUTATION, {
          id: collectionId,
          productIds,
        });

        if (data.collectionAddProducts.userErrors?.length > 0) {
          const errors = data.collectionAddProducts.userErrors.map((e) => e.message).join("; ");
          return {
            content: [{ type: "text", text: `Error adding products: ${errors}` }],
            isError: true,
          };
        }

        const collection = data.collectionAddProducts.collection;

        const output = {
          success: true,
          collection_id: params.collection_id,
          collection_title: collection?.title,
          products_added: params.product_ids.length,
          total_products: collection?.productsCount,
        };

        return {
          content: [
            {
              type: "text",
              text: `Products added successfully!\n\n- **Collection**: ${collection?.title}\n- **Products Added**: ${params.product_ids.length}\n- **Total Products**: ${collection?.productsCount}`,
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

  // REMOVE PRODUCTS FROM COLLECTION
  server.registerTool(
    "shopify_remove_products_from_collection",
    {
      title: "Remove Products from Collection",
      description: `Remove products from a manual collection.

Note: This only works for manual collections, not automated/smart collections.

Args:
  - collection_id (string, required): Collection ID to remove products from
  - product_ids (string[], required): Array of product IDs to remove (max 250)

Returns:
  Confirmation of removal

Examples:
  - "Remove product 123 from collection 456" ->
    collection_id: "456", product_ids: ["123"]`,
      inputSchema: RemoveProductsFromCollectionInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: RemoveProductsFromCollectionInput) => {
      try {
        const collectionId = toGid("Collection", params.collection_id);
        const productIds = params.product_ids.map((id) => toGid("Product", id));

        const data = await executeGraphQL<{
          collectionRemoveProducts: {
            job: { id: string; done: boolean } | null;
            userErrors: Array<{ field: string[]; message: string }>;
          };
        }>(COLLECTION_REMOVE_PRODUCTS_MUTATION, {
          id: collectionId,
          productIds,
        });

        if (data.collectionRemoveProducts.userErrors?.length > 0) {
          const errors = data.collectionRemoveProducts.userErrors.map((e) => e.message).join("; ");
          return {
            content: [{ type: "text", text: `Error removing products: ${errors}` }],
            isError: true,
          };
        }

        const output = {
          success: true,
          collection_id: params.collection_id,
          products_removed: params.product_ids.length,
        };

        return {
          content: [
            {
              type: "text",
              text: `Products removed successfully!\n\n- **Products Removed**: ${params.product_ids.length}`,
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
