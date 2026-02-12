/**
 * eBay OAuth 2.0 Authorization Code Grant
 *
 * Handles consent URL generation, code-to-token exchange, and token refresh.
 * Supports sandbox and production environments.
 */

import * as crypto from 'node:crypto';
import { maskSecret, type EbayOAuthConfig } from '../../util/env.js';

/**
 * Token data returned from eBay token endpoint
 */
export interface EbayTokenData {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  refresh_token_expires_in?: number;
}

function getAuthBase(env: 'sandbox' | 'production'): string {
  return env === 'sandbox'
    ? 'https://auth.sandbox.ebay.com'
    : 'https://auth.ebay.com';
}

function getApiBase(env: 'sandbox' | 'production'): string {
  return env === 'sandbox'
    ? 'https://api.sandbox.ebay.com'
    : 'https://api.ebay.com';
}

/**
 * Generate a cryptographically random state parameter
 */
export function generateState(): string {
  return crypto.randomUUID();
}

/**
 * Build eBay OAuth consent URL
 */
export function buildConsentUrl(config: EbayOAuthConfig, state: string): string {
  const authBase = getAuthBase(config.env);
  const url = new URL(`${authBase}/oauth2/authorize`);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.ruName || config.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', config.scopes.join(' '));
  url.searchParams.set('state', state);
  return url.toString();
}

/**
 * Exchange authorization code for user access token + refresh token
 */
export async function exchangeCodeForTokens(
  config: EbayOAuthConfig,
  code: string,
): Promise<EbayTokenData> {
  const apiBase = getApiBase(config.env);
  const tokenUrl = `${apiBase}/identity/v1/oauth2/token`;
  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');

  console.info(`Exchanging authorization code for tokens (env: ${config.env})`);

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.ruName || config.redirectUri,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`eBay token exchange failed: ${res.status} — ${body}`);
  }

  const data = (await res.json()) as EbayTokenData;
  console.info(`Token exchange successful (expires_in: ${data.expires_in}s)`);
  return data;
}

/**
 * Refresh an expired user access token
 */
export async function refreshAccessToken(
  config: EbayOAuthConfig,
  refreshToken: string,
): Promise<EbayTokenData> {
  const apiBase = getApiBase(config.env);
  const tokenUrl = `${apiBase}/identity/v1/oauth2/token`;
  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');

  console.info(`Refreshing access token (env: ${config.env})`);

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: config.scopes.join(' '),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`eBay token refresh failed: ${res.status} — ${body}`);
  }

  const data = (await res.json()) as EbayTokenData;
  console.info(`Token refresh successful (expires_in: ${data.expires_in}s)`);
  return data;
}

/**
 * Get eBay API base URL for the configured environment
 */
export { getApiBase, getAuthBase };
