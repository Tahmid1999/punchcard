import { generateKeyPairSync, sign } from 'node:crypto';

import { canonical, sha256Hex, SignedFields, verifySignature } from './proof';

// A P-256 key exported the way Android Keystore exports one: SPKI DER.
const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const spki = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');

const fields: SignedFields = {
  challengeId: '6f1c2a5e-0000-4000-8000-000000000001',
  nonce: 'q3v9',
  kind: 'IN',
  lat: '23.780573',
  lng: '90.279239',
  accuracyM: '12.5',
  mock: '0',
  photoSha256: sha256Hex(Buffer.from('jpeg bytes')),
};

const signed = (msg: string) => sign('sha256', Buffer.from(msg), privateKey).toString('base64');

describe('verifySignature', () => {
  it('accepts a signature over the canonical string', () => {
    const msg = canonical(fields);
    expect(verifySignature(spki, msg, signed(msg))).toBe(true);
  });

  it('rejects when any signed field changes', () => {
    const sig = signed(canonical(fields));
    expect(verifySignature(spki, canonical({ ...fields, lat: '23.780574' }), sig)).toBe(false);
    expect(verifySignature(spki, canonical({ ...fields, kind: 'OUT' }), sig)).toBe(false);
  });

  it('treats 23.78 and 23.780 as different, since the phone signed the text', () => {
    const sig = signed(canonical({ ...fields, lat: '23.78' }));
    expect(verifySignature(spki, canonical({ ...fields, lat: '23.780' }), sig)).toBe(false);
  });

  it('rejects a signature from another phone', () => {
    const other = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const msg = canonical(fields);
    const sig = sign('sha256', Buffer.from(msg), other.privateKey).toString('base64');
    expect(verifySignature(spki, msg, sig)).toBe(false);
  });

  it('returns false for garbage instead of throwing', () => {
    expect(verifySignature('bm90IGEga2V5', 'x', 'bm90IGEgc2ln')).toBe(false);
    expect(verifySignature(spki, 'x', '')).toBe(false);
  });

  it('refuses an RSA key even if the signature is valid', () => {
    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const rsaSpki = rsa.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
    const msg = canonical(fields);
    const sig = sign('sha256', Buffer.from(msg), rsa.privateKey).toString('base64');
    expect(verifySignature(rsaSpki, msg, sig)).toBe(false);
  });
});
