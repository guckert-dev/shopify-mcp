/**
 * Gift Card tools for Shopify MCP Server (Shopify Plus feature)
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
  GIFT_CARDS_QUERY,
  GIFT_CARD_DETAIL_QUERY,
  GIFT_CARD_CREATE_MUTATION,
  GIFT_CARD_DISABLE_MUTATION,
} from "../services/queries.js";
import { ResponseFormatSchema, ShopifyIdSchema } from "../schemas/common.js";

export function registerGiftCardTools(server: McpServer): void {
  server.registerTool(
    "shopify_list_gift_cards",
    {
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
      },
      description: "List gift cards in the store (Shopify Plus). Shows balance, status, and customer info.",
      inputSchema: z.object({
        query: z.string().optional().describe("Search query (e.g., 'enabled:true', 'balance:>0')"),
        first: z.number().min(1).max(100).default(20).describe("Number of gift cards to retrieve"),
        after: z.string().optional().describe("Cursor for pagination"),
        format: ResponseFormatSchema,
      }),
    },
    async (args) => {
      const { query, first, after, format } = args;

      const data = await executeGraphQL<any>(GIFT_CARDS_QUERY, { first, after, query });
      const giftCards = data.giftCards?.edges || [];
      const pageInfo = data.giftCards?.pageInfo;

      const output = {
        giftCards: giftCards.map((edge: any) => ({
          id: extractNumericId(edge.node.id),
          lastCharacters: edge.node.lastCharacters,
          balance: edge.node.balance ? formatMoney(edge.node.balance.amount, edge.node.balance.currencyCode) : null,
          initialValue: edge.node.initialValue ? formatMoney(edge.node.initialValue.amount, edge.node.initialValue.currencyCode) : null,
          enabled: edge.node.enabled,
          expiresOn: edge.node.expiresOn,
          customer: edge.node.customer ? {
            id: extractNumericId(edge.node.customer.id),
            name: `${edge.node.customer.firstName || ""} ${edge.node.customer.lastName || ""}`.trim(),
            email: edge.node.customer.email,
          } : null,
          createdAt: edge.node.createdAt,
        })),
        pagination: { hasNextPage: pageInfo?.hasNextPage, endCursor: pageInfo?.endCursor },
      };

      let textContent: string;
      if (format === "markdown") {
        const lines = [`# Gift Cards`, `Found ${giftCards.length} gift cards`, ""];
        for (const gc of output.giftCards) {
          const status = gc.enabled ? "✅ Active" : "❌ Disabled";
          lines.push(`## Gift Card ****${gc.lastCharacters}`, `- **ID**: ${gc.id}`, `- **Status**: ${status}`, `- **Balance**: ${gc.balance}`, `- **Initial Value**: ${gc.initialValue}`);
          if (gc.expiresOn) lines.push(`- **Expires**: ${gc.expiresOn}`);
          if (gc.customer) lines.push(`- **Customer**: ${gc.customer.name || gc.customer.email}`);
          lines.push(`- **Created**: ${gc.createdAt}`, "");
        }
        if (pageInfo?.hasNextPage) lines.push("", `*More gift cards available. Use after: "${pageInfo.endCursor}"*`);
        textContent = lines.join("\n");
      } else {
        textContent = JSON.stringify(output, null, 2);
      }

      return { content: [{ type: "text" as const, text: textContent }] };
    }
  );

  server.registerTool(
    "shopify_get_gift_card",
    {
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
      },
      description: "Get detailed gift card information including transaction history (Shopify Plus).",
      inputSchema: z.object({
        gift_card_id: ShopifyIdSchema.describe("Gift card ID"),
        format: ResponseFormatSchema,
      }),
    },
    async (args) => {
      const { gift_card_id, format } = args;
      const giftCardId = toGid("GiftCard", gift_card_id);

      const data = await executeGraphQL<any>(GIFT_CARD_DETAIL_QUERY, { id: giftCardId });
      const gc = data.giftCard;

      if (!gc) {
        return { content: [{ type: "text" as const, text: "Gift card not found." }] };
      }

      const output = {
        id: extractNumericId(gc.id),
        lastCharacters: gc.lastCharacters,
        balance: gc.balance ? formatMoney(gc.balance.amount, gc.balance.currencyCode) : null,
        initialValue: gc.initialValue ? formatMoney(gc.initialValue.amount, gc.initialValue.currencyCode) : null,
        enabled: gc.enabled,
        expiresOn: gc.expiresOn,
        customer: gc.customer ? { id: extractNumericId(gc.customer.id), name: `${gc.customer.firstName || ""} ${gc.customer.lastName || ""}`.trim(), email: gc.customer.email } : null,
        order: gc.order ? { id: extractNumericId(gc.order.id), name: gc.order.name } : null,
        transactions: gc.transactions?.edges?.map((edge: any) => ({ id: extractNumericId(edge.node.id), amount: edge.node.amount ? formatMoney(edge.node.amount.amount, edge.node.amount.currencyCode) : null, processedAt: edge.node.processedAt })),
        createdAt: gc.createdAt,
      };

      let textContent: string;
      if (format === "markdown") {
        const status = output.enabled ? "✅ Active" : "❌ Disabled";
        const lines = [`# Gift Card ****${output.lastCharacters}`, "", `**ID**: ${output.id}`, `**Status**: ${status}`, `**Balance**: ${output.balance}`, `**Initial Value**: ${output.initialValue}`];
        if (output.expiresOn) lines.push(`**Expires**: ${output.expiresOn}`);
        if (output.customer) lines.push(`**Customer**: ${output.customer.name || output.customer.email}`);
        if (output.order) lines.push(`**Purchased in Order**: ${output.order.name}`);
        if (output.transactions && output.transactions.length > 0) {
          lines.push("", "## Transaction History", "");
          for (const tx of output.transactions) lines.push(`- ${tx.processedAt}: ${tx.amount}`);
        }
        textContent = lines.join("\n");
      } else {
        textContent = JSON.stringify(output, null, 2);
      }

      return { content: [{ type: "text" as const, text: textContent }] };
    }
  );

  server.registerTool(
    "shopify_create_gift_card",
    {
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
      },
      description: "Create a new gift card (Shopify Plus). Returns the gift card code.",
      inputSchema: z.object({
        initial_value: z.number().describe("Gift card value in store currency"),
        customer_id: z.string().optional().describe("Customer ID to associate"),
        note: z.string().optional().describe("Internal note"),
        expires_on: z.string().optional().describe("Expiration date (YYYY-MM-DD)"),
        format: ResponseFormatSchema,
      }),
    },
    async (args) => {
      const { initial_value, customer_id, note, expires_on, format } = args;

      const input: Record<string, unknown> = { initialValue: initial_value.toString() };
      if (customer_id) input.customerId = toGid("Customer", customer_id);
      if (note) input.note = note;
      if (expires_on) input.expiresOn = expires_on;

      const data = await executeGraphQL<any>(GIFT_CARD_CREATE_MUTATION, { input });
      const result = data.giftCardCreate;
      const errors = result?.userErrors || [];

      if (errors.length > 0) {
        return { content: [{ type: "text" as const, text: `Error creating gift card:\n${errors.map((e: any) => `- ${e.field}: ${e.message}`).join("\n")}` }] };
      }

      const gc = result?.giftCard;
      const giftCardCode = result?.giftCardCode;

      const output = { success: true, giftCardCode, giftCard: gc ? { id: extractNumericId(gc.id), maskedCode: gc.maskedCode, balance: gc.balance ? formatMoney(gc.balance.amount, gc.balance.currencyCode) : null, enabled: gc.enabled } : null };

      let textContent: string;
      if (format === "markdown") {
        textContent = [`# Gift Card Created Successfully`, "", `⚠️ **IMPORTANT: Save this code - it will not be shown again!**`, "", `## Gift Card Code: \`${output.giftCardCode}\``, "", `- **ID**: ${output.giftCard?.id}`, `- **Value**: ${output.giftCard?.balance}`].join("\n");
      } else {
        textContent = JSON.stringify(output, null, 2);
      }

      return { content: [{ type: "text" as const, text: textContent }] };
    }
  );

  server.registerTool(
    "shopify_disable_gift_card",
    {
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
      },
      description: "Disable a gift card (Shopify Plus). Disabled gift cards cannot be used.",
      inputSchema: z.object({
        gift_card_id: ShopifyIdSchema.describe("Gift card ID"),
        format: ResponseFormatSchema,
      }),
    },
    async (args) => {
      const { gift_card_id, format } = args;
      const giftCardId = toGid("GiftCard", gift_card_id);

      const data = await executeGraphQL<any>(GIFT_CARD_DISABLE_MUTATION, { id: giftCardId });
      const result = data.giftCardDisable;
      const errors = result?.userErrors || [];

      if (errors.length > 0) {
        return { content: [{ type: "text" as const, text: `Error disabling gift card:\n${errors.map((e: any) => `- ${e.field}: ${e.message}`).join("\n")}` }] };
      }

      const gc = result?.giftCard;
      const output = { success: true, giftCard: gc ? { id: extractNumericId(gc.id), enabled: gc.enabled } : null };

      let textContent: string;
      if (format === "markdown") {
        textContent = [`# Gift Card Disabled`, "", `**Gift Card ID**: ${output.giftCard?.id}`, `**Status**: Disabled`, "", "*This gift card can no longer be used.*"].join("\n");
      } else {
        textContent = JSON.stringify(output, null, 2);
      }

      return { content: [{ type: "text" as const, text: textContent }] };
    }
  );
}
