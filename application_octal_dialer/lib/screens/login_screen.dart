import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../config/app_config.dart';
import '../widgets/octal_logo.dart';
import 'device_dashboard_screen.dart';
import 'connect_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final TextEditingController _serverController = TextEditingController();
  final TextEditingController _identifierController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();

  bool _isLoading = false;
  bool _obscurePassword = true;
  bool _showServerConfig = false;
  String _errorMessage = '';

  @override
  void initState() {
    super.initState();
    _loadSavedServer();
  }

  Future<void> _loadSavedServer() async {
    final effective = await AppConfig.init();
    _serverController.text = effective;
  }

  @override
  void dispose() {
    _serverController.dispose();
    _identifierController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _handleLogin() async {
    final serverUrl = _serverController.text.trim().replaceAll(RegExp(r'/+$'), '');
    final identifier = _identifierController.text.trim();
    final password = _passwordController.text;

    if (serverUrl.isEmpty) {
      setState(() => _errorMessage = 'Please specify your server URL.');
      return;
    }
    if (identifier.isEmpty || password.isEmpty) {
      setState(() => _errorMessage = 'Please enter your username/email and password.');
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMessage = '';
    });

    try {
      final loginUri = Uri.parse('$serverUrl/api/auth/login');
      final res = await http.post(
        loginUri,
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'identifier': identifier,
          'password': password,
        }),
      ).timeout(const Duration(seconds: 12));

      final data = jsonDecode(res.body);

      if (res.statusCode != 200 || data['token'] == null) {
        throw Exception(data['error'] ?? 'Invalid username or password.');
      }

      final String token = data['token'];
      final user = data['user'] ?? {};
      final String userId = user['id'] ?? '';
      final String username = user['username'] ?? identifier;
      final String email = user['email'] ?? '';
      final String role = user['role'] ?? 'agent';
      final String tenantId = user['tenantId'] ?? 'tenant_default';

      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('auth_token', token);
      await prefs.setString('user_id', userId);
      await prefs.setString('username', username);
      await prefs.setString('user_email', email);
      await prefs.setString('user_role', role);
      await prefs.setString('tenant_id', tenantId);
      await AppConfig.setBaseUrl(serverUrl);

      // Register device with backend
      String deviceUid = prefs.getString('octal_device_uid') ?? '';
      if (deviceUid.isEmpty) {
        deviceUid = 'octal_dev_${DateTime.now().millisecondsSinceEpoch}';
        await prefs.setString('octal_device_uid', deviceUid);
      }

      final String deviceName = Platform.isAndroid ? 'Android Handset' : 'Mobile Client';

      try {
        await http.post(
          Uri.parse('$serverUrl/api/devices/register'),
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer $token'
          },
          body: jsonEncode({
            'name': deviceName,
            'platform': 'android',
            'osType': Platform.isAndroid ? 'Android' : 'iOS',
            'appVersion': '1.2.0',
            'deviceUid': deviceUid
          }),
        ).timeout(const Duration(seconds: 6));
      } catch (e) {
        debugPrint('Device auto-registration warning: $e');
      }

      if (mounted) {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (context) => const DeviceDashboardScreen()),
        );
      }
    } catch (err) {
      if (mounted) {
        setState(() {
          _errorMessage = err.toString().replaceAll('Exception:', '').trim();
          _isLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: OctalColors.bgDark,
      body: SafeArea(
        child: Stack(
          children: [
            // Subtle golden wave aesthetic at the bottom
            Positioned(
              bottom: -50,
              left: -30,
              right: -30,
              height: 220,
              child: Opacity(
                opacity: 0.12,
                child: CustomPaint(
                  painter: _WavePainter(),
                ),
              ),
            ),

            Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 28.0, vertical: 24.0),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Top Logo & Brand
                    Center(
                      child: Column(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: OctalColors.surfaceCard,
                              border: Border.all(color: OctalColors.borderGold, width: 1.5),
                              boxShadow: [
                                BoxShadow(
                                  color: OctalColors.primaryGold.withOpacity(0.15),
                                  blurRadius: 24,
                                  spreadRadius: 2,
                                ),
                              ],
                            ),
                            child: const OctalLogo(size: 56),
                          ),
                          const SizedBox(height: 16),
                          const Text(
                            'OCTAL',
                            style: TextStyle(
                              fontFamily: 'Ubuntu',
                              fontSize: 22,
                              fontWeight: FontWeight.w900,
                              letterSpacing: 4.0,
                              color: OctalColors.primaryGold,
                            ),
                          ),
                          const Text(
                            'DIALER',
                            style: TextStyle(
                              fontFamily: 'Ubuntu',
                              fontSize: 14,
                              fontWeight: FontWeight.bold,
                              letterSpacing: 6.0,
                              color: Colors.white70,
                            ),
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 28),

                    // Headings from Reference Image
                    const Text(
                      'Smart Dialing.\nBetter Results.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontFamily: 'Ubuntu',
                        fontSize: 24,
                        fontWeight: FontWeight.w900,
                        color: Colors.white,
                        height: 1.25,
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Powerful auto dialer for sales teams and call centers.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 13,
                        color: OctalColors.textSecondary,
                        height: 1.4,
                      ),
                    ),

                    const SizedBox(height: 32),

                    // Error Message
                    if (_errorMessage.isNotEmpty) ...[
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                        decoration: BoxDecoration(
                          color: OctalColors.error.withOpacity(0.12),
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: OctalColors.error.withOpacity(0.35)),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.error_outline, color: OctalColors.error, size: 18),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                _errorMessage,
                                style: const TextStyle(fontSize: 12, color: OctalColors.error, fontWeight: FontWeight.w600),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 18),
                    ],

                    // Input Form Fields
                    Container(
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        color: OctalColors.surfaceCard,
                        borderRadius: BorderRadius.circular(24),
                        border: Border.all(color: OctalColors.border, width: 1.5),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withOpacity(0.4),
                            blurRadius: 16,
                            offset: const Offset(0, 8),
                          ),
                        ],
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          // Username / Email Field
                          TextField(
                            controller: _identifierController,
                            style: const TextStyle(color: Colors.white, fontSize: 14),
                            decoration: InputDecoration(
                              labelText: 'Username or Email',
                              labelStyle: const TextStyle(color: OctalColors.textSecondary, fontSize: 13),
                              prefixIcon: const Icon(Icons.person_outline, color: OctalColors.primaryGold, size: 20),
                              filled: true,
                              fillColor: OctalColors.surfaceElevated.withOpacity(0.6),
                              contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                              enabledBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(14),
                                borderSide: const BorderSide(color: OctalColors.border),
                              ),
                              focusedBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(14),
                                borderSide: const BorderSide(color: OctalColors.primaryGold, width: 1.5),
                              ),
                            ),
                          ),

                          const SizedBox(height: 14),

                          // Password Field
                          TextField(
                            controller: _passwordController,
                            obscureText: _obscurePassword,
                            style: const TextStyle(color: Colors.white, fontSize: 14),
                            decoration: InputDecoration(
                              labelText: 'Password',
                              labelStyle: const TextStyle(color: OctalColors.textSecondary, fontSize: 13),
                              prefixIcon: const Icon(Icons.lock_outline, color: OctalColors.primaryGold, size: 20),
                              suffixIcon: IconButton(
                                icon: Icon(
                                  _obscurePassword ? Icons.visibility_off : Icons.visibility,
                                  color: OctalColors.textSecondary,
                                  size: 18,
                                ),
                                onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
                              ),
                              filled: true,
                              fillColor: OctalColors.surfaceElevated.withOpacity(0.6),
                              contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                              enabledBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(14),
                                borderSide: const BorderSide(color: OctalColors.border),
                              ),
                              focusedBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(14),
                                borderSide: const BorderSide(color: OctalColors.primaryGold, width: 1.5),
                              ),
                            ),
                          ),

                          // Server URL Config Collapsible
                          const SizedBox(height: 10),
                          InkWell(
                            onTap: () => setState(() => _showServerConfig = !_showServerConfig),
                            borderRadius: BorderRadius.circular(8),
                            child: Padding(
                              padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
                              child: Row(
                                children: [
                                  Icon(
                                    _showServerConfig ? Icons.expand_less : Icons.settings_ethernet,
                                    size: 16,
                                    color: OctalColors.primaryGold,
                                  ),
                                  const SizedBox(width: 6),
                                  const Text(
                                    'Server Endpoint Settings',
                                    style: TextStyle(fontSize: 11, color: OctalColors.textSecondary, fontWeight: FontWeight.bold),
                                  ),
                                  const Spacer(),
                                  Text(
                                    _showServerConfig ? 'Hide' : 'Configure',
                                    style: const TextStyle(fontSize: 10, color: OctalColors.primaryGold, fontWeight: FontWeight.bold),
                                  ),
                                ],
                              ),
                            ),
                          ),

                          if (_showServerConfig) ...[
                            const SizedBox(height: 8),
                            TextField(
                              controller: _serverController,
                              style: const TextStyle(color: Colors.white, fontSize: 12, fontFamily: 'monospace'),
                              decoration: InputDecoration(
                                labelText: 'Server URL (HTTPS / LAN)',
                                labelStyle: const TextStyle(color: OctalColors.textSecondary, fontSize: 12),
                                prefixIcon: const Icon(Icons.dns_outlined, color: OctalColors.primaryGold, size: 18),
                                filled: true,
                                fillColor: OctalColors.bgDark,
                                contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                                enabledBorder: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(12),
                                  borderSide: const BorderSide(color: OctalColors.border),
                                ),
                                focusedBorder: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(12),
                                  borderSide: const BorderSide(color: OctalColors.primaryGold, width: 1.5),
                                ),
                              ),
                            ),
                          ],

                          const SizedBox(height: 20),

                          // Primary Gold Login Button
                          SizedBox(
                            height: 52,
                            child: ElevatedButton(
                              onPressed: _isLoading ? null : _handleLogin,
                              style: ElevatedButton.styleFrom(
                                backgroundColor: OctalColors.primaryGold,
                                foregroundColor: OctalColors.bgDark,
                                elevation: 4,
                                shadowColor: OctalColors.primaryGold.withOpacity(0.4),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(16),
                                ),
                              ),
                              child: _isLoading
                                  ? const SizedBox(
                                      width: 22,
                                      height: 22,
                                      child: CircularProgressIndicator(color: OctalColors.bgDark, strokeWidth: 2.5),
                                    )
                                  : const Row(
                                      mainAxisAlignment: MainAxisAlignment.center,
                                      children: [
                                        Text(
                                          'Login',
                                          style: TextStyle(
                                            fontFamily: 'Ubuntu',
                                            fontSize: 15,
                                            fontWeight: FontWeight.w900,
                                            letterSpacing: 0.5,
                                          ),
                                        ),
                                        SizedBox(width: 8),
                                        Icon(Icons.arrow_forward, size: 18),
                                      ],
                                    ),
                            ),
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 20),

                    // Social Divider: "or continue with"
                    Row(
                      children: [
                        const Expanded(child: Divider(color: OctalColors.border)),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 14),
                          child: Text(
                            'or continue with',
                            style: TextStyle(fontSize: 11, color: OctalColors.textSecondary.withOpacity(0.8)),
                          ),
                        ),
                        const Expanded(child: Divider(color: OctalColors.border)),
                      ],
                    ),

                    const SizedBox(height: 16),

                    // Google Login Button (Matching Reference)
                    OutlinedButton.icon(
                      onPressed: () {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Please log in with your Octal tenant username & password.')),
                        );
                      },
                      icon: Container(
                        padding: const EdgeInsets.all(4),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: const Text(
                          'G',
                          style: TextStyle(color: Colors.black, fontWeight: FontWeight.bold, fontSize: 13),
                        ),
                      ),
                      label: const Text(
                        'Google',
                        style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Colors.white),
                      ),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        side: const BorderSide(color: OctalColors.border, width: 1.5),
                        backgroundColor: OctalColors.surfaceCard,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                      ),
                    ),

                    const SizedBox(height: 18),

                    // QR Pairing Alternative Shortcut
                    TextButton.icon(
                      onPressed: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(builder: (context) => const ConnectScreen()),
                        );
                      },
                      icon: const Icon(Icons.qr_code_scanner, color: OctalColors.primaryGold, size: 18),
                      label: const Text(
                        'Pair with Laptop via QR Code',
                        style: TextStyle(color: OctalColors.primaryGold, fontSize: 12, fontWeight: FontWeight.bold),
                      ),
                    ),

                    const SizedBox(height: 12),

                    // Footer from Reference: "Don't have an account? Sign Up"
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Text(
                          "Don't have an account? ",
                          style: TextStyle(fontSize: 12, color: OctalColors.textSecondary),
                        ),
                        GestureDetector(
                          onTap: () {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('Ask your team administrator to invite you to your Octal workspace.')),
                            );
                          },
                          child: const Text(
                            'Sign Up',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.bold,
                              color: OctalColors.primaryGold,
                            ),
                          ),
                        ),
                      ],
                    ),

                    const SizedBox(height: 20),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _WavePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = OctalColors.primaryGold
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.0;

    final path = Path();
    path.moveTo(0, size.height * 0.7);
    path.quadraticBezierTo(size.width * 0.35, size.height * 0.2, size.width * 0.65, size.height * 0.8);
    path.quadraticBezierTo(size.width * 0.85, size.height * 1.1, size.width, size.height * 0.5);

    canvas.drawPath(path, paint);

    final path2 = Path();
    paint.strokeWidth = 1.2;
    path2.moveTo(0, size.height * 0.85);
    path2.quadraticBezierTo(size.width * 0.4, size.height * 0.4, size.width * 0.7, size.height * 0.9);
    path2.quadraticBezierTo(size.width * 0.9, size.height * 1.15, size.width, size.height * 0.65);
    canvas.drawPath(path2, paint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
