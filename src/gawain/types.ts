/**
 * Gawain API type definitions
 */

/**
 * Job status enum
 */
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * Product input for video generation
 */
export interface ProductInput {
  id: string;
  title: string;
  description?: string;
  images: string[];
  price?: {
    amount: string;
    currency: string;
  };
  variants?: Array<{
    id: string;
    title: string;
    price?: string;
  }>;
  metadata?: Record<string, unknown>;
}

/**
 * Request to create a job
 */
export interface CreateJobRequest {
  installId: string;
  product: ProductInput;
  options?: {
    style?: string;
    duration?: number;
    quality?: 'preview' | 'standard' | 'high';
  };
}

/**
 * Response from job creation
 */
export interface CreateJobResponse {
  jobId: string;
  status: JobStatus;
  createdAt: string;
}

/**
 * Response from job status query
 */
export interface GetJobResponse {
  jobId: string;
  status: JobStatus;
  previewUrl?: string;
  downloadUrl?: string;
  error?: {
    code: string;
    message: string;
  };
  progress?: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * API error response
 */
export interface ApiError {
  statusCode: number;
  code: string;
  message: string;
}

/**
 * Custom error class for API errors
 */
export class GawainApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'GawainApiError';
  }
}

/**
 * Public alias for ProductInput, used as the return type of toGawainJobInput.
 */
export type GawainJobInput = ProductInput;
