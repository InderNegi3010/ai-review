import express from "express";
import { authenticateToken } from "../middleware/auth.js";
import {
  getBusinessAnalytics,
  exportAnalyticsCSV,
} from "../controllers/analyticsController.js";

const analyticsRouter = express.Router();

// Get business analytics
analyticsRouter.get("/:businessId", authenticateToken, getBusinessAnalytics);

// Export analytics as CSV
analyticsRouter.get("/export/csv/:businessId", authenticateToken, exportAnalyticsCSV);

export { analyticsRouter };
