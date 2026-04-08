import Ride from "./ride.model.js";
import Driver from "../drivers/driver.model.js";
import User from "../users/user.model.js";
import redisClient from "../../config/redis.js";
import { getIo } from "../../socket.js";
import { sendEmail } from "../../utils/email.util.js";
import { generateOtp } from "../../utils/otp.util.js";

/**
 * USER: Book a new ride
 * Calculates fare (₹10 per 2km), queries Redis for drivers, broadcasts ride request.
 */
export const bookRide = async (req, res) => {
    try {
        const { pickup, drop, distanceKm } = req.body;
        const userId = req.user.sub; // From verifyJwt

        if (!pickup || !drop || !distanceKm) {
            return res.status(400).json({ error: "Booking details missing" });
        }

        // Calculate Fare: ₹5 per km, rounded to nearest natural number
        const fareAmount = Math.round(distanceKm * 5);

        // 1. Create Ride Document
        const ride = await Ride.create({
            userId,
            pickupLocation: pickup,
            dropLocation: drop,
            distanceKm,
            fareAmount,
            rideStatus: "requested"
        });

        // 2. Query Redis for nearby drivers (5km radius) using ngeohash
        const [lon, lat] = pickup.coordinates;
        
        const { default: geohash } = await import('ngeohash');
        const hash = geohash.encode(lat, lon, 5);
        const gridsToScan = [hash, ...geohash.neighbors(hash)];
        
        const results = await Promise.all(
            gridsToScan.map(grid => redisClient.smembers(`grid:${grid}`))
        );
        
        let nearbyDriverIds = [];
        results.forEach(gridDrivers => nearbyDriverIds.push(...gridDrivers));
        nearbyDriverIds = [...new Set(nearbyDriverIds)];

        console.log(`[RideBooking] User requested ride at [${lon}, ${lat}]. Found ${nearbyDriverIds.length} drivers via Grids.`);

        if (nearbyDriverIds.length === 0) {
            // No drivers online nearby at all
            return res.status(200).json({
                message: "Looking for drivers...",
                rideId: ride._id,
                fareAmount,
                status: "requested"
            });
        }

        // 3. Filter drivers by availability from MongoDB (guards against race conditions)
        console.log(`[RideBooking] GEORADIUS match around [${lon}, ${lat}]: ${nearbyDriverIds}`);
        
        const availableDrivers = await Driver.find({
            userId: { $in: nearbyDriverIds },
            isAvailable: { $ne: false }
        });

        console.log(`[RideBooking] DB valid drivers left: ${availableDrivers.length}`);
        if (availableDrivers.length === 0) {
            console.log(`[RideBooking] ⚠️  All Redis drivers were filtered out. Reason: isAvailable=false (stuck from a prior accepted ride). Reset required.`);
        }

        // 4. Broadcast to those specific available drivers via Socket
        const io = getIo();
        let pingCount = 0;
        for (const driver of availableDrivers) {
            // IMPORTANT: driver.userId is a Mongoose ObjectId — must convert to string for Redis key lookup
            const driverUserIdStr = driver.userId.toString();
            const socketId = await redisClient.get(`driver_socket:${driverUserIdStr}`);
            console.log(`[RideBooking] Attempting to ping Driver ${driverUserIdStr} on socket ${socketId}`);
            if (socketId) {
                // Emit standard ride request
                io.to(socketId).emit("ride-request", {
                    rideId: ride._id,
                    pickup,
                    drop,
                    distanceKm,
                    fareAmount
                });
                pingCount++;
            } else {
                console.log(`[RideBooking] ⚠️  Driver ${driverUserIdStr} has no active socket (offline or not connected)`);
            }
        }

        console.log(`[RideBooking] Successfully emitted to ${pingCount} live sockets.`);

        return res.status(201).json({
            message: "Ride requested successfully",
            rideId: ride._id,
            fareAmount,
            status: "requested"
        });

    } catch (err) {
        console.error("Book Ride Error:", err);
        return res.status(500).json({ error: "Failed to book ride" });
    }
};

/**
 * DRIVER: Accept a Ride Request
 */
