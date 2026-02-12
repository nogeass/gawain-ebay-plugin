#!/usr/bin/env node
/**
 * Sandbox-only: Call Trading API ValidateTestUserRegistration
 * to set up a sandbox test user as a seller.
 *
 * Usage: npm run sandbox:seller:setup
 *
 * Uses node:https instead of fetch because eBay OAuth tokens are large
 * and undici's fetch may hit header size limits on the Trading API endpoint.
 */

import * as fs from 'node:fs';
import * as https from 'node:https';
import * as path from 'node:path';

const SANDBOX_TRADING_HOST = 'open.api.sandbox.ebay.com';
const TRADING_PATH = '/ws/api.dll';
const COMPATIBILITY_LEVEL = '1349';

interface TradingConfig {
  appId: string;
  devId: string;
  certId: string;
  authToken: string | null;
  oauthToken: string | null;
  siteId: string;
}

function loadConfig(): TradingConfig {
  const appId = process.env.EBAY_TRADING_APP_ID || process.env.EBAY_CLIENT_ID || '';
  const devId = process.env.EBAY_TRADING_DEV_ID || process.env.EBAY_DEV_ID || '';
  const certId = process.env.EBAY_TRADING_CERT_ID || process.env.EBAY_CLIENT_SECRET || '';
  const authToken = process.env.EBAY_TRADING_AUTH_TOKEN || null;
  const siteId = process.env.EBAY_SITE_ID || '0';

  let oauthToken: string | null = null;
  const tokenFile = process.env.EBAY_TOKEN_FILE || '.ebay_tokens.json';
  const tokenPath = path.resolve(process.cwd(), tokenFile);
  try {
    if (fs.existsSync(tokenPath)) {
      const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
      oauthToken = tokens.user_access_token || null;
    }
  } catch { /* ignore */ }

  if (!appId || !devId || !certId) {
    console.error('Missing Trading API credentials.');
    console.error('Set EBAY_TRADING_APP_ID (or EBAY_CLIENT_ID), EBAY_TRADING_DEV_ID (or EBAY_DEV_ID), EBAY_TRADING_CERT_ID (or EBAY_CLIENT_SECRET) in .env');
    process.exit(1);
  }

  if (!authToken && !oauthToken) {
    console.error('Missing auth token.');
    console.error('Set EBAY_TRADING_AUTH_TOKEN in .env, or run `npm run ebay:auth` first.');
    process.exit(1);
  }

  return { appId, devId, certId, authToken, oauthToken, siteId };
}

function buildXmlRequest(config: TradingConfig): string {
  const tokenXml = config.authToken
    ? `<RequesterCredentials><eBayAuthToken>${config.authToken}</eBayAuthToken></RequesterCredentials>`
    : '';

  return `<?xml version="1.0" encoding="utf-8"?>
<ValidateTestUserRegistrationRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  ${tokenXml}
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <Version>${COMPATIBILITY_LEVEL}</Version>
</ValidateTestUserRegistrationRequest>`;
}

function parseXmlTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`);
  const match = xml.match(re);
  return match ? match[1].trim() : null;
}

function httpsPost(config: TradingConfig, body: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      'Content-Type': 'text/xml',
      'Content-Length': String(Buffer.byteLength(body)),
      'X-EBAY-API-CALL-NAME': 'ValidateTestUserRegistration',
      'X-EBAY-API-SITEID': config.siteId,
      'X-EBAY-API-COMPATIBILITY-LEVEL': COMPATIBILITY_LEVEL,
      'X-EBAY-API-APP-NAME': config.appId,
      'X-EBAY-API-DEV-NAME': config.devId,
      'X-EBAY-API-CERT-NAME': config.certId,
    };

    if (!config.authToken && config.oauthToken) {
      headers['X-EBAY-API-IAF-TOKEN'] = config.oauthToken;
    }

    const req = https.request(
      { hostname: SANDBOX_TRADING_HOST, path: TRADING_PATH, method: 'POST', headers },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => (data += chunk.toString()));
        res.on('end', () => resolve(data));
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main(): Promise<void> {
  console.info('=== ValidateTestUserRegistration (Sandbox) ===\n');

  if (process.env.EBAY_ENV !== 'sandbox') {
    console.error('EBAY_ENV must be "sandbox". Refusing to run against production.');
    process.exit(1);
  }

  const config = loadConfig();
  console.info(`App ID: ${config.appId.slice(0, 8)}****`);
  console.info(`Dev ID: ${config.devId.slice(0, 8)}****`);
  console.info(`Auth method: ${config.authToken ? "Auth'n'Auth token" : 'OAuth IAF token'}`);
  console.info(`Site ID: ${config.siteId}\n`);

  const xmlBody = buildXmlRequest(config);

  console.info('Calling ValidateTestUserRegistration...');

  const responseXml = await httpsPost(config, xmlBody);
  const ack = parseXmlTag(responseXml, 'Ack');

  if (ack === 'Success' || ack === 'Warning') {
    console.info(`Ack: ${ack}`);
    if (ack === 'Warning') {
      const shortMsg = parseXmlTag(responseXml, 'ShortMessage');
      if (shortMsg) console.warn(`Warning: ${shortMsg}`);
    }
    console.info('\nSandbox seller registration successful!');
  } else {
    console.error(`Ack: ${ack || 'unknown'}`);
    const errorCode = parseXmlTag(responseXml, 'ErrorCode');
    const shortMessage = parseXmlTag(responseXml, 'ShortMessage');
    const longMessage = parseXmlTag(responseXml, 'LongMessage');

    if (errorCode) console.error(`Error code: ${errorCode}`);
    if (shortMessage) console.error(`Short message: ${shortMessage}`);
    if (longMessage) console.error(`Long message: ${longMessage}`);

    if (shortMessage?.includes('token') || shortMessage?.includes('Auth')) {
      console.error('\nHint: Auth token may be invalid/expired. Re-run `npm run ebay:auth` or set EBAY_TRADING_AUTH_TOKEN.');
    } else if (shortMessage?.includes('not found') || shortMessage?.includes('User')) {
      console.error('\nHint: Sandbox username must have TESTUSER_ prefix.');
    } else if (shortMessage?.includes('denied') || shortMessage?.includes('not allowed')) {
      console.error('\nHint: Ensure EBAY_ENV=sandbox and EBAY_SITE_ID is correct.');
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Script failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
