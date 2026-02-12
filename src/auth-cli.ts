#!/usr/bin/env node
/**
 * eBay OAuth CLI — one-stop authentication flow
 *
 * Usage: npm run ebay:auth
 *
 * 1. Generates OAuth consent URL
 * 2. Starts local callback server
 * 3. Waits for eBay redirect with authorization code
 * 4. Exchanges code for tokens and saves to .ebay_tokens.json
 * 5. Tests Sell Inventory API call
 */

import * as http from 'node:http';
import { loadEbayOAuthConfig, maskSecret } from './util/env.js';
import {
  buildConsentUrl,
  generateState,
  exchangeCodeForTokens,
  getApiBase,
} from './platform/ebay/oauth.js';
import {
  saveState,
  readState,
  saveTokenData,
} from './platform/ebay/token-store.js';

async function main(): Promise<void> {
  console.info('=== eBay OAuth Authentication ===\n');

  // Load config
  let config;
  try {
    config = loadEbayOAuthConfig();
  } catch (err) {
    console.error('Failed to load eBay OAuth config.');
    console.error('Make sure .env has EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, EBAY_REDIRECT_URI.');
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  console.info(`Environment: ${config.env}`);
  console.info(`Client ID: ${maskSecret(config.clientId)}`);
  console.info(`Redirect URI: ${config.redirectUri}`);
  console.info(`Scopes: ${config.scopes.length} scope(s)`);
  console.info(`Token file: ${config.tokenFilePath}\n`);

  // Generate state
  const state = generateState();
  saveState(config.tokenFilePath, config.env, state);

  // Build consent URL
  const consentUrl = buildConsentUrl(config, state);
  console.info('Open this URL in your browser to authorize:\n');
  console.info(`  ${consentUrl}\n`);

  // Parse redirect URI to determine callback port and path
  const redirectUrl = new URL(config.redirectUri);
  const callbackPort = parseInt(redirectUrl.port || '3457', 10);
  const callbackPath = redirectUrl.pathname;

  console.info(`Waiting for callback on http://localhost:${callbackPort}${callbackPath} ...\n`);

  // Start local server to receive callback
  await new Promise<void>((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const reqUrl = new URL(req.url || '/', `http://localhost:${callbackPort}`);

        if (req.method !== 'GET' || reqUrl.pathname !== callbackPath) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not found');
          return;
        }

        const code = reqUrl.searchParams.get('code');
        const returnedState = reqUrl.searchParams.get('state');
        const error = reqUrl.searchParams.get('error');

        if (error) {
          const errorDesc = reqUrl.searchParams.get('error_description') || error;
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`<h1>Authorization Failed</h1><p>${errorDesc}</p>`);
          console.error(`Authorization error: ${errorDesc}`);
          server.close();
          reject(new Error(errorDesc));
          return;
        }

        if (!code || !returnedState) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<h1>Missing code or state</h1>');
          server.close();
          reject(new Error('Missing code or state'));
          return;
        }

        // Verify state
        const savedState = readState(config.tokenFilePath);
        if (returnedState !== savedState) {
          res.writeHead(403, { 'Content-Type': 'text/html' });
          res.end('<h1>State mismatch — possible CSRF attack</h1>');
          console.error('State verification failed!');
          server.close();
          reject(new Error('State mismatch'));
          return;
        }

        console.info('Authorization code received, exchanging for tokens...');

        // Exchange code for tokens
        const tokenData = await exchangeCodeForTokens(config, code);
        saveTokenData(config.tokenFilePath, config, tokenData);

        // Test API call
        console.info('\nTesting Sell Inventory API...');
        const apiBase = getApiBase(config.env);
        const testRes = await fetch(
          `${apiBase}/sell/inventory/v1/inventory_item?limit=1`,
          {
            headers: {
              'Authorization': `Bearer ${tokenData.access_token}`,
              'Content-Type': 'application/json',
            },
          },
        );

        if (testRes.ok) {
          const testData = await testRes.json();
          console.info(`API test successful! Status: ${testRes.status}`);
          console.info(`Response: ${JSON.stringify(testData, null, 2).slice(0, 500)}`);
        } else {
          const errBody = await testRes.text().catch(() => '');
          console.warn(`API test returned ${testRes.status}: ${errBody.slice(0, 300)}`);
          console.warn('(This may be normal for a new sandbox account with no inventory)');
        }

        // Send success response to browser
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html><body style="font-family: sans-serif; padding: 2em; text-align: center;">
            <h1>Authorization Successful</h1>
            <p>Tokens saved to <code>${config.tokenFilePath}</code></p>
            <p>You can close this window.</p>
          </body></html>
        `);

        console.info('\nAuthentication complete! You can close the browser tab.');
        server.close();
        resolve();
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end(`<h1>Error</h1><p>${err instanceof Error ? err.message : 'Unknown error'}</p>`);
        server.close();
        reject(err);
      }
    });

    server.listen(callbackPort, () => {
      console.info(`Local callback server started on port ${callbackPort}`);
    });

    server.on('error', (err) => {
      console.error(`Server error: ${err.message}`);
      reject(err);
    });
  });
}

main().catch((err) => {
  console.error('\nAuthentication failed:');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
