import express from "express";
import { authenticateToken, requireRole } from "../middleware/auth.js";
import {
  getClientDashboard,
  getAdminDashboard,
  getRevenueSummary,
  getAIInsights,
} from "../controllers/dashboardController.js";

const router = express.Router();

router.get("/client/:businessId", authenticateToken, getClientDashboard);
router.get("/admin", authenticateToken, requireRole(["admin"]), getAdminDashboard);
router.get("/revenue", authenticateToken, requireRole(["admin"]), getRevenueSummary);
router.get("/ai-insights/:businessId", authenticateToken, getAIInsights);

export default router;
