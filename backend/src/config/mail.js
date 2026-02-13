import nodemailer from "nodemailer";
import env from "./env.js";

export const mailTransporter = nodemailer.createTransport({
  host: env.smtp.host,
  port: env.smtp.port,
  secure: true, // SSL
  auth: {
    user: env.smtp.user,
    pass: env.smtp.pass
  }
});
