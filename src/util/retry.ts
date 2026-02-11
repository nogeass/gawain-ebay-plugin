/**
 * Retry utilities with exponential backoff and jitter
 */

export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterFactor: number;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 5,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitterFactor: 0.3,
};

/**
 * Calculate delay with exponential backoff and jitter
 */
export function calculateBackoff(attempt: number, options: RetryOptions): number {
  const exponentialDelay = options.baseDelayMs * Math.pow(2, attempt);
  const cappedDelay = Math.min(exponentialDelay, options.maxDelayMs);
  const jitter = cappedDelay * options.jitterFactor * (Math.random() * 2 - 1);
  return Math.max(0, Math.floor(cappedDelay + jitter));
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if error is retryable (429 or 5xx)
 */
export function isRetryableError(statusCode: number): boolean {
  return statusCode === 429 || (statusCode >= 500 && statusCode < 600);
}

/**
 * Retry a function with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode && !isRetryableError(statusCode)) {
        throw error;
      }

      if (attempt < opts.maxAttempts - 1) {
        const delay = calculateBackoff(attempt, opts);
        console.info(`Retry attempt ${attempt + 1}/${opts.maxAttempts} after ${delay}ms`);
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error('Retry failed');
}
