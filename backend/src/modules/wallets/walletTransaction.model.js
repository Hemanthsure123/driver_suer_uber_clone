import mongoose from "mongoose";

const walletTransactionSchema = new mongoose.Schema(
  {
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // Can be Driver based on implementation
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["CREDIT", "DEBIT"],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    referenceId: {
      // This is payment_id (for rides) or payout_id (for withdrawals)
      type: String,
      required: true,
      unique: true, // Idempotency check: Cannot process the same payment/payout twice
    },
    description: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["SUCCESS", "PENDING", "FAILED"],
      default: "SUCCESS",
    },
  },
  { timestamps: true }
);

export default mongoose.model("WalletTransaction", walletTransactionSchema);
