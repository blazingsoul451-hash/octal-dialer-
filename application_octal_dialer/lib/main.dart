import 'package:flutter/material.dart';
import 'screens/main_shell_screen.dart';
import 'config/app_config.dart';
import 'widgets/octal_logo.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await AppConfig.init();
  runApp(const OctalDialerApp());
}

class OctalDialerApp extends StatefulWidget {
  const OctalDialerApp({super.key});

  @override
  State<OctalDialerApp> createState() => _OctalDialerAppState();
}

class _OctalDialerAppState extends State<OctalDialerApp> {
  final Widget _initialScreen = const MainShellScreen();


  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Octal Dialer',
      debugShowCheckedModeBanner: false,
      themeMode: ThemeMode.dark,
      darkTheme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: OctalColors.bgDark,
        primaryColor: OctalColors.primaryGold,
        cardColor: OctalColors.surfaceCard,
        hintColor: OctalColors.textSecondary,
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
        bottomNavigationBarTheme: const BottomNavigationBarThemeData(
          backgroundColor: OctalColors.surfaceCard,
          selectedItemColor: OctalColors.primaryGold,
          unselectedItemColor: OctalColors.textSecondary,
          type: BottomNavigationBarType.fixed,
          elevation: 8,
        ),
        textTheme: const TextTheme(
          displayLarge: TextStyle(fontFamily: 'Ubuntu', fontSize: 30, fontWeight: FontWeight.w900, color: Colors.white),
          titleLarge: TextStyle(fontFamily: 'Ubuntu', fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white),
          titleMedium: TextStyle(fontFamily: 'Ubuntu', fontSize: 14, fontWeight: FontWeight.bold, color: Colors.white),
          bodyLarge: TextStyle(fontSize: 14, color: Colors.white),
          bodyMedium: TextStyle(fontSize: 12, color: OctalColors.textSecondary),
        ),
      ),
      home: _initialScreen,
    );
  }
}
