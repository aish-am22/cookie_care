import bcrypt from "bcryptjs";
import crypto from "crypto";
import nodemailer from "nodemailer";
import type { Prisma } from "@prisma/client";
import { db } from "../../infra/db.js";
import { env } from "../../config/index.js";
import logger from "../../infra/logger.js";

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function sendEmail(to: string, subject: string, html: string) {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
    logger.warn("SMTP not configured, skipping email send");
    return;
  }
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? 587,
    secure: (env.SMTP_PORT ?? 587) === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  await transporter.sendMail({ from: env.SMTP_USER, to, subject, html });
}

async function createAuditLog(
  userId: string | null,
  action: string,
  resource: string | null,
  metadata: Record<string, unknown> | null,
  ipAddress?: string,
  userAgent?: string
) {
  await db.auditLog.create({
    data: {
      userId,
      action,
      resource,
      metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    },
  });
}

// ─── Profile ───────────────────────────────────────────────────────────────

export async function getProfile(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      isEmailVerified: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
  if (!user) throw new Error("User not found.");
  return user;
}

export async function updateProfile(
  userId: string,
  input: { fullName: string },
  context?: { ipAddress?: string; userAgent?: string }
) {
  const user = await db.user.update({
    where: { id: userId },
    data: { fullName: input.fullName.trim() },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      isEmailVerified: true,
      createdAt: true,
    },
  });

  await createAuditLog(userId, "PROFILE_UPDATE", "user", null, context?.ipAddress, context?.userAgent);

  return user;
}

// ─── Password ──────────────────────────────────────────────────────────────

export async function changePassword(
  userId: string,
  input: { currentPassword: string; newPassword: string },
  context?: { ipAddress?: string; userAgent?: string }
) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found.");

  const ok = await bcrypt.compare(input.currentPassword, user.passwordHash);
  if (!ok) throw new Error("Current password is incorrect.");

  const newHash = await bcrypt.hash(input.newPassword, env.BCRYPT_ROUNDS);
  await db.user.update({ where: { id: userId }, data: { passwordHash: newHash } });

  await createAuditLog(userId, "PASSWORD_CHANGE", "user", null, context?.ipAddress, context?.userAgent);

  return { success: true };
}

export async function forgotPassword(
  email: string,
  context?: { ipAddress?: string; userAgent?: string }
) {
  // Always return success to prevent email enumeration
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });

  if (user && user.isActive) {
    // Invalidate previous tokens
    await db.passwordResetToken.deleteMany({
      where: { userId: user.id, usedAt: null },
    });

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    await createAuditLog(user.id, "PASSWORD_RESET_REQUEST", "user", null, context?.ipAddress, context?.userAgent);

    const resetLink = `${process.env.FRONTEND_URL ?? "http://localhost:3000"}/#reset-password?token=${rawToken}`;
    await sendEmail(
      user.email,
      "Reset your Cookie Care password",
      `<p>Click the link below to reset your password (expires in 1 hour):</p>
       <a href="${resetLink}">${resetLink}</a>
       <p>If you did not request this, please ignore this email.</p>`
    );

    logger.info({ userId: user.id }, "Password reset token generated");
  }

  return { success: true };
}

export async function resetPassword(
  input: { token: string; newPassword: string },
  context?: { ipAddress?: string; userAgent?: string }
) {
  const tokenHash = hashToken(input.token);
  const record = await db.passwordResetToken.findUnique({ where: { tokenHash } });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new Error("Invalid or expired reset token.");
  }

  const newHash = await bcrypt.hash(input.newPassword, env.BCRYPT_ROUNDS);

  await db.$transaction([
    db.user.update({
      where: { id: record.userId },
      data: { passwordHash: newHash },
    }),
    db.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    // Revoke all sessions for security
    db.session.updateMany({
      where: { userId: record.userId, status: "ACTIVE" },
      data: { status: "REVOKED", revokedAt: new Date() },
    }),
  ]);

  await createAuditLog(record.userId, "PASSWORD_RESET_COMPLETE", "user", null, context?.ipAddress, context?.userAgent);

  return { success: true };
}

