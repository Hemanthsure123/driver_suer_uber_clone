import Payout from "./payout.model.js";
import Driver from "../drivers/driver.model.js";
import { debitWalletForPayout } from "../wallets/wallet.service.js";
import { encrypt, decrypt } from "../../utils/crypto.js";
import { createContact, createFundAccount, triggerPayout } from "./payout.service.js";

export const requestWithdrawal = async (req, res) => {
  try {
    const { amount, accountNumber, ifsc } = req.body;
    const userId = req.user.id;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const driver = await Driver.findOne({ userId });
    if (!driver) {
      return res.status(404).json({ error: "Driver not found" });
    }

    // 1. Update/Save Bank Details if provided
    let finalAccountNumber = accountNumber;
    let finalIfsc = ifsc;

    if (accountNumber && ifsc) {
      // Save for future
      driver.bankDetails = {
        accountNumber: encrypt(accountNumber),
        ifsc: ifsc,
        isVerified: false
      };
      await driver.save();
    } else {
      // Use existing
      if (!driver.bankDetails || !driver.bankDetails.accountNumber) {
        return res.status(400).json({ error: "Bank details missing. Please provide account number and IFSC." });
      }
      finalAccountNumber = decrypt(driver.bankDetails.accountNumber);
      finalIfsc = driver.bankDetails.ifsc;
    }

    // 2. Validate Balance
    if (driver.walletBalance < amount) {
      return res.status(400).json({ error: "Insufficient wallet balance" });
    }

    // 3. Create initial pending payout record
    const payoutRecord = await Payout.create({
      driverId: userId,
      amount,
      status: "processing"
    });

    // 4. Atomic Deduct from Wallet (Lock Mechanism)
    // If this throws, it means balance was insufficient at the very millisecond of deduction
    try {
      await debitWalletForPayout(userId, amount, payoutRecord._id.toString(), "Bank Withdrawal");
    } catch (err) {
      // Mark payout failed, balance was not deducted
      payoutRecord.status = "failed";
      payoutRecord.failureReason = "Debit failed - insufficient balance";
      await payoutRecord.save();
      return res.status(400).json({ error: "Transaction failed. Insufficient funds." });
    }

    // --- FROM THIS POINT, WALLET IS DEDUCTED ---
    // Background the payout API calls so we don't block the frontend heavily,
    // though we can await contact & fund account creation to be safe.
    try {
      // Contact & Fund Account
      const contactId = await createContact(driver);
      
      const fundAccountId = await createFundAccount(
        contactId,
        driver.fullName,
        finalAccountNumber,
        finalIfsc
      );

      payoutRecord.razorpay_contact_id = contactId;
      payoutRecord.razorpay_fund_account_id = fundAccountId;
      await payoutRecord.save();

      // Trigger actual payout
      const razorpayPayout = await triggerPayout(fundAccountId, amount, payoutRecord._id);

      payoutRecord.razorpay_payout_id = razorpayPayout.id;
      // If Razorpay immediately says 'processing' or 'scheduled', that's fine.
      // If it fails immediately, catch block handles it.
      payoutRecord.status = "processing"; 
      await payoutRecord.save();

      return res.status(200).json({
        success: true,
        message: "Withdrawal request accepted and being processed.",
        payoutStatus: payoutRecord.status
      });

    } catch (payoutError) {
      console.error("[Payout] API Error during withdrawal:", payoutError);
      
      // We DO NOT revert the wallet money immediately to prevent fraud loopholes. 
      // Instead, we mark it for retry. Our Retry Worker will attempt it again.
      // If the retry worker fails completely, it will mark it for 'manual_review', 
      // where an admin can choose to refund the wallet manually.
      payoutRecord.status = "retry_pending";
      payoutRecord.failureReason = payoutError.message || "Razorpay API failure";
      // Next retry in 5 minutes
      payoutRecord.nextRetryAt = new Date(Date.now() + 5 * 60000);
      await payoutRecord.save();

      // We still return 200 to user saying request is accepted but delayed.
      return res.status(200).json({
        success: true,
        message: "Withdrawal request accepted but delayed due to bank network issues.",
        payoutStatus: "delayed"
      });
    }
  } catch (error) {
    console.error("[Payout] Request Withdrawal Internal Error:", error);
    res.status(500).json({ error: "Internal server error during withdrawal" });
  }
};
