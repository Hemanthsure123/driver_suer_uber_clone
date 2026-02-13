// src/modules/auth/otp.model.js
import mongoose from "mongoose";

const otpSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  otpHash: String,
  expiresAt: Date,
  attempts: { type: Number, default: 0 }
});

export default mongoose.model("Otp", otpSchema);
