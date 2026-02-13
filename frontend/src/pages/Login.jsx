import { useState } from "react";
import { login } from "../api/auth.api";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const submit = async () => {
    try {
      const res = await login({ email, password });

      // store token
      
      localStorage.setItem("token", res.data.token);
      localStorage.setItem("role", res.data.role); 

      // role-based redirect
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
    <>
      <h2>Login</h2>

      <input
        placeholder="Email"
        onChange={e => setEmail(e.target.value)}
      />

      <input
        type="password"
        placeholder="Password"
        onChange={e => setPassword(e.target.value)}
      />

      <button onClick={submit}>Login</button>
    </>
  );
}
