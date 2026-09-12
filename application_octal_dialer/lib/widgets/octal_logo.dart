import 'dart:math' as math;
import 'package:flutter/material.dart';

class OctalColors {
  static const Color primaryGold = Color(0xFFFFB800);
  static const Color secondaryGold = Color(0xFFD97706);
  static const Color accentGoldLight = Color(0xFFFFD54F);
  static const Color bgDark = Color(0xFF1B1816);
  static const Color surfaceCard = Color(0xFF282320);
  static const Color surfaceElevated = Color(0xFF332D29);
  static const Color surfaceSubtle = Color(0xFF201D1A);
  static const Color pillActive = Color(0xFF6E4D3E);
  static const Color coralAccent = Color(0xFFF09F7D);
  static const Color coralButton = Color(0xFFF09F7D);
  static const Color fieldBorder = Color(0xFF4A423C);
  static const Color callGreen = Color(0xFF47B86E);
  static const Color border = Color(0xFF332D29);
  static const Color borderGold = Color(0x4DFFB800);
  static const Color textWhite = Colors.white;
  static const Color textSecondary = Color(0xFFA8A29E);
  static const Color textMuted = Color(0xFF78716C);
  static const Color success = Color(0xFF10B981);
  static const Color error = Color(0xFFEF4444);
  static const Color warning = Color(0xFFF59E0B);
  static const Color purpleSim = Color(0xFFA78BFA);
}

/// Precise Vector Painter for the Official Globe + Telephone Handset Octal Logo.
/// Features a gold wireframe globe grid with an angled golden phone handset in foreground.
class GlobePhoneLogoPainter extends CustomPainter {
  final Color primaryColor;
  final Color secondaryColor;
  final Color bgColor;

  GlobePhoneLogoPainter({
    this.primaryColor = OctalColors.primaryGold,
    this.secondaryColor = OctalColors.secondaryGold,
    this.bgColor = OctalColors.bgDark,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final center = Offset(w * 0.54, h * 0.46);
    final globeRadius = w * 0.38;

    final linePaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = math.max(1.2, w * 0.045)
      ..strokeCap = StrokeCap.round
      ..color = primaryColor;

    // 1. Globe Outer Circle
    canvas.drawCircle(center, globeRadius, linePaint);

    // 2. Horizontal Latitude line (Equator)
    canvas.drawLine(
      Offset(center.dx - globeRadius, center.dy),
      Offset(center.dx + globeRadius, center.dy),
      linePaint,
    );

    // 3. Northern and Southern Latitude parallels
    final latOffset = globeRadius * 0.52;
    final latWidth = math.sqrt(math.max(0, globeRadius * globeRadius - latOffset * latOffset));
    canvas.drawLine(
      Offset(center.dx - latWidth, center.dy - latOffset),
      Offset(center.dx + latWidth, center.dy - latOffset),
      linePaint,
    );
    canvas.drawLine(
      Offset(center.dx - latWidth, center.dy + latOffset),
      Offset(center.dx + latWidth, center.dy + latOffset),
      linePaint,
    );

    // 4. Vertical Central Meridian
    canvas.drawLine(
      Offset(center.dx, center.dy - globeRadius),
      Offset(center.dx, center.dy + globeRadius),
      linePaint,
    );

    // 5. Longitude Ellipses
    final innerLongRect = Rect.fromCenter(
      center: center,
      width: globeRadius * 1.15,
      height: globeRadius * 2.0,
    );
    canvas.drawOval(innerLongRect, linePaint);

    final outerLongRect = Rect.fromCenter(
      center: center,
      width: globeRadius * 0.55,
      height: globeRadius * 2.0,
    );
    canvas.drawOval(outerLongRect, linePaint);

    // 6. Angled Golden Telephone Handset in the foreground (curving around bottom-left)
    canvas.save();
    canvas.translate(w * 0.32, h * 0.68);
    canvas.rotate(-math.pi * 0.28); // ~45 deg angle pointing up-right

    final handsetBgPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = w * 0.26
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..color = bgColor; // clear background halo around phone

    final handsetGoldPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = w * 0.17
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..shader = LinearGradient(
        colors: [primaryColor, secondaryColor, primaryColor],
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
      ).createShader(Rect.fromLTWH(-w * 0.3, -w * 0.3, w * 0.6, w * 0.6));

    final handsetPath = Path();
    handsetPath.moveTo(-w * 0.24, -w * 0.16);
    handsetPath.cubicTo(
      -w * 0.14, -w * 0.04,
      -w * 0.04,  w * 0.06,
       w * 0.12,  w * 0.22,
    );

    // Draw background mask first so phone cleanly occludes globe
    canvas.drawPath(handsetPath, handsetBgPaint);
    // Draw golden handset body
    canvas.drawPath(handsetPath, handsetGoldPaint);

    // Earpiece & Mouthpiece golden caps
    final capPaint = Paint()
      ..style = PaintingStyle.fill
      ..shader = RadialGradient(
        colors: [OctalColors.accentGoldLight, primaryColor],
      ).createShader(Rect.fromCircle(center: Offset.zero, radius: w * 0.1));

    // Top earpiece bulb
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(center: Offset(-w * 0.24, -w * 0.16), width: w * 0.14, height: w * 0.22),
        Radius.circular(w * 0.07),
      ),
      capPaint,
    );

