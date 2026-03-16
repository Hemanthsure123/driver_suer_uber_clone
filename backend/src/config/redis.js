import Redis from "ioredis";
import env from "./env.js";

const redisClient = new Redis(env.redisUrl);

redisClient.on("connect", () => {
    console.log("🟢 Redis Connected Successfully");
});

redisClient.on("error", (err) => {
    console.error("🔴 Redis Connection Error:", err);
});

export default redisClient;
