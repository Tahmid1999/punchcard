import 'package:shared_preferences/shared_preferences.dart';

/// What the phone remembers after pairing. None of it is secret: the private
/// key stays in the Keystore and these only say where to send things.
class Pairing {
  Pairing({
    required this.api,
    required this.deviceId,
    required this.code,
    required this.name,
    required this.hardware,
    required this.keyAlias,
  });

  final Uri api;
  final String deviceId;
  final String code;
  final String name;
  final bool hardware;
  final String keyAlias;

  static Future<Pairing?> load() async {
    final p = await SharedPreferences.getInstance();
    final api = p.getString('api');
    final deviceId = p.getString('deviceId');
    final keyAlias = p.getString('keyAlias');
    if (api == null || deviceId == null || keyAlias == null) return null;
    return Pairing(
      api: Uri.parse(api),
      deviceId: deviceId,
      code: p.getString('code') ?? '',
      name: p.getString('name') ?? '',
      hardware: p.getBool('hardware') ?? false,
      keyAlias: keyAlias,
    );
  }

  Future<void> save() async {
    final p = await SharedPreferences.getInstance();
    await p.setString('api', api.toString());
    await p.setString('deviceId', deviceId);
    await p.setString('code', code);
    await p.setString('name', name);
    await p.setBool('hardware', hardware);
    await p.setString('keyAlias', keyAlias);
  }

  static Future<void> clear() async => (await SharedPreferences.getInstance()).clear();
}

/// The last check-in this phone made, shown on the home screen.
class LastPunch {
  LastPunch(this.kind, this.result, this.reason, this.at);

  final String kind;
  final String result;
  final String? reason;
  final DateTime at;

  static Future<LastPunch?> load() async {
    final p = await SharedPreferences.getInstance();
    final at = p.getString('last.at');
    if (at == null) return null;
    return LastPunch(
      p.getString('last.kind')!,
      p.getString('last.result')!,
      p.getString('last.reason'),
      DateTime.parse(at),
    );
  }

  Future<void> save() async {
    final p = await SharedPreferences.getInstance();
    await p.setString('last.kind', kind);
    await p.setString('last.result', result);
    if (reason == null) {
      await p.remove('last.reason');
    } else {
      await p.setString('last.reason', reason!);
    }
    await p.setString('last.at', at.toIso8601String());
  }
}
