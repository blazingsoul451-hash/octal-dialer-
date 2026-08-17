import 'dart:math' as math;
import 'package:flutter/material.dart';

class OctalColors {
  static const Color primaryGold = Color(0xFFFFB800);
  static const Color secondaryGold = Color(0xFFD97706);
  static const Color bgDark = Color(0xFF020617);
  static const Color surfaceCard = Color(0xFF0F172A);
  static const Color surfaceElevated = Color(0xFF1E293B);
  static const Color border = Color(0xFF1E293B);
  static const Color borderGold = Color(0x4DFFB800);
  static const Color textWhite = Colors.white;
  static const Color textSecondary = Color(0xFF94A3B8);
  static const Color textMuted = Color(0xFF64748B);
  static const Color success = Color(0xFF10B981);
  static const Color error = Color(0xFFEF4444);
  static const Color warning = Color(0xFFF59E0B);
}

class OctalLogoPainter extends CustomPainter {
  final Color color;
  final Color secondaryColor;

  OctalLogoPainter({
    this.color = OctalColors.primaryGold,
    this.secondaryColor = OctalColors.secondaryGold,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2;

    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = size.width * 0.12
      ..strokeCap = StrokeCap.round;

    final rect = Rect.fromCircle(center: center, radius: radius * 0.75);
    paint.shader = SweepGradient(
      colors: [secondaryColor, color, secondaryColor],
      stops: const [0.0, 0.5, 1.0],
    ).createShader(rect);

    // Dynamic dual spiral arc representing Octal Dialer
    canvas.drawArc(rect, -math.pi * 0.2, math.pi * 1.5, false, paint);

    final innerRect = Rect.fromCircle(center: center, radius: radius * 0.42);
    paint.strokeWidth = size.width * 0.10;
    paint.shader = SweepGradient(
      colors: [color, secondaryColor, color],
      stops: const [0.0, 0.5, 1.0],
    ).createShader(innerRect);

    canvas.drawArc(innerRect, math.pi * 0.8, math.pi * 1.4, false, paint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class OctalLogo extends StatelessWidget {
  final double size;
  final Color? color;

  const OctalLogo({super.key, this.size = 48, this.color});

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      size: Size(size, size),
      painter: OctalLogoPainter(
        color: color ?? OctalColors.primaryGold,
        secondaryColor: OctalColors.secondaryGold,
      ),
    );
  }
}
