import type { Request, Response, NextFunction } from "express";
import * as authService from "../services/auth/index.js";
import { env } from "../config/index.js";

const IS_PRODUCTION = env.NODE_ENV === "production";

const REFRESH_COOKIE_NAME = "refresh_token";

function parseDaysFromExpiry(expiry: string): number {
  if (typeof expiry === "string" && expiry.endsWith("d")) {
    return Number(expiry.replace("d", ""));
  }
  return 30;
}

const cookieOptions = {
  httpOnly: true,
  secure: IS_PRODUCTION,
  sameSite: IS_PRODUCTION ? ("strict" as const) : ("lax" as const),
  path: "/api/auth",
  maxAge: parseDaysFromExpiry(env.REFRESH_TOKEN_EXPIRES_IN) * 24 * 60 * 60 * 1000,
};

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await authService.register(req.body);
    res.status(201).json(data);
  } catch (e) {
    next(e);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await authService.login({
      email: req.body.email,
      password: req.body.password,
      userAgent: req.headers["user-agent"],
      ipAddress: req.ip,
    });

    res.cookie(REFRESH_COOKIE_NAME, data.refreshToken, cookieOptions);

    res.status(200).json({
      accessToken: data.accessToken,
      user: data.user,
    });
  } catch (e) {
    next(e);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const refreshToken: string | undefined = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!refreshToken) {
      res.status(401).json({ error: "No refresh token provided" });
      return;
    }

    const data = await authService.refresh(
      refreshToken,
      req.headers["user-agent"],
      req.ip
    );

    res.cookie(REFRESH_COOKIE_NAME, data.refreshToken, cookieOptions);

    res.status(200).json({ accessToken: data.accessToken });
  } catch (e) {
    next(e);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    const refreshToken: string | undefined = req.cookies?.[REFRESH_COOKIE_NAME];
    if (refreshToken) {
      await authService.logout(refreshToken);
    }

    res.clearCookie(REFRESH_COOKIE_NAME, { ...cookieOptions, maxAge: undefined });
    res.status(200).json({ success: true });
  } catch (e) {
    next(e);
  }
}

export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const data = await authService.getMe(userId);
    res.status(200).json(data);
  } catch (e) {
    next(e);
  }
}