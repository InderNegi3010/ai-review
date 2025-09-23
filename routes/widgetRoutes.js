import express from "express";
import { authenticateToken, requireRole } from "../middleware/auth.js";
import {
  createWidget,
  getBusinessWidgets,
  getWidget,
  updateWidget,
  displayWidget,
  deleteWidget,
  previewWidget
} from "../controllers/widgetController.js";

const widgetRouter = express.Router();

// Create widget
widgetRouter.post("/create", authenticateToken, requireRole(["client", "business_owner"]), createWidget);

// Get business widgets
widgetRouter.get("/business/:businessId", authenticateToken, requireRole(["client", "business_owner"]), getBusinessWidgets);

// Get single widget
widgetRouter.get("/:widgetId", authenticateToken, requireRole(["client", "business_owner"]), getWidget);

// Update widget
widgetRouter.put("/:widgetId", authenticateToken, requireRole(["client", "business_owner"]), updateWidget);

// Delete widget
widgetRouter.delete("/:widgetId", authenticateToken, requireRole(["client", "business_owner"]), deleteWidget);

// Preview widget
widgetRouter.post("/preview", authenticateToken, requireRole(["client", "business_owner"]), previewWidget);

// Public widget display (no auth required)
widgetRouter.get("/display/:businessId/:widgetId", displayWidget);

export { widgetRouter };
