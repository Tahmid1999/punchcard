import { ForbiddenException, GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { LivenessAction, Prisma } from '@prisma/client';
import { randomBytes, randomInt } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';
import { FaceService } from './face.service';
import { MAX_ACCURACY_M, nearestOffice } from './geo';
import { canonical, sha256Hex, SignedFields, verifySignature } from './proof';

const CHALLENGE_TTL_MS = 60 * 1000;
const ACTIONS = Object.values(LivenessAction);

type Checks = Pick<Prisma.AttendanceUncheckedCreateInput, 'signatureOk'> &
  Partial<
    Pick<
      Prisma.AttendanceUncheckedCreateInput,
      'photoOk' | 'locationOk' | 'faceOk' | 'faceScore' | 'officeId' | 'distanceM'
    >
  >;

export interface CheckinInput extends SignedFields {
  deviceId: string;
  signature: string;
  photo: Buffer;
}

@Injectable()
export class CheckinService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly face: FaceService,
  ) {}

  async challenge(deviceId: string) {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device || device.revokedAt) throw new NotFoundException('device is not paired');

    // The server picks the action, so a phone can't keep asking for the easiest one.
    return this.prisma.challenge.create({
      data: {
        deviceId,
        nonce: randomBytes(16).toString('base64url'),
        action: ACTIONS[randomInt(ACTIONS.length)],
        expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
      },
      select: { id: true, nonce: true, action: true, expiresAt: true },
    });
  }

  async checkin(input: CheckinInput) {
    const now = new Date();

    // Claiming the challenge comes first and is one conditional update, so a
    // replayed request finds nothing left to claim. Failures up to here return an
    // error with no row: there is no trusted check-in to record yet.
    const claimed = await this.prisma.challenge.updateMany({
      where: {
        id: input.challengeId,
        deviceId: input.deviceId,
        nonce: input.nonce,
        usedAt: null,
        expiresAt: { gt: now },
      },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) throw new GoneException('challenge is used, expired or unknown');

    const device = await this.prisma.device.findUniqueOrThrow({ where: { id: input.deviceId } });
    if (device.revokedAt) throw new ForbiddenException('device was unpaired');

    const lat = Number(input.lat);
    const lng = Number(input.lng);
    const accuracyM = Number(input.accuracyM);
    const row = {
      employeeId: device.employeeId,
      deviceId: device.id,
      challengeId: input.challengeId,
      kind: input.kind as 'IN' | 'OUT',
      lat,
      lng,
      accuracyM,
      mock: input.mock === '1',
    };

    // From here every outcome is written down. Checks run in order and stop at
    // the first failure; the ones that never ran stay null on the row.
    const reject = (reason: string, checks: Checks) =>
      this.prisma.attendance.create({
        data: { ...row, ...checks, result: 'REJECTED', reason },
      });

    if (!verifySignature(device.publicKey, canonical(input), input.signature)) {
      return reject('signature does not verify', { signatureOk: false });
    }

    if (sha256Hex(input.photo) !== input.photoSha256) {
      return reject('photo is not the one that was signed', { signatureOk: true, photoOk: false });
    }

    const offices = await this.prisma.office.findMany();
    const near = nearestOffice(lat, lng, offices);
    const located = {
      signatureOk: true,
      photoOk: true,
      officeId: near?.office.id,
      distanceM: near?.distance,
    };
    if (!near) return reject('no office is set up', { ...located, locationOk: false });
    if (row.mock) return reject('phone reports a mock location', { ...located, locationOk: false });
    if (accuracyM > MAX_ACCURACY_M) {
      return reject(`gps accuracy ${accuracyM} m is worse than ${MAX_ACCURACY_M} m`, {
        ...located,
        locationOk: false,
      });
    }
    if (near.distance > near.office.radiusM) {
      return reject(`${Math.round(near.distance)} m from the office`, {
        ...located,
        locationOk: false,
      });
    }

    const face = await this.face.match(device.employeeId, input.photo);
    const checked = { ...located, locationOk: true, faceOk: face.ok, faceScore: face.score };
    if (!face.ok) return reject(face.reason ?? 'face does not match', checked);

    return this.prisma.attendance.create({ data: { ...row, ...checked, result: 'ACCEPTED' } });
  }
}
