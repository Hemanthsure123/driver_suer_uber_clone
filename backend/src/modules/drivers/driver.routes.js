import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import crypto from "crypto";

import { produceMessage } from "../../config/kafka.js";

import User from "../users/user.model.js";
import Driver from "./driver.model.js";
import Otp from "../auth/otp.model.js";
import { generateOtp, hashOtp } from "../../utils/otp.util.js";
import { sendEmail } from "../../utils/email.util.js";

const router = express.Router();
const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}${ext}`);
  }
});

const upload = multer({ storage });



// Configure static file serving for uploads if not already done in app.js, 
// but for now we'll store the relative path.

router.post("/liveness-check", upload.single("video"), async (req, res) => {
  try {
    console.log("Video received:", req.file?.path);
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Convert file path strictly for cross-platform docker compatibility
    const relativePath = req.file.path.replace(/\\/g, "/");

    // 1. Update Driver liveness status to PROCESSING
    const driver = await Driver.findOneAndUpdate(
      { userId: user._id },
      { livenessStatus: "PROCESSING" },
      { new: true }
    );
    
    if (!driver) {
       return res.status(404).json({ message: "Driver profile not found" });
    }

    // 2. Publish Task to Kafka topic
    await produceMessage("video_verification_tasks", [
      {
        _id: driver._id.toString(),
        userId: user._id.toString(),
        path: relativePath,
        email
      }
    ]);

    // 3. Immediatly return 202 Accepted status while ML service consumes the task
    res.status(202).json({
      success: true,
      status: "PROCESSING",
      message: "Video verification task submitted. Result will be updated asynchronously."
    });

  } catch (err) {
    console.error("Liveness upload error:", err.message);
    
    // Cleanup on error (cannot process)
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ error: `Liveness failed to enqueue: ${err.message}` });
  }
});


/**
 * SEND OTP
 */
router.post("/send-otp", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const otp = generateOtp();

    await Otp.deleteMany({ userId: user._id });

    await Otp.create({
      userId: user._id,
      otpHash: hashOtp(otp),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 mins
      attempts: 0
    });

    await sendEmail(email, otp);
    console.log("OTP Sent to", email, ":", otp);

    return res.json({ success: true, message: "OTP sent successfully" });

  } catch (err) {
    console.error("Send OTP Error:", err);
    return res.status(500).json({ message: "Failed to send OTP" });
  }
});

/**
 * VERIFY OTP
 */
router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const record = await Otp.findOne({ userId: user._id });
    if (!record) {
      return res.status(400).json({ message: "OTP not found or expired" });
    }

    if (record.expiresAt < Date.now()) {
      await record.deleteOne();
      return res.status(400).json({ message: "OTP expired" });
    }

    if (hashOtp(otp) !== record.otpHash) {
      record.attempts += 1;
      await record.save();

      if (record.attempts >= 3) {
        await record.deleteOne();
        return res.status(400).json({ message: "OTP attempts exceeded" });
      }
      return res.status(400).json({ message: "Invalid OTP" });
    }

    // Success!
    await record.deleteOne();
    user.emailVerified = true;
    await user.save();

    // Mark driver as PENDING (explicitly, though it might be default)
    await Driver.updateOne({ userId: user._id }, { adminStatus: "PENDING" });

    return res.json({
      success: true,
      status: "PENDING_ADMIN_APPROVAL",
      message: "Email verified. Account pending admin approval."
    });

  } catch (err) {
    console.error("Verify OTP Error:", err);
    return res.status(500).json({ message: "OTP verification failed" });
  }
});


export default router;
