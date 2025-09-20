import express from "express";
import { authenticateToken } from "../middleware/auth.js";
import {
  getSubscriptionPlans,
  subscribe,
  getCurrentSubscription,
  cancelSubscription,
} from "../controllers/subscriptionController.js";

const subscriptionRouter = express.Router();

// Get all subscription plans (public)
subscriptionRouter.get("/plans", getSubscriptionPlans);

// Get current user subscription
subscriptionRouter.get("/current", authenticateToken, getCurrentSubscription);

// Subscribe to a plan
subscriptionRouter.post("/subscribe", authenticateToken, subscribe);

// Cancel subscription
subscriptionRouter.delete("/cancel/:id", authenticateToken, cancelSubscription);

export { subscriptionRouter };
