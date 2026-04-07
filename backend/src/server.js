// src/server.js
import app from "./app.js";
import env from "./config/env.js";
import connectDB from "./config/db.js";
import http from "http";
import { initializeSocket } from "./socket.js";
import redisClient from "./config/redis.js"; // Ensures connection is verified on startup
import { connectKafka } from "./config/kafka.js";

const startServer = async () => {
  await connectDB();
  await connectKafka(); // Initialize Kafka Consumer/Producer

  const server = http.createServer(app);
  
  // Initialize modular socket.io bindings + Redis cache tracking
  initializeSocket(server);

  server.listen(env.port, "0.0.0.0", () => {
    console.log(`🚀 Server running on port ${env.port}`);
  });
};

startServer();
