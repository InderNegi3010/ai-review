import express from "express";
import { authenticateToken } from "../middleware/auth.js";
import {
  registerBusiness,
  getBusinessById,
  updateBusiness,
  getMyBusinesses,
} from "../controllers/businessController.js";

const router = express.Router();

// Register Business
router.post("/register", authenticateToken, registerBusiness);

// Get Business Details
router.get("/:id", authenticateToken, getBusinessById);

// Update Business
router.put("/:id", authenticateToken, updateBusiness);

// Get User's Businesses
router.get("/", authenticateToken, getMyBusinesses);

export default router;
