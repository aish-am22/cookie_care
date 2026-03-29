import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { db } from "../../infra/db.js";


const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'fallback_secret';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'fallback_secret';
const ACCESS_EXPIRES_IN = (process.env.ACCESS_TOKEN_EXPIRES_IN || '15m') as any;
const REFRESH_EXPIRES_IN = (process.env.REFRESH_TOKEN_EXPIRES_IN || '30d') as any;

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12');

// Debug logging for environment variables
console.log('[Auth Config] ACCESS_SECRET loaded:', !!ACCESS_SECRET && ACCESS_SECRET !== 'fallback_secret');
console.log('[Auth Config] REFRESH_SECRET loaded:', !!REFRESH_SECRET && REFRESH_SECRET !== 'fallback_secret');
console.log('[Auth Config] BCRYPT_ROUNDS:', BCRYPT_ROUNDS);




export const generateAccessToken = (user: any) => {
  return jwt.sign({ id: user.id, email: user.email, role: user.role }, ACCESS_SECRET, {
    expiresIn: ACCESS_EXPIRES_IN,
  });
};

export const generateRefreshToken = (user: any) => {
  return jwt.sign({ id: user.id }, REFRESH_SECRET, {
    expiresIn: REFRESH_EXPIRES_IN,
  });
};

if (!ACCESS_SECRET || !REFRESH_SECRET) {
  throw new Error("JWT secrets are not configured.");
}

type JwtUser = {
  sub: string;
  email: string;
  role: "USER" | "ADMIN";
};

function signAccessToken(user: JwtUser) {
  return jwt.sign(user, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES_IN });
}

function signRefreshToken(user: JwtUser) {
  return jwt.sign(user, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES_IN });
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function getRefreshExpiryDate() {
  const days = REFRESH_EXPIRES_IN.endsWith("d")
    ? Number(REFRESH_EXPIRES_IN.replace("d", ""))
    : 30;
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

export async function register(input: {
  email: string;
  password: string;
  fullName?: string;
}) {
  try {
    const email = input.email.trim().toLowerCase();

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) throw new Error("Email already registered.");

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

    const user = await db.user.create({
      data: {
        email,
        passwordHash,
        fullName: input.fullName?.trim() || null,
      },
    });

    return { id: user.id, email: user.email, fullName: user.fullName, role: user.role };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Auth Register] Error:', errorMessage, error);
    throw error;
  }
}

export async function login(input: {
  email: string;
  password: string;
  userAgent?: string;
  ipAddress?: string;
}) {
  try {
    const email = input.email.trim().toLowerCase();

    const user = await db.user.findUnique({ where: { email } });
    if (!user || !user.isActive) throw new Error("Invalid credentials.");

    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) throw new Error("Invalid credentials.");

    const payload: JwtUser = { sub: user.id, email: user.email, role: user.role };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    await db.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: hashToken(refreshToken),
        userAgent: input.userAgent || null,
        ipAddress: input.ipAddress || null,
        expiresAt: getRefreshExpiryDate(),
      },
    });

    await db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Auth Login] Error:', errorMessage, error);
    throw error;
  }
}

export async function refresh(refreshToken: string, userAgent?: string, ipAddress?: string) {
  let decoded: JwtUser;
  try {
    decoded = jwt.verify(refreshToken, REFRESH_SECRET) as JwtUser;
  } catch {
    throw new Error("Invalid refresh token.");
  }

  const oldHash = hashToken(refreshToken);
  const session = await db.session.findFirst({
    where: {
      userId: decoded.sub,
      refreshTokenHash: oldHash,
      status: "ACTIVE",
    },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date()) {
    throw new Error("Refresh session expired or invalid.");
  }

  // rotate refresh token
  const payload: JwtUser = {
    sub: session.user.id,
    email: session.user.email,
    role: session.user.role,
  };

  const newAccessToken = signAccessToken(payload);
  const newRefreshToken = signRefreshToken(payload);

  await db.session.update({
    where: { id: session.id },
    data: {
      refreshTokenHash: hashToken(newRefreshToken),
      userAgent: userAgent || session.userAgent,
      ipAddress: ipAddress || session.ipAddress,
      expiresAt: getRefreshExpiryDate(),
      updatedAt: new Date(),
    },
  });

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  };
}

export async function logout(refreshToken: string) {
  const tokenHash = hashToken(refreshToken);
  await db.session.updateMany({
    where: { refreshTokenHash: tokenHash, status: "ACTIVE" },
    data: { status: "REVOKED", revokedAt: new Date() },
  });
  return { success: true };
}

export async function getMe(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, fullName: true, role: true, isEmailVerified: true, createdAt: true },
  });
  if (!user) throw new Error("User not found.");
  return user;
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, ACCESS_SECRET) as JwtUser;
}