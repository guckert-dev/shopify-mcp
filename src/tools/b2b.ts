/**
 * B2B / Company tools for Shopify MCP Server (Shopify Plus)
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
  COMPANIES_QUERY,
  COMPANY_DETAIL_QUERY,
  COMPANY_CREATE_MUTATION,
  PRICE_LISTS_QUERY,
} from "../services/queries.js";
import { ResponseFormatSchema, ShopifyIdSchema } from "../schemas/common.js";

export function registerB2BTools(server: McpServer): void {
  server.registerTool(
    "shopify_list_companies",
    {
      description: "List B2B companies (Shopify Plus). Companies represent wholesale/business customers.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
      },
      inputSchema: z.object({
        query: z.string().optional().describe("Search query to filter companies"),
        first: z.number().min(1).max(100).default(20).describe("Number of companies to retrieve"),
        after: z.string().optional().describe("Cursor for pagination"),
        format: ResponseFormatSchema,
      }),
    },
    async (args) => {
      const { query, first, after, format } = args;

      const data = await executeGraphQL<any>(COMPANIES_QUERY, { first, after, query });
      const companies = data.companies?.edges || [];
      const pageInfo = data.companies?.pageInfo;

      const output = {
        companies: companies.map((edge: any) => ({
          id: extractNumericId(edge.node.id),
          name: edge.node.name,
          externalId: edge.node.externalId,
          mainContact: edge.node.mainContact?.customer ? {
            id: extractNumericId(edge.node.mainContact.customer.id),
            name: `${edge.node.mainContact.customer.firstName || ""} ${edge.node.mainContact.customer.lastName || ""}`.trim(),
            email: edge.node.mainContact.customer.email,
          } : null,
          contactCount: edge.node.contactCount,
          locationCount: edge.node.locationCount,
          ordersCount: edge.node.ordersCount,
          totalSpent: edge.node.totalSpent ? formatMoney(edge.node.totalSpent.amount, edge.node.totalSpent.currencyCode) : null,
        })),
        pagination: { hasNextPage: pageInfo?.hasNextPage, endCursor: pageInfo?.endCursor },
      };

      let textContent: string;
      if (format === "markdown") {
        const lines = [`# B2B Companies`, `Found ${companies.length} companies`, ""];
        for (const company of output.companies) {
          lines.push(`## ${company.name}`, `- **ID**: ${company.id}`);
          if (company.externalId) lines.push(`- **External ID**: ${company.externalId}`);
          if (company.mainContact) lines.push(`- **Main Contact**: ${company.mainContact.name} (${company.mainContact.email})`);
          lines.push(`- **Contacts**: ${company.contactCount}`, `- **Locations**: ${company.locationCount}`, `- **Orders**: ${company.ordersCount}`, `- **Total Spent**: ${company.totalSpent || "N/A"}`, "");
        }
        if (pageInfo?.hasNextPage) lines.push("", `*More companies available. Use after: "${pageInfo.endCursor}"*`);
        textContent = lines.join("\n");
      } else {
        textContent = JSON.stringify(output, null, 2);
      }

      return { content: [{ type: "text" as const, text: textContent }] };
    }
  );

  server.registerTool(
    "shopify_get_company",
    {
      description: "Get detailed company information including contacts and locations (Shopify Plus).",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
      },
      inputSchema: z.object({
        company_id: ShopifyIdSchema.describe("Company ID"),
        format: ResponseFormatSchema,
      }),
    },
    async (args) => {
      const { company_id, format } = args;
      const companyId = toGid("Company", company_id);

      const data = await executeGraphQL<any>(COMPANY_DETAIL_QUERY, { id: companyId });
      const company = data.company;

      if (!company) {
        return { content: [{ type: "text" as const, text: "Company not found." }] };
      }

      const output = {
        id: extractNumericId(company.id),
        name: company.name,
        externalId: company.externalId,
        note: company.note,
        mainContact: company.mainContact?.customer ? {
          id: extractNumericId(company.mainContact.customer.id),
          name: `${company.mainContact.customer.firstName || ""} ${company.mainContact.customer.lastName || ""}`.trim(),
          email: company.mainContact.customer.email,
        } : null,
        contacts: company.contacts?.edges?.map((edge: any) => ({
          id: extractNumericId(edge.node.id),
          isMainContact: edge.node.isMainContact,
          customer: edge.node.customer ? { name: `${edge.node.customer.firstName || ""} ${edge.node.customer.lastName || ""}`.trim(), email: edge.node.customer.email } : null,
        })),
        locations: company.locations?.edges?.map((edge: any) => ({
          id: extractNumericId(edge.node.id),
          name: edge.node.name,
          shippingAddress: edge.node.shippingAddress ? `${edge.node.shippingAddress.address1}, ${edge.node.shippingAddress.city}, ${edge.node.shippingAddress.country}` : null,
        })),
        ordersCount: company.ordersCount,
        totalSpent: company.totalSpent ? formatMoney(company.totalSpent.amount, company.totalSpent.currencyCode) : null,
      };

      let textContent: string;
      if (format === "markdown") {
        const lines = [`# ${output.name}`, "", `**ID**: ${output.id}`, `**Orders**: ${output.ordersCount}`, `**Total Spent**: ${output.totalSpent || "N/A"}`];
        if (output.externalId) lines.push(`**External ID**: ${output.externalId}`);
        if (output.note) lines.push(`**Note**: ${output.note}`);
        if (output.mainContact) lines.push("", "## Main Contact", `- **Name**: ${output.mainContact.name}`, `- **Email**: ${output.mainContact.email}`);
        if (output.locations && output.locations.length > 0) {
          lines.push("", "## Locations", "");
          for (const loc of output.locations) lines.push(`### ${loc.name}`, `- **ID**: ${loc.id}`, loc.shippingAddress ? `- **Address**: ${loc.shippingAddress}` : "", "");
        }
        textContent = lines.filter(Boolean).join("\n");
      } else {
        textContent = JSON.stringify(output, null, 2);
      }

      return { content: [{ type: "text" as const, text: textContent }] };
    }
  );

  server.registerTool(
    "shopify_create_company",
    {
      description: "Create a new B2B company (Shopify Plus).",
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
      },
      inputSchema: z.object({
        name: z.string().describe("Company name"),
        external_id: z.string().optional().describe("External ID from ERP/CRM"),
        note: z.string().optional().describe("Internal note"),
        format: ResponseFormatSchema,
      }),
    },
    async (args) => {
      const { name, external_id, note, format } = args;

      const input: Record<string, unknown> = { company: { name } };
      if (external_id) (input.company as any).externalId = external_id;
      if (note) (input.company as any).note = note;

      const data = await executeGraphQL<any>(COMPANY_CREATE_MUTATION, { input });
      const result = data.companyCreate;
      const errors = result?.userErrors || [];

      if (errors.length > 0) {
        return { content: [{ type: "text" as const, text: `Error creating company:\n${errors.map((e: any) => `- ${e.field}: ${e.message}`).join("\n")}` }] };
      }

      const company = result?.company;
      const output = { success: true, company: company ? { id: extractNumericId(company.id), name: company.name, externalId: company.externalId, note: company.note } : null };

      let textContent: string;
      if (format === "markdown") {
        textContent = [`# Company Created`, "", `**Name**: ${output.company?.name}`, `**ID**: ${output.company?.id}`, output.company?.externalId ? `**External ID**: ${output.company.externalId}` : ""].filter(Boolean).join("\n");
      } else {
        textContent = JSON.stringify(output, null, 2);
      }

      return { content: [{ type: "text" as const, text: textContent }] };
    }
  );

  server.registerTool(
    "shopify_list_price_lists",
    {
      description: "List B2B price lists (Shopify Plus). Price lists define custom pricing for wholesale customers.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
      },
      inputSchema: z.object({
        first: z.number().min(1).max(100).default(20).describe("Number of price lists to retrieve"),
        after: z.string().optional().describe("Cursor for pagination"),
        format: ResponseFormatSchema,
      }),
    },
    async (args) => {
      const { first, after, format } = args;

      const data = await executeGraphQL<any>(PRICE_LISTS_QUERY, { first, after });
      const priceLists = data.priceLists?.edges || [];
      const pageInfo = data.priceLists?.pageInfo;

      const output = {
        priceLists: priceLists.map((edge: any) => ({
          id: extractNumericId(edge.node.id),
          name: edge.node.name,
          currency: edge.node.currency,
          adjustment: edge.node.parent?.adjustment ? { type: edge.node.parent.adjustment.type, value: edge.node.parent.adjustment.value } : null,
        })),
        pagination: { hasNextPage: pageInfo?.hasNextPage, endCursor: pageInfo?.endCursor },
      };

      let textContent: string;
      if (format === "markdown") {
        const lines = [`# B2B Price Lists`, `Found ${priceLists.length} price lists`, ""];
        for (const pl of output.priceLists) {
          lines.push(`## ${pl.name}`, `- **ID**: ${pl.id}`, `- **Currency**: ${pl.currency}`);
          if (pl.adjustment) {
            const adjValue = pl.adjustment.type === "PERCENTAGE" ? `${pl.adjustment.value}%` : pl.adjustment.value;
            lines.push(`- **Base Adjustment**: ${adjValue} (${pl.adjustment.type})`);
          }
          lines.push("");
        }
        if (pageInfo?.hasNextPage) lines.push("", `*More price lists available. Use after: "${pageInfo.endCursor}"*`);
        textContent = lines.join("\n");
      } else {
        textContent = JSON.stringify(output, null, 2);
      }

      return { content: [{ type: "text" as const, text: textContent }] };
    }
  );
}
