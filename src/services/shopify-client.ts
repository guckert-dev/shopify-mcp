/**
 * Shopify GraphQL API client
 * Handles authentication, requests, and error handling
 */

import axios, { AxiosError, AxiosInstance } from "axios";
import { SHOPIFY_API_VERSION, REQUEST_TIMEOUT } from "../constants.js";
import { GraphQLResponse } from "../types.js";

// Get configuration from environment
function getConfig(): { shopDomain: string; accessToken: string } {
  const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

  if (!shopDomain) {
    throw new Error(
      "SHOPIFY_SHOP_DOMAIN environment variable is required. " +
      "Set it to your shop's myshopify.com domain (e.g., 'your-store.myshopify.com')"
    );
  }

  if (!accessToken) {
    throw new Error(
      "SHOPIFY_ACCESS_TOKEN environment variable is required. " +
      "Generate an access token from your Shopify admin under Apps > Develop apps"
    );
  }

  return { shopDomain, accessToken };
}

// Create axios instance for GraphQL requests
function createClient(): AxiosInstance {
  const { shopDomain, accessToken } = getConfig();

  // Normalize domain (remove protocol if present)
  const normalizedDomain = shopDomain
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");

  return axios.create({
    baseURL: `https://${normalizedDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    timeout: REQUEST_TIMEOUT,
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
  });
}

let clientInstance: AxiosInstance | null = null;

function getClient(): AxiosInstance {
  if (!clientInstance) {
    clientInstance = createClient();
  }
  return clientInstance;
}

/**
 * Execute a GraphQL query against the Shopify Admin API
 */
export async function executeGraphQL<T>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const client = getClient();

  try {
    const response = await client.post<GraphQLResponse<T>>("", {
      query,
      variables,
    });

    // Check for GraphQL errors
    if (response.data.errors && response.data.errors.length > 0) {
      const errorMessages = response.data.errors
        .map((e) => e.message)
        .join("; ");
      throw new Error(`GraphQL Error: ${errorMessages}`);
    }

    return response.data.data;
  } catch (error) {
    throw error;
  }
}

/**
 * Handle API errors and return user-friendly messages
 */
export function handleApiError(error: unknown): string {
  if (error instanceof AxiosError) {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      switch (status) {
        case 401:
          return "Error: Authentication failed. Please check your SHOPIFY_ACCESS_TOKEN is valid and has the required scopes.";
        case 402:
          return "Error: Payment required. Your Shopify store may need to upgrade its plan for this feature.";
        case 403:
          return "Error: Access forbidden. Your access token may not have the required permissions for this operation.";
        case 404:
          return "Error: Resource not found. Please check the ID is correct.";
        case 422:
          // Unprocessable entity - usually validation errors
          if (typeof data === "object" && data.errors) {
            const errors = Array.isArray(data.errors)
              ? data.errors.join("; ")
              : JSON.stringify(data.errors);
            return `Error: Validation failed - ${errors}`;
          }
          return "Error: The request could not be processed. Please check your input values.";
        case 429:
          return "Error: Rate limit exceeded. Please wait a moment before making more requests. Shopify allows approximately 2 requests per second.";
        case 500:
        case 502:
        case 503:
        case 504:
          return `Error: Shopify server error (${status}). Please try again in a few moments.`;
        default:
          return `Error: API request failed with status ${status}. ${data?.errors || ""}`;
      }
    } else if (error.code === "ECONNABORTED") {
      return "Error: Request timed out. The operation took too long to complete. Please try again.";
    } else if (error.code === "ENOTFOUND") {
      return "Error: Could not connect to Shopify. Please check your SHOPIFY_SHOP_DOMAIN is correct.";
    }
  }

  if (error instanceof Error) {
    // Check for GraphQL-specific errors
    if (error.message.includes("GraphQL Error")) {
      return error.message;
    }
    return `Error: ${error.message}`;
  }

  return `Error: An unexpected error occurred: ${String(error)}`;
}

/**
 * Extract the numeric ID from a Shopify GID
 * e.g., "gid://shopify/Order/123456789" -> "123456789"
 */
export function extractNumericId(gid: string): string {
  const match = gid.match(/\/(\d+)$/);
  return match ? match[1] : gid;
}

/**
 * Convert a numeric ID to a Shopify GID
 * e.g., "123456789" -> "gid://shopify/Order/123456789"
 */
export function toGid(resourceType: string, id: string): string {
  // If already a GID, return as-is
  if (id.startsWith("gid://")) {
    return id;
  }
  return `gid://shopify/${resourceType}/${id}`;
}

/**
 * Format currency amount for display
 */
export function formatMoney(amount: string, currencyCode: string): string {
  const num = parseFloat(amount);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
  }).format(num);
}

/**
 * Format date for display
 */
export function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
