import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { executeGraphQL } from "../services/shopify-client.js";
import { ResponseFormatSchema } from "../schemas/common.js";

/**
 * Analytics and Forecasting Tools
 *
 * These tools provide insights into store performance and generate
 * data-driven projections for traffic, revenue, and conversions.
 */

// Query for shop analytics data
const SHOP_ANALYTICS_QUERY = `
  query getShopAnalytics {
    shop {
      name
      createdAt
      currencyCode
      billingAddress {
        country
      }
    }
  }
`;

// Get recent orders for analytics
const ORDERS_ANALYTICS_QUERY = `
  query getOrdersAnalytics($first: Int!, $query: String) {
    orders(first: $first, query: $query, sortKey: CREATED_AT, reverse: true) {
      nodes {
        id
        name
        createdAt
        totalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        lineItems(first: 50) {
          nodes {
            quantity
          }
        }
        customer {
          id
          ordersCount
        }
        sourceIdentifier
        landingPageUrl
        referrerUrl
      }
      pageInfo {
        hasNextPage
      }
    }
  }
`;

// Get customer acquisition data
const CUSTOMER_ACQUISITION_QUERY = `
  query getCustomerAcquisition($first: Int!, $query: String) {
    customers(first: $first, query: $query, sortKey: CREATED_AT, reverse: true) {
      nodes {
        id
        createdAt
        ordersCount
        totalSpent {
          amount
        }
      }
    }
  }
`;

// Input schemas
const StoreAnalyticsInputSchema = z.object({
  period_days: z.number().optional().describe("Analysis period in days (default: 30)"),
  compare_previous: z.boolean().optional().describe("Compare with previous period (default: true)"),
  response_format: ResponseFormatSchema,
}).strict();

const ForecastInputSchema = z.object({
  forecast_months: z.array(z.number()).optional().describe("Months to forecast (default: [1, 3, 6, 12])"),
  growth_scenario: z.enum(["conservative", "moderate", "aggressive"]).optional().describe("Growth scenario (default: moderate)"),
  include_seasonality: z.boolean().optional().describe("Account for seasonal patterns (default: true)"),
  response_format: ResponseFormatSchema,
}).strict();

const ConversionAnalysisInputSchema = z.object({
  period_days: z.number().optional().describe("Analysis period in days (default: 30)"),
  response_format: ResponseFormatSchema,
}).strict();

const ProductPerformanceInputSchema = z.object({
  period_days: z.number().optional().describe("Analysis period in days (default: 30)"),
  top_n: z.number().optional().describe("Number of top/bottom products to show (default: 10)"),
  response_format: ResponseFormatSchema,
}).strict();

