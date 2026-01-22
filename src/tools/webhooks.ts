/**
 * Webhook management tools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  executeGraphQL,
  handleApiError,
  formatDate,
  toGid,
  extractNumericId,
} from "../services/shopify-client.js";
import {
  WEBHOOKS_QUERY,
  WEBHOOK_CREATE_MUTATION,
  WEBHOOK_DELETE_MUTATION,
} from "../services/queries.js";
import { ResponseFormat } from "../constants.js";
import { ResponseFormatSchema, PaginationSchema, ShopifyIdSchema } from "../schemas/common.js";
import { PageInfo } from "../types.js";

// ============================================
// TYPES
// ============================================

interface WebhookSubscription {
  id: string;
  topic: string;
  endpoint: {
    callbackUrl: string;
  };
  format: string;
  createdAt: string;
  updatedAt: string;
}

interface WebhooksResponse {
  webhookSubscriptions: {
    edges: Array<{ node: WebhookSubscription; cursor: string }>;
    pageInfo: PageInfo;
  };
}

// Common webhook topics
const WEBHOOK_TOPICS = [
  "APP_UNINSTALLED",
  "BULK_OPERATIONS_FINISH",
  "CARTS_CREATE",
  "CARTS_UPDATE",
  "CHECKOUTS_CREATE",
  "CHECKOUTS_DELETE",
  "CHECKOUTS_UPDATE",
  "COLLECTIONS_CREATE",
  "COLLECTIONS_DELETE",
  "COLLECTIONS_UPDATE",
  "CUSTOMERS_CREATE",
  "CUSTOMERS_DELETE",
  "CUSTOMERS_DISABLE",
  "CUSTOMERS_ENABLE",
  "CUSTOMERS_UPDATE",
  "DRAFT_ORDERS_CREATE",
  "DRAFT_ORDERS_DELETE",
  "DRAFT_ORDERS_UPDATE",
  "FULFILLMENTS_CREATE",
  "FULFILLMENTS_UPDATE",
  "INVENTORY_ITEMS_CREATE",
  "INVENTORY_ITEMS_DELETE",
  "INVENTORY_ITEMS_UPDATE",
  "INVENTORY_LEVELS_CONNECT",
  "INVENTORY_LEVELS_DISCONNECT",
  "INVENTORY_LEVELS_UPDATE",
  "ORDERS_CANCELLED",
  "ORDERS_CREATE",
  "ORDERS_DELETE",
  "ORDERS_EDITED",
  "ORDERS_FULFILLED",
  "ORDERS_PAID",
  "ORDERS_PARTIALLY_FULFILLED",
  "ORDERS_UPDATED",
  "PRODUCTS_CREATE",
  "PRODUCTS_DELETE",
  "PRODUCTS_UPDATE",
  "REFUNDS_CREATE",
  "SHOP_UPDATE",
] as const;

// ============================================
// SCHEMAS
// ============================================

const ListWebhooksInputSchema = z
  .object({
    response_format: ResponseFormatSchema,
  })
  .merge(PaginationSchema)
  .strict();

type ListWebhooksInput = z.infer<typeof ListWebhooksInputSchema>;

const CreateWebhookInputSchema = z.object({
  topic: z
    .enum(WEBHOOK_TOPICS)
    .describe("Webhook topic/event to subscribe to"),
  callback_url: z
    .string()
    .url()
    .describe("HTTPS URL to receive webhook POST requests"),
  format: z
    .enum(["JSON", "XML"])
    .default("JSON")
    .describe("Webhook payload format (default: JSON)"),
}).strict();

type CreateWebhookInput = z.infer<typeof CreateWebhookInputSchema>;

const DeleteWebhookInputSchema = z.object({
  id: ShopifyIdSchema.describe("Webhook subscription ID to delete"),
}).strict();

type DeleteWebhookInput = z.infer<typeof DeleteWebhookInputSchema>;

// ============================================
// REGISTER TOOLS
// ============================================

export function registerWebhookTools(server: McpServer): void {
  // LIST WEBHOOKS
  server.registerTool(
    "shopify_list_webhooks",
    {
      title: "List Webhook Subscriptions",
      description: `List all webhook subscriptions for the store.

Webhooks notify external systems when events occur in your store.

Args:
  - first (number): Results to return (1-100, default: 20)
  - after (string, optional): Pagination cursor
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  List of webhooks with: topic, callback URL, format, dates

Examples:
  - "Show all webhooks" -> no filters
  - "What webhooks are configured?" -> no filters`,
      inputSchema: ListWebhooksInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: ListWebhooksInput) => {
      try {
        const variables = {
          first: params.first,
          after: params.after || null,
        };

        const data = await executeGraphQL<WebhooksResponse>(WEBHOOKS_QUERY, variables);
        const webhooks = data.webhookSubscriptions.edges.map((e) => e.node);
        const pageInfo = data.webhookSubscriptions.pageInfo;

        if (webhooks.length === 0) {
          return {
            content: [{ type: "text", text: "No webhook subscriptions found." }],
          };
        }

        const output = {
          total_returned: webhooks.length,
          webhooks: webhooks.map((wh) => ({
            id: extractNumericId(wh.id),
            gid: wh.id,
            topic: wh.topic,
            callback_url: wh.endpoint?.callbackUrl,
            format: wh.format,
            created_at: wh.createdAt,
            updated_at: wh.updatedAt,
          })),
          pagination: {
            has_next_page: pageInfo.hasNextPage,
            end_cursor: pageInfo.endCursor,
          },
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          const lines = [
            `# Webhook Subscriptions (${webhooks.length} total)`,
            "",
            ...webhooks.map((wh) =>
              [
                `## ${wh.topic}`,
                `- **ID**: ${extractNumericId(wh.id)}`,
                `- **URL**: ${wh.endpoint?.callbackUrl || "N/A"}`,
                `- **Format**: ${wh.format}`,
                `- **Created**: ${formatDate(wh.createdAt)}`,
              ].join("\n")
            ),
            "",
            "---",
            pageInfo.hasNextPage
              ? `*More webhooks available.*`
              : "*No more webhooks.*",
          ];
          textContent = lines.join("\n\n");
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

  // CREATE WEBHOOK
  server.registerTool(
    "shopify_create_webhook",
    {
      title: "Create Webhook Subscription",
      description: `Create a new webhook subscription to receive event notifications.

Common topics include:
- ORDERS_CREATE, ORDERS_PAID, ORDERS_FULFILLED, ORDERS_CANCELLED
- PRODUCTS_CREATE, PRODUCTS_UPDATE, PRODUCTS_DELETE
- CUSTOMERS_CREATE, CUSTOMERS_UPDATE
- INVENTORY_LEVELS_UPDATE
- REFUNDS_CREATE

Args:
  - topic (string, required): Event topic to subscribe to
  - callback_url (string, required): HTTPS URL to receive webhooks
  - format ('JSON' | 'XML'): Payload format (default: JSON)

Returns:
  Created webhook subscription details

Examples:
  - "Notify me when orders are created" ->
    topic: "ORDERS_CREATE", callback_url: "https://myapp.com/webhooks/orders"
  - "Subscribe to inventory changes" ->
    topic: "INVENTORY_LEVELS_UPDATE", callback_url: "https://myapp.com/webhooks/inventory"`,
      inputSchema: CreateWebhookInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params: CreateWebhookInput) => {
      try {
        const data = await executeGraphQL<{
          webhookSubscriptionCreate: {
            webhookSubscription: {
              id: string;
              topic: string;
              endpoint: { callbackUrl: string };
              format: string;
            } | null;
            userErrors: Array<{ field: string[]; message: string }>;
          };
        }>(WEBHOOK_CREATE_MUTATION, {
          topic: params.topic,
          webhookSubscription: {
            callbackUrl: params.callback_url,
            format: params.format,
          },
        });

        if (data.webhookSubscriptionCreate.userErrors?.length > 0) {
          const errors = data.webhookSubscriptionCreate.userErrors.map((e) => e.message).join("; ");
          return {
            content: [{ type: "text", text: `Error creating webhook: ${errors}` }],
            isError: true,
          };
        }

        const webhook = data.webhookSubscriptionCreate.webhookSubscription;
        if (!webhook) {
          return {
            content: [{ type: "text", text: "Error: Webhook creation returned no data." }],
            isError: true,
          };
        }

        const output = {
          success: true,
          webhook: {
            id: extractNumericId(webhook.id),
            gid: webhook.id,
            topic: webhook.topic,
            callback_url: webhook.endpoint?.callbackUrl,
            format: webhook.format,
          },
        };

        return {
          content: [
            {
              type: "text",
              text: `Webhook created successfully!\n\n- **Topic**: ${webhook.topic}\n- **URL**: ${webhook.endpoint?.callbackUrl}\n- **Format**: ${webhook.format}\n- **ID**: ${extractNumericId(webhook.id)}`,
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

  // DELETE WEBHOOK
  server.registerTool(
    "shopify_delete_webhook",
    {
      title: "Delete Webhook Subscription",
      description: `Delete a webhook subscription.

Args:
  - id (string, required): Webhook subscription ID to delete

Returns:
  Confirmation of deletion

Examples:
  - "Delete webhook 123" -> id: "123"
  - "Remove the orders webhook" -> First list webhooks to find ID, then delete`,
      inputSchema: DeleteWebhookInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params: DeleteWebhookInput) => {
      try {
        const webhookId = toGid("WebhookSubscription", params.id);

        const data = await executeGraphQL<{
          webhookSubscriptionDelete: {
            deletedWebhookSubscriptionId: string | null;
            userErrors: Array<{ field: string[]; message: string }>;
          };
        }>(WEBHOOK_DELETE_MUTATION, { id: webhookId });

        if (data.webhookSubscriptionDelete.userErrors?.length > 0) {
          const errors = data.webhookSubscriptionDelete.userErrors.map((e) => e.message).join("; ");
          return {
            content: [{ type: "text", text: `Error deleting webhook: ${errors}` }],
            isError: true,
          };
        }

        const output = {
          success: true,
          deleted_id: params.id,
        };

        return {
          content: [{ type: "text", text: `Webhook ${params.id} deleted successfully.` }],
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
