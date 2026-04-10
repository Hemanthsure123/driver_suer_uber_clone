from fastapi import FastAPI
import cv2
import numpy as np
import subprocess
import os
import uuid
import onnxruntime as ort

app = FastAPI()

# =========================
# FACE DETECTOR (OpenCV DNN)
# =========================
face_net = cv2.dnn.readNetFromCaffe(
    "models/deploy.prototxt",
    "models/res10_300x300_ssd_iter_140000.caffemodel"
)

# =========================
# EYE BLINK CNN (ONNX)
# =========================
blink_sess = None
blink_input = None
try:
    blink_sess = ort.InferenceSession(
        "models/eye_blink_cnn.onnx",
        providers=["CPUExecutionProvider"]
    )
    blink_input = blink_sess.get_inputs()[0].name
except Exception as e:
    print(f"⚠️ Warning: Could not load ONNX model (likely missing Git-LFS files). ML Eye inference will be disabled. Error: {e}")


# =========================
# FACE DETECTION
# =========================
def detect_face(frame):
    h, w = frame.shape[:2]
    blob = cv2.dnn.blobFromImage(
        frame, 1.0, (300, 300),
        (104.0, 177.0, 123.0)
    )
    face_net.setInput(blob)
    detections = face_net.forward()

    for i in range(detections.shape[2]):
        conf = detections[0, 0, i, 2]
        if conf > 0.5:
            box = detections[0, 0, i, 3:7] * np.array([w, h, w, h])
            x1, y1, x2, y2 = box.astype(int)

            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(w, x2), min(h, y2)

            if x2 - x1 < 80 or y2 - y1 < 80:
                return None

            return frame[y1:y2, x1:x2]

    return None


# =========================
# EYE REGION (HEURISTIC)
# =========================
def extract_eye_regions(face):
    h, w = face.shape[:2]

    y1, y2 = int(0.15 * h), int(0.45 * h)

    left_eye = face[y1:y2, int(0.10 * w):int(0.45 * w)]
    right_eye = face[y1:y2, int(0.55 * w):int(0.90 * w)]

    return left_eye, right_eye


# =========================
# EYE STATE (CNN)
# =========================
def predict_eye_state(eye_img):
    if eye_img.size == 0 or blink_sess is None:
        return None

    eye = cv2.resize(eye_img, (224, 224))
    eye = cv2.cvtColor(eye, cv2.COLOR_BGR2RGB)

    # force float32
    eye = eye.astype(np.float32) / 255.0

    # ImageNet normalization (float32 enforced)
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    std  = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    eye = (eye - mean) / std

    # NCHW
    eye = np.transpose(eye, (2, 0, 1)).astype(np.float32)
    eye = np.expand_dims(eye, axis=0).astype(np.float32)

    preds = blink_sess.run(None, {blink_input: eye})[0]

    # DEBUG (temporary)
    print("RAW logits:", preds)

    return int(np.argmax(preds, axis=1)[0])  # 0=closed, 1=open





# =========================
# BLINK COUNTING
# =========================
def count_blinks(states):
    blinks = 0
    closed_frames = 0

    for s in states:
        if s == 0:
            closed_frames += 1
        else:
            if 1 <= closed_frames <= 3:
                blinks += 1
            closed_frames = 0

    return blinks


# =========================
# MOTION SCORE
# =========================
def motion_score(frames):
    score = 0.0
    for i in range(1, len(frames)):
        diff = cv2.absdiff(frames[i - 1], frames[i])
        score += np.mean(diff)
    return score / len(frames)


import json
import threading
from kafka import KafkaConsumer, KafkaProducer

# =========================
# LIVENESS ENDPOINT (HTTP - Legacy)
# =========================
@app.post("/liveness")
def liveness(data: dict):
    # This remains for backward comp.
    pass

# =========================
# KAFKA CONSUMER 
# =========================

KAFKA_BROKER = os.getenv("KAFKA_BROKER", "localhost:9092")

import time

def start_kafka_consumer():
    while True:
        try:
            consumer = KafkaConsumer(
                'video_verification_tasks',
                bootstrap_servers=[KAFKA_BROKER],
                auto_offset_reset='earliest',
                enable_auto_commit=True,
                group_id='ml-service-group',
                value_deserializer=lambda x: json.loads(x.decode('utf-8'))
            )
            
            producer = KafkaProducer(
                bootstrap_servers=[KAFKA_BROKER],
                value_serializer=lambda v: json.dumps(v).encode('utf-8')
            )
            
            print("✅ ML Service Kafka loop started")
        
            for message in consumer:
                data = message.value
                _id = data.get("_id")
                
                # In Docker, backend and ml-service share a volume mapped to /app/uploads
                video_path = os.path.abspath(os.path.join("/app", data["path"]))
                
                print(f"📥 Processing task for logic ID {_id} at {video_path}")
            
                if not os.path.exists(video_path):
                    producer.send(
                        'video_verification_results', 
                        {"_id": _id, "success": False, "reason": "Video file not found"}
                    )
                    continue

                frames_dir = f"frames_{uuid.uuid4().hex}"
                os.makedirs(frames_dir, exist_ok=True)

                cmd = [
                    "ffmpeg", "-y",
                    "-i", video_path,
                    "-vf", "fps=15",
                    os.path.join(frames_dir, "frame_%03d.jpg")
                ]

                try:
                    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                except subprocess.CalledProcessError:
                    producer.send(
                        'video_verification_results', 
                        {"_id": _id, "success": False, "reason": "FFmpeg failed"}
                    )
                    continue

                frame_files = sorted(os.listdir(frames_dir))
                if not frame_files:
                    producer.send(
                        'video_verification_results', 
                        {"_id": _id, "success": False, "reason": "No frames"}
                    )
                    continue

                face_frames = []
                eye_states = []

                for fname in frame_files:
                    img = cv2.imread(os.path.join(frames_dir, fname))
                    if img is None:
                        continue

                    face = detect_face(img)
                    if face is None:
                        continue

                    face = cv2.resize(face, (224, 224))
                    face_frames.append(face)

                    left_eye, right_eye = extract_eye_regions(face)

                    l_state = predict_eye_state(left_eye)
                    r_state = predict_eye_state(right_eye)

                    if l_state is not None and r_state is not None:
                        eye_states.append(0 if (l_state == 0 and r_state == 0) else 1)

                # Cleanup
                for f in frame_files:
                    os.remove(os.path.join(frames_dir, f))
                os.rmdir(frames_dir)

                if len(face_frames) < 5:
                    producer.send(
                        'video_verification_results', 
                        {"_id": _id, "success": False, "reason": "Face not stable"}
                    )
                    continue

                motion = motion_score(face_frames)
                blink_count = count_blinks(eye_states)

                motion_conf = min(50, int(motion * 10))
                face_conf = min(30, int((len(face_frames) / len(frame_files)) * 30))
                blink_conf = min(20, blink_count * 5)

                confidence = min(100, motion_conf + face_conf + blink_conf)

                producer.send(
                    'video_verification_results', 
                    {
                        "_id": _id, 
                        "success": True,
                        "confidence": confidence,
                        "path": data["path"]
                    }
                )
                print(f"✅ Processed task {_id}. Confidence: {confidence}")
            
        except Exception as e:
            print("❌ Kafka Thread Failed, retrying in 5s:", e)
            time.sleep(5)

# Start background thread
threading.Thread(target=start_kafka_consumer, daemon=True).start()
