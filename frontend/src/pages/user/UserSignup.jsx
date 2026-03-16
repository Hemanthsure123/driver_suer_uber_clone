import { useState } from "react";
import { signup } from "../../api/auth.api";
import { useNavigate, Link } from "react-router-dom";

export default function UserSignup() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    mobile: "",
    password: "",
    gender: "MALE"
  });

  const navigate = useNavigate();

  const submit = async () => {
    await signup({
      role: "USER",
      email: form.email,
      password: form.password,
      userDetails: {
        name: form.name,
        mobile: form.mobile,
        gender: form.gender
      }
    });

    navigate("/user/verify-otp", { state: { email: form.email } });
  };

  return (
    <div className="auth-container">
      <div className="auth-header">
        <h2>Rider Registration</h2>
        <p>Join us and start riding today</p>
      </div>

      <div className="auth-input-group">
        <input placeholder="Full Name" onChange={e => setForm({ ...form, name: e.target.value })} />
      </div>
      <div className="auth-input-group">
        <input placeholder="Email Address" onChange={e => setForm({ ...form, email: e.target.value })} />
      </div>
      <div className="auth-input-group">
        <input placeholder="Mobile Number" onChange={e => setForm({ ...form, mobile: e.target.value })} />
      </div>
      <div className="auth-input-group">
        <input type="password" placeholder="Password" onChange={e => setForm({ ...form, password: e.target.value })} />
      </div>

      <div className="gender-group">
        <span className="gender-label">Gender</span>
        <div className="radio-group">
          <label><input type="radio" name="gender" value="MALE" checked={form.gender === "MALE"} onChange={() => setForm({ ...form, gender: "MALE" })}/>Male</label>
          <label><input type="radio" name="gender" value="FEMALE" checked={form.gender === "FEMALE"} onChange={() => setForm({ ...form, gender: "FEMALE" })}/>Female</label>
          <label><input type="radio" name="gender" value="OTHERS" checked={form.gender === "OTHERS"} onChange={() => setForm({ ...form, gender: "OTHERS" })}/>Other</label>
        </div>
      </div>

      <button className="auth-button" onClick={submit}>Create Account</button>

      <div className="auth-links">
        <p>Already have an account?</p>
        <Link to="/login">Sign In</Link>
      </div>
    </div>
  );
}
