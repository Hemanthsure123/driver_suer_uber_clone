import redisClient from "../../config/redis.js";
import Driver from "../drivers/driver.model.js";
import Ride from "./ride.model.js";
import { getIo } from "../../socket.js";
import geohash from "ngeohash";

const matchingIntervals = new Map();

/**
 * Starts a background loop to constantly find drivers for a newly requested ride.
 * Backend-driven entirely, does not depend on frontend or sockets.
 */
export const startMatching = (rideId, pickup, drop, distanceKm, fareAmount) => {
    const stringId = rideId.toString();
    if (matchingIntervals.has(stringId)) return;

    console.log(`[RideMatching] Started matching background service for ride ${stringId}`);

    const intervalId = setInterval(async () => {
        try {
            // Validate state: Only keep matching if ride is still "requested"
            const ride = await Ride.findById(rideId);
            if (!ride || ride.rideStatus !== "requested") {
                console.log(`[RideMatching] Ride ${stringId} no longer requested (status: ${ride?.rideStatus}). Stopping interval.`);
                clearInterval(intervalId);
                matchingIntervals.delete(stringId);
                return;
            }

            const [lon, lat] = pickup.coordinates;
            const hash = geohash.encode(lat, lon, 5);
            const gridsToScan = [hash, ...geohash.neighbors(hash)];
            
            const results = await Promise.all(
                gridsToScan.map(grid => redisClient.smembers(`grid:${grid}`))
            );
            
            let nearbyDriverIds = [];
            results.forEach(gridDrivers => nearbyDriverIds.push(...gridDrivers));
            nearbyDriverIds = [...new Set(nearbyDriverIds)];
            
            if (nearbyDriverIds.length > 0) {
                const availableDrivers = await Driver.find({
                    userId: { $in: nearbyDriverIds },
                    isAvailable: { $ne: false }
                });

                const io = getIo();
                let pingCount = 0;
                for (const driver of availableDrivers) {
                    const driverUserIdStr = driver.userId.toString();
                    const driverSocketId = await redisClient.get(`driver_socket:${driverUserIdStr}`);
                    if (driverSocketId) {
                        io.to(driverSocketId).emit("ride-request", { rideId, pickup, drop, distanceKm, fareAmount });
                        pingCount++;
                    }
                }
                if (pingCount > 0) {
                    console.log(`[RideMatching] Retry Loop: Emitted to ${pingCount} live sockets for ride ${stringId}`);
                }
            }

        } catch (error) {
            console.error(`[RideMatching] Error in background matching for ride ${stringId}:`, error);
        }
    }, 5000); // 5 seconds polling interval

    matchingIntervals.set(stringId, intervalId);
};

/**
 * Safely manually stops matching to save DB cycles immediately.
 */
export const stopMatching = (rideId) => {
    const stringId = rideId.toString();
    if (matchingIntervals.has(stringId)) {
        clearInterval(matchingIntervals.get(stringId));
        matchingIntervals.delete(stringId);
        console.log(`[RideMatching] Force stopped matching for ride ${stringId}`);
    }
};
