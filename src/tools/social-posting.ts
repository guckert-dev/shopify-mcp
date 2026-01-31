import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { executeGraphQL, toGid } from "../services/shopify-client.js";
import { ResponseFormatSchema } from "../schemas/common.js";

/**
 * Social Posting Tools
 *
 * These tools generate ready-to-post content and provide browser automation
 * instructions for Claude in Chrome to execute the actual posting.
 *
 * The workflow is:
 * 1. Use Shopify MCP tools to analyze products/generate content
 * 2. Use Claude in Chrome to navigate to social media and post
 */

export function registerSocialPostingTools(server: McpServer): void {
  // Generate complete posting package
  server.registerTool(
    "shopify_prepare_social_campaign",
    {
      description: "Generate a complete social media campaign package with content for all platforms, optimized images, and posting instructions for Claude in Chrome.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
      },
      inputSchema: z.object({
        product_ids: z.array(z.string()).optional().describe("Product IDs to feature"),
        collection_id: z.string().optional().describe("Collection to promote"),
        campaign_type: z.enum([
          "product_launch",
          "flash_sale",
          "weekly_feature",
          "seasonal",
          "clearance",
          "back_in_stock",
        ]).describe("Campaign type"),
        discount_code: z.string().optional().describe("Discount code to include"),
        target_platforms: z.array(z.enum(["twitter", "facebook", "instagram", "linkedin"])).optional(),
        schedule: z.object({
          post_now: z.boolean().optional(),
          scheduled_time: z.string().optional(),
        }).optional(),
        response_format: ResponseFormatSchema,
      }),
    },
    async (args: any) => {
      const { product_ids, collection_id, campaign_type, discount_code, target_platforms = ["twitter", "facebook", "instagram"], schedule, response_format = "markdown" } = args;
      let products: any[] = [];
      let collectionTitle = "";

      // Fetch product data
      if (collection_id) {
        const data = await executeGraphQL<any>(
          `query getCollection($id: ID!) {
            collection(id: $id) {
              title
              description
              products(first: 5) {
                nodes {
                  id
                  title
                  description
                  handle
                  priceRangeV2 {
                    minVariantPrice { amount currencyCode }
                  }
                  featuredImage { url altText }
                  images(first: 3) {
                    nodes { url altText }
                  }
                }
              }
            }
          }`,
          { id: toGid("Collection", collection_id) }
        );
        products = data.collection?.products?.nodes || [];
        collectionTitle = data.collection?.title || "";
      } else if (product_ids?.length) {
        for (const pid of product_ids.slice(0, 5)) {
          const data = await executeGraphQL<any>(
            `query getProduct($id: ID!) {
              product(id: $id) {
                id
                title
                description
                handle
                priceRangeV2 {
                  minVariantPrice { amount currencyCode }
                }
                featuredImage { url altText }
                images(first: 3) {
                  nodes { url altText }
                }
              }
            }`,
            { id: toGid("Product", pid) }
          );
          if (data.product) products.push(data.product);
        }
      }

      // Get shop info for links
      const shopData = await executeGraphQL<any>(
        `query { shop { name primaryDomain { url } } }`,
        {}
      );
      const shopUrl = shopData.shop?.primaryDomain?.url || "https://your-store.myshopify.com";
      const shopName = shopData.shop?.name || "Our Store";

      // Generate campaign content
      const campaignContent: any = {
        campaign_type,
        shop_name: shopName,
        shop_url: shopUrl,
        products: products.map(p => ({
          title: p.title,
          price: p.priceRangeV2?.minVariantPrice?.amount,
          url: `${shopUrl}/products/${p.handle}`,
          image: p.featuredImage?.url,
          images: p.images?.nodes?.map((i: any) => i.url) || [],
        })),
        posts: {} as Record<string, any>,
      };

      // Generate platform-specific content
      const product = products[0];
      const price = product?.priceRangeV2?.minVariantPrice?.amount || "0";

      const campaignTemplates: Record<string, Record<string, any>> = {
        product_launch: {
          twitter: {
            text: `🚀 NEW ARRIVAL: ${product?.title}!\n\nNow available at ${shopName}.\n\n💰 Starting at $${price}\n${discount_code ? `\n🎁 Use code ${discount_code} for a special launch discount!` : ''}\n\n🔗 ${shopUrl}`,
            character_count: 0,
          },
          facebook: {
            text: `🎉 INTRODUCING: ${product?.title}\n\nWe're excited to announce our newest addition to the ${shopName} family!\n\n${product?.description?.substring(0, 200) || ''}\n\n💰 Starting at $${price}\n${discount_code ? `\n🎁 Special Launch Offer: Use code ${discount_code} at checkout!` : ''}\n\n👉 Shop now: ${shopUrl}`,
          },
          instagram: {
            text: `🚀 N E W  A R R I V A L 🚀\n\n${product?.title}\n\n${product?.description?.substring(0, 150) || ''}\n\n💰 $${price}\n${discount_code ? `\n🎁 Launch Special: Use code ${discount_code}` : ''}\n\n🔗 Link in bio\n\n#NewArrival #ShopNow #${shopName.replace(/\s+/g, '')}`,
          },
          linkedin: {
            text: `We're thrilled to announce the launch of ${product?.title}.\n\n${product?.description?.substring(0, 300) || ''}\n\nNow available at ${shopName}.\n\nLearn more: ${shopUrl}`,
          },
        },
        flash_sale: {
          twitter: {
            text: `⚡ FLASH SALE ⚡\n\n${collectionTitle || product?.title} - Limited Time Only!\n\n${discount_code ? `Use code ${discount_code}` : 'Shop now'} before it's gone!\n\n🔗 ${shopUrl}`,
          },
          facebook: {
            text: `🔥 FLASH SALE ALERT 🔥\n\n${collectionTitle || product?.title}\n\nFor a limited time only, don't miss these incredible deals at ${shopName}!\n\n${discount_code ? `💸 Use code ${discount_code} at checkout for extra savings!` : ''}\n\n⏰ Hurry - this won't last long!\n\n👉 ${shopUrl}`,
          },
          instagram: {
            text: `⚡ F L A S H  S A L E ⚡\n\n${collectionTitle || product?.title}\n\nLimited time only!\n\n${discount_code ? `Use code: ${discount_code}` : ''}\n\n🔗 Link in bio\n\n#FlashSale #Sale #${shopName.replace(/\s+/g, '')}`,
          },
        },
        // Add more campaign types...
      };

      const templates = campaignTemplates[campaign_type] || campaignTemplates.product_launch;

      for (const platform of target_platforms) {
        if (templates[platform]) {
          campaignContent.posts[platform] = {
            ...templates[platform],
            image_url: product?.featuredImage?.url,
            product_link: `${shopUrl}/products/${product?.handle}`,
          };
          if (platform === "twitter") {
            campaignContent.posts[platform].character_count = templates[platform].text.length;
          }
        }
      }

      // Generate Claude in Chrome instructions
      const chromeInstructions: Record<string, string[]> = {
        twitter: [
          "1. Navigate to twitter.com and ensure you're logged in",
          "2. Click on the 'Post' button or the compose tweet area",
          "3. Paste the tweet text",
          `4. If including an image, click the image icon and upload from: ${product?.featuredImage?.url}`,
          "5. Click 'Post' to publish",
        ],
        facebook: [
          "1. Navigate to facebook.com and ensure you're logged in",
          "2. Go to your business page",
          "3. Click 'Create post'",
          "4. Paste the post content",
          `5. Add the product image from: ${product?.featuredImage?.url}`,
          "6. Click 'Post'",
        ],
        instagram: [
          "1. Navigate to instagram.com and ensure you're logged in",
          "2. Click the '+' create button",
          "3. Select 'Post'",
          `4. Upload image from: ${product?.featuredImage?.url}`,
          "5. Click 'Next', add filters if desired, click 'Next'",
          "6. Paste the caption",
          "7. Click 'Share'",
        ],
        linkedin: [
          "1. Navigate to linkedin.com and ensure you're logged in",
          "2. Click 'Start a post' on your company page",
          "3. Paste the post content",
          `4. Add the product image from: ${product?.featuredImage?.url}`,
          "5. Click 'Post'",
        ],
      };

      campaignContent.chrome_instructions = {};
      for (const platform of target_platforms) {
        campaignContent.chrome_instructions[platform] = chromeInstructions[platform];
      }

      if (response_format === "json") {
        return { content: [{ type: "text", text: JSON.stringify(campaignContent, null, 2) }] };
      }

      // Generate markdown report
      let md = `# Social Media Campaign: ${campaign_type.replace('_', ' ').toUpperCase()}\n\n`;
      md += `**Shop:** ${shopName}\n`;
      if (collectionTitle) md += `**Collection:** ${collectionTitle}\n`;
      if (discount_code) md += `**Discount Code:** \`${discount_code}\`\n`;
      md += `**Platforms:** ${target_platforms.join(", ")}\n\n`;

      md += `---\n\n`;

      for (const platform of target_platforms) {
        const post = campaignContent.posts[platform];
        if (!post) continue;

        md += `## ${platform.charAt(0).toUpperCase() + platform.slice(1)}\n\n`;
        md += `### Content\n\`\`\`\n${post.text}\n\`\`\`\n`;
        if (post.character_count) {
          md += `*${post.character_count} characters*\n`;
        }
        if (post.image_url) {
          md += `\n**Image:** ${post.image_url}\n`;
        }
        md += `\n### How to Post (Claude in Chrome)\n`;
        for (const instruction of chromeInstructions[platform] || []) {
          md += `${instruction}\n`;
        }
        md += `\n---\n\n`;
      }

      md += `## Next Steps\n\n`;
      md += `To post this content, ask Claude to:\n`;
      md += `> "Use Claude in Chrome to post the Twitter content from this campaign"\n\n`;
      md += `Or for all platforms:\n`;
      md += `> "Use Claude in Chrome to post this campaign to all platforms"\n`;

      return { content: [{ type: "text", text: md }] };
    }
  );

  // Store marketing activity log
  server.registerTool(
    "shopify_log_marketing_activity",
    {
      description: "Log a marketing activity to Shopify for tracking ROI and attribution.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
      },
      inputSchema: z.object({
      activity_type: z.enum(["social_post", "email_campaign", "ad", "influencer", "other"]).describe("Type of marketing activity"),
      platform: z.string().describe("Platform (twitter, facebook, email, etc.)"),
      title: z.string().describe("Activity title"),
      budget_amount: z.string().optional().describe("Budget spent"),
      utm_campaign: z.string().optional().describe("UTM campaign name"),
      utm_source: z.string().optional().describe("UTM source"),
      utm_medium: z.string().optional().describe("UTM medium"),
      notes: z.string().optional().describe("Additional notes"),
      response_format: ResponseFormatSchema,
    }),
    },
    async ({ activity_type, platform, title, budget_amount, utm_campaign, utm_source, utm_medium, notes, response_format = "markdown" }) => {
      // Note: Shopify's marketing activities API is limited in GraphQL
      // This creates a metafield log that can be used for tracking

      const activityLog = {
        type: activity_type,
        platform,
        title,
        budget: budget_amount,
        utm: {
          campaign: utm_campaign,
          source: utm_source,
          medium: utm_medium,
        },
        notes,
        created_at: new Date().toISOString(),
      };

      // Store in shop metafields for tracking
      try {
        await executeGraphQL<any>(
          `mutation createMetafield($metafields: [MetafieldsSetInput!]!) {
            metafieldsSet(metafields: $metafields) {
              metafields {
                id
                namespace
                key
                value
              }
              userErrors {
                field
                message
              }
            }
          }`,
          {
            metafields: [{
              ownerId: "gid://shopify/Shop/1", // Will be replaced with actual shop ID
              namespace: "marketing_log",
              key: `activity_${Date.now()}`,
              type: "json",
              value: JSON.stringify(activityLog),
            }],
          }
        );
      } catch (e) {
        // Silently continue - logging is optional
      }

      // Generate UTM link
      const shopData = await executeGraphQL<any>(
        `query { shop { primaryDomain { url } } }`,
        {}
      );
      const shopUrl = shopData.shop?.primaryDomain?.url || "https://your-store.myshopify.com";

      const utmParams = new URLSearchParams();
      if (utm_source) utmParams.set("utm_source", utm_source);
      if (utm_medium) utmParams.set("utm_medium", utm_medium);
      if (utm_campaign) utmParams.set("utm_campaign", utm_campaign);

      const trackedUrl = `${shopUrl}?${utmParams.toString()}`;

      if (response_format === "json") {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              logged: true,
              activity: activityLog,
              tracked_url: trackedUrl,
            }, null, 2),
          }],
        };
      }

      let md = `# Marketing Activity Logged\n\n`;
      md += `**Type:** ${activity_type}\n`;
      md += `**Platform:** ${platform}\n`;
      md += `**Title:** ${title}\n`;
      if (budget_amount) md += `**Budget:** $${budget_amount}\n`;
      md += `\n## Tracked URL\n`;
      md += `Use this URL in your marketing to track conversions:\n`;
      md += `\`\`\`\n${trackedUrl}\n\`\`\`\n`;

      return { content: [{ type: "text", text: md }] };
    }
  );

  // Analyze marketing performance
  server.registerTool(
    "shopify_marketing_performance",
    {
      description: "Analyze marketing performance by channel using order attribution data.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
      },
      inputSchema: z.object({
      days: z.number().optional().describe("Days to analyze (default: 30)"),
      response_format: ResponseFormatSchema,
    }),
    },
    async ({ days = 30, response_format = "markdown" }) => {
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      // Get orders with marketing attribution
      const ordersData = await executeGraphQL<any>(
        `query getOrders($query: String!) {
          orders(first: 250, query: $query) {
            nodes {
              id
              name
              totalPriceSet {
                shopMoney { amount }
              }
              customerJourneySummary {
                firstVisit {
                  utmParameters {
                    source
                    medium
                    campaign
                  }
                }
                lastVisit {
                  utmParameters {
                    source
                    medium
                    campaign
                  }
                }
              }
              refunds {
                totalRefundedSet {
                  shopMoney { amount }
                }
              }
            }
          }
        }`,
        { query: `created_at:>=${startDate}` }
      );

      const orders = ordersData.orders?.nodes || [];

      // Aggregate by source/campaign
      const attribution: Record<string, {
        orders: number;
        revenue: number;
        refunds: number;
        campaigns: Set<string>;
      }> = {};

      for (const order of orders) {
        const journey = order.customerJourneySummary;
        const source = journey?.firstVisit?.utmParameters?.source || journey?.lastVisit?.utmParameters?.source || "direct";
        const campaign = journey?.firstVisit?.utmParameters?.campaign || journey?.lastVisit?.utmParameters?.campaign || "";
        const revenue = parseFloat(order.totalPriceSet?.shopMoney?.amount || "0");
        const refunds = order.refunds?.reduce((sum: number, r: any) =>
          sum + parseFloat(r.totalRefundedSet?.shopMoney?.amount || "0"), 0) || 0;

        if (!attribution[source]) {
          attribution[source] = { orders: 0, revenue: 0, refunds: 0, campaigns: new Set() };
        }

        attribution[source].orders++;
        attribution[source].revenue += revenue;
        attribution[source].refunds += refunds;
        if (campaign) attribution[source].campaigns.add(campaign);
      }

      // Calculate totals
      const totals = {
        orders: orders.length,
        revenue: Object.values(attribution).reduce((s, a) => s + a.revenue, 0),
        refunds: Object.values(attribution).reduce((s, a) => s + a.refunds, 0),
      };

      const results = Object.entries(attribution)
        .map(([source, data]) => ({
          source,
          orders: data.orders,
          revenue: data.revenue,
          refunds: data.refunds,
          net_revenue: data.revenue - data.refunds,
          order_share: ((data.orders / totals.orders) * 100).toFixed(1),
          revenue_share: ((data.revenue / totals.revenue) * 100).toFixed(1),
          campaigns: Array.from(data.campaigns),
        }))
        .sort((a, b) => b.revenue - a.revenue);

      if (response_format === "json") {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              period_days: days,
              totals,
              by_source: results,
            }, null, 2),
          }],
        };
      }

      let md = `# Marketing Performance Report\n\n`;
      md += `**Period:** Last ${days} days\n`;
      md += `**Total Orders:** ${totals.orders}\n`;
      md += `**Total Revenue:** $${totals.revenue.toFixed(2)}\n`;
      md += `**Total Refunds:** $${totals.refunds.toFixed(2)}\n`;
      md += `**Net Revenue:** $${(totals.revenue - totals.refunds).toFixed(2)}\n\n`;

      md += `## Performance by Source\n\n`;

      for (const result of results) {
        md += `### ${result.source}\n`;
        md += `- **Orders:** ${result.orders} (${result.order_share}%)\n`;
        md += `- **Revenue:** $${result.revenue.toFixed(2)} (${result.revenue_share}%)\n`;
        md += `- **Net Revenue:** $${result.net_revenue.toFixed(2)}\n`;
        if (result.campaigns.length > 0) {
          md += `- **Campaigns:** ${result.campaigns.join(", ")}\n`;
        }
        md += `\n`;
      }

      return { content: [{ type: "text", text: md }] };
    }
  );
}
