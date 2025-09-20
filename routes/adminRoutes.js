import express from "express";
import { authenticateToken, requireRole } from "../middleware/auth.js";
import {
  getAllUsers,
  updateUser,
  getAllReviews,
  getAllPayments,
  getAllBusinesses,
} from "../controllers/adminController.js";

const router = express.Router();

router.get("/users", authenticateToken, requireRole(["admin"]), getAllUsers);
router.put("/users/:id", authenticateToken, requireRole(["admin"]), updateUser);
router.get("/reviews", authenticateToken, requireRole(["admin"]), getAllReviews);
router.get("/payments", authenticateToken, requireRole(["admin"]), getAllPayments);
router.get("/businesses", authenticateToken, requireRole(["admin"]), getAllBusinesses);

export default router;
