import express from "express";
import { 
  signup, 
  verifyOtp, 
  login, 
  getMe,
  editProfile,
  changePassword,
  forgotPassword,
  resetPassword
} from "./auth.controller.js";

const router = express.Router();

// PUBLIC ROUTES
router.post("/signup", signup);
router.post("/verify-otp", verifyOtp);
router.post("/login", login);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

// PRIVATE ROUTES
import { authenticate } from "../../middlewares/auth.middleware.js";
router.get("/me", authenticate, getMe);
router.put("/profile", authenticate, editProfile);
router.put("/password", authenticate, changePassword);

export default router;
