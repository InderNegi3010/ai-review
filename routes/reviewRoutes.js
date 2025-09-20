// routes/reviewRoutes.js
import express from "express";
import { authenticateToken } from "../middleware/auth.js";
import {
  getBusinessReviews,
  getSingleReview,
  addReplyToReview,
  updateReview,
  getReviewSummary,
  submitPublicReview,
  deleteReview
} from "../controllers/reviewController.js";

const router = express.Router();

// Public endpoint - no auth required
router.post("/submit", submitPublicReview);

// Protected endpoints - require authentication
router.get("/business/:businessId", authenticateToken, getBusinessReviews);
router.get("/business/:businessId/summary", authenticateToken, getReviewSummary);
router.get("/single/:reviewId", authenticateToken, getSingleReview);
router.post("/reply", authenticateToken, addReplyToReview);
router.patch("/update/:reviewId", authenticateToken, updateReview);
router.delete("/:reviewId", authenticateToken, deleteReview);

export default router;