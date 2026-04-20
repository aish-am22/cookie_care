import { httpClient } from './httpClient';
import type { ApiSuccess } from '../types/api';

export type RagDocumentType = 'CONTRACT' | 'PLAYBOOK' | 'TEMPLATE' | 'POLICY' | 'OTHER';
export type RagConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT';
export const DEFAULT_RAG_TOP_K = 8;
export const DRAFT_SUGGESTION_TOP_K = 6;

function withFallback(value: string): string {
  return value || 'not provided';
}

export interface RagCitation {
  chunkId?: string;
  documentId: string;
  documentTitle: string;
  versionId: string;
  version: number;
  sectionLabel?: string;
  pageStart?: number;
  pageEnd?: number;
  snippet: string;
  score: number;
}

export interface IngestDocumentRequest {
  title: string;
  filename?: string;
  content: string;
  mimeType?: string;
  docType?: RagDocumentType;
}

export interface IngestDocumentResponse {
  documentId: string;
  versionId: string;
  status: 'PENDING' | 'INGESTING' | 'INDEXED' | 'FAILED';
  chunksIndexed: number;
  errorMsg?: string;
}

export interface RetrieveContextRequest {
  question: string;
  documentId?: string;
  docType?: RagDocumentType;
  topK?: number;
}

export interface RetrievedContextChunk {
  chunkId?: string;
  documentId: string;
  documentTitle: string;
  versionId: string;
  version: number;
  chunkIndex: number;
  sectionLabel?: string;
  pageStart?: number;
  pageEnd?: number;
  content: string;
  score: number;
}

export interface RetrieveContextResponse {
  chunks: RetrievedContextChunk[];
  latencyMs: number;
}

export interface AskRagRequest {
  question: string;
  documentId?: string;
  docType?: RagDocumentType;
  topK?: number;
}

export interface AskRagResponse {
  answer: string;
  citations: RagCitation[];
  confidence: RagConfidence;
  grounded: boolean;
  needsHumanReview: boolean;
  traceId: string;
}

export const aiApi = {
  async ingestDocument(payload: IngestDocumentRequest): Promise<IngestDocumentResponse> {
    const response = await httpClient.post<ApiSuccess<IngestDocumentResponse>>('/api/ai/ingest', payload);
    return response.data;
  },

  async retrieveContext(payload: RetrieveContextRequest): Promise<RetrieveContextResponse> {
    const response = await httpClient.post<ApiSuccess<RetrieveContextResponse>>('/api/ai/retrieve', payload);
    return response.data;
  },

  async askRag(payload: AskRagRequest): Promise<AskRagResponse> {
    const response = await httpClient.post<ApiSuccess<AskRagResponse>>('/api/ai/ask', payload);
    return response.data;
  },
};

export function buildDraftRetrievalQuestion(input: {
  contractType: string;
  jurisdiction: string;
  parties: string;
  keyTerms: string;
}): string {
  return [
    `Find the most relevant contract template context for a ${input.contractType}.`,
    `Jurisdiction: ${withFallback(input.jurisdiction)}.`,
    `Parties: ${withFallback(input.parties)}.`,
    `Key terms: ${withFallback(input.keyTerms)}.`,
    'Return content that can ground a high-quality enterprise draft.',
  ].join(' ');
}

export function buildNegotiationPrompt(input: {
  currentClause: string;
  counterpartyClause: string;
  mode: 'strict' | 'balanced' | 'flexible';
}): string {
  return [
    'You are a legal negotiation assistant.',
    `Negotiation mode: ${input.mode}.`,
    'Draft fallback language the user can propose to the counterparty.',
    'Keep the output concise and include short rationale with source markers if available.',
    '',
    'Current clause:',
    input.currentClause,
    '',
    'Counterparty clause:',
    input.counterpartyClause,
  ].join('\n');
}
