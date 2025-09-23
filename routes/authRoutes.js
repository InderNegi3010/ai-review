// routes/authRoutes.js
import express from "express";
import { authenticateToken, applyRateLimit } from "../middleware/auth.js";
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
  refreshToken,
  verifyOTP,
} from "../controllers/authController.js";

const router = express.Router();

// Strict rate limiting for sensitive authentication endpoints
const authRateLimit = applyRateLimit(20, 15 * 60 * 1000); 
const strictAuthRateLimit = applyRateLimit(5, 15 * 60 * 1000);
const generalRateLimit = applyRateLimit(100, 15 * 60 * 1000);

// Public routes
router.post("/signup", strictAuthRateLimit, signup);
router.post("/signup-credentials", strictAuthRateLimit, signupWithCredentials);
router.post("/login", strictAuthRateLimit, login);

router.post("/forgot-password", strictAuthRateLimit, forgotPassword);
router.post("/reset-password", strictAuthRateLimit, resetPassword);

router.post("/verify-email", authRateLimit, verifyEmail);
router.post("/verify-otp", authRateLimit, verifyOTP);

router.post("/refresh", authRateLimit, refreshToken);

// Protected routes
router.get("/profile", generalRateLimit, authenticateToken, getProfile);
router.put("/profile", authRateLimit, authenticateToken, updateProfile);
router.post("/logout", generalRateLimit, authenticateToken, logout);

export default router;
