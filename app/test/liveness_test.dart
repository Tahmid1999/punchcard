import 'package:flutter_test/flutter_test.dart';
import 'package:punchcard/liveness.dart';

const ahead = FaceReading(yaw: 2, leftEye: 0.95, rightEye: 0.9, smile: 0.05);

LivenessStep run(LivenessAction a, List<FaceReading> frames) {
  final l = Liveness(a);
  for (final f in frames) {
    l.feed(f);
  }
  return l.step;
}

void main() {
  test('turn left: ahead, turned, ahead again', () {
    expect(run(LivenessAction.turnLeft, [ahead, const FaceReading(yaw: 31), ahead]), LivenessStep.done);
  });

  test('turning the wrong way does not count', () {
    expect(run(LivenessAction.turnLeft, [ahead, const FaceReading(yaw: -40), ahead]), LivenessStep.doAction);
    expect(run(LivenessAction.turnRight, [ahead, const FaceReading(yaw: -31), ahead]), LivenessStep.done);
  });

  test('a face already turned at the start has to face ahead first', () {
    // A photo held at an angle: never seen facing ahead, so the turn is not counted.
    expect(
      run(LivenessAction.turnLeft, [const FaceReading(yaw: 35), const FaceReading(yaw: 35)]),
      LivenessStep.lookAhead,
    );
  });

  test('blink needs both eyes shut after seeing them open', () {
    const shut = FaceReading(yaw: 0, leftEye: 0.05, rightEye: 0.1);
    const wink = FaceReading(yaw: 0, leftEye: 0.05, rightEye: 0.9);
    expect(run(LivenessAction.blink, [ahead, wink, ahead]), LivenessStep.doAction);
    expect(run(LivenessAction.blink, [ahead, shut, ahead]), LivenessStep.done);
    expect(run(LivenessAction.blink, [shut, shut]), LivenessStep.lookAhead);
  });

  test('a smile from the first frame is not a smile on request', () {
    const grin = FaceReading(yaw: 0, leftEye: 0.9, rightEye: 0.9, smile: 0.95);
    expect(run(LivenessAction.smile, [grin, grin, grin]), LivenessStep.lookAhead);
    expect(run(LivenessAction.smile, [ahead, grin, ahead]), LivenessStep.done);
  });

  test('losing the face or seeing two starts over', () {
    final l = Liveness(LivenessAction.turnRight)..feed(ahead);
    expect(l.step, LivenessStep.doAction);
    l.lost();
    expect(l.step, LivenessStep.lookAhead);
  });

  test('reads the api action names', () {
    expect(LivenessAction.fromWire('TURN_LEFT'), LivenessAction.turnLeft);
    expect(LivenessAction.fromWire('SMILE'), LivenessAction.smile);
  });
}
