import API from "./auth.api";

// Reusable header generator
const getAuthHeaders = () => ({
  headers: {
    Authorization: `Bearer ${localStorage.getItem("token")}`
  }
});

// User API
export const bookRide = (data) => API.post("/rides/book", data, getAuthHeaders());

// Driver APIs
export const acceptRide = (rideId) => API.post(`/rides/${rideId}/accept`, {}, getAuthHeaders());
export const driverArrived = (rideId) => API.post(`/rides/${rideId}/arrived`, {}, getAuthHeaders());
export const verifyOtp = (rideId, data) => API.post(`/rides/${rideId}/verify-otp`, data, getAuthHeaders());