export const acceptRide = async (req, res) => {
    try {
        const rideId = req.params.id;
        const driverUserId = req.user.sub; // Assuming token sub is the user._id

        const driver = await Driver.findOne({ userId: driverUserId });
        if (!driver || !driver.isAvailable) {
            return res.status(400).json({ error: "You are not available to accept rides" });
        }

        // Atomically lock the ride so no other driver can accept it simultaneously
        const ride = await Ride.findOneAndUpdate(
            { _id: rideId, rideStatus: "requested" },
            { 
                driverId: driverUserId, 
                rideStatus: "driver_assigned" 
            },
            { new: true }
        );

        if (!ride) {
            return res.status(409).json({ error: "Ride already accepted by another driver or cancelled" });
        }

        // Mark Driver as busy
        driver.isAvailable = false;
        await driver.save();

        // Notify User via Socket
        const io = getIo();
        const userSocketId = await redisClient.get(`user_socket:${ride.userId}`);
        if (userSocketId) {
            io.to(userSocketId).emit("ride-accepted", {
                rideId: ride._id,
                driver: {
                    fullName: driver.fullName,
                    phone: driver.phone,
                    vehicle: driver.vehicle,
                    rating: 5.0 // Hardcoded for aesthetics
                }
            });
        }

        return res.json({ message: "Ride accepted successfully", ride });

    } catch (err) {
        console.error("Accept Ride Error:", err);
        return res.status(500).json({ error: "Failed to accept ride" });
    }
};

/**
 * DRIVER: Arrived at Pickup
 * Generates and Emails OTP to User
 */
export const driverArrived = async (req, res) => {
    try {
        const rideId = req.params.id;
        const driverUserId = req.user.sub;

        const ride = await Ride.findOne({ _id: rideId, driverId: driverUserId, rideStatus: "driver_assigned" });
        if (!ride) {
            return res.status(404).json({ error: "Valid ride not found for this state" });
        }

        const user = await User.findById(ride.userId);
        if (!user) {
            return res.status(404).json({ error: "Passenger not found" });
        }

        // Generate OTP
        const otp = generateOtp();
        
        // Update Ride State
        ride.rideStatus = "driver_arrived";
        ride.otpCode = otp; // Store plain/hashed depending on your security policy, plain here for simplicity context
        ride.otpExpiration = new Date(Date.now() + 15 * 60 * 1000); // 15 mins
        await ride.save();

        // Send OTP Email — do NOT swallow this error silently
        try {
            await sendEmail(user.email, otp);
            console.log(`[driverArrived] OTP email sent successfully to ${user.email}`);
        } catch (emailErr) {
            console.error(`[driverArrived] ❌ SMTP FAILED for ${user.email}:`, emailErr.message);
            // Revert ride state so driver can retry
            ride.rideStatus = "driver_assigned";
            ride.otpCode = null;
            ride.otpExpiration = null;
            await ride.save();
            return res.status(500).json({
                error: "Failed to send OTP email. Please check SMTP credentials.",
                detail: emailErr.message
            });
        }

        // Notify User Socket
        const io = getIo();
        const userSocketId = await redisClient.get(`user_socket:${ride.userId}`);
        if (userSocketId) {
            io.to(userSocketId).emit("driver-arrived", { rideId: ride._id });
        }

        return res.json({ message: "Arrived event logged. OTP sent to user." });

    } catch (err) {
        console.error("Driver Arrive Error:", err);
        return res.status(500).json({ error: "Failed to mark as arrived" });
    }
};

/**
 * DRIVER: Verify OTP to start the Trip
 */
