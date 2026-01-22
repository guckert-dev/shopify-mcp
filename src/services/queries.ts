/**
 * GraphQL queries and mutations for Shopify Admin API
 */

// ============================================
// SHOP QUERIES
// ============================================

export const SHOP_INFO_QUERY = `
  query ShopInfo {
    shop {
      id
      name
      email
      myshopifyDomain
      primaryDomain {
        url
        host
      }
      currencyCode
      plan {
        displayName
      }
      billingAddress {
        city
        country
        countryCodeV2
      }
      createdAt
      updatedAt
    }
  }
`;

// ============================================
// ORDER QUERIES
// ============================================

export const ORDERS_QUERY = `
  query Orders($first: Int!, $after: String, $query: String) {
    orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT, reverse: true) {
      edges {
        node {
          id
          name
          email
          createdAt
          updatedAt
          displayFinancialStatus
          displayFulfillmentStatus
          totalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          subtotalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          totalShippingPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          totalTaxSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          customer {
            id
            firstName
            lastName
            email
          }
          note
          tags
        }
        cursor
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
    }
  }
`;

export const ORDER_DETAIL_QUERY = `
  query OrderDetail($id: ID!) {
    order(id: $id) {
      id
      name
      email
      createdAt
      updatedAt
      displayFinancialStatus
      displayFulfillmentStatus
      totalPriceSet {
        shopMoney {
          amount
          currencyCode
        }
      }
      subtotalPriceSet {
        shopMoney {
          amount
          currencyCode
        }
      }
      totalShippingPriceSet {
        shopMoney {
          amount
          currencyCode
        }
      }
      totalTaxSet {
        shopMoney {
          amount
          currencyCode
        }
      }
      customer {
        id
        firstName
        lastName
        email
      }
      shippingAddress {
        firstName
        lastName
        address1
        address2
        city
        province
        country
        zip
        phone
      }
      billingAddress {
        firstName
        lastName
        address1
        address2
        city
        province
        country
        zip
        phone
      }
      lineItems(first: 50) {
        edges {
          node {
            id
            title
            quantity
            sku
            variant {
              id
              title
              price
            }
            originalUnitPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
          }
        }
      }
      fulfillments {
        id
        status
        createdAt
        trackingInfo {
          number
          url
          company
        }
      }
      note
      tags
    }
  }
`;

// ============================================
// PRODUCT QUERIES
// ============================================

export const PRODUCTS_QUERY = `
  query Products($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query, sortKey: UPDATED_AT, reverse: true) {
      edges {
        node {
          id
          title
          handle
          status
          vendor
          productType
          tags
          createdAt
          updatedAt
          publishedAt
          totalInventory
          tracksInventory
          priceRangeV2 {
            minVariantPrice {
              amount
              currencyCode
            }
            maxVariantPrice {
              amount
              currencyCode
            }
          }
          variants(first: 5) {
            edges {
              node {
                id
                title
                sku
                price
                inventoryQuantity
              }
            }
          }
          images(first: 1) {
            edges {
              node {
                id
                url
                altText
              }
            }
          }
        }
        cursor
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
    }
  }
`;

export const PRODUCT_DETAIL_QUERY = `
  query ProductDetail($id: ID!) {
    product(id: $id) {
      id
      title
      handle
      descriptionHtml
      status
      vendor
      productType
      tags
      createdAt
      updatedAt
      publishedAt
      totalInventory
      tracksInventory
      priceRangeV2 {
        minVariantPrice {
          amount
          currencyCode
        }
        maxVariantPrice {
          amount
          currencyCode
        }
      }
      variants(first: 100) {
        edges {
          node {
            id
            title
            sku
            price
            compareAtPrice
            inventoryQuantity
            barcode
            weight
            weightUnit
            inventoryItem {
              id
            }
          }
        }
      }
      images(first: 20) {
        edges {
          node {
            id
            url
            altText
          }
        }
      }
    }
  }
`;

