"""HTTP wrapper around Faces. Stateless: the API keeps the embeddings and does the matching."""

import base64
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, UploadFile

from faces import Faces, NotAnImage

MAX_BYTES = 4 * 1024 * 1024

faces: Faces | None = None


@asynccontextmanager
async def lifespan(_: FastAPI):
    global faces
    faces = Faces(Path(os.environ.get('MODELS_DIR', Path(__file__).parent / 'models')))
    yield


app = FastAPI(title='punchcard face', lifespan=lifespan)


@app.get('/health')
def health():
    return {'ok': True}


@app.post('/embed')
def embed(photo: UploadFile):
    data = photo.file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, 'photo is over 4 MB')
    try:
        count, embedding = faces.embed(data)
    except NotAnImage as e:
        raise HTTPException(400, str(e))

    # 128 little-endian float32, 512 bytes. The API stores this as is.
    return {
        'faces': count,
        'embedding': None if embedding is None else base64.b64encode(embedding.astype('<f4').tobytes()).decode(),
    }
