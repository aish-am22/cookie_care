import { db } from "../../infra/db.js";

function formatScanType(type: string): string {
  return `${type.charAt(0).toUpperCase() + type.slice(1).toLowerCase()} Scan`;
}

export async function getDashboardSummary(userId: string) {
  const [total, completed, failed, highRisk, activeSessions] = await Promise.all([
    db.scanRecord.count({ where: { userId } }),
    db.scanRecord.count({ where: { userId, status: "COMPLETED" } }),
    db.scanRecord.count({ where: { userId, status: "FAILED" } }),
    db.scanRecord.count({ where: { userId, status: "COMPLETED", riskScore: { gte: 70 } } }),
    db.session.count({ where: { userId, status: "ACTIVE", expiresAt: { gt: new Date() } } }),
  ]);

  return {
    totalScans: total,
    completedScans: completed,
    failedScans: failed,
    highRiskFindings: highRisk,
    activeSessions,
  };
}

export async function getActivityFeed(userId: string, limit = 20) {
  const [scans, auditLogs] = await Promise.all([
    db.scanRecord.findMany({
      where: { userId },
      select: {
        id: true,
        type: true,
        status: true,
        target: true,
        riskScore: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    db.auditLog.findMany({
      where: { userId },
      select: {
        id: true,
        action: true,
        resource: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
  ]);

  const scanEvents = scans.map((s) => ({
    id: `scan_${s.id}`,
    type: "scan" as const,
    title: formatScanType(s.type),
    description: s.target,
    status: s.status,
    riskScore: s.riskScore,
    createdAt: s.createdAt.toISOString(),
  }));

  const auditEvents = auditLogs.map((a) => ({
    id: `audit_${a.id}`,
    type: "audit" as const,
    title: formatAuditAction(a.action),
    description: a.resource ?? "",
    status: "COMPLETED" as const,
    riskScore: null,
    createdAt: a.createdAt.toISOString(),
  }));

  return [...scanEvents, ...auditEvents]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

function formatAuditAction(action: string): string {
  const map: Record<string, string> = {
    PASSWORD_CHANGE: "Password Changed",
    PASSWORD_RESET_REQUEST: "Password Reset Requested",
    PASSWORD_RESET_COMPLETE: "Password Reset Completed",
    EMAIL_VERIFICATION_SENT: "Verification Email Sent",
    EMAIL_VERIFICATION_COMPLETE: "Email Verified",
    SESSION_REVOKED: "Session Revoked",
    SESSION_REVOKE_ALL: "All Sessions Revoked",
    PROFILE_UPDATE: "Profile Updated",
  };
  return map[action] ?? action.replace(/_/g, " ");
}

export async function getRiskTrends(userId: string, days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const scans = await db.scanRecord.findMany({
    where: {
      userId,
      status: "COMPLETED",
      createdAt: { gte: since },
    },
    select: { createdAt: true, riskScore: true, type: true },
    orderBy: { createdAt: "asc" },
  });

  const byDate = new Map<string, { scores: number[]; count: number }>();

  for (const scan of scans) {
    const date = scan.createdAt.toISOString().split("T")[0];
    if (!byDate.has(date)) byDate.set(date, { scores: [], count: 0 });
    const entry = byDate.get(date)!;
    entry.count++;
    if (scan.riskScore !== null) entry.scores.push(scan.riskScore);
  }

  return Array.from(byDate.entries()).map(([date, data]) => ({
    date,
    avgRisk: data.scores.length
      ? Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length)
      : 0,
    scanCount: data.count,
  }));
}

export async function getRecentScans(userId: string, page = 1, limit = 10) {
  const skip = (page - 1) * limit;

  const [scans, total] = await Promise.all([
    db.scanRecord.findMany({
      where: { userId },
      select: {
        id: true,
        type: true,
        status: true,
        target: true,
        riskScore: true,
        findings: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    db.scanRecord.count({ where: { userId } }),
  ]);

  return {
    scans,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
