import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../modules/users/user.model.js";
import Driver from "../modules/drivers/driver.model.js";
import { hashPassword } from "../utils/password.util.js";

dotenv.config();

const driversData = [
    {
        email: "driver1@test.com",
        name: "John Doe",
        phone: "9876543210",
        gender: "MALE",
        age: 30,
        license: "DL-001",
        vehicle: { brand: "Toyota", model: "Corolla", category: "PREMIUM_CAB", state: "KA", rcNumber: "KA01AB1234" },
        location: { type: 'Point', coordinates: [77.5946, 12.9716] }, // Bangalore
        isOnline: true
    },
    {
        email: "driver2@test.com",
        name: "Jane Smith",
        phone: "9876543211",
        gender: "FEMALE",
        age: 28,
        license: "DL-002",
        vehicle: { brand: "Honda", model: "Activa", category: "SCOOTY", state: "MH", rcNumber: "MH02CD5678" },
        location: { type: 'Point', coordinates: [72.8777, 19.0760] }, // Mumbai
        isOnline: true
    },
    {
        email: "driver3@test.com",
        name: "Bob Wilson",
        phone: "9876543212",
        gender: "MALE",
        age: 35,
        license: "DL-003",
        vehicle: { brand: "Bajaj", model: "Auto", category: "AUTO", state: "DL", rcNumber: "DL03EF9012" },
        location: { type: 'Point', coordinates: [77.2090, 28.6139] }, // Delhi
        isOnline: true
    }
];

const seedDrivers = async () => {
    try {
        console.log("Connecting to DB:", process.env.MONGO_URI);
        await mongoose.connect(process.env.MONGO_URI);

        const passwordHash = await hashPassword("Driver@123");

        for (const d of driversData) {
            // 1. Create User
            let user = await User.findOne({ email: d.email });
            if (!user) {
                user = await User.create({
                    email: d.email,
                    passwordHash,
                    role: "DRIVER",
                    emailVerified: true,
                    profile: { name: d.name, mobile: d.phone, gender: d.gender }
                });
                console.log(`User created: ${d.email}`);
            } else {
                console.log(`User exists: ${d.email}`);
            }

            // 2. Create Driver Profile
            let driver = await Driver.findOne({ userId: user._id });
            if (!driver) {
                await Driver.create({
                    userId: user._id,
                    fullName: d.name,
                    phone: d.phone,
                    gender: d.gender,
                    age: d.age,
                    licenseNumber: d.license,
                    vehicle: d.vehicle,
                    adminStatus: "APPROVED", // Auto-approve for visibility
                    location: d.location,
                    isOnline: d.isOnline
                });
                console.log(`Driver profile created for: ${d.email}`);
            } else {
                console.log(`Driver profile exists for: ${d.email}`);
            }
        }

        console.log("✅ Drivers seeded successfully");
        process.exit(0);

    } catch (err) {
        console.error("❌ Driver seed failed:", err);
        process.exit(1);
    }
};

seedDrivers();