export const PRODUCT_CREATE_MUTATION = `
  mutation ProductCreate($input: ProductInput!) {
    productCreate(input: $input) {
      product {
        id
        title
        handle
        status
        variants(first: 10) {
          edges {
            node {
              id
              title
              sku
              price
            }
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

export const PRODUCT_UPDATE_MUTATION = `
  mutation ProductUpdate($input: ProductInput!) {
    productUpdate(input: $input) {
      product {
        id
        title
        handle
        status
        updatedAt
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// ============================================
// CUSTOMER QUERIES
// ============================================

export const CUSTOMERS_QUERY = `
  query Customers($first: Int!, $after: String, $query: String) {
    customers(first: $first, after: $after, query: $query, sortKey: UPDATED_AT, reverse: true) {
      edges {
        node {
          id
          firstName
          lastName
          email
          phone
          createdAt
          updatedAt
          ordersCount
          totalSpentV2 {
            amount
            currencyCode
          }
          state
          tags
          note
          verifiedEmail
        }
        cursor
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
    }
  }
`;

export const CUSTOMER_DETAIL_QUERY = `
  query CustomerDetail($id: ID!) {
    customer(id: $id) {
      id
      firstName
      lastName
      email
      phone
      createdAt
      updatedAt
      ordersCount
      totalSpentV2 {
        amount
        currencyCode
      }
      state
      tags
      note
      verifiedEmail
      defaultAddress {
        firstName
        lastName
        address1
        address2
        city
        province
        country
        zip
        phone
      }
      addresses {
        firstName
        lastName
        address1
        address2
        city
        province
        country
        zip
        phone
      }
      orders(first: 10) {
        edges {
          node {
            id
            name
            createdAt
            displayFinancialStatus
            displayFulfillmentStatus
            totalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
          }
        }
      }
    }
  }
`;

// ============================================
// INVENTORY QUERIES
// ============================================

export const INVENTORY_LEVELS_QUERY = `
  query InventoryLevels($first: Int!, $after: String, $query: String) {
    inventoryItems(first: $first, after: $after, query: $query) {
      edges {
        node {
          id
          sku
          tracked
          inventoryLevels(first: 10) {
            edges {
              node {
                id
                quantities(names: ["available", "incoming", "committed", "on_hand"]) {
                  name
                  quantity
                }
                location {
                  id
                  name
                }
              }
            }
          }
        }
        cursor
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
    }
  }
`;

export const INVENTORY_ADJUST_MUTATION = `
  mutation InventoryAdjustQuantities($input: InventoryAdjustQuantitiesInput!) {
    inventoryAdjustQuantities(input: $input) {
      inventoryAdjustmentGroup {
        createdAt
        reason
        changes {
          name
          delta
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const LOCATIONS_QUERY = `
  query Locations {
    locations(first: 50) {
      edges {
        node {
          id
          name
          isActive
          fulfillmentService {
            serviceName
          }
          address {
            city
            country
          }
        }
      }
    }
  }
`;

// ============================================
// FULFILLMENT QUERIES
// ============================================

export const FULFILLMENT_CREATE_MUTATION = `
  mutation FulfillmentCreateV2($fulfillment: FulfillmentV2Input!) {
    fulfillmentCreateV2(fulfillment: $fulfillment) {
      fulfillment {
        id
        status
        createdAt
        trackingInfo {
          number
          url
          company
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const ORDER_CANCEL_MUTATION = `
  mutation OrderCancel($orderId: ID!, $reason: OrderCancelReason!, $refund: Boolean!, $restock: Boolean!) {
    orderCancel(orderId: $orderId, reason: $reason, refund: $refund, restock: $restock) {
      job {
        id
        done
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// ============================================
// ANALYTICS QUERIES
// ============================================

export const ANALYTICS_QUERY = `
  query ShopAnalytics {
    shop {
      id
      name
      currencyCode
    }
    orders(first: 1, sortKey: CREATED_AT, reverse: true) {
      edges {
        node {
          createdAt
        }
      }
    }
    products(first: 1) {
      edges {
        node {
          id
        }
      }
    }
    customers(first: 1) {
      edges {
        node {
          id
        }
      }
    }
  }
`;

// ============================================
// DRAFT ORDER QUERIES
// ============================================

export const DRAFT_ORDERS_QUERY = `
  query DraftOrders($first: Int!, $after: String, $query: String) {
    draftOrders(first: $first, after: $after, query: $query, sortKey: UPDATED_AT, reverse: true) {
      edges {
        node {
          id
          name
          status
          createdAt
          updatedAt
          customer {
            id
            firstName
            lastName
            email
          }
          totalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          subtotalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          totalTaxSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          lineItems(first: 20) {
            edges {
              node {
                id
                title
                quantity
                originalUnitPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
              }
            }
          }
          note2
          tags
        }
        cursor
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
    }
  }
`;

export const DRAFT_ORDER_DETAIL_QUERY = `
  query DraftOrderDetail($id: ID!) {
    draftOrder(id: $id) {
      id
      name
      status
      createdAt
      updatedAt
      completedAt
      invoiceUrl
      customer {
        id
        firstName
        lastName
        email
        phone
      }
      shippingAddress {
        firstName
        lastName
        address1
        address2
        city
        province
        country
        zip
        phone
      }
      billingAddress {
        firstName
        lastName
        address1
        address2
        city
        province
        country
        zip
        phone
      }
      totalPriceSet {
        shopMoney {
          amount
          currencyCode
        }
      }
      subtotalPriceSet {
        shopMoney {
          amount
          currencyCode
        }
      }
      totalShippingPriceSet {
        shopMoney {
          amount
          currencyCode
        }
      }
      totalTaxSet {
        shopMoney {
          amount
          currencyCode
        }
      }
      lineItems(first: 50) {
        edges {
          node {
            id
            title
            quantity
            sku
            variant {
              id
              title
            }
            originalUnitPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
          }
        }
      }
      note2
      tags
    }
  }
`;

export const DRAFT_ORDER_CREATE_MUTATION = `
  mutation DraftOrderCreate($input: DraftOrderInput!) {
    draftOrderCreate(input: $input) {
      draftOrder {
        id
        name
        status
        invoiceUrl
        totalPriceSet {
          shopMoney {
            amount
            currencyCode
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

export const DRAFT_ORDER_COMPLETE_MUTATION = `
  mutation DraftOrderComplete($id: ID!) {
    draftOrderComplete(id: $id) {
      draftOrder {
        id
        status
        order {
          id
          name
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const DRAFT_ORDER_DELETE_MUTATION = `
  mutation DraftOrderDelete($input: DraftOrderDeleteInput!) {
    draftOrderDelete(input: $input) {
      deletedId
      userErrors {
        field
        message
      }
    }
  }
`;

// ============================================
// COLLECTION QUERIES
// ============================================

export const COLLECTIONS_QUERY = `
  query Collections($first: Int!, $after: String, $query: String) {
    collections(first: $first, after: $after, query: $query, sortKey: UPDATED_AT, reverse: true) {
      edges {
        node {
          id
          title
          handle
          descriptionHtml
          productsCount
          sortOrder
          ruleSet {
            appliedDisjunctively
            rules {
              column
              condition
              relation
            }
          }
          image {
            url
            altText
          }
          updatedAt
        }
        cursor
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
    }
  }
`;

export const COLLECTION_DETAIL_QUERY = `
  query CollectionDetail($id: ID!, $productsFirst: Int!) {
    collection(id: $id) {
      id
      title
      handle
      descriptionHtml
      productsCount
      sortOrder
      ruleSet {
        appliedDisjunctively
        rules {
          column
          condition
          relation
        }
      }
      image {
        url
        altText
      }
      products(first: $productsFirst) {
        edges {
          node {
            id
            title
            handle
            status
            totalInventory
            priceRangeV2 {
              minVariantPrice {
                amount
                currencyCode
              }
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
      updatedAt
    }
  }
`;

export const COLLECTION_ADD_PRODUCTS_MUTATION = `
  mutation CollectionAddProducts($id: ID!, $productIds: [ID!]!) {
    collectionAddProducts(id: $id, productIds: $productIds) {
      collection {
        id
        title
        productsCount
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const COLLECTION_REMOVE_PRODUCTS_MUTATION = `
  mutation CollectionRemoveProducts($id: ID!, $productIds: [ID!]!) {
    collectionRemoveProducts(id: $id, productIds: $productIds) {
      job {
        id
        done
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// ============================================
// DISCOUNT QUERIES
// ============================================

export const DISCOUNT_CODES_QUERY = `
  query DiscountCodes($first: Int!, $after: String, $query: String) {
    codeDiscountNodes(first: $first, after: $after, query: $query, sortKey: UPDATED_AT, reverse: true) {
      edges {
        node {
          id
          codeDiscount {
            ... on DiscountCodeBasic {
              title
              status
              startsAt
              endsAt
              usageLimit
              asyncUsageCount
              codes(first: 5) {
                edges {
                  node {
                    code
                    usageCount
                  }
                }
              }
              customerGets {
                value {
                  ... on DiscountPercentage {
                    percentage
                  }
                  ... on DiscountAmount {
                    amount {
                      amount
                      currencyCode
                    }
                  }
                }
              }
              minimumRequirement {
                ... on DiscountMinimumSubtotal {
                  greaterThanOrEqualToSubtotal {
                    amount
                    currencyCode
                  }
                }
                ... on DiscountMinimumQuantity {
                  greaterThanOrEqualToQuantity
                }
              }
            }
            ... on DiscountCodeBxgy {
              title
              status
              startsAt
              endsAt
              usageLimit
              asyncUsageCount
              codes(first: 5) {
                edges {
                  node {
                    code
                    usageCount
                  }
                }
              }
            }
            ... on DiscountCodeFreeShipping {
              title
              status
              startsAt
              endsAt
              usageLimit
              asyncUsageCount
              codes(first: 5) {
                edges {
                  node {
                    code
                    usageCount
                  }
                }
              }
            }
          }
        }
        cursor
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
    }
  }
`;

export const DISCOUNT_CODE_BASIC_CREATE_MUTATION = `
  mutation DiscountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
    discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
      codeDiscountNode {
        id
        codeDiscount {
          ... on DiscountCodeBasic {
            title
            status
            codes(first: 1) {
              edges {
                node {
                  code
                }
              }
            }
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

export const DISCOUNT_CODE_DEACTIVATE_MUTATION = `
  mutation DiscountCodeDeactivate($id: ID!) {
    discountCodeDeactivate(id: $id) {
      codeDiscountNode {
        id
        codeDiscount {
          ... on DiscountCodeBasic {
            title
            status
          }
          ... on DiscountCodeBxgy {
            title
            status
          }
          ... on DiscountCodeFreeShipping {
            title
            status
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

// ============================================
// REFUND QUERIES
// ============================================

export const ORDER_REFUND_QUERY = `
  query OrderRefunds($orderId: ID!) {
    order(id: $orderId) {
      id
      name
      refunds {
        id
        createdAt
        note
        totalRefundedSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        refundLineItems(first: 20) {
          edges {
            node {
              lineItem {
                id
                title
              }
              quantity
              subtotalSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
            }
          }
        }
      }
    }
  }
`;

export const REFUND_CREATE_MUTATION = `
  mutation RefundCreate($input: RefundInput!) {
    refundCreate(input: $input) {
      refund {
        id
        createdAt
        totalRefundedSet {
          shopMoney {
            amount
            currencyCode
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

// ============================================
// FULFILLMENT EXTENDED QUERIES
// ============================================

export const FULFILLMENT_ORDERS_QUERY = `
  query FulfillmentOrders($orderId: ID!) {
    order(id: $orderId) {
      id
      name
      fulfillmentOrders(first: 20) {
        edges {
          node {
            id
            status
            requestStatus
            assignedLocation {
              location {
                id
                name
              }
            }
            lineItems(first: 50) {
              edges {
                node {
                  id
                  totalQuantity
                  remainingQuantity
                  lineItem {
                    title
                    sku
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

export const FULFILLMENT_TRACKING_UPDATE_MUTATION = `
  mutation FulfillmentTrackingInfoUpdateV2($fulfillmentId: ID!, $trackingInfoInput: FulfillmentTrackingInput!) {
    fulfillmentTrackingInfoUpdateV2(fulfillmentId: $fulfillmentId, trackingInfoInput: $trackingInfoInput) {
      fulfillment {
        id
        status
        trackingInfo {
          number
          url
          company
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// ============================================
// WEBHOOK QUERIES
// ============================================

export const WEBHOOKS_QUERY = `
  query Webhooks($first: Int!, $after: String) {
    webhookSubscriptions(first: $first, after: $after) {
      edges {
        node {
          id
          topic
          endpoint {
            ... on WebhookHttpEndpoint {
              callbackUrl
            }
          }
          format
          createdAt
          updatedAt
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const WEBHOOK_CREATE_MUTATION = `
  mutation WebhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
      webhookSubscription {
        id
        topic
        endpoint {
          ... on WebhookHttpEndpoint {
            callbackUrl
          }
        }
        format
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const WEBHOOK_DELETE_MUTATION = `
  mutation WebhookSubscriptionDelete($id: ID!) {
    webhookSubscriptionDelete(id: $id) {
      deletedWebhookSubscriptionId
      userErrors {
        field
        message
      }
    }
  }
`;

// ============================================
// METAFIELD QUERIES
// ============================================

export const METAFIELDS_QUERY = `
  query Metafields($ownerId: ID!) {
    node(id: $ownerId) {
      ... on Product {
        metafields(first: 50) {
          edges {
            node {
              id
              namespace
              key
              value
              type
            }
          }
        }
      }
      ... on Customer {
        metafields(first: 50) {
          edges {
            node {
              id
              namespace
              key
              value
              type
            }
          }
        }
      }
      ... on Order {
        metafields(first: 50) {
          edges {
            node {
              id
              namespace
              key
              value
              type
            }
          }
        }
      }
    }
  }
`;

export const METAFIELD_SET_MUTATION = `
  mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        id
        namespace
        key
        value
        type
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// ============================================
// ORDER TAGS/NOTES MUTATIONS
// ============================================

export const ORDER_UPDATE_MUTATION = `
  mutation OrderUpdate($input: OrderInput!) {
    orderUpdate(input: $input) {
      order {
        id
        name
        note
        tags
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// ============================================
// CUSTOMER TAGS MUTATIONS
// ============================================

export const CUSTOMER_UPDATE_MUTATION = `
  mutation CustomerUpdate($input: CustomerInput!) {
    customerUpdate(input: $input) {
      customer {
        id
        firstName
        lastName
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

// ============================================
// MARKETING QUERIES (Email, SMS, Social)
// ============================================

export const MARKETING_ACTIVITIES_QUERY = `
  query MarketingActivities($first: Int!, $after: String) {
    marketingActivities(first: $first, after: $after, sortKey: CREATED_AT, reverse: true) {
      edges {
        node {
          id
          title
          activityListUrl
          marketingChannel
          marketingChannelType
          status
          statusBadgeType
          budget {
            budgetType
            total {
              amount
              currencyCode
            }
          }
          urlParameterValue
          utmParameters {
            source
            medium
            campaign
          }
          createdAt
          scheduledToEndAt
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const MARKETING_EVENTS_QUERY = `
  query MarketingEvents($first: Int!, $after: String, $query: String) {
    marketingEvents(first: $first, after: $after, query: $query, sortKey: STARTED_AT, reverse: true) {
      edges {
        node {
          id
          type
          channel
          description
          manageUrl
          previewUrl
          startedAt
          endedAt
          utmParameters {
            source
            medium
            campaign
          }
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const ABANDONED_CHECKOUTS_QUERY = `
  query AbandonedCheckouts($first: Int!, $after: String) {
    abandonedCheckouts(first: $first, after: $after, sortKey: CREATED_AT, reverse: true) {
      edges {
        node {
          id
          createdAt
          updatedAt
          completedAt
          email
          phone
          totalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          lineItems(first: 10) {
            edges {
              node {
                title
                quantity
                variant {
                  id
                  title
                  price
                }
              }
            }
          }
          customer {
            id
            firstName
            lastName
            email
          }
          shippingAddress {
            city
            country
          }
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

// ============================================
// GIFT CARD QUERIES (Shopify Plus)
// ============================================

export const GIFT_CARDS_QUERY = `
  query GiftCards($first: Int!, $after: String, $query: String) {
    giftCards(first: $first, after: $after, query: $query, sortKey: CREATED_AT, reverse: true) {
      edges {
        node {
          id
          balance {
            amount
            currencyCode
          }
          initialValue {
            amount
            currencyCode
          }
          lastCharacters
          expiresOn
          enabled
          createdAt
          customer {
            id
            firstName
            lastName
            email
          }
          note
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const GIFT_CARD_DETAIL_QUERY = `
  query GiftCardDetail($id: ID!) {
    giftCard(id: $id) {
      id
      balance {
        amount
        currencyCode
      }
      initialValue {
        amount
        currencyCode
      }
      lastCharacters
      expiresOn
      enabled
      createdAt
      updatedAt
      customer {
        id
        firstName
        lastName
        email
      }
      order {
        id
        name
      }
      note
      transactions(first: 20) {
        edges {
          node {
            id
            amount {
              amount
              currencyCode
            }
            processedAt
          }
        }
      }
    }
  }
`;

export const GIFT_CARD_CREATE_MUTATION = `
  mutation GiftCardCreate($input: GiftCardCreateInput!) {
    giftCardCreate(input: $input) {
      giftCard {
        id
        balance {
          amount
          currencyCode
        }
        initialValue {
          amount
          currencyCode
        }
        lastCharacters
        expiresOn
        enabled
        maskedCode
      }
      giftCardCode
      userErrors {
        field
        message
      }
    }
  }
`;

export const GIFT_CARD_DISABLE_MUTATION = `
  mutation GiftCardDisable($id: ID!) {
    giftCardDisable(id: $id) {
      giftCard {
        id
        enabled
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const GIFT_CARD_UPDATE_MUTATION = `
  mutation GiftCardUpdate($id: ID!, $input: GiftCardUpdateInput!) {
    giftCardUpdate(id: $id, input: $input) {
      giftCard {
        id
        note
        expiresOn
        customer {
          id
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// ============================================
// B2B / COMPANY QUERIES (Shopify Plus)
// ============================================

export const COMPANIES_QUERY = `
  query Companies($first: Int!, $after: String, $query: String) {
    companies(first: $first, after: $after, query: $query, sortKey: UPDATED_AT, reverse: true) {
      edges {
        node {
          id
          name
          externalId
          note
          createdAt
          updatedAt
          mainContact {
            id
            customer {
              id
              firstName
              lastName
              email
            }
          }
          contactCount
          locationCount
          ordersCount
          totalSpent {
            amount
            currencyCode
          }
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const COMPANY_DETAIL_QUERY = `
  query CompanyDetail($id: ID!) {
    company(id: $id) {
      id
      name
      externalId
      note
      createdAt
      updatedAt
      mainContact {
        id
        customer {
          id
          firstName
          lastName
          email
          phone
        }
      }
      contacts(first: 20) {
        edges {
          node {
            id
            title
            locale
            isMainContact
            customer {
              id
              firstName
              lastName
              email
            }
          }
        }
      }
      locations(first: 20) {
        edges {
          node {
            id
            name
            externalId
            billingAddress {
              address1
              city
              province
              country
              zip
            }
            shippingAddress {
              address1
              city
              province
              country
              zip
            }
            buyerExperienceConfiguration {
              paymentTermsTemplate {
                id
                name
              }
            }
          }
        }
      }
      ordersCount
      totalSpent {
        amount
        currencyCode
      }
    }
  }
`;

export const COMPANY_CREATE_MUTATION = `
  mutation CompanyCreate($input: CompanyCreateInput!) {
    companyCreate(input: $input) {
      company {
        id
        name
        externalId
        note
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const COMPANY_UPDATE_MUTATION = `
  mutation CompanyUpdate($companyId: ID!, $input: CompanyInput!) {
    companyUpdate(companyId: $companyId, input: $input) {
      company {
        id
        name
        note
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const COMPANY_LOCATION_CREATE_MUTATION = `
  mutation CompanyLocationCreate($companyId: ID!, $input: CompanyLocationInput!) {
    companyLocationCreate(companyId: $companyId, input: $input) {
      companyLocation {
        id
        name
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// ============================================
// PRICE LISTS (B2B Pricing - Shopify Plus)
// ============================================

export const PRICE_LISTS_QUERY = `
  query PriceLists($first: Int!, $after: String) {
    priceLists(first: $first, after: $after) {
      edges {
        node {
          id
          name
          currency
          parent {
            adjustment {
              type
              value
            }
          }
          prices(first: 10) {
            edges {
              node {
                variant {
                  id
                  title
                  product {
                    title
                  }
                }
                price {
                  amount
                  currencyCode
                }
                compareAtPrice {
                  amount
                  currencyCode
                }
              }
            }
          }
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

// ============================================
// CUSTOMER SEGMENTS (Marketing)
// ============================================

export const CUSTOMER_SEGMENTS_QUERY = `
  query CustomerSegments($first: Int!, $after: String) {
    segments(first: $first, after: $after) {
      edges {
        node {
          id
          name
          query
          creationDate
          lastEditDate
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const CUSTOMER_SEGMENT_MEMBERS_QUERY = `
  query CustomerSegmentMembers($segmentId: ID!, $first: Int!, $after: String) {
    customerSegmentMembers(segmentId: $segmentId, first: $first, after: $after) {
      edges {
        node {
          id
          firstName
          lastName
          email
          ordersCount
          totalSpentV2 {
            amount
            currencyCode
          }
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

// ============================================
// AUTOMATIONS (Shopify Flow / Marketing)
// ============================================

export const AUTOMATIONS_QUERY = `
  query Automations($first: Int!, $after: String) {
    automations(first: $first, after: $after) {
      edges {
        node {
          id
          name
          status
          trigger {
            type
          }
          legacyResourceId
          createdAt
          updatedAt
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

// ============================================
// PUBLICATIONS / SALES CHANNELS
// ============================================

export const PUBLICATIONS_QUERY = `
  query Publications($first: Int!) {
    publications(first: $first) {
      edges {
        node {
          id
          name
          supportsFuturePublishing
          app {
            id
            title
          }
        }
      }
    }
  }
`;

export const PRODUCT_PUBLICATIONS_QUERY = `
  query ProductPublications($productId: ID!) {
    product(id: $productId) {
      id
      title
      resourcePublicationsV2(first: 20) {
        edges {
          node {
            publication {
              id
              name
            }
            isPublished
            publishDate
          }
        }
      }
    }
  }
`;

export const PUBLISH_PRODUCT_MUTATION = `
  mutation PublishablePublish($id: ID!, $input: [PublicationInput!]!) {
    publishablePublish(id: $id, input: $input) {
      publishable {
        ... on Product {
          id
          title
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const UNPUBLISH_PRODUCT_MUTATION = `
  mutation PublishableUnpublish($id: ID!, $input: [PublicationInput!]!) {
    publishableUnpublish(id: $id, input: $input) {
      publishable {
        ... on Product {
          id
          title
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;
