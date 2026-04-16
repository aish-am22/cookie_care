import React, { useState, useEffect, useCallback } from 'react';
import { dashboardApi, type DashboardSummary, type ActivityItem, type RiskTrendPoint, type RecentScan } from '../../api/dashboardApi';

const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`animate-pulse bg-[var(--bg-tertiary)] rounded ${className}`} />
);

const StatusBadge: React.FC<{ status: 'COMPLETED' | 'FAILED' }> = ({ status }) => {
  if (status === 'COMPLETED') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
        Completed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
      Failed
    </span>
  );
};

const RiskBadge: React.FC<{ score: number | null }> = ({ score }) => {
  if (score === null) return <span className="text-xs text-[var(--text-primary)]">—</span>;
  if (score >= 70)
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">{score} High</span>;
  if (score >= 40)
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400">{score} Med</span>;
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">{score} Low</span>;
};

const TypeBadge: React.FC<{ type: 'COOKIE' | 'LEGAL' | 'VULNERABILITY' }> = ({ type }) => {
  const map = {
    COOKIE: { label: 'Cookie', cls: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' },
    LEGAL: { label: 'Legal', cls: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' },
    VULNERABILITY: { label: 'Vuln', cls: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400' },
  };
  const { label, cls } = map[type];
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{label}</span>;
};

const KpiCard: React.FC<{
  label: string;
  value: number | string;
  icon: React.ReactNode;
  loading: boolean;
  accent?: string;
}> = ({ label, value, icon, loading, accent = 'text-brand-blue' }) => (
  <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-5 flex items-start gap-4">
    <div className={`p-2.5 rounded-lg bg-[var(--bg-tertiary)] ${accent}`}>
      {icon}
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-xs font-medium text-[var(--text-primary)] uppercase tracking-wide">{label}</p>
      {loading ? (
        <Skeleton className="h-7 w-16 mt-1" />
      ) : (
        <p className="text-2xl font-bold text-[var(--text-headings)] mt-0.5">{value}</p>
      )}
    </div>
  </div>
);

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatShortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const RiskChart: React.FC<{ data: RiskTrendPoint[]; loading: boolean }> = ({ data, loading }) => {
  if (loading) return <Skeleton className="h-40 w-full" />;
  if (data.length === 0) {
    return (
      <div className="h-40 flex items-center justify-center text-sm text-[var(--text-primary)]">
        No trend data yet. Complete some scans to see your risk trends.
      </div>
    );
  }

  const width = 600;
  const height = 140;
  const padding = { top: 10, right: 10, bottom: 30, left: 35 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const maxRisk = Math.max(...data.map(d => d.avgRisk), 10);
  const points = data.map((d, i) => ({
    x: padding.left + (i / Math.max(data.length - 1, 1)) * chartW,
    y: padding.top + chartH - (d.avgRisk / maxRisk) * chartH,
    date: d.date,
    risk: d.avgRisk,
  }));

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaD = `${pathD} L${points[points.length - 1].x},${padding.top + chartH} L${points[0].x},${padding.top + chartH} Z`;

  const yTicks = [0, 25, 50, 75, 100].filter(t => t <= maxRisk + 10);

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-40" preserveAspectRatio="none" role="img" aria-label="Risk trend chart showing average risk score over time">
        <title>Risk trend chart — average risk score over the last 30 days</title>
        {yTicks.map(t => {
          const y = padding.top + chartH - (t / maxRisk) * chartH;
          return (
            <g key={t}>
              <line x1={padding.left} y1={y} x2={padding.left + chartW} y2={y} stroke="var(--border-primary)" strokeDasharray="4 4" strokeWidth="1" />
              <text x={padding.left - 5} y={y + 4} textAnchor="end" fontSize="10" fill="var(--text-primary)">{t}</text>
            </g>
          );
        })}
        <path d={areaD} fill="hsl(210,90%,50%)" opacity="0.15" />
        <path d={pathD} fill="none" stroke="hsl(210,90%,50%)" strokeWidth="2" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3" fill="hsl(210,90%,50%)" stroke="var(--bg-secondary)" strokeWidth="2">
            <title>{formatShortDate(p.date)}: {p.risk}</title>
          </circle>
        ))}
        {[0, Math.floor((points.length - 1) / 2), points.length - 1]
          .filter((i, idx, arr) => arr.indexOf(i) === idx && i < points.length)
          .map(i => (
            <text key={i} x={points[i].x} y={height - 5} textAnchor="middle" fontSize="10" fill="var(--text-primary)">
              {formatShortDate(points[i].date)}
            </text>
          ))}
      </svg>
    </div>
  );
};

