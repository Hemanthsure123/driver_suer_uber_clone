import Payout from "./payout.model.js";
import { triggerPayout } from "./payout.service.js";

// Max retries: 
// 0 -> 1st retry (5m)
// 1 -> 2nd retry (30m)
// 2 -> 3rd retry (2h)
const RETRY_INTERVALS_MS = [
  5 * 60 * 1000,       // 5 minutes
  30 * 60 * 1000,      // 30 minutes
  2 * 60 * 60 * 1000   // 2 hours
];

export const processPayoutRetries = async () => {
  try {
    const now = new Date();
    
    // Find payouts that need retrying
    const pendingRetries = await Payout.find({
      status: "retry_pending",
      nextRetryAt: { $lte: now }
    });

    for (const payout of pendingRetries) {
      try {
        console.log(`[RetryWorker] Attempting retry ${payout.retryCount + 1} for Payout ${payout._id}`);
        
        // Use existing fund account
        if (!payout.razorpay_fund_account_id) {
          throw new Error("Missing fund account ID. Cannot retry payout directly.");
        }

        const result = await triggerPayout(payout.razorpay_fund_account_id, payout.amount, payout._id);
        
        // Success
        payout.status = "processing"; // Razorpay handles actual success webhook/polling later, or processing is ok
        payout.razorpay_payout_id = result.id;
        payout.nextRetryAt = null;
        await payout.save();
        console.log(`[RetryWorker] Retry Success for ${payout._id} -> ${result.id}`);

      } catch (error) {
        console.error(`[RetryWorker] Retry ${payout.retryCount + 1} Failed for ${payout._id}:`, error.message);
        
        payout.retryCount += 1;
        
        if (payout.retryCount >= RETRY_INTERVALS_MS.length) {
          // Exhausted all retries
          payout.status = "manual_review";
          payout.failureReason = "Exhausted all retries. Manual Admin review required.";
          payout.nextRetryAt = null;
        } else {
          // Schedule next retry
          payout.nextRetryAt = new Date(Date.now() + RETRY_INTERVALS_MS[payout.retryCount]);
        }
        await payout.save();
      }
    }
  } catch (err) {
    console.error("[RetryWorker] Global interval error:", err.message);
  }
};

/**
 * Initializes the retry cron/interval
 */
export const initRetryWorker = () => {
  // Check every 1 minute
  setInterval(processPayoutRetries, 60 * 1000);
  console.log("[RetryWorker] Initialized and polling every 60s");
};
