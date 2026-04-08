import { Server } from "socket.io";
import redisClient from "./config/redis.js";

let io;

export const initializeSocket = (server) => {
    io = new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });

    io.on("connection", (socket) => {
        console.log(`🔌 New client connected: ${socket.id}`);

        /**
         * USER REGISTRATION WITH SOCKET
         * Users/Drivers can identify themselves on connection
         */
        socket.on("join", async ({ userId, role }) => {
            if (userId) {
                await redisClient.set(`socket_user:${socket.id}`, userId);
                await redisClient.set(`user_socket:${userId}`, socket.id);
                
                // If a driver joins, also register driver_socket immediately
                // so ride-request can be emitted before first location update
                if (role === 'DRIVER') {
                    await redisClient.set(`driver_socket:${userId}`, socket.id);
                    await redisClient.set(`socket_driver:${socket.id}`, userId);
                }
                
                console.log(`[Socket] Registered User ${userId} (${role}) to socket ${socket.id}`);
            }
        });

        /**
         * 1. REAL-TIME LOCATION TRACKING
         * Push location updates into high throughput Kafka Topic stream
         */
        socket.on("update-location", async (data) => {
            const { driverId, latitude, longitude, activeRideUserId } = data;
            if (driverId && latitude && longitude) {
                try {
                    // Lazy import so we don't circularly depend if kafka touches socket
                    const { produceMessage } = await import("./config/kafka.js");
                    
                    // Maintain socket mapping for immediate logic
                    await redisClient.set(`driver_socket:${driverId}`, socket.id);
                    await redisClient.set(`socket_driver:${socket.id}`, driverId);
                    
                    // Produce location update task
                    await produceMessage("driver_locations", [{
                        driverId,
                        latitude,
                        longitude,
                        activeRideUserId
                    }]);
                    
                } catch (err) {
                    console.error("Location Producer Error:", err);
                }
            }
        });

        /**
         * RIDE MATCHING LOOP - Now handled strictly by backend background service
         */

        socket.on("disconnect", async () => {
            console.log(`🔌 Client disconnected: ${socket.id}`);
            try {
                // Determine if a driver disconnected
                const driverId = await redisClient.get(`socket_driver:${socket.id}`);
                if (driverId) {
                    // Remove from active tracking index
                    await redisClient.zrem("drivers:online", driverId);
                    await redisClient.del(`driver_socket:${driverId}`);
                    await redisClient.del(`socket_driver:${socket.id}`);
                    
                    // ─────────────────────────────────────────────────────
                    // C. DRIVER STATE RECOVERY ON DISCONNECT
                    // If driver disconnects while marked unavailable (e.g. mid-ride
                    // crash, app refresh, network drop) — free them immediately.
                    // Without this, they stay stuck as isAvailable=false forever.
                    // ─────────────────────────────────────────────────────
                    const Driver = (await import("./modules/drivers/driver.model.js")).default;
                    const updated = await Driver.findOneAndUpdate(
                        { userId: driverId, isAvailable: false },
                        { $set: { isAvailable: true } },
                        { new: true }
                    );
                    if (updated) {
                        console.log(`[Socket] Driver ${driverId} was unavailable on disconnect — reset to isAvailable=true`);
                    }
                    
                    console.log(`[Socket] Driver ${driverId} removed from online GEO store.`);
                }
                
                // Cleanup general user links
                const userId = await redisClient.get(`socket_user:${socket.id}`);
                if (userId) {
                    await redisClient.del(`socket_user:${socket.id}`);
                    await redisClient.del(`user_socket:${userId}`);
                }
            } catch (err) {
                console.error("Socket Disconnect Error:", err);
            }
        });
    });

    return io;
};

export const getIo = () => {
    if (!io) {
        throw new Error("Socket.io not initialized!");
    }
    return io;
};
