import User from "../users/user.model.js";
import Driver from "../drivers/driver.model.js";
import Otp from "./otp.model.js";

import { sendEmail, sendPasswordResetEmail } from "../../utils/email.util.js";
import { hashPassword, comparePassword } from "../../utils/password.util.js";
import crypto from "crypto";
import ResetToken from "./resetToken.model.js";
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
      if (!existingUser.emailVerified) {
        // If the user signed up but never verified their OTP, allow them to restart the flow
        await existingUser.deleteOne();
        if (existingUser.role === "DRIVER") {
          await Driver.deleteOne({ userId: existingUser._id });
        }
      } else {
        return res.status(409).json({ error: "Email already registered" });
      }
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

      // Check driver uniqueness constraints before creating the User
      const existingDriver = await Driver.findOne({
        $or: [
          { licenseNumber: driverDetails.licenseNumber },
          { "vehicle.rcNumber": driverDetails.vehicle.rcNumber },
          { phone: driverDetails.phone }
        ]
      });

      if (existingDriver) {
        if (existingDriver.licenseNumber === driverDetails.licenseNumber) {
          return res.status(409).json({ error: "License number already registered" });
        }
        if (existingDriver.vehicle.rcNumber === driverDetails.vehicle.rcNumber) {
          return res.status(409).json({ error: "RC number already registered" });
        }
        if (existingDriver.phone === driverDetails.phone) {
          return res.status(409).json({ error: "Phone number already registered" });
        }
        return res.status(409).json({ error: "Driver details already registered" });
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

/**
 * ============================
 * GET CURRENT FETCH (ME)
 * ============================
 */
export const getMe = async (req, res) => {
  try {
    const userId = req.user.sub;
    const role = req.user.role;

    const user = await User.findById(userId).select("-passwordHash");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (role === "DRIVER") {
      const driver = await Driver.findOne({ userId });
      return res.json({ user, driver });
    }

    return res.json({ user });
  } catch (err) {
    console.error("GetMe error:", err);
    return res.status(500).json({ error: "Failed to fetch profile" });
  }
};

/**
 * ============================
 * EDIT PROFILE (ME)
 * ============================
 */
export const editProfile = async (req, res) => {
  try {
    const userId = req.user.sub;
    const role = req.user.role;
    const { name, mobile } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (role === "USER") {
      if (name) user.profile.name = name;
      if (mobile) user.profile.mobile = mobile;
      await user.save();
    } else if (role === "DRIVER") {
      const driver = await Driver.findOne({ userId });
      if (driver) {
        if (name) driver.fullName = name;
        if (mobile) driver.phone = mobile;
        await driver.save();
      }
    }

    return res.json({ message: "Profile updated successfully" });
  } catch (err) {
    console.error("Edit profile error:", err);
    return res.status(500).json({ error: "Failed to update profile" });
  }
};

/**
 * ============================
 * CHANGE PASSWORD (LOGGED IN)
 * ============================
 */
export const changePassword = async (req, res) => {
  try {
    const userId = req.user.sub;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current and new passwords required" });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({ error: "New password cannot be same as old password" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const isValid = await comparePassword(currentPassword, user.passwordHash);
    if (!isValid) return res.status(401).json({ error: "Invalid current password" });

    user.passwordHash = await hashPassword(newPassword);
    await user.save();

    return res.json({ message: "Password changed successfully" });
  } catch (err) {
    console.error("Change password error:", err);
    return res.status(500).json({ error: "Failed to change password" });
  }
};

/**
 * ============================
 * FORGOT PASSWORD (EMAIL TRIGGER)
 * ============================
 */
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    const user = await User.findOne({ email });
    if (!user) {
      // Return 200 anyway to prevent email enumeration attacks
      return res.status(200).json({ message: "If your email is registered, a reset link will be sent." });
    }

    // Generate secure randomized crypto token
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    // Clear old tokens for this user
    await ResetToken.deleteMany({ userId: user._id });

    // Store in DB (expires in 15 mins)
    await ResetToken.create({
      userId: user._id,
      tokenHash,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000)
    });

    // Send Reset Link via Email
    const resetLink = `https://beanlike-stormbound-myong.ngrok-free.dev/reset-password/${rawToken}`;
    await sendPasswordResetEmail(user.email, resetLink);

    return res.status(200).json({ message: "If your email is registered, a reset link will be sent." });
  } catch (err) {
    console.error("Forgot password error:", err);
    return res.status(500).json({ error: "Failed to process forgot password" });
  }
};

/**
 * ============================
 * RESET PASSWORD (CONSUME TOKEN)
 * ============================
 */
export const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: "Token and new password required" });
    }

    const hashedInputToken = crypto.createHash("sha256").update(token).digest("hex");

    const tokenRecord = await ResetToken.findOne({ tokenHash: hashedInputToken });
    if (!tokenRecord) {
      return res.status(400).json({ error: "Invalid or expired reset token" });
    }

    if (tokenRecord.expiresAt < Date.now()) {
      await tokenRecord.deleteOne();
      return res.status(400).json({ error: "Reset token has expired" });
    }

    const user = await User.findById(tokenRecord.userId);
    if (!user) {
      return res.status(404).json({ error: "User no longer exists" });
    }

    user.passwordHash = await hashPassword(newPassword);
    await user.save();

    // Invalidate the token immediately
    await tokenRecord.deleteOne();

    return res.json({ message: "Password reset correctly. You can now login." });
  } catch (err) {
    console.error("Reset password error:", err);
    return res.status(500).json({ error: "Failed to reset password" });
  }
};
