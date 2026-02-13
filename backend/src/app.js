import express from "express";

import authRoutes from "./modules/auth/auth.routes.js";
import driverRoutes from "./modules/drivers/driver.routes.js";
import adminRoutes from "./modules/admin/admin.routes.js";

const app = express();

app.use(express.json());

import cors from "cors";

app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true
}));


app.use("/api/auth", authRoutes);
app.use("/api/driver", driverRoutes);
app.use("/api/admin", adminRoutes);

export default app;
