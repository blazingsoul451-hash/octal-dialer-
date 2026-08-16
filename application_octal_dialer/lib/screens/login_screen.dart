import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
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
  String _errorMessage = '';

  @override
  void initState() {
    super.initState();
    _loadSavedServer();
  }

  Future<void> _loadSavedServer() async {
    final prefs = await SharedPreferences.getInstance();
    final savedServer = prefs.getString('server_url');
    if (savedServer != null && savedServer.isNotEmpty) {
      _serverController.text = savedServer;
    } else {
      // Default to standard local dev / tunnel server
      _serverController.text = Platform.isAndroid ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
    }
  }

  Future<void> _handleLogin() async {
    final serverUrl = _serverController.text.trim().replaceAll(RegExp(r'/+$'), '');
    final identifier = _identifierController.text.trim();
    final password = _passwordController.text;

    if (serverUrl.isEmpty) {
      setState(() => _errorMessage = 'Please enter the server URL.');
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
      ).timeout(const Duration(seconds: 10));

      final data = jsonDecode(res.body);

      if (res.statusCode != 200 || data['token'] == null) {
        throw Exception(data['error'] ?? 'Invalid username or password.');
      }

      final String token = data['token'];
      final user = data['user'] ?? {};
      final String userId = user['id'] ?? '';
      final String username = user['username'] ?? identifier;
      final String email = user['email'] ?? '';
      final String role = user['role'] ?? 'user';
      final String tenantId = user['tenantId'] ?? 'tenant_default';

      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('auth_token', token);
      await prefs.setString('user_id', userId);
      await prefs.setString('username', username);
      await prefs.setString('user_email', email);
      await prefs.setString('user_role', role);
      await prefs.setString('tenant_id', tenantId);
      await prefs.setString('server_url', serverUrl);

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
        ).timeout(const Duration(seconds: 5));
      } catch (e) {
        debugPrint('Device auto-registration warning: $e');
      }

      if (mounted) {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (context) => const DeviceDashboardScreen()),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _errorMessage = e.toString().replaceFirst('Exception: ', '');
        });
      }
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF020617),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 20.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 24),
              // App Brand Header
              Center(
                child: Column(
                  children: [
                    Container(
                      width: 64,
                      height: 64,
                      decoration: BoxDecoration(
                        color: const Color(0xFFFFB800).withOpacity(0.12),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(
                          color: const Color(0xFFFFB800).withOpacity(0.35),
                          width: 1.5,
                        ),
                      ),
                      child: const Icon(
                        Icons.phone_in_talk,
                        color: Color(0xFFFFB800),
                        size: 34,
                      ),
                    ),
                    const SizedBox(height: 16),
                    const Text(
                      'OCTAL DIALER',
                      style: TextStyle(
                        fontFamily: 'Ubuntu',
                        fontSize: 24,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 1.5,
                        color: Colors.white,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'AUTHENTICATED GSM CALLING BRIDGE',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 2.0,
                        color: Colors.white.withOpacity(0.45),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 32),

              // Login Form Card
              Container(
                padding: const EdgeInsets.all(22.0),
                decoration: BoxDecoration(
                  color: const Color(0xFF0F172A),
                  borderRadius: BorderRadius.circular(24.0),
                  border: Border.all(
                    color: const Color(0xFFFFB800).withOpacity(0.2),
                    width: 1.5,
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (_errorMessage.isNotEmpty) ...[
                      Container(
                        padding: const EdgeInsets.all(12.0),
                        decoration: BoxDecoration(
                          color: Colors.red.withOpacity(0.12),
                          borderRadius: BorderRadius.circular(12.0),
                          border: Border.all(color: Colors.red.withOpacity(0.3)),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.error_outline, color: Colors.redAccent, size: 18),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                _errorMessage,
                                style: const TextStyle(
                                  color: Colors.redAccent,
                                  fontSize: 11,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),
                    ],

                    const Text(
                      'SERVER URL',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 1.0,
                        color: Color(0xFF94A3B8),
                      ),
                    ),
                    const SizedBox(height: 6),
                    TextField(
                      controller: _serverController,
                      style: const TextStyle(fontSize: 13, fontFamily: 'monospace', color: Colors.white),
                      decoration: InputDecoration(
                        hintText: 'https://octaldialer.com or http://10.0.2.2:3000',
                        hintStyle: TextStyle(color: Colors.white.withOpacity(0.25), fontSize: 11),
                        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                        fillColor: const Color(0xFF020617),
                        filled: true,
                        prefixIcon: const Icon(Icons.dns_outlined, color: Color(0xFF94A3B8), size: 18),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14.0),
                          borderSide: BorderSide.none,
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14.0),
                          borderSide: const BorderSide(color: Color(0xFFFFB800), width: 1.5),
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),

                    const Text(
                      'OCTAL USERNAME OR EMAIL',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 1.0,
                        color: Color(0xFF94A3B8),
                      ),
                    ),
                    const SizedBox(height: 6),
                    TextField(
                      controller: _identifierController,
                      style: const TextStyle(fontSize: 13, color: Colors.white),
                      decoration: InputDecoration(
                        hintText: 'e.g. mohsin or user@example.com',
                        hintStyle: TextStyle(color: Colors.white.withOpacity(0.25), fontSize: 11),
                        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                        fillColor: const Color(0xFF020617),
                        filled: true,
                        prefixIcon: const Icon(Icons.person_outline, color: Color(0xFF94A3B8), size: 18),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14.0),
                          borderSide: BorderSide.none,
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14.0),
                          borderSide: const BorderSide(color: Color(0xFFFFB800), width: 1.5),
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),

                    const Text(
                      'PASSWORD',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 1.0,
                        color: Color(0xFF94A3B8),
                      ),
                    ),
                    const SizedBox(height: 6),
                    TextField(
                      controller: _passwordController,
                      obscureText: _obscurePassword,
                      style: const TextStyle(fontSize: 13, color: Colors.white),
                      decoration: InputDecoration(
                        hintText: '••••••••',
                        hintStyle: TextStyle(color: Colors.white.withOpacity(0.25), fontSize: 11),
                        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                        fillColor: const Color(0xFF020617),
                        filled: true,
                        prefixIcon: const Icon(Icons.lock_outline, color: Color(0xFF94A3B8), size: 18),
                        suffixIcon: IconButton(
                          icon: Icon(
                            _obscurePassword ? Icons.visibility_off : Icons.visibility,
                            color: const Color(0xFF94A3B8),
                            size: 18,
                          ),
                          onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
                        ),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14.0),
                          borderSide: BorderSide.none,
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14.0),
                          borderSide: const BorderSide(color: Color(0xFFFFB800), width: 1.5),
                        ),
                      ),
                    ),
                    const SizedBox(height: 24),

                    ElevatedButton(
                      onPressed: _isLoading ? null : _handleLogin,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFFFFB800),
                        foregroundColor: const Color(0xFF020617),
                        padding: const EdgeInsets.symmetric(vertical: 15.0),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14.0),
                        ),
                        elevation: 0,
                      ),
                      child: _isLoading
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2.5, color: Color(0xFF020617)),
                            )
                          : const Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(Icons.login, size: 18),
                                SizedBox(width: 8),
                                Text(
                                  'LOG IN',
                                  style: TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.bold,
                                    letterSpacing: 1.0,
                                  ),
                                ),
                              ],
                            ),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 20),

              // Alternative Recovery / QR Scan Link
              Center(
                child: TextButton.icon(
                  onPressed: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(builder: (context) => const ConnectScreen()),
                    );
                  },
                  icon: const Icon(Icons.qr_code_scanner, size: 16, color: Color(0xFFFFB800)),
                  label: const Text(
                    'Alternative: QR Code / Deep Link Pairing',
                    style: TextStyle(color: Color(0xFFFFB800), fontSize: 12, fontWeight: FontWeight.bold),
                  ),
                ),
              ),

              const SizedBox(height: 12),
              const Center(
                child: Text(
                  'Log into your existing Octal Dialer SaaS account. Your Android handset will be authenticated as a registered device.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 11,
                    color: Color(0xFF64748B),
                    height: 1.4,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
