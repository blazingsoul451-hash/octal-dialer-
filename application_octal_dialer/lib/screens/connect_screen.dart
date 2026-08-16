import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'connected_screen.dart';
import 'login_screen.dart';
import 'device_dashboard_screen.dart';

class ConnectScreen extends StatefulWidget {
  const ConnectScreen({super.key});

  @override
  State<ConnectScreen> createState() => _ConnectScreenState();
}

class _ConnectScreenState extends State<ConnectScreen> {
  final TextEditingController _uriController = TextEditingController();
  String _errorMessage = '';
  bool _isLoading = false;
  bool _showScanner = false;

  @override
  void initState() {
    super.initState();
    _checkSavedConnection();
  }

  Future<void> _checkSavedConnection() async {
    final prefs = await SharedPreferences.getInstance();
    final savedUri = prefs.getString('connection_uri');
    if (savedUri != null && savedUri.isNotEmpty) {
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
      String? serverUrl = parsed.queryParameters['serverUrl'];
      String laptopName = parsed.queryParameters['laptop'] ?? 'Laptop Host';
      String laptopBtAddress = parsed.queryParameters['bt'] ?? '00:11:22:33:44:55';

      if (serverUrl == null && (parsed.scheme == 'http' || parsed.scheme == 'https') && parsed.host.isNotEmpty) {
        final portStr = parsed.hasPort ? ':${parsed.port}' : (parsed.scheme == 'https' ? '' : ':3000');
        serverUrl = '${parsed.scheme}://${parsed.host}$portStr';
      }

      if (sessionId == null || sessionId.isEmpty || token == null || token.isEmpty || serverUrl == null || serverUrl.isEmpty) {
        throw const FormatException('Missing required pairing parameters in QR payload');
      }

      final serverUri = Uri.parse(serverUrl);
      // Require HTTPS for production, allow HTTP for localhost & local private LAN networks
      final isLocalhostOrLAN = serverUri.host == 'localhost' ||
                               serverUri.host == '127.0.0.1' ||
                               serverUri.host.startsWith('192.168.') ||
                               serverUri.host.startsWith('10.') ||
                               serverUri.host.startsWith('172.') ||
                               serverUri.host.endsWith('.local');
      if (serverUri.scheme != 'https' && !isLocalhostOrLAN) {
        throw const FormatException('Server URL must use HTTPS (HTTP allowed only for localhost and private LAN testing)');
      }
      if (!['http', 'https'].contains(serverUri.scheme)) {
        throw const FormatException('Invalid server URL scheme (must be http/https)');
      }
      if (serverUri.host.isEmpty) {
        throw const FormatException('Invalid server URL (empty host)');
      }
      if (sessionId.length > 100 || token.length > 1000) {
        throw const FormatException('Invalid token format');
      }

      // Save connection
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('connection_uri', uri);

      if (mounted) {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(
            builder: (context) => ConnectedScreen(
              sessionId: sessionId,
              token: token,
              serverUrl: serverUrl!,
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
      if (autoConnect) {
        final prefs = await SharedPreferences.getInstance();
        await prefs.remove('connection_uri');
      }
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
      backgroundColor: const Color(0xFF020617),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 16.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Column(
                children: [
                  Container(
                    width: 64,
                    height: 64,
                    decoration: BoxDecoration(
                      color: const Color(0xFFFFB800).withOpacity(0.1),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(
                        color: const Color(0xFFFFB800).withOpacity(0.3),
                        width: 1.5,
                      ),
                    ),
                    child: const Icon(
                      Icons.bluetooth_connected,
                      color: Color(0xFFFFB800),
                      size: 36,
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
                    'BLUETOOTH LINK BRIDGE',
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                      letterSpacing: 2.0,
                      color: Colors.white.withOpacity(0.4),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 32),

              if (_showScanner) ...[
                Container(
                  height: 240,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: const Color(0xFFFFB800), width: 1.5),
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
                  child: const Text('Close Camera Scanner', style: TextStyle(color: Colors.redAccent, fontSize: 11)),
                ),
                const SizedBox(height: 16),
              ],

              Container(
                padding: const EdgeInsets.all(20.0),
                decoration: BoxDecoration(
                  color: const Color(0xFF0F172A),
                  borderRadius: BorderRadius.circular(24.0),
                  border: Border.all(
                    color: const Color(0xFFFFB800).withOpacity(0.15),
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
                          color: Colors.red.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(12.0),
                          border: Border.all(
                            color: Colors.red.withOpacity(0.3),
                          ),
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
                      'CONNECTION URI',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 1.0,
                        color: Color(0xFF94A3B8),
                      ),
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: _uriController,
                      style: const TextStyle(fontSize: 12, fontFamily: 'monospace', color: Colors.white),
                      decoration: InputDecoration(
                        hintText: 'octaldialer://join?sessionId=...',
                        hintStyle: TextStyle(color: Colors.white.withOpacity(0.2)),
                        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                        fillColor: const Color(0xFF020617),
                        filled: true,
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
                    const SizedBox(height: 20),

                    Row(
                      children: [
                        Expanded(
                          child: ElevatedButton.icon(
                            onPressed: () => setState(() => _showScanner = !_showScanner),
                            icon: const Icon(Icons.qr_code_scanner, size: 16),
                            label: const Text('SCAN QR', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFF1E293B),
                              foregroundColor: const Color(0xFFFFB800),
                              padding: const EdgeInsets.symmetric(vertical: 14.0),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(14.0),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: ElevatedButton.icon(
                            onPressed: _pasteClipboard,
                            icon: const Icon(Icons.assignment, size: 16),
                            label: const Text('PASTE LINK', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFF1E293B),
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(vertical: 14.0),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(14.0),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: ElevatedButton.icon(
                            onPressed: _isLoading ? null : () => _connect(_uriController.text.trim()),
                            icon: _isLoading
                                ? const SizedBox(
                                    width: 14,
                                    height: 14,
                                    child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF020617)),
                                  )
                                : const Icon(Icons.link, size: 16),
                            label: const Text('CONNECT', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFFFFB800),
                              foregroundColor: const Color(0xFF020617),
                              padding: const EdgeInsets.symmetric(vertical: 14.0),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(14.0),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),

                    if (_isLoading && !_showScanner) ...[
                      const SizedBox(height: 16),
                      const Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          SizedBox(
                            width: 14, height: 14,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFFFFB800)),
                          ),
                          SizedBox(width: 8),
                          Text('Restoring session link...', style: TextStyle(fontSize: 10, color: Color(0xFF94A3B8))),
                        ],
                      ),
                    ],
                  ],
                ),
              ),

              const SizedBox(height: 24),
              const Center(
                child: Text(
                  'Scan the pairing QR code from your laptop web console, or tap "Paste Link" to connect over Bluetooth bridge.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 11,
                    color: Color(0xFF94A3B8),
                    height: 1.5,
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Center(
                child: TextButton.icon(
                  onPressed: () async {
                    final prefs = await SharedPreferences.getInstance();
                    final authToken = prefs.getString('auth_token');
                    if (context.mounted) {
                      if (authToken != null && authToken.isNotEmpty) {
                        Navigator.pushReplacement(
                          context,
                          MaterialPageRoute(builder: (context) => const DeviceDashboardScreen()),
                        );
                      } else {
                        Navigator.pushReplacement(
                          context,
                          MaterialPageRoute(builder: (context) => const LoginScreen()),
                        );
                      }
                    }
                  },
                  icon: const Icon(Icons.account_circle_outlined, size: 16, color: Color(0xFFFFB800)),
                  label: const Text(
                    'Return to Account Login / Device Dashboard',
                    style: TextStyle(color: Color(0xFFFFB800), fontSize: 12, fontWeight: FontWeight.bold),
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
