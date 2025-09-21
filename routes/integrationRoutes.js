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

// --------------------
// Protected routes (require authentication)
// --------------------
router.use(authenticateToken); // All routes require a valid Firebase token

// Setup a new integration or update existing
router.post("/setup", requireRole(["owner"]), setupIntegration);

// Fetch reviews from external platforms
router.post("/fetch-reviews", requireRole(["owner"]), fetchExternalReviews);

// Get all integrations for a business
router.get("/business/:businessId", requireRole(["owner"]), getBusinessIntegrations);

// Remove an integration
router.delete("/remove/:integrationId", requireRole(["owner"]), removeIntegration);

// Update integration status (active/inactive/error)
router.patch("/update-status/:integrationId", requireRole(["owner"]), updateIntegrationStatus);

export default router;
