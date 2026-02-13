#!/usr/bin/env node
/**
 * HTTP wrapper for gawain-ebay-plugin
 *
 * Endpoints:
 *   GET  /                        — Demo UI (eBay inventory → video generation)
 *   GET  /api/inventory           — Fetch eBay inventory items (JSON)
 *   POST /api/generate            — Start video generation for a SKU
 *   GET  /api/job/:jobId          — Poll job status
 *   POST /convert                 — eBay listing JSON -> GawainJobInput (stateless)
 *   POST /demo/create-preview     — Create a Gawain job (free preview)
 *   GET  /oauth/ebay/login        — Start eBay OAuth flow
 *   GET  /oauth/ebay/callback     — eBay OAuth callback
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
  getValidAccessToken,
} from './platform/ebay/token-store.js';
import { fetchInventoryItems, fetchOffers } from './platform/ebay/fetch.js';
import {
  createVideoResource,
  uploadVideoContent,
  getVideoStatus,
} from './platform/ebay/video.js';
import { getOrCreateInstallId } from './install/install_id.js';

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

// --- Demo UI ---

function getDemoHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Gawain AI - eBay Plugin Demo</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); color: #e0e0e0; min-height: 100vh; }
  .header { background: rgba(0,0,0,0.3); border-bottom: 1px solid rgba(255,255,255,0.1); padding: 16px 24px; display: flex; align-items: center; gap: 12px; }
  .header h1 { font-size: 20px; color: #fff; }
  .header .badge { background: #e94560; color: #fff; font-size: 11px; padding: 2px 8px; border-radius: 10px; }
  .header .ebay { color: #86868b; font-size: 13px; margin-left: auto; }
  .container { max-width: 960px; margin: 0 auto; padding: 24px; }
  .status-bar { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 12px 16px; margin-bottom: 24px; display: flex; align-items: center; gap: 8px; font-size: 13px; }
  .status-dot { width: 8px; height: 8px; border-radius: 50%; }
  .status-dot.green { background: #4ade80; }
  .status-dot.yellow { background: #fbbf24; }
  .status-dot.red { background: #f87171; }
  .section-title { font-size: 14px; color: #86868b; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; }
  .items-grid { display: grid; gap: 16px; }
  .item-card { background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 20px; display: flex; gap: 16px; transition: border-color 0.2s; }
  .item-card:hover { border-color: rgba(233,69,96,0.5); }
  .item-img { width: 120px; height: 120px; border-radius: 8px; object-fit: cover; background: rgba(255,255,255,0.05); flex-shrink: 0; }
  .item-info { flex: 1; display: flex; flex-direction: column; gap: 6px; }
  .item-title { font-size: 16px; font-weight: 600; color: #fff; }
  .item-sku { font-size: 12px; color: #86868b; font-family: monospace; }
  .item-desc { font-size: 13px; color: #a0a0a0; line-height: 1.4; }
  .item-meta { display: flex; gap: 8px; margin-top: auto; flex-wrap: wrap; }
  .tag { font-size: 11px; padding: 3px 8px; border-radius: 6px; background: rgba(255,255,255,0.08); color: #a0a0a0; }
  .btn { padding: 10px 20px; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s; display: inline-flex; align-items: center; gap: 6px; }
  .btn-primary { background: #e94560; color: #fff; }
  .btn-primary:hover { background: #d63851; transform: translateY(-1px); }
  .btn-primary:disabled { background: #555; cursor: not-allowed; transform: none; }
  .btn-sm { padding: 6px 14px; font-size: 12px; }
  .progress-section { margin-top: 24px; }
  .progress-card { background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 20px; display: none; }
  .progress-card.active { display: block; }
  .progress-bar-bg { width: 100%; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; margin: 12px 0; overflow: hidden; }
  .progress-bar { height: 100%; background: linear-gradient(90deg, #e94560, #ff6b6b); border-radius: 3px; transition: width 0.5s ease; width: 0%; }
  .progress-label { font-size: 13px; color: #86868b; }
  .result-card { background: rgba(74,222,128,0.08); border: 1px solid rgba(74,222,128,0.3); border-radius: 12px; padding: 20px; display: none; }
  .result-card.active { display: block; }
  .result-card h3 { color: #4ade80; margin-bottom: 12px; }
  .video-container { border-radius: 8px; overflow: hidden; background: #000; margin-top: 12px; }
  .video-container video { width: 100%; display: block; }
  .empty { text-align: center; padding: 48px; color: #86868b; }
  .loading { display: inline-block; width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; animation: spin 0.6s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .steps { display: flex; gap: 4px; margin: 12px 0; }
  .step { flex: 1; height: 3px; background: rgba(255,255,255,0.1); border-radius: 2px; }
  .step.done { background: #4ade80; }
  .step.current { background: #e94560; animation: pulse 1s infinite; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
  .log { font-family: monospace; font-size: 12px; color: #86868b; margin-top: 8px; max-height: 80px; overflow-y: auto; line-height: 1.6; }
</style>
</head>
<body>
<div class="header">
  <h1>GawainAI</h1>
  <span class="badge">eBay Plugin</span>
  <span class="ebay">Sandbox</span>
</div>

<div class="container">
  <div class="status-bar" id="statusBar">
    <span class="status-dot yellow"></span>
    <span>Loading inventory...</span>
  </div>

  <div class="section-title">eBay Store Inventory</div>
  <div class="items-grid" id="itemsGrid">
    <div class="empty"><span class="loading"></span> Fetching from eBay Sandbox...</div>
  </div>

  <div class="progress-section">
    <div class="progress-card" id="progressCard">
      <div style="display:flex;justify-content:between;align-items:center;">
        <strong id="progressTitle" style="color:#fff;">Generating video...</strong>
        <span id="progressPct" style="margin-left:auto;color:#e94560;font-weight:600;"></span>
      </div>
      <div class="steps" id="steps">
        <div class="step" id="step0"></div>
        <div class="step" id="step1"></div>
        <div class="step" id="step2"></div>
        <div class="step" id="step3"></div>
      </div>
      <div class="progress-bar-bg"><div class="progress-bar" id="progressBar"></div></div>
      <div class="progress-label" id="progressLabel">Starting pipeline...</div>
      <div class="log" id="logArea"></div>
    </div>

    <div class="result-card" id="resultCard">
      <h3>Video Generated</h3>
      <p style="font-size:13px;color:#a0a0a0;margin-bottom:4px;" id="resultMeta"></p>
      <div class="video-container">
        <video id="resultVideo" controls></video>
      </div>
      <div style="margin-top:12px;display:flex;gap:8px;align-items:center;">
        <a id="downloadLink" class="btn btn-primary btn-sm" target="_blank">Open Video</a>
        <button id="uploadBtn" class="btn btn-sm" style="background:#0064d2;color:#fff;" onclick="uploadToEbay()">Upload to eBay</button>
        <span id="uploadStatus" style="font-size:12px;color:#86868b;"></span>
      </div>
    </div>
  </div>
</div>

<script>
const API = '';
let currentJobId = null;
let currentDownloadUrl = null;
let currentSku = null;
let pollTimer = null;

async function loadInventory() {
  try {
    const res = await fetch(API + '/api/inventory');
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    renderItems(data.items, data.total);
    setStatus('green', 'Connected to eBay Sandbox (' + data.total + ' item' + (data.total!==1?'s':'') + ')');
  } catch (e) {
    setStatus('red', 'Failed to load: ' + e.message);
    document.getElementById('itemsGrid').innerHTML = '<div class="empty">Failed to load inventory. Check OAuth token.</div>';
  }
}

function setStatus(color, text) {
  const bar = document.getElementById('statusBar');
  bar.innerHTML = '<span class="status-dot ' + color + '"></span><span>' + text + '</span>';
}

function renderItems(items, total) {
  const grid = document.getElementById('itemsGrid');
  if (!items.length) {
    grid.innerHTML = '<div class="empty">No inventory items found.</div>';
    return;
  }
  grid.innerHTML = items.map(item => {
    const img = (item.product.imageUrls && item.product.imageUrls[0]) || '';
    const desc = (item.product.description || '').replace(/<[^>]*>/g,'').slice(0,120);
    return '<div class="item-card">'
      + (img ? '<img class="item-img" src="' + img + '" alt="">' : '<div class="item-img"></div>')
      + '<div class="item-info">'
      + '<div class="item-title">' + item.product.title + '</div>'
      + '<div class="item-sku">SKU: ' + item.sku + '</div>'
      + (desc ? '<div class="item-desc">' + desc + '</div>' : '')
      + '<div class="item-meta">'
      + (item.condition ? '<span class="tag">' + item.condition + '</span>' : '')
      + '<span class="tag">Qty: ' + ((item.availability?.shipToLocationAvailability?.quantity) || 0) + '</span>'
      + '</div>'
      + '<div style="margin-top:8px;"><button class="btn btn-primary btn-sm" onclick="generate(\\'' + item.sku + '\\')">Generate Video</button></div>'
      + '</div></div>';
  }).join('');
}

async function generate(sku) {
  document.querySelectorAll('.btn-primary').forEach(b => b.disabled = true);
  const pc = document.getElementById('progressCard');
  const rc = document.getElementById('resultCard');
  pc.classList.add('active');
  rc.classList.remove('active');
  currentSku = sku;
  setProgress(0, 'pending', 'Submitting job for ' + sku + '...');
  addLog('Creating job for SKU: ' + sku);

  try {
    const res = await fetch(API + '/api/generate', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({sku})
    });
    if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error || res.statusText); }
    const data = await res.json();
    currentJobId = data.jobId;
    addLog('Job created: ' + data.jobId);
    pollJob();
  } catch (e) {
    setProgress(0, 'failed', 'Error: ' + e.message);
    addLog('ERROR: ' + e.message);
    document.querySelectorAll('.btn-primary').forEach(b => b.disabled = false);
  }
}

async function pollJob() {
  if (!currentJobId) return;
  try {
    const res = await fetch(API + '/api/job/' + currentJobId);
    const job = await res.json();
    const p = job.progress || 0;
    setProgress(p, job.status, getStageLabel(p, job.status));

    if (job.status === 'completed') {
      addLog('Completed! Video URL: ' + job.downloadUrl);
      showResult(job);
      document.querySelectorAll('.btn-primary').forEach(b => b.disabled = false);
      return;
    }
    if (job.status === 'failed') {
      addLog('FAILED: ' + (job.error?.message || 'Unknown error'));
      document.querySelectorAll('.btn-primary').forEach(b => b.disabled = false);
      return;
    }
    pollTimer = setTimeout(pollJob, 5000);
  } catch (e) {
    addLog('Poll error: ' + e.message);
    pollTimer = setTimeout(pollJob, 10000);
  }
}

function getStageLabel(p, status) {
  if (status === 'pending') return 'Queued...';
  if (p <= 5) return 'Uploading image to pipeline...';
  if (p <= 25) return 'SAM3D: Generating 3D model...';
  if (p <= 60) return 'Studio: Rendering avatar video...';
  if (p < 100) return 'Composing final video...';
  return 'Complete!';
}

function setProgress(pct, status, label) {
  document.getElementById('progressBar').style.width = pct + '%';
  document.getElementById('progressPct').textContent = pct + '%';
  document.getElementById('progressLabel').textContent = label;
  [0,1,2,3].forEach(i => {
    const el = document.getElementById('step'+i);
    const thresholds = [5,25,60,100];
    if (pct >= thresholds[i]) el.className = 'step done';
    else if (pct >= (thresholds[i-1]||0)) el.className = 'step current';
    else el.className = 'step';
  });
}

function showResult(job) {
  const rc = document.getElementById('resultCard');
  rc.classList.add('active');
  document.getElementById('resultMeta').textContent = 'Job: ' + job.jobId;
  const video = document.getElementById('resultVideo');
  video.src = job.downloadUrl;
  document.getElementById('downloadLink').href = job.downloadUrl;
  currentDownloadUrl = job.downloadUrl;
  document.getElementById('uploadBtn').disabled = false;
  document.getElementById('uploadStatus').textContent = '';
}

async function uploadToEbay() {
  if (!currentDownloadUrl || !currentSku) return;
  const btn = document.getElementById('uploadBtn');
  const status = document.getElementById('uploadStatus');
  btn.disabled = true;
  status.textContent = 'Uploading to eBay...';
  status.style.color = '#fbbf24';
  addLog('Uploading video to eBay for SKU: ' + currentSku);

  try {
    const res = await fetch(API + '/api/upload', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ sku: currentSku, videoUrl: currentDownloadUrl })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    status.textContent = 'Uploaded! Video ID: ' + data.videoId + ' (' + data.ebayStatus + ')';
    status.style.color = '#4ade80';
    addLog('eBay upload complete. Video ID: ' + data.videoId + ', status: ' + data.ebayStatus);
  } catch (e) {
    status.textContent = 'Upload failed: ' + e.message;
    status.style.color = '#f87171';
    addLog('eBay upload error: ' + e.message);
    btn.disabled = false;
  }
}

function addLog(msg) {
  const el = document.getElementById('logArea');
  const t = new Date().toLocaleTimeString();
  el.textContent += t + '  ' + msg + '\\n';
  el.scrollTop = el.scrollHeight;
}

loadInventory();
</script>
</body>
</html>`;
}

// --- API endpoints for Demo UI ---

async function handleApiInventory(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const oauthConfig = loadEbayOAuthConfig();
  const accessToken = await getValidAccessToken(oauthConfig);
  const isSandbox = oauthConfig.env === 'sandbox';
  const { items, total } = await fetchInventoryItems({ accessToken, sandbox: isSandbox, limit: 20 });
  sendJson(res, 200, { items, total });
}

async function handleApiGenerate(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = (await parseBody(req)) as { sku?: string };
  if (!body.sku) {
    sendJson(res, 400, { error: 'sku is required' });
    return;
  }

  const oauthConfig = loadEbayOAuthConfig();
  const accessToken = await getValidAccessToken(oauthConfig);
  const isSandbox = oauthConfig.env === 'sandbox';

  // Fetch the specific item
  const { items } = await fetchInventoryItems({ accessToken, sandbox: isSandbox, limit: 50 });
  const item = items.find((i) => i.sku === body.sku);
  if (!item) {
    sendJson(res, 404, { error: `SKU "${body.sku}" not found` });
    return;
  }

  if (!validateEbayItem(item)) {
    sendJson(res, 400, { error: 'Item validation failed' });
    return;
  }

  // Get offers for price
  const offers = await fetchOffers({ accessToken, sku: item.sku, sandbox: isSandbox });
  const jobInput = toGawainJobInput(item, offers[0]);

  // Create Gawain job
  const envConfig = loadEnvConfig();
  const client = new GawainClient(createConfigFromEnv(envConfig));
  const installId = getOrCreateInstallId();
  const result = await client.createJob(installId, jobInput);

  sendJson(res, 201, result);
}

async function handleApiJobStatus(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  jobId: string,
): Promise<void> {
  const envConfig = loadEnvConfig();
  const client = new GawainClient(createConfigFromEnv(envConfig));
  const job = await client.getJob(jobId);
  sendJson(res, 200, job);
}

async function handleApiUpload(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = (await parseBody(req)) as { sku?: string; videoUrl?: string };
  if (!body.videoUrl || !body.sku) {
    sendJson(res, 400, { error: 'sku and videoUrl are required' });
    return;
  }

  const oauthConfig = loadEbayOAuthConfig();
  const accessToken = await getValidAccessToken(oauthConfig);
  const isSandbox = oauthConfig.env === 'sandbox';

  // Download video from Gawain CDN
  const videoResponse = await fetch(body.videoUrl);
  if (!videoResponse.ok) {
    sendJson(res, 502, { error: `Failed to download video: ${videoResponse.status}` });
    return;
  }
  const videoBuffer = await videoResponse.arrayBuffer();

  // Create eBay video resource
  const { videoId } = await createVideoResource({
    accessToken,
    title: `Gawain AI Video — ${body.sku}`,
    description: `AI-generated product video for SKU ${body.sku}`,
    sandbox: isSandbox,
  });

  // Upload video content
  await uploadVideoContent({
    accessToken,
    videoId,
    videoBuffer,
    sandbox: isSandbox,
  });

  // Check status
  const status = await getVideoStatus({ accessToken, videoId, sandbox: isSandbox });

  sendJson(res, 200, {
    videoId,
    ebayStatus: status.status,
    statusMessage: status.statusMessage || null,
    sizeMB: +(videoBuffer.byteLength / 1024 / 1024).toFixed(1),
  });
}

// --- Existing endpoints ---

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
    sendJson(res, 500, { error: 'eBay OAuth not configured' });
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

  const savedState = readState(config.tokenFilePath);
  if (returnedState !== savedState) {
    sendHtml(res, 403, '<h1>State mismatch</h1><p>Possible CSRF attack. Try again.</p>');
    return;
  }

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

// --- Router ---

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://localhost:${PORT}`);

    if (req.method === 'GET' && url.pathname === '/') {
      sendHtml(res, 200, getDemoHtml());
    } else if (req.method === 'GET' && url.pathname === '/api/inventory') {
      await handleApiInventory(req, res);
    } else if (req.method === 'POST' && url.pathname === '/api/generate') {
      await handleApiGenerate(req, res);
    } else if (req.method === 'GET' && url.pathname.startsWith('/api/job/')) {
      const jobId = url.pathname.replace('/api/job/', '');
      await handleApiJobStatus(req, res, jobId);
    } else if (req.method === 'POST' && url.pathname === '/api/upload') {
      await handleApiUpload(req, res);
    } else if (req.method === 'POST' && url.pathname === '/convert') {
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
  console.info(`  Demo UI:        http://localhost:${PORT}/`);
  console.info(`  OAuth login:    http://localhost:${PORT}/oauth/ebay/login`);
  console.info(`  OAuth callback: http://localhost:${PORT}/oauth/ebay/callback`);
});
