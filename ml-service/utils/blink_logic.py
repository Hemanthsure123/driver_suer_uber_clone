import cv2
import numpy as np
import onnxruntime as ort

session = ort.InferenceSession("models/eye_blink_cnn.onnx")
input_name = session.get_inputs()[0].name

def eye_state(eye_img):
    gray = cv2.cvtColor(eye_img, cv2.COLOR_BGR2GRAY)
    resized = cv2.resize(gray, (24, 24))
    norm = resized.astype(np.float32) / 255.0
    blob = norm.reshape(1, 1, 24, 24)

    preds = session.run(None, {input_name: blob})[0]
    return "closed" if preds[0][1] > preds[0][0] else "open"


def count_blinks(states):
    blinks = 0
    prev = "open"
    for s in states:
        if prev == "open" and s == "closed":
            blinks += 1
        prev = s
    return blinks
