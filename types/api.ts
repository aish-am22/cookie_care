/**
 * Shared API response types.
 * These are minimal placeholders — expand as endpoints are migrated to src/routes/.
 */

/** Standard success envelope returned by the API. */
export interface ApiSuccess<T> {
  data: T;
  meta?: Record<string, unknown>;
}

/** Structured error payload inside the error envelope. */
export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

/** Standard error envelope returned by the API. */
export interface ApiError {
  error: ApiErrorPayload;
  requestId?: string;
}

/** Union of success and error responses. */
export type ApiResponse<T> = ApiSuccess<T> | ApiError;

/** Pagination metadata included in list endpoints. */
export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
}

// ---------------------------------------------------------------------------
// Contract Ingest Lifecycle Types (Phase A)
// ---------------------------------------------------------------------------

/** Mirrors backend ContractIngestStatus enum. */
export type ContractIngestStatus = 'UPLOADED' | 'INGESTING' | 'INDEXED' | 'READY' | 'FAILED';

/** Represents a contract document tracked through the ingest pipeline. */
export interface ContractDocument {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status: ContractIngestStatus;
  errorMsg: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Request body for POST /api/contracts/upload */
export interface UploadContractRequest {
  filename: string;
  mimeType?: string;
  /** Plain-text contract content (Phase A). Phase B will support binary/multipart. */
  content?: string;
}

/** Request body for POST /api/ask */
export interface AskRequest {
  contractId: string;
  question: string;
}

/** Response data for POST /api/ask */
export interface AskResponse {
  answer: string;
}
