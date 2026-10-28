"""Run with `pytest` from face/ after `python fetch_models.py`.

The repo holds no photos of real people. To check matching itself, put three of
your own photos in tests/faces/ (ignored by git): same_a.jpg and same_b.jpg of
one person, other.jpg of someone else. Those tests skip when the files are not there.
"""

import base64
from pathlib import Path

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app import app
from faces import SFACE, YUNET

MODELS = Path(__file__).parent.parent / 'models'
PHOTOS = Path(__file__).parent / 'faces'
THRESHOLD = 0.363

pytestmark = pytest.mark.skipif(
    not (MODELS / YUNET).exists() or not (MODELS / SFACE).exists(),
    reason='models missing, run python fetch_models.py',
)


@pytest.fixture(scope='module')
def client():
    with TestClient(app) as c:
        yield c


def jpeg(img: np.ndarray) -> bytes:
    return cv2.imencode('.jpg', img)[1].tobytes()


def embed(client, data: bytes):
    res = client.post('/embed', files={'photo': ('p.jpg', data, 'image/jpeg')})
    assert res.status_code == 200, res.text
    return res.json()


def vector(body) -> np.ndarray:
    return np.frombuffer(base64.b64decode(body['embedding']), '<f4')


def photo(name: str) -> bytes:
    path = PHOTOS / name
    if not path.exists():
        pytest.skip(f'put a photo at tests/faces/{name}')
    return path.read_bytes()


def test_health(client):
    assert client.get('/health').json() == {'ok': True}


def test_a_blank_wall_has_no_face(client):
    body = embed(client, jpeg(np.full((480, 640, 3), 200, np.uint8)))
    assert body == {'faces': 0, 'embedding': None}


def test_refuses_what_is_not_an_image(client):
    res = client.post('/embed', files={'photo': ('p.jpg', b'not a jpeg', 'image/jpeg')})
    assert res.status_code == 400


def test_refuses_a_photo_over_4_mb(client):
    res = client.post('/embed', files={'photo': ('p.jpg', b'\0' * (4 * 1024 * 1024 + 1), 'image/jpeg')})
    assert res.status_code == 413


def test_one_face_gives_a_unit_length_embedding(client):
    v = vector(embed(client, photo('same_a.jpg')))
    assert v.shape == (128,)
    assert abs(np.linalg.norm(v) - 1) < 1e-4


def test_two_faces_side_by_side_are_refused(client):
    img = cv2.imdecode(np.frombuffer(photo('same_a.jpg'), np.uint8), cv2.IMREAD_COLOR)
    assert embed(client, jpeg(np.hstack([img, img]))) == {'faces': 2, 'embedding': None}


def test_same_person_clears_the_threshold(client):
    a = vector(embed(client, photo('same_a.jpg')))
    b = vector(embed(client, photo('same_b.jpg')))
    assert float(a @ b) >= THRESHOLD


def test_someone_else_does_not(client):
    a = vector(embed(client, photo('same_a.jpg')))
    other = vector(embed(client, photo('other.jpg')))
    assert float(a @ other) < THRESHOLD
