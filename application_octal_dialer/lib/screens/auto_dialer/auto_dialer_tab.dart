import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../widgets/octal_logo.dart';
import '../../services/phone_bridge_service.dart';
import '../../config/app_config.dart';
import '../device_dashboard_screen.dart';

class AutoDialerTab extends StatefulWidget {
  const AutoDialerTab({super.key});

  @override
  State<AutoDialerTab> createState() => _AutoDialerTabState();
}

class _AutoDialerTabState extends State<AutoDialerTab> {
  final PhoneBridgeService _bridge = PhoneBridgeService.instance;
  bool _isScanning = false;
  bool _isLoading = false;
  String _errorMessage = '';

  @override
  void initState() {
    super.initState();
    _bridge.addListener(_onBridgeUpdate);
  }

  @override
  void dispose() {
    _bridge.removeListener(_onBridgeUpdate);
    super.dispose();
  }

  void _onBridgeUpdate() {
    if (mounted) setState(() {});
  }

  Future<void> _handleQrDetected(BarcodeCapture capture) async {
    final List<Barcode> barcodes = capture.barcodes;
    for (final barcode in barcodes) {
      if (barcode.rawValue != null) {
        final uri = barcode.rawValue!;
        setState(() {
          _isScanning = false;
          _isLoading = true;
          _errorMessage = '';
        });
        await _connectWithUri(uri);
        break;
      }
    }
  }

  Future<void> _connectWithUri(String uri) async {
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
      } else {
        effectiveServerUrl = AppConfig.apiBaseUrl;
      }

      if (sessionId == null || sessionId.isEmpty || token == null || token.isEmpty) {
        throw Exception('Invalid QR code: missing sessionId or token');
      }

      await AppConfig.setBaseUrl(effectiveServerUrl);

      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('connection_uri', uri);

      await _bridge.pairWithQrSession(
        sessionId: sessionId,
        token: token,
        serverUrl: effectiveServerUrl,
        laptopName: laptopName,
        laptopBtAddress: laptopBtAddress,
      );

      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    } catch (e) {
      setState(() {
        _errorMessage = e.toString().replaceFirst('Exception: ', '');
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    // If authenticated & paired, display the full Octal Auto Dialer dashboard
    if (_bridge.isPaired) {
      return const DeviceDashboardScreen();
    }

    // Clean, zero-fuss QR scan interface to connect to laptop
    return Scaffold(
      backgroundColor: OctalColors.bgDark,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                // Clean Header
                const Text(
                  'Auto Dialer',
                  style: TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Scan the QR code on your laptop screen\nto begin automated calling',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 13,
                    color: OctalColors.textSecondary,
                    height: 1.3,
                  ),
                ),

                const SizedBox(height: 32),

                // QR Code Viewfinder Card
                GestureDetector(
                  onTap: () => setState(() => _isScanning = !_isScanning),
                  child: Container(
                    width: 250,
                    height: 250,
                    decoration: BoxDecoration(
                      color: OctalColors.surfaceCard,
                      borderRadius: BorderRadius.circular(24),
                      border: Border.all(color: OctalColors.border, width: 1.5),
                      boxShadow: [
                        BoxShadow(
                          color: OctalColors.primaryGold.withOpacity(0.12),
                          blurRadius: 28,
                          spreadRadius: 2,
                        ),
                      ],
                    ),
                    child: Stack(
                      alignment: Alignment.center,
                      children: [
                        // Glowing Corner Brackets [ ]
                        CustomPaint(
                          size: const Size(210, 210),
                          painter: _QrCornerBracketPainter(color: OctalColors.primaryGold),
                        ),

                        if (_isScanning)
                          ClipRRect(
                            borderRadius: BorderRadius.circular(18),
                            child: SizedBox(
                              width: 190,
                              height: 190,
                              child: MobileScanner(
                                onDetect: _handleQrDetected,
                              ),
                            ),
                          )
                        else
                          Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Container(
                                width: 84,
                                height: 84,
                                decoration: BoxDecoration(
                                  color: OctalColors.primaryGold.withOpacity(0.12),
                                  borderRadius: BorderRadius.circular(16),
                                ),
                                child: const Center(
                                  child: Icon(
                                    Icons.qr_code_2_rounded,
                                    color: OctalColors.primaryGold,
                                    size: 58,
                                  ),
                                ),
                              ),
                              const SizedBox(height: 14),
                              const Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(Icons.camera_alt_outlined, color: OctalColors.textSecondary, size: 15),
                                  SizedBox(width: 6),
                                  Text(
                                    'Tap to scan QR code',
                                    style: TextStyle(
                                      color: Colors.white,
                                      fontSize: 12.5,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),

                        if (_isLoading)
                          Container(
                            decoration: BoxDecoration(
                              color: Colors.black54,
                              borderRadius: BorderRadius.circular(24),
                            ),
                            child: const Center(
                              child: CircularProgressIndicator(color: OctalColors.primaryGold),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),

                if (_errorMessage.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  Text(
                    _errorMessage,
                    style: const TextStyle(color: OctalColors.error, fontSize: 12),
                    textAlign: TextAlign.center,
                  ),
                ],

                const SizedBox(height: 28),

                // Manual connection option
                TextButton.icon(
                  onPressed: () => _showManualConnectDialog(context),
                  icon: const Icon(Icons.keyboard_outlined, size: 16, color: OctalColors.primaryGold),
                  label: const Text(
                    'Enter Pairing Code Manually',
                    style: TextStyle(color: OctalColors.primaryGold, fontSize: 12.5, fontWeight: FontWeight.bold),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _showManualConnectDialog(BuildContext context) {
    final controller = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: OctalColors.surfaceCard,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Text('Manual Pairing', style: TextStyle(color: Colors.white, fontSize: 16)),
        content: TextField(
          controller: controller,
          style: const TextStyle(color: Colors.white, fontSize: 13),
          decoration: const InputDecoration(
            hintText: 'Paste connection URI or code',
            hintStyle: TextStyle(color: OctalColors.textMuted),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel', style: TextStyle(color: OctalColors.textSecondary)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: OctalColors.primaryGold),
            onPressed: () {
              Navigator.pop(ctx);
              if (controller.text.trim().isNotEmpty) {
                _connectWithUri(controller.text.trim());
              }
            },
            child: const Text('Connect', style: TextStyle(color: Colors.black, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }
}

class _QrCornerBracketPainter extends CustomPainter {
  final Color color;

  _QrCornerBracketPainter({required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 3.0
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    const cornerLength = 26.0;
    final w = size.width;
    final h = size.height;

    // Top-Left
    canvas.drawLine(const Offset(0, 0), const Offset(cornerLength, 0), paint);
    canvas.drawLine(const Offset(0, 0), const Offset(0, cornerLength), paint);

    // Top-Right
    canvas.drawLine(Offset(w, 0), Offset(w - cornerLength, 0), paint);
    canvas.drawLine(Offset(w, 0), Offset(w, cornerLength), paint);

    // Bottom-Left
    canvas.drawLine(Offset(0, h), Offset(cornerLength, h), paint);
    canvas.drawLine(Offset(0, h), Offset(0, h - cornerLength), paint);

    // Bottom-Right
    canvas.drawLine(Offset(w, h), Offset(w - cornerLength, h), paint);
    canvas.drawLine(Offset(w, h), Offset(w, h - cornerLength), paint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
