import mongoose from "mongoose";

const payoutSchema = new mongoose.Schema(
  {
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // Can be Driver based on implementation references
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: "INR",
    },
    razorpay_contact_id: {
      type: String,
      default: null,
    },
    razorpay_fund_account_id: {
      type: String,
      default: null,
    },
    razorpay_payout_id: {
      type: String,
      default: null,
      sparse: true,
      unique: true,
    },
    status: {
      type: String,
      enum: ["processing", "success", "retry_pending", "manual_review", "failed"],
      default: "processing",
    },
    retryCount: {
      type: Number,
      default: 0,
    },
    nextRetryAt: {
      type: Date,
      default: null,
    },
    failureReason: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Payout", payoutSchema);
