import Webcam from "react-webcam";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API_BASE_URL } from "../../config";

export default function DriverLiveness() {
  const webcamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const lockedRef = useRef(false);

  const navigate = useNavigate();

  const [phase, setPhase] = useState("IDLE");
  const [confidence, setConfidence] = useState(null);

  const startRecording = () => {
    if (lockedRef.current) return;

    chunksRef.current = [];
    setConfidence(null);
    setPhase("RECORDING");

    const stream = webcamRef.current.stream;
    const recorder = new MediaRecorder(stream, {
      mimeType: "video/webm; codecs=vp8",
    });

    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      if (lockedRef.current) return;

      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      if (blob.size < 10000) {
        setPhase("FAILED");
        return;
      }

      const form = new FormData();
      form.append("video", blob, "liveness.webm");
      const email = localStorage.getItem("driver_email");
      if (email) {
        form.append("email", email);
      }

      try {
        setPhase("ANALYZING");

        const res = await axios.post(
          `${API_BASE_URL}/driver/liveness-check`,
          form,
          { headers: { "Content-Type": "multipart/form-data" } }
        );

        console.log("RAW RESPONSE:", res.data);

        // 🔥 FORCE NUMBER
        const score = Number(res.data.confidence);

        console.log("PARSED SCORE:", score);

        setConfidence(score);

        // ✅ ABSOLUTE SUCCESS PATH
        if (!isNaN(score) && score >= 70) {
          console.log("LIVENESS PASSED — REDIRECTING");

          lockedRef.current = true;

          const email = localStorage.getItem("driver_email");
          if (!email) {
            alert("Email not found. Please signup again.");
            navigate("/driver/signup");
            return;
          }

          await axios.post(`${API_BASE_URL}/driver/send-otp`, {
            email
          });

          navigate("/driver/verify-otp", { replace: true });
          return;
        }

        console.log("LIVENESS FAILED — SCORE LOW");
        setPhase("FAILED");
      } catch (err) {
        console.error("LIVENESS ERROR:", err);
        setPhase("FAILED");
      }
    };

    recorder.start();
    setTimeout(() => recorder.stop(), 3000);
  };

  return (
    <div style={{ textAlign: "center" }}>
      <h2>Driver Liveness Check</h2>

      <Webcam
        ref={webcamRef}
        audio={false}
        mirrored
        videoConstraints={{ facingMode: "user" }}
        style={{ width: 320, height: 240 }}
      />

      {phase === "IDLE" && (
        <button onClick={startRecording}>Start Liveness Check</button>
      )}

      {phase === "RECORDING" && <p>Recording…</p>}
      {phase === "ANALYZING" && <p>Analyzing…</p>}

      {phase === "FAILED" && (
        <>
          <p style={{ color: "red" }}>
            Liveness failed
            {confidence !== null && ` (Confidence: ${confidence}%)`}
          </p>
          <button onClick={startRecording}>Retry</button>
        </>
      )}
    </div>
  );
}
