import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:punchcard/proof.dart';

// The API's regexes for the same fields (api/src/checkin/checkin.module.ts).
final decimal = RegExp(r'^-?\d{1,3}(\.\d{1,10})?$');
final accuracy = RegExp(r'^\d{1,5}(\.\d{1,3})?$');

SignedFields fields({double lat = 23.78100, double lng = 90.2792, double acc = 12.5, bool mock = false}) =>
    SignedFields(
      challengeId: '0f8fad5b-d9cb-469f-a165-70867728950e',
      nonce: 'nonce-nonce-nonce1',
      kind: 'IN',
      lat: lat,
      lng: lng,
      accuracyM: acc,
      mock: mock,
      photo: Uint8List.fromList(utf8.encode('not really a jpeg')),
    );

void main() {
  test('builds the same canonical string the server checks', () {
    expect(
      fields().canonical(),
      [
        'punchcard-checkin-v1',
        '0f8fad5b-d9cb-469f-a165-70867728950e',
        'nonce-nonce-nonce1',
        'IN',
        '23.781000',
        '90.279200',
        '12.5',
        '0',
        // sha256 of "not really a jpeg", the same bytes the API e2e test uses.
        '21ac2586e213d1f490778a07bf0025a98fc57595863a282372bac594b398322b',
      ].join('\n'),
    );
  });

  test('every number comes out in a shape the api accepts', () {
    for (final f in [
      fields(lat: -33.8688197, lng: 151.2092955, acc: 3),
      fields(lat: 0, lng: -0.0001, acc: 99999.99),
      fields(acc: 250000),
      fields(lat: 89.9999999, lng: -179.9999999, acc: 0.04),
    ]) {
      expect(f.lat, matches(decimal));
      expect(f.lng, matches(decimal));
      expect(f.accuracyM, matches(accuracy));
    }
  });

  test('sends the mock flag as 0 or 1', () {
    expect(fields(mock: true).mock, '1');
    expect(fields().toFields()['mock'], '0');
  });

  group('pairing link', () {
    test('reads the admin QR', () {
      final l = PairLink.parse(
        'punchcard://pair?api=http%3A%2F%2F192.168.68.20%3A3200&code=Q3Jz0Qb7c1n2mVhK-eQ_9w',
      )!;
      expect(l.api.toString(), 'http://192.168.68.20:3200');
      expect(l.code, 'Q3Jz0Qb7c1n2mVhK-eQ_9w');
    });

    test('ignores anything else', () {
      for (final raw in [
        'https://example.com/?code=abc',
        'punchcard://pair?code=Q3Jz0Qb7c1n2mVhK-eQ_9w',
        'punchcard://pair?api=ftp%3A%2F%2Fx&code=Q3Jz0Qb7c1n2mVhK-eQ_9w',
        'punchcard://pair?api=http%3A%2F%2Fx%3A3200&code=short',
        'punchcard://other?api=http%3A%2F%2Fx%3A3200&code=Q3Jz0Qb7c1n2mVhK-eQ_9w',
        'not a url at all',
      ]) {
        expect(PairLink.parse(raw), isNull, reason: raw);
      }
    });
  });
}
