import { useState } from "react";
import { signup } from "../../api/auth.api";
import { useNavigate } from "react-router-dom";

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
    <>
      <h2>Driver Signup</h2>

      <input
        placeholder="Full Name"
        onChange={e =>
          setForm({ ...form, fullName: e.target.value })
        }
      />

      <input
        placeholder="Email"
        onChange={e =>
          setForm({ ...form, email: e.target.value })
        }
      />

      <input
        placeholder="Phone"
        onChange={e =>
          setForm({ ...form, phone: e.target.value })
        }
      />

      <input
        type="password"
        placeholder="Password"
        onChange={e =>
          setForm({ ...form, password: e.target.value })
        }
      />

      <input
        placeholder="Age"
        onChange={e =>
          setForm({ ...form, age: e.target.value })
        }
      />

      <input
        placeholder="License Number"
        onChange={e =>
          setForm({ ...form, licenseNumber: e.target.value })
        }
      />

      <div>
        Gender:
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
          Others
        </label>
      </div>

      <h3>Vehicle Details</h3>

      <input
        placeholder="Vehicle Brand"
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

      <input
        placeholder="Vehicle Model"
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

      <input
        placeholder="Vehicle Registered State"
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

      <button onClick={submit}>Continue</button>
    </>
  );
}
