/// The move the server asked for. Names match the API's LivenessAction enum.
enum LivenessAction {
  turnLeft('TURN_LEFT', 'Turn your head to the left'),
  turnRight('TURN_RIGHT', 'Turn your head to the right'),
  blink('BLINK', 'Blink'),
  smile('SMILE', 'Smile');

  const LivenessAction(this.wire, this.prompt);

  final String wire;
  final String prompt;

  static LivenessAction fromWire(String s) => values.firstWhere((a) => a.wire == s);
}

/// One ML Kit face, reduced to what the check needs. [yaw] is in degrees,
/// positive when the person turns to their own left (see [yawSign] in the screen).
class FaceReading {
  const FaceReading({required this.yaw, this.leftEye, this.rightEye, this.smile});

  final double yaw;
  final double? leftEye;
  final double? rightEye;
  final double? smile;

  bool get eyesOpen => (leftEye ?? 1) > 0.6 && (rightEye ?? 1) > 0.6;
  bool get eyesShut => (leftEye ?? 1) < 0.2 && (rightEye ?? 1) < 0.2;
  bool get facingAhead => yaw.abs() < 12;
}

enum LivenessStep { lookAhead, doAction, lookBack, done }

/// The phone's side of liveness. It has to see a plain face first, then the
/// asked-for move, then a plain face again, which is the frame that gets sent.
/// A photo held up already turned, or a face frozen mid-smile, does not get
/// past the first step.
///
/// This runs on the phone, so a modified app can skip it. It raises the cost of
/// holding up a photo; the face match on the server is the check that counts.
class Liveness {
  Liveness(this.action);

  final LivenessAction action;
  LivenessStep step = LivenessStep.lookAhead;

  static const turnDegrees = 25.0;

  bool _plain(FaceReading f) =>
      f.facingAhead && f.eyesOpen && (action != LivenessAction.smile || (f.smile ?? 0) < 0.3);

  bool _did(FaceReading f) => switch (action) {
    LivenessAction.turnLeft => f.yaw > turnDegrees,
    LivenessAction.turnRight => f.yaw < -turnDegrees,
    LivenessAction.blink => f.eyesShut,
    LivenessAction.smile => (f.smile ?? 0) > 0.8,
  };

  /// Feed one frame with exactly one face. Returns the step after it.
  LivenessStep feed(FaceReading f) {
    switch (step) {
      case LivenessStep.lookAhead:
        if (_plain(f)) step = LivenessStep.doAction;
      case LivenessStep.doAction:
        if (_did(f)) step = LivenessStep.lookBack;
      case LivenessStep.lookBack:
        if (f.facingAhead && f.eyesOpen) step = LivenessStep.done;
      case LivenessStep.done:
        break;
    }
    return step;
  }

  /// Zero or several faces in frame: start over, so a second person cannot do the move.
  void lost() {
    if (step != LivenessStep.done) step = LivenessStep.lookAhead;
  }
}
