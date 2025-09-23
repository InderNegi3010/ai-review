// routes/integrationRoutes.js
import express from "express";
import {
  setupIntegration,
  fetchExternalReviews,
  getBusinessIntegrations,
  removeIntegration,
  updateIntegrationStatus
} from "../controllers/integrationController.js";

import { authenticateToken, requireRole } from "../middleware/auth.js";

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Change "owner" to "client" since that's what business owners have in your system
router.post("/setup", requireRole(["client"]), setupIntegration);
router.post("/fetch-reviews", requireRole(["client"]), fetchExternalReviews);
router.get("/business/:businessId", requireRole(["client"]), getBusinessIntegrations);
router.delete("/remove/:integrationId", requireRole(["client"]), removeIntegration);
router.patch("/update-status/:integrationId", requireRole(["client"]), updateIntegrationStatus);

export default router;