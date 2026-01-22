/**
 * Common Zod schemas used across multiple tools
 */

import { z } from "zod";
import {
  ResponseFormat,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
  ProductStatus,
} from "../constants.js";

// Response format schema
export const ResponseFormatSchema = z
  .nativeEnum(ResponseFormat)
  .default(ResponseFormat.MARKDOWN)
  .describe("Output format: 'markdown' for human-readable or 'json' for machine-readable");

// Pagination schema
export const PaginationSchema = z.object({
  first: z
    .number()
    .int()
    .min(1)
    .max(MAX_LIMIT)
    .default(DEFAULT_LIMIT)
    .describe(`Maximum results to return (1-${MAX_LIMIT}, default: ${DEFAULT_LIMIT})`),
  after: z
    .string()
    .optional()
    .describe("Cursor for pagination - use the endCursor from previous response to get next page"),
});

// Order filter schemas
export const OrderFinancialStatusSchema = z
  .nativeEnum(OrderFinancialStatus)
  .optional()
  .describe("Filter orders by financial status");

export const OrderFulfillmentStatusSchema = z
  .nativeEnum(OrderFulfillmentStatus)
  .optional()
  .describe("Filter orders by fulfillment status");

// Product status schema
export const ProductStatusSchema = z
  .nativeEnum(ProductStatus)
  .optional()
  .describe("Filter products by status");

// Date range schema
export const DateRangeSchema = z.object({
  created_at_min: z
    .string()
    .optional()
    .describe("Filter by minimum creation date (ISO 8601 format, e.g., '2024-01-01T00:00:00Z')"),
  created_at_max: z
    .string()
    .optional()
    .describe("Filter by maximum creation date (ISO 8601 format)"),
  updated_at_min: z
    .string()
    .optional()
    .describe("Filter by minimum update date (ISO 8601 format)"),
  updated_at_max: z
    .string()
    .optional()
    .describe("Filter by maximum update date (ISO 8601 format)"),
});

// ID schema - accepts either numeric ID or full GID
export const ShopifyIdSchema = z
  .string()
  .min(1)
  .describe("Shopify ID - can be numeric (e.g., '123456789') or full GID (e.g., 'gid://shopify/Order/123456789')");

// Search query schema
export const SearchQuerySchema = z
  .string()
  .min(1)
  .max(500)
  .describe("Search query string");

// Tags schema
export const TagsSchema = z
  .array(z.string())
  .optional()
  .describe("Tags to filter by or add to the resource");
