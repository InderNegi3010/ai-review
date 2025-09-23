import express from "express";
import { authenticateToken, requireRole } from "../middleware/auth.js";
import {
  sendEmailInvitation,
  sendSmsInvitation,
  sendBulkInvitations,
  getInvitationHistory,
  trackInvitation,
  sendReminder
} from "../controllers/invitationController.js";

const invitationRouter = express.Router();

// Send email invitation
invitationRouter.post("/email", authenticateToken, requireRole(["client", "business_owner"]), sendEmailInvitation);

// Send SMS invitation  
invitationRouter.post("/sms", authenticateToken, requireRole(["client", "business_owner"]), sendSmsInvitation);

// Send bulk invitations
invitationRouter.post("/bulk", authenticateToken, requireRole(["client", "business_owner"]), sendBulkInvitations);

// Get invitation history for a business
invitationRouter.get("/history/:businessId", authenticateToken, requireRole(["client", "business_owner"]), getInvitationHistory);

// Track invitation interaction (public endpoint for tracking)
invitationRouter.post("/track", trackInvitation);

// Send reminder
invitationRouter.post("/reminder/:invitationId", authenticateToken, requireRole(["client", "business_owner"]), sendReminder);

export { invitationRouter };
