// routes/adminRoutes.js
import express from "express";
import { authenticateToken, requireRole } from "../middleware/auth.js";
import {
  getAllUsers,
  updateUser,
  deleteUser,
  getAllReviews,
  getAllPayments,
  getAllBusinesses,
  updateSettings,
  getSettings,
} from "../controllers/adminController.js";

const router = express.Router();

// All admin routes require authentication and admin role
router.use(authenticateToken);
router.use(requireRole(["admin"]));

// User Management
router.get("/users", getAllUsers);
router.put("/users/:id", updateUser);
router.delete("/users/:id", deleteUser);

// Review Management
router.get("/reviews", getAllReviews);

// Payment Management
router.get("/payments", getAllPayments);

// Business Management
router.get("/businesses", getAllBusinesses);

// Platform Settings
router.get("/settings", getSettings);
router.put("/settings", updateSettings);

export default router;