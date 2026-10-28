import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'device.dart';
import 'home_screen.dart';
import 'pairing_screens.dart';
import 'proof.dart';
import 'store.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  // Liveness reads head angles off the front camera, which assumes upright.
  SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  Device.listen();
  runApp(const PunchcardApp());
}

class PunchcardApp extends StatelessWidget {
  const PunchcardApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'punchcard',
      theme: ThemeData(colorSchemeSeed: const Color(0xFF2B4C3F)),
      home: const Root(),
    );
  }
}

class Root extends StatefulWidget {
  const Root({super.key});

  @override
  State<Root> createState() => _RootState();
}

class _RootState extends State<Root> {
  Pairing? _pairing;
  bool _loading = true;
  StreamSubscription<String>? _links;

  @override
  void initState() {
    super.initState();
    _reload();
    _links = Device.links.listen(_openLink);
    Device.takeLink().then((l) {
      if (l != null) _openLink(l);
    });
  }

  @override
  void dispose() {
    _links?.cancel();
    super.dispose();
  }

  Future<void> _reload() async {
    final p = await Pairing.load();
    // Prefs without the key (app data restored to a new phone, say) is not a pairing.
    final ok = p != null && await Device.hasKey(p.keyAlias);
    setState(() {
      _pairing = ok ? p : null;
      _loading = false;
    });
  }

  Future<void> _openLink(String raw) async {
    final link = PairLink.parse(raw);
    if (link == null || !mounted) return;
    final paired = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => PairScreen(link: link, replacing: _pairing),
      ),
    );
    if (paired == true) await _reload();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final p = _pairing;
    if (p == null) return SetupScreen(onLink: _openLink);
    return HomeScreen(key: ValueKey(p.deviceId), pairing: p, onUnpaired: _reload);
  }
}
