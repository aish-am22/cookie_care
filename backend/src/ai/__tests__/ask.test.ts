/**
 * Tests for AskService response schema and insufficient-evidence path.
 *
 * These tests mock the vector store and embedding provider so they run
 * without a database or external API.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { INSUFFICIENT_EVIDENCE_MARKER } from '../qa/prompts.js';
import type { AskResponse } from '../ingest/types.js';

// ---------------------------------------------------------------------------
// Mock heavy dependencies before importing askService
// ---------------------------------------------------------------------------

// Mock the DB (AiQueryLog persistence)
vi.mock('../../infra/db.js', () => ({
  db: {
    aiQueryLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  },
}));

// Mock the embedder to return a deterministic zero vector
vi.mock('../ingest/embedder.js', () => ({
  getEmbeddingProvider: () => ({
    embed: vi.fn().mockResolvedValue(new Array(64).fill(0)),
    embedBatch: vi.fn().mockResolvedValue([new Array(64).fill(0)]),
    dimensions: 64,
  }),
}));

// Mock the vector store – controlled via a variable
let mockChunks: unknown[] = [];
vi.mock('../ingest/vectorStore.js', () => ({
  getVectorStore: () => ({
    query: vi.fn().mockImplementation(() => Promise.resolve(mockChunks)),
    count: vi.fn().mockImplementation(() => Promise.resolve(mockChunks.length)),
    upsert: vi.fn(),
    deleteByDocument: vi.fn(),
  }),
}));

// Force stub generation (no real LLM calls in tests)
process.env.RAG_STUB_GENERATION = 'true';

import { ask } from '../qa/askService.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeChunk(documentId = 'doc-1', content = 'The liability cap is limited to $1,000.') {
  return {
    chunkIndex: 0,
    content,
    tokenCount: 10,
    contentHash: 'abc123',
    embedding: new Array(64).fill(0),
    documentId,
    documentTitle: 'Test Contract',
    versionId: 'v-1',
    version: 1,
    score: 0.8,
    orgId: 'org-test',
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AskService – response schema', () => {
  const ORG_ID = 'org-test';

  beforeEach(() => {
    mockChunks = [];
  });

  it('returns the full AskResponse contract shape', async () => {
    mockChunks = [makeChunk()];

    const result = await ask({ orgId: ORG_ID, question: 'What is the liability cap?' });

    // Must have all required fields
    expect(result).toHaveProperty('answer');
    expect(result).toHaveProperty('citations');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('needsHumanReview');
    expect(result).toHaveProperty('traceId');

    // Field types
    expect(typeof result.answer).toBe('string');
    expect(Array.isArray(result.citations)).toBe(true);
    expect(['HIGH', 'MEDIUM', 'LOW', 'INSUFFICIENT']).toContain(result.confidence);
    expect(typeof result.needsHumanReview).toBe('boolean');
    expect(typeof result.traceId).toBe('string');
    expect(result.traceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('returns INSUFFICIENT confidence when no documents are indexed', async () => {
    mockChunks = []; // empty store → count() returns 0

    const result: AskResponse = await ask({
      orgId: ORG_ID,
      question: 'What is the indemnity clause?',
    });

    expect(result.confidence).toBe('INSUFFICIENT');
    expect(result.needsHumanReview).toBe(true);
    expect(result.citations).toEqual([]);
    expect(result.answer).toContain(INSUFFICIENT_EVIDENCE_MARKER);
  });

  it('returns citations when chunks are retrieved', async () => {
    mockChunks = [makeChunk()];

    const result = await ask({ orgId: ORG_ID, question: 'Liability cap amount?' });

    expect(result.citations.length).toBeGreaterThan(0);
    const citation = result.citations[0]!;
    expect(citation).toHaveProperty('documentId');
    expect(citation).toHaveProperty('documentTitle');
    expect(citation).toHaveProperty('versionId');
    expect(citation).toHaveProperty('version');
    expect(citation).toHaveProperty('snippet');
    expect(citation).toHaveProperty('score');
  });

  it('each citation snippet is at most 303 characters (300 + ellipsis)', async () => {
    const longContent = 'word '.repeat(200); // 200*5 = 1000 chars
    mockChunks = [makeChunk('doc-1', longContent)];

    const result = await ask({ orgId: ORG_ID, question: 'Long content test' });

    for (const citation of result.citations) {
      expect(citation.snippet.length).toBeLessThanOrEqual(303);
    }
  });

  it('traceId is unique across multiple calls', async () => {
    mockChunks = [makeChunk()];

    const [r1, r2] = await Promise.all([
      ask({ orgId: ORG_ID, question: 'Query A' }),
      ask({ orgId: ORG_ID, question: 'Query B' }),
    ]);

    expect(r1!.traceId).not.toBe(r2!.traceId);
  });

  it('needsHumanReview is true for INSUFFICIENT and LOW confidence', async () => {
    mockChunks = [];
    const insufficientResult = await ask({ orgId: ORG_ID, question: 'anything' });
    expect(insufficientResult.needsHumanReview).toBe(true);
  });
});
