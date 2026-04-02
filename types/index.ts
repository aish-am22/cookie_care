/**
 * Re-export shared type definitions.
 *
 * Root-level types.ts contains the main domain types (CookieInfo, ScanResultData, etc.).
 * This index re-exports the API envelope types alongside the domain types so
 * consumers can import from a single path.
 */
export type {
  ApiSuccess,
  ApiError,
  ApiErrorPayload,
  ApiResponse,
  PaginationMeta,
  ContractIngestStatus,
  ContractDocument,
  UploadContractRequest,
  AskRequest,
  AskResponse,
} from './api';
