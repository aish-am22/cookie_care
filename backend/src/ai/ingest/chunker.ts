/**
 * Chunker implementations.
 *
 * DefaultChunker strategy:
 *   1. Prefer section boundaries (clause-aware split from parser).
 *   2. If a section exceeds targetTokens, further split by paragraph.
 *   3. Overlap trailing tokens from previous chunk into next chunk.
 *   4. Each chunk carries the section heading as sectionLabel.
 */

import { createHash } from 'crypto';
import type { Chunker, ChunkOptions, ParsedSection, TextChunk } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export type TokenEstimatorName = 'whitespace' | 'char_approx';

export interface TokenEstimator {
  estimate(text: string): number;
  tail(text: string, tokenCount: number): string;
}

class WhitespaceTokenEstimator implements TokenEstimator {
  estimate(text: string): number {
    return text.trim().split(/\s+/).filter(Boolean).length;
  }

  tail(text: string, tokenCount: number): string {
    const words = text.trim().split(/\s+/).filter(Boolean);
    return words.slice(Math.max(0, words.length - tokenCount)).join(' ');
  }
}

class CharApproxTokenEstimator implements TokenEstimator {
  private charsPerToken(): number {
    const value = Number(process.env.RAG_TOKEN_CHAR_APPROX_RATIO ?? 4);
    if (!Number.isFinite(value)) return 4;
    return Math.min(12, Math.max(1, value));
  }

  estimate(text: string): number {
    const trimmed = text.trim();
    if (!trimmed) return 0;
    // Approximation: chars-per-token ratio is configurable for multilingual corpora.
    return Math.ceil(trimmed.length / this.charsPerToken());
  }

  tail(text: string, tokenCount: number): string {
    if (tokenCount <= 0) return '';
    const trimmed = text.trim();
    if (!trimmed) return '';
    const approxChars = tokenCount * this.charsPerToken();
    return trimmed.slice(Math.max(0, trimmed.length - approxChars)).trim();
  }
}

export function createTokenEstimator(name: TokenEstimatorName | string | undefined): TokenEstimator {
  if (name === 'char_approx') return new CharApproxTokenEstimator();
  return new WhitespaceTokenEstimator();
}

const defaultTokenEstimator = createTokenEstimator(process.env.RAG_TOKEN_ESTIMATOR ?? 'whitespace');

/** Lightweight token estimator selected via RAG_TOKEN_ESTIMATOR strategy. */
export function estimateTokens(text: string): number {
  return defaultTokenEstimator.estimate(text);
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Split a block of text into paragraph-sized pieces that stay within
 * `maxTokens`.  Returns at least one element.
 */
interface SplitOptions {
  maxTokens: number;
  maxParagraphTokens: number;
  maxSentenceTokens: number;
  estimator: TokenEstimator;
}

function splitByParagraphs(text: string, opts: SplitOptions): string[] {
  const { maxTokens, maxParagraphTokens, maxSentenceTokens, estimator } = opts;
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim().length > 0);
  const pieces: string[] = [];
  let buffer = '';

  for (const para of paragraphs) {
    const candidate = buffer ? `${buffer}\n\n${para}` : para;
    if (estimator.estimate(candidate) <= maxTokens) {
      buffer = candidate;
    } else {
      if (buffer) pieces.push(buffer);
      // If the paragraph itself is too large, split by sentences then by words
      if (estimator.estimate(para) > Math.min(maxParagraphTokens, maxTokens)) {
        const sentences = para.split(/(?<=[.!?])\s+/);
        let sentBuffer = '';
        for (const s of sentences) {
          const sc = sentBuffer ? `${sentBuffer} ${s}` : s;
          if (estimator.estimate(sc) <= maxTokens) {
            sentBuffer = sc;
          } else {
            if (sentBuffer) pieces.push(sentBuffer);
            // If a single sentence is still too big, split by words
            if (estimator.estimate(s) > Math.min(maxSentenceTokens, maxTokens)) {
              const words = s.split(/\s+/);
              let wordBuf = '';
              for (const w of words) {
                const wc = wordBuf ? `${wordBuf} ${w}` : w;
                if (estimator.estimate(wc) <= maxTokens) {
                  wordBuf = wc;
                } else {
                  if (wordBuf) pieces.push(wordBuf);
                  wordBuf = w;
                }
              }
              sentBuffer = wordBuf;
            } else {
              sentBuffer = s;
            }
          }
        }
        if (sentBuffer) buffer = sentBuffer;
        else buffer = '';
      } else {
        buffer = para;
      }
    }
  }
  if (buffer) pieces.push(buffer);
  return pieces.length > 0 ? pieces : [text];
}

// ---------------------------------------------------------------------------
// DefaultChunker
// ---------------------------------------------------------------------------

const DEFAULT_TARGET_TOKENS = 500;
const DEFAULT_OVERLAP_TOKENS = 80;
const DEFAULT_MAX_PARAGRAPH_TOKENS = Number(process.env.RAG_CHUNK_MAX_PARAGRAPH_TOKENS ?? 700);
const DEFAULT_MAX_SENTENCE_TOKENS = Number(process.env.RAG_CHUNK_MAX_SENTENCE_TOKENS ?? 240);

export class DefaultChunker implements Chunker {
  chunk(sections: ParsedSection[], opts?: ChunkOptions): TextChunk[] {
    const targetTokens = Math.max(
      32,
      Number(opts?.targetTokens ?? process.env.RAG_CHUNK_TARGET_TOKENS ?? DEFAULT_TARGET_TOKENS),
    );
    const overlapTokens = Math.max(
      0,
      Math.min(
        targetTokens - 1,
        Number(opts?.overlapTokens ?? process.env.RAG_CHUNK_OVERLAP_TOKENS ?? DEFAULT_OVERLAP_TOKENS),
      ),
    );
    const estimator = defaultTokenEstimator;

    const chunks: TextChunk[] = [];
    let chunkIndex = 0;
    let overlapBuffer = '';

    for (const section of sections) {
      const sectionLabel = section.heading;
      const rawContent = sectionLabel
        ? `${sectionLabel}\n${section.content}`
        : section.content;

      // Split into pieces that respect the target window
      const pieces = splitByParagraphs(rawContent, {
        maxTokens: targetTokens,
        maxParagraphTokens: DEFAULT_MAX_PARAGRAPH_TOKENS,
        maxSentenceTokens: DEFAULT_MAX_SENTENCE_TOKENS,
        estimator,
      });

      for (const piece of pieces) {
        // Prepend overlap from previous chunk if it fits
        const contentWithOverlap =
          overlapBuffer && estimator.estimate(`${overlapBuffer}\n${piece}`) <= targetTokens + overlapTokens
            ? `${overlapBuffer}\n${piece}`
            : piece;

        const finalContent = contentWithOverlap.trim();
        if (!finalContent) continue;

        chunks.push({
          chunkIndex: chunkIndex++,
          sectionLabel,
          pageStart: section.pageStart,
          pageEnd: section.pageEnd,
          content: finalContent,
          tokenCount: estimator.estimate(finalContent),
          contentHash: sha256(finalContent),
        });

        // Build overlap from the tail of this piece
        overlapBuffer = estimator.tail(piece, overlapTokens);
      }
    }

    return chunks;
  }
}

/** Singleton default chunker. */
export const defaultChunker = new DefaultChunker();
