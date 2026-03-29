import type { Request, Response, NextFunction } from "express";
import * as dashboardService from "../services/dashboard/index.js";

export async function getSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const summary = await dashboardService.getDashboardSummary(userId);
    res.json(summary);
  } catch (e) {
    next(e);
  }
}

export async function getActivity(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const feed = await dashboardService.getActivityFeed(userId, limit);
    res.json(feed);
  } catch (e) {
    next(e);
  }
}

export async function getRiskTrends(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const days = Math.min(Number(req.query.days) || 30, 90);
    const trends = await dashboardService.getRiskTrends(userId, days);
    res.json(trends);
  } catch (e) {
    next(e);
  }
}

export async function getRecentScans(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Number(req.query.limit) || 10, 50);
    const result = await dashboardService.getRecentScans(userId, page, limit);
    res.json(result);
  } catch (e) {
    next(e);
  }
}
