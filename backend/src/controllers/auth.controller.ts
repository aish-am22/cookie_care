import type { Request, Response, NextFunction } from "express";
import * as authService from "../services/auth/index.js";

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
    res.status(200).json(data);
  } catch (e) {
    next(e);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await authService.refresh(
      req.body.refreshToken,
      req.headers["user-agent"],
      req.ip
    );
    res.status(200).json(data);
  } catch (e) {
    next(e);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await authService.logout(req.body.refreshToken);
    res.status(200).json(data);
  } catch (e) {
    next(e);
  }
}

export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const data = await authService.getMe(userId);
    res.status(200).json(data);
  } catch (e) {
    next(e);
  }
}