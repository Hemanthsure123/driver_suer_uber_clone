import Payment from "./payment.model.js";
import Ride from "../rides/ride.model.js";
import { razorpayInstance } from "../../config/razorpay.js";
import { verifyRazorpaySignature } from "../../utils/paymentHandler.js";
import { creditWallet } from "../wallets/wallet.service.js";

const COMMISSION_PERCENT = parseInt(process.env.COMMISSION_PERCENT || "2", 10);

export const createOrder = async (req, res) => {
  try {
    const { rideId, amount } = req.body;
    const userId = req.user.sub || req.user.id; // From auth middleware

    const ride = await Ride.findById(rideId);
    if (!ride) return res.status(404).json({ error: "Ride not found" });
    if (!ride.driverId) return res.status(400).json({ error: "Driver not assigned yet" });

    // Create Order with Razorpay
    const options = {
      amount: amount * 100, // Razorpay takes amounts in paise
      currency: "INR",
      receipt: `receipt_ride_${rideId}`,
    };

    const order = await razorpayInstance.orders.create(options);

    // Save initial state to DB
    await Payment.create({
      rideId,
      userId,
      driverId: ride.driverId,
      amount,
      razorpay_order_id: order.id,
      status: "created"
    });

    res.status(200).json({
      success: true,
      order_id: order.id,
      amount: amount * 100
    });
  } catch (error) {
    console.error("[Payment] Create Order Error:", error);
    res.status(500).json({ error: "Failed to create payment order" });
  }
};

export const verifyPaymentFrontend = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const isValid = verifyRazorpaySignature(body, razorpay_signature, process.env.RAZORPAY_KEY_SECRET);

    if (!isValid) {
      return res.status(400).json({ error: "Invalid payment signature" });
    }

    // For robust offline manual testing without proper webhook ngrok tunnels,
    // we eagerly credit the driver wallet right here. Webhooks will idempotent skip this later.
    const paymentRecord = await Payment.findOneAndUpdate(
      { razorpay_order_id },
      {
        razorpay_payment_id,
        status: "captured"
      },
      { new: true }
    );

    if (paymentRecord) {
        const amountInRupees = paymentRecord.amount;
        const commissionAmount = (amountInRupees * COMMISSION_PERCENT) / 100;
        const driverCredit = amountInRupees - commissionAmount;
        await creditWallet(paymentRecord.driverId, driverCredit, razorpay_payment_id, `Ride Payment - ${razorpay_order_id}`);
    }

    res.status(200).json({ success: true, message: "Payment verified. Wallet successfully updated." });
  } catch (error) {
    console.error("[Payment] Verification Error:", error);
    res.status(500).json({ error: "Failed to verify frontend payment" });
  }
};

export const razorpayWebhook = async (req, res) => {
  try {
    const webhookSecret = process.env.WEBHOOK_SECRET;
    const signature = req.headers["x-razorpay-signature"];

    // Verify webhook signature
    // Razorpay requires the RAW body string. Normally express.raw() maps this or req.body works if body-parser ensures raw buffers are available.
    // For json middleware, using JSON.stringify() is fragile but can work if fields are ordered correctly. 
    // We assume server.js parses webhook route as raw string (req.rawBody).
    const rawBody = req.rawBody || JSON.stringify(req.body);
    
    const isValid = verifyRazorpaySignature(rawBody, signature, webhookSecret);
    if (!isValid) {
      return res.status(401).send("Invalid webhook signature");
    }

    const { event, payload } = req.body;
    const paymentEntity = payload.payment.entity;
    
    // We map back from paise to rupees
    const amountInRupees = paymentEntity.amount / 100;
    const paymentId = paymentEntity.id;
    const orderId = paymentEntity.order_id;

    const paymentRecord = await Payment.findOne({ razorpay_order_id: orderId });
    if (!paymentRecord) {
      return res.status(404).json({ error: "Payment record not found" });
    }

    switch (event) {
      case "payment.captured": {
        // Prevent duplicate process
        if (paymentRecord.status === "captured") {
          return res.status(200).send("Already processed");
        }

        // Calculate payout minus commission
        const commissionAmount = (amountInRupees * COMMISSION_PERCENT) / 100;
        const driverCredit = amountInRupees - commissionAmount;

        // Credit Wallet Safely
        await creditWallet(paymentRecord.driverId, driverCredit, paymentId, `Ride Payment - ${orderId}`);

        // Update Payment Record
        paymentRecord.status = "captured";
        paymentRecord.razorpay_payment_id = paymentId;
        await paymentRecord.save();
        break;
      }
      case "payment.failed": {
        paymentRecord.status = "failed";
        paymentRecord.errorMessage = payload.payment.entity.error_description;
        await paymentRecord.save();
        // Here we might want to alter the ride status back to UNPAID or similar.
        break;
      }
    }

    res.status(200).json({ status: "ok" });
  } catch (error) {
    console.error("[Payment] Webhook Error:", error);
    res.status(500).send("Internal Server Error");
  }
};

export const payWithCash = async (req, res) => {
  try {
    const { rideId, amount } = req.body;
    const userId = req.user.sub || req.user.id;

    const ride = await Ride.findById(rideId);
    if (!ride) return res.status(404).json({ error: "Ride not found" });

    // Mark as cash payment in DB
    await Payment.create({
      rideId,
      userId,
      driverId: ride.driverId,
      amount,
      razorpay_order_id: `cash_${rideId}_${Date.now()}`,
      status: "captured"
    });

    res.status(200).json({ success: true, message: "Cash payment recorded successfully." });
  } catch (error) {
    console.error("[Payment] Cash Payment Error:", error);
    res.status(500).json({ error: "Failed to record cash payment" });
  }
};
