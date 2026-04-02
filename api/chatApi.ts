import { httpClient } from './httpClient';
import type { ChatMessage } from '../types';
import type { AskRequest, AskResponse, ApiSuccess } from '../types/api';

/**
 * Chat / Ask API.
 *
 * Phase A endpoints:
 *   POST /api/ask  — RAG Q&A against an ingested contract (stub in Phase A)
 *
 * Legacy endpoint:
 *   POST /api/chat-with-document  — direct document Q&A (no persistence)
 */
export const chatApi = {
  /** Ask a question about an ingested contract. Returns a plain-text answer. */
  ask(payload: AskRequest): Promise<ApiSuccess<AskResponse>> {
    return httpClient.post<ApiSuccess<AskResponse>>('/api/ask', payload);
  },

  /** Legacy: chat with raw document text (no contract persistence). */
  sendMessage(messages: ChatMessage[], userMessage: string): Promise<{ reply: string }> {
    return httpClient.post<{ reply: string }>('/api/chat-with-document', { messages, userMessage });
  },
};
