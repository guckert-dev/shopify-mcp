#!/usr/bin/env node
/**
 * Shopify MCP Server
 *
 * A Model Context Protocol (MCP) server for interacting with the Shopify Admin API.
 * Enables AI assistants to manage orders, products, customers, and inventory.
 *
 * Environment Variables Required:
 *   SHOPIFY_SHOP_DOMAIN - Your shop's myshopify.com domain (e.g., 'your-store.myshopify.com')
 *   SHOPIFY_ACCESS_TOKEN - Admin API access token with required scopes
 *
 * Optional Environment Variables:
 *   TRANSPORT - 'stdio' (default) or 'http' for streamable HTTP transport
 *   PORT - HTTP server port when using http transport (default: 3000)
 *
 * Required Shopify API Scopes:
 *   - read_orders, write_orders
 *   - read_products, write_products
 *   - read_customers, write_customers
 *   - read_inventory, write_inventory
 *   - read_locations
 *   - read_fulfillments, write_fulfillments
 *   - read_assigned_fulfillment_orders, write_assigned_fulfillment_orders
 *   - read_discounts, write_discounts
 *   - read_draft_orders, write_draft_orders
 *   - read_price_rules
 *   - read_product_listings
 *   - read_marketing_events
 *   - read_checkouts (abandoned checkouts)
 *   - read_customer_segments
 *   - read_publications
 *
 * Shopify Plus Additional Scopes:
 *   - read_gift_cards, write_gift_cards
 *   - read_companies, write_companies
 *   - read_price_lists
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";

// Import tool registration functions
import { registerShopTools } from "./tools/shop.js";
import { registerOrderTools } from "./tools/orders.js";
import { registerProductTools } from "./tools/products.js";
import { registerCustomerTools } from "./tools/customers.js";
import { registerInventoryTools } from "./tools/inventory.js";
import { registerFulfillmentTools } from "./tools/fulfillments.js";
import { registerDiscountTools } from "./tools/discounts.js";
import { registerDraftOrderTools } from "./tools/draft-orders.js";
import { registerRefundTools } from "./tools/refunds.js";
import { registerCollectionTools } from "./tools/collections.js";
import { registerWebhookTools } from "./tools/webhooks.js";
import { registerMarketingTools } from "./tools/marketing.js";
import { registerMetafieldTools } from "./tools/metafields.js";
import { registerGiftCardTools } from "./tools/gift-cards.js";
import { registerB2BTools } from "./tools/b2b.js";
import { registerBulkOperationTools } from "./tools/bulk-operations.js";
import { registerAutomationTools } from "./tools/automation.js";
import { registerSocialPostingTools } from "./tools/social-posting.js";
import { registerAnalyticsTools } from "./tools/analytics.js";

// Validate required environment variables
function validateEnvironment(): void {
  const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

  const errors: string[] = [];

  if (!shopDomain) {
    errors.push(
      "SHOPIFY_SHOP_DOMAIN is required. Set it to your shop's myshopify.com domain (e.g., 'your-store.myshopify.com')"
    );
  }

  if (!accessToken) {
    errors.push(
      "SHOPIFY_ACCESS_TOKEN is required. Generate one from your Shopify admin under Apps > Develop apps"
    );
  }

  if (errors.length > 0) {
    console.error("Configuration Error:");
    errors.forEach((e) => console.error(`  - ${e}`));
    console.error("\nFor more information, see: https://shopify.dev/docs/apps/auth/admin-app-access-tokens");
    process.exit(1);
  }
}

// Create and configure the MCP server
function createServer(): McpServer {
  const server = new McpServer({
    name: "Shopify",
    version: "1.0.0",
  });

  // Register all tools
  registerShopTools(server);
  registerOrderTools(server);
  registerProductTools(server);
  registerCustomerTools(server);
  registerInventoryTools(server);
  registerFulfillmentTools(server);
  registerDiscountTools(server);
  registerDraftOrderTools(server);
  registerRefundTools(server);
  registerCollectionTools(server);
  registerWebhookTools(server);
  registerMarketingTools(server);
  registerMetafieldTools(server);
  registerGiftCardTools(server);
  registerB2BTools(server);
  registerBulkOperationTools(server);
  registerAutomationTools(server);
  registerSocialPostingTools(server);
  registerAnalyticsTools(server);

  return server;
}

// Run server with stdio transport (for local/CLI usage)
async function runStdio(): Promise<void> {
  validateEnvironment();

  const server = createServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);
  console.error("Shopify MCP server running via stdio");
  console.error(`Connected to: ${process.env.SHOPIFY_SHOP_DOMAIN}`);
}

// Run server with HTTP transport (for remote/web usage)
async function runHTTP(): Promise<void> {
  validateEnvironment();

  const server = createServer();
  const app = express();
  app.use(express.json());

  // Health check endpoint
  app.get("/health", (_req, res) => {
    res.json({
      status: "healthy",
      server: "shopify-mcp-server",
      version: "1.0.0",
    });
  });

  // MCP endpoint
  app.post("/mcp", async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    res.on("close", () => transport.close());

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  const port = parseInt(process.env.PORT || "3000", 10);
  app.listen(port, () => {
    console.error(`Shopify MCP server running on http://localhost:${port}/mcp`);
    console.error(`Health check: http://localhost:${port}/health`);
    console.error(`Connected to: ${process.env.SHOPIFY_SHOP_DOMAIN}`);
  });
}

// Main entry point
const transport = process.env.TRANSPORT || "stdio";

if (transport === "http") {
  runHTTP().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
  });
} else {
  runStdio().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
  });
}
