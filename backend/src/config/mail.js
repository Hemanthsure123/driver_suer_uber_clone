import nodemailer from "nodemailer";
import env from "./env.js";

export const mailTransporter = nodemailer.createTransport({
  host: env.smtp.host,
  port: env.smtp.port,
  secure: env.smtp.port === 465,   // true only for 465 (SSL), false for 587 (STARTTLS)
  requireTLS: env.smtp.port === 587, // Force STARTTLS upgrade on port 587 (Gmail requirement)
  auth: {
    user: env.smtp.user,
    pass: env.smtp.pass
  },
  tls: {
    rejectUnauthorized: false
  },
  connectionTimeout: 10000, // 10s — prevent silent hang
  greetingTimeout: 10000
});
