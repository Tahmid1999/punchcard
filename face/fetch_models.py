"""Download the two ONNX models from opencv_zoo and check them against pinned hashes.

They are not in the repo: SFace alone is 37 MB. YuNet is MIT licensed, SFace Apache 2.0.
"""

import hashlib
import sys
import urllib.request
from pathlib import Path

ZOO = 'https://github.com/opencv/opencv_zoo/raw/main/models'
MODELS = {
    'face_detection_yunet_2023mar.onnx': (
        f'{ZOO}/face_detection_yunet/face_detection_yunet_2023mar.onnx',
        '8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4',
    ),
    'face_recognition_sface_2021dec.onnx': (
        f'{ZOO}/face_recognition_sface/face_recognition_sface_2021dec.onnx',
        '0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79',
    ),
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent / 'models'
    out.mkdir(parents=True, exist_ok=True)
    for name, (url, digest) in MODELS.items():
        path = out / name
        if path.exists() and sha256(path) == digest:
            print(f'{name}: already here')
            continue
        print(f'{name}: downloading')
        urllib.request.urlretrieve(url, path)
        if sha256(path) != digest:
            path.unlink()
            print(f'{name}: hash does not match, deleted', file=sys.stderr)
            return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