// ─── Email Verification ────────────────────────────────────────────────────

export async function sendVerificationEmail(
  userId: string,
  context?: { ipAddress?: string; userAgent?: string }
) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found.");
  if (user.isEmailVerified) throw new Error("Email already verified.");

  // Invalidate previous tokens
  await db.emailVerificationToken.deleteMany({
    where: { userId, usedAt: null },
  });

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  await db.emailVerificationToken.create({
    data: { userId, tokenHash, expiresAt },
  });

  await createAuditLog(userId, "EMAIL_VERIFICATION_SENT", "user", null, context?.ipAddress, context?.userAgent);

  const verifyLink = `${process.env.FRONTEND_URL ?? "http://localhost:3000"}/#verify-email?token=${rawToken}`;
  await sendEmail(
    user.email,
    "Verify your Cookie Care email",
    `<p>Click the link below to verify your email (expires in 24 hours):</p>
     <a href="${verifyLink}">${verifyLink}</a>
     <p>If you did not request this, please ignore this email.</p>`
  );

  return { success: true };
}

export async function verifyEmail(
  token: string,
  context?: { ipAddress?: string; userAgent?: string }
) {
  const tokenHash = hashToken(token);
  const record = await db.emailVerificationToken.findUnique({ where: { tokenHash } });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new Error("Invalid or expired verification token.");
  }

  await db.$transaction([
    db.user.update({
      where: { id: record.userId },
      data: { isEmailVerified: true },
    }),
    db.emailVerificationToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
  ]);

  await createAuditLog(record.userId, "EMAIL_VERIFICATION_COMPLETE", "user", null, context?.ipAddress, context?.userAgent);

  return { success: true };
}

// ─── Sessions ──────────────────────────────────────────────────────────────

export async function getSessions(userId: string) {
  const sessions = await db.session.findMany({
    where: { userId, status: "ACTIVE", expiresAt: { gt: new Date() } },
    select: {
      id: true,
      userAgent: true,
      ipAddress: true,
      createdAt: true,
      updatedAt: true,
      expiresAt: true,
    },
    orderBy: { updatedAt: "desc" },
  });
  return sessions;
}

export async function revokeSession(
  userId: string,
  sessionId: string,
  context?: { ipAddress?: string; userAgent?: string }
) {
  const session = await db.session.findFirst({
    where: { id: sessionId, userId, status: "ACTIVE" },
  });
  if (!session) throw new Error("Session not found.");

  await db.session.update({
    where: { id: sessionId },
    data: { status: "REVOKED", revokedAt: new Date() },
  });

  await createAuditLog(userId, "SESSION_REVOKED", sessionId, null, context?.ipAddress, context?.userAgent);

  return { success: true };
}

export async function revokeAllSessions(
  userId: string,
  currentRefreshTokenHash?: string,
  context?: { ipAddress?: string; userAgent?: string }
) {
  const where = currentRefreshTokenHash
    ? { userId, status: "ACTIVE" as const, refreshTokenHash: { not: currentRefreshTokenHash } }
    : { userId, status: "ACTIVE" as const };

  const result = await db.session.updateMany({
    where,
    data: { status: "REVOKED", revokedAt: new Date() },
  });

  await createAuditLog(userId, "SESSION_REVOKE_ALL", "sessions", { count: result.count }, context?.ipAddress, context?.userAgent);

  return { success: true, count: result.count };
}

// ─── Scans ─────────────────────────────────────────────────────────────────

export async function saveScanRecord(
  userId: string,
  input: {
    type: "COOKIE" | "LEGAL" | "VULNERABILITY";
    status: "COMPLETED" | "FAILED";
    target: string;
    riskScore?: number;
    findings?: number;
    metadata?: Record<string, unknown>;
  }
) {
  const record = await db.scanRecord.create({
    data: {
      userId,
      type: input.type,
      status: input.status,
      target: input.target,
      riskScore: input.riskScore ?? null,
      findings: input.findings ?? null,
      metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
    select: {
      id: true,
      type: true,
      status: true,
      target: true,
      riskScore: true,
      findings: true,
      createdAt: true,
    },
  });
  return record;
}
