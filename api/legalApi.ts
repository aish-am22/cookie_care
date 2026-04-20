import { httpClient } from './httpClient';
import type { LegalAnalysisResult, LegalPerspective } from '../types';

export const legalApi = {
  review(
    documentText: string,
    perspective: LegalPerspective
  ): Promise<LegalAnalysisResult> {
    return httpClient.post<LegalAnalysisResult>('/api/analyze-legal-document', {
      documentText,
      perspective,
    });
  },
};