    // Bottom mouthpiece bulb
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(center: Offset(w * 0.12, w * 0.22), width: w * 0.14, height: w * 0.22),
        Radius.circular(w * 0.07),
      ),
      capPaint,
    );

    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

/// Official Octal Dialer Logo widget using the Globe + Telephone Handset design.
class OctalLogo extends StatelessWidget {
  final double size;
  final Color? color;

  const OctalLogo({super.key, this.size = 48, this.color});

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      size: Size(size, size),
      painter: GlobePhoneLogoPainter(
        primaryColor: color ?? OctalColors.primaryGold,
        secondaryColor: OctalColors.secondaryGold,
      ),
    );
  }
}

/// Top branding header used across the application matching the design reference:
/// Logo + "OCTAL DIALER" + "Connected. Productive. Profitable." + optional actions.
class OctalBrandHeader extends StatelessWidget {
  final VoidCallback? onSearchTap;
  final VoidCallback? onMenuTap;
  final bool showActions;

  const OctalBrandHeader({
    super.key,
    this.onSearchTap,
    this.onMenuTap,
    this.showActions = true,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
      child: Row(
        children: [
          const OctalLogo(size: 38),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                RichText(
                  text: const TextSpan(
                    children: [
                      TextSpan(
                        text: 'OCTAL ',
                        style: TextStyle(
                          fontFamily: 'Ubuntu',
                          fontSize: 18,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 1.5,
                          color: OctalColors.primaryGold,
                        ),
                      ),
                      TextSpan(
                        text: 'DIALER',
                        style: TextStyle(
                          fontFamily: 'Ubuntu',
                          fontSize: 18,
                          fontWeight: FontWeight.w400,
                          letterSpacing: 1.5,
                          color: Colors.white,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 2),
                const Text(
                  'Connected. Productive. Profitable.',
                  style: TextStyle(
                    fontSize: 10.5,
                    fontWeight: FontWeight.w500,
                    color: OctalColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
          if (showActions) ...[
            if (onSearchTap != null)
              IconButton(
                icon: const Icon(Icons.search_rounded, color: OctalColors.primaryGold, size: 22),
                onPressed: onSearchTap,
                tooltip: 'Search',
              ),
            IconButton(
              icon: const Icon(Icons.more_vert_rounded, color: OctalColors.primaryGold, size: 22),
              onPressed: onMenuTap ?? () {},
              tooltip: 'Options',
            ),
          ],
        ],
      ),
    );
  }
}
