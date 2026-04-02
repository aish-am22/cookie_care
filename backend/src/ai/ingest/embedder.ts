/**
 * EmbeddingProvider implementations.
 *
 * StubEmbeddingProvider  – deterministic, no external API (dev/test mode).
 * GeminiEmbeddingProvider – Google GenAI text embeddings (production mode).
 *
 * The active provider is selected at runtime via RAG_EMBEDDING_PROVIDER env var:
 *   "stub"   → StubEmbeddingProvider  (default when no key or RAG_EMBEDDING_PROVIDER=stub)
 *   "gemini" → GeminiEmbeddingProvider
 */

import { createHash } from 'crypto';
import type { EmbeddingProvider } from './types.js';

// ---------------------------------------------------------------------------
// StubEmbeddingProvider
// ---------------------------------------------------------------------------

/**
 * Deterministic pseudo-embeddings for development and testing.
 *
 * Algorithm:
 *   1. Compute SHA-256 of the text.
 *   2. Seed a simple LCG PRNG with bytes from the hash.
 *   3. Generate `dimensions` floats in [-1, 1].
 *   4. L2-normalise the vector.
 *
 * This preserves similarity semantics within a single run (same text → same
 * vector) while avoiding any external network call.
 */
export class StubEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions: number;

  constructor(dimensions = 256) {
    this.dimensions = dimensions;
  }

  embed(text: string): Promise<number[]> {
    const vec = this._deterministicVector(text);
    return Promise.resolve(vec);
  }

  embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.resolve(texts.map((t) => this._deterministicVector(t)));
  }

  private _deterministicVector(text: string): number[] {
    const hash = createHash('sha256').update(text, 'utf8').digest();
    const vec: number[] = [];

    // Simple LCG seeded from the hash bytes
    let seed = 0;
    for (let i = 0; i < 4; i++) {
      seed = (seed * 256 + (hash[i] ?? 0)) >>> 0;
    }

    for (let i = 0; i < this.dimensions; i++) {
      // LCG: a=1664525, c=1013904223, m=2^32
      seed = Math.imul(seed, 1_664_525) + 1_013_904_223;
      // Map uint32 to [-1, 1]
      vec.push((seed >>> 0) / 2_147_483_648 - 1);
    }

    // L2 normalise
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    return vec.map((v) => v / norm);
  }
}

// ---------------------------------------------------------------------------
// GeminiEmbeddingProvider
// ---------------------------------------------------------------------------

/**
 * Google GenAI text-embedding model.
 * Requires a valid API key in GEMINI_API_KEY or API_KEY env vars.
 *
 * TODO: swap model name when Gemini embedding GA model is confirmed.
 */
export class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = 768;
  private readonly _apiKey: string;
  private readonly _model: string;

  constructor(apiKey: string, model = 'text-embedding-004') {
    this._apiKey = apiKey;
    this._model = model;
  }

  async embed(text: string): Promise<number[]> {
    const [result] = await this.embedBatch([text]);
    if (!result) throw new Error('Gemini embedding returned empty result');
    return result;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // Dynamic import to avoid hard dependency when running in stub mode
    const { GoogleGenAI } = await import('@google/genai');
    const genai = new GoogleGenAI({ apiKey: this._apiKey });

    const results = await Promise.all(
      texts.map((text) =>
        genai.models.embedContent({
          model: this._model,
          contents: text,
        }),
      ),
    );

    return results.map((r) => {
      const values = r.embeddings?.[0]?.values;
      if (!values) throw new Error('Gemini embedding: missing values in response');
      return values;
    });
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

let _providerInstance: EmbeddingProvider | null = null;

export function getEmbeddingProvider(): EmbeddingProvider {
  if (_providerInstance) return _providerInstance;

  const providerName = process.env.RAG_EMBEDDING_PROVIDER ?? 'stub';
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.API_KEY;

  if (providerName === 'gemini' && apiKey) {
    const model = process.env.RAG_EMBEDDING_MODEL ?? 'text-embedding-004';
    _providerInstance = new GeminiEmbeddingProvider(apiKey, model);
  } else {
    if (providerName === 'gemini' && !apiKey) {
      console.warn(
        '[RAG] RAG_EMBEDDING_PROVIDER=gemini but no API key found. Falling back to stub embedder.',
      );
    }
    _providerInstance = new StubEmbeddingProvider(256);
  }

  return _providerInstance;
}

/** Reset the cached provider (useful in tests). */
export function resetEmbeddingProvider(): void {
  _providerInstance = null;
}
