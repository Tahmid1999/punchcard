import { INestApplication } from '@nestjs/common';
import { generateKeyPairSync, KeyObject, sign } from 'node:crypto';
import request from 'supertest';

import { hashPassword } from '../src/auth/password';
import { canonical, sha256Hex } from '../src/checkin/proof';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, face, faceAt, REFERENCE, resetDb } from './helpers/app';

// Office in Mirpur. 23.78100 is about 50 m north of it, 23.79000 about 1 km.
const OFFICE = { name: 'Mirpur', lat: 23.7805, lng: 90.2792, radiusM: 80 };
// The face service is stubbed, so the bytes only matter for the signed hash.
const PHOTO = Buffer.from('not really a jpeg');

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
    face.next = { faces: 1, embedding: REFERENCE };
    face.down = false;
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
    await http()
      .post(`/employees/${employeeId}/faces`)
      .set('Authorization', auth)
      .attach('photo', PHOTO, 'reference.jpg')
      .expect(201);
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
    face.next = { faces: 1, embedding: faceAt(0.12) };
    const res = await checkIn(phone);
    expect(res.body.reason).toBe('face does not match');
    const row = await prisma.attendance.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row).toMatchObject({ result: 'REJECTED', locationOk: true, faceOk: false });
    expect(row.faceScore).toBeCloseTo(0.12, 5);
  });

  it('accepts just over the threshold and not just under', async () => {
    const phone = await pairPhone();
    face.next = { faces: 1, embedding: faceAt(0.37) };
    expect((await checkIn(phone)).body.result).toBe('ACCEPTED');
    face.next = { faces: 1, embedding: faceAt(0.35) };
    expect((await checkIn(phone)).body.result).toBe('REJECTED');
  });

  it('scores against the closest of several references', async () => {
    const phone = await pairPhone();
    face.next = { faces: 1, embedding: faceAt(0.9) };
    await http()
      .post(`/employees/${employeeId}/faces`)
      .set('Authorization', auth)
      .attach('photo', PHOTO, 'second.jpg')
      .expect(201);
    face.next = { faces: 1, embedding: faceAt(0.5) };
    const res = await checkIn(phone);
    const row = await prisma.attendance.findUniqueOrThrow({ where: { id: res.body.id } });
    // cos(0.5 vs 0.9) is 0.5*0.9 + sqrt(0.75)*sqrt(0.19), about 0.83, beating 0.5 against REFERENCE.
    expect(row.faceScore).toBeCloseTo(0.5 * 0.9 + Math.sqrt(0.75 * 0.19), 5);
  });

  it('rejects when the face service is down, after the location passed', async () => {
    const phone = await pairPhone();
    face.down = true;
    const res = await checkIn(phone);
    expect(res.body).toMatchObject({ result: 'REJECTED', reason: 'face service unavailable' });
    const row = await prisma.attendance.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row).toMatchObject({ locationOk: true, faceOk: false, faceScore: null });
  });

  it('rejects a photo with two faces or none', async () => {
    const phone = await pairPhone();
    face.next = { faces: 2, embedding: null };
    expect((await checkIn(phone)).body.reason).toBe('2 faces in the photo');
    face.next = { faces: 0, embedding: null };
    expect((await checkIn(phone)).body.reason).toBe('no face in the photo');
  });

  it('rejects an employee with no reference face', async () => {
    const phone = await pairPhone();
    await prisma.faceTemplate.deleteMany();
    expect((await checkIn(phone)).body.reason).toBe('no reference face on file');
  });

  it('will not enrol a reference with no face or when the service is down', async () => {
    const enrol = () =>
      http()
        .post(`/employees/${employeeId}/faces`)
        .set('Authorization', auth)
        .attach('photo', PHOTO, 'reference.jpg');
    face.next = { faces: 0, embedding: null };
    expect((await enrol().expect(400)).body.message).toBe('no face in the photo');
    face.down = true;
    await enrol().expect(503);
    expect(await prisma.faceTemplate.count()).toBe(1);
  });

  it('lists and deletes reference faces, admin only', async () => {
    const { body: list } = await http()
      .get(`/employees/${employeeId}/faces`)
      .set('Authorization', auth)
      .expect(200);
    expect(list).toHaveLength(1);
    expect(list[0]).not.toHaveProperty('embedding');

    await http().delete(`/employees/${employeeId}/faces/${list[0].id}`).expect(401);
    await http()
      .delete(`/employees/${employeeId}/faces/${list[0].id}`)
      .set('Authorization', auth)
      .expect(204);
    await http()
      .delete(`/employees/${employeeId}/faces/${list[0].id}`)
      .set('Authorization', auth)
      .expect(404);
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
