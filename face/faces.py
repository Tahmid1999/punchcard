"""Find the one face in a photo and turn it into an SFace embedding."""

import threading
from pathlib import Path

import cv2
import numpy as np

YUNET = 'face_detection_yunet_2023mar.onnx'
SFACE = 'face_recognition_sface_2021dec.onnx'

# YuNet confidence below this is not counted as a face at all.
MIN_SCORE = 0.9
# Phone photos are 3000+ px wide. YuNet does not need that, and it is slow.
MAX_SIDE = 1280


class NotAnImage(ValueError):
    pass


class Faces:
    def __init__(self, models: Path):
        self._detector = cv2.FaceDetectorYN.create(str(models / YUNET), '', (320, 320), MIN_SCORE)
        self._recognizer = cv2.FaceRecognizerSF.create(str(models / SFACE), '')
        # One OpenCV net is not safe to call from two threads, and FastAPI runs
        # sync endpoints on a thread pool.
        self._lock = threading.Lock()

    def embed(self, data: bytes) -> tuple[int, np.ndarray | None]:
        """Return how many faces were found and, if exactly one, its unit-length embedding.

        With the embedding at unit length, cosine similarity between two photos is
        their dot product, so the API can compare them without OpenCV.
        """
        # IMREAD_COLOR applies the EXIF orientation, so a sideways phone photo is upright here.
        img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
        if img is None:
            raise NotAnImage('not an image OpenCV can read')

        scale = MAX_SIDE / max(img.shape[:2])
        if scale < 1:
            img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        h, w = img.shape[:2]

        with self._lock:
            self._detector.setInputSize((w, h))
            _, found = self._detector.detect(img)
            count = 0 if found is None else len(found)
            if count != 1:
                return count, None
            # alignCrop uses the five landmarks YuNet returns to rotate and crop
            # the face to the 112x112 input SFace was trained on.
            aligned = self._recognizer.alignCrop(img, found[0])
            feature = self._recognizer.feature(aligned).flatten().astype(np.float32)

        return 1, feature / np.linalg.norm(feature)
