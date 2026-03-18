import { httpClient } from './httpClient';

/**
 * Email API placeholder.
 * TODO: Replace with real implementation when /api/email-report is migrated.
 */
export const emailApi = {
  sendReport(payload: { to: string; subject: string; body: string }): Promise<void> {
    return httpClient.post<void>('/api/email/report', payload);
  },
};
