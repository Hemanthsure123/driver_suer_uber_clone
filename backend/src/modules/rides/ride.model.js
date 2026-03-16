import mongoose from "mongoose";

const rideSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // Can be Driver based on population needs
      default: null
    },

    // Ride Details
    pickupLocation: {
      address: { type: String, required: true },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true
      }
    },
    dropLocation: {
      address: { type: String, required: true },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true
      }
    },

    // Metrics & Pricing
    distanceKm: {
      type: Number,
      required: true
    },
    fareAmount: {
      type: Number, // Stored naturally: rounded ₹10 per 2km
      required: true
    },

    // Lifecycle
    rideStatus: {
      type: String,
      enum: [
        "requested",
        "driver_assigned",
        "driver_arriving",
        "driver_arrived",
        "otp_verified",
        "ride_started",
        "ride_completed",
        "cancelled"
      ],
      default: "requested"
    },

    // Security (OTP Loop)
    otpCode: {
      type: String,
      default: null
    },
    otpExpiration: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Optional: Indexing for faster history lookups for users/drivers
rideSchema.index({ userId: 1, createdAt: -1 });
rideSchema.index({ driverId: 1, createdAt: -1 });

export default mongoose.model("Ride", rideSchema);
