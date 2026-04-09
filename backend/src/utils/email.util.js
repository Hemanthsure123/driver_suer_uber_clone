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

export const sendPasswordResetEmail = async (to, resetLink) => {
  if (!to || !resetLink) {
    throw new Error("Missing email or reset link");
  }

  const info = await mailTransporter.sendMail({
    from: `"Uber Clone" <${env.smtp.user}>`,
    to,
    subject: "Reset Your Password - Action Required",
    text: `You requested a password reset. Click the link to reset your password: ${resetLink}\n\nThis link will expire in 15 minutes.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
        <div style="text-align: center; margin-bottom: 24px;">
           <span style="font-size: 40px;">🔐</span>
        </div>
        <h2 style="color: #111827; margin-bottom: 15px; text-align: center;">Reset Your Password</h2>
        <p style="color: #4b5563; margin-bottom: 24px; text-align: center; line-height: 1.5;">We received a request to access your Uber Clone account. Click the button below to set up a new password.</p>
        <div style="text-align: center; margin-bottom: 24px;">
          <a href="${resetLink}" style="background-color: #000; color: #fff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Reset Password</a>
        </div>
        <p style="color: #6b7280; font-size: 13px; text-align: center; margin-bottom: 10px;">Alternatively, copy and paste this link into your browser:</p>
        <p style="color: #3b82f6; font-size: 11px; text-align: center; word-break: break-all; margin-bottom: 24px; background: #f9fafb; padding: 10px; border-radius: 4px;">${resetLink}</p>
        <div style="border-top: 1px solid #e5e7eb; padding-top: 15px; text-align: center;">
          <p style="color: #9ca3af; font-size: 12px;">⏱ This link expires in <strong>15 minutes</strong> for your security.</p>
          <p style="color: #9ca3af; font-size: 12px;">If you didn't request a password reset, please ignore this email.</p>
        </div>
      </div>
    `
  });

  console.log(`[SMTP] Password Reset email sent to ${to} — MessageId: ${info.messageId}`);
  return info;
};
