import { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate, useLocation } from "react-router-dom";
import { API_BASE_URL } from "../../config";

export default function DriverOtp() {
  const [otp, setOtp] = useState("");
  const [email, setEmail] = useState("");
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const savedEmail = localStorage.getItem("driver_email");
    if (!savedEmail) {
      alert("Session expired. Please login again.");
      navigate("/login");
      return;
    }

    setEmail(savedEmail);
  }, []);

  const submit = async () => {
    try {
      await axios.post(`${API_BASE_URL}/driver/verify-otp`, {
        email,
        otp
      });

      alert("Under admin review. You will be notified.");
      navigate("/login");
    } catch (err) {
      alert(err.response?.data?.message || "OTP verification failed");
    }
  };

  return (
    <div>
      <h2>Driver OTP Verification</h2>

      <input
        placeholder="Enter OTP"
        value={otp}
        onChange={e => setOtp(e.target.value)}
      />

      <button onClick={submit}>Verify</button>
    </div>
  );
}
