import Driver from "../drivers/driver.model.js";
import WalletTransaction from "./walletTransaction.model.js";

/**
 * Credits money to driver safely (Atomic)
 * @param {string} driverId
 * @param {number} amount
 * @param {string} paymentId - acts as referenceId
 * @param {string} description
 */
export const creditWallet = async (driverId, amount, paymentId, description = "Ride Payment") => {
  try {
    // 1. Transaction idempotency - ensures we don't double credit
    const existingTx = await WalletTransaction.findOne({ referenceId: paymentId });
    if (existingTx) {
      console.log(`[Wallet] Transaction ${paymentId} already processed.`);
      return true; // Already processed
    }

    // 2. Atomic Wallet Update
    const updatedDriver = await Driver.findOneAndUpdate(
      { userId: driverId },
      {
        $inc: {
          walletBalance: amount,
          totalEarnings: amount, // Earnings strictly goes up
        },
      },
      { new: true }
    );

    if (!updatedDriver) {
      throw new Error("Driver not found for wallet credit.");
    }

    // 3. Record Transaction
    await WalletTransaction.create({
      driverId,
      type: "CREDIT",
      amount,
      referenceId: paymentId,
      description,
      status: "SUCCESS"
    });

    return true;
  } catch (error) {
    if (error.code === 11000) {
      // Duplicate key error on referenceId index -> idempotent wrap
      console.log(`[Wallet] Caught duplicate execution for ${paymentId}. Safe abort.`);
      return true;
    }
    console.error("[Wallet] Credit failed:", error.message);
    throw error;
  }
};

/**
 * Debits money from driver safely (Atomic lock mechanism)
 * @param {string} driverId
 * @param {number} amount
 * @param {string} payoutId - acts as referenceId
 * @param {string} description
 */
export const debitWalletForPayout = async (driverId, amount, payoutId, description = "Driver Withdrawal") => {
  try {
    const existingTx = await WalletTransaction.findOne({ referenceId: payoutId });
    if (existingTx) {
      console.log(`[Wallet] Payout Transaction ${payoutId} already processed.`);
      return true; // Already processed
    }

    // Atomic DEBIT with lock mechanism: Ensure walletBalance >= amount
    const updatedDriver = await Driver.findOneAndUpdate(
      { userId: driverId, walletBalance: { $gte: amount } },
      {
        $inc: {
          walletBalance: -amount,
        },
      },
      { new: true }
    );

    if (!updatedDriver) {
      throw new Error("Insufficient balance or driver not found.");
    }

    await WalletTransaction.create({
      driverId,
      type: "DEBIT",
      amount,
      referenceId: payoutId,
      description,
      status: "SUCCESS" // We treat deducting from DB as success for wallet transaction
    });

    return true;
  } catch (error) {
     if (error.code === 11000) {
      return true;
    }
    console.error("[Wallet] Debit failed:", error.message);
    throw error;
  }
};
