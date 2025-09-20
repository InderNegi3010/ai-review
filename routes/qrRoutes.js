import express from "express";
import { authenticateToken } from "../middleware/auth.js";
import {
  generateQrForBusiness,
  getQrForBusiness,
} from "../controllers/qrController.js";

const router = express.Router();

// Generate QR Code
router.post("/generate/:businessId", authenticateToken, generateQrForBusiness);

// Get QR Code
router.get("/:businessId", authenticateToken, getQrForBusiness);

export default router;
