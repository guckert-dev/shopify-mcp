/**
 * Inventory management tools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  executeGraphQL,
  handleApiError,
  toGid,
  extractNumericId,
} from "../services/shopify-client.js";
import {
  INVENTORY_LEVELS_QUERY,
  INVENTORY_ADJUST_MUTATION,
  LOCATIONS_QUERY,
} from "../services/queries.js";
import { ResponseFormat, CHARACTER_LIMIT } from "../constants.js";
import { ResponseFormatSchema, PaginationSchema, ShopifyIdSchema } from "../schemas/common.js";
import { PageInfo } from "../types.js";

// ============================================
// TYPES
// ============================================

interface InventoryQuantity {
  name: string;
  quantity: number;
}

interface InventoryLevelNode {
  id: string;
  quantities: InventoryQuantity[];
  location: {
    id: string;
    name: string;
  };
}

interface InventoryItemNode {
  id: string;
  sku: string | null;
  tracked: boolean;
  inventoryLevels: {
    edges: Array<{
      node: InventoryLevelNode;
    }>;
  };
}

interface InventoryItemsResponse {
  inventoryItems: {
    edges: Array<{
      node: InventoryItemNode;
      cursor: string;
    }>;
    pageInfo: PageInfo;
  };
}

interface LocationNode {
  id: string;
  name: string;
  isActive: boolean;
  fulfillmentService: {
    serviceName: string;
  } | null;
  address: {
    city: string;
    country: string;
  } | null;
}

interface LocationsResponse {
  locations: {
    edges: Array<{
      node: LocationNode;
    }>;
  };
}

// ============================================
// SCHEMAS
// ============================================

const ListInventoryInputSchema = z
  .object({
    query: z
      .string()
      .optional()
      .describe(
        "Search query to filter inventory items. Supports: 'sku:ABC*' for SKU prefix"
      ),
    response_format: ResponseFormatSchema,
  })
  .merge(PaginationSchema)
  .strict();

type ListInventoryInput = z.infer<typeof ListInventoryInputSchema>;

const ListLocationsInputSchema = z.object({
  response_format: ResponseFormatSchema,
}).strict();

type ListLocationsInput = z.infer<typeof ListLocationsInputSchema>;

const AdjustInventoryInputSchema = z.object({
  inventory_item_id: ShopifyIdSchema.describe(
    "Inventory item ID (get this from shopify_get_product variant.inventory_item_id)"
  ),
  location_id: ShopifyIdSchema.describe(
    "Location ID (get this from shopify_list_locations)"
  ),
  adjustment: z
    .number()
    .int()
    .describe(
      "Quantity adjustment: positive to add inventory, negative to remove (e.g., 10 to add 10, -5 to remove 5)"
    ),
  reason: z
    .enum([
      "correction",
      "cycle_count_available",
      "damaged",
      "movement_created",
      "movement_received",
      "movement_canceled",
      "movement_updated",
      "other",
      "promotion",
      "quality_control",
      "received",
      "reservation_created",
      "reservation_deleted",
      "reservation_updated",
      "restock",
      "safety_stock",
      "shrinkage",
    ])
    .default("correction")
    .describe("Reason for inventory adjustment"),
}).strict();

type AdjustInventoryInput = z.infer<typeof AdjustInventoryInputSchema>;

// ============================================
// HELPER FUNCTIONS
// ============================================

function getQuantityByName(quantities: InventoryQuantity[], name: string): number {
  const q = quantities.find((q) => q.name === name);
  return q?.quantity ?? 0;
}

function formatInventorySummary(item: InventoryItemNode): string {
  const levels = item.inventoryLevels?.edges?.map((e) => e.node) || [];

  const lines = [
    `## SKU: ${item.sku || "No SKU"}`,
    `- **ID**: ${extractNumericId(item.id)}`,
    `- **Tracked**: ${item.tracked ? "Yes" : "No"}`,
    "",
  ];

  if (levels.length > 0) {
    lines.push("**Inventory by Location:**");
    for (const level of levels) {
      const available = getQuantityByName(level.quantities, "available");
      const onHand = getQuantityByName(level.quantities, "on_hand");
      const incoming = getQuantityByName(level.quantities, "incoming");
      const committed = getQuantityByName(level.quantities, "committed");

      lines.push(
        `- **${level.location.name}**:`,
        `  - Available: ${available}`,
        `  - On Hand: ${onHand}`,
        `  - Incoming: ${incoming}`,
        `  - Committed: ${committed}`
      );
    }
  } else {
    lines.push("*No inventory levels found*");
  }

  return lines.join("\n");
}

// ============================================
// REGISTER TOOLS
// ============================================

export function registerInventoryTools(server: McpServer): void {
  // LIST INVENTORY
  server.registerTool(
    "shopify_list_inventory",
    {
      title: "List Shopify Inventory",
      description: `List inventory items and their quantities across all locations.

This tool retrieves inventory information for products that track inventory. Each inventory item corresponds to a product variant.

Args:
  - query (string, optional): Filter by SKU prefix (e.g., 'sku:ABC*')
  - first (number): Results to return (1-100, default: 20)
  - after (string, optional): Pagination cursor
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  List of inventory items with quantities at each location:
  - available: Ready to sell
  - on_hand: Total physical inventory
  - incoming: Expected from suppliers
  - committed: Reserved for orders

Examples:
  - "Show inventory levels" -> no filters
  - "Find inventory for SKU starting with ABC" -> query: "sku:ABC*"
  - "Check low stock items" -> Use results to filter by available quantity`,
      inputSchema: ListInventoryInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: ListInventoryInput) => {
      try {
        const variables = {
          first: params.first,
          after: params.after || null,
          query: params.query || null,
        };

        const data = await executeGraphQL<InventoryItemsResponse>(
          INVENTORY_LEVELS_QUERY,
          variables
        );
        const items = data.inventoryItems.edges.map((e) => e.node);
        const pageInfo = data.inventoryItems.pageInfo;

        if (items.length === 0) {
          return {
            content: [
              { type: "text", text: "No inventory items found matching your criteria." },
            ],
          };
        }

        const output = {
          total_returned: items.length,
          inventory_items: items.map((item) => {
            const levels = item.inventoryLevels?.edges?.map((e) => e.node) || [];
            return {
              id: extractNumericId(item.id),
              gid: item.id,
              sku: item.sku,
              tracked: item.tracked,
              locations: levels.map((level) => ({
                id: extractNumericId(level.location.id),
                name: level.location.name,
                available: getQuantityByName(level.quantities, "available"),
                on_hand: getQuantityByName(level.quantities, "on_hand"),
                incoming: getQuantityByName(level.quantities, "incoming"),
                committed: getQuantityByName(level.quantities, "committed"),
              })),
            };
          }),
          pagination: {
            has_next_page: pageInfo.hasNextPage,
            end_cursor: pageInfo.endCursor,
          },
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          const lines = [
            `# Inventory Items (${items.length} results)`,
            "",
            ...items.map((item) => formatInventorySummary(item)),
            "",
            "---",
            pageInfo.hasNextPage
              ? `*More items available. Use after: "${pageInfo.endCursor}" to get the next page.*`
              : "*No more items available.*",
          ];
          textContent = lines.join("\n");

          if (textContent.length > CHARACTER_LIMIT) {
            textContent =
              textContent.slice(0, CHARACTER_LIMIT - 100) +
              "\n\n---\n*Response truncated. Use pagination to see more results.*";
          }
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

  // LIST LOCATIONS
  server.registerTool(
    "shopify_list_locations",
    {
      title: "List Shopify Locations",
      description: `List all inventory locations in the Shopify store.

This tool retrieves all locations where inventory can be stored. Use location IDs when adjusting inventory.

Args:
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  List of locations with: id, name, active status, fulfillment service, address

Examples:
  - "Show me all warehouse locations" -> no parameters
  - "What locations do I have?" -> no parameters`,
      inputSchema: ListLocationsInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: ListLocationsInput) => {
      try {
        const data = await executeGraphQL<LocationsResponse>(LOCATIONS_QUERY);
        const locations = data.locations.edges.map((e) => e.node);

        if (locations.length === 0) {
          return {
            content: [{ type: "text", text: "No locations found." }],
          };
        }

        const output = {
          total: locations.length,
          locations: locations.map((loc) => ({
            id: extractNumericId(loc.id),
            gid: loc.id,
            name: loc.name,
            is_active: loc.isActive,
            fulfillment_service: loc.fulfillmentService?.serviceName || null,
            city: loc.address?.city,
            country: loc.address?.country,
          })),
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          const lines = [
            `# Inventory Locations (${locations.length} total)`,
            "",
            ...locations.map((loc) =>
              [
                `## ${loc.name}`,
                `- **ID**: ${extractNumericId(loc.id)}`,
                `- **Active**: ${loc.isActive ? "Yes" : "No"}`,
                loc.fulfillmentService
                  ? `- **Fulfillment**: ${loc.fulfillmentService.serviceName}`
                  : null,
                loc.address
                  ? `- **Location**: ${loc.address.city}, ${loc.address.country}`
                  : null,
              ]
                .filter(Boolean)
                .join("\n")
            ),
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

  // ADJUST INVENTORY
  server.registerTool(
    "shopify_adjust_inventory",
    {
      title: "Adjust Shopify Inventory",
      description: `Adjust inventory quantity for a product variant at a specific location.

This tool modifies the available quantity of an inventory item. Use positive numbers to add inventory and negative numbers to remove.

IMPORTANT: To adjust inventory, you need:
1. The inventory_item_id (get from shopify_get_product -> variants -> inventory_item_id)
2. The location_id (get from shopify_list_locations)

Args:
  - inventory_item_id (string, required): Inventory item ID
  - location_id (string, required): Location ID
  - adjustment (number, required): Quantity change (+10 to add, -5 to remove)
  - reason (string): Reason for adjustment (default: 'correction')
    - correction: Fix inventory count error
    - damaged: Items damaged
    - received: New stock received
    - restock: Items returned to stock
    - shrinkage: Loss/theft
    - cycle_count_available: Physical count adjustment
    - other: Other reason

Returns:
  Confirmation of the adjustment with new quantity

Examples:
  - "Add 10 units" -> adjustment: 10, reason: "received"
  - "Remove 5 damaged items" -> adjustment: -5, reason: "damaged"
  - "Correct count to actual" -> adjustment: calculated_difference, reason: "correction"`,
      inputSchema: AdjustInventoryInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params: AdjustInventoryInput) => {
      try {
        const inventoryItemId = toGid("InventoryItem", params.inventory_item_id);
        const locationId = toGid("Location", params.location_id);

        const input = {
          reason: params.reason,
          name: "available",
          changes: [
            {
              inventoryItemId,
              locationId,
              delta: params.adjustment,
            },
          ],
        };

        const data = await executeGraphQL<{
          inventoryAdjustQuantities: {
            inventoryAdjustmentGroup: {
              createdAt: string;
              reason: string;
              changes: Array<{
                name: string;
                delta: number;
              }>;
            } | null;
            userErrors: Array<{ field: string[]; message: string }>;
          };
        }>(INVENTORY_ADJUST_MUTATION, { input });

        if (data.inventoryAdjustQuantities.userErrors?.length > 0) {
          const errors = data.inventoryAdjustQuantities.userErrors
            .map((e) => `${e.field?.join(".")}: ${e.message}`)
            .join("; ");
          return {
            content: [{ type: "text", text: `Error adjusting inventory: ${errors}` }],
            isError: true,
          };
        }

        const adjustment = data.inventoryAdjustQuantities.inventoryAdjustmentGroup;

        const output = {
          success: true,
          inventory_item_id: params.inventory_item_id,
          location_id: params.location_id,
          adjustment: params.adjustment,
          reason: params.reason,
          changes: adjustment?.changes,
          created_at: adjustment?.createdAt,
        };

        const direction = params.adjustment > 0 ? "Added" : "Removed";
        const quantity = Math.abs(params.adjustment);

        return {
          content: [
            {
              type: "text",
              text: `Inventory adjusted successfully!\n\n- **${direction}**: ${quantity} unit(s)\n- **Reason**: ${params.reason}\n- **Inventory Item**: ${params.inventory_item_id}\n- **Location**: ${params.location_id}`,
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
}
