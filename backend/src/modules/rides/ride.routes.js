import express from "express";
import {
  bookRide,
  acceptRide,
  driverArrived,
  verifyOtp,
  completeRide,
  cancelRide,
  getActiveRide,
  resendOtp,
  getRideHistory
} from "./ride.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";

const router = express.Router();

// General Active State API
router.get("/active", authenticate, getActiveRide);
router.get("/history", authenticate, getRideHistory);

// User APIs
router.post("/book", authenticate, bookRide);
router.post("/:id/cancel", authenticate, cancelRide); // User or Driver can cancel
router.post("/:id/resend-otp", authenticate, resendOtp); // User specific OTP resend

// Driver APIs
router.post("/:id/accept", authenticate, acceptRide);
router.post("/:id/arrived", authenticate, driverArrived);
router.post("/:id/verify-otp", authenticate, verifyOtp);
router.post("/:id/complete", authenticate, completeRide);

export default router;
