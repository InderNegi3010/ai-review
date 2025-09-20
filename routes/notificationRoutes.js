import express from "express";
import { authenticateToken, requireRole } from "../middleware/auth.js";
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  sendNotification,
} from "../controllers/notificationController.js";

const notificationRouter = express.Router();

// Get user notifications
notificationRouter.get("/", authenticateToken, getNotifications);

// Mark notification as read
notificationRouter.patch("/read/:id", authenticateToken, markAsRead);

// Mark all notifications as read
notificationRouter.patch("/read-all", authenticateToken, markAllAsRead);

// Delete notification
notificationRouter.delete("/:id", authenticateToken, deleteNotification);

// Send notification (admin only)
notificationRouter.post(
  "/send",
  authenticateToken,
  requireRole(["admin"]),
  sendNotification
);

export { notificationRouter };
