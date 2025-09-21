// routes/aiChatRoutes.js
import express from "express";
import {
  startConversation,
  sendMessage,
  getConversationHistory,
  getUserConversations,
  generateReviewSuggestions,
  closeConversation
} from "../controllers/aiChatController.js";

import { authenticateToken, requireRole } from "../middleware/auth.js";

const router = express.Router();

// --------------------
// Protected routes (require authentication)
// --------------------
router.use(authenticateToken); // all routes below require a valid Firebase token

// Start a new AI conversation
router.post("/start", startConversation);

// Send a message to AI in a conversation
router.post("/send", sendMessage);

// Get conversation history by conversation ID
router.get("/history/:conversationId", getConversationHistory);

// Get all conversations of the authenticated user (optional businessId filter)
router.get("/conversations", getUserConversations);

// Generate AI review suggestions for a business (only owners can generate)
router.post("/generate-suggestions", requireRole(["owner"]), generateReviewSuggestions);

// Close a conversation
router.post("/close/:conversationId", closeConversation);

export default router;
