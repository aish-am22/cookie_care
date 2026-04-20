/**
 * Core interfaces and types for the RAG pipeline.
 *
 * Pipeline: DocumentParser → Chunker → EmbeddingProvider → VectorStore
 *           ↓
 *           IngestionService (orchestrates the above)
 *           ↓
 *           RetrievalService → AskService
 */

// ---------------------------------------------------------------------------
// Shared value types
// ---------------------------------------------------------------------------

export type RagDocumentType = 'CONTRACT' | 'PLAYBOOK' | 'TEMPLATE' | 'POLICY' | 'OTHER';

/** Metadata attached to each document at ingest time. */
export interface DocumentMeta {
  orgId: string;
  userId: string;
  logicalDocumentId?: string;
  title: string;
  filename: string;
  mimeType?: string;
  docType?: RagDocumentType;
  /** Arbitrary extra fields (governingLaw, counterparty, effectiveDate, etc.) */
  extra?: Record<string, unknown>;
}

/** A logical section extracted from a raw document before chunking. */
export interface ParsedSection {
  /** Section / clause heading if detected. */
  heading?: string;
  content: string;
  pageStart?: number;
  pageEnd?: number;
}

/** A single text chunk ready to be embedded and indexed. */
export interface TextChunk {
  chunkIndex: number;
  sectionLabel?: string;
  pageStart?: number;
  pageEnd?: number;
  content: string;
  /** Approximate word count. */
  tokenCount: number;
  /** SHA-256 hex of content – used for dedup. */
  contentHash: string;
}

/** A chunk together with its embedding vector (set after embed step). */
export interface EmbeddedChunk extends TextChunk {
  embedding: number[];
}

/** A chunk retrieved from the vector store, with relevance score. */
export interface RetrievedChunk extends EmbeddedChunk {
  /** Underlying chunk row id where available. */
  chunkId?: string;
  /** Document-level metadata. */
  documentId: string;
  documentTitle: string;
  /** Version record id. */
  versionId: string;
  /** Version number. */
  version: number;
  /** Cosine similarity score [0, 1]. */
  score: number;
  /** Optional component scores used in hybrid/rerank retrieval. */
  denseScore?: number;
  lexicalScore?: number;
  hybridScore?: number;
  rerankScore?: number;
  orgId: string;
}

// ---------------------------------------------------------------------------
// Interface: DocumentParser
// ---------------------------------------------------------------------------

export interface DocumentParser {
  /** Returns true when this parser can handle the given MIME type. */
  supports(mimeType: string): boolean;
  /** Parse raw file content into ordered sections. */
  parse(content: string, mimeType: string): ParsedSection[];
}

// ---------------------------------------------------------------------------
// Interface: Chunker
// ---------------------------------------------------------------------------

export interface ChunkOptions {
  /** Target token/word window per chunk (default: 500). */
  targetTokens?: number;
  /** Overlap token/word count between consecutive chunks (default: 80). */
  overlapTokens?: number;
}

export interface Chunker {
  chunk(sections: ParsedSection[], opts?: ChunkOptions): TextChunk[];
}

// ---------------------------------------------------------------------------
// Interface: EmbeddingProvider
// ---------------------------------------------------------------------------

export interface EmbeddingProvider {
  /** Embed a single string and return a float vector. */
  embed(text: string): Promise<number[]>;
  /** Embed many strings in one call (may batch internally). */
  embedBatch(texts: string[]): Promise<number[][]>;
  /** Dimensionality of the returned vectors. */
  readonly dimensions: number;
}

// ---------------------------------------------------------------------------
// Interface: VectorStore
// ---------------------------------------------------------------------------

export interface VectorStoreFilter {
  /** Mandatory tenant isolation key. */
  orgId: string;
  documentId?: string;
  documentIds?: string[];
  versionId?: string;
  docType?: RagDocumentType;
  threshold?: number;
}

export interface VectorStoreEntry {
  id: string;
  orgId: string;
  documentId: string;
  documentTitle: string;
  docType?: RagDocumentType;
  versionId: string;
  version: number;
  isActiveVersion?: boolean;
  chunk: EmbeddedChunk;
}

export interface VectorStore {
  /** Add or replace entries for a document version (upsert by chunk id). */
  upsert(entries: VectorStoreEntry[]): Promise<void>;
  /** Semantic search; returns top-k chunks matching the filter. */
  query(
    queryEmbedding: number[],
    filter: VectorStoreFilter,
    topK?: number,
  ): Promise<RetrievedChunk[]>;
  /** Candidate scan for lexical/hybrid retrieval. */
  listCandidates(filter: VectorStoreFilter, limit?: number): Promise<RetrievedChunk[]>;
  /** Remove all chunks for a given documentId (e.g., on re-index). */
  deleteByDocument(documentId: string, orgId: string): Promise<void>;
  /** Return the number of indexed entries scoped to an orgId. */
  count(orgId: string): Promise<number>;
}

// ---------------------------------------------------------------------------
// Ingestion result / status types
// ---------------------------------------------------------------------------

export type IngestionStatus = 'PENDING' | 'INGESTING' | 'INDEXED' | 'FAILED';

export interface IngestionResult {
  documentId: string;
  versionId: string;
  status: IngestionStatus;
  chunksIndexed: number;
  errorMsg?: string;
}

// ---------------------------------------------------------------------------
// Retrieval / Ask types
// ---------------------------------------------------------------------------

export interface RetrievalQuery {
  orgId: string;
  question: string;
  documentId?: string;
  docType?: RagDocumentType;
  topK?: number;
}

export interface RetrievalResult {
  chunks: RetrievedChunk[];
  latencyMs: number;
}

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT';

export interface Citation {
  chunkId?: string;
  documentId: string;
  documentTitle: string;
  versionId: string;
  version: number;
  sectionLabel?: string;
  pageStart?: number;
  pageEnd?: number;
  /** The raw snippet from the chunk that was cited. */
  snippet: string;
  score: number;
}

export interface AskResponse {
  answer: string;
  citations: Citation[];
  confidence: ConfidenceLevel;
  grounded: boolean;
  needsHumanReview: boolean;
  traceId: string;
}

export interface AskQuery extends RetrievalQuery {
  userId?: string;
}
