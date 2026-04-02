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

/** Very lightweight token estimator: split on whitespace. */
export function estimateTokens(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Split a block of text into paragraph-sized pieces that stay within
 * `maxTokens`.  Returns at least one element.
 */
function splitByParagraphs(text: string, maxTokens: number): string[] {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim().length > 0);
  const pieces: string[] = [];
  let buffer = '';

  for (const para of paragraphs) {
    const candidate = buffer ? `${buffer}\n\n${para}` : para;
    if (estimateTokens(candidate) <= maxTokens) {
      buffer = candidate;
    } else {
      if (buffer) pieces.push(buffer);
      // If the paragraph itself is too large, split by sentences then by words
      if (estimateTokens(para) > maxTokens) {
        const sentences = para.split(/(?<=[.!?])\s+/);
        let sentBuffer = '';
        for (const s of sentences) {
          const sc = sentBuffer ? `${sentBuffer} ${s}` : s;
          if (estimateTokens(sc) <= maxTokens) {
            sentBuffer = sc;
          } else {
            if (sentBuffer) pieces.push(sentBuffer);
            // If a single sentence is still too big, split by words
            if (estimateTokens(s) > maxTokens) {
              const words = s.split(/\s+/);
              let wordBuf = '';
              for (const w of words) {
                const wc = wordBuf ? `${wordBuf} ${w}` : w;
                if (estimateTokens(wc) <= maxTokens) {
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

export class DefaultChunker implements Chunker {
  chunk(sections: ParsedSection[], opts?: ChunkOptions): TextChunk[] {
    const targetTokens = opts?.targetTokens ?? DEFAULT_TARGET_TOKENS;
    const overlapTokens = opts?.overlapTokens ?? DEFAULT_OVERLAP_TOKENS;

    const chunks: TextChunk[] = [];
    let chunkIndex = 0;
    let overlapBuffer = '';

    for (const section of sections) {
      const sectionLabel = section.heading;
      const rawContent = sectionLabel
        ? `${sectionLabel}\n${section.content}`
        : section.content;

      // Split into pieces that respect the target window
      const pieces = splitByParagraphs(rawContent, targetTokens);

      for (const piece of pieces) {
        // Prepend overlap from previous chunk if it fits
        const contentWithOverlap =
          overlapBuffer && estimateTokens(`${overlapBuffer}\n${piece}`) <= targetTokens + overlapTokens
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
          tokenCount: estimateTokens(finalContent),
          contentHash: sha256(finalContent),
        });

        // Build overlap from the tail of this piece
        const words = piece.trim().split(/\s+/);
        overlapBuffer = words.slice(Math.max(0, words.length - overlapTokens)).join(' ');
      }
    }

    return chunks;
  }
}

/** Singleton default chunker. */
export const defaultChunker = new DefaultChunker();
