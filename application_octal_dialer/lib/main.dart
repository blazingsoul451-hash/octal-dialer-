import 'package:flutter/material.dart';
import 'screens/connect_screen.dart';

void main() {
  runApp(const OctalDialerApp());
}

class OctalDialerApp extends StatelessWidget {
  const OctalDialerApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Octal Dialer Client',
      debugShowCheckedModeBanner: false,
      themeMode: ThemeMode.dark,
      darkTheme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF020617),
        primaryColor: const Color(0xFFFFB800),
        cardColor: const Color(0xFF0F172A),
        hintColor: const Color(0xFF94A3B8),
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFFFFB800),
          secondary: Color(0xFFD97706),
          surface: Color(0xFF0F172A),
          error: Colors.redAccent,
        ),
        textTheme: const TextTheme(
          displayLarge: TextStyle(fontFamily: 'Ubuntu', fontSize: 32, fontWeight: FontWeight.bold, color: Colors.white),
          titleLarge: TextStyle(fontFamily: 'Ubuntu', fontSize: 14, fontWeight: FontWeight.bold, color: Colors.white),
          bodyLarge: TextStyle(fontSize: 14, color: Colors.white),
          bodyMedium: TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
        ),
      ),
      home: const ConnectScreen(),
    );
  }
}
