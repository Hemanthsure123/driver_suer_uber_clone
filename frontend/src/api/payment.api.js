import axios from "axios";
import { API_BASE_URL } from "../config";

const paymentApi = axios.create({
  baseURL: `${API_BASE_URL}/payment`,
});

// Interceptor to inject JWT Token dynamically
paymentApi.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export const createOrder = async (rideId, amount) => {
  return await paymentApi.post("/create-order", { rideId, amount });
};

export const verifyPayment = async (verificationData) => {
  return await paymentApi.post("/verify", verificationData);
};

export const payCash = async (rideId, amount) => {
  return await paymentApi.post("/cash", { rideId, amount });
};
