import { httpClient } from './httpClient';

export interface UserProfile {
  id: string;
  email: string;
  fullName: string | null;
  role: 'USER' | 'ADMIN';
  isEmailVerified: boolean;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface Session {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export interface ScanRecord {
  id: string;
  type: 'COOKIE' | 'LEGAL' | 'VULNERABILITY';
  status: 'COMPLETED' | 'FAILED';
  target: string;
  riskScore: number | null;
  findings: number | null;
  createdAt: string;
}

export const userApi = {
  getProfile: () => httpClient.get<UserProfile>('/api/users/me'),
  updateProfile: (data: { fullName: string }) =>
    httpClient.patch<UserProfile>('/api/users/me', data),
  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    httpClient.post<{ success: boolean }>('/api/users/change-password', data),
  forgotPassword: (email: string) =>
    httpClient.post<{ success: boolean }>('/api/users/forgot-password', { email }),
  resetPassword: (data: { token: string; newPassword: string }) =>
    httpClient.post<{ success: boolean }>('/api/users/reset-password', data),
  sendVerificationEmail: () =>
    httpClient.post<{ success: boolean }>('/api/users/send-verification-email', {}),
  verifyEmail: (token: string) =>
    httpClient.post<{ success: boolean }>('/api/users/verify-email', { token }),
  getSessions: () => httpClient.get<Session[]>('/api/users/sessions'),
  revokeSession: (sessionId: string) =>
    httpClient.delete<{ success: boolean }>(`/api/users/sessions/${sessionId}`),
  revokeAllSessions: () =>
    httpClient.post<{ success: boolean; count: number }>('/api/users/sessions/revoke-all', {}),
  saveScan: (data: {
    type: 'COOKIE' | 'LEGAL' | 'VULNERABILITY';
    status: 'COMPLETED' | 'FAILED';
    target: string;
    riskScore?: number;
    findings?: number;
  }) => httpClient.post<ScanRecord>('/api/users/scans', data),
};
