import 'dart:async';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/phone_bridge_service.dart';
import 'login_screen.dart';
import 'connect_screen.dart';
import 'connected_screen.dart';
import 'standalone_dialer_screen.dart';
import 'call_log_screen.dart';

class DeviceDashboardScreen extends StatefulWidget {
  const DeviceDashboardScreen({super.key});

  @override
  State<DeviceDashboardScreen> createState() => _DeviceDashboardScreenState();
}

class _DeviceDashboardScreenState extends State<DeviceDashboardScreen> with WidgetsBindingObserver {
  final PhoneBridgeService _bridge = PhoneBridgeService.instance;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _bridge.addListener(_onBridgeUpdate);
    _bridge.onBridgePaired = _handlePaired;
    _bridge.initializeAuthenticated().then((_) {
      if (_bridge.authToken.isEmpty && mounted) {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (context) => const LoginScreen()),
        );
      }
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _bridge.removeListener(_onBridgeUpdate);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      if (_bridge.socket != null && !_bridge.socket!.connected) {
        _bridge.socket!.connect();
      }
    }
  }

  void _onBridgeUpdate() {
    if (mounted) {
      setState(() {});
    }
  }

  void _handlePaired(Map<String, dynamic> data) {
    if (!mounted) return;
    final String sessionId = data['sessionId']?.toString() ?? '';
    final String token = data['token']?.toString() ?? '';
    final String laptopName = data['laptopName']?.toString() ?? 'Laptop Host';
    final String laptopBtAddress = data['laptopBtAddress']?.toString() ?? '00:1A:7D:DA:71:11';
    final String serverUrl = data['serverUrl']?.toString() ?? _bridge.serverUrl;

    if (sessionId.isNotEmpty) {
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (context) => ConnectedScreen(
            sessionId: sessionId,
            token: token,
            serverUrl: serverUrl,
            laptopName: laptopName,
            laptopBtAddress: laptopBtAddress,
            mode: PairingMode.authenticated,
          ),
        ),
      );
    }
  }

  void _requestConnectToLaptop() {
    _bridge.requestPairWithActiveLaptop();
  }

  Future<void> _logout() async {
    await _bridge.logout();
    if (mounted) {
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (context) => const LoginScreen()),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final isOnline = _bridge.isConnected;
    final errorMessage = _bridge.errorMessage;
    final statusMessage = _bridge.statusMessage;

    return Scaffold(
      backgroundColor: const Color(0xFF020617),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0F172A),
        title: const Row(
          children: [
            Icon(Icons.phone_in_talk, color: Color(0xFFFFB800), size: 20),
            SizedBox(width: 10),
            Text(
              'Octal Dialer Device',
              style: TextStyle(fontFamily: 'Ubuntu', fontSize: 15, fontWeight: FontWeight.bold, color: Colors.white),
            ),
          ],
        ),
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.logout, color: Colors.redAccent, size: 20),
            tooltip: 'Log Out',
            onPressed: _logout,
          ),
        ],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Error Banner
              if (errorMessage.isNotEmpty) ...[
                Container(
                  padding: const EdgeInsets.all(12.0),
                  decoration: BoxDecoration(
                    color: Colors.red.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(14.0),
                    border: Border.all(color: Colors.red.withOpacity(0.35)),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.error_outline, color: Colors.redAccent, size: 18),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          errorMessage,
                          style: const TextStyle(color: Colors.redAccent, fontSize: 12, fontWeight: FontWeight.bold),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
              ],

              // Account Identity Card
              Container(
                padding: const EdgeInsets.all(18.0),
                decoration: BoxDecoration(
                  color: const Color(0xFF0F172A),
                  borderRadius: BorderRadius.circular(20.0),
                  border: Border.all(color: const Color(0xFF1E293B), width: 1.5),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          'AUTHENTICATED ACCOUNT',
                          style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1.0, color: Color(0xFF94A3B8)),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: const Color(0xFFFFB800).withOpacity(0.15),
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: const Color(0xFFFFB800).withOpacity(0.3)),
                          ),
                          child: Text(
                            _bridge.role.toUpperCase(),
                            style: const TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: Color(0xFFFFB800)),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Container(
                          width: 42,
                          height: 42,
                          decoration: BoxDecoration(
                            color: const Color(0xFFFFB800).withOpacity(0.12),
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: const Color(0xFFFFB800).withOpacity(0.3)),
                          ),
                          child: const Icon(Icons.person, color: Color(0xFFFFB800), size: 22),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(_bridge.username, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Colors.white)),
                              if (_bridge.email.isNotEmpty)
                                Text(_bridge.email, style: const TextStyle(fontSize: 12, color: Color(0xFF94A3B8))),
                              Text('Tenant: ${_bridge.tenantId.isNotEmpty ? _bridge.tenantId : "tenant_default"}',
                                  style: const TextStyle(fontSize: 10, fontFamily: 'monospace', color: Color(0xFF64748B))),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 16),

              // Device Hardware Status Card
              Container(
                padding: const EdgeInsets.all(18.0),
                decoration: BoxDecoration(
                  color: const Color(0xFF0F172A),
                  borderRadius: BorderRadius.circular(20.0),
                  border: Border.all(
                    color: isOnline ? const Color(0xFF10B981).withOpacity(0.3) : const Color(0xFF1E293B),
                    width: 1.5,
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          'REGISTERED HANDSET',
                          style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1.0, color: Color(0xFF94A3B8)),
                        ),
                        Row(
                          children: [
                            Container(
                              width: 8,
                              height: 8,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: isOnline ? const Color(0xFF10B981) : Colors.redAccent,
                              ),
                            ),
                            const SizedBox(width: 6),
                            Text(
                              isOnline ? 'ONLINE' : 'CONNECTING',
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.bold,
                                color: isOnline ? const Color(0xFF10B981) : Colors.redAccent,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Container(
                          width: 42,
                          height: 42,
                          decoration: BoxDecoration(
                            color: const Color(0xFF10B981).withOpacity(0.12),
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: const Color(0xFF10B981).withOpacity(0.3)),
                          ),
                          child: const Icon(Icons.smartphone, color: Color(0xFF10B981), size: 22),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(_bridge.deviceName, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Colors.white)),
                              Text('${_bridge.deviceOs} • Octal App v1.2.0 • IP: ${_bridge.deviceIp}', style: const TextStyle(fontSize: 11, color: Color(0xFF94A3B8))),
                              Text('BT Bridge: ${_bridge.deviceBtAddress}', style: const TextStyle(fontSize: 10, fontFamily: 'monospace', color: Color(0xFF64748B))),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      decoration: BoxDecoration(
                        color: const Color(0xFF020617),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            isOnline ? Icons.check_circle_outline : Icons.sync,
                            size: 14,
                            color: isOnline ? const Color(0xFF10B981) : const Color(0xFFFFB800),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              statusMessage,
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.bold,
                                color: isOnline ? const Color(0xFF10B981) : const Color(0xFFFFB800),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 24),

              // Main Connect to Laptop Action
              ElevatedButton.icon(
                onPressed: isOnline ? _requestConnectToLaptop : null,
                icon: const Icon(Icons.laptop_chromebook, size: 18),
                label: const Text(
                  'CONNECT TO LAPTOP',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, letterSpacing: 1.0),
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFFFFB800),
                  foregroundColor: const Color(0xFF020617),
                  padding: const EdgeInsets.symmetric(vertical: 15.0),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14.0),
                  ),
                  elevation: 0,
                  disabledBackgroundColor: const Color(0xFF1E293B),
                ),
              ),

              const SizedBox(height: 12),

              // Secondary Actions
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (context) => StandaloneDialerScreen(
                              socket: _bridge.socket,
                              serverUrl: _bridge.serverUrl,
                              queue: const [],
                              onQueueUpdated: () {},
                              sessionId: '',
                            ),
                          ),
                        );
                      },
                      icon: const Icon(Icons.dialpad, size: 16),
                      label: const Text('DIALER', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.white,
                        side: const BorderSide(color: Color(0xFF1E293B)),
                        padding: const EdgeInsets.symmetric(vertical: 13.0),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12.0)),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (context) => CallLogScreen(
                              socket: _bridge.socket,
                              serverUrl: _bridge.serverUrl,
                            ),
                          ),
                        );
                      },
                      icon: const Icon(Icons.history, size: 16),
                      label: const Text('LOGS', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.white,
                        side: const BorderSide(color: Color(0xFF1E293B)),
                        padding: const EdgeInsets.symmetric(vertical: 13.0),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12.0)),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(builder: (context) => const ConnectScreen()),
                        );
                      },
                      icon: const Icon(Icons.qr_code, size: 16),
                      label: const Text('QR PAIR', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: const Color(0xFFFFB800),
                        side: BorderSide(color: const Color(0xFFFFB800).withOpacity(0.3)),
                        padding: const EdgeInsets.symmetric(vertical: 13.0),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12.0)),
                      ),
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 24),

              const Center(
                child: Text(
                  'When you click "Connect to Laptop" or click "Connect" on your website auto-dialer dashboard, your phone will pair and route physical SIM GSM calls automatically.',
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
