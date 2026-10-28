import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;

import 'liveness.dart';
import 'proof.dart';

class ApiException implements Exception {
  ApiException(this.status, this.message);

  final int status;
  final String message;

  @override
  String toString() => message;
}

class Challenge {
  Challenge(this.id, this.nonce, this.action, this.expiresAt);

  final String id;
  final String nonce;
  final LivenessAction action;
  final DateTime expiresAt;
}

class CheckinResult {
  CheckinResult(this.result, this.reason, this.at);

  final String result;
  final String? reason;
  final DateTime at;

  bool get accepted => result == 'ACCEPTED';
}

class Api {
  Api(this.base);

  final Uri base;
  static const _timeout = Duration(seconds: 20);

  Uri _url(String path) => base.replace(path: '${base.path.replaceAll(RegExp(r'/$'), '')}$path');

  Future<Map<String, dynamic>> _read(http.Response res) async {
    final body = res.body.isEmpty ? <String, dynamic>{} : jsonDecode(res.body) as Map<String, dynamic>;
    if (res.statusCode >= 400) {
      final m = body['message'];
      throw ApiException(res.statusCode, m is List ? m.join(', ') : '${m ?? 'api said ${res.statusCode}'}');
    }
    return body;
  }

  Future<Map<String, dynamic>> _post(String path, Map<String, Object> json) async {
    final res = await http
        .post(_url(path), headers: {'content-type': 'application/json'}, body: jsonEncode(json))
        .timeout(_timeout);
    return _read(res);
  }

  /// Returns the new deviceId and the employee it now belongs to.
  Future<({String deviceId, String code, String name})> pair(
    String pairingCode,
    String publicKey,
    String model,
  ) async {
    final r = await _post('/devices/pair', {'code': pairingCode, 'publicKey': publicKey, 'model': model});
    final e = r['employee'] as Map<String, dynamic>;
    return (deviceId: r['deviceId'] as String, code: e['code'] as String, name: e['name'] as String);
  }

  Future<Challenge> challenge(String deviceId) async {
    final r = await _post('/checkin/challenge', {'deviceId': deviceId});
    return Challenge(
      r['id'] as String,
      r['nonce'] as String,
      LivenessAction.fromWire(r['action'] as String),
      DateTime.parse(r['expiresAt'] as String),
    );
  }

  Future<CheckinResult> checkin({
    required String deviceId,
    required SignedFields fields,
    required String signature,
    required Uint8List photo,
  }) async {
    final req = http.MultipartRequest('POST', _url('/checkin'))
      ..fields.addAll({'deviceId': deviceId, 'signature': signature, ...fields.toFields()})
      ..files.add(http.MultipartFile.fromBytes('photo', photo, filename: 'face.jpg'));
    final res = await http.Response.fromStream(await req.send().timeout(_timeout));
    final r = await _read(res);
    return CheckinResult(r['result'] as String, r['reason'] as String?, DateTime.parse(r['at'] as String));
  }
}
