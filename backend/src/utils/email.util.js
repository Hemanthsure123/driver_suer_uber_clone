import { mailTransporter } from "../config/mail.js";
import env from "../config/env.js";

// Verify SMTP connection on startup — surface credential issues early
mailTransporter.verify((err) => {
  if (err) {
    console.error("❌ [SMTP] Transporter verification failed:", err.message);
    console.error("   → Check SMTP_USER / SMTP_PASS in .env (Gmail needs an App Password, not your account password)");
  } else {
    console.log("✅ [SMTP] Mail transporter ready — Gmail SMTP connected");
  }
});

export const sendEmail = async (to, otp) => {
  if (!to || !otp) {
    throw new Error("Missing email or OTP");
  }

  const info = await mailTransporter.sendMail({
    from: `"Uber Clone" <${env.smtp.user}>`,
    to,
    subject: "Your Ride OTP Code",
    text: `Your ride OTP is: ${otp}\n\nThis OTP will expire in 15 minutes. Do not share it with anyone.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 8px;">
        <h2 style="color: #111827; margin-bottom: 8px;">🚗 Your Ride OTP</h2>
        <p style="color: #6b7280; margin-bottom: 24px;">Share this code with your driver to start the trip.</p>
        <div style="background: #f3f4f6; border-radius: 8px; padding: 24px; text-align: center; letter-spacing: 8px; font-size: 36px; font-weight: bold; color: #111827;">
          ${otp}
        </div>
        <p style="color: #6b7280; margin-top: 24px; font-size: 13px;">⏱ This OTP expires in <strong>15 minutes</strong>. Do not share it with anyone other than your driver.</p>
      </div>
    `
  });

  console.log(`[SMTP] OTP email sent to ${to} — MessageId: ${info.messageId}`);
  return info;
};
