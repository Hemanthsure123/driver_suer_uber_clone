import { Kafka, Partitioners } from 'kafkajs';
import Driver from '../modules/drivers/driver.model.js';
import redisClient from './redis.js';
import { getIo } from '../socket.js';
import geohash from 'ngeohash';

const kafka = new Kafka({
  clientId: 'uber-backend',
  brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
  retry: {
    initialRetryTime: 100,
    retries: 8
  }
});

const producer = kafka.producer({ createPartitioner: Partitioners.LegacyPartitioner });
const consumer = kafka.consumer({ groupId: 'backend-consumer-group' });

export const connectKafka = async () => {
    let retries = 10;
    while (retries > 0) {
        try {
            await producer.connect();
            console.log('✅ Kafka Producer connected');
            await consumer.connect();
            
            await consumer.subscribe({ topics: ['video_verification_tasks', 'video_verification_results', 'driver_locations'], fromBeginning: true });
            
            console.log('✅ Kafka Consumer connected and topics subscribed');

            await consumer.run({
                eachMessage: async ({ topic, partition, message }) => {
                    const data = JSON.parse(message.value.toString());
                    
                    if (topic === 'driver_locations') {
                        await handleDriverLocation(data);
                    } else if (topic === 'video_verification_results') {
                        await handleVideoVerificationResult(data);
                    }
                },
            });
            return; // Successfully connected and listening, exit loop
        } catch (err) {
            retries -= 1;
            console.error(`❌ Kafka Connection Error. Retries left: ${retries}. Waiting 5 seconds...`, err.message);
            if (retries === 0) {
                console.error('🚨 Kafka completely failed to connect. Location streams will be inactive.');
            }
            await new Promise(res => setTimeout(res, 5000));
        }
  }
};

export const produceMessage = async (topic, messages) => {
  try {
    await producer.send({
      topic,
      messages: messages.map(m => ({ value: JSON.stringify(m) }))
    });
  } catch (error) {
    console.error(`❌ Error producing message to ${topic}:`, error);
  }
};

/**
 * Handle responses from ML Service
 */
const handleVideoVerificationResult = async (data) => {
  console.log('📽️ Received Verification Result:', data);
  const { _id, confidence, success, reason, path } = data; // the ML service needs to send back _id and success Boolean

  if (!_id) return;

  const isSuccess = success && confidence >= 70;
  
  await Driver.findByIdAndUpdate(_id, {
    livenessStatus: isSuccess ? 'COMPLETED' : 'FAILED',
    // We update selfieUrl only if success
    ...(isSuccess && path && { selfieUrl: path })
  });

  console.log(`✅ Driver livenessStatus updated for Object ID: ${_id} -> ${isSuccess ? 'COMPLETED' : 'FAILED'}`);
};

/**
 * Handle high-throughput Driver Location tracking with GeoHashing
 */
const handleDriverLocation = async (data) => {
  const { driverId, latitude, longitude, activeRideUserId } = data;
  
  if (driverId && latitude && longitude) {
    // 1. Calculate Grid Hash (Precision 5 = ~4.9x4.9km)
    const newHash = geohash.encode(latitude, longitude, 5);
    
    // 2. Manage Redis Grid Sets
    const oldHash = await redisClient.hget("driver_hash", driverId);
    if (oldHash && oldHash !== newHash) {
        // Driver moved to a new grid, remove from old grid
        await redisClient.srem(`grid:${oldHash}`, driverId);
    }
    
    // Add to current grid and update tracker map
    if (oldHash !== newHash) {
        await redisClient.hset("driver_hash", driverId, newHash);
        await redisClient.sadd(`grid:${newHash}`, driverId);
    }
    
    // 3. If Driver is currently carrying a user or moving towards point, emit event to the user's socket
    if (activeRideUserId) {
      const io = getIo();
      const userSocketId = await redisClient.get(`user_socket:${activeRideUserId}`);
      
      if (userSocketId) {
        io.to(userSocketId).emit("driver-moving", {
          driverId,
          latitude,
          longitude
        });
      }
    }
  }
};

export default kafka;
