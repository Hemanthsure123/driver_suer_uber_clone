import { useState } from "react";
import { verifyOtp } from "../../api/auth.api";
import { useLocation, useNavigate } from "react-router-dom";

export default function UserOtp() {
  const [otp, setOtp] = useState("");
  const { state } = useLocation();
  const navigate = useNavigate();

  const submit = async () => {
    await verifyOtp({ email: state.email, otp });
    navigate("/login");
  };

  return (
    <>
      <h2>Verify OTP</h2>
      <input placeholder="OTP" onChange={e => setOtp(e.target.value)} />
      <button onClick={submit}>Verify</button>
    </>
  );
}