interface DashboardViewProps {
  onNavigate: (view: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [trends, setTrends] = useState<RiskTrendPoint[]>([]);
  const [scans, setScans] = useState<RecentScan[]>([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState({ summary: true, activity: true, trends: true, scans: true });
  const [errors, setErrors] = useState<{ summary?: string; activity?: string; trends?: string; scans?: string }>({});

  const loadSummary = useCallback(async () => {
    setLoading(l => ({ ...l, summary: true }));
    try {
      const data = await dashboardApi.getSummary();
      setSummary(data);
      setErrors(e => ({ ...e, summary: undefined }));
    } catch (err) {
      setErrors(e => ({ ...e, summary: err instanceof Error ? err.message : 'Failed to load' }));
    } finally {
      setLoading(l => ({ ...l, summary: false }));
    }
  }, []);

  const loadActivity = useCallback(async () => {
    setLoading(l => ({ ...l, activity: true }));
    try {
      const data = await dashboardApi.getActivity(15);
      setActivity(data);
      setErrors(e => ({ ...e, activity: undefined }));
    } catch (err) {
      setErrors(e => ({ ...e, activity: err instanceof Error ? err.message : 'Failed to load' }));
    } finally {
      setLoading(l => ({ ...l, activity: false }));
    }
  }, []);

  const loadTrends = useCallback(async () => {
    setLoading(l => ({ ...l, trends: true }));
    try {
      const data = await dashboardApi.getRiskTrends(30);
      setTrends(data);
      setErrors(e => ({ ...e, trends: undefined }));
    } catch (err) {
      setErrors(e => ({ ...e, trends: err instanceof Error ? err.message : 'Failed to load' }));
    } finally {
      setLoading(l => ({ ...l, trends: false }));
    }
  }, []);

  const loadScans = useCallback(async (page = 1) => {
    setLoading(l => ({ ...l, scans: true }));
    try {
      const data = await dashboardApi.getRecentScans(page, 8);
      setScans(data.scans);
      setPagination({ page: data.pagination.page, totalPages: data.pagination.totalPages, total: data.pagination.total });
      setErrors(e => ({ ...e, scans: undefined }));
    } catch (err) {
      setErrors(e => ({ ...e, scans: err instanceof Error ? err.message : 'Failed to load' }));
    } finally {
      setLoading(l => ({ ...l, scans: false }));
    }
  }, []);

  useEffect(() => {
    loadSummary();
    loadActivity();
    loadTrends();
    loadScans(1);
  }, [loadSummary, loadActivity, loadTrends, loadScans]);

  const kpiCards = [
    {
      label: 'Total Scans',
      value: summary?.totalScans ?? 0,
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>,
      accent: 'text-brand-blue',
    },
    {
      label: 'Completed',
      value: summary?.completedScans ?? 0,
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
      accent: 'text-green-500',
    },
    {
      label: 'High Risk Findings',
      value: summary?.highRiskFindings ?? 0,
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>,
      accent: 'text-red-500',
    },
    {
      label: 'Active Sessions',
      value: summary?.activeSessions ?? 0,
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2" /></svg>,
      accent: 'text-purple-500',
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text-headings)]">Overview</h2>
          <p className="mt-1 text-sm text-[var(--text-primary)]">Your compliance overview at a glance</p>
        </div>
        <button
          onClick={() => onNavigate('settings')}
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Settings
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((card) => (
          <KpiCard
            key={card.label}
            label={card.label}
            value={card.value}
            icon={card.icon}
            loading={loading.summary}
            accent={card.accent}
          />
        ))}
      </div>

      {/* Quick Actions */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-5">
        <h3 className="text-sm font-semibold text-[var(--text-headings)] mb-3">Quick Actions</h3>
        <div className="flex flex-wrap gap-2">
          {[
            { label: '+ Cookie Scan', view: 'scanner', cls: 'bg-brand-blue text-white hover:bg-brand-blue-light' },
            { label: '+ Legal Review', view: 'legal', cls: 'bg-[var(--bg-tertiary)] text-[var(--text-headings)] hover:border-brand-blue border border-[var(--border-primary)]' },
            { label: '+ Vuln Scan', view: 'vulnerability', cls: 'bg-[var(--bg-tertiary)] text-[var(--text-headings)] hover:border-brand-blue border border-[var(--border-primary)]' },
          ].map(({ label, view, cls }) => (
            <button
              key={view}
              onClick={() => onNavigate(view)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-150 ${cls}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Risk Trend Chart */}
        <div className="lg:col-span-2 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-[var(--text-headings)]">Risk Trend (30 days)</h3>
            {errors.trends && (
              <button onClick={loadTrends} className="text-xs text-brand-blue hover:underline">Retry</button>
            )}
          </div>
          {errors.trends ? (
            <div className="h-40 flex items-center justify-center text-sm text-red-500">{errors.trends}</div>
          ) : (
            <RiskChart data={trends} loading={loading.trends} />
          )}
        </div>

        {/* Activity Feed */}
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-[var(--text-headings)]">Recent Activity</h3>
            {errors.activity && (
              <button onClick={loadActivity} className="text-xs text-brand-blue hover:underline">Retry</button>
            )}
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto max-h-64">
            {loading.activity ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <Skeleton className="w-6 h-6 rounded-full flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))
            ) : errors.activity ? (
              <p className="text-sm text-red-500">{errors.activity}</p>
            ) : activity.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-center">
                <p className="text-sm text-[var(--text-primary)]">No activity yet</p>
                <p className="text-xs text-[var(--text-primary)] mt-1 opacity-70">Run your first scan to get started</p>
              </div>
            ) : (
              activity.map((item) => (
                <div key={item.id} className="flex gap-3 items-start">
                  <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5 ${
                    item.status === 'COMPLETED'
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                      : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                  }`}>
                    {item.status === 'COMPLETED' ? (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-[var(--text-headings)] truncate">{item.title}</p>
                    {item.description && (
                      <p className="text-xs text-[var(--text-primary)] truncate opacity-70">{item.description}</p>
                    )}
                    <p className="text-xs text-[var(--text-primary)] opacity-50 mt-0.5">{formatDate(item.createdAt)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Recent Scans Table */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-primary)]">
          <h3 className="text-sm font-semibold text-[var(--text-headings)]">
            Recent Scans
            {pagination.total > 0 && <span className="ml-2 text-xs font-normal text-[var(--text-primary)]">({pagination.total} total)</span>}
          </h3>
          {errors.scans && (
            <button onClick={() => loadScans(1)} className="text-xs text-brand-blue hover:underline">Retry</button>
          )}
        </div>

        {loading.scans ? (
          <div className="divide-y divide-[var(--border-primary)]">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="px-5 py-3 flex items-center gap-4">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        ) : errors.scans ? (
          <div className="px-5 py-8 text-center text-sm text-red-500">{errors.scans}</div>
        ) : scans.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <svg className="w-10 h-10 mx-auto text-[var(--text-primary)] opacity-40 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-sm font-medium text-[var(--text-headings)]">No scans yet</p>
            <p className="text-xs text-[var(--text-primary)] mt-1">Run a scan to see results here</p>
            <button
              onClick={() => onNavigate('scanner')}
              className="mt-3 px-4 py-1.5 text-xs font-semibold text-white bg-brand-blue rounded-lg hover:bg-brand-blue-light transition-colors"
            >
              Start scanning
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-primary)] bg-[var(--bg-tertiary)]">
                    <th className="px-5 py-2.5 text-left text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wide">Type</th>
                    <th className="px-5 py-2.5 text-left text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wide">Target</th>
                    <th className="px-5 py-2.5 text-left text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wide">Status</th>
                    <th className="px-5 py-2.5 text-left text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wide">Risk</th>
                    <th className="px-5 py-2.5 text-left text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wide">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-primary)]">
                  {scans.map((scan) => (
                    <tr key={scan.id} className="hover:bg-[var(--bg-tertiary)] transition-colors">
                      <td className="px-5 py-3"><TypeBadge type={scan.type} /></td>
                      <td className="px-5 py-3 max-w-xs">
                        <span className="text-[var(--text-headings)] truncate block text-xs" title={scan.target}>{scan.target}</span>
                      </td>
                      <td className="px-5 py-3"><StatusBadge status={scan.status} /></td>
                      <td className="px-5 py-3"><RiskBadge score={scan.riskScore} /></td>
                      <td className="px-5 py-3 text-xs text-[var(--text-primary)]">{formatDate(scan.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--border-primary)]">
                <span className="text-xs text-[var(--text-primary)]">Page {pagination.page} of {pagination.totalPages}</span>
                <div className="flex gap-2">
                  <button
                    disabled={pagination.page <= 1}
                    onClick={() => loadScans(pagination.page - 1)}
                    className="px-3 py-1 text-xs font-medium rounded-lg border border-[var(--border-primary)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Prev
                  </button>
                  <button
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() => loadScans(pagination.page + 1)}
                    className="px-3 py-1 text-xs font-medium rounded-lg border border-[var(--border-primary)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
