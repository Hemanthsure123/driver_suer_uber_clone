import { useState } from "react";
import { signup } from "../../api/auth.api";
import { useNavigate, Link } from "react-router-dom";

export default function DriverSignup() {
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    password: "",
    gender: "MALE",
    age: "",
    licenseNumber: "",
    vehicle: {
      brand: "",
      model: "",
      category: "CAR",
      state: "",
      rcNumber: ""
    }
  });

  const navigate = useNavigate();

  const submit = async () => {
    try {
      // 🔴 Basic frontend validation (minimal but necessary)
      if (
        !form.fullName ||
        !form.email ||
        !form.phone ||
        !form.password ||
        !form.licenseNumber
      ) {
        alert("Please fill all required fields");
        return;
      }

      const res = await signup({
        role: "DRIVER",
        email: form.email,
        password: form.password,
        driverDetails: {
          fullName: form.fullName,
          phone: form.phone,
          gender: form.gender,
          age: Number(form.age),
          licenseNumber: form.licenseNumber,
          vehicle: {
            brand: form.vehicle.brand,
            model: form.vehicle.model,
            category: form.vehicle.category,
            state: form.vehicle.state,
            rcNumber: form.vehicle.rcNumber
          }
        }
      });

      // 🔑 Save onboarding token (for selfie upload)
      if (res.data?.onboardingToken) {
        localStorage.setItem(
          "onboardingToken",
          res.data.onboardingToken
        );
        // Persist email for Liveness/OTP flow
        localStorage.setItem("driver_email", form.email);
      }

      navigate("/driver/liveness");

    } catch (err) {
      alert(err.response?.data?.error || "Driver signup failed");
    }
  };

  return (
    <div className="auth-container driver-auth-container">
      <div className="auth-header">
        <h2>Driver Registration</h2>
        <p>Partner with us and start earning</p>
      </div>

      <div className="auth-section-title">Personal Information</div>

      <div className="auth-input-group">
        <input
          placeholder="Full Name"
          onChange={e =>
            setForm({ ...form, fullName: e.target.value })
          }
        />
      </div>

      <div className="auth-input-group">
        <input
          placeholder="Email Address"
          onChange={e =>
            setForm({ ...form, email: e.target.value })
          }
        />
      </div>

      <div className="auth-input-group">
        <input
          placeholder="Phone Number"
          onChange={e =>
            setForm({ ...form, phone: e.target.value })
          }
        />
      </div>

      <div className="auth-input-group">
        <input
          type="password"
          placeholder="Password"
          onChange={e =>
            setForm({ ...form, password: e.target.value })
          }
        />
      </div>

      <div style={{ display: 'flex', gap: '15px' }}>
        <div className="auth-input-group" style={{ flex: 1 }}>
          <input
            placeholder="Age"
            onChange={e =>
              setForm({ ...form, age: e.target.value })
            }
          />
        </div>

        <div className="auth-input-group" style={{ flex: 2 }}>
          <input
            placeholder="License Number"
            onChange={e =>
              setForm({ ...form, licenseNumber: e.target.value })
            }
          />
        </div>
      </div>

      <div className="gender-group">
        <span className="gender-label">Gender Selection</span>
        <div className="radio-group">
          <label>
            <input
              type="radio"
              name="gender"
              checked={form.gender === "MALE"}
              onChange={() =>
                setForm({ ...form, gender: "MALE" })
              }
            />
            Male
          </label>

          <label>
            <input
              type="radio"
              name="gender"
              checked={form.gender === "FEMALE"}
              onChange={() =>
                setForm({ ...form, gender: "FEMALE" })
              }
            />
            Female
          </label>

          <label>
            <input
              type="radio"
              name="gender"
              checked={form.gender === "OTHERS"}
              onChange={() =>
                setForm({ ...form, gender: "OTHERS" })
              }
            />
            Other
          </label>
        </div>
      </div>

      <div className="auth-section-title">Vehicle Details</div>

      <div style={{ display: 'flex', gap: '15px' }}>
        <div className="auth-input-group" style={{ flex: 1 }}>
          <input
            placeholder="Brand (e.g., Toyota)"
            onChange={e =>
              setForm({
                ...form,
                vehicle: {
                  ...form.vehicle,
                  brand: e.target.value
                }
              })
            }
          />
        </div>

        <div className="auth-input-group" style={{ flex: 1 }}>
          <input
            placeholder="Model (e.g., Prius)"
            onChange={e =>
              setForm({
                ...form,
                vehicle: {
                  ...form.vehicle,
                  model: e.target.value
                }
              })
            }
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: '15px' }}>
        <div className="auth-input-group" style={{ flex: 1 }}>
          <input
            placeholder="Registered State"
            onChange={e =>
              setForm({
                ...form,
                vehicle: {
                  ...form.vehicle,
                  state: e.target.value
                }
              })
            }
          />
        </div>

        <div className="auth-input-group" style={{ flex: 1 }}>
          <input
            placeholder="RC Number"
            onChange={e =>
              setForm({
                ...form,
                vehicle: {
                  ...form.vehicle,
                  rcNumber: e.target.value
                }
              })
            }
          />
        </div>
      </div>

      <button className="auth-button" onClick={submit}>Create Driver Account</button>

      <div className="auth-links">
        <p>Already have an account?</p>
        <Link to="/login">Sign In</Link>
      </div>
    </div>
  );
}
