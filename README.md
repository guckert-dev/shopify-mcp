<p align="center">
  <img src="public/icon.svg" width="80" height="80" alt="Shopify">
</p>

<h1 align="center">Shopify</h1>

<p align="center">
  <strong>Official MCP Connector for Shopify</strong><br>
  <a href="https://mcp.lemay.app">mcp.lemay.app</a>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#usage-examples">Usage</a> •
  <a href="#api-reference">API</a>
</p>

---

Connect Claude to your Shopify store. This [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) connector enables AI assistants to **manage and automate** your entire Shopify operation - not just view data, but take real actions like updating prices, running marketing campaigns, posting to social media, and more.

## 🚀 What Makes This Different

Unlike basic integrations that only read data, this server is built for **action**:

- **Bulk Operations** - Update prices, titles, descriptions across hundreds of products at once
- **AI-Powered Optimization** - Analyze pricing, generate optimized content, segment customers
- **Marketing Automation** - Create flash sales, recovery campaigns, auto-tag customers
- **Social Media Integration** - Generate campaign content and post via Claude in Chrome
- **Analytics & Forecasting** - Traffic analysis, revenue projections, conversion funnels
- **Complete Store Management** - 128 tools across 24 categories covering every aspect of Shopify operations

## Features

**128 tools** across 24 categories for complete Shopify store management:

### 🛒 Order Management
- **shopify_list_orders** - List and search orders with filtering by status, date, customer
- **shopify_get_order** - Get complete order details including line items, addresses, fulfillments
- **shopify_cancel_order** - Cancel orders with refund and restock options

### 📦 Product Management
- **shopify_list_products** - List and search products with filtering by status, vendor, tags
- **shopify_get_product** - Get complete product details with all variants and images
- **shopify_create_product** - Create new products with variants
- **shopify_update_product** - Update product information

### 👥 Customer Management
- **shopify_list_customers** - List and search customers with filtering
- **shopify_get_customer** - Get customer details with order history
- **shopify_search_customers** - Search by email, name, phone, or tag

### 📊 Inventory Management
- **shopify_list_inventory** - View inventory levels across all locations
- **shopify_list_locations** - List all inventory locations
- **shopify_adjust_inventory** - Add or remove inventory with tracking

### 🚚 Fulfillment Management
- **shopify_get_fulfillment_orders** - Get fulfillment orders for an order
- **shopify_create_fulfillment** - Create fulfillments to ship orders
- **shopify_update_tracking** - Update tracking information for fulfillments

### 🎫 Discount Codes
- **shopify_list_discounts** - List and search discount codes
- **shopify_create_discount** - Create percentage or fixed-amount discount codes
- **shopify_deactivate_discount** - Deactivate existing discount codes

### 📝 Draft Orders
- **shopify_list_draft_orders** - List draft orders (quotes/invoices)
- **shopify_get_draft_order** - Get draft order details
- **shopify_create_draft_order** - Create new draft orders
- **shopify_complete_draft_order** - Convert draft to real order
- **shopify_delete_draft_order** - Delete draft orders

### 💰 Refunds
- **shopify_get_refunds** - Get refund history for an order
- **shopify_create_refund** - Process refunds with inventory restock options

### 📁 Collections
- **shopify_list_collections** - List product collections
- **shopify_get_collection** - Get collection details with products
- **shopify_add_products_to_collection** - Add products to manual collections
- **shopify_remove_products_from_collection** - Remove products from collections

### 🔔 Webhooks
- **shopify_list_webhooks** - List webhook subscriptions
- **shopify_create_webhook** - Subscribe to store events
- **shopify_delete_webhook** - Remove webhook subscriptions

### 📣 Marketing & Omnichannel
- **shopify_list_marketing_activities** - View marketing campaigns and activities
- **shopify_list_abandoned_checkouts** - Find abandoned carts with customer info for recovery
- **shopify_list_customer_segments** - List customer segments for targeted marketing
- **shopify_get_segment_members** - Get customers in a specific segment
- **shopify_list_sales_channels** - View all connected sales channels
- **shopify_get_product_channels** - See which channels a product is published to
- **shopify_publish_product** - Publish products to sales channels
- **shopify_unpublish_product** - Remove products from sales channels

### 🏷️ Metafields (Custom Data)
- **shopify_get_metafields** - Read custom data on products, orders, customers, variants, collections
- **shopify_set_metafield** - Set custom metafield values
- **shopify_set_metafields_bulk** - Batch update multiple metafields

