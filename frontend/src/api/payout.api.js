import axios from "axios";
import { API_BASE_URL } from "../config";

const payoutApi = axios.create({
  baseURL: `${API_BASE_URL}/payout`,
});

// Interceptor to inject JWT Token dynamically
payoutApi.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export const requestWithdrawal = async (amount, accountNumber, ifscLine) => {
  return await payoutApi.post("/withdraw", { 
    amount, 
    accountNumber, 
    ifsc: ifscLine 
  });
};
