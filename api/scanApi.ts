import { httpClient } from './httpClient';
import type { ScanResultData } from '../types';

/**
 * Scan API placeholder.
 * TODO: Replace with real implementation when /api/scan is migrated.
 */
export const scanApi = {
  start(url: string): Promise<ScanResultData> {
    return httpClient.post<ScanResultData>('/api/scan', { url });
  },
};
