import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { BadPhoto, EMBEDDING_BYTES, FaceClient, FaceUnavailable } from './face.client';

export interface FaceResult {
  ok: boolean;
  score: number | null;
  reason?: string;
}

// The face service returns unit-length vectors, so cosine similarity is the dot
// product. DataView because a Buffer from the pool need not start on a 4-byte
// boundary, which a Float32Array view would need.
export function cosine(a: Uint8Array, b: Uint8Array): number {
  const x = new DataView(a.buffer, a.byteOffset, EMBEDDING_BYTES);
  const y = new DataView(b.buffer, b.byteOffset, EMBEDDING_BYTES);
  let dot = 0;
  for (let i = 0; i < EMBEDDING_BYTES; i += 4) dot += x.getFloat32(i, true) * y.getFloat32(i, true);
  return dot;
}

function facesFound(count: number): string {
  return count === 0 ? 'no face in the photo' : `${count} faces in the photo`;
}

@Injectable()
export class FaceService {
  private readonly threshold = Number(process.env.FACE_THRESHOLD ?? 0.363);

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: FaceClient,
  ) {
    if (!(this.threshold > 0 && this.threshold < 1)) {
      throw new Error(`FACE_THRESHOLD must be between 0 and 1, got ${process.env.FACE_THRESHOLD}`);
    }
  }

  // Only the embedding is kept, not the photo. 512 bytes per reference is all a
  // match needs, and it is less to lose than a folder of employees' faces.
  async enrol(employeeId: string, jpeg: Buffer) {
    let found;
    try {
      found = await this.client.embed(jpeg);
    } catch (e) {
      if (e instanceof BadPhoto) throw new BadRequestException(e.message);
      if (e instanceof FaceUnavailable) throw new ServiceUnavailableException(e.message);
      throw e;
    }
    if (!found.embedding) throw new BadRequestException(facesFound(found.faces));

    return this.prisma.faceTemplate.create({
      // Prisma wants a Uint8Array over a plain ArrayBuffer; a Buffer may sit on a shared pool.
      data: { employeeId, embedding: new Uint8Array(found.embedding) },
      select: { id: true, createdAt: true },
    });
  }

  // Every way this can go wrong ends in ok: false. The score is the best one
  // against any of the employee's references, kept even on a mismatch so the
  // admin can see how close it was.
  async match(employeeId: string, jpeg: Buffer): Promise<FaceResult> {
    const refs = await this.prisma.faceTemplate.findMany({ where: { employeeId } });
    if (refs.length === 0) return { ok: false, score: null, reason: 'no reference face on file' };

    let found;
    try {
      found = await this.client.embed(jpeg);
    } catch (e) {
      if (e instanceof BadPhoto) return { ok: false, score: null, reason: e.message };
      if (e instanceof FaceUnavailable) {
        return { ok: false, score: null, reason: 'face service unavailable' };
      }
      throw e;
    }
    if (!found.embedding) return { ok: false, score: null, reason: facesFound(found.faces) };

    const score = Math.max(...refs.map((r) => cosine(r.embedding, found.embedding!)));
    if (score < this.threshold) return { ok: false, score, reason: 'face does not match' };
    return { ok: true, score };
  }
}
