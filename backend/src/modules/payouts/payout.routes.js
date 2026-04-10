import express from "express";
import { requestWithdrawal } from "./payout.controller.js";
import { authMiddleware } from "../auth/auth.middleware.js";
import rateLimit from "express-rate-limit";

const router = express.Router();

// Strict Rate limiter for withdrawal to prevent spam/concurrent bypass attempts
const withdrawalLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 3, // limit each IP/User to 3 withdrawal requests per 5 minutes
  message: { error: "Too many withdrawal requests. Please try again later." }
});

router.post("/withdraw", authMiddleware, withdrawalLimiter, requestWithdrawal);

export default router;
