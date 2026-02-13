// src/config/env.js
import dotenv from "dotenv";

dotenv.config();

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: process.env.PORT || 5000,

  mongoUri: process.env.MONGO_URI,

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || "30m"
  },

  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  },

  admin: {
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD
  }
};

// 🔴 HARD FAIL if critical env vars are missing
if (!env.mongoUri) throw new Error("MONGO_URI missing");
if (!env.jwt.secret) throw new Error("JWT_SECRET missing");
if (!env.smtp.user || !env.smtp.pass) throw new Error("SMTP credentials missing");

export default env;
