import type { RetrievedChunk } from '../ingest/types.js';
import { lexicalScore } from './lexicalRetriever.js';

export interface Reranker {
  rerank(question: string, candidates: RetrievedChunk[], limit: number): RetrievedChunk[];
}

const DENSE_WEIGHT = 0.45;
const LEXICAL_WEIGHT = 0.35;
const PROXIMITY_WEIGHT = 0.2;

function normalizedDensity(query: string, content: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const c = content.toLowerCase();
  if (c.includes(q)) return 1;
  return lexicalScore(query, content);
}

export class DeterministicHeuristicReranker implements Reranker {
  rerank(question: string, candidates: RetrievedChunk[], limit: number): RetrievedChunk[] {
    const safeLimit = Math.max(1, Math.floor(limit));
    return candidates
      .map((chunk) => {
        const lexical = chunk.lexicalScore ?? lexicalScore(question, chunk.content);
        const dense = chunk.denseScore ?? chunk.hybridScore ?? chunk.score;
        const proximity = normalizedDensity(question, chunk.content);
        const rerankScore = Number(
          (dense * DENSE_WEIGHT + lexical * LEXICAL_WEIGHT + proximity * PROXIMITY_WEIGHT).toFixed(6),
        );
        return {
          ...chunk,
          rerankScore,
          score: rerankScore,
        };
      })
      .sort((a, b) => (b.rerankScore ?? b.score) - (a.rerankScore ?? a.score))
      .slice(0, safeLimit);
  }
}

let _reranker: Reranker | null = null;

export function getReranker(): Reranker {
  if (!_reranker) _reranker = new DeterministicHeuristicReranker();
  return _reranker;
}

export function resetReranker(): void {
  _reranker = null;
}
