import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { executeGraphQL, toGid, formatMoney } from "../services/shopify-client.js";
import { ResponseFormatSchema } from "../schemas/common.js";
import {
  PRODUCT_UPDATE_MUTATION,
  PRODUCTS_QUERY,
} from "../services/queries.js";

// Bulk variant update mutation
const VARIANT_BULK_UPDATE_MUTATION = `
  mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      product {
        id
        title
      }
      productVariants {
        id
        title
        price
        compareAtPrice
        sku
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// Product set mutation for bulk updates
const PRODUCT_SET_MUTATION = `
  mutation productSet($input: ProductSetInput!) {
    productSet(input: $input) {
      product {
        id
        title
        descriptionHtml
        status
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

export function registerBulkOperationTools(server: McpServer): void {
  // Bulk update product prices
  server.tool(
    "shopify_bulk_update_prices",
    "Update prices for multiple products or variants at once. Supports percentage or fixed amount changes.",
    {
      updates: z.array(z.object({
        product_id: z.string().describe("Product ID"),
        variant_id: z.string().optional().describe("Specific variant ID (optional, updates all variants if not specified)"),
        new_price: z.string().optional().describe("New price (e.g., '29.99')"),
        price_change_percent: z.number().optional().describe("Percentage change (e.g., 10 for +10%, -15 for -15%)"),
        price_change_amount: z.string().optional().describe("Fixed amount change (e.g., '5.00' or '-5.00')"),
        compare_at_price: z.string().optional().describe("Compare at price for showing discounts"),
      })).describe("Array of price updates"),
      response_format: ResponseFormatSchema,
    },
    async ({ updates, response_format = "markdown" }) => {
      const results: any[] = [];

      for (const update of updates) {
        try {
          const productGid = toGid("Product", update.product_id);

          // Get current product to fetch variants
          const productData = await executeGraphQL<any>(
            `query getProduct($id: ID!) {
              product(id: $id) {
                id
                title
                variants(first: 100) {
                  nodes {
                    id
                    title
                    price
                  }
                }
              }
            }`,
            { id: productGid }
          );

          const product = productData.product;
          if (!product) {
            results.push({ product_id: update.product_id, error: "Product not found" });
            continue;
          }

          // Calculate new prices for variants
          const variantUpdates = product.variants.nodes
            .filter((v: any) => !update.variant_id || v.id.includes(update.variant_id))
            .map((v: any) => {
              let newPrice = parseFloat(v.price);

              if (update.new_price) {
                newPrice = parseFloat(update.new_price);
              } else if (update.price_change_percent) {
                newPrice = newPrice * (1 + update.price_change_percent / 100);
              } else if (update.price_change_amount) {
                newPrice = newPrice + parseFloat(update.price_change_amount);
              }

              const variantUpdate: any = {
                id: v.id,
                price: newPrice.toFixed(2),
              };

              if (update.compare_at_price) {
                variantUpdate.compareAtPrice = update.compare_at_price;
              }

              return variantUpdate;
            });

          // Execute bulk update
          const updateResult = await executeGraphQL<any>(VARIANT_BULK_UPDATE_MUTATION, {
            productId: productGid,
            variants: variantUpdates,
          });

          if (updateResult.productVariantsBulkUpdate?.userErrors?.length > 0) {
            results.push({
              product_id: update.product_id,
              product_title: product.title,
              error: updateResult.productVariantsBulkUpdate.userErrors,
            });
          } else {
            results.push({
              product_id: update.product_id,
              product_title: product.title,
              variants_updated: updateResult.productVariantsBulkUpdate?.productVariants?.length || 0,
              new_prices: updateResult.productVariantsBulkUpdate?.productVariants?.map((v: any) => ({
                variant: v.title,
                price: v.price,
              })),
            });
          }
        } catch (error: any) {
          results.push({ product_id: update.product_id, error: error.message });
        }
      }

      if (response_format === "json") {
        return { content: [{ type: "text", text: JSON.stringify({ results }, null, 2) }] };
      }

      let md = `# Bulk Price Update Results\n\n`;
      md += `**${results.filter(r => !r.error).length}/${results.length}** products updated successfully\n\n`;

      for (const result of results) {
        if (result.error) {
          md += `❌ **${result.product_title || result.product_id}**: ${JSON.stringify(result.error)}\n`;
        } else {
          md += `✅ **${result.product_title}**: ${result.variants_updated} variant(s) updated\n`;
          if (result.new_prices) {
            for (const v of result.new_prices) {
              md += `   - ${v.variant}: $${v.price}\n`;
            }
          }
        }
      }

      return { content: [{ type: "text", text: md }] };
    }
  );

  // Bulk update product content (titles, descriptions)
  server.tool(
    "shopify_bulk_update_content",
    "Update titles and descriptions for multiple products. Perfect for AI-optimized content updates.",
    {
      updates: z.array(z.object({
        product_id: z.string().describe("Product ID"),
        title: z.string().optional().describe("New product title"),
        description_html: z.string().optional().describe("New product description (HTML supported)"),
        seo_title: z.string().optional().describe("SEO title (meta title)"),
        seo_description: z.string().optional().describe("SEO description (meta description)"),
        tags: z.array(z.string()).optional().describe("Product tags"),
      })).describe("Array of content updates"),
      response_format: ResponseFormatSchema,
    },
    async ({ updates, response_format = "markdown" }) => {
      const results: any[] = [];

      for (const update of updates) {
        try {
          const productGid = toGid("Product", update.product_id);

          const input: any = { id: productGid };
          if (update.title) input.title = update.title;
          if (update.description_html) input.descriptionHtml = update.description_html;
          if (update.tags) input.tags = update.tags;
          if (update.seo_title || update.seo_description) {
            input.seo = {};
            if (update.seo_title) input.seo.title = update.seo_title;
            if (update.seo_description) input.seo.description = update.seo_description;
          }

          const result = await executeGraphQL<any>(PRODUCT_UPDATE_MUTATION, { input });

          if (result.productUpdate?.userErrors?.length > 0) {
            results.push({
              product_id: update.product_id,
              error: result.productUpdate.userErrors,
            });
          } else {
            results.push({
              product_id: update.product_id,
              title: result.productUpdate?.product?.title,
              success: true,
            });
          }
        } catch (error: any) {
          results.push({ product_id: update.product_id, error: error.message });
        }
      }

      if (response_format === "json") {
        return { content: [{ type: "text", text: JSON.stringify({ results }, null, 2) }] };
      }

      let md = `# Bulk Content Update Results\n\n`;
      md += `**${results.filter(r => r.success).length}/${results.length}** products updated successfully\n\n`;

      for (const result of results) {
        if (result.error) {
          md += `❌ **${result.product_id}**: ${JSON.stringify(result.error)}\n`;
        } else {
          md += `✅ **${result.title}** updated\n`;
        }
      }

      return { content: [{ type: "text", text: md }] };
    }
  );

  // Apply collection-wide price change
  server.tool(
    "shopify_collection_price_update",
    "Apply a price change to all products in a collection. Great for sales and promotions.",
    {
      collection_id: z.string().describe("Collection ID"),
      price_change_percent: z.number().optional().describe("Percentage change (e.g., -20 for 20% off)"),
      price_change_amount: z.string().optional().describe("Fixed amount change"),
      set_compare_at_from_current: z.boolean().optional().describe("Set compare_at_price to current price before changing (shows 'was $X' pricing)"),
      response_format: ResponseFormatSchema,
    },
    async ({ collection_id, price_change_percent, price_change_amount, set_compare_at_from_current = false, response_format = "markdown" }) => {
      const collectionGid = toGid("Collection", collection_id);

      // Get all products in collection
      const collectionData = await executeGraphQL<any>(
        `query getCollectionProducts($id: ID!) {
          collection(id: $id) {
            id
            title
            products(first: 250) {
              nodes {
                id
                title
                variants(first: 100) {
                  nodes {
                    id
                    title
                    price
                  }
                }
              }
            }
          }
        }`,
        { id: collectionGid }
      );

      const collection = collectionData.collection;
      if (!collection) {
        return { content: [{ type: "text", text: "Collection not found" }] };
      }

      const results: any[] = [];

      for (const product of collection.products.nodes) {
        try {
          const variantUpdates = product.variants.nodes.map((v: any) => {
            const currentPrice = parseFloat(v.price);
            let newPrice = currentPrice;

            if (price_change_percent) {
              newPrice = currentPrice * (1 + price_change_percent / 100);
            } else if (price_change_amount) {
              newPrice = currentPrice + parseFloat(price_change_amount);
            }

            const update: any = {
              id: v.id,
              price: Math.max(0, newPrice).toFixed(2),
            };

            if (set_compare_at_from_current) {
              update.compareAtPrice = currentPrice.toFixed(2);
            }

            return update;
          });

          const updateResult = await executeGraphQL<any>(VARIANT_BULK_UPDATE_MUTATION, {
            productId: product.id,
            variants: variantUpdates,
          });

          if (updateResult.productVariantsBulkUpdate?.userErrors?.length > 0) {
            results.push({ product: product.title, error: updateResult.productVariantsBulkUpdate.userErrors });
          } else {
            results.push({
              product: product.title,
              variants_updated: variantUpdates.length,
              success: true,
            });
          }
        } catch (error: any) {
          results.push({ product: product.title, error: error.message });
        }
      }

      if (response_format === "json") {
        return { content: [{ type: "text", text: JSON.stringify({ collection: collection.title, results }, null, 2) }] };
      }

      let md = `# Collection Price Update: ${collection.title}\n\n`;
      const changeDesc = price_change_percent
        ? `${price_change_percent > 0 ? '+' : ''}${price_change_percent}%`
        : `${parseFloat(price_change_amount || '0') > 0 ? '+' : ''}$${price_change_amount}`;
      md += `**Price Change:** ${changeDesc}\n`;
      md += `**Products Updated:** ${results.filter(r => r.success).length}/${results.length}\n\n`;

      for (const result of results) {
        if (result.error) {
          md += `❌ ${result.product}: ${JSON.stringify(result.error)}\n`;
        } else {
          md += `✅ ${result.product} (${result.variants_updated} variants)\n`;
        }
      }

      return { content: [{ type: "text", text: md }] };
    }
  );

  // Analyze and suggest price optimizations
  server.tool(
    "shopify_analyze_pricing",
    "Analyze product pricing and provide optimization suggestions. Returns data for AI-driven pricing decisions.",
    {
      collection_id: z.string().optional().describe("Analyze products in a specific collection"),
      query: z.string().optional().describe("Product search query"),
      analysis_type: z.enum(["competitive", "margin", "velocity", "all"]).optional().describe("Type of analysis"),
      response_format: ResponseFormatSchema,
    },
    async ({ collection_id, query, analysis_type = "all", response_format = "markdown" }) => {
      let products: any[] = [];

      if (collection_id) {
        const collectionGid = toGid("Collection", collection_id);
        const data = await executeGraphQL<any>(
          `query getCollectionProducts($id: ID!) {
            collection(id: $id) {
              title
              products(first: 100) {
                nodes {
                  id
                  title
                  totalInventory
                  priceRangeV2 {
                    minVariantPrice { amount currencyCode }
                    maxVariantPrice { amount currencyCode }
                  }
                  compareAtPriceRange {
                    minVariantCompareAtPrice { amount }
                    maxVariantCompareAtPrice { amount }
                  }
                  variants(first: 10) {
                    nodes {
                      id
                      price
                      compareAtPrice
                      inventoryQuantity
                      sku
                    }
                  }
                }
              }
            }
          }`,
          { id: collectionGid }
        );
        products = data.collection?.products?.nodes || [];
      } else {
        const data = await executeGraphQL<any>(PRODUCTS_QUERY, { first: 100, query });
        products = data.products?.nodes || [];
      }

      // Analyze products
      const analysis = products.map((p: any) => {
        const minPrice = parseFloat(p.priceRangeV2?.minVariantPrice?.amount || "0");
        const maxPrice = parseFloat(p.priceRangeV2?.maxVariantPrice?.amount || "0");
        const compareAtMin = parseFloat(p.compareAtPriceRange?.minVariantCompareAtPrice?.amount || "0");
        const compareAtMax = parseFloat(p.compareAtPriceRange?.maxVariantCompareAtPrice?.amount || "0");

        const suggestions: string[] = [];

        // Check for missing compare_at prices
        if (compareAtMin === 0 && minPrice > 20) {
          suggestions.push("Consider adding compare_at_price to show value");
        }

        // Check for low inventory high price items
        if (p.totalInventory > 50 && minPrice < 15) {
          suggestions.push("High inventory, low price - consider bundling or promotions");
        }

        // Check for low inventory items
        if (p.totalInventory < 5 && p.totalInventory > 0) {
          suggestions.push("Low inventory - consider price increase or reorder");
        }

        // Check for large price ranges (may indicate variant pricing issues)
        if (maxPrice > minPrice * 2) {
          suggestions.push("Large price variance between variants - review pricing strategy");
        }

        return {
          id: p.id.replace("gid://shopify/Product/", ""),
          title: p.title,
          price_range: minPrice === maxPrice ? `$${minPrice}` : `$${minPrice} - $${maxPrice}`,
          compare_at: compareAtMax > 0 ? `$${compareAtMax}` : "Not set",
          inventory: p.totalInventory,
          suggestions,
        };
      });

      if (response_format === "json") {
        return { content: [{ type: "text", text: JSON.stringify({ analysis }, null, 2) }] };
      }

      let md = `# Pricing Analysis\n\n`;
      md += `**Products Analyzed:** ${analysis.length}\n\n`;

      const withSuggestions = analysis.filter(a => a.suggestions.length > 0);
      if (withSuggestions.length > 0) {
        md += `## Products with Optimization Opportunities\n\n`;
        for (const item of withSuggestions) {
          md += `### ${item.title}\n`;
          md += `- **Price:** ${item.price_range}\n`;
          md += `- **Compare At:** ${item.compare_at}\n`;
          md += `- **Inventory:** ${item.inventory}\n`;
          md += `- **Suggestions:**\n`;
          for (const s of item.suggestions) {
            md += `  - ${s}\n`;
          }
          md += `\n`;
        }
      }

      // Summary stats
      const prices = analysis.map(a => parseFloat(a.price_range.replace('$', '').split(' - ')[0]));
      const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;

      md += `## Summary\n`;
      md += `- Average Price: $${avgPrice.toFixed(2)}\n`;
      md += `- Products needing attention: ${withSuggestions.length}\n`;

      return { content: [{ type: "text", text: md }] };
    }
  );

  // Generate marketing content for products
  server.tool(
    "shopify_generate_social_content",
    "Generate social media marketing content for products. Returns ready-to-post content for Twitter, Facebook, Instagram.",
    {
      product_id: z.string().optional().describe("Specific product ID"),
      collection_id: z.string().optional().describe("Generate content for collection"),
      content_type: z.enum(["promotional", "new_arrival", "sale", "featured", "seasonal"]).describe("Type of content to generate"),
      platforms: z.array(z.enum(["twitter", "facebook", "instagram"])).optional().describe("Target platforms"),
      include_hashtags: z.boolean().optional().describe("Include relevant hashtags"),
      tone: z.enum(["professional", "casual", "exciting", "luxury"]).optional().describe("Content tone"),
      response_format: ResponseFormatSchema,
    },
    async ({ product_id, collection_id, content_type, platforms = ["twitter", "facebook", "instagram"], include_hashtags = true, tone = "casual", response_format = "markdown" }) => {
      let products: any[] = [];
      let collectionTitle = "";

      if (product_id) {
        const productGid = toGid("Product", product_id);
        const data = await executeGraphQL<any>(
          `query getProduct($id: ID!) {
            product(id: $id) {
              id
              title
              description
              priceRangeV2 {
                minVariantPrice { amount currencyCode }
              }
              featuredImage { url }
              tags
              vendor
            }
          }`,
          { id: productGid }
        );
        if (data.product) products = [data.product];
      } else if (collection_id) {
        const collectionGid = toGid("Collection", collection_id);
        const data = await executeGraphQL<any>(
          `query getCollection($id: ID!) {
            collection(id: $id) {
              title
              products(first: 5) {
                nodes {
                  id
                  title
                  description
                  priceRangeV2 {
                    minVariantPrice { amount currencyCode }
                  }
                  featuredImage { url }
                  tags
                  vendor
                }
              }
            }
          }`,
          { id: collectionGid }
        );
        products = data.collection?.products?.nodes || [];
        collectionTitle = data.collection?.title || "";
      }

      if (products.length === 0) {
        return { content: [{ type: "text", text: "No products found to generate content for." }] };
      }

      // Generate content for each product
      const contentItems = products.map((p: any) => {
        const price = parseFloat(p.priceRangeV2?.minVariantPrice?.amount || "0");
        const tags = p.tags || [];

        // Build hashtags from tags and product info
        const hashtags = include_hashtags ? [
          "#ShopNow",
          p.vendor ? `#${p.vendor.replace(/\s+/g, '')}` : null,
          ...tags.slice(0, 3).map((t: string) => `#${t.replace(/\s+/g, '')}`),
        ].filter(Boolean).join(" ") : "";

        const templates: Record<string, Record<string, string>> = {
          promotional: {
            twitter: `🔥 ${p.title} - Now available for just $${price}! ${hashtags}`,
            facebook: `Looking for quality? Check out our ${p.title}! \n\n${p.description?.substring(0, 150) || ''}\n\n💰 Only $${price}\n\n${hashtags}`,
            instagram: `✨ ${p.title} ✨\n\n${p.description?.substring(0, 200) || 'Shop now!'}\n\n💵 $${price}\n\n${hashtags}`,
          },
          new_arrival: {
            twitter: `🆕 Just dropped: ${p.title}! Be the first to get yours. $${price} ${hashtags}`,
            facebook: `🎉 NEW ARRIVAL 🎉\n\n${p.title} has just landed!\n\n${p.description?.substring(0, 150) || ''}\n\nStarting at $${price}\n\n${hashtags}`,
            instagram: `🆕 NEW IN 🆕\n\n${p.title}\n\n${p.description?.substring(0, 200) || ''}\n\n$${price}\n\n${hashtags}`,
          },
          sale: {
            twitter: `🏷️ SALE! ${p.title} at an amazing price - $${price}! Limited time only. ${hashtags}`,
            facebook: `🔴 SALE ALERT 🔴\n\n${p.title}\n\nWas: $${(price * 1.2).toFixed(2)}\nNow: $${price}\n\nDon't miss out!\n\n${hashtags}`,
            instagram: `🏷️ S A L E 🏷️\n\n${p.title}\n\nNow only $${price}!\n\n${hashtags}`,
          },
          featured: {
            twitter: `⭐ Featured: ${p.title} - One of our customer favorites! $${price} ${hashtags}`,
            facebook: `⭐ FEATURED PRODUCT ⭐\n\n${p.title}\n\n${p.description?.substring(0, 200) || ''}\n\n$${price}\n\n${hashtags}`,
            instagram: `⭐ F E A T U R E D ⭐\n\n${p.title}\n\nA customer favorite!\n\n$${price}\n\n${hashtags}`,
          },
          seasonal: {
            twitter: `Perfect for the season: ${p.title}! Get yours now for $${price} ${hashtags}`,
            facebook: `🌟 Seasonal Pick 🌟\n\n${p.title} is perfect for this time of year!\n\n${p.description?.substring(0, 150) || ''}\n\n$${price}\n\n${hashtags}`,
            instagram: `🍂 SEASONAL FAVORITE 🍂\n\n${p.title}\n\n$${price}\n\n${hashtags}`,
          },
        };

        return {
          product_id: p.id.replace("gid://shopify/Product/", ""),
          product_title: p.title,
          image_url: p.featuredImage?.url,
          content: platforms.reduce((acc: any, platform) => {
            acc[platform] = templates[content_type]?.[platform] || templates.promotional[platform];
            return acc;
          }, {}),
        };
      });

      if (response_format === "json") {
        return { content: [{ type: "text", text: JSON.stringify({ content_items: contentItems, collection: collectionTitle }, null, 2) }] };
      }

      let md = `# Generated Social Media Content\n\n`;
      if (collectionTitle) {
        md += `**Collection:** ${collectionTitle}\n\n`;
      }
      md += `**Content Type:** ${content_type}\n`;
      md += `**Platforms:** ${platforms.join(", ")}\n\n`;

      for (const item of contentItems) {
        md += `---\n\n`;
        md += `## ${item.product_title}\n`;
        if (item.image_url) {
          md += `**Image:** ${item.image_url}\n\n`;
        }

        for (const [platform, content] of Object.entries(item.content)) {
          md += `### ${platform.charAt(0).toUpperCase() + platform.slice(1)}\n`;
          md += `\`\`\`\n${content}\n\`\`\`\n\n`;
        }
      }

      md += `---\n\n`;
      md += `💡 **Next Steps:** Use Claude in Chrome to post this content to your social media accounts.\n`;

      return { content: [{ type: "text", text: md }] };
    }
  );
}