### 🎁 Gift Cards (Shopify Plus)
- **shopify_list_gift_cards** - List gift cards with balances and status
- **shopify_get_gift_card** - Get gift card details with transaction history
- **shopify_create_gift_card** - Create new gift cards
- **shopify_disable_gift_card** - Disable gift cards

### 🏢 B2B / Companies (Shopify Plus)
- **shopify_list_companies** - List B2B wholesale company accounts
- **shopify_get_company** - Get company details with contacts and locations
- **shopify_create_company** - Create new B2B company accounts
- **shopify_list_price_lists** - View wholesale price lists

### ⚡ Bulk Operations (NEW!)
- **shopify_bulk_update_prices** - Update prices for multiple products at once with percentage or fixed changes
- **shopify_bulk_update_content** - Update titles, descriptions, SEO for multiple products
- **shopify_collection_price_update** - Apply sale pricing to entire collections
- **shopify_analyze_pricing** - AI-powered pricing analysis with optimization suggestions
- **shopify_generate_social_content** - Generate ready-to-post content for Twitter, Facebook, Instagram

### 🤖 Marketing Automation (NEW!)
- **shopify_create_recovery_discount** - Create personalized abandoned cart recovery codes
- **shopify_auto_tag_customers** - Automatically tag customers based on behavior (VIP, at-risk, etc.)
- **shopify_segment_analysis** - RFM analysis, lifecycle segmentation, value tiers
- **shopify_create_flash_sale** - Create time-limited flash sales with auto-expiring codes
- **shopify_bulk_product_status** - Publish/unpublish/archive products in bulk

### 📱 Social Media Campaigns (NEW!)
- **shopify_prepare_social_campaign** - Generate complete multi-platform campaign packages
- **shopify_log_marketing_activity** - Track marketing activities for ROI analysis
- **shopify_marketing_performance** - Analyze marketing performance by channel

### 📈 Analytics & Forecasting (NEW!)
- **shopify_store_analytics** - Current store performance: orders, revenue, traffic sources, customer metrics
- **shopify_forecast** - Traffic and revenue projections at 1, 3, 6, and 12 month intervals with scenarios
- **shopify_conversion_analysis** - Conversion funnel analysis, cart abandonment rates, checkout completion
- **shopify_product_performance** - Best sellers, underperformers, inventory velocity, restock alerts

### 🏪 Shop Information
- **shopify_get_shop_info** - Get store details, plan, and configuration

## Installation

```bash
# Clone or copy the server
cd shopify-mcp-server

# Install dependencies
npm install

# Build the server
npm run build
```

## Configuration

### 1. Create a Shopify Custom App

1. Go to your Shopify Admin → Settings → Apps and sales channels
2. Click "Develop apps" → "Create an app"
3. Name your app (e.g., "MCP Integration")
4. Configure Admin API scopes (see full list below)
5. Install the app and copy the Admin API access token

### Required API Scopes

**Core Scopes:**
- `read_orders`, `write_orders`
- `read_products`, `write_products`
- `read_customers`, `write_customers`
- `read_inventory`, `write_inventory`
- `read_locations`
- `read_fulfillments`, `write_fulfillments`
- `read_assigned_fulfillment_orders`, `write_assigned_fulfillment_orders`
- `read_discounts`, `write_discounts`
- `read_draft_orders`, `write_draft_orders`
- `read_price_rules`
- `read_product_listings`
- `read_marketing_events`
- `read_checkouts` (abandoned checkouts)
- `read_customer_segments`
- `read_publications`

**Shopify Plus Additional Scopes:**
- `read_gift_cards`, `write_gift_cards`
- `read_companies`, `write_companies`
- `read_price_lists`

### 2. Set Environment Variables

```bash
export SHOPIFY_SHOP_DOMAIN="your-store.myshopify.com"
export SHOPIFY_ACCESS_TOKEN="shpat_xxxxxxxxxxxxx"
```

### 3. Add to Claude Desktop

Add to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "shopify": {
      "command": "node",
      "args": ["/path/to/shopify-mcp-server/dist/index.js"],
      "env": {
        "SHOPIFY_SHOP_DOMAIN": "your-store.myshopify.com",
        "SHOPIFY_ACCESS_TOKEN": "shpat_xxxxxxxxxxxxx"
      }
    }
  }
}
```

## Usage Examples

### 💰 Bulk Price Updates

```
"Increase prices by 10% for all products in the Summer Collection"

