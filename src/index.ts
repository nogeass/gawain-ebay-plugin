/**
 * gawain-ebay-plugin
 * SDK / reference implementation for eBay -> Gawain video generation
 */

// --- Conversion (primary API) ---
export { toGawainJobInput, validateEbayItem } from './platform/ebay/convert.js';
export { fetchInventoryItems, fetchOffers, type FetchEbayItemsOptions, type FetchEbayOffersOptions } from './platform/ebay/fetch.js';
export { createVideoResource, uploadVideoContent, getVideoStatus, type CreateVideoOptions, type UploadVideoOptions, type GetVideoStatusOptions } from './platform/ebay/video.js';
export type { EbayInventoryItem, EbayOffer, EbayVideoResource, ConvertOptions } from './platform/ebay/types.js';

// --- Gawain client ---
export { GawainClient, createConfigFromEnv, type GawainClientConfig } from './gawain/client.js';
export {
  type ProductInput,
  type GawainJobInput,
  type CreateJobRequest,
  type CreateJobResponse,
  type GetJobResponse,
  type JobStatus,
  GawainApiError,
} from './gawain/types.js';

// --- Install ID (convenience for local/demo use) ---
export {
  getOrCreateInstallId,
  generateInstallId,
  readInstallId,
  writeInstallId,
  buildUpgradeUrl,
} from './install/install_id.js';

// --- eBay OAuth ---
export {
  buildConsentUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  generateState,
  getApiBase,
  getAuthBase,
  type EbayTokenData,
} from './platform/ebay/oauth.js';
export {
  readTokens,
  writeTokens,
  saveTokenData,
  getValidAccessToken,
  type StoredTokens,
} from './platform/ebay/token-store.js';

// --- Utilities ---
export { loadEnvConfig, loadEbayOAuthConfig, maskSecret, type EnvConfig, type EbayOAuthConfig } from './util/env.js';
export { withRetry, sleep, isRetryableError, type RetryOptions } from './util/retry.js';
