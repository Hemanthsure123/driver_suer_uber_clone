import { useState } from "react";
import { login } from "../api/auth.api";
import { useNavigate, Link } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const submit = async () => {
    try {
      const res = await login({ email, password });
      
      localStorage.setItem("token", res.data.token);
      localStorage.setItem("role", res.data.role); 

      if (res.data.role === "USER") {
        navigate("/user/home");
      } else if (res.data.role === "DRIVER") {
        navigate("/driver/home");
      } else if (res.data.role === "ADMIN") {
        navigate("/admin/home");
      }

    } catch (err) {
      alert(err.response?.data?.error || "Login failed");
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-header">
        <h2>Welcome Back</h2>
        <p>Sign in to your account</p>
      </div>

      <div className="auth-input-group">
        <input
          placeholder="Email Address"
          onChange={e => setEmail(e.target.value)}
        />
      </div>

      <div className="auth-input-group">
        <input
          type="password"
          placeholder="Password"
          onChange={e => setPassword(e.target.value)}
        />
      </div>

      <button className="auth-button" onClick={submit}>Sign In</button>

      <div className="auth-links">
        <p>Don't have an account?</p>
        <Link to="/user/signup">Register as a Rider</Link>
        <Link to="/driver/signup">Register as a Driver</Link>
      </div>
    </div>
  );
}
