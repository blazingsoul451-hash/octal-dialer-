import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../config/app_config.dart';
import '../services/phone_bridge_service.dart';
import '../widgets/octal_logo.dart';
import 'connected_screen.dart';
import 'login_screen.dart';

class ConnectScreen extends StatefulWidget {
  final bool startWithScanner;
  const ConnectScreen({super.key, this.startWithScanner = false});

  @override
  State<ConnectScreen> createState() => _ConnectScreenState();
}

class _ConnectScreenState extends State<ConnectScreen> {
  final TextEditingController _uriController = TextEditingController();
  String _errorMessage = '';
  bool _isLoading = false;
  late bool _showScanner;

  @override
  void initState() {
    super.initState();
    _showScanner = widget.startWithScanner;
    PhoneBridgeService.ensureAllPermissions();
    if (widget.startWithScanner) {
      _clearStaleConnection();
    } else {
      _checkSavedConnection();
    }
  }

  Future<void> _clearStaleConnection() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('connection_uri');
  }

  Future<void> _checkSavedConnection() async {
    final prefs = await SharedPreferences.getInstance();
    final savedUri = prefs.getString('connection_uri');
    if (savedUri != null && savedUri.isNotEmpty) {
      if (savedUri.contains('localhost') || savedUri.contains('127.0.0.1') || savedUri.contains('10.0.2.2')) {
        await prefs.remove('connection_uri');
        return;
      }
      _uriController.text = savedUri;
      _connect(savedUri, autoConnect: true);
    }
  }

  Future<void> _connect(String uri, {bool autoConnect = false}) async {
    setState(() {
      _isLoading = true;
      _errorMessage = '';
    });

    try {
      final parsed = Uri.parse(uri);

      String? sessionId = parsed.queryParameters['sessionId'];
      String? token = parsed.queryParameters['token'];
      String? rawServerUrl = parsed.queryParameters['serverUrl'];
      String laptopName = parsed.queryParameters['laptop'] ?? 'Laptop Host';
      String laptopBtAddress = parsed.queryParameters['bt'] ?? '';

      String effectiveServerUrl;
      if (rawServerUrl != null && rawServerUrl.isNotEmpty) {
        final sanitized = AppConfig.sanitizeUrl(rawServerUrl);
        effectiveServerUrl = sanitized ?? AppConfig.apiBaseUrl;
      } else if ((parsed.scheme == 'http' || parsed.scheme == 'https') && parsed.host.isNotEmpty) {
        final portStr = parsed.hasPort ? ':${parsed.port}' : (parsed.scheme == 'https' ? '' : ':3000');
        effectiveServerUrl = '${parsed.scheme}://${parsed.host}$portStr';
      } else {
        effectiveServerUrl = AppConfig.apiBaseUrl;
      }

      if (sessionId == null || sessionId.isEmpty || token == null || token.isEmpty) {
        throw const FormatException('Missing required pairing parameters (sessionId/token) in QR payload');
      }

      final serverUri = Uri.parse(effectiveServerUrl);
      if (!['http', 'https'].contains(serverUri.scheme)) {
        throw const FormatException('Invalid server URL scheme (must be http/https)');
      }
      if (serverUri.host.isEmpty) {
        throw const FormatException('Invalid server URL (empty host)');
      }

      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('connection_uri', uri);

      if (mounted) {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(
            builder: (context) => ConnectedScreen(
              sessionId: sessionId,
              token: token,
              serverUrl: effectiveServerUrl,
              laptopName: laptopName,
              laptopBtAddress: laptopBtAddress,
            ),
          ),
        );
      }
    } catch (e) {
      setState(() {
        _errorMessage = e.toString().replaceFirst('Exception: ', '');
      });
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove('connection_uri');
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  Future<void> _pasteClipboard() async {
    final data = await Clipboard.getData('text/plain');
    if (data != null && data.text != null) {
      setState(() {
        _uriController.text = data.text!;
      });
      _connect(data.text!);
    } else {
      setState(() {
        _errorMessage = 'Clipboard is empty.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: OctalColors.bgDark,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 20.0),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: Column(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: OctalColors.surfaceCard,
                          border: Border.all(color: OctalColors.borderGold, width: 1.5),
                        ),
                        child: const OctalLogo(size: 48),
                      ),
                      const SizedBox(height: 16),
                      const Text(
                        'OCTAL DIALER',
                        style: TextStyle(
                          fontFamily: 'Ubuntu',
                          fontSize: 22,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 2.0,
                          color: Colors.white,
                        ),
                      ),
                      const SizedBox(height: 6),
                      const Text(
                        'PAIR HANDSET WITH LAPTOP',
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.bold,
                          letterSpacing: 2.0,
                          color: OctalColors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 28),

                if (_showScanner) ...[
                  Container(
                    height: 240,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: OctalColors.primaryGold, width: 1.5),
                    ),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(18),
                      child: MobileScanner(
                        onDetect: (capture) {
                          final barcode = capture.barcodes.firstOrNull;
                          if (barcode?.rawValue != null) {
                            setState(() => _showScanner = false);
                            _connect(barcode!.rawValue!);
                          }
                        },
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextButton(
                    onPressed: () => setState(() => _showScanner = false),
                    child: const Text('Close Camera Scanner', style: TextStyle(color: OctalColors.error, fontSize: 11)),
                  ),
                  const SizedBox(height: 16),
                ],

                Container(
                  padding: const EdgeInsets.all(20.0),
                  decoration: BoxDecoration(
                    color: OctalColors.surfaceCard,
                    borderRadius: BorderRadius.circular(24.0),
                    border: Border.all(color: OctalColors.border, width: 1.5),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (_errorMessage.isNotEmpty) ...[
                        Container(
                          padding: const EdgeInsets.all(12.0),
                          decoration: BoxDecoration(
                            color: OctalColors.error.withOpacity(0.12),
                            borderRadius: BorderRadius.circular(12.0),
                            border: Border.all(color: OctalColors.error.withOpacity(0.35)),
                          ),
                          child: Row(
                            children: [
                              const Icon(Icons.error_outline, color: OctalColors.error, size: 18),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  _errorMessage,
                                  style: const TextStyle(
                                    color: OctalColors.error,
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

                      // Scan QR Code Button
                      SizedBox(
                        height: 50,
                        child: ElevatedButton.icon(
                          onPressed: () => setState(() => _showScanner = !_showScanner),
                          icon: const Icon(Icons.qr_code_scanner, color: OctalColors.bgDark, size: 20),
                          label: Text(
                            _showScanner ? 'Hide Scanner' : 'Scan Laptop QR Code',
                            style: const TextStyle(
                              fontFamily: 'Ubuntu',
                              fontSize: 14,
                              fontWeight: FontWeight.w900,
                              color: OctalColors.bgDark,
                            ),
                          ),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: OctalColors.primaryGold,
                            elevation: 4,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(14.0),
                            ),
                          ),
                        ),
                      ),

                      const SizedBox(height: 16),

                      // Manual Link Paste
                      TextField(
                        controller: _uriController,
                        style: const TextStyle(color: Colors.white, fontSize: 12),
                        decoration: InputDecoration(
                          hintText: 'octaldialer://join?sessionId=...',
                          hintStyle: const TextStyle(color: OctalColors.textMuted, fontSize: 11),
                          prefixIcon: const Icon(Icons.link, color: OctalColors.primaryGold, size: 18),
                          filled: true,
                          fillColor: OctalColors.surfaceElevated,
                          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
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

                      const SizedBox(height: 12),

                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton.icon(
                              onPressed: _pasteClipboard,
                              icon: const Icon(Icons.paste, size: 16, color: OctalColors.primaryGold),
                              label: const Text('Paste Link', style: TextStyle(color: OctalColors.primaryGold, fontSize: 12, fontWeight: FontWeight.bold)),
                              style: OutlinedButton.styleFrom(
                                side: const BorderSide(color: OctalColors.border),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                              ),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: ElevatedButton(
                              onPressed: _isLoading ? null : () => _connect(_uriController.text.trim()),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: OctalColors.surfaceElevated,
                                foregroundColor: Colors.white,
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                              ),
                              child: _isLoading
                                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(color: OctalColors.primaryGold, strokeWidth: 2))
                                  : const Text('Connect', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 24),

                // Back to Login Link
                Center(
                  child: TextButton.icon(
                    onPressed: () {
                      Navigator.pushReplacement(
                        context,
                        MaterialPageRoute(builder: (context) => const LoginScreen()),
                      );
                    },
                    icon: const Icon(Icons.arrow_back, color: OctalColors.textSecondary, size: 16),
                    label: const Text(
                      'Back to Account Login',
                      style: TextStyle(color: OctalColors.textSecondary, fontSize: 12, fontWeight: FontWeight.bold),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
