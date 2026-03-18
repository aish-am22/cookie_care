/** Safe JSON parse helper that never throws. */

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Parse a JSON string without throwing.
 * Returns a discriminated-union result so callers can branch safely.
 */
export function safeJsonParse<T = unknown>(raw: string): ParseResult<T> {
  try {
    return { ok: true, data: JSON.parse(raw) as T };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Serialise a value to JSON without throwing.
 * Returns null when serialisation fails (e.g. circular references).
 */
export function safeJsonStringify(value: unknown): string | null {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}
