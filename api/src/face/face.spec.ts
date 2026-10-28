import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';

import { BadPhoto, FaceClient, FaceUnavailable } from './face.client';
import { cosine } from './face.service';

// A unit vector whose cosine with the first axis is `c`.
function vec(c: number): Buffer {
  const b = Buffer.alloc(512);
  b.writeFloatLE(c, 0);
  b.writeFloatLE(Math.sqrt(1 - c * c), 4);
  return b;
}

describe('cosine', () => {
  it('is 1 for the same vector and the given value against the axis', () => {
    expect(cosine(vec(1), vec(1))).toBeCloseTo(1, 6);
    expect(cosine(vec(1), vec(0.4))).toBeCloseTo(0.4, 6);
  });

  it('reads a buffer that does not start on a 4-byte boundary', () => {
    const shifted = Buffer.concat([Buffer.alloc(1), vec(0.4)]).subarray(1);
    expect(shifted.byteOffset % 4).not.toBe(0);
    expect(cosine(vec(1), shifted)).toBeCloseTo(0.4, 6);
  });
});

describe('FaceClient', () => {
  let server: Server;
  let reply: { status: number; body: unknown };

  beforeAll(async () => {
    server = createServer((req, res) => {
      req.resume();
      req.on('end', () => {
        res.writeHead(reply.status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(reply.body));
      });
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    process.env.FACE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    delete process.env.FACE_URL;
    server.close();
  });

  it('decodes the embedding', async () => {
    reply = { status: 200, body: { faces: 1, embedding: vec(0.4).toString('base64') } };
    const got = await new FaceClient().embed(Buffer.from('jpeg'));
    expect(got.faces).toBe(1);
    expect(cosine(vec(1), got.embedding!)).toBeCloseTo(0.4, 6);
  });

  it('passes on a count with no embedding', async () => {
    reply = { status: 200, body: { faces: 2, embedding: null } };
    expect(await new FaceClient().embed(Buffer.from('jpeg'))).toEqual({
      faces: 2,
      embedding: null,
    });
  });

  it('turns a 400 into BadPhoto with the reason', async () => {
    reply = { status: 400, body: { detail: 'not an image OpenCV can read' } };
    await expect(new FaceClient().embed(Buffer.from('x'))).rejects.toThrow(
      new BadPhoto('not an image OpenCV can read'),
    );
  });

  it('treats a 500 and a short embedding as unavailable', async () => {
    reply = { status: 500, body: {} };
    await expect(new FaceClient().embed(Buffer.from('x'))).rejects.toBeInstanceOf(FaceUnavailable);
    reply = { status: 200, body: { faces: 1, embedding: Buffer.alloc(16).toString('base64') } };
    await expect(new FaceClient().embed(Buffer.from('x'))).rejects.toBeInstanceOf(FaceUnavailable);
  });

  it('treats a closed port as unavailable', async () => {
    const url = process.env.FACE_URL;
    process.env.FACE_URL = 'http://127.0.0.1:1';
    await expect(new FaceClient().embed(Buffer.from('x'))).rejects.toBeInstanceOf(FaceUnavailable);
    process.env.FACE_URL = url;
  });
});
