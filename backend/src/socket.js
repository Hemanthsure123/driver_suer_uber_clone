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
                console.log(`[Socket] Registered User ${userId} (${role}) to socket ${socket.id}`);
            }
        });

        /**
         * 1. REAL-TIME LOCATION TRACKING
         * Store location in Redis Geospatial index (only tracks active online locations)
         */
        socket.on("update-location", async (data) => {
            const { driverId, latitude, longitude } = data;
            if (driverId && latitude && longitude) {
                try {
                    // GEOADD key longitude latitude member
                    // Redis requires: longitude, latitude
                    await redisClient.geoadd("drivers:online", longitude, latitude, driverId);
                    
                    // Maintain lookup maps
                    await redisClient.set(`driver_socket:${driverId}`, socket.id);
                    await redisClient.set(`socket_driver:${socket.id}`, driverId);
                    
                    console.log(`📍 Updated location for driver ${driverId}: [${longitude}, ${latitude}]`);
                } catch (err) {
                    console.error("GEOADD Error:", err);
                }
            }
        });

        /**
         * RIDE MATCHING LOOP
         * Users trigger this while waiting for a driver to periodically scan Redis
         */
        socket.on("retry-match", async ({ rideId, pickup, drop, distanceKm, fareAmount }) => {
            try {
                const [lon, lat] = pickup.coordinates;
                const nearbyDriverIds = await redisClient.georadius("drivers:online", lon, lat, 5, "km");
                
                if (nearbyDriverIds.length > 0) {
                    const Driver = (await import("./modules/drivers/driver.model.js")).default;
                    const availableDrivers = await Driver.find({
                        userId: { $in: nearbyDriverIds },
                        isAvailable: { $ne: false }
                    });

                    for (const driver of availableDrivers) {
                        const driverSocketId = await redisClient.get(`driver_socket:${driver.userId}`);
                        if (driverSocketId) {
                            io.to(driverSocketId).emit("ride-request", { rideId, pickup, drop, distanceKm, fareAmount });
                        }
                    }
                }
            } catch (err) {
                console.error("Socket Retry Match Error:", err);
            }
        });

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
