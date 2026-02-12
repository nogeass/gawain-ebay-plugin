#!/usr/bin/env node
/**
 * HTTP wrapper for gawain-ebay-plugin
 *
 * Endpoints:
 *   POST /convert              — eBay listing JSON -> GawainJobInput (stateless)
 *   POST /demo/create-preview  — Create a Gawain job (free preview without API key)
 *   GET  /oauth/ebay/login     — Start eBay OAuth flow (redirect to eBay)
 *   GET  /oauth/ebay/callback  — eBay OAuth callback (exchange code, save tokens)
 *
 * Usage: npm run serve
 */

import * as http from 'node:http';
import { toGawainJobInput, validateEbayItem } from './platform/ebay/convert.js';
import type { ConvertOptions } from './platform/ebay/types.js';
import { GawainClient, createConfigFromEnv } from './gawain/client.js';
import { loadEnvConfig, loadEbayOAuthConfig } from './util/env.js';
import {
  buildConsentUrl,
  generateState,
  exchangeCodeForTokens,
} from './platform/ebay/oauth.js';
import {
  saveState,
  readState,
  saveTokenData,
} from './platform/ebay/token-store.js';

const PORT = parseInt(process.env.PORT || '3457', 10);

function parseBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function sendHtml(res: http.ServerResponse, status: number, html: string): void {
  res.writeHead(status, { 'Content-Type': 'text/html' });
  res.end(html);
}

async function handleConvert(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = (await parseBody(req)) as { product?: unknown; options?: ConvertOptions };

  if (!body.product || !validateEbayItem(body.product)) {
    sendJson(res, 400, { error: 'Invalid eBay inventory item' });
    return;
  }

  const result = toGawainJobInput(body.product, undefined, body.options);
  sendJson(res, 200, result);
}

async function handleCreatePreview(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const envConfig = loadEnvConfig();
  const client = new GawainClient(createConfigFromEnv(envConfig));

  const body = (await parseBody(req)) as {
    installId?: string;
    product?: unknown;
    options?: ConvertOptions;
  };

  if (!body.product || !validateEbayItem(body.product)) {
    sendJson(res, 400, { error: 'Invalid eBay inventory item' });
    return;
  }
  if (!body.installId) {
    sendJson(res, 400, { error: 'installId is required' });
    return;
  }

  const input = toGawainJobInput(body.product, undefined, body.options);
  const job = await client.createJob(body.installId, input);
  sendJson(res, 201, job);
}

function handleOAuthLogin(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
): void {
  let config;
  try {
    config = loadEbayOAuthConfig();
  } catch {
    sendJson(res, 500, { error: 'eBay OAuth not configured. Set EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, EBAY_REDIRECT_URI in .env' });
    return;
  }

  const state = generateState();
  saveState(config.tokenFilePath, config.env, state);

  const url = buildConsentUrl(config, state);
  res.writeHead(302, { Location: url });
  res.end();
}

async function handleOAuthCallback(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const reqUrl = new URL(req.url || '/', `http://localhost:${PORT}`);
  const code = reqUrl.searchParams.get('code');
  const returnedState = reqUrl.searchParams.get('state');
  const error = reqUrl.searchParams.get('error');

  if (error) {
    const desc = reqUrl.searchParams.get('error_description') || error;
    sendHtml(res, 400, `<h1>Authorization Failed</h1><p>${desc}</p>`);
    return;
  }

  if (!code || !returnedState) {
    sendHtml(res, 400, '<h1>Missing code or state parameter</h1>');
    return;
  }

  let config;
  try {
    config = loadEbayOAuthConfig();
  } catch {
    sendJson(res, 500, { error: 'eBay OAuth not configured' });
    return;
  }

  // Verify state
  const savedState = readState(config.tokenFilePath);
  if (returnedState !== savedState) {
    sendHtml(res, 403, '<h1>State mismatch</h1><p>Possible CSRF attack. Try again.</p>');
    return;
  }

  // Exchange code for tokens
  const tokenData = await exchangeCodeForTokens(config, code);
  saveTokenData(config.tokenFilePath, config, tokenData);

  sendHtml(res, 200, `
    <html><body style="font-family: sans-serif; padding: 2em; text-align: center;">
      <h1>Authorization Successful</h1>
      <p>Tokens saved to <code>${config.tokenFilePath}</code></p>
      <p>You can close this window.</p>
    </body></html>
  `);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://localhost:${PORT}`);

    if (req.method === 'POST' && url.pathname === '/convert') {
      await handleConvert(req, res);
    } else if (req.method === 'POST' && url.pathname === '/demo/create-preview') {
      await handleCreatePreview(req, res);
    } else if (req.method === 'GET' && url.pathname === '/oauth/ebay/login') {
      handleOAuthLogin(req, res);
    } else if (req.method === 'GET' && url.pathname === '/oauth/ebay/callback') {
      await handleOAuthCallback(req, res);
    } else {
      sendJson(res, 404, { error: 'Not found' });
    }
  } catch (err) {
    sendJson(res, 500, { error: err instanceof Error ? err.message : 'Internal error' });
  }
});

server.listen(PORT, () => {
  console.info(`gawain-ebay-plugin server listening on port ${PORT}`);
  console.info(`  OAuth login:    http://localhost:${PORT}/oauth/ebay/login`);
  console.info(`  OAuth callback: http://localhost:${PORT}/oauth/ebay/callback`);
});
