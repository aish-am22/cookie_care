import { httpClient } from './httpClient';
import type { GeneratedContract } from '../types';

/**
 * Contracts API placeholder.
 * TODO: Replace with real implementation when contract generation endpoints are migrated.
 */
export const contractsApi = {
  generate(prompt: string): Promise<GeneratedContract> {
    return httpClient.post<GeneratedContract>('/api/contracts/generate', { prompt });
  },
};
