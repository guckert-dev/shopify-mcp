/**
 * Shared constants for the Shopify MCP server
 */

// Maximum response size in characters to prevent overwhelming responses
export const CHARACTER_LIMIT = 25000;

// Default pagination limits
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

// Shopify API version (use latest stable)
export const SHOPIFY_API_VERSION = "2024-10";

// Request timeout in milliseconds
export const REQUEST_TIMEOUT = 30000;

// Response format options
export enum ResponseFormat {
  MARKDOWN = "markdown",
  JSON = "json"
}

// Order financial status options
export enum OrderFinancialStatus {
  PENDING = "pending",
  AUTHORIZED = "authorized",
  PARTIALLY_PAID = "partially_paid",
  PAID = "paid",
  PARTIALLY_REFUNDED = "partially_refunded",
  REFUNDED = "refunded",
  VOIDED = "voided"
}

// Order fulfillment status options
export enum OrderFulfillmentStatus {
  UNFULFILLED = "unfulfilled",
  PARTIAL = "partial",
  FULFILLED = "fulfilled",
  RESTOCKED = "restocked"
}

// Product status options
export enum ProductStatus {
  ACTIVE = "active",
  ARCHIVED = "archived",
  DRAFT = "draft"
}
