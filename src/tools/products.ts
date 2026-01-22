/**
 * Product management tools
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
  PRODUCTS_QUERY,
  PRODUCT_DETAIL_QUERY,
  PRODUCT_CREATE_MUTATION,
  PRODUCT_UPDATE_MUTATION,
} from "../services/queries.js";
import { ResponseFormat, CHARACTER_LIMIT, ProductStatus } from "../constants.js";
import { ResponseFormatSchema, PaginationSchema, ShopifyIdSchema } from "../schemas/common.js";
import { Product, Connection, PageInfo } from "../types.js";

// ============================================
// LIST PRODUCTS
// ============================================

const ListProductsInputSchema = z
  .object({
    query: z
      .string()
      .optional()
      .describe(
        "Search query to filter products. Supports: 'status:active', 'vendor:Nike', 'product_type:Shoes', 'tag:sale', 'title:*shirt*', 'sku:ABC123', 'inventory_total:>0'"
      ),
    status: z
      .nativeEnum(ProductStatus)
      .optional()
      .describe("Filter by product status: active, archived, or draft"),
    response_format: ResponseFormatSchema,
  })
  .merge(PaginationSchema)
  .strict();

type ListProductsInput = z.infer<typeof ListProductsInputSchema>;

interface ProductsResponse {
  products: Connection<Product> & { pageInfo: PageInfo };
}

// ============================================
// GET PRODUCT
// ============================================

const GetProductInputSchema = z.object({
  id: ShopifyIdSchema.describe("Product ID (numeric or GID format)"),
  response_format: ResponseFormatSchema,
}).strict();

type GetProductInput = z.infer<typeof GetProductInputSchema>;

interface ProductDetailResponse {
  product: Product | null;
}

// ============================================
// CREATE PRODUCT
// ============================================

const CreateProductInputSchema = z.object({
  title: z.string().min(1).max(255).describe("Product title"),
  description: z.string().optional().describe("Product description (can include HTML)"),
  vendor: z.string().optional().describe("Product vendor/brand"),
  product_type: z.string().optional().describe("Product type/category"),
  tags: z.array(z.string()).optional().describe("Product tags"),
  status: z
    .nativeEnum(ProductStatus)
    .default(ProductStatus.DRAFT)
    .describe("Product status (default: draft)"),
  variants: z
    .array(
      z.object({
        title: z.string().optional().describe("Variant title (e.g., 'Small', 'Red')"),
        price: z.string().describe("Variant price as string (e.g., '29.99')"),
        sku: z.string().optional().describe("Stock keeping unit"),
        barcode: z.string().optional().describe("Barcode (ISBN, UPC, etc.)"),
        weight: z.number().optional().describe("Weight value"),
        weight_unit: z.enum(["GRAMS", "KILOGRAMS", "OUNCES", "POUNDS"]).optional(),
        inventory_quantity: z.number().int().optional().describe("Initial inventory quantity"),
        requires_shipping: z.boolean().optional().default(true),
      })
    )
    .optional()
    .describe("Product variants - if not provided, a default variant is created"),
}).strict();

type CreateProductInput = z.infer<typeof CreateProductInputSchema>;

// ============================================
// UPDATE PRODUCT
// ============================================

const UpdateProductInputSchema = z.object({
  id: ShopifyIdSchema.describe("Product ID to update"),
  title: z.string().min(1).max(255).optional().describe("New product title"),
  description: z.string().optional().describe("New product description"),
  vendor: z.string().optional().describe("New vendor"),
  product_type: z.string().optional().describe("New product type"),
  tags: z.array(z.string()).optional().describe("New tags (replaces existing)"),
  status: z.nativeEnum(ProductStatus).optional().describe("New status"),
}).strict();

type UpdateProductInput = z.infer<typeof UpdateProductInputSchema>;

// ============================================
// HELPER FUNCTIONS
// ============================================

function formatProductSummary(product: Product): string {
  const price = product.priceRangeV2?.minVariantPrice;
  const maxPrice = product.priceRangeV2?.maxVariantPrice;
  const variants = product.variants?.edges || [];
  const image = product.images?.edges?.[0]?.node;

  let priceDisplay = "No price set";
  if (price && maxPrice) {
    if (price.amount === maxPrice.amount) {
      priceDisplay = formatMoney(price.amount, price.currencyCode);
    } else {
      priceDisplay = `${formatMoney(price.amount, price.currencyCode)} - ${formatMoney(maxPrice.amount, maxPrice.currencyCode)}`;
    }
  }

  return [
    `## ${product.title}`,
    `- **ID**: ${extractNumericId(product.id)}`,
    `- **Status**: ${product.status}`,
    `- **Price**: ${priceDisplay}`,
    `- **Inventory**: ${product.totalInventory ?? "Not tracked"}`,
    `- **Vendor**: ${product.vendor || "N/A"}`,
    `- **Type**: ${product.productType || "N/A"}`,
    `- **Variants**: ${variants.length}`,
    product.tags?.length ? `- **Tags**: ${product.tags.join(", ")}` : null,
    image ? `- **Image**: ${image.url}` : null,
    `- **Updated**: ${formatDate(product.updatedAt)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function formatProductDetail(product: Product): string {
  const variants = product.variants?.edges?.map((e) => e.node) || [];
  const images = product.images?.edges?.map((e) => e.node) || [];

  const lines: string[] = [
    `# ${product.title}`,
    "",
    "## Overview",
    `- **ID**: ${extractNumericId(product.id)}`,
    `- **Handle**: ${product.handle}`,
    `- **Status**: ${product.status}`,
    `- **Vendor**: ${product.vendor || "N/A"}`,
    `- **Type**: ${product.productType || "N/A"}`,
    `- **Total Inventory**: ${product.totalInventory ?? "Not tracked"}`,
    `- **Tracks Inventory**: ${product.tracksInventory ? "Yes" : "No"}`,
    `- **Created**: ${formatDate(product.createdAt)}`,
    `- **Updated**: ${formatDate(product.updatedAt)}`,
    product.publishedAt ? `- **Published**: ${formatDate(product.publishedAt)}` : "- **Published**: Not published",
    "",
  ];

  // Tags
  if (product.tags?.length) {
    lines.push(`**Tags**: ${product.tags.join(", ")}`, "");
  }

  // Description
  if (product.descriptionHtml) {
    lines.push("## Description", product.descriptionHtml, "");
  }

  // Variants
  if (variants.length > 0) {
    lines.push("## Variants", "");
    for (const variant of variants) {
      lines.push(
        `### ${variant.title || "Default"}`,
        `- **ID**: ${extractNumericId(variant.id)}`,
        `- **SKU**: ${variant.sku || "N/A"}`,
        `- **Price**: ${formatMoney(variant.price, "USD")}`
      );
      if (variant.compareAtPrice) {
        lines.push(`- **Compare at**: ${formatMoney(variant.compareAtPrice, "USD")}`);
      }
      if (variant.inventoryQuantity !== null) {
        lines.push(`- **Inventory**: ${variant.inventoryQuantity}`);
      }
      if (variant.barcode) {
        lines.push(`- **Barcode**: ${variant.barcode}`);
      }
      if (variant.weight) {
        lines.push(`- **Weight**: ${variant.weight} ${variant.weightUnit}`);
      }
      lines.push("");
    }
  }

  // Images
  if (images.length > 0) {
    lines.push("## Images", "");
    for (const image of images) {
      lines.push(`- ${image.url}${image.altText ? ` (${image.altText})` : ""}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ============================================
// REGISTER TOOLS
// ============================================

export function registerProductTools(server: McpServer): void {
  // LIST PRODUCTS
  server.registerTool(
    "shopify_list_products",
    {
      title: "List Shopify Products",
      description: `List and search products from the Shopify store with filtering and pagination.

This tool retrieves products with various filtering options. Results are sorted by update date (newest first).

Args:
  - query (string, optional): Shopify search syntax. Examples:
    - 'status:active' - Active products only
    - 'vendor:Nike' - Products by vendor
    - 'product_type:Shoes' - Products by type
    - 'tag:sale' - Products with specific tag
    - 'title:*shirt*' - Products with title containing "shirt"
    - 'sku:ABC123' - Products with specific SKU
    - 'inventory_total:>0' - In-stock products
  - status ('active' | 'archived' | 'draft'): Filter by status
  - first (number): Results to return (1-100, default: 20)
  - after (string, optional): Pagination cursor
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  List of products with: id, title, status, price range, inventory, vendor, variants count
  Includes pagination info for fetching more results

Examples:
  - "Show me all active products" -> status: "active"
  - "Find products tagged 'sale'" -> query: "tag:sale"
  - "List Nike products" -> query: "vendor:Nike"
  - "Low stock products" -> query: "inventory_total:<10 inventory_total:>0"`,
      inputSchema: ListProductsInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: ListProductsInput) => {
      try {
        let queryParts: string[] = [];
        if (params.query) queryParts.push(params.query);
        if (params.status) queryParts.push(`status:${params.status}`);

        const variables = {
          first: params.first,
          after: params.after || null,
          query: queryParts.length > 0 ? queryParts.join(" ") : null,
        };

        const data = await executeGraphQL<ProductsResponse>(PRODUCTS_QUERY, variables);
        const products = data.products.edges.map((e) => e.node);
        const pageInfo = data.products.pageInfo;

        if (products.length === 0) {
          return {
            content: [{ type: "text", text: "No products found matching your criteria." }],
          };
        }

        const output = {
          total_returned: products.length,
          products: products.map((product) => {
            const variants = product.variants?.edges?.map((e) => e.node) || [];
            return {
              id: extractNumericId(product.id),
              gid: product.id,
              title: product.title,
              handle: product.handle,
              status: product.status,
              vendor: product.vendor,
              product_type: product.productType,
              total_inventory: product.totalInventory,
              price_range: product.priceRangeV2
                ? {
                    min: product.priceRangeV2.minVariantPrice,
                    max: product.priceRangeV2.maxVariantPrice,
                  }
                : null,
              variants_count: variants.length,
              tags: product.tags,
              created_at: product.createdAt,
              updated_at: product.updatedAt,
            };
          }),
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
            `# Products (${products.length} results)`,
            "",
            ...products.map((product) => formatProductSummary(product)),
            "",
            "---",
            pageInfo.hasNextPage
              ? `*More products available. Use after: "${pageInfo.endCursor}" to get the next page.*`
              : "*No more products available.*",
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

  // GET PRODUCT DETAIL
  server.registerTool(
    "shopify_get_product",
    {
      title: "Get Shopify Product Details",
      description: `Retrieve complete details for a specific product by ID.

This tool returns full product information including all variants, images, inventory levels, and metadata.

Args:
  - id (string): Product ID (numeric or GID format)
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  Complete product details including:
  - Basic info (title, handle, status, vendor, type)
  - Description (HTML)
  - All variants with pricing, SKU, inventory, barcodes
  - All images
  - Tags and metadata
  - Inventory tracking status

Examples:
  - "Show product details for 7890123456" -> id: "7890123456"
  - "Get full info for the blue t-shirt" -> First search, then get by ID`,
      inputSchema: GetProductInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: GetProductInput) => {
      try {
        const productId = toGid("Product", params.id);
        const data = await executeGraphQL<ProductDetailResponse>(PRODUCT_DETAIL_QUERY, {
          id: productId,
        });

        if (!data.product) {
          return {
            content: [
              {
                type: "text",
                text: `Error: Product not found. Please check the ID '${params.id}' is correct.`,
              },
            ],
            isError: true,
          };
        }

        const product = data.product;
        const variants = product.variants?.edges?.map((e) => e.node) || [];
        const images = product.images?.edges?.map((e) => e.node) || [];

        const output = {
          id: extractNumericId(product.id),
          gid: product.id,
          title: product.title,
          handle: product.handle,
          description_html: product.descriptionHtml,
          status: product.status,
          vendor: product.vendor,
          product_type: product.productType,
          tags: product.tags,
          total_inventory: product.totalInventory,
          tracks_inventory: product.tracksInventory,
          price_range: product.priceRangeV2
            ? {
                min: product.priceRangeV2.minVariantPrice,
                max: product.priceRangeV2.maxVariantPrice,
              }
            : null,
          variants: variants.map((v) => ({
            id: extractNumericId(v.id),
            gid: v.id,
            title: v.title,
            sku: v.sku,
            price: v.price,
            compare_at_price: v.compareAtPrice,
            inventory_quantity: v.inventoryQuantity,
            barcode: v.barcode,
            weight: v.weight,
            weight_unit: v.weightUnit,
            inventory_item_id: v.inventoryItem?.id ? extractNumericId(v.inventoryItem.id) : null,
          })),
          images: images.map((img) => ({
            id: extractNumericId(img.id),
            url: img.url,
            alt_text: img.altText,
          })),
          created_at: product.createdAt,
          updated_at: product.updatedAt,
          published_at: product.publishedAt,
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          textContent = formatProductDetail(product);
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

  // CREATE PRODUCT
  server.registerTool(
    "shopify_create_product",
    {
      title: "Create Shopify Product",
      description: `Create a new product in the Shopify store.

This tool creates a new product with the specified details. Products are created as drafts by default.

Args:
  - title (string, required): Product title
  - description (string, optional): Product description (can include HTML)
  - vendor (string, optional): Product vendor/brand
  - product_type (string, optional): Product type/category
  - tags (string[], optional): Product tags
  - status ('active' | 'archived' | 'draft'): Product status (default: 'draft')
  - variants (array, optional): Product variants with:
    - title: Variant name
    - price: Price as string (e.g., '29.99')
    - sku: Stock keeping unit
    - barcode: Barcode
    - weight: Weight value
    - weight_unit: 'GRAMS', 'KILOGRAMS', 'OUNCES', or 'POUNDS'
    - inventory_quantity: Initial stock

Returns:
  Created product with ID and variant information

Examples:
  - "Create a t-shirt product" -> title: "Classic T-Shirt", variants: [{price: "29.99"}]
  - "Add new product with multiple sizes" -> title: "...", variants: [{title: "Small", price: "29.99"}, {title: "Large", price: "29.99"}]`,
      inputSchema: CreateProductInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params: CreateProductInput) => {
      try {
        const input: Record<string, unknown> = {
          title: params.title,
          status: params.status.toUpperCase(),
        };

        if (params.description) input.descriptionHtml = params.description;
        if (params.vendor) input.vendor = params.vendor;
        if (params.product_type) input.productType = params.product_type;
        if (params.tags) input.tags = params.tags;

        if (params.variants && params.variants.length > 0) {
          input.variants = params.variants.map((v) => ({
            title: v.title,
            price: v.price,
            sku: v.sku,
            barcode: v.barcode,
            weight: v.weight,
            weightUnit: v.weight_unit,
            requiresShipping: v.requires_shipping,
          }));
        }

        const data = await executeGraphQL<{
          productCreate: {
            product: {
              id: string;
              title: string;
              handle: string;
              status: string;
              variants: { edges: Array<{ node: { id: string; title: string; sku: string; price: string } }> };
            } | null;
            userErrors: Array<{ field: string[]; message: string }>;
          };
        }>(PRODUCT_CREATE_MUTATION, { input });

        if (data.productCreate.userErrors?.length > 0) {
          const errors = data.productCreate.userErrors.map((e) => `${e.field?.join(".")}: ${e.message}`).join("; ");
          return {
            content: [{ type: "text", text: `Error creating product: ${errors}` }],
            isError: true,
          };
        }

        const product = data.productCreate.product;
        if (!product) {
          return {
            content: [{ type: "text", text: "Error: Product creation returned no data." }],
            isError: true,
          };
        }

        const variants = product.variants?.edges?.map((e) => e.node) || [];

        const output = {
          success: true,
          product: {
            id: extractNumericId(product.id),
            gid: product.id,
            title: product.title,
            handle: product.handle,
            status: product.status,
            variants: variants.map((v) => ({
              id: extractNumericId(v.id),
              title: v.title,
              sku: v.sku,
              price: v.price,
            })),
          },
        };

        return {
          content: [
            {
              type: "text",
              text: `Product created successfully!\n\n- **Title**: ${product.title}\n- **ID**: ${extractNumericId(product.id)}\n- **Handle**: ${product.handle}\n- **Status**: ${product.status}\n- **Variants**: ${variants.length}`,
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

  // UPDATE PRODUCT
  server.registerTool(
    "shopify_update_product",
    {
      title: "Update Shopify Product",
      description: `Update an existing product in the Shopify store.

This tool modifies product attributes. Only provided fields will be updated.

Args:
  - id (string, required): Product ID to update
  - title (string, optional): New product title
  - description (string, optional): New description (HTML)
  - vendor (string, optional): New vendor
  - product_type (string, optional): New product type
  - tags (string[], optional): New tags (replaces existing)
  - status ('active' | 'archived' | 'draft', optional): New status

Returns:
  Updated product confirmation

Examples:
  - "Change product title" -> id: "123", title: "New Title"
  - "Publish a draft product" -> id: "123", status: "active"
  - "Update product tags" -> id: "123", tags: ["sale", "featured"]`,
      inputSchema: UpdateProductInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: UpdateProductInput) => {
      try {
        const input: Record<string, unknown> = {
          id: toGid("Product", params.id),
        };

        if (params.title) input.title = params.title;
        if (params.description) input.descriptionHtml = params.description;
        if (params.vendor) input.vendor = params.vendor;
        if (params.product_type) input.productType = params.product_type;
        if (params.tags) input.tags = params.tags;
        if (params.status) input.status = params.status.toUpperCase();

        const data = await executeGraphQL<{
          productUpdate: {
            product: {
              id: string;
              title: string;
              handle: string;
              status: string;
              updatedAt: string;
            } | null;
            userErrors: Array<{ field: string[]; message: string }>;
          };
        }>(PRODUCT_UPDATE_MUTATION, { input });

        if (data.productUpdate.userErrors?.length > 0) {
          const errors = data.productUpdate.userErrors.map((e) => `${e.field?.join(".")}: ${e.message}`).join("; ");
          return {
            content: [{ type: "text", text: `Error updating product: ${errors}` }],
            isError: true,
          };
        }

        const product = data.productUpdate.product;
        if (!product) {
          return {
            content: [{ type: "text", text: "Error: Product update returned no data." }],
            isError: true,
          };
        }

        const output = {
          success: true,
          product: {
            id: extractNumericId(product.id),
            title: product.title,
            handle: product.handle,
            status: product.status,
            updated_at: product.updatedAt,
          },
        };

        return {
          content: [
            {
              type: "text",
              text: `Product updated successfully!\n\n- **Title**: ${product.title}\n- **ID**: ${extractNumericId(product.id)}\n- **Status**: ${product.status}\n- **Updated**: ${formatDate(product.updatedAt)}`,
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
