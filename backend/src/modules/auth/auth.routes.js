import express from "express";
import { signup, verifyOtp, login, getMe } from "./auth.controller.js";

const router = express.Router();

// PUBLIC ROUTES
router.post("/signup", signup);
router.post("/verify-otp", verifyOtp);
router.post("/login", login);
// PRIVATE ROUTES
import { authenticate } from "../../middlewares/auth.middleware.js";
router.get("/me", authenticate, getMe);

export default router;
