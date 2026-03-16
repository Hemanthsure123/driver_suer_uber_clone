import nodemailer from "nodemailer";
import env from "./env.js";

export const mailTransporter = nodemailer.createTransport({
  host: env.smtp.host,
  port: env.smtp.port,
  secure: env.smtp.port === 465, // true for 465, false for 587
  auth: {
    user: env.smtp.user,
    pass: env.smtp.pass
  },
  tls: {
    rejectUnauthorized: false // Bypass self-signed certificate errors (common in corporate proxies/local dev)
  }
});
