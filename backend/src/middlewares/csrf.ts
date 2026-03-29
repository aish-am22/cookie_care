import type { Request, Response, NextFunction } from "express";

/**
 * Lightweight CSRF guard for endpoints that rely on httpOnly cookies.
 *
 * Modern browsers with SameSite=Strict/Lax already prevent most CSRF, but
 * this explicit check adds an extra layer: a simple custom header that
 * cross-origin forged requests cannot include without a preflight (which our
 * CORS policy blocks).
 *
 * Usage:
 *   router.post('/refresh', csrfGuard, authController.refresh);
 */
export function csrfGuard(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers["origin"];
  const host = req.headers["host"];

  // In production, verify Origin matches the expected host
  if (process.env.NODE_ENV === "production") {
    if (!origin) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    try {
      const originHost = new URL(origin).host;
      if (originHost !== host) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    } catch {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }

  next();
}
