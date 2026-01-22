/**
 * Marketing tools for Shopify MCP Server
 * Includes: marketing activities, abandoned checkouts, customer segments, sales channels
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  executeGraphQL,
  formatMoney,
  extractNumericId,
  toGid,
} from "../services/shopify-client.js";
import {
  MARKETING_ACTIVITIES_QUERY,
  ABANDONED_CHECKOUTS_QUERY,
  CUSTOMER_SEGMENTS_QUERY,
  CUSTOMER_SEGMENT_MEMBERS_QUERY,
  PUBLICATIONS_QUERY,
  PRODUCT_PUBLICATIONS_QUERY,
  PUBLISH_PRODUCT_MUTATION,
  UNPUBLISH_PRODUCT_MUTATION,
} from "../services/queries.js";
import { ResponseFormatSchema, PaginationSchema, ShopifyIdSchema } from "../schemas/common.js";
import { ResponseFormat } from "../constants.js";

export function registerMarketingTools(server: McpServer): void {
  // ============================================
  // MARKETING ACTIVITIES
  // ============================================

  server.registerTool(
    "shopify_list_marketing_activities",
    {
      description:
        "List marketing activities (campaigns, ads, posts) across all channels. Shows email campaigns, social media posts, and paid advertising activities.",
      inputSchema: z.object({
        first: z.number().min(1).max(100).default(20).describe("Number of activities to retrieve"),
        after: z.string().optional().describe("Cursor for pagination"),
        format: ResponseFormatSchema,
      }),
    },
    async (args) => {
      const { first, after, format } = args;

      const data = await executeGraphQL<any>(MARKETING_ACTIVITIES_QUERY, {
        first,
        after,
      });

      const activities = data.marketingActivities?.edges || [];
      const pageInfo = data.marketingActivities?.pageInfo;

      const output = {
        activities: activities.map((edge: any) => ({
          id: extractNumericId(edge.node.id),
          title: edge.node.title,
          channel: edge.node.marketingChannel,
          channelType: edge.node.marketingChannelType,
          status: edge.node.status,
          budget: edge.node.budget?.total
            ? formatMoney(
                edge.node.budget.total.amount,
                edge.node.budget.total.currencyCode
              )
            : null,
          budgetType: edge.node.budget?.budgetType,
          utmSource: edge.node.utmParameters?.source,
          utmMedium: edge.node.utmParameters?.medium,
          utmCampaign: edge.node.utmParameters?.campaign,
          createdAt: edge.node.createdAt,
          scheduledToEnd: edge.node.scheduledToEndAt,
        })),
        pagination: {
          hasNextPage: pageInfo?.hasNextPage,
          endCursor: pageInfo?.endCursor,
        },
      };

      let textContent: string;
      if (format === "markdown") {
        const lines = [
          `# Marketing Activities`,
          `Found ${activities.length} activities`,
          "",
        ];

        for (const activity of output.activities) {
          lines.push(
            `## ${activity.title}`,
            `- **ID**: ${activity.id}`,
            `- **Channel**: ${activity.channel} (${activity.channelType})`,
            `- **Status**: ${activity.status}`
          );
          if (activity.budget) {
            lines.push(`- **Budget**: ${activity.budget} (${activity.budgetType})`);
          }
          if (activity.utmCampaign) {
            lines.push(`- **UTM Campaign**: ${activity.utmCampaign}`);
          }
          lines.push(`- **Created**: ${activity.createdAt}`, "");
        }

        if (pageInfo?.hasNextPage) {
          lines.push(
            "",
            `*More activities available. Use after: "${pageInfo.endCursor}" to get next page.*`
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

  // ============================================
  // ABANDONED CHECKOUTS
  // ============================================

  server.registerTool(
    "shopify_list_abandoned_checkouts",
    {
      description:
        "List abandoned checkouts - carts that customers started but didn't complete. Essential for recovery marketing campaigns.",
      inputSchema: z.object({
        first: z.number().min(1).max(100).default(20).describe("Number of checkouts to retrieve"),
        after: z.string().optional().describe("Cursor for pagination"),
        format: ResponseFormatSchema,
      }),
    },
    async (args) => {
      const { first, after, format } = args;

      const data = await executeGraphQL<any>(ABANDONED_CHECKOUTS_QUERY, {
        first,
        after,
      });

      const checkouts = data.abandonedCheckouts?.edges || [];
      const pageInfo = data.abandonedCheckouts?.pageInfo;

      const output = {
        abandonedCheckouts: checkouts.map((edge: any) => ({
          id: extractNumericId(edge.node.id),
          email: edge.node.email,
          phone: edge.node.phone,
          total: edge.node.totalPriceSet?.shopMoney
            ? formatMoney(
                edge.node.totalPriceSet.shopMoney.amount,
                edge.node.totalPriceSet.shopMoney.currencyCode
              )
            : null,
          itemCount: edge.node.lineItems?.edges?.length || 0,
          items: edge.node.lineItems?.edges?.map((item: any) => ({
            title: item.node.title,
            quantity: item.node.quantity,
          })),
          customer: edge.node.customer
            ? {
                id: extractNumericId(edge.node.customer.id),
                name: `${edge.node.customer.firstName || ""} ${
                  edge.node.customer.lastName || ""
                }`.trim(),
                email: edge.node.customer.email,
              }
            : null,
          location: edge.node.shippingAddress
            ? `${edge.node.shippingAddress.city}, ${edge.node.shippingAddress.country}`
            : null,
          createdAt: edge.node.createdAt,
          completedAt: edge.node.completedAt,
        })),
        pagination: {
          hasNextPage: pageInfo?.hasNextPage,
          endCursor: pageInfo?.endCursor,
        },
      };

      let textContent: string;
      if (format === "markdown") {
        const lines = [
          `# Abandoned Checkouts`,
          `Found ${checkouts.length} abandoned checkouts`,
          "",
        ];

        for (const checkout of output.abandonedCheckouts) {
          lines.push(`## Checkout ${checkout.id}`);
          if (checkout.email) {
            lines.push(`- **Email**: ${checkout.email}`);
          }
          if (checkout.phone) {
            lines.push(`- **Phone**: ${checkout.phone}`);
          }
          if (checkout.total) {
            lines.push(`- **Cart Value**: ${checkout.total}`);
          }
          lines.push(`- **Items**: ${checkout.itemCount}`);
          if (checkout.items && checkout.items.length > 0) {
            for (const item of checkout.items.slice(0, 3)) {
              lines.push(`  - ${item.title} (x${item.quantity})`);
            }
            if (checkout.items.length > 3) {
              lines.push(`  - ... and ${checkout.items.length - 3} more`);
            }
          }
          if (checkout.customer) {
            lines.push(`- **Customer**: ${checkout.customer.name || checkout.customer.email}`);
          }
          if (checkout.location) {
            lines.push(`- **Location**: ${checkout.location}`);
          }
          lines.push(
            `- **Created**: ${checkout.createdAt}`,
            `- **Recovered**: ${checkout.completedAt ? "Yes" : "No"}`,
            ""
          );
        }

        if (pageInfo?.hasNextPage) {
          lines.push(
            "",
            `*More checkouts available. Use after: "${pageInfo.endCursor}" to get next page.*`
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

  // ============================================
  // CUSTOMER SEGMENTS
  // ============================================

  server.registerTool(
    "shopify_list_customer_segments",
    {
      description:
        "List customer segments for targeted marketing. Segments group customers by behavior, purchase history, location, etc.",
      inputSchema: z.object({
        first: z.number().min(1).max(100).default(20).describe("Number of segments to retrieve"),
        after: z.string().optional().describe("Cursor for pagination"),
        format: ResponseFormatSchema,
      }),
    },
    async (args) => {
      const { first, after, format } = args;

      const data = await executeGraphQL<any>(CUSTOMER_SEGMENTS_QUERY, {
        first,
        after,
      });

      const segments = data.segments?.edges || [];
      const pageInfo = data.segments?.pageInfo;

      const output = {
        segments: segments.map((edge: any) => ({
          id: extractNumericId(edge.node.id),
          name: edge.node.name,
          query: edge.node.query,
          createdAt: edge.node.creationDate,
          lastEdited: edge.node.lastEditDate,
        })),
        pagination: {
          hasNextPage: pageInfo?.hasNextPage,
          endCursor: pageInfo?.endCursor,
        },
      };

      let textContent: string;
      if (format === "markdown") {
        const lines = [
          `# Customer Segments`,
          `Found ${segments.length} segments`,
          "",
        ];

        for (const segment of output.segments) {
          lines.push(
            `## ${segment.name}`,
            `- **ID**: ${segment.id}`,
            `- **Query**: \`${segment.query || "N/A"}\``,
            `- **Created**: ${segment.createdAt}`,
            `- **Last Edited**: ${segment.lastEdited}`,
            ""
          );
        }

        if (pageInfo?.hasNextPage) {
          lines.push(
            "",
            `*More segments available. Use after: "${pageInfo.endCursor}" to get next page.*`
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

  server.registerTool(
    "shopify_get_segment_members",
    {
      description:
        "Get customers belonging to a specific segment. Use for targeted marketing campaigns.",
      inputSchema: z.object({
        segment_id: ShopifyIdSchema.describe("Segment ID"),
        first: z.number().min(1).max(100).default(20).describe("Number of members to retrieve"),
        after: z.string().optional().describe("Cursor for pagination"),
        format: ResponseFormatSchema,
      }),
    },
    async (args) => {
      const { segment_id, first, after, format } = args;
      const segmentId = toGid("Segment", segment_id);

      const data = await executeGraphQL<any>(CUSTOMER_SEGMENT_MEMBERS_QUERY, {
        segmentId,
        first,
        after,
      });

      const members = data.customerSegmentMembers?.edges || [];
      const pageInfo = data.customerSegmentMembers?.pageInfo;

      const output = {
        members: members.map((edge: any) => ({
          id: extractNumericId(edge.node.id),
          name: `${edge.node.firstName || ""} ${edge.node.lastName || ""}`.trim(),
          email: edge.node.email,
          ordersCount: edge.node.ordersCount,
          totalSpent: edge.node.totalSpentV2
            ? formatMoney(
                edge.node.totalSpentV2.amount,
                edge.node.totalSpentV2.currencyCode
              )
            : null,
        })),
        pagination: {
          hasNextPage: pageInfo?.hasNextPage,
          endCursor: pageInfo?.endCursor,
        },
      };

      let textContent: string;
      if (format === "markdown") {
        const lines = [
          `# Segment Members`,
          `Found ${members.length} customers in segment`,
          "",
        ];

        for (const member of output.members) {
          lines.push(
            `### ${member.name || member.email || `Customer ${member.id}`}`,
            `- **ID**: ${member.id}`,
            `- **Email**: ${member.email || "N/A"}`,
            `- **Orders**: ${member.ordersCount}`,
            `- **Total Spent**: ${member.totalSpent || "N/A"}`,
            ""
          );
        }

        if (pageInfo?.hasNextPage) {
          lines.push(
            "",
            `*More members available. Use after: "${pageInfo.endCursor}" to get next page.*`
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

  // ============================================
  // SALES CHANNELS / PUBLICATIONS
  // ============================================

  server.registerTool(
    "shopify_list_sales_channels",
    {
      description:
        "List all sales channels (Online Store, Facebook, Instagram, Amazon, etc.) where products can be published.",
      inputSchema: z.object({
        format: ResponseFormatSchema,
      }),
    },
    async (args) => {
      const { format } = args;

      const data = await executeGraphQL<any>(PUBLICATIONS_QUERY, {
        first: 50,
      });

      const publications = data.publications?.edges || [];

      const output = {
        channels: publications.map((edge: any) => ({
          id: extractNumericId(edge.node.id),
          name: edge.node.name,
          app: edge.node.app?.title,
          supportsFuturePublishing: edge.node.supportsFuturePublishing,
        })),
      };

      let textContent: string;
      if (format === "markdown") {
        const lines = [
          `# Sales Channels`,
          `Found ${publications.length} sales channels`,
          "",
        ];

        for (const channel of output.channels) {
          lines.push(
            `## ${channel.name}`,
            `- **ID**: ${channel.id}`,
            `- **App**: ${channel.app || "N/A"}`,
            `- **Supports Scheduling**: ${channel.supportsFuturePublishing ? "Yes" : "No"}`,
            ""
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

  server.registerTool(
    "shopify_get_product_channels",
    {
      description:
        "Get which sales channels a product is published to (Online Store, Facebook, Instagram, etc.)",
      inputSchema: z.object({
        product_id: ShopifyIdSchema.describe("Product ID"),
        format: ResponseFormatSchema,
      }),
    },
    async (args) => {
      const { product_id, format } = args;
      const productId = toGid("Product", product_id);

      const data = await executeGraphQL<any>(PRODUCT_PUBLICATIONS_QUERY, {
        productId,
      });

      const product = data.product;
      const publications = product?.resourcePublicationsV2?.edges || [];

      const output = {
        productId: extractNumericId(product?.id),
        productTitle: product?.title,
        publications: publications.map((edge: any) => ({
          channel: edge.node.publication?.name,
          channelId: extractNumericId(edge.node.publication?.id),
          isPublished: edge.node.isPublished,
          publishDate: edge.node.publishDate,
        })),
      };

      let textContent: string;
      if (format === "markdown") {
        const lines = [
          `# Product Publications`,
          `**Product**: ${output.productTitle} (ID: ${output.productId})`,
          "",
          "## Sales Channels",
          "",
        ];

        for (const pub of output.publications) {
          const status = pub.isPublished ? "✅ Published" : "❌ Not Published";
          lines.push(`- **${pub.channel}**: ${status}`);
          if (pub.publishDate) {
            lines.push(`  - Publish Date: ${pub.publishDate}`);
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

  server.registerTool(
    "shopify_publish_product",
    {
      description:
        "Publish a product to one or more sales channels (Online Store, Facebook, Instagram, etc.)",
      inputSchema: z.object({
        product_id: ShopifyIdSchema.describe("Product ID"),
        publication_ids: z.array(z.string()).describe("Array of publication/channel IDs to publish to"),
        format: ResponseFormatSchema,
      }),
    },
    async (args) => {
      const { product_id, publication_ids, format } = args;
      const productId = toGid("Product", product_id);
      const publicationIds = publication_ids.map((id) => toGid("Publication", id));

      const input = publicationIds.map((pubId) => ({
        publicationId: pubId,
      }));

      const data = await executeGraphQL<any>(PUBLISH_PRODUCT_MUTATION, {
        id: productId,
        input,
      });

      const result = data.publishablePublish;
      const errors = result?.userErrors || [];

      if (errors.length > 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error publishing product:\n${errors
                .map((e: any) => `- ${e.field}: ${e.message}`)
                .join("\n")}`,
            },
          ],
        };
      }

      const output = {
        success: true,
        product: {
          id: extractNumericId(result.publishable?.id),
          title: result.publishable?.title,
        },
        publishedTo: publicationIds.length,
      };

      let textContent: string;
      if (format === "markdown") {
        textContent = [
          `# Product Published`,
          "",
          `**Product**: ${output.product.title} (ID: ${output.product.id})`,
          `**Published to**: ${output.publishedTo} channel(s)`,
        ].join("\n");
      } else {
        textContent = JSON.stringify(output, null, 2);
      }

      return {
        content: [{ type: "text" as const, text: textContent }],
      };
    }
  );

  server.registerTool(
    "shopify_unpublish_product",
    {
      description: "Remove a product from one or more sales channels",
      inputSchema: z.object({
        product_id: ShopifyIdSchema.describe("Product ID"),
        publication_ids: z.array(z.string()).describe("Array of publication/channel IDs to unpublish from"),
        format: ResponseFormatSchema,
      }),
    },
    async (args) => {
      const { product_id, publication_ids, format } = args;
      const productId = toGid("Product", product_id);
      const publicationIds = publication_ids.map((id) => toGid("Publication", id));

      const input = publicationIds.map((pubId) => ({
        publicationId: pubId,
      }));

      const data = await executeGraphQL<any>(UNPUBLISH_PRODUCT_MUTATION, {
        id: productId,
        input,
      });

      const result = data.publishableUnpublish;
      const errors = result?.userErrors || [];

      if (errors.length > 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error unpublishing product:\n${errors
                .map((e: any) => `- ${e.field}: ${e.message}`)
                .join("\n")}`,
            },
          ],
        };
      }

      const output = {
        success: true,
        product: {
          id: extractNumericId(result.publishable?.id),
          title: result.publishable?.title,
        },
        removedFrom: publicationIds.length,
      };

      let textContent: string;
      if (format === "markdown") {
        textContent = [
          `# Product Unpublished`,
          "",
          `**Product**: ${output.product.title} (ID: ${output.product.id})`,
          `**Removed from**: ${output.removedFrom} channel(s)`,
        ].join("\n");
      } else {
        textContent = JSON.stringify(output, null, 2);
      }

      return {
        content: [{ type: "text" as const, text: textContent }],
      };
    }
  );
}
