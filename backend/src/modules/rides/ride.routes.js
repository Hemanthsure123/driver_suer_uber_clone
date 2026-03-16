import express from "express";
import {
  bookRide,
  acceptRide,
  driverArrived,
  verifyOtp
} from "./ride.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";

const router = express.Router();

// User APIs
router.post("/book", authenticate, bookRide);

// Driver APIs
router.post("/:id/accept", authenticate, acceptRide);
router.post("/:id/arrived", authenticate, driverArrived);
router.post("/:id/verify-otp", authenticate, verifyOtp);

export default router;
