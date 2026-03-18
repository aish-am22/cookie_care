/** URL validation and normalisation helpers. */

/**
 * Returns true when the string is a valid absolute HTTP/HTTPS URL.
 */
export function isValidUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Normalise a URL string: trims whitespace and ensures lowercase scheme/host.
 * Returns null when the input is not a valid HTTP/HTTPS URL.
 */
export function normalizeUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    // The URL constructor automatically lowercases protocol and host,
    // so we can reassemble the URL from its parsed parts.
    return `${url.protocol}//${url.host}${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

/**
 * Strip trailing slash from a URL string (preserves root '/').
 */
export function stripTrailingSlash(url: string): string {
  return url.length > 1 ? url.replace(/\/$/, '') : url;
}
