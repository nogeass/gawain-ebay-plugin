/**
 * Gawain API client
 * Thin wrapper around the Gawain video generation API
 */

import { withRetry } from '../util/retry.js';
import { maskSecret, type EnvConfig } from '../util/env.js';
import {
  type CreateJobRequest,
  type CreateJobResponse,
  type GetJobResponse,
  type GawainJobInput,
  GawainApiError,
} from './types.js';

const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Gawain API client configuration
 */
export interface GawainClientConfig {
  apiBase: string;
  /** API key. Optional for free preview; required for commercial usage. */
  apiKey?: string;
  appId?: string;
  timeoutMs?: number;
}

/**
 * Create client config from environment
 */
export function createConfigFromEnv(env: EnvConfig): GawainClientConfig {
  return {
    apiBase: env.gawainApiBase,
    apiKey: env.gawainApiKey || undefined,
    appId: env.gawainAppId || undefined,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
}

/**
 * Gawain API client
 */
export class GawainClient {
  private readonly config: GawainClientConfig;

  constructor(config: GawainClientConfig) {
    this.config = config;
  }

  /**
   * Make an authenticated API request
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.config.apiBase}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.config.timeoutMs || DEFAULT_TIMEOUT_MS
    );

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }

      if (this.config.appId) {
        headers['X-App-Id'] = this.config.appId;
      }

      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const error = new GawainApiError(
          response.status,
          (errorBody as { code?: string }).code || 'UNKNOWN_ERROR',
          (errorBody as { message?: string }).message || response.statusText
        );
        (error as unknown as { statusCode: number }).statusCode = response.status;
        throw error;
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Create a video generation job
   */
  async createJob(
    installId: string,
    input: GawainJobInput,
    options?: CreateJobRequest['options']
  ): Promise<CreateJobResponse> {
    const request: CreateJobRequest = {
      installId,
      product: input,
      options,
    };

    console.info(
      `Creating job for product: ${input.id} (install_id: ${maskSecret(installId)})`
    );

    return withRetry(() =>
      this.request<CreateJobResponse>('POST', '/v1/jobs', request)
    );
  }

  /**
   * Get job status
   */
  async getJob(jobId: string): Promise<GetJobResponse> {
    return withRetry(() =>
      this.request<GetJobResponse>('GET', `/v1/jobs/${jobId}`)
    );
  }

  /**
   * Poll for job completion (timeout-based)
   */
  async waitJob(
    jobId: string,
    options: {
      timeoutMs?: number;
      intervalMs?: number;
      onProgress?: (job: GetJobResponse) => void;
    } = {}
  ): Promise<GetJobResponse> {
    const { timeoutMs = 120_000, intervalMs = 2000, onProgress } = options;
    const maxAttempts = Math.ceil(timeoutMs / intervalMs);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const job = await this.getJob(jobId);

      if (onProgress) {
        onProgress(job);
      }

      if (job.status === 'completed') {
        return job;
      }

      if (job.status === 'failed') {
        throw new GawainApiError(
          400,
          job.error?.code || 'JOB_FAILED',
          job.error?.message || 'Job failed'
        );
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new GawainApiError(
      408,
      'TIMEOUT',
      `Job did not complete within ${timeoutMs}ms`
    );
  }
}
