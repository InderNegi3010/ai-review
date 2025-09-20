// routes/authRoutes.js
import express from "express";
import { authenticateToken, rateLimit } from "../middleware/auth.js";
import {
  signup,
  signupWithCredentials,
  login,
  logout,
  getProfile,
  updateProfile,
  forgotPassword,
  resetPassword,
  verifyEmail,
} from "../controllers/authController.js";

const router = express.Router();

const authRateLimit = rateLimit(20, 15 * 60 * 1000); // 20 requests per 15 minutes

// Authentication Routes
router.post("/signup", authRateLimit, signup);
router.post("/signup-credentials", authRateLimit, signupWithCredentials);
router.post("/login", authRateLimit, login);
router.post("/logout", authenticateToken, logout);

// Password Management
router.post("/forgot-password", authRateLimit, forgotPassword);
router.post("/reset-password", authRateLimit, resetPassword);
router.post("/verify-email", verifyEmail);

// Profile Management
router.get("/profile", authenticateToken, getProfile);
router.put("/profile", authenticateToken, updateProfile);

// Health check endpoint
router.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    version: process.env.API_VERSION || "1.0.0",
  });
});

export default router;
