import 'dart:async';
import 'dart:io';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_mlkit_face_detection/google_mlkit_face_detection.dart';

import 'api.dart';
import 'device.dart';
import 'liveness.dart';
import 'proof.dart';
import 'store.dart';

// ML Kit's headEulerAngleY, flipped if needed so that positive means the person
// turned to their own left. Checked by hand on the front camera of the ANE-LX2.
const yawSign = 1.0;

enum _Stage { starting, liveness, working, finished, failed }

class CheckinScreen extends StatefulWidget {
  const CheckinScreen({super.key, required this.pairing, required this.kind});

  final Pairing pairing;
  final String kind;

  @override
  State<CheckinScreen> createState() => _CheckinScreenState();
}

class _CheckinScreenState extends State<CheckinScreen> {
  late final Api _api = Api(widget.pairing.api);
  final _detector = FaceDetector(
    options: FaceDetectorOptions(enableClassification: true, performanceMode: FaceDetectorMode.fast),
  );

  _Stage _stage = _Stage.starting;
  String _status = 'Asking the server for a challenge';
  String? _error;
  CheckinResult? _result;

  CameraController? _cam;
  Challenge? _challenge;
  Liveness? _live;
  Future<Position>? _where;
  Position? _fix;
  bool _busy = false;
  int _faces = 0;
  double _yaw = 0;
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    _start();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    _cam?.dispose();
    _detector.close();
    super.dispose();
  }

  void _fail(String message) {
    if (!mounted) return;
    setState(() {
      _stage = _Stage.failed;
      _error = message;
    });
    _cam?.dispose();
    _cam = null;
  }

  Future<void> _start() async {
    // Android shows one permission dialog at a time and quietly denies a second
    // request made while the first is up, so location is asked for before the camera.
    final String? noLocation;
    try {
      noLocation = await _locationAllowed();
    } catch (e) {
      return _fail('Location: $e');
    }
    if (noLocation != null) return _fail(noLocation);

    // The fix takes longest, so it runs while the face check happens.
    final where = _locate();
    _where = where;
    unawaited(where.then((p) => mounted ? setState(() => _fix = p) : null, onError: (_) {}));

    try {
      final cameras = await availableCameras();
      final front = cameras.firstWhere((c) => c.lensDirection == CameraLensDirection.front);
      final cam = CameraController(
        front,
        ResolutionPreset.high,
        enableAudio: false,
        imageFormatGroup: ImageFormatGroup.nv21,
      );
      await cam.initialize();
      if (!mounted) return cam.dispose();
      _cam = cam;

      // Fetched after the camera prompt, so time spent on it does not eat the challenge's 60 seconds.
      final ch = await _api.challenge(widget.pairing.deviceId);
      _challenge = ch;
      _live = Liveness(ch.action);
      await cam.startImageStream(_onFrame);
      setState(() => _stage = _Stage.liveness);
    } on ApiException catch (e) {
      _fail(
        e.status == 404
            ? 'The server no longer knows this phone. Ask the admin to pair it again.'
            : e.message,
      );
    } on CameraException catch (e) {
      _fail(switch (e.code) {
        'CameraAccessDenied' => 'Camera permission is needed to check in.',
        'CameraAccessDeniedWithoutPrompt' =>
          'Camera is blocked for this app. Allow it in Settings > Apps > punchcard.',
        _ => 'Camera: ${e.description ?? e.code}',
      });
    } catch (e) {
      _fail('Could not reach ${widget.pairing.api.host}: $e');
    }
  }

  // Null when location can be read, otherwise what to tell the employee.
  Future<String?> _locationAllowed() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      return 'Location is turned off. Turn it on and try again.';
    }
    var perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) perm = await Geolocator.requestPermission();
    if (perm == LocationPermission.deniedForever) {
      return 'Location is blocked for this app. Allow it in Settings > Apps > punchcard.';
    }
    if (perm == LocationPermission.denied) return 'Location permission is needed to check in.';
    return null;
  }

  Future<Position> _locate() {
    return Geolocator.getCurrentPosition(
      locationSettings: AndroidSettings(
        accuracy: LocationAccuracy.best,
        timeLimit: const Duration(seconds: 40),
      ),
    );
  }

  InputImage _input(CameraImage img) {
    final rotation =
        InputImageRotationValue.fromRawValue(_cam!.description.sensorOrientation) ??
        InputImageRotation.rotation270deg;
    final plane = img.planes.first;
    return InputImage.fromBytes(
      bytes: plane.bytes,
      metadata: InputImageMetadata(
        size: Size(img.width.toDouble(), img.height.toDouble()),
        rotation: rotation,
        format: InputImageFormat.nv21,
        bytesPerRow: plane.bytesPerRow,
      ),
    );
  }

  // Frames arrive faster than ML Kit handles them on this phone, so the ones
  // that come in while a frame is being read are dropped.
  Future<void> _onFrame(CameraImage img) async {
    final live = _live;
    if (_busy || live == null || _stage != _Stage.liveness) return;
    _busy = true;
    try {
      final faces = await _detector.processImage(_input(img));
      _faces = faces.length;
      if (faces.length == 1) {
        final f = faces.first;
        _yaw = yawSign * (f.headEulerAngleY ?? 0);
        live.feed(
          FaceReading(
            yaw: _yaw,
            leftEye: f.leftEyeOpenProbability,
            rightEye: f.rightEyeOpenProbability,
            smile: f.smilingProbability,
          ),
        );
      } else {
        live.lost();
      }
      if (!mounted) return;
      setState(() {});
      if (live.step == LivenessStep.done) await _finish();
    } finally {
      _busy = false;
    }
  }

  Future<void> _finish() async {
    final cam = _cam!;
    final ch = _challenge!;
    setState(() {
      _stage = _Stage.working;
      _status = 'Taking the photo';
    });
    try {
      await cam.stopImageStream();
      final shot = await cam.takePicture();
      final Uint8List photo = await shot.readAsBytes();
      // The camera plugin leaves the JPEG in the cache. Only the server's embedding is kept.
      await File(shot.path).delete();

      setState(() => _status = 'Waiting for a location fix');
      final pos = await _where!;

      final fields = SignedFields(
        challengeId: ch.id,
        nonce: ch.nonce,
        kind: widget.kind,
        lat: pos.latitude,
        lng: pos.longitude,
        accuracyM: pos.accuracy,
        mock: pos.isMocked,
        photo: photo,
      );

      setState(() => _status = 'Touch the fingerprint sensor');
      final signature = await Device.sign(
        widget.pairing.keyAlias,
        fields.canonical(),
        title: widget.kind == 'IN' ? 'Check in' : 'Check out',
        subtitle: '${widget.pairing.code} ${widget.pairing.name}',
      );

      setState(() => _status = 'Sending');
      final r = await _api.checkin(
        deviceId: widget.pairing.deviceId,
        fields: fields,
        signature: signature,
        photo: photo,
      );
      await LastPunch(widget.kind, r.result, r.reason, r.at).save();
      await _cam?.dispose();
      _cam = null;
      if (mounted) {
        setState(() {
          _result = r;
          _stage = _Stage.finished;
        });
      }
    } on PlatformException catch (e) {
      _fail(e.code == 'CANCELLED' ? 'Fingerprint cancelled. Nothing was sent.' : e.message ?? e.code);
    } on ApiException catch (e) {
      _fail(e.status == 410 ? 'The 60 seconds ran out. Try again.' : e.message);
    } catch (e) {
      _fail('$e');
    }
  }

  String _prompt() {
    if (_faces == 0) return 'No face in view';
    if (_faces > 1) return 'Only one face, please';
    return switch (_live!.step) {
      LivenessStep.lookAhead => 'Look straight at the camera',
      LivenessStep.doAction => _live!.action.prompt,
      LivenessStep.lookBack => 'Now look straight at the camera',
      LivenessStep.done => 'Hold still',
    };
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final mono = t.bodySmall?.copyWith(fontFamily: 'monospace');
    final ch = _challenge;
    final left = ch?.expiresAt.difference(DateTime.now()).inSeconds.clamp(0, 999);
    final fix = _fix;

    return Scaffold(
      appBar: AppBar(title: Text(widget.kind == 'IN' ? 'Check in' : 'Check out')),
      body: switch (_stage) {
        _Stage.finished => _Outcome(result: _result!),
        _Stage.failed => _Problem(message: _error!),
        _ => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (_stage == _Stage.liveness && _cam != null)
              Expanded(
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    ClipRect(
                      child: FittedBox(
                        fit: BoxFit.cover,
                        child: SizedBox(
                          width: _cam!.value.previewSize!.height,
                          height: _cam!.value.previewSize!.width,
                          child: CameraPreview(_cam!),
                        ),
                      ),
                    ),
                    Positioned(
                      left: 0,
                      right: 0,
                      top: 0,
                      child: Container(
                        color: Colors.black54,
                        padding: const EdgeInsets.all(14),
                        child: Text(
                          _prompt(),
                          textAlign: TextAlign.center,
                          style: t.titleLarge?.copyWith(color: Colors.white),
                        ),
                      ),
                    ),
                  ],
                ),
              )
            else
              Expanded(
                child: Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const CircularProgressIndicator(),
                      const SizedBox(height: 16),
                      Text(_status, style: t.titleMedium),
                    ],
                  ),
                ),
              ),
            Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('challenge ${ch == null ? '-' : shortId(ch.id)} · ${left ?? '-'} s left', style: mono),
                  Text(
                    fix == null
                        ? 'location: waiting for fix'
                        : 'location: ±${fix.accuracy.toStringAsFixed(0)} m${fix.isMocked ? ' (mock)' : ''}',
                    style: mono,
                  ),
                  if (_stage == _Stage.liveness)
                    Text('faces $_faces · yaw ${_yaw.toStringAsFixed(0)}°', style: mono),
                ],
              ),
            ),
          ],
        ),
      },
    );
  }
}

class _Outcome extends StatelessWidget {
  const _Outcome({required this.result});

  final CheckinResult result;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final ok = result.accepted;
    final colour = ok ? Colors.green.shade700 : Theme.of(context).colorScheme.error;
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(ok ? Icons.check_circle : Icons.cancel, color: colour, size: 56),
          const SizedBox(height: 12),
          Text(ok ? 'Accepted' : 'Rejected', style: t.headlineMedium?.copyWith(color: colour)),
          if (result.reason != null) ...[
            const SizedBox(height: 8),
            Text(result.reason!, style: t.titleMedium),
          ],
          const SizedBox(height: 8),
          Text(
            result.at.toLocal().toString().substring(0, 19),
            style: t.bodySmall?.copyWith(fontFamily: 'monospace'),
          ),
          const Spacer(),
          SizedBox(
            width: double.infinity,
            height: 52,
            child: FilledButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Done')),
          ),
        ],
      ),
    );
  }
}

class _Problem extends StatelessWidget {
  const _Problem({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Not checked in', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 8),
          Text(message),
          const Spacer(),
          SizedBox(
            width: double.infinity,
            height: 52,
            child: OutlinedButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Back')),
          ),
        ],
      ),
    );
  }
}
