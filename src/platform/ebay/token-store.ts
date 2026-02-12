/**
 * File-based eBay token store
 *
 * Persists OAuth tokens to a local JSON file (.ebay_tokens.json).
 * Handles auto-refresh when tokens are expired.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { maskSecret, type EbayOAuthConfig } from '../../util/env.js';
import { refreshAccessToken, type EbayTokenData } from './oauth.js';

/**
 * Stored token data format
 */
export interface StoredTokens {
  env: 'sandbox' | 'production';
  state?: string;
  user_access_token: string;
  refresh_token: string;
  expires_at: number;
  scopes: string[];
}

/**
 * Resolve token file path (relative to cwd or absolute)
 */
function resolveTokenPath(filePath: string): string {
  return path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);
}

/**
 * Read stored tokens from file
 */
export function readTokens(filePath: string): StoredTokens | null {
  const absPath = resolveTokenPath(filePath);
  try {
    if (!fs.existsSync(absPath)) return null;
    const content = fs.readFileSync(absPath, 'utf-8');
    const data = JSON.parse(content) as StoredTokens;
    if (!data.user_access_token || !data.refresh_token) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Write tokens to file (mode 0o600 for security)
 */
export function writeTokens(filePath: string, tokens: StoredTokens): void {
  const absPath = resolveTokenPath(filePath);
  fs.writeFileSync(absPath, JSON.stringify(tokens, null, 2), {
    encoding: 'utf-8',
    mode: 0o600,
  });
  console.info(`Tokens saved to ${absPath}`);
}

/**
 * Save state to token file (pre-auth step)
 */
export function saveState(filePath: string, env: 'sandbox' | 'production', state: string): void {
  const existing = readTokens(filePath);
  const data: StoredTokens = existing || {
    env,
    user_access_token: '',
    refresh_token: '',
    expires_at: 0,
    scopes: [],
  };
  data.state = state;
  data.env = env;
  writeTokens(filePath, data);
}

/**
 * Read saved state from token file
 */
export function readState(filePath: string): string | null {
  const tokens = readTokens(filePath);
  return tokens?.state || null;
}

/**
 * Save token exchange result
 */
export function saveTokenData(
  filePath: string,
  config: EbayOAuthConfig,
  tokenData: EbayTokenData,
): void {
  const expiresAt = Math.floor(Date.now() / 1000) + tokenData.expires_in;
  const tokens: StoredTokens = {
    env: config.env,
    user_access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_at: expiresAt,
    scopes: config.scopes,
  };
  writeTokens(filePath, tokens);
  console.info(
    `Access token: ${maskSecret(tokenData.access_token)}`,
  );
  console.info(
    `Expires at: ${new Date(expiresAt * 1000).toISOString()}`,
  );
}

/**
 * Get a valid access token, auto-refreshing if expired.
 * Returns the access token string.
 * Throws if no tokens stored or refresh fails.
 */
export async function getValidAccessToken(config: EbayOAuthConfig): Promise<string> {
  const tokens = readTokens(config.tokenFilePath);
  if (!tokens || !tokens.user_access_token) {
    throw new Error('No stored tokens. Run `npm run ebay:auth` first.');
  }

  const now = Math.floor(Date.now() / 1000);
  const BUFFER_SECONDS = 300; // 5 minutes

  if (tokens.expires_at > now + BUFFER_SECONDS) {
    return tokens.user_access_token;
  }

  // Token expired or about to expire — refresh
  console.info('Access token expired, refreshing...');
  const newData = await refreshAccessToken(config, tokens.refresh_token);

  // Save refreshed tokens (preserve refresh_token if not returned)
  const refreshedTokens: StoredTokens = {
    env: config.env,
    user_access_token: newData.access_token,
    refresh_token: newData.refresh_token || tokens.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + newData.expires_in,
    scopes: config.scopes,
  };
  writeTokens(config.tokenFilePath, refreshedTokens);

  return newData.access_token;
}
