/**
 * eBay platform types
 * See: https://developer.ebay.com/api-docs/sell/inventory/resources/inventory_item
 */

/**
 * eBay inventory item from Sell Inventory API
 */
export interface EbayInventoryItem {
  sku: string;
  locale?: string;
  product: {
    title: string;
    description?: string;
    imageUrls?: string[];
    aspects?: Record<string, string[]>;
  };
  condition?: string;
  availability?: {
    shipToLocationAvailability?: {
      quantity?: number;
    };
  };
}

/**
 * eBay offer (links inventory item to listing)
 */
export interface EbayOffer {
  offerId: string;
  sku: string;
  listingId?: string;
  pricingSummary?: {
    price?: {
      value: string;
      currency: string;
    };
  };
  listing?: {
    listingId: string;
  };
}

/**
 * eBay video resource from Sell Static Content API
 */
export interface EbayVideoResource {
  videoId: string;
  title: string;
  description?: string;
  status: 'LIVE' | 'BLOCKED' | 'PROCESSING' | 'UPLOADED';
  statusMessage?: string;
}

/**
 * Options for eBay-to-Gawain conversion
 */
export interface ConvertOptions {
  /** Override promotional template text */
  templateText?: string;
  /** Currency code (default: 'USD') */
  currency?: string;
  /** Maximum number of images to include (1–3, default 3) */
  maxImages?: number;
  /** Maximum title length before truncation (default 80) */
  maxTitleLength?: number;
  /** Maximum description length before truncation (default 200) */
  maxDescriptionLength?: number;
}
