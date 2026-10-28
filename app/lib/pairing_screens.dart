import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import 'api.dart';
import 'device.dart';
import 'proof.dart';
import 'store.dart';

class SetupScreen extends StatelessWidget {
  const SetupScreen({super.key, required this.onLink});

  final Future<void> Function(String raw) onLink;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('punchcard')),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('This phone is not paired', style: t.titleLarge),
            const SizedBox(height: 8),
            const Text(
              'At the office, ask the admin to open Employees, pick you and press "pair phone". '
              'Then scan the QR on their screen. It works once and only for 10 minutes.',
            ),
            const SizedBox(height: 8),
            const Text('You need a screen lock and at least one fingerprint on this phone.'),
            const SizedBox(height: 24),
            FilledButton.icon(
              icon: const Icon(Icons.qr_code_scanner),
              label: const Text('Scan pairing QR'),
              onPressed: () async {
                final raw = await Navigator.of(
                  context,
                ).push<String>(MaterialPageRoute(builder: (_) => const ScanScreen()));
                if (raw != null) await onLink(raw);
              },
            ),
          ],
        ),
      ),
    );
  }
}

class ScanScreen extends StatefulWidget {
  const ScanScreen({super.key});

  @override
  State<ScanScreen> createState() => _ScanScreenState();
}

class _ScanScreenState extends State<ScanScreen> {
  bool _done = false;
  String? _wrong;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Scan the admin\'s QR')),
      body: Stack(
        children: [
          MobileScanner(
            onDetect: (capture) {
              for (final b in capture.barcodes) {
                final raw = b.rawValue;
                if (raw == null || _done) continue;
                if (PairLink.parse(raw) == null) {
                  setState(() => _wrong = 'Not a punchcard pairing QR');
                  continue;
                }
                _done = true;
                Navigator.of(context).pop(raw);
              }
            },
          ),
          if (_wrong != null)
            Positioned(
              left: 16,
              right: 16,
              bottom: 32,
              child: Material(
                color: Colors.black87,
                borderRadius: BorderRadius.circular(4),
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Text(_wrong!, style: const TextStyle(color: Colors.white)),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class PairScreen extends StatefulWidget {
  const PairScreen({super.key, required this.link, this.replacing});

  final PairLink link;
  final Pairing? replacing;

  @override
  State<PairScreen> createState() => _PairScreenState();
}

class _PairScreenState extends State<PairScreen> {
  bool _busy = false;
  String? _error;

  Future<void> _pair() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final alias = 'punchcard-${DateTime.now().millisecondsSinceEpoch}';
    var saved = false;
    try {
      final key = await Device.createKey(alias);
      final r = await Api(widget.link.api).pair(widget.link.code, key.publicKey, await Device.model());
      await Pairing(
        api: widget.link.api,
        deviceId: r.deviceId,
        code: r.code,
        name: r.name,
        hardware: key.hardware,
        keyAlias: alias,
      ).save();
      saved = true;
      // The server revoked the old device when it took this one, so its key is no use now.
      final old = widget.replacing;
      if (old != null) await Device.deleteKey(old.keyAlias);
      if (mounted) Navigator.of(context).pop(true);
    } on PlatformException catch (e) {
      setState(() => _error = e.message ?? e.code);
    } on ApiException catch (e) {
      // 410: the code was used already or its 10 minutes ran out.
      setState(
        () => _error = e.status == 410
            ? 'This QR was used already or has expired. Ask for a new one.'
            : e.message,
      );
    } catch (e) {
      setState(() => _error = 'Could not reach ${widget.link.api.host}: $e');
    } finally {
      // A failed pairing leaves the old one, if any, as it was.
      if (!saved) await Device.deleteKey(alias);
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final old = widget.replacing;
    return Scaffold(
      appBar: AppBar(title: const Text('Pair this phone')),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Server', style: t.labelMedium),
            Text(widget.link.api.toString(), style: t.bodyLarge?.copyWith(fontFamily: 'monospace')),
            const SizedBox(height: 16),
            const Text(
              'This makes a signing key inside the phone that only unlocks with your fingerprint, '
              'and sends the server its public half. The private key never leaves the phone.',
            ),
            if (old != null) ...[
              const SizedBox(height: 12),
              Text(
                'This phone is paired to ${old.code} ${old.name}. Pairing again replaces that.',
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ],
            const SizedBox(height: 24),
            FilledButton(
              onPressed: _busy ? null : _pair,
              child: _busy
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Text('Pair'),
            ),
            if (_error != null) ...[
              const SizedBox(height: 16),
              Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ],
          ],
        ),
      ),
    );
  }
}
