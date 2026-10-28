import 'package:flutter/material.dart';

import 'checkin_screen.dart';
import 'device.dart';
import 'proof.dart';
import 'store.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.pairing, required this.onUnpaired});

  final Pairing pairing;
  final Future<void> Function() onUnpaired;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  LastPunch? _last;

  @override
  void initState() {
    super.initState();
    _loadLast();
  }

  Future<void> _loadLast() async {
    final l = await LastPunch.load();
    if (mounted) setState(() => _last = l);
  }

  Future<void> _punch(String kind) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => CheckinScreen(pairing: widget.pairing, kind: kind),
      ),
    );
    await _loadLast();
  }

  Future<void> _unpair() async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Unpair this phone?'),
        content: const Text(
          'This deletes the signing key from this phone. You will need a new QR from the admin to check in again.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Keep')),
          TextButton(onPressed: () => Navigator.pop(c, true), child: const Text('Unpair')),
        ],
      ),
    );
    if (yes != true) return;
    await Device.deleteKey(widget.pairing.keyAlias);
    await Pairing.clear();
    await widget.onUnpaired();
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.pairing;
    final t = Theme.of(context).textTheme;
    final mono = t.bodySmall?.copyWith(fontFamily: 'monospace');
    final last = _last;

    return Scaffold(
      appBar: AppBar(
        title: const Text('punchcard'),
        actions: [
          PopupMenuButton<String>(
            onSelected: (_) => _unpair(),
            itemBuilder: (_) => [const PopupMenuItem(value: 'unpair', child: Text('Unpair this phone'))],
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(p.name, style: t.headlineSmall),
          Text(p.code, style: t.titleMedium?.copyWith(fontFamily: 'monospace')),
          const SizedBox(height: 12),
          Text('server ${p.api.host}:${p.api.port}', style: mono),
          Text('device ${shortId(p.deviceId)}', style: mono),
          Text(
            p.hardware ? 'key in secure hardware' : 'key in software keystore (no secure hardware)',
            style: mono,
          ),
          const SizedBox(height: 28),
          SizedBox(
            height: 56,
            child: FilledButton(onPressed: () => _punch('IN'), child: const Text('Check in')),
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: 56,
            child: OutlinedButton(onPressed: () => _punch('OUT'), child: const Text('Check out')),
          ),
          const SizedBox(height: 28),
          if (last != null) ...[
            Text('Last from this phone', style: t.labelMedium),
            const SizedBox(height: 4),
            Text(
              '${last.kind} ${last.result.toLowerCase()} · ${_when(last.at)}',
              style: t.bodyLarge?.copyWith(
                color: last.result == 'ACCEPTED' ? null : Theme.of(context).colorScheme.error,
              ),
            ),
            if (last.reason != null) Text(last.reason!),
          ],
        ],
      ),
    );
  }
}

String _two(int n) => n.toString().padLeft(2, '0');

String _when(DateTime at) {
  final l = at.toLocal();
  return '${l.year}-${_two(l.month)}-${_two(l.day)} ${_two(l.hour)}:${_two(l.minute)}';
}
