import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    // 📧 AUTH IDENTITY
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },

    // 🔐 PASSWORD
    passwordHash: {
      type: String,
      required: true
    },

    // 🧑 ROLE
    role: {
      type: String,
      enum: ["USER", "DRIVER", "ADMIN"],
      required: true
    },

    // ✅ EMAIL VERIFICATION
    emailVerified: {
      type: Boolean,
      default: false
    },

    // 📱 BASIC USER PROFILE (ONLY FOR USER ROLE)
    profile: {
      name: {
        type: String,
        trim: true
      },
      mobile: {
        type: String
      },
      gender: {
        type: String,
        enum: ["MALE", "FEMALE", "OTHERS"]
      }
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model("User", userSchema);
