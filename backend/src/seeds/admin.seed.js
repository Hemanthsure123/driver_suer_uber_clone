import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../modules/users/user.model.js";
import { hashPassword } from "../utils/password.util.js";

dotenv.config();

const seedAdmin = async () => {
  try {
    console.log("Connecting to DB:", process.env.MONGO_URI);

    await mongoose.connect(process.env.MONGO_URI);

    const email = process.env.ADMIN_EMAIL || "admin@uberclone.com";
    const password = process.env.ADMIN_PASSWORD || "Admin@123";

    const existing = await User.findOne({ email });
    if (existing) {
      console.log("Admin already exists");
      process.exit(0);
    }

    const passwordHash = await hashPassword(password);

    await User.create({
      email,
      passwordHash,
      role: "ADMIN",
      emailVerified: true
    });

    console.log("✅ Admin created successfully");
    process.exit(0);

  } catch (err) {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  }
};

seedAdmin();