export function registerAnalyticsTools(server: McpServer): void {
  // Current store traffic and performance
  server.registerTool(
    "shopify_store_analytics",
    {
      title: "Get Store Analytics",
      description: "Get current store performance metrics including orders, revenue, customers, and traffic indicators. Analyzes recent activity to provide insights.",
      inputSchema: StoreAnalyticsInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: z.infer<typeof StoreAnalyticsInputSchema>) => {
      const { period_days = 30, compare_previous = true, response_format = "markdown" } = params;
      const now = new Date();
      const periodStart = new Date(now.getTime() - period_days * 24 * 60 * 60 * 1000);
      const previousPeriodStart = new Date(periodStart.getTime() - period_days * 24 * 60 * 60 * 1000);

      // Get current period orders
      const currentQuery = `created_at:>=${periodStart.toISOString().split('T')[0]}`;
      const currentOrders = await executeGraphQL<any>(ORDERS_ANALYTICS_QUERY, {
        first: 250,
        query: currentQuery,
      });

      // Get previous period orders for comparison
      let previousOrders: any = null;
      if (compare_previous) {
        const previousQuery = `created_at:>=${previousPeriodStart.toISOString().split('T')[0]} created_at:<${periodStart.toISOString().split('T')[0]}`;
        previousOrders = await executeGraphQL<any>(ORDERS_ANALYTICS_QUERY, {
          first: 250,
          query: previousQuery,
        });
      }

      // Get new customers
      const newCustomersData = await executeGraphQL<any>(CUSTOMER_ACQUISITION_QUERY, {
        first: 250,
        query: `created_at:>=${periodStart.toISOString().split('T')[0]}`,
      });

      // Calculate current period metrics
      const orders = currentOrders.orders?.nodes || [];
      const totalRevenue = orders.reduce((sum: number, o: any) =>
        sum + parseFloat(o.totalPriceSet?.shopMoney?.amount || "0"), 0);
      const totalOrders = orders.length;
      const totalItems = orders.reduce((sum: number, o: any) =>
        sum + o.lineItems.nodes.reduce((s: number, li: any) => s + li.quantity, 0), 0);
      const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

      // Count unique customers
      const uniqueCustomers = new Set(orders.filter((o: any) => o.customer?.id).map((o: any) => o.customer.id)).size;

      // Count returning vs new customers
      const returningCustomers = orders.filter((o: any) => o.customer?.ordersCount > 1).length;
      const newCustomerOrders = totalOrders - returningCustomers;

      // Helper to safely extract hostname from a referrer URL
      const getReferrerHost = (url: string): string | null => {
        if (!url) return null;
        try {
          const parsed = new URL(url);
          return parsed.hostname.toLowerCase();
        } catch {
          return null;
        }
      };

      const matchesHost = (ref: string, targetHost: string): boolean => {
        const host = getReferrerHost(ref);
        const normalizedTarget = targetHost.toLowerCase();
        if (host) {
          const h = host.toLowerCase();
          return h === normalizedTarget || h.endsWith("." + normalizedTarget);
        }
        // Fallback to substring check if the referrer is not a valid URL
        return ref.toLowerCase().includes(normalizedTarget);
      };

      // Traffic source analysis (from referrer URLs)
      const trafficSources: Record<string, number> = {};
      for (const order of orders) {
        let source = "direct";
        const referrer = order.referrerUrl || order.landingPageUrl || "";

        if (referrer.includes("google")) source = "google";
        else if (referrer.includes("facebook") || referrer.includes("fb.")) source = "facebook";
        else if (referrer.includes("instagram")) source = "instagram";
        else if (
          matchesHost(referrer, "twitter.com") ||
          matchesHost(referrer, "t.co") ||
          matchesHost(referrer, "x.com")
        ) source = "twitter";
        else if (referrer.includes("tiktok")) source = "tiktok";
        else if (referrer.includes("email") || referrer.includes("klaviyo") || referrer.includes("mailchimp")) source = "email";
        else if (referrer.includes("pinterest")) source = "pinterest";
        else if (referrer && !referrer.includes(process.env.SHOPIFY_SHOP_DOMAIN || "")) source = "referral";

        trafficSources[source] = (trafficSources[source] || 0) + 1;
      }

      // Calculate previous period metrics for comparison
      let comparison: any = null;
      if (previousOrders) {
        const prevOrders = previousOrders.orders?.nodes || [];
        const prevRevenue = prevOrders.reduce((sum: number, o: any) =>
          sum + parseFloat(o.totalPriceSet?.shopMoney?.amount || "0"), 0);
        const prevOrderCount = prevOrders.length;

        comparison = {
          revenue_change: prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue * 100).toFixed(1) : "N/A",
          orders_change: prevOrderCount > 0 ? ((totalOrders - prevOrderCount) / prevOrderCount * 100).toFixed(1) : "N/A",
          prev_revenue: prevRevenue,
          prev_orders: prevOrderCount,
        };
      }

      // Calculate daily averages
      const dailyOrders = totalOrders / period_days;
      const dailyRevenue = totalRevenue / period_days;

      // Estimate conversion rate (orders / estimated sessions)
      // Using industry average of ~2-3% conversion, work backwards
      const estimatedSessions = Math.round(totalOrders / 0.025); // Assume 2.5% conversion
      const estimatedDailySessions = Math.round(estimatedSessions / period_days);

      const analytics = {
        period: {
          days: period_days,
          start: periodStart.toISOString().split('T')[0],
          end: now.toISOString().split('T')[0],
        },
        orders: {
          total: totalOrders,
          daily_average: dailyOrders.toFixed(1),
          items_sold: totalItems,
        },
        revenue: {
          total: totalRevenue.toFixed(2),
          daily_average: dailyRevenue.toFixed(2),
          average_order_value: avgOrderValue.toFixed(2),
        },
        customers: {
          unique_customers: uniqueCustomers,
          new_customer_orders: newCustomerOrders,
          returning_customer_orders: returningCustomers,
          new_customers_acquired: newCustomersData.customers?.nodes?.length || 0,
        },
        traffic: {
          estimated_sessions: estimatedSessions,
          estimated_daily_sessions: estimatedDailySessions,
          estimated_conversion_rate: "2.5%",
          sources: trafficSources,
        },
        comparison,
      };

      if (response_format === "json") {
        return { content: [{ type: "text", text: JSON.stringify(analytics, null, 2) }] };
      }

      let md = `# Store Analytics Report\n\n`;
      md += `**Period:** ${analytics.period.start} to ${analytics.period.end} (${period_days} days)\n\n`;

      md += `## 📈 Orders\n`;
      md += `- **Total Orders:** ${analytics.orders.total}`;
      if (comparison?.orders_change !== "N/A") {
        const change = parseFloat(comparison.orders_change);
        md += ` (${change >= 0 ? '↑' : '↓'} ${Math.abs(change)}% vs previous period)`;
      }
      md += `\n`;
      md += `- **Daily Average:** ${analytics.orders.daily_average} orders/day\n`;
      md += `- **Items Sold:** ${analytics.orders.items_sold}\n\n`;

      md += `## 💰 Revenue\n`;
      md += `- **Total Revenue:** $${analytics.revenue.total}`;
      if (comparison?.revenue_change !== "N/A") {
        const change = parseFloat(comparison.revenue_change);
        md += ` (${change >= 0 ? '↑' : '↓'} ${Math.abs(change)}% vs previous period)`;
      }
      md += `\n`;
      md += `- **Daily Average:** $${analytics.revenue.daily_average}/day\n`;
      md += `- **Average Order Value:** $${analytics.revenue.average_order_value}\n\n`;

      md += `## 👥 Customers\n`;
      md += `- **Unique Customers:** ${analytics.customers.unique_customers}\n`;
      md += `- **New Customer Orders:** ${analytics.customers.new_customer_orders}\n`;
      md += `- **Returning Customer Orders:** ${analytics.customers.returning_customer_orders}\n`;
      md += `- **New Customers Acquired:** ${analytics.customers.new_customers_acquired}\n\n`;

      md += `## 🌐 Traffic (Estimated)\n`;
      md += `- **Estimated Sessions:** ${analytics.traffic.estimated_sessions.toLocaleString()}\n`;
      md += `- **Daily Sessions:** ~${analytics.traffic.estimated_daily_sessions.toLocaleString()}/day\n`;
      md += `- **Conversion Rate:** ~${analytics.traffic.estimated_conversion_rate}\n\n`;

      md += `### Traffic Sources (by orders)\n`;
      const sortedSources = Object.entries(analytics.traffic.sources).sort((a, b) => b[1] - a[1]);
      for (const [source, count] of sortedSources) {
        const percentage = ((count / totalOrders) * 100).toFixed(1);
        md += `- **${source}:** ${count} orders (${percentage}%)\n`;
      }

      return { content: [{ type: "text", text: md }] };
    }
  );

  // Traffic and revenue forecasting
  server.registerTool(
    "shopify_forecast",
    {
      title: "Generate Forecast",
      description: "Generate traffic and revenue forecasts based on historical data and growth trends. Projects future performance at 1, 3, 6, and 12 month intervals.",
      inputSchema: ForecastInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: z.infer<typeof ForecastInputSchema>) => {
      const { forecast_months = [1, 3, 6, 12], growth_scenario = "moderate", include_seasonality = true, response_format = "markdown" } = params;
      // Get historical data for the past 90 days
      const now = new Date();
      const historicalStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

      const ordersData = await executeGraphQL<any>(ORDERS_ANALYTICS_QUERY, {
        first: 250,
        query: `created_at:>=${historicalStart.toISOString().split('T')[0]}`,
      });

      const orders = ordersData.orders?.nodes || [];

      // Calculate monthly metrics
      const monthlyData: Record<string, { orders: number; revenue: number }> = {};

      for (const order of orders) {
        const date = new Date(order.createdAt);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = { orders: 0, revenue: 0 };
        }

        monthlyData[monthKey].orders++;
        monthlyData[monthKey].revenue += parseFloat(order.totalPriceSet?.shopMoney?.amount || "0");
      }

      // Calculate averages and growth rate
      const months = Object.values(monthlyData);
      const avgMonthlyOrders = months.reduce((s, m) => s + m.orders, 0) / Math.max(months.length, 1);
      const avgMonthlyRevenue = months.reduce((s, m) => s + m.revenue, 0) / Math.max(months.length, 1);

      // Calculate month-over-month growth if we have enough data
      let momGrowth = 0;
      const sortedMonths = Object.entries(monthlyData).sort((a, b) => a[0].localeCompare(b[0]));
      if (sortedMonths.length >= 2) {
        const lastMonth = sortedMonths[sortedMonths.length - 1][1];
        const prevMonth = sortedMonths[sortedMonths.length - 2][1];
        momGrowth = prevMonth.revenue > 0 ? (lastMonth.revenue - prevMonth.revenue) / prevMonth.revenue : 0;
      }

      // Growth rate multipliers by scenario
      const growthMultipliers: Record<string, number> = {
        conservative: 0.02,  // 2% monthly growth
        moderate: 0.05,      // 5% monthly growth
        aggressive: 0.10,    // 10% monthly growth
      };

      // Use actual growth if available, otherwise use scenario
      const baseGrowthRate = momGrowth > 0 ? momGrowth : growthMultipliers[growth_scenario];

      // Seasonal adjustment factors (e-commerce typical patterns)
      const seasonalFactors: Record<number, number> = {
        1: 0.85,   // January - post-holiday slump
        2: 0.90,   // February
        3: 0.95,   // March
        4: 1.00,   // April
        5: 1.00,   // May
        6: 0.95,   // June
        7: 0.90,   // July
        8: 0.95,   // August - back to school
        9: 1.00,   // September
        10: 1.05,  // October
        11: 1.20,  // November - Black Friday
        12: 1.35,  // December - Holiday season
      };

      // Generate forecasts
      const forecasts = forecast_months.map(monthsAhead => {
        let projectedOrders = avgMonthlyOrders;
        let projectedRevenue = avgMonthlyRevenue;

        for (let i = 1; i <= monthsAhead; i++) {
          // Apply growth
          projectedOrders *= (1 + baseGrowthRate);
          projectedRevenue *= (1 + baseGrowthRate);

          // Apply seasonality if enabled
          if (include_seasonality) {
            const futureMonth = new Date(now.getTime() + i * 30 * 24 * 60 * 60 * 1000).getMonth() + 1;
            projectedOrders *= seasonalFactors[futureMonth];
            projectedRevenue *= seasonalFactors[futureMonth];
          }
        }

        // Estimate traffic based on projected orders (assume 2.5% conversion)
        const projectedSessions = Math.round(projectedOrders / 0.025);

        const forecastDate = new Date(now.getTime() + monthsAhead * 30 * 24 * 60 * 60 * 1000);

        return {
          months_ahead: monthsAhead,
          date: forecastDate.toISOString().split('T')[0],
          projected_monthly_orders: Math.round(projectedOrders),
          projected_monthly_revenue: projectedRevenue.toFixed(2),
          projected_monthly_sessions: projectedSessions,
          growth_from_current: (((projectedRevenue / avgMonthlyRevenue) - 1) * 100).toFixed(1),
        };
      });

      // Calculate confidence intervals
      const volatility = 0.15; // Assume 15% standard deviation
      const confidenceIntervals = forecasts.map(f => ({
        months_ahead: f.months_ahead,
        revenue_low: (parseFloat(f.projected_monthly_revenue) * (1 - volatility * Math.sqrt(f.months_ahead))).toFixed(2),
        revenue_high: (parseFloat(f.projected_monthly_revenue) * (1 + volatility * Math.sqrt(f.months_ahead))).toFixed(2),
      }));

      const result = {
        baseline: {
          avg_monthly_orders: Math.round(avgMonthlyOrders),
          avg_monthly_revenue: avgMonthlyRevenue.toFixed(2),
          observed_mom_growth: (momGrowth * 100).toFixed(1) + "%",
          applied_growth_rate: (baseGrowthRate * 100).toFixed(1) + "%",
        },
        scenario: growth_scenario,
        seasonality_applied: include_seasonality,
        forecasts,
        confidence_intervals: confidenceIntervals,
      };

      if (response_format === "json") {
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      let md = `# Store Forecast Report\n\n`;
      md += `**Scenario:** ${growth_scenario.charAt(0).toUpperCase() + growth_scenario.slice(1)}\n`;
      md += `**Seasonality:** ${include_seasonality ? 'Included' : 'Not included'}\n\n`;

      md += `## 📊 Baseline (Current Performance)\n`;
      md += `- **Avg Monthly Orders:** ${result.baseline.avg_monthly_orders}\n`;
      md += `- **Avg Monthly Revenue:** $${result.baseline.avg_monthly_revenue}\n`;
      md += `- **Observed Growth Rate:** ${result.baseline.observed_mom_growth}\n`;
      md += `- **Applied Growth Rate:** ${result.baseline.applied_growth_rate}/month\n\n`;

      md += `## 🔮 Forecasts\n\n`;

      for (let i = 0; i < forecasts.length; i++) {
        const f = forecasts[i];
        const ci = confidenceIntervals[i];

        md += `### ${f.months_ahead} Month${f.months_ahead > 1 ? 's' : ''} (${f.date})\n`;
        md += `- **Projected Revenue:** $${f.projected_monthly_revenue} (↑${f.growth_from_current}%)\n`;
        md += `- **Revenue Range:** $${ci.revenue_low} - $${ci.revenue_high}\n`;
        md += `- **Projected Orders:** ${f.projected_monthly_orders}/month\n`;
        md += `- **Projected Sessions:** ~${f.projected_monthly_sessions.toLocaleString()}/month\n\n`;
      }

      md += `## 📈 Annual Projection\n`;
      const yearForecast = forecasts.find(f => f.months_ahead === 12);
      if (yearForecast) {
        const annualRevenue = parseFloat(yearForecast.projected_monthly_revenue) * 12;
        md += `- **Projected Annual Revenue:** $${annualRevenue.toFixed(2)}\n`;
        md += `- **Projected Annual Orders:** ${yearForecast.projected_monthly_orders * 12}\n`;
      }

      md += `\n*Note: Forecasts are estimates based on historical trends and should be used for planning purposes only.*`;

      return { content: [{ type: "text", text: md }] };
    }
  );

  // Conversion funnel analysis
  server.registerTool(
    "shopify_conversion_analysis",
    {
      title: "Analyze Conversion Funnel",
      description: "Analyze conversion funnel performance including cart abandonment, checkout completion, and customer behavior patterns.",
      inputSchema: ConversionAnalysisInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: z.infer<typeof ConversionAnalysisInputSchema>) => {
      const { period_days = 30, response_format = "markdown" } = params;
      const now = new Date();
      const periodStart = new Date(now.getTime() - period_days * 24 * 60 * 60 * 1000);
      const query = `created_at:>=${periodStart.toISOString().split('T')[0]}`;

      // Get completed orders
      const ordersData = await executeGraphQL<any>(ORDERS_ANALYTICS_QUERY, {
        first: 250,
        query,
      });

      // Get abandoned checkouts
      const abandonedData = await executeGraphQL<any>(
        `query getAbandonedCheckouts($first: Int!, $query: String) {
          abandonedCheckouts(first: $first, query: $query) {
            nodes {
              id
              createdAt
              totalPriceSet {
                shopMoney { amount }
              }
              lineItemsQuantity
              customer {
                id
              }
            }
          }
        }`,
        { first: 250, query }
      );

      const orders = ordersData.orders?.nodes || [];
      const abandonedCheckouts = abandonedData.abandonedCheckouts?.nodes || [];

      // Calculate metrics
      const completedOrders = orders.length;
      const abandonedCarts = abandonedCheckouts.length;
      const totalCheckouts = completedOrders + abandonedCarts;

      const completedRevenue = orders.reduce((sum: number, o: any) =>
        sum + parseFloat(o.totalPriceSet?.shopMoney?.amount || "0"), 0);
      const abandonedRevenue = abandonedCheckouts.reduce((sum: number, c: any) =>
        sum + parseFloat(c.totalPriceSet?.shopMoney?.amount || "0"), 0);

      const completionRate = totalCheckouts > 0 ? (completedOrders / totalCheckouts * 100) : 0;
      const abandonmentRate = totalCheckouts > 0 ? (abandonedCarts / totalCheckouts * 100) : 0;

      // Analyze order values
      const avgCompletedValue = completedOrders > 0 ? completedRevenue / completedOrders : 0;
      const avgAbandonedValue = abandonedCarts > 0 ? abandonedRevenue / abandonedCarts : 0;

      // New vs returning customer analysis
      const newCustomerOrders = orders.filter((o: any) => o.customer?.ordersCount === 1).length;
      const returningCustomerOrders = orders.filter((o: any) => o.customer?.ordersCount > 1).length;

      // Estimate funnel stages (based on industry benchmarks)
      const estimatedVisitors = Math.round(totalCheckouts / 0.03); // ~3% reach checkout
      const estimatedAddToCarts = Math.round(totalCheckouts / 0.45); // ~45% of add-to-cart reach checkout

      const analysis = {
        period_days,
        funnel: {
          estimated_visitors: estimatedVisitors,
          estimated_add_to_cart: estimatedAddToCarts,
          reached_checkout: totalCheckouts,
          completed_purchase: completedOrders,
        },
        conversion_rates: {
          visitor_to_cart: "~8%", // Industry benchmark
          cart_to_checkout: "~45%", // Industry benchmark
          checkout_completion: completionRate.toFixed(1) + "%",
          overall: ((completedOrders / estimatedVisitors) * 100).toFixed(2) + "%",
        },
        abandonment: {
          abandoned_checkouts: abandonedCarts,
          abandonment_rate: abandonmentRate.toFixed(1) + "%",
          abandoned_revenue: abandonedRevenue.toFixed(2),
          avg_abandoned_value: avgAbandonedValue.toFixed(2),
          recovery_opportunity: abandonedRevenue.toFixed(2),
        },
        order_analysis: {
          completed_orders: completedOrders,
          completed_revenue: completedRevenue.toFixed(2),
          avg_order_value: avgCompletedValue.toFixed(2),
          new_customer_orders: newCustomerOrders,
          returning_customer_orders: returningCustomerOrders,
          returning_customer_rate: completedOrders > 0 ? ((returningCustomerOrders / completedOrders) * 100).toFixed(1) + "%" : "0%",
        },
      };

      if (response_format === "json") {
        return { content: [{ type: "text", text: JSON.stringify(analysis, null, 2) }] };
      }

      let md = `# Conversion Funnel Analysis\n\n`;
      md += `**Period:** Last ${period_days} days\n\n`;

      md += `## 📊 Funnel Overview\n\n`;
      md += `\`\`\`\n`;
      md += `Visitors (est.)     │ ${analysis.funnel.estimated_visitors.toLocaleString().padStart(8)}\n`;
      md += `        ↓ (~8%)     │\n`;
      md += `Add to Cart (est.)  │ ${analysis.funnel.estimated_add_to_cart.toLocaleString().padStart(8)}\n`;
      md += `        ↓ (~45%)    │\n`;
      md += `Reached Checkout    │ ${analysis.funnel.reached_checkout.toLocaleString().padStart(8)}\n`;
      md += `        ↓ (${analysis.conversion_rates.checkout_completion.padStart(5)}) │\n`;
      md += `Completed Purchase  │ ${analysis.funnel.completed_purchase.toLocaleString().padStart(8)}\n`;
      md += `\`\`\`\n\n`;

      md += `## 🛒 Cart Abandonment\n`;
      md += `- **Abandoned Checkouts:** ${analysis.abandonment.abandoned_checkouts}\n`;
      md += `- **Abandonment Rate:** ${analysis.abandonment.abandonment_rate}\n`;
      md += `- **Lost Revenue:** $${analysis.abandonment.abandoned_revenue}\n`;
      md += `- **Avg Abandoned Value:** $${analysis.abandonment.avg_abandoned_value}\n`;
      md += `- **💰 Recovery Opportunity:** $${analysis.abandonment.recovery_opportunity}\n\n`;

      md += `## ✅ Completed Orders\n`;
      md += `- **Total Orders:** ${analysis.order_analysis.completed_orders}\n`;
      md += `- **Total Revenue:** $${analysis.order_analysis.completed_revenue}\n`;
      md += `- **Avg Order Value:** $${analysis.order_analysis.avg_order_value}\n`;
      md += `- **New Customers:** ${analysis.order_analysis.new_customer_orders}\n`;
      md += `- **Returning Customers:** ${analysis.order_analysis.returning_customer_orders} (${analysis.order_analysis.returning_customer_rate})\n\n`;

      md += `## 💡 Recommendations\n`;
      if (parseFloat(analysis.abandonment.abandonment_rate) > 70) {
        md += `- **High abandonment rate** - Consider implementing cart recovery emails\n`;
      }
      if (avgAbandonedValue > avgCompletedValue) {
        md += `- **High-value carts being abandoned** - Review checkout friction for larger orders\n`;
      }
      if (parseFloat(analysis.order_analysis.returning_customer_rate) < 20) {
        md += `- **Low returning customer rate** - Focus on retention and loyalty programs\n`;
      }

      return { content: [{ type: "text", text: md }] };
    }
  );

  // Product performance analytics
  server.registerTool(
    "shopify_product_performance",
    {
      title: "Analyze Product Performance",
      description: "Analyze product performance including best sellers, underperformers, and inventory velocity to identify opportunities.",
      inputSchema: ProductPerformanceInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: z.infer<typeof ProductPerformanceInputSchema>) => {
      const { period_days = 30, top_n = 10, response_format = "markdown" } = params;
      const now = new Date();
      const periodStart = new Date(now.getTime() - period_days * 24 * 60 * 60 * 1000);

      // Get orders with line items
      const ordersData = await executeGraphQL<any>(
        `query getOrdersWithProducts($first: Int!, $query: String) {
          orders(first: $first, query: $query) {
            nodes {
              lineItems(first: 50) {
                nodes {
                  title
                  quantity
                  variant {
                    id
                    product {
                      id
                      title
                      totalInventory
                    }
                  }
                  originalTotalSet {
                    shopMoney { amount }
                  }
                }
              }
            }
          }
        }`,
        { first: 250, query: `created_at:>=${periodStart.toISOString().split('T')[0]}` }
      );

      // Aggregate product performance
      const productStats: Record<string, {
        title: string;
        units_sold: number;
        revenue: number;
        order_count: number;
        inventory: number;
      }> = {};

      const orders = ordersData.orders?.nodes || [];

      for (const order of orders) {
        for (const item of order.lineItems?.nodes || []) {
          const productId = item.variant?.product?.id || item.title;
          const productTitle = item.variant?.product?.title || item.title;

          if (!productStats[productId]) {
            productStats[productId] = {
              title: productTitle,
              units_sold: 0,
              revenue: 0,
              order_count: 0,
              inventory: item.variant?.product?.totalInventory || 0,
            };
          }

          productStats[productId].units_sold += item.quantity;
          productStats[productId].revenue += parseFloat(item.originalTotalSet?.shopMoney?.amount || "0");
          productStats[productId].order_count++;
        }
      }

      // Sort and categorize
      const products = Object.entries(productStats).map(([id, stats]) => ({
        id: id.replace("gid://shopify/Product/", ""),
        ...stats,
        avg_order_quantity: stats.units_sold / stats.order_count,
        revenue_per_unit: stats.revenue / stats.units_sold,
        velocity: stats.inventory > 0 ? stats.units_sold / stats.inventory : stats.units_sold,
      }));

      const byRevenue = [...products].sort((a, b) => b.revenue - a.revenue);
      const byUnits = [...products].sort((a, b) => b.units_sold - a.units_sold);
      const byVelocity = [...products].sort((a, b) => b.velocity - a.velocity);

      // Identify opportunities
      const lowInventoryHighVelocity = products
        .filter(p => p.inventory > 0 && p.inventory < 10 && p.velocity > 0.5)
        .slice(0, 5);

      const highInventoryLowVelocity = products
        .filter(p => p.inventory > 50 && p.velocity < 0.1)
        .slice(0, 5);

      const analysis = {
        period_days,
        summary: {
          total_products_sold: products.length,
          total_units_sold: products.reduce((s, p) => s + p.units_sold, 0),
          total_revenue: products.reduce((s, p) => s + p.revenue, 0).toFixed(2),
        },
        top_by_revenue: byRevenue.slice(0, top_n),
        top_by_units: byUnits.slice(0, top_n),
        fastest_moving: byVelocity.slice(0, top_n),
        opportunities: {
          restock_soon: lowInventoryHighVelocity,
          consider_promotion: highInventoryLowVelocity,
        },
      };

      if (response_format === "json") {
        return { content: [{ type: "text", text: JSON.stringify(analysis, null, 2) }] };
      }

      let md = `# Product Performance Report\n\n`;
      md += `**Period:** Last ${period_days} days\n\n`;

      md += `## 📊 Summary\n`;
      md += `- **Products Sold:** ${analysis.summary.total_products_sold}\n`;
      md += `- **Total Units:** ${analysis.summary.total_units_sold}\n`;
      md += `- **Total Revenue:** $${analysis.summary.total_revenue}\n\n`;

      md += `## 🏆 Top ${top_n} by Revenue\n\n`;
      for (let i = 0; i < Math.min(top_n, byRevenue.length); i++) {
        const p = byRevenue[i];
        md += `${i + 1}. **${p.title}** - $${p.revenue.toFixed(2)} (${p.units_sold} units)\n`;
      }

      md += `\n## 📦 Top ${top_n} by Units Sold\n\n`;
      for (let i = 0; i < Math.min(top_n, byUnits.length); i++) {
        const p = byUnits[i];
        md += `${i + 1}. **${p.title}** - ${p.units_sold} units ($${p.revenue.toFixed(2)})\n`;
      }

      md += `\n## ⚡ Fastest Moving (by velocity)\n\n`;
      for (let i = 0; i < Math.min(5, byVelocity.length); i++) {
        const p = byVelocity[i];
        md += `${i + 1}. **${p.title}** - ${p.velocity.toFixed(2)}x turnover (${p.inventory} in stock)\n`;
      }

      if (lowInventoryHighVelocity.length > 0) {
        md += `\n## ⚠️ Restock Alert\n`;
        md += `These products are selling fast with low inventory:\n\n`;
        for (const p of lowInventoryHighVelocity) {
          md += `- **${p.title}** - Only ${p.inventory} left, selling ${p.units_sold} in ${period_days} days\n`;
        }
      }

      if (highInventoryLowVelocity.length > 0) {
        md += `\n## 💡 Promotion Opportunities\n`;
        md += `These products have high inventory but slow sales:\n\n`;
        for (const p of highInventoryLowVelocity) {
          md += `- **${p.title}** - ${p.inventory} in stock, only ${p.units_sold} sold\n`;
        }
      }

      return { content: [{ type: "text", text: md }] };
    }
  );
}
