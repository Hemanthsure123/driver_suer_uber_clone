import { mailTransporter } from "../config/mail.js";
import env from "../config/env.js";

export const sendEmail = async (to, otp) => {
  if (!to || !otp) {
    throw new Error("Missing email or OTP");
  }

  await mailTransporter.sendMail({
    from: `"Uber Clone" <${env.smtp.user}>`,
    to,
    subject: "Your OTP Code",
    text: `Your OTP is: ${otp}\n\nThis OTP will expire in 5 minutes.`,
  });
};
