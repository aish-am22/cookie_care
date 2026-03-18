/**
 * Shared API response types.
 * These are minimal placeholders — expand as endpoints are migrated to src/routes/.
 */

/** Standard success envelope returned by the API. */
export interface ApiSuccess<T> {
  data: T;
}

/** Standard error envelope returned by the API. */
export interface ApiError {
  error: string;
  details?: Record<string, string[]>;
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
