import { Router } from "express";
import * as dashboardController from "../controllers/dashboard.controller.js";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();

router.get("/summary", requireAuth, dashboardController.getSummary);
router.get("/activity", requireAuth, dashboardController.getActivity);
router.get("/risk-trends", requireAuth, dashboardController.getRiskTrends);
router.get("/recent-scans", requireAuth, dashboardController.getRecentScans);

export default router;
