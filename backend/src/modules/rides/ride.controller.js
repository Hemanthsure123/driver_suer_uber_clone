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

        // 3. Filter drivers by availability from MongoDB (Optional but secure vs race conditions)
        console.log(`[RideBooking] GEORADIUS match around [${lon}, ${lat}]: ${nearbyDriverIds}`);
        
        const availableDrivers = await Driver.find({
            userId: { $in: nearbyDriverIds },
            // If isAvailable wasn't explicitly set to false, treat as true (legacy driver support)
            isAvailable: { $ne: false }
        });

        console.log(`[RideBooking] DB valid drivers left: ${availableDrivers.length}`);

        // 4. Broadcast to those specific available drivers via Socket
        const io = getIo();
        let pingCount = 0;
        for (const driver of availableDrivers) {
            const socketId = await redisClient.get(`driver_socket:${driver.userId}`);
            console.log(`[RideBooking] Attempting to ping Driver ${driver.userId} on socket ${socketId}`);
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

        // Send Email
        await sendEmail(user.email, otp).catch(e => console.error("OTP Email Error (ignored):", e));

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