export const verifyOtp = async (req, res) => {
    try {
        const rideId = req.params.id;
        const { otp } = req.body;
        const driverUserId = req.user.sub;

        if (!otp) {
            return res.status(400).json({ error: "OTP is required" });
        }

        const ride = await Ride.findOne({ _id: rideId, driverId: driverUserId, rideStatus: "driver_arrived" });
        if (!ride) {
            return res.status(404).json({ error: "Valid ride not found for this state" });
        }

        if (ride.otpCode !== otp) {
            return res.status(400).json({ error: "Invalid OTP" });
        }

        if (ride.otpExpiration < new Date()) {
            return res.status(400).json({ error: "OTP has expired" });
        }

        // Start Trip
        ride.rideStatus = "ride_started";
        ride.otpCode = null;
        ride.otpExpiration = null;
        await ride.save();

        // Notify User Socket
        const io = getIo();
        const userSocketId = await redisClient.get(`user_socket:${ride.userId}`);
        if (userSocketId) {
            io.to(userSocketId).emit("ride-started", { rideId: ride._id });
        }

        return res.json({ message: "OTP verified. Ride started successfully.", ride });

    } catch (err) {
        console.error("Verify Trip OTP Error:", err);
        return res.status(500).json({ error: "Failed to verify OTP" });
    }
};

/**
 * DRIVER: Complete the ride
 * Marks ride as completed and frees the driver for new bookings
 */
export const completeRide = async (req, res) => {
    try {
        const rideId = req.params.id;
        const driverUserId = req.user.sub;

        const ride = await Ride.findOne({ _id: rideId, driverId: driverUserId, rideStatus: "ride_started" });
        if (!ride) {
            return res.status(404).json({ error: "No active ride found in 'ride_started' state for this driver" });
        }

        // Mark ride as completed
        ride.rideStatus = "completed";
        await ride.save();

        // A. CRITICAL: Reset driver availability so they can receive future ride requests
        await Driver.findOneAndUpdate(
            { userId: driverUserId },
            { $set: { isAvailable: true } }
        );

        // Notify user that ride is done
        const io = getIo();
        const userSocketId = await redisClient.get(`user_socket:${ride.userId}`);
        if (userSocketId) {
            io.to(userSocketId).emit("ride-completed", { rideId: ride._id });
        }

        console.log(`[RideComplete] Driver ${driverUserId} completed ride ${rideId}. Driver is now available again.`);
        return res.json({ message: "Ride completed successfully", ride });

    } catch (err) {
        console.error("Complete Ride Error:", err);
        return res.status(500).json({ error: "Failed to complete ride" });
    }
};

/**
 * USER or DRIVER: Cancel a ride
 * B. Resets driver availability immediately so they are not permanently stuck
 */
export const cancelRide = async (req, res) => {
    try {
        const rideId = req.params.id;
        const requesterId = req.user.sub;

        // Allow cancellation in early states only
        const cancellableStatuses = ["requested", "driver_assigned", "driver_arrived"];
        const ride = await Ride.findOne({ _id: rideId, rideStatus: { $in: cancellableStatuses } });

        if (!ride) {
            return res.status(404).json({ error: "No cancellable ride found with this ID" });
        }

        // Security: Only the ride's user OR the assigned driver can cancel
        const isUser = ride.userId.toString() === requesterId;
        const isDriver = ride.driverId && ride.driverId.toString() === requesterId;
        if (!isUser && !isDriver) {
            return res.status(403).json({ error: "Not authorized to cancel this ride" });
        }

        ride.rideStatus = "cancelled";
        await ride.save();

        // B. If a driver was already assigned, free them immediately
        if (ride.driverId) {
            await Driver.findOneAndUpdate(
                { userId: ride.driverId },
                { $set: { isAvailable: true } }
            );
            console.log(`[RideCancel] Ride ${rideId} cancelled. Driver ${ride.driverId} freed (isAvailable=true).`);

            // Notify driver socket about the cancellation
            const io = getIo();
            const driverSocketId = await redisClient.get(`driver_socket:${ride.driverId.toString()}`);
            if (driverSocketId) {
                io.to(driverSocketId).emit("ride-cancelled", { rideId: ride._id });
            }
        }

        // Notify user socket
        const io = getIo();
        const userSocketId = await redisClient.get(`user_socket:${ride.userId}`);
        if (userSocketId) {
            io.to(userSocketId).emit("ride-cancelled", { rideId: ride._id });
        }

        return res.json({ message: "Ride cancelled successfully", ride });

    } catch (err) {
        console.error("Cancel Ride Error:", err);
        return res.status(500).json({ error: "Failed to cancel ride" });
    }
};
