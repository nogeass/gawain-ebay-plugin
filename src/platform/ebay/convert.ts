/**
 * eBay → Gawain conversion (pure functions, no I/O)
 */

import type { GawainJobInput } from '../../gawain/types.js';
import type { EbayInventoryItem, EbayOffer, ConvertOptions } from './types.js';

const DEFAULT_MAX_IMAGES = 3;
const DEFAULT_MAX_TITLE_LENGTH = 80;
const DEFAULT_MAX_DESCRIPTION_LENGTH = 200;

/**
 * Strip HTML tags from a string.
 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

/**
 * Truncate a string to maxLength, appending '...' if truncated.
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + '\u2026';
}

/**
 * Convert an eBay inventory item to Gawain job input.
 *
 * Pure function — no side effects, no I/O.
 */
export function toGawainJobInput(
  item: EbayInventoryItem,
  offer?: EbayOffer,
  opts?: ConvertOptions,
): GawainJobInput {
  const maxImages = Math.max(1, Math.min(opts?.maxImages ?? DEFAULT_MAX_IMAGES, 3));
  const maxTitleLength = opts?.maxTitleLength ?? DEFAULT_MAX_TITLE_LENGTH;
  const maxDescriptionLength = opts?.maxDescriptionLength ?? DEFAULT_MAX_DESCRIPTION_LENGTH;

  // Title: truncate if too long
  const title = truncate(item.product.title, maxTitleLength);

  // Description: strip HTML, then truncate
  const rawDescription = item.product.description ? stripHtml(item.product.description) : undefined;
  const description = rawDescription
    ? truncate(rawDescription, maxDescriptionLength)
    : undefined;

  // Images: limit count
  const images = (item.product.imageUrls || []).slice(0, maxImages);

  // Price from offer
  const price = offer?.pricingSummary?.price
    ? {
        amount: offer.pricingSummary.price.value,
        currency: offer.pricingSummary.price.currency || opts?.currency || 'USD',
      }
    : undefined;

  // Listing ID from offer
  const listingId = offer?.listing?.listingId || offer?.listingId;

  return {
    id: item.sku,
    title,
    description,
    images,
    price,
    metadata: {
      source: 'ebay',
      sku: item.sku,
      listingId,
      condition: item.condition,
      ...(opts?.templateText ? { templateText: opts.templateText } : {}),
    },
  };
}

/**
 * Validate that a value has the required shape of an EbayInventoryItem.
 */
export function validateEbayItem(item: unknown): item is EbayInventoryItem {
  if (!item || typeof item !== 'object') {
    return false;
  }

  const i = item as Record<string, unknown>;

  if (typeof i.sku !== 'string' || !i.sku.trim()) {
    return false;
  }

  if (!i.product || typeof i.product !== 'object') {
    return false;
  }

  const product = i.product as Record<string, unknown>;
  if (typeof product.title !== 'string' || !product.title.trim()) {
    return false;
  }

  return true;
}
