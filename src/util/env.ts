/**
 * Environment configuration utilities
 */

export interface EnvConfig {
  gawainApiBase: string;
  gawainApiKey: string;
  gawainAppId: string;
  kinosukeUpgradeUrl: string;
  pollIntervalMs: number;
  pollMaxAttempts: number;
}

const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_POLL_MAX_ATTEMPTS = 60;

function getRequired(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getOptional(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

function getOptionalNumber(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Invalid numeric value for ${name}: ${value}`);
  }
  return parsed;
}

/**
 * Load and validate environment configuration
 */
export function loadEnvConfig(): EnvConfig {
  return {
    gawainApiBase: getRequired('GAWAIN_API_BASE'),
    gawainApiKey: getOptional('GAWAIN_API_KEY', ''),
    gawainAppId: getOptional('GAWAIN_APP_ID', ''),
    kinosukeUpgradeUrl: getOptional('KINOSUKE_UPGRADE_URL', 'https://kinosuke.example.com/upgrade'),
    pollIntervalMs: getOptionalNumber('GAWAIN_POLL_INTERVAL_MS', DEFAULT_POLL_INTERVAL_MS),
    pollMaxAttempts: getOptionalNumber('GAWAIN_POLL_MAX_ATTEMPTS', DEFAULT_POLL_MAX_ATTEMPTS),
  };
}

/**
 * Mask sensitive values for logging
 */
export function maskSecret(value: string, visibleChars = 4): string {
  if (value.length <= visibleChars * 2) {
    return '****';
  }
  return value.slice(0, visibleChars) + '****' + value.slice(-visibleChars);
}

/**
 * eBay OAuth configuration
 */
export interface EbayOAuthConfig {
  env: 'sandbox' | 'production';
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
  ruName?: string;
  tokenFilePath: string;
}

const DEFAULT_EBAY_SCOPES = [
  'https://api.ebay.com/oauth/api_scope/sell.inventory',
  'https://api.ebay.com/oauth/api_scope/sell.marketing',
  'https://api.ebay.com/oauth/api_scope/sell.account',
];

/**
 * Load eBay OAuth configuration from environment variables
 */
export function loadEbayOAuthConfig(): EbayOAuthConfig {
  const env = getOptional('EBAY_ENV', 'sandbox') as 'sandbox' | 'production';
  return {
    env,
    clientId: getRequired('EBAY_CLIENT_ID'),
    clientSecret: getRequired('EBAY_CLIENT_SECRET'),
    redirectUri: getRequired('EBAY_REDIRECT_URI'),
    scopes: process.env.EBAY_SCOPES
      ? process.env.EBAY_SCOPES.split(' ').filter(Boolean)
      : DEFAULT_EBAY_SCOPES,
    ruName: process.env.EBAY_RU_NAME || undefined,
    tokenFilePath: getOptional('EBAY_TOKEN_FILE', '.ebay_tokens.json'),
  };
}
