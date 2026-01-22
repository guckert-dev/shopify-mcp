import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { executeGraphQL, toGid, formatMoney } from "../services/shopify-client.js";
import { ResponseFormatSchema } from "../schemas/common.js";

// Email marketing mutations
const EMAIL_MARKETING_CONSENT_UPDATE = `
  mutation customerEmailMarketingConsentUpdate($input: CustomerEmailMarketingConsentUpdateInput!) {
    customerEmailMarketingConsentUpdate(input: $input) {
      customer {
        id
        email
        emailMarketingConsent {
          marketingState
          consentUpdatedAt
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// Customer update for tags/notes
const CUSTOMER_UPDATE_MUTATION = `
  mutation customerUpdate($input: CustomerInput!) {
    customerUpdate(input: $input) {
      customer {
        id
        email
        tags
        note
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// Create price rule for automated discounts
const PRICE_RULE_CREATE = `
  mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
    discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
      codeDiscountNode {
        id
        codeDiscount {
          ... on DiscountCodeBasic {
            title
            codes(first: 1) {
              nodes {
                code
              }
            }
            startsAt
            endsAt
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export function registerAutomationTools(server: McpServer): void {
  // Create abandoned cart recovery campaign
  server.tool(
    "shopify_create_recovery_discount",
    "Create a personalized discount code for abandoned cart recovery. Generates unique codes for specific customers.",
    {
      checkout_id: z.string().optional().describe("Abandoned checkout ID"),
      customer_email: z.string().optional().describe("Customer email for personalized code"),
      discount_percent: z.number().optional().describe("Percentage discount (default: 10)"),
      discount_amount: z.string().optional().describe("Fixed discount amount"),
      minimum_purchase: z.string().optional().describe("Minimum purchase requirement"),
      expires_days: z.number().optional().describe("Days until expiration (default: 7)"),
      code_prefix: z.string().optional().describe("Prefix for generated code"),
      response_format: ResponseFormatSchema,
    },
    async ({ checkout_id, customer_email, discount_percent = 10, discount_amount, minimum_purchase, expires_days = 7, code_prefix = "COMEBACK", response_format = "markdown" }) => {
      // Generate unique code
      const uniqueCode = `${code_prefix}${Date.now().toString(36).toUpperCase()}`;

      const startsAt = new Date().toISOString();
      const endsAt = new Date(Date.now() + expires_days * 24 * 60 * 60 * 1000).toISOString();

      const input: any = {
        title: customer_email ? `Recovery - ${customer_email}` : `Cart Recovery ${uniqueCode}`,
        code: uniqueCode,
        startsAt,
        endsAt,
        usageLimit: 1, // Single use
        customerSelection: {
          all: true,
        },
        customerGets: {
          value: discount_amount
            ? { discountAmount: { amount: discount_amount, appliesOnEachItem: false } }
            : { percentage: discount_percent / 100 },
          items: { all: true },
        },
      };

      if (minimum_purchase) {
        input.minimumRequirement = {
          subtotal: { greaterThanOrEqualToSubtotal: minimum_purchase },
        };
      }

      try {
        const result = await executeGraphQL<any>(PRICE_RULE_CREATE, {
          basicCodeDiscount: input,
        });

        if (result.discountCodeBasicCreate?.userErrors?.length > 0) {
          return {
            content: [{
              type: "text",
              text: `Error creating discount: ${JSON.stringify(result.discountCodeBasicCreate.userErrors)}`,
            }],
          };
        }

        const discount = result.discountCodeBasicCreate?.codeDiscountNode?.codeDiscount;
        const code = discount?.codes?.nodes?.[0]?.code || uniqueCode;

        if (response_format === "json") {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                code,
                discount: discount_amount ? `$${discount_amount}` : `${discount_percent}%`,
                expires: endsAt,
                for_customer: customer_email,
                checkout_id,
              }, null, 2),
            }],
          };
        }

        let md = `# Recovery Discount Created\n\n`;
        md += `**Code:** \`${code}\`\n`;
        md += `**Discount:** ${discount_amount ? `$${discount_amount}` : `${discount_percent}%`} off\n`;
        if (minimum_purchase) md += `**Minimum Purchase:** $${minimum_purchase}\n`;
        md += `**Expires:** ${new Date(endsAt).toLocaleDateString()}\n`;
        md += `**Single Use:** Yes\n\n`;

        if (customer_email) {
          md += `## Suggested Recovery Email\n\n`;
          md += `> Subject: We saved your cart! Here's ${discount_amount ? `$${discount_amount}` : `${discount_percent}%`} off\n>\n`;
          md += `> Hi there,\n>\n`;
          md += `> We noticed you left some items in your cart. Use code **${code}** `;
          md += `to get ${discount_amount ? `$${discount_amount}` : `${discount_percent}%`} off your order!\n>\n`;
          md += `> This offer expires in ${expires_days} days.\n>\n`;
          md += `> [Complete Your Order]\n`;
        }

        return { content: [{ type: "text", text: md }] };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Error: ${error.message}` }] };
      }
    }
  );

  // Tag customers based on behavior
  server.tool(
    "shopify_auto_tag_customers",
    "Automatically tag customers based on purchase behavior, order history, or custom criteria.",
    {
      criteria: z.enum([
        "high_value",      // Total spent > threshold
        "repeat_buyer",    // Multiple orders
        "recent_buyer",    // Ordered in last 30 days
        "at_risk",         // No order in 60+ days
        "vip",             // High value + repeat
        "new_customer",    // Single order
      ]).describe("Tagging criteria"),
      threshold_amount: z.string().optional().describe("Amount threshold for high_value (default: 500)"),
      threshold_orders: z.number().optional().describe("Order count threshold for repeat_buyer (default: 3)"),
      custom_tag: z.string().optional().describe("Custom tag to apply (default: based on criteria)"),
      limit: z.number().optional().describe("Maximum customers to tag (default: 50)"),
      response_format: ResponseFormatSchema,
    },
    async ({ criteria, threshold_amount = "500", threshold_orders = 3, custom_tag, limit = 50, response_format = "markdown" }) => {
      // Build query based on criteria
      let query = "";
      let tag = custom_tag;

      switch (criteria) {
        case "high_value":
          query = `total_spent:>${threshold_amount}`;
          tag = tag || "high-value";
          break;
        case "repeat_buyer":
          query = `orders_count:>=${threshold_orders}`;
          tag = tag || "repeat-buyer";
          break;
        case "recent_buyer":
          const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          query = `last_order_date:>=${thirtyDaysAgo}`;
          tag = tag || "active";
          break;
        case "at_risk":
          const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          query = `last_order_date:<${sixtyDaysAgo} orders_count:>0`;
          tag = tag || "at-risk";
          break;
        case "vip":
          query = `total_spent:>${threshold_amount} orders_count:>=${threshold_orders}`;
          tag = tag || "vip";
          break;
        case "new_customer":
          query = `orders_count:1`;
          tag = tag || "new-customer";
          break;
      }

      // Find matching customers
      const customersData = await executeGraphQL<any>(
        `query findCustomers($first: Int!, $query: String) {
          customers(first: $first, query: $query) {
            nodes {
              id
              email
              firstName
              lastName
              tags
              ordersCount
              totalSpent {
                amount
                currencyCode
              }
            }
          }
        }`,
        { first: limit, query }
      );

      const customers = customersData.customers?.nodes || [];
      const results: any[] = [];

      for (const customer of customers) {
        // Skip if already tagged
        if (customer.tags.includes(tag)) {
          results.push({ email: customer.email, status: "already_tagged" });
          continue;
        }

        try {
          const newTags = [...customer.tags, tag];
          const updateResult = await executeGraphQL<any>(CUSTOMER_UPDATE_MUTATION, {
            input: {
              id: customer.id,
              tags: newTags,
            },
          });

          if (updateResult.customerUpdate?.userErrors?.length > 0) {
            results.push({ email: customer.email, status: "error", error: updateResult.customerUpdate.userErrors });
          } else {
            results.push({ email: customer.email, status: "tagged", tag });
          }
        } catch (error: any) {
          results.push({ email: customer.email, status: "error", error: error.message });
        }
      }

      if (response_format === "json") {
        return { content: [{ type: "text", text: JSON.stringify({ criteria, tag, results }, null, 2) }] };
      }

      const tagged = results.filter(r => r.status === "tagged").length;
      const alreadyTagged = results.filter(r => r.status === "already_tagged").length;
      const errors = results.filter(r => r.status === "error").length;

      let md = `# Auto-Tag Results\n\n`;
      md += `**Criteria:** ${criteria}\n`;
      md += `**Tag Applied:** \`${tag}\`\n`;
      md += `**Customers Found:** ${customers.length}\n\n`;
      md += `## Results\n`;
      md += `- ✅ Tagged: ${tagged}\n`;
      md += `- ⏭️ Already tagged: ${alreadyTagged}\n`;
      md += `- ❌ Errors: ${errors}\n`;

      return { content: [{ type: "text", text: md }] };
    }
  );

  // Analyze and segment customers
  server.tool(
    "shopify_segment_analysis",
    "Analyze customer segments and provide actionable insights for marketing campaigns.",
    {
      segment_type: z.enum([
        "rfm",           // Recency, Frequency, Monetary
        "lifecycle",     // New, Active, At-risk, Lapsed
        "value_tiers",   // High, Medium, Low value
        "engagement",    // Email engagement based
      ]).describe("Type of segmentation analysis"),
      response_format: ResponseFormatSchema,
    },
    async ({ segment_type, response_format = "markdown" }) => {
      // Get customer data for analysis
      const customersData = await executeGraphQL<any>(
        `query getCustomersForAnalysis {
          customers(first: 250) {
            nodes {
              id
              email
              createdAt
              ordersCount
              totalSpent {
                amount
              }
              lastOrder {
                createdAt
              }
              tags
              emailMarketingConsent {
                marketingState
              }
            }
          }
        }`,
        {}
      );

      const customers = customersData.customers?.nodes || [];
      const now = Date.now();

      // Calculate segments based on type
      const segments: Record<string, any[]> = {};

      for (const customer of customers) {
        const totalSpent = parseFloat(customer.totalSpent?.amount || "0");
        const orderCount = customer.ordersCount || 0;
        const lastOrderDate = customer.lastOrder?.createdAt ? new Date(customer.lastOrder.createdAt).getTime() : null;
        const daysSinceLastOrder = lastOrderDate ? Math.floor((now - lastOrderDate) / (24 * 60 * 60 * 1000)) : null;
        const createdDate = new Date(customer.createdAt).getTime();
        const daysSinceCreated = Math.floor((now - createdDate) / (24 * 60 * 60 * 1000));

        let segment = "unknown";

        switch (segment_type) {
          case "rfm":
            // Simple RFM scoring
            const recencyScore = daysSinceLastOrder === null ? 1 :
              daysSinceLastOrder < 30 ? 5 : daysSinceLastOrder < 60 ? 4 :
              daysSinceLastOrder < 90 ? 3 : daysSinceLastOrder < 180 ? 2 : 1;
            const frequencyScore = orderCount >= 10 ? 5 : orderCount >= 5 ? 4 :
              orderCount >= 3 ? 3 : orderCount >= 2 ? 2 : 1;
            const monetaryScore = totalSpent >= 1000 ? 5 : totalSpent >= 500 ? 4 :
              totalSpent >= 200 ? 3 : totalSpent >= 50 ? 2 : 1;

            const rfmScore = recencyScore + frequencyScore + monetaryScore;
            segment = rfmScore >= 12 ? "champions" : rfmScore >= 9 ? "loyal" :
              rfmScore >= 6 ? "potential" : rfmScore >= 3 ? "at_risk" : "hibernating";
            break;

          case "lifecycle":
            if (orderCount === 0) segment = "prospect";
            else if (orderCount === 1 && daysSinceCreated < 30) segment = "new";
            else if (daysSinceLastOrder !== null && daysSinceLastOrder < 60) segment = "active";
            else if (daysSinceLastOrder !== null && daysSinceLastOrder < 180) segment = "at_risk";
            else segment = "lapsed";
            break;

          case "value_tiers":
            if (totalSpent >= 500 && orderCount >= 3) segment = "high_value";
            else if (totalSpent >= 100 || orderCount >= 2) segment = "medium_value";
            else segment = "low_value";
            break;

          case "engagement":
            const marketingState = customer.emailMarketingConsent?.marketingState || "NOT_SUBSCRIBED";
            if (marketingState === "SUBSCRIBED") {
              segment = daysSinceLastOrder !== null && daysSinceLastOrder < 30 ? "engaged_active" :
                daysSinceLastOrder !== null && daysSinceLastOrder < 90 ? "engaged_dormant" : "subscribed_inactive";
            } else {
              segment = "not_subscribed";
            }
            break;
        }

        if (!segments[segment]) segments[segment] = [];
        segments[segment].push({
          email: customer.email,
          total_spent: totalSpent,
          orders: orderCount,
          days_since_order: daysSinceLastOrder,
        });
      }

      // Generate insights
      const insights: Record<string, string> = {
        champions: "Send exclusive offers, ask for reviews, consider loyalty program",
        loyal: "Upsell higher-value products, reward with early access",
        potential: "Nurture with targeted campaigns, build relationship",
        at_risk: "Send win-back campaigns, special discounts",
        hibernating: "Strong reactivation offers, remind of brand value",
        prospect: "Welcome series, first-purchase incentive",
        new: "Onboarding sequence, product education",
        active: "Cross-sell, build loyalty",
        lapsed: "Win-back campaign with compelling offer",
        high_value: "VIP treatment, exclusive access, personal outreach",
        medium_value: "Encourage next purchase, loyalty rewards",
        low_value: "Entry-level products, value propositions",
        engaged_active: "Your best audience - promote new products",
        engaged_dormant: "Re-engagement campaign needed",
        subscribed_inactive: "Update preferences, fresh content",
        not_subscribed: "Consider re-permission campaign",
      };

      if (response_format === "json") {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              segment_type,
              total_customers: customers.length,
              segments: Object.fromEntries(
                Object.entries(segments).map(([k, v]) => [k, {
                  count: v.length,
                  avg_spent: v.reduce((a, c) => a + c.total_spent, 0) / v.length,
                  insight: insights[k],
                }])
              ),
            }, null, 2),
          }],
        };
      }

      let md = `# Customer Segmentation Analysis\n\n`;
      md += `**Analysis Type:** ${segment_type.replace('_', ' ').toUpperCase()}\n`;
      md += `**Total Customers:** ${customers.length}\n\n`;

      md += `## Segments\n\n`;

      const sortedSegments = Object.entries(segments).sort((a, b) => b[1].length - a[1].length);

      for (const [segmentName, segmentCustomers] of sortedSegments) {
        const avgSpent = segmentCustomers.reduce((a, c) => a + c.total_spent, 0) / segmentCustomers.length;
        const percentage = ((segmentCustomers.length / customers.length) * 100).toFixed(1);

        md += `### ${segmentName.replace('_', ' ').toUpperCase()}\n`;
        md += `- **Count:** ${segmentCustomers.length} (${percentage}%)\n`;
        md += `- **Avg Spent:** $${avgSpent.toFixed(2)}\n`;
        md += `- **Recommended Action:** ${insights[segmentName] || "Analyze further"}\n\n`;
      }

      return { content: [{ type: "text", text: md }] };
    }
  );

  // Schedule flash sale
  server.tool(
    "shopify_create_flash_sale",
    "Create a time-limited flash sale with automatic start/end dates and discount codes.",
    {
      name: z.string().describe("Sale name (e.g., 'Weekend Flash Sale')"),
      collection_id: z.string().optional().describe("Apply to specific collection"),
      product_ids: z.array(z.string()).optional().describe("Apply to specific products"),
      discount_percent: z.number().describe("Discount percentage"),
      starts_in_hours: z.number().optional().describe("Hours until sale starts (default: 0)"),
      duration_hours: z.number().describe("Sale duration in hours"),
      usage_limit: z.number().optional().describe("Total usage limit"),
      response_format: ResponseFormatSchema,
    },
    async ({ name, collection_id, product_ids, discount_percent, starts_in_hours = 0, duration_hours, usage_limit, response_format = "markdown" }) => {
      const code = name.toUpperCase().replace(/\s+/g, '').substring(0, 10) + Math.random().toString(36).substring(2, 6).toUpperCase();

      const startsAt = new Date(Date.now() + starts_in_hours * 60 * 60 * 1000).toISOString();
      const endsAt = new Date(Date.now() + (starts_in_hours + duration_hours) * 60 * 60 * 1000).toISOString();

      const input: any = {
        title: name,
        code,
        startsAt,
        endsAt,
        customerSelection: { all: true },
        customerGets: {
          value: { percentage: discount_percent / 100 },
          items: collection_id
            ? { collections: { add: [toGid("Collection", collection_id)] } }
            : product_ids
              ? { products: { add: product_ids.map(id => toGid("Product", id)) } }
              : { all: true },
        },
      };

      if (usage_limit) {
        input.usageLimit = usage_limit;
      }

      try {
        const result = await executeGraphQL<any>(PRICE_RULE_CREATE, {
          basicCodeDiscount: input,
        });

        if (result.discountCodeBasicCreate?.userErrors?.length > 0) {
          return {
            content: [{
              type: "text",
              text: `Error creating flash sale: ${JSON.stringify(result.discountCodeBasicCreate.userErrors)}`,
            }],
          };
        }

        if (response_format === "json") {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                name,
                code,
                discount: `${discount_percent}%`,
                starts: startsAt,
                ends: endsAt,
                duration_hours,
              }, null, 2),
            }],
          };
        }

        let md = `# Flash Sale Created: ${name}\n\n`;
        md += `**Discount Code:** \`${code}\`\n`;
        md += `**Discount:** ${discount_percent}% off\n`;
        md += `**Starts:** ${new Date(startsAt).toLocaleString()}\n`;
        md += `**Ends:** ${new Date(endsAt).toLocaleString()}\n`;
        md += `**Duration:** ${duration_hours} hours\n`;
        if (usage_limit) md += `**Usage Limit:** ${usage_limit}\n`;
        md += `\n## Marketing Copy Suggestions\n\n`;
        md += `**Twitter:**\n\`\`\`\n⚡ FLASH SALE ⚡ ${discount_percent}% OFF for ${duration_hours} hours only! Use code ${code} at checkout. Don't miss it!\n\`\`\`\n\n`;
        md += `**Email Subject:**\n\`\`\`\n⏰ ${duration_hours}-Hour Flash Sale: ${discount_percent}% Off Everything!\n\`\`\`\n`;

        return { content: [{ type: "text", text: md }] };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Error: ${error.message}` }] };
      }
    }
  );

  // Update product status (publish/unpublish/archive)
  server.tool(
    "shopify_bulk_product_status",
    "Change status for multiple products at once (active, draft, archived).",
    {
      product_ids: z.array(z.string()).describe("Product IDs to update"),
      status: z.enum(["ACTIVE", "DRAFT", "ARCHIVED"]).describe("New status"),
      response_format: ResponseFormatSchema,
    },
    async ({ product_ids, status, response_format = "markdown" }) => {
      const results: any[] = [];

      for (const productId of product_ids) {
        try {
          const productGid = toGid("Product", productId);
          const result = await executeGraphQL<any>(
            `mutation updateProductStatus($input: ProductInput!) {
              productUpdate(input: $input) {
                product {
                  id
                  title
                  status
                }
                userErrors {
                  field
                  message
                }
              }
            }`,
            { input: { id: productGid, status } }
          );

          if (result.productUpdate?.userErrors?.length > 0) {
            results.push({ product_id: productId, error: result.productUpdate.userErrors });
          } else {
            results.push({
              product_id: productId,
              title: result.productUpdate?.product?.title,
              new_status: status,
              success: true,
            });
          }
        } catch (error: any) {
          results.push({ product_id: productId, error: error.message });
        }
      }

      if (response_format === "json") {
        return { content: [{ type: "text", text: JSON.stringify({ results }, null, 2) }] };
      }

      const successful = results.filter(r => r.success).length;
      let md = `# Bulk Status Update\n\n`;
      md += `**New Status:** ${status}\n`;
      md += `**Updated:** ${successful}/${results.length} products\n\n`;

      for (const result of results) {
        if (result.error) {
          md += `❌ ${result.product_id}: ${JSON.stringify(result.error)}\n`;
        } else {
          md += `✅ ${result.title} → ${result.new_status}\n`;
        }
      }

      return { content: [{ type: "text", text: md }] };
    }
  );
}
