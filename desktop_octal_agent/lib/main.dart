import 'package:flutter/material.dart';
import 'theme/octal_theme.dart';
import 'screens/main_desktop_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const OctalDesktopAgentApp());
}

class OctalDesktopAgentApp extends StatelessWidget {
  const OctalDesktopAgentApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Octal Desktop Agent',
      debugShowCheckedModeBanner: false,
      themeMode: ThemeMode.dark,
      darkTheme: OctalTheme.darkTheme,
      home: const MainDesktopScreen(),
    );
  }
}
