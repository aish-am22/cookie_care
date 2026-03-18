import { httpClient } from './httpClient';
import type { ChatMessage } from '../types';

/**
 * Chat API placeholder.
 * TODO: Replace with real implementation when the chat/DPA assistant endpoint is migrated.
 * Note: The live endpoint streams via SSE; use useSse hook for the real implementation.
 */
export const chatApi = {
  sendMessage(messages: ChatMessage[], userMessage: string): Promise<{ reply: string }> {
    return httpClient.post<{ reply: string }>('/api/chat', { messages, userMessage });
  },
};