"Set compare-at prices to show the original prices, then discount everything 20%"

"Update prices for products 123, 456, and 789 to $29.99"
```

### 🎯 AI-Powered Optimization

```
"Analyze my product pricing and suggest optimizations"

"Generate SEO-optimized titles and descriptions for my top 10 products"

"Segment my customers by value and recommend marketing strategies"
```

### 📱 Social Media Marketing

```
"Generate a Twitter campaign for my new product launch with discount code LAUNCH20"

"Create Instagram posts for my entire Summer Sale collection"

"Prepare a complete social media campaign for a 24-hour flash sale"
```

### 🤖 Marketing Automation

```
"Create a 15% off recovery discount for customers who abandoned their carts"

"Tag all customers who spent over $500 as VIP"

"Set up a flash sale for the next 4 hours with code FLASH20"

"Find at-risk customers who haven't ordered in 60 days and create a win-back campaign"
```

### 🔄 Bulk Content Updates

```
"Update all product descriptions in the Electronics collection to mention free shipping"

"Add holiday tags to all products in the Gift collection"

"Archive all products that have been out of stock for over 30 days"
```

### 📈 Analytics & Forecasting

```
"What's my current store traffic and where is it coming from?"

"Forecast my revenue for the next 6 months"

"What's my projected traffic in one year if I maintain current growth?"

"Analyze my conversion funnel - where am I losing customers?"

"What are my best selling products and which ones need promotion?"

"Show me products that are running low on inventory but selling fast"
```

## 🌐 Using with Claude in Chrome

For social media posting, combine this MCP server with Claude in Chrome:

1. **Generate Content** - Use `shopify_prepare_social_campaign` to create posts
2. **Post via Browser** - Ask Claude to use Chrome to post the content

Example workflow:
```
You: "Generate a product launch campaign for product 12345, then post it to Twitter"

Claude:
1. Uses shopify_prepare_social_campaign to generate content
2. Uses Claude in Chrome to:
   - Navigate to twitter.com
   - Compose a new tweet
   - Paste the generated content
   - Upload the product image
   - Click Post
```

This hybrid approach gives you the power of Shopify's API for data and content generation, combined with browser automation for platforms that don't have APIs (or have restrictive APIs).

## API Reference

### Search Query Syntax

Many tools support Shopify's search query syntax:

**Orders:**
- `status:open` - Open orders
- `fulfillment_status:unfulfilled` - Unfulfilled orders
- `financial_status:paid` - Paid orders
- `created_at:>2024-01-01` - Orders after date
- `email:customer@example.com` - By customer email

**Products:**
- `status:active` - Active products
- `vendor:Nike` - By vendor
- `tag:sale` - By tag
- `inventory_total:>0` - In stock

**Customers:**
- `email:*@company.com` - By email domain
- `orders_count:>5` - By order count
- `total_spent:>100` - By lifetime value
- `tag:vip` - By tag

### Response Formats

All tools support two output formats:
- `markdown` (default) - Human-readable formatted text
- `json` - Structured data for programmatic processing

### Pagination

List operations support pagination:
- `first` - Number of results (1-100, default: 20)
- `after` - Cursor from previous response's `end_cursor`

## Development

```bash
# Run in development mode with auto-reload
npm run dev

# Build for production
npm run build

# Run built version
npm start
```

### HTTP Transport

For remote deployments, use HTTP transport:

```bash
TRANSPORT=http PORT=3000 npm start
```

The server exposes:
- `POST /mcp` - MCP endpoint
- `GET /health` - Health check

## Security Notes

- Store your access token securely - never commit it to version control
- Use environment variables or a secrets manager
- Request only the API scopes you need
- The access token provides full access to your store data

## Troubleshooting

### "Authentication failed"
- Verify your `SHOPIFY_ACCESS_TOKEN` is correct
- Check the token hasn't been revoked
- Ensure required scopes are granted

### "Resource not found"
- Verify the ID format (numeric or full GID)
- Check the resource exists in your store

### "Rate limit exceeded"
- Shopify allows ~2 requests/second
- Wait a moment and retry
- Use pagination to reduce request size

## License

MIT

## Links

- [Shopify Admin API Documentation](https://shopify.dev/docs/api/admin-graphql)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
