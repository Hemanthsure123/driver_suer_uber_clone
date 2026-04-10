import crypto from "crypto";

/**
 * Verifies Razorpay signatures (used for frontend verification AND webhooks).
 *
 * @param {string} body - The raw request body or order_id + "|" + payment_id string
 * @param {string} signature - The signature to verify against
 * @param {string} secret - The secret key (Webhook secret or Razorpay key secret)
 * @returns {boolean} - True if signature is valid, false otherwise.
 */
export const verifyRazorpaySignature = (body, signature, secret) => {
  try {
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(body.toString())
      .digest("hex");

    return expectedSignature === signature;
  } catch (error) {
    console.error("Signature verification failed:", error.message);
    return false;
  }
};
