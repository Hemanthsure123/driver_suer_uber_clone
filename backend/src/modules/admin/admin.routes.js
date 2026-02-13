import express from "express";
import {
  getAllDrivers,
  getPendingDrivers,
  approveDriver,
  rejectDriver
} from "./admin.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { authorize } from "../../middlewares/role.middleware.js";

const router = express.Router();

// Middleware mainly for Admin
router.use(authenticate, authorize("ADMIN"));

/**
 * ============================
 * ADMIN DRIVER MANAGEMENT
 * ============================
 */

// Get all drivers
router.get("/drivers", getAllDrivers);

// Get pending drivers
router.get("/drivers/pending", getPendingDrivers);

// Approve driver
router.patch("/driver/:id/approve", approveDriver);

// Reject driver
router.patch("/driver/:id/reject", rejectDriver);

export default router;
