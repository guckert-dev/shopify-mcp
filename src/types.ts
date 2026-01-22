/**
 * TypeScript type definitions for Shopify API responses
 */

// Shop information
export interface ShopInfo {
  id: string;
  name: string;
  email: string;
  domain: string;
  myshopifyDomain: string;
  currencyCode: string;
  primaryDomain: {
    url: string;
    host: string;
  };
  plan: {
    displayName: string;
  };
  billingAddress: {
    city: string;
    country: string;
    countryCodeV2: string;
  };
  createdAt: string;
  updatedAt: string;
}

// Order types
export interface Order {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  updatedAt: string;
  displayFinancialStatus: string;
  displayFulfillmentStatus: string;
  totalPriceSet: {
    shopMoney: {
      amount: string;
      currencyCode: string;
    };
  };
  subtotalPriceSet: {
    shopMoney: {
      amount: string;
      currencyCode: string;
    };
  };
  totalShippingPriceSet: {
    shopMoney: {
      amount: string;
      currencyCode: string;
    };
  };
  totalTaxSet: {
    shopMoney: {
      amount: string;
      currencyCode: string;
    };
  };
  customer: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  shippingAddress: Address | null;
  billingAddress: Address | null;
  lineItems: {
    edges: Array<{
      node: LineItem;
    }>;
  };
  fulfillments: Fulfillment[];
  note: string | null;
  tags: string[];
}

export interface Address {
  firstName: string;
  lastName: string;
  address1: string;
  address2: string | null;
  city: string;
  province: string;
  country: string;
  zip: string;
  phone: string | null;
}

export interface LineItem {
  id: string;
  title: string;
  quantity: number;
  sku: string | null;
  variant: {
    id: string;
    title: string;
    price: string;
  } | null;
  originalUnitPriceSet: {
    shopMoney: {
      amount: string;
      currencyCode: string;
    };
  };
}

export interface Fulfillment {
  id: string;
  status: string;
  createdAt: string;
  trackingInfo: Array<{
    number: string;
    url: string;
    company: string;
  }>;
}

// Product types
export interface Product {
  id: string;
  title: string;
  handle: string;
  descriptionHtml: string;
  status: string;
  vendor: string;
  productType: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  totalInventory: number;
  tracksInventory: boolean;
  variants: {
    edges: Array<{
      node: ProductVariant;
    }>;
  };
  images: {
    edges: Array<{
      node: {
        id: string;
        url: string;
        altText: string | null;
      };
    }>;
  };
  priceRangeV2: {
    minVariantPrice: {
      amount: string;
      currencyCode: string;
    };
    maxVariantPrice: {
      amount: string;
      currencyCode: string;
    };
  };
}

export interface ProductVariant {
  id: string;
  title: string;
  sku: string | null;
  price: string;
  compareAtPrice: string | null;
  inventoryQuantity: number | null;
  barcode: string | null;
  weight: number | null;
  weightUnit: string;
  inventoryItem: {
    id: string;
  };
}

// Customer types
export interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  createdAt: string;
  updatedAt: string;
  ordersCount: string;
  totalSpentV2: {
    amount: string;
    currencyCode: string;
  };
  state: string;
  tags: string[];
  note: string | null;
  verifiedEmail: boolean;
  defaultAddress: Address | null;
  addresses: Address[];
}

// Inventory types
export interface InventoryLevel {
  id: string;
  available: number;
  incoming: number;
  location: {
    id: string;
    name: string;
  };
}

export interface InventoryItem {
  id: string;
  sku: string | null;
  tracked: boolean;
  inventoryLevels: {
    edges: Array<{
      node: InventoryLevel;
    }>;
  };
}

// GraphQL response wrapper
export interface GraphQLResponse<T> {
  data: T;
  errors?: Array<{
    message: string;
    locations?: Array<{
      line: number;
      column: number;
    }>;
    path?: string[];
  }>;
  extensions?: {
    cost: {
      requestedQueryCost: number;
      actualQueryCost: number;
      throttleStatus: {
        maximumAvailable: number;
        currentlyAvailable: number;
        restoreRate: number;
      };
    };
  };
}

// Pagination info
export interface PageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor: string | null;
  endCursor: string | null;
}

// Connection type for paginated results
export interface Connection<T> {
  edges: Array<{
    node: T;
    cursor: string;
  }>;
  pageInfo: PageInfo;
}
