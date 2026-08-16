import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'screens/login_screen.dart';
import 'screens/device_dashboard_screen.dart';
import 'screens/connect_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const OctalDialerApp());
}

class OctalDialerApp extends StatefulWidget {
  const OctalDialerApp({super.key});

  @override
  State<OctalDialerApp> createState() => _OctalDialerAppState();
}

class _OctalDialerAppState extends State<OctalDialerApp> {
  Widget _initialScreen = const Scaffold(
    backgroundColor: Color(0xFF020617),
    body: Center(
      child: CircularProgressIndicator(color: Color(0xFFFFB800)),
    ),
  );

  @override
  void initState() {
    super.initState();
    _checkInitialRoute();
  }

  Future<void> _checkInitialRoute() async {
    final prefs = await SharedPreferences.getInstance();
    final authToken = prefs.getString('auth_token');
    final connectionUri = prefs.getString('connection_uri');

    if (authToken != null && authToken.isNotEmpty) {
      setState(() {
        _initialScreen = const DeviceDashboardScreen();
      });
    } else if (connectionUri != null && connectionUri.isNotEmpty) {
      setState(() {
        _initialScreen = const ConnectScreen();
      });
    } else {
      setState(() {
        _initialScreen = const LoginScreen();
      });
    }
  }

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
      home: _initialScreen,
    );
  }
}
