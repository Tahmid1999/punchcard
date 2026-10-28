import { Injectable } from '@nestjs/common';

export interface FaceResult {
  ok: boolean;
  score: number | null;
  reason?: string;
}

@Injectable()
export class FaceService {
  // TODO(stage 2): post the jpeg to the face service, which finds one face with
  // YuNet, embeds it with SFace and returns the best cosine score against this
  // employee's references. Until then every face check fails closed.
  async match(_employeeId: string, _jpeg: Buffer): Promise<FaceResult> {
    return { ok: false, score: null, reason: 'face service not built yet' };
  }
}
