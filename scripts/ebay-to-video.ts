#!/usr/bin/env node
/**
 * E2E: eBay Sandbox store → Gawain video generation → (optional) eBay upload
 *
 * Usage:
 *   npm run ebay:video                              # Use first inventory item
 *   npm run ebay:video -- --sku GAWAIN_TEST_001     # Specific SKU
 *   npm run ebay:video -- --upload                  # Upload video back to eBay
 */

import { parseArgs } from 'node:util';

import { loadEnvConfig, loadEbayOAuthConfig } from '../src/util/env.js';
import { getValidAccessToken } from '../src/platform/ebay/token-store.js';
import { fetchInventoryItems, fetchOffers } from '../src/platform/ebay/fetch.js';
import { toGawainJobInput, validateEbayItem } from '../src/platform/ebay/convert.js';
import { GawainClient, createConfigFromEnv } from '../src/gawain/client.js';
import {
  createVideoResource,
  uploadVideoContent,
  getVideoStatus,
} from '../src/platform/ebay/video.js';
import { getOrCreateInstallId } from '../src/install/install_id.js';

const JOB_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const POLL_INTERVAL_MS = 10_000; // 10 seconds

function parseCliArgs() {
  const { values } = parseArgs({
    options: {
      sku: { type: 'string' },
      upload: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h' },
    },
    strict: true,
  });

  if (values.help) {
    console.info(`
eBay → Gawain Video E2E

Usage:
  npm run ebay:video                              Use first inventory item
  npm run ebay:video -- --sku GAWAIN_TEST_001     Specific SKU
  npm run ebay:video -- --upload                  Upload video back to eBay
`);
    process.exit(0);
  }

  return { sku: values.sku, upload: values.upload ?? false };
}

async function main(): Promise<void> {
  console.info('=== eBay → Gawain Video E2E ===\n');

  const args = parseCliArgs();
  const envConfig = loadEnvConfig();
  const oauthConfig = loadEbayOAuthConfig();
  const isSandbox = oauthConfig.env === 'sandbox';

  // 1. Get valid access token (auto-refresh if expired)
  console.info('1. Getting eBay access token...');
  const accessToken = await getValidAccessToken(oauthConfig);
  console.info('   Token OK\n');

  // 2. Fetch inventory from eBay store
  console.info('2. Fetching eBay inventory...');
  const { items, total } = await fetchInventoryItems({
    accessToken,
    sandbox: isSandbox,
    limit: 50,
  });
  console.info(`   Found ${total} item(s)\n`);

  if (items.length === 0) {
    console.error('No inventory items found. Create one first:');
    console.error('  curl -X PUT .../sell/inventory/v1/inventory_item/{SKU}');
    process.exit(1);
  }

  // 3. Select item
  let item;
  if (args.sku) {
    item = items.find((i) => i.sku === args.sku);
    if (!item) {
      console.error(`SKU "${args.sku}" not found. Available SKUs:`);
      items.forEach((i) => console.error(`  - ${i.sku}: ${i.product.title}`));
      process.exit(1);
    }
  } else {
    item = items[0];
  }

  console.info(`3. Selected: ${item.sku} — ${item.product.title}`);
  console.info(`   Images: ${(item.product.imageUrls || []).length}`);
  console.info(`   Condition: ${item.condition || 'N/A'}\n`);

  if (!validateEbayItem(item)) {
    console.error('Item failed validation (missing sku or product.title)');
    process.exit(1);
  }

  // 4. Fetch offers (for price info)
  console.info('4. Fetching offers...');
  const offers = await fetchOffers({ accessToken, sku: item.sku, sandbox: isSandbox });
  const offer = offers[0];
  if (offer?.pricingSummary?.price) {
    console.info(`   Price: ${offer.pricingSummary.price.value} ${offer.pricingSummary.price.currency}`);
  } else {
    console.info('   No offers/pricing found');
  }
  console.info('');

  // 5. Convert to Gawain format
  console.info('5. Converting to Gawain job input...');
  const jobInput = toGawainJobInput(item, offer);
  console.info(`   id: ${jobInput.id}`);
  console.info(`   title: ${jobInput.title}`);
  console.info(`   images: ${jobInput.images.length}`);
  console.info('');

  // 6. Create Gawain job
  const installId = getOrCreateInstallId();
  const client = new GawainClient(createConfigFromEnv(envConfig));

  console.info('6. Creating Gawain video job...');
  const createResult = await client.createJob(installId, jobInput);
  console.info(`   Job ID: ${createResult.jobId}\n`);

  // 7. Wait for completion
  console.info(`7. Waiting for completion (timeout: ${JOB_TIMEOUT_MS / 60000}min, poll: ${POLL_INTERVAL_MS / 1000}s)...`);
  let lastProgress = -1;
  const completedJob = await client.waitJob(createResult.jobId, {
    timeoutMs: JOB_TIMEOUT_MS,
    intervalMs: POLL_INTERVAL_MS,
    onProgress: (job) => {
      const p = job.progress ?? 0;
      if (p !== lastProgress) {
        const bar = '█'.repeat(Math.floor(p / 5)) + '░'.repeat(20 - Math.floor(p / 5));
        console.info(`   [${bar}] ${p}% — ${job.status}`);
        lastProgress = p;
      }
    },
  });

  console.info(`\n   Video completed!`);
  console.info(`   Preview:  ${completedJob.previewUrl}`);
  console.info(`   Download: ${completedJob.downloadUrl}\n`);

  // 8. Upload to eBay (optional)
  if (args.upload && completedJob.downloadUrl) {
    console.info('8. Uploading video to eBay...');

    // Download video
    console.info('   Downloading video from Gawain CDN...');
    const videoResponse = await fetch(completedJob.downloadUrl);
    if (!videoResponse.ok) {
      console.error(`   Failed to download video: ${videoResponse.status}`);
      process.exit(1);
    }
    const videoBuffer = await videoResponse.arrayBuffer();
    console.info(`   Downloaded: ${(videoBuffer.byteLength / 1024 / 1024).toFixed(1)} MB`);

    // Create eBay video resource
    console.info('   Creating eBay video resource...');
    const { videoId } = await createVideoResource({
      accessToken,
      title: jobInput.title,
      description: jobInput.description,
      sandbox: isSandbox,
    });
    console.info(`   Video ID: ${videoId}`);

    // Upload content
    console.info('   Uploading video content...');
    await uploadVideoContent({
      accessToken,
      videoId,
      videoBuffer,
      sandbox: isSandbox,
    });
    console.info('   Upload complete!');

    // Check status
    const status = await getVideoStatus({ accessToken, videoId, sandbox: isSandbox });
    console.info(`   eBay video status: ${status.status}`);
    if (status.statusMessage) {
      console.info(`   Message: ${status.statusMessage}`);
    }
    console.info('');
  }

  // 9. Summary
  console.info('=== Summary ===');
  console.info(`SKU:       ${item.sku}`);
  console.info(`Job ID:    ${createResult.jobId}`);
  console.info(`Video URL: ${completedJob.downloadUrl}`);
  if (args.upload) {
    console.info(`eBay upload: completed`);
  }
  console.info('\nDone!');
}

main().catch((err) => {
  console.error('\nE2E failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
