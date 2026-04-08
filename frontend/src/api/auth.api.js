import axios from "axios";

const API = axios.create({
  baseURL: "/api"
});

export const signup = (data) => API.post("/auth/signup", data);
export const verifyOtp = (data) => API.post("/auth/verify-otp", data);
export const login = (data) => API.post("/auth/login", data);

export const getMe = () => API.get("/auth/me", { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });

export default API;
