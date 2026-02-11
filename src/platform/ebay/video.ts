/**
 * eBay Sell Static Content API wrapper for video upload
 *
 * eBay video specs:
 * - MP4/MOV, max 150MB, max 1080p
 * - 1 video per listing (gallery position 2)
 * - Review: typically 48 hours
 * - Direct upload only (no YouTube)
 */

import type { EbayVideoResource } from './types.js';

const EBAY_API_BASE = 'https://api.ebay.com';
const EBAY_SANDBOX_API_BASE = 'https://api.sandbox.ebay.com';
const CHUNK_SIZE = 25 * 1024 * 1024; // 25MB

export interface CreateVideoOptions {
  accessToken: string;
  title: string;
  description?: string;
  sandbox?: boolean;
}

export interface UploadVideoOptions {
  accessToken: string;
  videoId: string;
  videoBuffer: ArrayBuffer;
  contentType?: string;
  sandbox?: boolean;
}

export interface GetVideoStatusOptions {
  accessToken: string;
  videoId: string;
  sandbox?: boolean;
}

/**
 * Create a video resource on eBay.
 * Returns the video ID from the Location header.
 */
export async function createVideoResource(
  opts: CreateVideoOptions,
): Promise<{ videoId: string }> {
  const base = opts.sandbox ? EBAY_SANDBOX_API_BASE : EBAY_API_BASE;

  const response = await fetch(`${base}/sell/static/v1/video`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${opts.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: opts.title,
      description: opts.description || opts.title,
      classification: ['ITEM'],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`eBay create video failed: ${response.status} — ${body}`);
  }

  const location = response.headers.get('location') || '';
  const videoId = location.split('/').pop() || '';

  if (!videoId) {
    throw new Error('No video ID returned from eBay');
  }

  return { videoId };
}

/**
 * Upload video content to eBay.
 * Supports chunked upload for files > 25MB.
 */
export async function uploadVideoContent(
  opts: UploadVideoOptions,
): Promise<void> {
  const base = opts.sandbox ? EBAY_SANDBOX_API_BASE : EBAY_API_BASE;
  const contentType = opts.contentType || 'video/mp4';
  const fileSize = opts.videoBuffer.byteLength;

  if (fileSize <= CHUNK_SIZE) {
    // Single upload
    const response = await fetch(
      `${base}/sell/static/v1/video/${opts.videoId}/upload`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${opts.accessToken}`,
          'Content-Type': contentType,
          'Content-Length': fileSize.toString(),
          'Content-Range': `bytes 0-${fileSize - 1}/${fileSize}`,
        },
        body: opts.videoBuffer,
      },
    );

    if (!response.ok && response.status !== 200 && response.status !== 204) {
      const body = await response.text().catch(() => '');
      throw new Error(`eBay video upload failed: ${response.status} — ${body}`);
    }
  } else {
    // Chunked upload
    let offset = 0;
    while (offset < fileSize) {
      const end = Math.min(offset + CHUNK_SIZE, fileSize);
      const chunk = opts.videoBuffer.slice(offset, end);

      const response = await fetch(
        `${base}/sell/static/v1/video/${opts.videoId}/upload`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${opts.accessToken}`,
            'Content-Type': contentType,
            'Content-Length': (end - offset).toString(),
            'Content-Range': `bytes ${offset}-${end - 1}/${fileSize}`,
          },
          body: chunk,
        },
      );

      if (
        !response.ok &&
        response.status !== 200 &&
        response.status !== 204 &&
        response.status !== 308
      ) {
        const body = await response.text().catch(() => '');
        throw new Error(
          `eBay chunked upload failed at offset ${offset}: ${response.status} — ${body}`,
        );
      }

      offset = end;
    }
  }
}

/**
 * Get video status from eBay.
 * Returns: UPLOADED | PROCESSING | LIVE | BLOCKED
 */
export async function getVideoStatus(
  opts: GetVideoStatusOptions,
): Promise<EbayVideoResource> {
  const base = opts.sandbox ? EBAY_SANDBOX_API_BASE : EBAY_API_BASE;

  const response = await fetch(
    `${base}/sell/static/v1/video/${opts.videoId}`,
    {
      headers: {
        'Authorization': `Bearer ${opts.accessToken}`,
      },
    },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`eBay get video status failed: ${response.status} — ${body}`);
  }

  return (await response.json()) as EbayVideoResource;
}
