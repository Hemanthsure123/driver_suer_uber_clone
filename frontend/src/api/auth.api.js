import axios from "axios";

const API = axios.create({
  baseURL: "/api"
});

export const signup = (data) => API.post("/auth/signup", data);
export const verifyOtp = (data) => API.post("/auth/verify-otp", data);
export const login = (data) => API.post("/auth/login", data);
export const forgotPassword = (data) => API.post("/auth/forgot-password", data);
export const resetPassword = (data) => API.post("/auth/reset-password", data);

// Helper for authorized calls
const getAuthHeaders = () => ({
  headers: {
    Authorization: `Bearer ${localStorage.getItem("token")}`
  }
});

export const getMe = () => API.get("/auth/me", getAuthHeaders());
export const editProfile = (data) => API.put("/auth/profile", data, getAuthHeaders());
export const changePassword = (data) => API.put("/auth/password", data, getAuthHeaders());

export default API;
