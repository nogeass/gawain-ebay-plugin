#!/usr/bin/env node
/**
 * Demo CLI for gawain-ebay-plugin
 * Usage: npm run demo -- --product ./samples/listing.sample.json
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseArgs } from 'node:util';

import { GawainClient, createConfigFromEnv } from './gawain/client.js';
import { loadEnvConfig } from './util/env.js';
import { getOrCreateInstallId, buildUpgradeUrl } from './install/install_id.js';
import { toGawainJobInput, validateEbayItem } from './platform/ebay/convert.js';

/**
 * Parse command line arguments
 */
function parseCliArgs(): { productPath: string } {
  const { values } = parseArgs({
    options: {
      product: {
        type: 'string',
        short: 'p',
      },
      help: {
        type: 'boolean',
        short: 'h',
      },
    },
    strict: true,
  });

  if (values.help) {
    console.info(`
gawain-ebay-plugin Demo CLI

Usage:
  npm run demo -- --product <path-to-listing.json>

Options:
  -p, --product  Path to eBay listing JSON file (required)
  -h, --help     Show this help message

Example:
  npm run demo -- --product ./samples/listing.sample.json
`);
    process.exit(0);
  }

  if (!values.product) {
    console.error('Error: --product argument is required');
    console.error('Run with --help for usage information');
    process.exit(1);
  }

  return { productPath: values.product };
}

/**
 * Load product from JSON file
 */
function loadProduct(filePath: string): unknown {
  const absolutePath = path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Product file not found: ${absolutePath}`);
  }

  const content = fs.readFileSync(absolutePath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Main demo function
 */
async function main(): Promise<void> {
  console.info('=== Gawain eBay Plugin Demo ===\n');

  // Parse arguments
  const { productPath } = parseCliArgs();

  // Load environment config
  console.info('Loading configuration...');
  let envConfig;
  try {
    envConfig = loadEnvConfig();
  } catch (error) {
    console.error('Failed to load environment config.');
    console.error('Make sure you have copied .env.example to .env and filled in the values.');
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }

  // Get or create install_id
  const installId = getOrCreateInstallId();
  console.info(`Install ID: ${installId}`);

  // Load and validate product
  console.info(`\nLoading listing from: ${productPath}`);
  const rawProduct = loadProduct(productPath);

  if (!validateEbayItem(rawProduct)) {
    console.error('Invalid listing format. Expected eBay inventory item structure.');
    process.exit(1);
  }

  const jobInput = toGawainJobInput(rawProduct);
  console.info(`Product: ${jobInput.title} (${jobInput.images.length} images)`);

  // Create Gawain client
  const client = new GawainClient(createConfigFromEnv(envConfig));

  // Create job
  console.info('\nCreating video generation job...');
  const createResult = await client.createJob(installId, jobInput);
  console.info(`Job created: ${createResult.jobId}`);

  // Poll for completion
  console.info('\nWaiting for job completion...');
  const job = await client.waitJob(createResult.jobId, {
    intervalMs: envConfig.pollIntervalMs,
    timeoutMs: envConfig.pollIntervalMs * envConfig.pollMaxAttempts,
    onProgress: (j) => {
      const progressStr = j.progress !== undefined ? ` (${j.progress}%)` : '';
      console.info(`  Status: ${j.status}${progressStr}`);
    },
  });

  // Output results
  console.info('\n=== Results ===');
  console.info(`Status: ${job.status}`);

  if (job.previewUrl) {
    console.info(`\nPreview URL: ${job.previewUrl}`);
  }

  if (job.downloadUrl) {
    console.info(`Download URL: ${job.downloadUrl}`);
  }

  // Build and show upgrade URL
  const upgradeUrl = buildUpgradeUrl(envConfig.kinosukeUpgradeUrl, installId);
  console.info(`\n--- Commercial Usage ---`);
  console.info(`To use this video commercially, upgrade at Kinosuke:`);
  console.info(`${upgradeUrl}`);

  console.info('\nDemo completed successfully!');
}

// Run
main().catch((error) => {
  console.error('\nDemo failed:');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
