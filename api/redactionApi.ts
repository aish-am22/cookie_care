import { httpClient } from './httpClient';

/**
 * Redaction API placeholder.
 * TODO: Replace with real implementation when /api/find-pii and
 * /api/redact-document are migrated.
 */
export const redactionApi = {
  findPii(base64Doc: string, mimeType: string): Promise<{ piiFound: string[] }> {
    return httpClient.post<{ piiFound: string[] }>('/api/redaction/find-pii', {
      base64Doc,
      mimeType,
    });
  },

  redactDocument(
    base64Doc: string,
    mimeType: string,
    itemsToRedact: string[]
  ): Promise<{ redactedBase64: string }> {
    return httpClient.post<{ redactedBase64: string }>('/api/redaction/redact', {
      base64Doc,
      mimeType,
      itemsToRedact,
    });
  },
};
