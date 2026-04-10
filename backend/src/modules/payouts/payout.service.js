import axios from "axios";
import { razorpayInstance } from "../../config/razorpay.js";

// RazorpayX endpoints for payouts
const RAZORPAY_X_BASE_URL = "https://api.razorpay.com/v1";

const getAuthHeader = () => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const encoded = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  return { Authorization: `Basic ${encoded}`, "Content-Type": "application/json" };
};

/**
 * Creates a Contact in RazorpayX
 */
export const createContact = async (driver) => {
  try {
    const response = await axios.post(
      `${RAZORPAY_X_BASE_URL}/contacts`,
      {
        name: driver.fullName,
        contact: driver.phone,
        type: "vendor",
        reference_id: driver.userId.toString(),
      },
      { headers: getAuthHeader() }
    );
    return response.data.id; // contact_id
  } catch (error) {
    console.error("[Payout] Create Contact error:", error.response?.data || error.message);
    throw error;
  }
};

/**
 * Creates a Fund Account linked to Contact
 */
export const createFundAccount = async (contactId, name, accountNumber, ifsc) => {
  try {
    const response = await axios.post(
      `${RAZORPAY_X_BASE_URL}/fund_accounts`,
      {
        contact_id: contactId,
        account_type: "bank_account",
        bank_account: {
          name,
          account_number: accountNumber,
          ifsc,
        },
      },
      { headers: getAuthHeader() }
    );
    return response.data.id; // fund_account_id
  } catch (error) {
    console.error("[Payout] Create Fund Account error:", error.response?.data || error.message);
    throw error;
  }
};

/**
 * Triggers actual Payout
 */
export const triggerPayout = async (fundAccountId, amountInRupees, payoutRecordId) => {
  try {
    const response = await axios.post(
      `${RAZORPAY_X_BASE_URL}/payouts`,
      {
        account_number: process.env.RAZORPAYX_ACCOUNT_NUMBER || "7878780080316316", // Business account number from which money is deducted
        fund_account_id: fundAccountId,
        amount: amountInRupees * 100, // stored in paise
        currency: "INR",
        mode: "IMPS",
        purpose: "payout",
        reference_id: payoutRecordId.toString(),
        queue_if_low_balance: true
      },
      { headers: getAuthHeader() }
    );
    return response.data; // Includes id and status
  } catch (error) {
    console.error("[Payout] Trigger Payout error:", error.response?.data || error.message);
    throw error;
  }
};
