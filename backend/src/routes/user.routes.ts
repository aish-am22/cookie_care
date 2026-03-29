import { Router } from "express";
import rateLimit from "express-rate-limit";
import * as userController from "../controllers/user.controller.js";
import { requireAuth } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import {
  updateProfileSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  saveScanSchema,
} from "../schemas/user.schema.js";

const router = Router();

const sensitiveRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});

const verifyRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});

// Profile
router.get("/me", requireAuth, userController.getProfile);
router.patch("/me", requireAuth, validate("body", updateProfileSchema), userController.updateProfile);

// Password change (authenticated)
router.post(
  "/change-password",
  requireAuth,
  sensitiveRateLimiter,
  validate("body", changePasswordSchema),
  userController.changePassword
);

// Password reset (public)
router.post(
  "/forgot-password",
  sensitiveRateLimiter,
  validate("body", forgotPasswordSchema),
  userController.forgotPassword
);
router.post(
  "/reset-password",
  sensitiveRateLimiter,
  validate("body", resetPasswordSchema),
  userController.resetPassword
);

// Email verification
router.post(
  "/send-verification-email",
  requireAuth,
  verifyRateLimiter,
  userController.sendVerificationEmail
);
router.post(
  "/verify-email",
  verifyRateLimiter,
  validate("body", verifyEmailSchema),
  userController.verifyEmail
);

// Sessions
router.get("/sessions", requireAuth, userController.getSessions);
router.delete("/sessions/:sessionId", requireAuth, userController.revokeSession);
router.post("/sessions/revoke-all", requireAuth, userController.revokeAllSessions);

// Scans
router.post("/scans", requireAuth, validate("body", saveScanSchema), userController.saveScan);

export default router;
