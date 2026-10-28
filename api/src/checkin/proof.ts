import { createHash, createPublicKey, verify } from 'node:crypto';

export interface SignedFields {
  challengeId: string;
  nonce: string;
  kind: string;
  lat: string;
  lng: string;
  accuracyM: string;
  mock: string;
  photoSha256: string;
}

// Built from the strings exactly as the phone sent them. Parsing lat to a number
// and printing it back can change the digits, and then a genuine signature fails.
export function canonical(f: SignedFields): string {
  return [
    'punchcard-checkin-v1',
    f.challengeId,
    f.nonce,
    f.kind,
    f.lat,
    f.lng,
    f.accuracyM,
    f.mock,
    f.photoSha256,
  ].join('\n');
}

export function sha256Hex(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

// publicKey is SPKI DER in base64, signature is the DER ECDSA signature Android's
// SHA256withECDSA returns. Node's verify expects DER for EC keys by default.
export function verifySignature(publicKey: string, message: string, signature: string): boolean {
  try {
    const key = createPublicKey({ key: Buffer.from(publicKey, 'base64'), format: 'der', type: 'spki' });
    if (key.asymmetricKeyType !== 'ec') return false;
    return verify('sha256', Buffer.from(message), key, Buffer.from(signature, 'base64'));
  } catch {
    // A malformed key or signature is a failed check, not a server error.
    return false;
  }
}
