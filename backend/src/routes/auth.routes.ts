import { Router } from "express";
import rateLimit from "express-rate-limit";
import * as authController from "../controllers/auth.controller.js";
import { requireAuth } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { csrfGuard } from "../middlewares/csrf.js";
import { loginSchema, registerSchema } from "../schemas/auth.schema.js";

const router = Router();

// Strict rate limiter for sensitive auth endpoints
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});

// Even stricter for login attempts
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again later." },
});

router.post("/register", authRateLimiter, validate("body", registerSchema), authController.register);
router.post("/login", loginRateLimiter, validate("body", loginSchema), authController.login);
router.post("/refresh", authRateLimiter, csrfGuard, authController.refresh);
router.post("/logout", csrfGuard, authController.logout);
router.get("/me", requireAuth, authController.me);

export default router;