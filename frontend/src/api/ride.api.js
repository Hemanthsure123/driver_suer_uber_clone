import API from "./auth.api";

// Reusable header generator
const getAuthHeaders = () => ({
  headers: {
    Authorization: `Bearer ${localStorage.getItem("token")}`
  }
});

// General Active State API
export const getActiveRide = () => API.get("/rides/active", getAuthHeaders());

// User APIs
export const bookRide = (data) => API.post("/rides/book", data, getAuthHeaders());
export const resendOtp = (rideId) => API.post(`/rides/${rideId}/resend-otp`, {}, getAuthHeaders());
export const cancelRide = (rideId) => API.post(`/rides/${rideId}/cancel`, {}, getAuthHeaders());

// Driver APIs
export const acceptRide = (rideId) => API.post(`/rides/${rideId}/accept`, {}, getAuthHeaders());
export const driverArrived = (rideId) => API.post(`/rides/${rideId}/arrived`, {}, getAuthHeaders());
export const verifyOtp = (rideId, data) => API.post(`/rides/${rideId}/verify-otp`, data, getAuthHeaders());
export const completeRide = (rideId) => API.post(`/rides/${rideId}/complete`, {}, getAuthHeaders());
