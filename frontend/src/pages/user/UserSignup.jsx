import { useState } from "react";
import { signup } from "../../api/auth.api";
import { useNavigate } from "react-router-dom";

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
    <>
      <h2>User Signup</h2>
      <input placeholder="Name" onChange={e => setForm({ ...form, name: e.target.value })} />
      <input placeholder="Email" onChange={e => setForm({ ...form, email: e.target.value })} />
      <input placeholder="Mobile" onChange={e => setForm({ ...form, mobile: e.target.value })} />
      <input type="password" placeholder="Password" onChange={e => setForm({ ...form, password: e.target.value })} />

      <div>
        Gender:
        <label><input type="radio" name="gender" value="MALE" onChange={() => setForm({ ...form, gender: "MALE" })}/>Male</label>
        <label><input type="radio" name="gender" value="FEMALE" onChange={() => setForm({ ...form, gender: "FEMALE" })}/>Female</label>
        <label><input type="radio" name="gender" value="OTHERS" onChange={() => setForm({ ...form, gender: "OTHERS" })}/>Others</label>
      </div>

      <button onClick={submit}>Register</button>
    </>
  );
}
