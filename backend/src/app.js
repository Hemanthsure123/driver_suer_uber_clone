import express from "express";

import authRoutes from "./modules/auth/auth.routes.js";
import driverRoutes from "./modules/drivers/driver.routes.js";
import adminRoutes from "./modules/admin/admin.routes.js";
import rideRoutes from "./modules/rides/ride.routes.js";

const app = express();

app.use(express.json());

app.use((req, res, next) => {
    console.log(`[HTTP] ${req.method} ${req.url}`);
    next();
});

import cors from "cors";

app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true
}));

app.use("/api/auth", authRoutes);
app.use("/api/driver", driverRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/rides", rideRoutes);

export default app;
