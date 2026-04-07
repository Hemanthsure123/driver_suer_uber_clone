import mongoose from "mongoose";
import geohash from "ngeohash";
import dotenv from "dotenv";
import Driver from "./src/modules/drivers/driver.model.js";

dotenv.config();

const testGeomatch = async () => {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to Mongo");
    
    // Simulating user pickup at Nellore (approx lat=14.4426, lon=79.9865)
    // Looking at the screenshot, D and U are near Balaji Nagar, Nellore
    const lat = 14.4426;
    const lon = 79.9865;
    
    // 1. Calculate Grid Hash (Precision 5 = ~4.9x4.9km)
    const hash = geohash.encode(lat, lon, 5);
    console.log("Central Grid Hash:", hash);
    
    // 2. Neighbors
    const gridsToScan = [hash, ...geohash.neighbors(hash)];
    console.log("Scanning 9 Grids:", gridsToScan);
    
    // Assume driver sent a mock update
    const driverLat = 14.4450;
    const driverLon = 79.9890;
    const driverHash = geohash.encode(driverLat, driverLon, 5);
    console.log("Driver would be in hash:", driverHash);
    
    if (gridsToScan.includes(driverHash)) {
        console.log("✅ Driver correctly overlaps the search grid!");
    } else {
        console.log("❌ Driver is somehow OUTSIDE the 9 grid cluster!");
    }
    
    process.exit();
};

testGeomatch();
