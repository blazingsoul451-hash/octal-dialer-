import 'package:flutter/material.dart';

class OctalColors {
  static const Color primaryGold = Color(0xFFFFB800);
  static const Color secondaryGold = Color(0xFFD97706);
  static const Color accentGoldLight = Color(0xFFFFD54F);
  static const Color bgDark = Color(0xFF1B1816);
  static const Color surfaceCard = Color(0xFF282320);
  static const Color surfaceElevated = Color(0xFF332D29);
  static const Color surfaceSubtle = Color(0xFF201D1A);
  static const Color border = Color(0xFF332D29);
  static const Color borderGold = Color(0x4DFFB800);
  static const Color textWhite = Colors.white;
  static const Color textSecondary = Color(0xFFA8A29E);
  static const Color textMuted = Color(0xFF78716C);
  static const Color success = Color(0xFF10B981);
  static const Color error = Color(0xFFEF4444);
  static const Color warning = Color(0xFFF59E0B);
  static const Color info = Color(0xFF3B82F6);
}

class OctalTheme {
  static ThemeData get darkTheme {
    return ThemeData(
      brightness: Brightness.dark,
      scaffoldBackgroundColor: OctalColors.bgDark,
      primaryColor: OctalColors.primaryGold,
      cardColor: OctalColors.surfaceCard,
      dividerColor: OctalColors.border,
      colorScheme: const ColorScheme.dark(
        primary: OctalColors.primaryGold,
        secondary: OctalColors.secondaryGold,
        surface: OctalColors.surfaceCard,
        error: OctalColors.error,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: OctalColors.surfaceCard,
        elevation: 0,
        centerTitle: false,
        iconTheme: IconThemeData(color: Colors.white),
      ),
    );
  }
}
