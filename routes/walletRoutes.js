import express from "express";
import { authenticateToken } from "../middleware/auth.js";
import {
  getWalletBalance,
  addFunds,
} from "../controllers/walletController.js";

const walletRouter = express.Router();

// Get wallet balance
walletRouter.get("/balance", authenticateToken, getWalletBalance);

// Add funds to wallet
walletRouter.post("/add-funds", authenticateToken, addFunds);

export { walletRouter };