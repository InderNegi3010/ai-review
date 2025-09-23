import express from "express";
import { authenticateToken, requireRole } from "../middleware/auth.js";
import {
  createTemplate,
  getBusinessTemplates,
  getTemplate,
  updateTemplate,
  deleteTemplate,
  duplicateTemplate,
  previewTemplate,
  setDefaultTemplate
} from "../controllers/templateController.js";

const templateRouter = express.Router();

// Create template
templateRouter.post("/create", authenticateToken, requireRole(["client", "business_owner"]), createTemplate);

// Get business templates
templateRouter.get("/business/:businessId", authenticateToken, requireRole(["client", "business_owner"]), getBusinessTemplates);

// Get single template
templateRouter.get("/:templateId", authenticateToken, requireRole(["client", "business_owner"]), getTemplate);

// Update template
templateRouter.put("/:templateId", authenticateToken, requireRole(["client", "business_owner"]), updateTemplate);

// Delete template
templateRouter.delete("/:templateId", authenticateToken, requireRole(["client", "business_owner"]), deleteTemplate);

// Duplicate template
templateRouter.post("/:templateId/duplicate", authenticateToken, requireRole(["client", "business_owner"]), duplicateTemplate);

// Preview template
templateRouter.post("/:templateId/preview", authenticateToken, requireRole(["client", "business_owner"]), previewTemplate);

// Set default template
templateRouter.patch("/:templateId/default", authenticateToken, requireRole(["client", "business_owner"]), setDefaultTemplate);

export { templateRouter };