#!/usr/bin/env node
/**
 * Sandbox-only: Call Sell Account API getPrivileges
 * to verify sellerRegistrationCompleted status.
 *
 * Supports exponential backoff retry for post-registration propagation.
 *
 * Usage: npm run sandbox:seller:check
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const MAX_RETRIES = 6;
const BACKOFF_BASE_MS = 2000; // 2, 4, 8, 16, 32, 64 seconds
const STRICT = process.argv.includes('--strict');

function getAccessToken(): string {
  // Prefer explicit env var
  const explicit = process.env.EBAY_OAUTH_USER_TOKEN;
  if (explicit) return explicit;

  // Fall back to token store
  const tokenFile = process.env.EBAY_TOKEN_FILE || '.ebay_tokens.json';
  const tokenPath = path.resolve(process.cwd(), tokenFile);
  try {
    if (fs.existsSync(tokenPath)) {
      const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
      if (tokens.user_access_token) return tokens.user_access_token;
    }
  } catch { /* ignore */ }

  console.error('No OAuth user token found.');
  console.error('Set EBAY_OAUTH_USER_TOKEN in .env, or run `npm run ebay:auth` first.');
  process.exit(1);
}

function getApiBase(): string {
  return process.env.EBAY_ENV === 'sandbox'
    ? 'https://api.sandbox.ebay.com'
    : 'https://api.ebay.com';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface PrivilegeResponse {
  sellerRegistrationCompleted?: boolean;
  sellingLimit?: {
    amount?: { value?: string; currency?: string };
    quantity?: number;
  };
  [key: string]: unknown;
}

async function checkPrivileges(token: string): Promise<PrivilegeResponse> {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/sell/account/v1/privilege`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept-Language': 'en-US',
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`getPrivileges failed: ${res.status} — ${body.slice(0, 300)}`);
  }

  return (await res.json()) as PrivilegeResponse;
}

async function main(): Promise<void> {
  console.info('=== Check Seller Privileges (Sandbox) ===\n');

  if (process.env.EBAY_ENV !== 'sandbox') {
    console.error('EBAY_ENV must be "sandbox". Refusing to run against production.');
    process.exit(1);
  }

  const token = getAccessToken();
  console.info(`Token source: ${process.env.EBAY_OAUTH_USER_TOKEN ? 'EBAY_OAUTH_USER_TOKEN env' : '.ebay_tokens.json'}`);
  console.info(`API: ${getApiBase()}\n`);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.info(`Attempt ${attempt}/${MAX_RETRIES}: Calling getPrivileges...`);

    try {
      const data = checkPrivileges(token);
      const result = await data;

      console.info(`  sellerRegistrationCompleted: ${result.sellerRegistrationCompleted}`);

      if (result.sellingLimit) {
        const limit = result.sellingLimit;
        if (limit.amount) {
          console.info(`  sellingLimit.amount: ${limit.amount.value} ${limit.amount.currency}`);
        }
        if (limit.quantity !== undefined) {
          console.info(`  sellingLimit.quantity: ${limit.quantity}`);
        }
      }

      if (result.sellerRegistrationCompleted === true) {
        console.info('\nSeller registration confirmed! Ready to use Sell APIs.');
        return;
      }

      if (attempt < MAX_RETRIES) {
        const waitMs = BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
        console.info(`  Not yet complete. Retrying in ${waitMs / 1000}s...\n`);
        await sleep(waitMs);
      }
    } catch (err) {
      console.error(`  Error: ${err instanceof Error ? err.message : err}`);

      if (attempt < MAX_RETRIES) {
        const waitMs = BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
        console.info(`  Retrying in ${waitMs / 1000}s...\n`);
        await sleep(waitMs);
      }
    }
  }

  console.warn('\nWarning: sellerRegistrationCompleted is still false after all retries.');
  console.warn('Possible causes:');
  console.warn('  - ValidateTestUserRegistration was not called or failed');
  console.warn('  - The sandbox user may be corrupted — try creating a new one');
  console.warn('  - Propagation delay — wait a few minutes and run `npm run sandbox:seller:check` again');

  if (STRICT) {
    console.error('\n(--strict mode: exiting with error)');
    process.exit(1);
  } else {
    console.info('\n(soft mode: exiting with success — use --strict to fail on false)');
  }
}

main().catch((err) => {
  console.error('Script failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
