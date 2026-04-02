/**
 * DocumentParser implementations.
 *
 * Current adapters:
 *   - PlainTextParser  – plain text and HTML (default, no dependencies)
 *
 * TODO: Add PdfParser (pdf-parse), DocxParser (mammoth) when those packages
 *       are added as backend dependencies.
 */

import type { DocumentParser, ParsedSection } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Legal section heading patterns (e.g. "1.", "1.1", "Section 1", "CLAUSE 2"). */
const HEADING_RE =
  /^(?:(?:section|clause|article|schedule|annex|appendix)\s+\d+[\d.]*|(?:\d+\.)+\s|\d+\)\s)/i;

function splitIntoSections(text: string): ParsedSection[] {
  const lines = text.split(/\r?\n/);
  const sections: ParsedSection[] = [];
  let currentHeading: string | undefined;
  let buffer: string[] = [];

  function flush() {
    const content = buffer.join('\n').trim();
    if (content) {
      sections.push({ heading: currentHeading, content });
    }
    buffer = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (HEADING_RE.test(trimmed) && trimmed.length < 120) {
      flush();
      currentHeading = trimmed;
    } else {
      buffer.push(line);
    }
  }
  flush();

  return sections.length > 0 ? sections : [{ content: text.trim() }];
}

/**
 * Remove all occurrences of a tagged block (e.g. <style>…</style>) using
 * a linear indexOf scan instead of a regex to avoid polynomial ReDoS.
 * Safe for untrusted HTML input used purely for text extraction.
 */
function removeTaggedBlock(text: string, openTag: string, closeTag: string): string {
  const openLower = openTag.toLowerCase();
  const closeLower = closeTag.toLowerCase();
  let result = text;
  let safety = 0;
  while (safety++ < 1000) {
    const textLower = result.toLowerCase();
    const start = textLower.indexOf(openLower);
    if (start === -1) break;
    // Find end of opening tag (the '>' that closes it)
    const tagEnd = result.indexOf('>', start);
    const searchFrom = tagEnd === -1 ? start : tagEnd + 1;
    const closeStart = result.toLowerCase().indexOf(closeLower, searchFrom);
    if (closeStart === -1) {
      // No closing tag – remove everything from start onwards
      result = result.slice(0, start);
      break;
    }
    result = result.slice(0, start) + ' ' + result.slice(closeStart + closeTag.length);
  }
  return result;
}

/**
 * Strip HTML tags using a simple character-scan approach (no regex on user
 * content) to avoid ReDoS.  NOT an XSS sanitiser – output is used for
 * embedding, never rendered as HTML.
 */
function stripTags(text: string): string {
  let result = '';
  let insideTag = false;
  for (const ch of text) {
    if (ch === '<') {
      insideTag = true;
      result += ' ';
    } else if (ch === '>') {
      insideTag = false;
    } else if (!insideTag) {
      result += ch;
    }
  }
  return result;
}

/**
 * Decode common HTML entities.  Process &amp; LAST to prevent double-decoding.
 */
function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Convert HTML to plain text for embedding.
 * Uses indexOf-based block removal to avoid ReDoS.
 */
function htmlToText(content: string): string {
  let text = content;
  text = removeTaggedBlock(text, '<style', '</style>');
  text = removeTaggedBlock(text, '<script', '</script>');
  text = stripTags(text);
  text = decodeEntities(text);
  return text.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

// ---------------------------------------------------------------------------
// PlainTextParser
// ---------------------------------------------------------------------------

/**
 * Handles `text/plain`, `text/html`, and `text/markdown`.
 * For HTML it does a safe tag-strip before section splitting.
 */
export class PlainTextParser implements DocumentParser {
  supports(mimeType: string): boolean {
    return (
      mimeType.startsWith('text/') ||
      mimeType === 'application/json' ||
      mimeType === 'application/xml'
    );
  }

  parse(content: string, mimeType: string): ParsedSection[] {
    let text = content;
    if (mimeType === 'text/html' || mimeType.includes('html')) {
      text = htmlToText(content);
    }
    return splitIntoSections(text);
  }
}

// ---------------------------------------------------------------------------
// Registry / factory
// ---------------------------------------------------------------------------

const DEFAULT_PARSERS: DocumentParser[] = [new PlainTextParser()];

/**
 * Returns the first registered parser that supports the given mimeType.
 * Falls back to PlainTextParser for unknown types.
 */
export function getParser(mimeType: string): DocumentParser {
  const match = DEFAULT_PARSERS.find((p) => p.supports(mimeType));
  return match ?? new PlainTextParser();
}
