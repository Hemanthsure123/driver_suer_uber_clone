import express from "express";
import {
  bookRide,
  acceptRide,
  driverArrived,
  verifyOtp,
  completeRide,
  cancelRide
} from "./ride.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";

const router = express.Router();

// User APIs
router.post("/book", authenticate, bookRide);
router.post("/:id/cancel", authenticate, cancelRide); // User or Driver can cancel

// Driver APIs
router.post("/:id/accept", authenticate, acceptRide);
router.post("/:id/arrived", authenticate, driverArrived);
router.post("/:id/verify-otp", authenticate, verifyOtp);
router.post("/:id/complete", authenticate, completeRide);

export default router;
