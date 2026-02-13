import User from "../users/user.model.js";
import Driver from "../drivers/driver.model.js";
import Otp from "./otp.model.js";

import { sendEmail } from "../../utils/email.util.js";
import { hashPassword, comparePassword } from "../../utils/password.util.js";
import { generateOtp, hashOtp } from "../../utils/otp.util.js";
import { signToken } from "../../utils/jwt.util.js";
import { signOnboardingToken } from "../../utils/jwt.util.js";

/**
 * ============================
 * SIGNUP (USER / DRIVER)
 * ============================
 */
export const signup = async (req, res) => {
  try {
    const { email, password, role, userDetails, driverDetails } = req.body;

    // 1. Basic validation
    if (!email || !password || !role) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (!["USER", "DRIVER"].includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    // 2. Check duplicate email
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ error: "Email already registered" });
    }

    // 3. Hash password
    const passwordHash = await hashPassword(password);

    /**
     * ============================
     * USER SIGNUP
     * ============================
     */
    if (role === "USER") {
      if (!userDetails?.name || !userDetails?.mobile || !userDetails?.gender) {
        return res.status(400).json({ error: "User details required" });
      }

      const user = await User.create({
        email,
        passwordHash,
        role: "USER",
        emailVerified: false,
        profile: {
          name: userDetails.name,
          mobile: userDetails.mobile,
          gender: userDetails.gender
        }
      });

      // Send OTP immediately for USER
      const otp = generateOtp();

      await Otp.deleteMany({ userId: user._id });

      await Otp.create({
        userId: user._id,
        otpHash: hashOtp(otp),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        attempts: 0
      });

      await sendEmail(email, otp);

      return res.status(201).json({
        message: "User registered. OTP sent to email."
      });
    }

    /**
     * ============================
     * DRIVER SIGNUP
     * ============================
     */
    if (role === "DRIVER") {
      if (!driverDetails) {
        return res.status(400).json({ error: "Driver details required" });
      }

      const user = await User.create({
        email,
        passwordHash,
        role: "DRIVER",
        emailVerified: false
      });

      await Driver.create({
        userId: user._id,
        fullName: driverDetails.fullName,
        phone: driverDetails.phone,
        gender: driverDetails.gender,
        age: driverDetails.age,
        licenseNumber: driverDetails.licenseNumber,
        vehicle: {
          brand: driverDetails.vehicle.brand,
          model: driverDetails.vehicle.model,
          category: driverDetails.vehicle.category,
          state: driverDetails.vehicle.state,
          rcNumber: driverDetails.vehicle.rcNumber
        },
        adminStatus: "PENDING",
        selfieUrl: null
      });

      // ⚠️ NO OTP for DRIVER here
    return res.status(201).json({
      message: "Driver registered. Please upload selfie.",
      onboardingToken: signOnboardingToken(user._id)
    });
    }

  } catch (err) {
    console.error("Signup error:", err);
    return res.status(500).json({ error: "Signup failed" });
  }
};

/**
 * ============================
 * VERIFY EMAIL OTP
 * ============================
 */
export const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ error: "Email and OTP required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: "User not found" });
    }

    const record = await Otp.findOne({ userId: user._id });
    if (!record) {
      return res.status(400).json({ error: "OTP not found" });
    }

    if (record.expiresAt < Date.now()) {
      await record.deleteOne();
      return res.status(400).json({ error: "OTP expired" });
    }

    if (hashOtp(otp) !== record.otpHash) {
      record.attempts += 1;
      await record.save();

      if (record.attempts >= 3) {
        await record.deleteOne();
        return res.status(400).json({ error: "OTP attempts exceeded" });
      }

      return res.status(400).json({ error: "Invalid OTP" });
    }

    user.emailVerified = true;
    await user.save();
    await record.deleteOne();

    return res.json({ message: "Email verified successfully" });

  } catch (err) {
    console.error("Verify OTP error:", err);
    return res.status(500).json({ error: "OTP verification failed" });
  }
};

/**
 * ============================
 * LOGIN (USER / DRIVER / ADMIN)
 * ============================
 */
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (!user.emailVerified) {
      return res.status(401).json({ error: "Email not verified" });
    }

    const isValid = await comparePassword(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // 🔐 DRIVER EXTRA CHECKS
    if (user.role === "DRIVER") {
      const driver = await Driver.findOne({ userId: user._id });

      if (!driver?.selfieUrl) {
        return res.status(403).json({
          error: "Selfie not uploaded"
        });
      }

      if (driver.adminStatus !== "APPROVED") {
        return res.status(403).json({
          error: "Driver account is under admin review"
        });
      }
    }

    const token = signToken({
      sub: user._id,
      role: user.role
    });

    return res.json({
      message: "Login successful",
      token,
      role: user.role
    });


  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Login failed" });
  }
};
