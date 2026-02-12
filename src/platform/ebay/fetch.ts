/**
 * eBay Sell Inventory API fetcher (read-only)
 *
 * The access token is always caller-provided and never stored
 * or loaded from environment by this module.
 */

import type { EbayInventoryItem, EbayOffer } from './types.js';

const EBAY_API_BASE = 'https://api.ebay.com';
const EBAY_SANDBOX_API_BASE = 'https://api.sandbox.ebay.com';

export interface FetchEbayItemsOptions {
  /** eBay API access token (caller-provided) */
  accessToken: string;
  /** Use eBay sandbox environment */
  sandbox?: boolean;
  /** Maximum items to return (default: 50) */
  limit?: number;
  /** Offset for pagination (default: 0) */
  offset?: number;
}

export interface FetchEbayOffersOptions {
  /** eBay API access token (caller-provided) */
  accessToken: string;
  /** SKU to look up offers for */
  sku: string;
  /** Use eBay sandbox environment */
  sandbox?: boolean;
}

/**
 * Fetch inventory items from eBay Sell Inventory API.
 */
export async function fetchInventoryItems(
  opts: FetchEbayItemsOptions,
): Promise<{ items: EbayInventoryItem[]; total: number }> {
  const base = opts.sandbox ? EBAY_SANDBOX_API_BASE : EBAY_API_BASE;
  const limit = opts.limit || 50;
  const offset = opts.offset || 0;

  const response = await fetch(
    `${base}/sell/inventory/v1/inventory_item?limit=${limit}&offset=${offset}`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${opts.accessToken}`,
        'Content-Type': 'application/json',
        'Accept-Language': 'en-US',
      },
    },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `eBay Inventory API error: ${response.status} ${response.statusText} — ${body}`,
    );
  }

  const json = (await response.json()) as {
    inventoryItems?: EbayInventoryItem[];
    total?: number;
  };

  return {
    items: json.inventoryItems || [],
    total: json.total || 0,
  };
}

/**
 * Fetch offers for a specific SKU from eBay Sell Inventory API.
 */
export async function fetchOffers(
  opts: FetchEbayOffersOptions,
): Promise<EbayOffer[]> {
  const base = opts.sandbox ? EBAY_SANDBOX_API_BASE : EBAY_API_BASE;

  const response = await fetch(
    `${base}/sell/inventory/v1/offer?sku=${encodeURIComponent(opts.sku)}&limit=10`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${opts.accessToken}`,
        'Content-Type': 'application/json',
        'Accept-Language': 'en-US',
      },
    },
  );

  if (!response.ok) {
    return [];
  }

  const json = (await response.json()) as { offers?: EbayOffer[] };
  return json.offers || [];
}
