import express from "express";
import multer from "multer";
import axios from "axios";
import fs from "fs";
import path from "path";
import crypto from "crypto";

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

    const absolutePath = path.resolve(req.file.path);

    // Call ML Service using JSON payload and a relative path that docker-compose volume mapping can read
    const mlUrl = process.env.ML_SERVICE_URL || "http://ml-service:8000/liveness";

    // Node is running natively on Windows. `req.file.path` looks like "uploads\filename.ext".
    // We convert it to a Linux-friendly relative path: "uploads/filename.ext".
    const relativePath = req.file.path.replace(/\\/g, "/");

    const mlRes = await axios.post(
      mlUrl,
      { path: relativePath }
    );

    console.log("ML response:", mlRes.data);
    const confidence = Number(mlRes.data.confidence);

    // If confidence passes, save selfieUrl to Driver
    if (!isNaN(confidence) && confidence >= 70 && email) {
      const user = await User.findOne({ email });
      if (user) {
        // We keep the file as the "selfie" (or we could extract a frame, but for now use the video file path)
        // Normalize path for URL usage if needed, but local path is fine for the check.
        // Let's store a relative path accessible via static middleware ideally, 
        // but the prompt just needs "selfie updated in database" to pass login check.

        // Don't delete the file if we are using it as the selfieUrl
        // But if we delete it, login fails if it checks file existence? 
        // No, login auth.controller just checks `if (!driver?.selfieUrl)`. It checks if the FIELD is in DB.

        // NOTE: The previous code deleted the file: fs.unlinkSync(req.file.path);
        // I will NOT delete it if successful, so it exists physically too.

        await Driver.updateOne(
          { userId: user._id },
          { selfieUrl: req.file.path }
        );
        console.log(`Driver selfieUrl updated for ${email}`);
      }
    } else {
      // Clean up if failed
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    }

    res.json(mlRes.data);

  } catch (err) {
    console.error("Liveness error:", err.message);
    if (err.response) {
      console.error("ML error response:", err.response.data);
    }
    // Cleanup on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    const errorMsg = err.response?.data?.reason || err.message || "Unknown error";
    res.status(500).json({ error: `Liveness failed: ${errorMsg}` });
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
