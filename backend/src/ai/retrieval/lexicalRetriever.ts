import type { RetrievedChunk, VectorStoreFilter } from '../ingest/types.js';
import { getVectorStore } from '../ingest/vectorStore.js';

export interface LexicalRetriever {
  score(query: string, candidates: RetrievedChunk[]): RetrievedChunk[];
  fetchCandidates(filter: VectorStoreFilter, limit: number): Promise<RetrievedChunk[]>;
}

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^\p{L}\p{N}]+/gu).filter(Boolean);
}

function termFrequency(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  return counts;
}

export function lexicalScore(query: string, content: string): number {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return 0;

  const queryCounts = termFrequency(queryTokens);
  const docTokens = tokenize(content);
  const docCounts = termFrequency(docTokens);

  let weightedHit = 0;
  let weightedTotal = 0;
  for (const [token, qCount] of queryCounts.entries()) {
    weightedTotal += qCount;
    if (docCounts.has(token)) weightedHit += qCount;
  }
  if (weightedTotal === 0) return 0;

  const coverage = weightedHit / weightedTotal;
  const tfMax = Math.max(1, 2 * queryCounts.size);
  const normalizedTf = Math.min(
    1,
    Array.from(queryCounts.keys()).reduce(
      (sum, token) => sum + Math.min(2, docCounts.get(token) ?? 0),
      0,
    ) / tfMax,
  );
  return Number((coverage * 0.7 + normalizedTf * 0.3).toFixed(6));
}

export class DeterministicLexicalRetriever implements LexicalRetriever {
  async fetchCandidates(filter: VectorStoreFilter, limit: number): Promise<RetrievedChunk[]> {
    const vectorStore = getVectorStore();
    const candidates = await vectorStore.listCandidates(filter, limit);
    return candidates;
  }

  score(query: string, candidates: RetrievedChunk[]): RetrievedChunk[] {
    return candidates.map((chunk) => {
      const score = lexicalScore(query, chunk.content);
      return { ...chunk, lexicalScore: score };
    });
  }
}

let _lexicalRetriever: LexicalRetriever | null = null;

export function getLexicalRetriever(): LexicalRetriever {
  if (!_lexicalRetriever) _lexicalRetriever = new DeterministicLexicalRetriever();
  return _lexicalRetriever;
}

export function resetLexicalRetriever(): void {
  _lexicalRetriever = null;
}
