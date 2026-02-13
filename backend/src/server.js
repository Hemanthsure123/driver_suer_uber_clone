// src/server.js
import app from "./app.js";
import env from "./config/env.js";
import connectDB from "./config/db.js";
import http from "http";
import { Server } from "socket.io";

const startServer = async () => {
  await connectDB();

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  /* 
   * Store last known location for each socket ID so new users 
   * can see existing drivers immediately.
   */
  const lastLocations = {};

  // 🔹 Load Drivers from DB on Start
  try {
    const Driver = (await import("./modules/drivers/driver.model.js")).default;
    const onlineDrivers = await Driver.find({
      "location.coordinates": { $exists: true, $ne: [] }
    }).select('location fullName _id');

    onlineDrivers.forEach(driver => {
      // Use driver _id as the key for seeded drivers (or map to a fake socketId)
      const fakeSocketId = driver._id.toString();
      lastLocations[fakeSocketId] = {
        latitude: driver.location.coordinates[1],
        longitude: driver.location.coordinates[0],
        type: 'driver',
        id: fakeSocketId
      };
      console.log(`📍 Loaded Driver: ${driver.fullName} at ${driver.location.coordinates.reverse()}`);
    });
  } catch (err) {
    console.error("❌ Failed to load drivers:", err);
  }

  io.on("connection", (socket) => {
    console.log("New client connected", socket.id);

    // Handle existing drivers location request
    socket.on("request-locations", () => {
      Object.keys(lastLocations).forEach((id) => {
        socket.emit("receive-location", { id, ...lastLocations[id] });
      });
    });

    socket.on("send-location", (data) => {
      // Store location
      lastLocations[socket.id] = data;
      // Broadcast to everyone
      io.emit("receive-location", { id: socket.id, ...data });
    });

    socket.on("disconnect", () => {
      delete lastLocations[socket.id];
      io.emit("user-disconnected", socket.id);
      console.log("Client disconnected", socket.id);
    });
  });

  server.listen(env.port,"0.0.0.0", () => {
    console.log(`🚀 Server running on port ${env.port}`);
  });
};

startServer();
