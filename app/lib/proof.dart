import 'dart:typed_data';

import 'package:crypto/crypto.dart';

/// The fields the phone signs. They are kept as the exact strings that go over
/// the wire: the server verifies the signature against what it received, so a
/// number formatted one way here and parsed back another way there would break it.
class SignedFields {
  SignedFields({
    required this.challengeId,
    required this.nonce,
    required this.kind,
    required double lat,
    required double lng,
    required double accuracyM,
    required bool mock,
    required Uint8List photo,
  }) : lat = lat.toStringAsFixed(6),
       lng = lng.toStringAsFixed(6),
       // The API takes at most 5 digits before the point.
       accuracyM = accuracyM.clamp(0, 99999).toStringAsFixed(1),
       mock = mock ? '1' : '0',
       photoSha256 = sha256.convert(photo).toString();

  final String challengeId;
  final String nonce;
  final String kind;
  final String lat;
  final String lng;
  final String accuracyM;
  final String mock;
  final String photoSha256;

  /// Same order and format as api/src/checkin/proof.ts.
  String canonical() =>
      ['punchcard-checkin-v1', challengeId, nonce, kind, lat, lng, accuracyM, mock, photoSha256].join('\n');

  Map<String, String> toFields() => {
    'challengeId': challengeId,
    'nonce': nonce,
    'kind': kind,
    'lat': lat,
    'lng': lng,
    'accuracyM': accuracyM,
    'mock': mock,
    'photoSha256': photoSha256,
  };
}

/// What the admin's pairing QR holds: `punchcard://pair?api=<url>&code=<code>`.
class PairLink {
  PairLink(this.api, this.code);

  final Uri api;
  final String code;

  static PairLink? parse(String raw) {
    final uri = Uri.tryParse(raw.trim());
    if (uri == null || uri.scheme != 'punchcard' || uri.host != 'pair') return null;
    final api = Uri.tryParse(uri.queryParameters['api'] ?? '');
    final code = uri.queryParameters['code'] ?? '';
    if (api == null || !(api.isScheme('http') || api.isScheme('https')) || api.host.isEmpty) {
      return null;
    }
    // base64url, 16 random bytes.
    if (!RegExp(r'^[A-Za-z0-9_-]{16,64}$').hasMatch(code)) return null;
    return PairLink(api, code);
  }
}

String shortId(String id) => id.length > 8 ? id.substring(0, 8) : id;
