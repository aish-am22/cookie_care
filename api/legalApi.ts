import { httpClient } from './httpClient';
import type { LegalAnalysisResult, LegalPerspective } from '../types';

/**
 * Legal API placeholder.
 * TODO: Replace with real implementation when legal review endpoints are migrated.
 */
export const legalApi = {
  review(
    documentText: string,
    perspective: LegalPerspective
  ): Promise<LegalAnalysisResult> {
    return httpClient.post<LegalAnalysisResult>('/api/legal/review', {
      documentText,
      perspective,
    });
  },
};
