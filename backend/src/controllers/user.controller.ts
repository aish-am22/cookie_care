import type { Request, Response, NextFunction } from "express";
import * as userService from "../services/user/index.js";

export async function getProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const profile = await userService.getProfile(userId);
    res.json(profile);
  } catch (e) {
    next(e);
  }
}

export async function updateProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const profile = await userService.updateProfile(userId, req.body, {
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.json(profile);
  } catch (e) {
    next(e);
  }
}

export async function changePassword(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const result = await userService.changePassword(userId, req.body, {
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function forgotPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await userService.forgotPassword(req.body.email, {
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await userService.resetPassword(req.body, {
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function sendVerificationEmail(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const result = await userService.sendVerificationEmail(userId, {
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function verifyEmail(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await userService.verifyEmail(req.body.token, {
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function getSessions(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const sessions = await userService.getSessions(userId);
    res.json(sessions);
  } catch (e) {
    next(e);
  }
}

export async function revokeSession(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const sessionId = req.params.sessionId;
    const result = await userService.revokeSession(userId, sessionId, {
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function revokeAllSessions(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const result = await userService.revokeAllSessions(userId, undefined, {
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function saveScan(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const record = await userService.saveScanRecord(userId, req.body);
    res.status(201).json(record);
  } catch (e) {
    next(e);
  }
}
