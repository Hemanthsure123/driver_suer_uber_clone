import express from "express";
import { createOrder, verifyPaymentFrontend, razorpayWebhook } from "./payment.controller.js";
import { authenticate as authMiddleware } from "../../middlewares/auth.middleware.js";

const router = express.Router();

// Order creation - requires user auth
router.post("/create-order", authMiddleware, createOrder);

// Frontend Verification - requires auth, but only marks as pending
router.post("/verify", authMiddleware, verifyPaymentFrontend);

// Webhook Handler - NO AUTHENTICATION middleware, because Razorpay servers trigger this, not user app.
// It relies completely on the HMAC SHA256 Signature verification.
router.post("/webhook", razorpayWebhook);

export default router;
