import { httpClient } from './httpClient';
import type { ApiSuccess, DraftingSessionPayload } from '../types/api';

export interface CreateDraftingSessionRequest {
  documentTitle?: string;
  preferredClausesBySection?: Record<string, string>;
  variables?: Record<string, string | number | boolean | string[]>;
}

export const draftingApi = {
  async createSession(payload: CreateDraftingSessionRequest): Promise<DraftingSessionPayload> {
    const response = await httpClient.post<ApiSuccess<DraftingSessionPayload>>('/api/drafting/sessions', payload);
    return response.data;
  },

  async getSession(id: string): Promise<DraftingSessionPayload> {
    const response = await httpClient.get<ApiSuccess<DraftingSessionPayload>>(`/api/drafting/sessions/${id}`);
    return response.data;
  },
};
