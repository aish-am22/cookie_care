import { httpClient } from './httpClient';
import type { GeneratedContract } from '../types';
import type { ContractDocument, UploadContractRequest, ApiSuccess } from '../types/api';

/**
 * Contracts API — canonical client for the four Phase A core endpoints:
 *   POST /api/contracts/upload
 *   POST /api/contracts/:id/ingest
 *   GET  /api/contracts/:id/status
 *   POST /api/contracts/generate  (legacy AI contract generator)
 *
 * Backend contract is owned by backend/src/routes/contracts.routes.ts.
 */
export const contractsApi = {
  /** Upload a contract document and register it in the ingest pipeline. */
  upload(payload: UploadContractRequest): Promise<ApiSuccess<ContractDocument>> {
    return httpClient.post<ApiSuccess<ContractDocument>>('/api/contracts/upload', payload);
  },

  /** Trigger ingestion (chunking + embedding) for an uploaded contract. */
  ingest(contractId: string): Promise<ApiSuccess<ContractDocument>> {
    return httpClient.post<ApiSuccess<ContractDocument>>(`/api/contracts/${contractId}/ingest`, {});
  },

  /** Poll the ingest lifecycle status of a contract. */
  getStatus(contractId: string): Promise<ApiSuccess<ContractDocument>> {
    return httpClient.get<ApiSuccess<ContractDocument>>(`/api/contracts/${contractId}/status`);
  },

  /** Legacy: generate a contract using AI (not part of ingest pipeline). */
  generate(contractType: string, details: string, templateContent?: string): Promise<GeneratedContract> {
    return httpClient.post<GeneratedContract>('/api/contracts/generate', {
      contractType,
      details,
      templateContent,
    });
  },
};
