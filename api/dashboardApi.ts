import { httpClient } from './httpClient';

export interface DashboardSummary {
  totalScans: number;
  completedScans: number;
  failedScans: number;
  highRiskFindings: number;
  activeSessions: number;
}

export interface ActivityItem {
  id: string;
  type: 'scan' | 'audit';
  title: string;
  description: string;
  status: 'COMPLETED' | 'FAILED';
  riskScore: number | null;
  createdAt: string;
}

export interface RiskTrendPoint {
  date: string;
  avgRisk: number;
  scanCount: number;
}

export interface RecentScan {
  id: string;
  type: 'COOKIE' | 'LEGAL' | 'VULNERABILITY';
  status: 'COMPLETED' | 'FAILED';
  target: string;
  riskScore: number | null;
  findings: number | null;
  createdAt: string;
}

export interface RecentScansResponse {
  scans: RecentScan[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const dashboardApi = {
  getSummary: () => httpClient.get<DashboardSummary>('/api/dashboard/summary'),
  getActivity: (limit = 20) => httpClient.get<ActivityItem[]>(`/api/dashboard/activity?limit=${limit}`),
  getRiskTrends: (days = 30) => httpClient.get<RiskTrendPoint[]>(`/api/dashboard/risk-trends?days=${days}`),
  getRecentScans: (page = 1, limit = 10) =>
    httpClient.get<RecentScansResponse>(`/api/dashboard/recent-scans?page=${page}&limit=${limit}`),
};
