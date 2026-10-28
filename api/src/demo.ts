import 'dotenv/config';

import { generateKeyPairSync, randomBytes } from 'node:crypto';

import { PrismaService } from './prisma/prisma.service';

// Fills an empty database with made-up people and a month of attendance, so the
// admin panel has something to show. These rows are written straight to the
// tables: none of them went through a real check-in, and no face is enrolled.
// Run on a fresh database only: `npm run demo`.

const PEOPLE = [
  ['E-001', 'Rahim Uddin'],
  ['E-002', 'Nusrat Jahan'],
  ['E-003', 'Tanvir Hasan'],
  ['E-004', 'Farzana Akter'],
  ['E-005', 'Sabbir Ahmed'],
  ['E-006', 'Mitu Rani Das'],
] as const;

const OFFICE = { name: 'Mirpur office', lat: 23.8069, lng: 90.3687, radiusM: 80 };
const DHAKA_MS = 6 * 60 * 60 * 1000;

// Small deterministic generator so every run gives the same month.
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

const prisma = new PrismaService();

async function main() {
  if ((await prisma.employee.count()) > 0) {
    throw new Error('database already has employees; the demo seed only fills an empty one');
  }

  const office = await prisma.office.create({ data: OFFICE });
  const today = new Date(Date.now() + DHAKA_MS);
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();

  for (const [code, name] of PEOPLE) {
    const employee = await prisma.employee.create({ data: { code, name } });
    const key = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).publicKey;
    const device = await prisma.device.create({
      data: {
        employeeId: employee.id,
        publicKey: key.export({ format: 'der', type: 'spki' }).toString('base64'),
        model: rand() < 0.5 ? 'samsung SM-A155F' : 'Xiaomi 23129RN51X',
        pairedAt: new Date(Date.UTC(y, m, 1, 2, 0)),
      },
    });

    for (let day = 1; day <= today.getUTCDate(); day++) {
      // Friday off; one in ten days off for anyone.
      if (new Date(Date.UTC(y, m, day)).getUTCDay() === 5 || rand() < 0.1) continue;

      // 08:40 to 09:35 in, 17:00 to 18:10 out, Dhaka time.
      const inAt = Date.UTC(y, m, day, 8, 40) - DHAKA_MS + Math.floor(rand() * 55) * 60_000;
      const outAt = Date.UTC(y, m, day, 17, 0) - DHAKA_MS + Math.floor(rand() * 70) * 60_000;
      const punches: [number, 'IN' | 'OUT'][] = [[inAt, 'IN']];
      if (day < today.getUTCDate() || today.getUTCHours() >= 18) punches.push([outAt, 'OUT']);

      for (const [at, kind] of punches) {
        // About one punch in twelve is first rejected, then retried a minute later.
        if (rand() < 0.08) {
          const far = rand() < 0.5;
          await punch(employee.id, device.id, office.id, at - 60_000, kind, {
            result: 'REJECTED',
            locationOk: far ? false : true,
            faceOk: far ? null : false,
            faceScore: far ? null : 0.18 + rand() * 0.15,
            distanceM: far ? 140 + rand() * 300 : 20 + rand() * 40,
            reason: far ? null : 'face does not match',
          });
        }
        await punch(employee.id, device.id, office.id, at, kind, {
          result: 'ACCEPTED',
          locationOk: true,
          faceOk: true,
          faceScore: 0.55 + rand() * 0.3,
          distanceM: 8 + rand() * 50,
          reason: null,
        });
      }
    }
  }
  console.log(
    `demo: ${PEOPLE.length} employees, ${await prisma.attendance.count()} attendance rows`,
  );
}

async function punch(
  employeeId: string,
  deviceId: string,
  officeId: string,
  at: number,
  kind: 'IN' | 'OUT',
  r: {
    result: 'ACCEPTED' | 'REJECTED';
    locationOk: boolean;
    faceOk: boolean | null;
    faceScore: number | null;
    distanceM: number;
    reason: string | null;
  },
) {
  const challenge = await prisma.challenge.create({
    data: {
      deviceId,
      nonce: randomBytes(16).toString('base64url'),
      action: 'BLINK',
      expiresAt: new Date(at + 60_000),
      usedAt: new Date(at),
    },
  });
  await prisma.attendance.create({
    data: {
      employeeId,
      deviceId,
      officeId,
      challengeId: challenge.id,
      kind,
      at: new Date(at),
      lat: OFFICE.lat + (rand() - 0.5) * 0.0006,
      lng: OFFICE.lng + (rand() - 0.5) * 0.0006,
      accuracyM: 5 + Math.round(rand() * 25),
      mock: false,
      signatureOk: true,
      photoOk: true,
      ...r,
      reason: r.reason ?? (r.locationOk ? null : `${Math.round(r.distanceM)} m from the office`),
    },
  });
}

main().finally(() => prisma.$disconnect());
