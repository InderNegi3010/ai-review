import express from "express";
import { authenticateToken } from "../middleware/auth.js";
import { getWalletBalance, addFunds } from "../controllers/walletController.js";

const router = express.Router();

// Get Wallet Balance
router.get("/balance", authenticateToken, getWalletBalance);

// Add Funds (Mock implementation)
router.post("/add-funds", authenticateToken, addFunds);

export default router;
