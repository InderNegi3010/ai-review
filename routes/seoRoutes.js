import express from "express";
import { authenticateToken } from "../middleware/auth.js";
import {
  getSEORankings,
  analyzeSEO,
  getTopBusinesses,
} from "../controllers/seoController.js";

const seoRouter = express.Router();

// Get SEO rankings for business
seoRouter.get("/rank/:businessId", authenticateToken, getSEORankings);

// Analyze SEO and get suggestions
seoRouter.post("/analyze", authenticateToken, analyzeSEO);

// Get top businesses by region/category
seoRouter.get("/top/:region/:category", getTopBusinesses);

export { seoRouter };
