// src/server.js
import app from "./app.js";
import env from "./config/env.js";
import connectDB from "./config/db.js";
import http from "http";
import { initializeSocket, getIo } from "./socket.js";
import redisClient from "./config/redis.js"; // Ensures connection is verified on startup
import { connectKafka } from "./config/kafka.js";
import Driver from "./modules/drivers/driver.model.js";
import { initRetryWorker } from "./modules/payouts/retryWorker.js";

const startServer = async () => {
  await connectDB();
  await connectKafka(); // Initialize Kafka Consumer/Producer
  
  // Initialize Payout Retry Worker
  initRetryWorker();

  // ─────────────────────────────────────────────────────────────
  // D. STARTUP STATE RECOVERY
  // Reset ALL drivers to available on every server restart.
  // Handles crashes, container restarts, and missed lifecycle events.
  // ─────────────────────────────────────────────────────────────
  try {
    const result = await Driver.updateMany({}, { $set: { isAvailable: true } });
    console.log(`✅ [Startup] Driver state recovery: ${result.modifiedCount} driver(s) reset to isAvailable=true`);
  } catch (err) {
    console.error("❌ [Startup] Driver state recovery failed:", err.message);
  }

  const server = http.createServer(app);
  
  // Initialize modular socket.io bindings + Redis cache tracking
  const io = initializeSocket(server);

  // ─────────────────────────────────────────────────────────────
  // E. STALE DRIVER CLEANUP (every 60 seconds)
  // Any driver in MongoDB with isAvailable=false but NO active
  // socket in Redis is permanently stuck. Free them automatically.
  // ─────────────────────────────────────────────────────────────
  setInterval(async () => {
    try {
      const unavailableDrivers = await Driver.find({ isAvailable: false });
      let freed = 0;
      for (const driver of unavailableDrivers) {
        const driverIdStr = driver.userId.toString();
        const socketId = await redisClient.get(`driver_socket:${driverIdStr}`);
        // If there's no live socket for this driver, they are orphaned — free them
        if (!socketId) {
          await Driver.updateOne({ _id: driver._id }, { $set: { isAvailable: true } });
          freed++;
          console.log(`[Cleanup] Freed orphaned driver ${driverIdStr} (had no active socket)`);
        }
      }
      if (freed > 0) {
        console.log(`[Cleanup] Stale driver sweep complete. Freed ${freed} driver(s).`);
      }
    } catch (err) {
      console.error("[Cleanup] Stale driver sweep error:", err.message);
    }
  }, 60_000); // Run every 60 seconds

  server.listen(env.port, "0.0.0.0", () => {
    console.log(`🚀 Server running on port ${env.port}`);
  });
};

startServer();
