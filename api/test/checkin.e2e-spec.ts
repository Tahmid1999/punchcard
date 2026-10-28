import { INestApplication } from '@nestjs/common';
import { generateKeyPairSync, KeyObject, sign } from 'node:crypto';
import request from 'supertest';

import { hashPassword } from '../src/auth/password';
import { canonical, sha256Hex } from '../src/checkin/proof';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, face, resetDb } from './helpers/app';

// Office in Mirpur. 23.78100 is about 50 m north of it, 23.79000 about 1 km.
const OFFICE = { name: 'Mirpur', lat: 23.7805, lng: 90.2792, radiusM: 80 };
const PHOTO = Buffer.from('not really a jpeg, the face check is stubbed');

interface Phone {
  deviceId: string;
  key: KeyObject;
}

describe('pair a phone and check in', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let auth: string;
  let employeeId: string;

  const http = () => request(app.getHttpServer());

  async function pairPhone(): Promise<Phone> {
    const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const { body: pairing } = await http()
      .post(`/employees/${employeeId}/pairing`)
      .set('Authorization', auth)
      .expect(201);
    const { body } = await http()
      .post('/devices/pair')
      .send({
        code: pairing.code,
        publicKey: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
        model: 'test phone',
      })
      .expect(201);
    return { deviceId: body.deviceId, key: privateKey };
  }

  // Signs the way the app will: the canonical string over the exact field text.
  async function checkIn(
    phone: Phone,
    over: Partial<Record<string, string>> = {},
    opts: { photo?: Buffer; signWith?: KeyObject } = {},
  ) {
    const { body: ch } = await http()
      .post('/checkin/challenge')
      .send({ deviceId: phone.deviceId })
      .expect(201);
    const fields = {
      challengeId: ch.id,
      nonce: ch.nonce,
      kind: 'IN',
      lat: '23.78100',
      lng: '90.27920',
      accuracyM: '12.5',
      mock: '0',
      photoSha256: sha256Hex(PHOTO),
      ...over,
    };
    const signature = sign(
      'sha256',
      Buffer.from(canonical(fields)),
      opts.signWith ?? phone.key,
    ).toString('base64');

    const req = http()
      .post('/checkin')
      .field('deviceId', phone.deviceId)
      .field('signature', signature);
    for (const [k, v] of Object.entries(fields)) req.field(k, v);
    return req.attach('photo', opts.photo ?? PHOTO, 'face.jpg').expect(200);
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDb(prisma);
    face.next = { ok: true, score: 0.71 };
    await prisma.admin.create({
      data: { email: 'admin@example.com', passwordHash: await hashPassword('pw') },
    });
    const { body } = await http()
      .post('/auth/login')
      .send({ email: 'admin@example.com', password: 'pw' })
      .expect(200);
    auth = `Bearer ${body.token}`;
    await http().post('/offices').set('Authorization', auth).send(OFFICE).expect(201);
    const { body: emp } = await http()
      .post('/employees')
      .set('Authorization', auth)
      .send({ code: 'E-001', name: 'Rahim Uddin' })
      .expect(201);
    employeeId = emp.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('accepts a signed check-in from inside the office', async () => {
    const phone = await pairPhone();
    const res = await checkIn(phone);
    expect(res.body.result).toBe('ACCEPTED');

    const row = await prisma.attendance.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row).toMatchObject({ signatureOk: true, photoOk: true, locationOk: true, faceOk: true });
    expect(row.distanceM).toBeGreaterThan(40);
    expect(row.distanceM).toBeLessThan(80);
  });

  it('refuses the same challenge twice', async () => {
    const phone = await pairPhone();
    const { body: ch } = await http().post('/checkin/challenge').send({ deviceId: phone.deviceId });
    await prisma.challenge.update({ where: { id: ch.id }, data: { usedAt: new Date() } });

    const fields = {
      challengeId: ch.id,
      nonce: ch.nonce,
      kind: 'IN',
      lat: '23.78100',
      lng: '90.27920',
      accuracyM: '12.5',
      mock: '0',
      photoSha256: sha256Hex(PHOTO),
    };
    const req = http()
      .post('/checkin')
      .field('deviceId', phone.deviceId)
      .field(
        'signature',
        sign('sha256', Buffer.from(canonical(fields)), phone.key).toString('base64'),
      );
    for (const [k, v] of Object.entries(fields)) req.field(k, v);
    await req.attach('photo', PHOTO, 'face.jpg').expect(410);
    expect(await prisma.attendance.count()).toBe(0);
  });

  it('records a signature from another key as rejected', async () => {
    const phone = await pairPhone();
    const other = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey;
    const res = await checkIn(phone, {}, { signWith: other });
    expect(res.body).toMatchObject({ result: 'REJECTED', reason: 'signature does not verify' });

    const row = await prisma.attendance.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row).toMatchObject({
      signatureOk: false,
      photoOk: null,
      locationOk: null,
      faceOk: null,
    });
  });

  it('rejects a photo swapped after signing', async () => {
    const phone = await pairPhone();
    const res = await checkIn(phone, {}, { photo: Buffer.from('someone else') });
    expect(res.body.reason).toBe('photo is not the one that was signed');
  });

  it('rejects a check-in a kilometre away and says how far', async () => {
    const phone = await pairPhone();
    const res = await checkIn(phone, { lat: '23.79000' });
    expect(res.body.result).toBe('REJECTED');
    expect(res.body.reason).toMatch(/^\d+ m from the office$/);
  });

  it('rejects a mock location and a vague fix', async () => {
    const phone = await pairPhone();
    expect((await checkIn(phone, { mock: '1' })).body.reason).toBe('phone reports a mock location');
    expect((await checkIn(phone, { accuracyM: '250' })).body.reason).toMatch(/accuracy 250 m/);
  });

  it('rejects when the face does not match, keeping the score', async () => {
    const phone = await pairPhone();
    face.next = { ok: false, score: 0.12, reason: 'face does not match' };
    const res = await checkIn(phone);
    const row = await prisma.attendance.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row).toMatchObject({
      result: 'REJECTED',
      locationOk: true,
      faceOk: false,
      faceScore: 0.12,
    });
  });

  it('ends the old phone when a new one is paired', async () => {
    const first = await pairPhone();
    await pairPhone();
    await http().post('/checkin/challenge').send({ deviceId: first.deviceId }).expect(404);
  });

  it('will not pair twice with one code', async () => {
    const { body: pairing } = await http()
      .post(`/employees/${employeeId}/pairing`)
      .set('Authorization', auth)
      .expect(201);
    const pub = () =>
      generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
        .publicKey.export({ format: 'der', type: 'spki' })
        .toString('base64');
    await http().post('/devices/pair').send({ code: pairing.code, publicKey: pub() }).expect(201);
    await http().post('/devices/pair').send({ code: pairing.code, publicKey: pub() }).expect(410);
  });

  it('refuses an rsa key at pairing', async () => {
    const { body: pairing } = await http()
      .post(`/employees/${employeeId}/pairing`)
      .set('Authorization', auth);
    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 })
      .publicKey.export({ format: 'der', type: 'spki' })
      .toString('base64');
    await http().post('/devices/pair').send({ code: pairing.code, publicKey: rsa }).expect(400);
  });

  it('keeps the admin routes behind a token', async () => {
    await http().get('/attendance').expect(401);
    await http().get('/employees').set('Authorization', 'Bearer nope').expect(401);
  });
});
