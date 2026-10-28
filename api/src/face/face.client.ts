import { Injectable } from '@nestjs/common';

// 128 float32 from SFace.
export const EMBEDDING_BYTES = 512;

export interface Embedding {
  faces: number;
  embedding: Buffer | null;
}

// The face service is down, slow or broken. Never a reason to accept anyone.
export class FaceUnavailable extends Error {}

// The face service answered but would not read the photo (not an image, too big).
export class BadPhoto extends Error {}

@Injectable()
export class FaceClient {
  private readonly url = process.env.FACE_URL ?? 'http://localhost:3201';

  async embed(jpeg: Buffer): Promise<Embedding> {
    const form = new FormData();
    form.append('photo', new Blob([new Uint8Array(jpeg)], { type: 'image/jpeg' }), 'face.jpg');

    let res: Response;
    try {
      res = await fetch(`${this.url}/embed`, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(10_000),
      });
    } catch (e) {
      throw new FaceUnavailable(`face service did not answer: ${(e as Error).message}`);
    }

    if (res.status === 400 || res.status === 413) {
      const body = (await res.json().catch(() => ({}))) as { detail?: string };
      throw new BadPhoto(body.detail ?? `face service said ${res.status}`);
    }
    if (!res.ok) throw new FaceUnavailable(`face service said ${res.status}`);

    const body = (await res.json()) as { faces: number; embedding: string | null };
    const embedding = body.embedding === null ? null : Buffer.from(body.embedding, 'base64');
    if (embedding && embedding.length !== EMBEDDING_BYTES) {
      throw new FaceUnavailable(`embedding is ${embedding.length} bytes, not ${EMBEDDING_BYTES}`);
    }
    return { faces: body.faces, embedding };
  }
}
