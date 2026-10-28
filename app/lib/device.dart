import 'dart:async';

import 'package:flutter/services.dart';

/// The Kotlin side in android/app/src/main/kotlin/.../DeviceKey.kt.
class Device {
  static const _channel = MethodChannel('punchcard/device');
  static final _links = StreamController<String>.broadcast();

  static void listen() {
    _channel.setMethodCallHandler((call) async {
      if (call.method == 'link') _links.add(call.arguments as String);
    });
  }

  /// Pairing links that arrive while the app is already open.
  static Stream<String> get links => _links.stream;

  /// The link that launched the app, once.
  static Future<String?> takeLink() => _channel.invokeMethod<String>('takeLink');

  static Future<bool> hasKey(String alias) async =>
      await _channel.invokeMethod<bool>('hasKey', {'alias': alias}) ?? false;

  static Future<void> deleteKey(String alias) => _channel.invokeMethod('deleteKey', {'alias': alias});

  static Future<String> model() async => await _channel.invokeMethod<String>('model') ?? 'unknown';

  /// Makes a new key under [alias]. Throws PlatformException NO_LOCK,
  /// NO_FINGERPRINT or NO_SENSOR when the phone cannot hold such a key.
  static Future<({String publicKey, bool hardware})> createKey(String alias) async {
    final r = (await _channel.invokeMapMethod<String, Object>('createKey', {'alias': alias}))!;
    return (publicKey: r['publicKey'] as String, hardware: r['hardware'] as bool);
  }

  /// Shows the fingerprint prompt and signs [message] with the key once it passes.
  /// Codes: CANCELLED, KEY_INVALIDATED, NO_KEY, BIOMETRIC.
  static Future<String> sign(
    String alias,
    String message, {
    required String title,
    required String subtitle,
  }) async {
    final sig = await _channel.invokeMethod<String>('sign', {
      'alias': alias,
      'message': message,
      'title': title,
      'subtitle': subtitle,
    });
    return sig!;
  }
}
