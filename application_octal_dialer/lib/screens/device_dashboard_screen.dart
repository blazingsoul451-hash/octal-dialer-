import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
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
  io.Socket? _socket;
  bool _isConnecting = true;
  bool _isSocketOnline = false;
  String _statusMessage = 'Connecting to Octal Bridge...';
  String _errorMessage = '';

  String _username = '';
  String _email = '';
  String _role = 'user';
  String _tenantId = 'tenant_default';
  String _serverUrl = 'http://localhost:3000';
  String _authToken = '';
  String _deviceUid = '';

  String _deviceName = 'Android Handset';
  String _deviceOs = 'Android';
  String _deviceBtAddress = '48:D2:24:D3:5F:AA';
  String _deviceIp = '127.0.0.1';

  static const MethodChannel _nativeChannel = MethodChannel('com.octal.dialer/call');

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _loadUserAndInit();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _socket?.disconnect();
    _socket?.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      if (_socket != null && !_socket!.connected) {
        _socket!.connect();
      }
    }
  }

  Future<void> _loadUserAndInit() async {
    final prefs = await SharedPreferences.getInstance();
    _authToken = prefs.getString('auth_token') ?? '';
    _username = prefs.getString('username') ?? 'Octal User';
    _email = prefs.getString('user_email') ?? '';
    _role = prefs.getString('user_role') ?? 'user';
    _tenantId = prefs.getString('tenant_id') ?? 'tenant_default';
    _serverUrl = prefs.getString('server_url') ?? 'http://localhost:3000';
    _deviceUid = prefs.getString('octal_device_uid') ?? '';

    if (_authToken.isEmpty) {
      if (mounted) {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (context) => const LoginScreen()),
        );
      }
      return;
    }

    await _initDeviceInfo();
    _initSocket();
  }

  Future<void> _initDeviceInfo() async {
    _deviceOs = Platform.isAndroid ? 'Android' : (Platform.isIOS ? 'iOS' : 'Desktop');
    if (Platform.isAndroid) {
      try {
        final Map? info = await _nativeChannel.invokeMethod('getDeviceInfo');
        if (info != null) {
          final manufacturer = (info['manufacturer'] ?? '').toString().trim();
          final model = (info['model'] ?? '').toString().trim();
          if (manufacturer.isNotEmpty || model.isNotEmpty) {
            _deviceName = '$manufacturer $model'.trim();
          }
        }
      } catch (_) {}
    }

    try {
      final interfaces = await NetworkInterface.list(includeLoopback: false, type: InternetAddressType.IPv4);
      for (var interface in interfaces) {
        for (var address in interface.addresses) {
          if (!address.isLoopback) {
            _deviceIp = address.address;
            break;
          }
        }
      }
    } catch (_) {}

    int hash = 0;
    for (int i = 0; i < _deviceName.length; i++) {
      hash = _deviceName.codeUnitAt(i) + ((hash << 5) - hash);
    }
    final mac = ['48', 'D2', '24', 'D3'];
    for (int i = 0; i < 2; i++) {
      final byte = ((hash >> (i * 8)) & 0xFF).toRadixString(16).toUpperCase().padLeft(2, '0');
      mac.add(byte);
    }
    _deviceBtAddress = mac.join(':');

    if (mounted) setState(() {});
  }

  void _initSocket() {
    _socket?.disconnect();
    _socket?.dispose();

    final cleanUrl = _serverUrl.replaceAll(RegExp(r'/+$'), '');

    _socket = io.io(
      cleanUrl,
      io.OptionBuilder()
          .setTransports(['websocket', 'polling'])
          .setExtraHeaders({'bypass-tunnel-reminder': 'true'})
          .enableReconnection()
          .setReconnectionAttempts(20)
          .setReconnectionDelay(1000)
          .setAuth({'token': _authToken})
          .build(),
    );

    _socket!.onConnect((_) {
      if (mounted) {
        setState(() {
          _isConnecting = false;
          _isSocketOnline = true;
          _statusMessage = 'Registering device with backend...';
        });
      }

      _socket!.emit('phone:auth-register', {
        'token': _authToken,
        'deviceUid': _deviceUid,
        'deviceName': _deviceName,
        'btAddress': _deviceBtAddress,
        'osType': _deviceOs,
        'ipAddress': _deviceIp,
        'platform': 'android',
        'appVersion': '1.2.0',
      });
    });

    _socket!.on('phone:auth-success', (data) {
      if (mounted) {
        setState(() {
          _isSocketOnline = true;
          _statusMessage = '● Device Online & Ready to Connect';
          _errorMessage = '';
        });
      }
    });

    _socket!.on('phone:auth-error', (data) {
      if (mounted) {
        setState(() {
          _errorMessage = data['error'] ?? 'Authentication failed.';
          _statusMessage = 'Authentication error';
        });
      }
    });

    // Pair event from server when laptop explicitly connects
    _socket!.on('bridge:paired', (data) {
      _handlePaired(data);
    });

    _socket!.on('phone:paired', (data) {
      _handlePaired(data);
    });

    _socket!.on('bridge:unpaired', (_) {
      if (mounted) {
        setState(() {
          _statusMessage = '● Device Online & Ready to Connect';
        });
      }
    });

    _socket!.onDisconnect((_) {
      if (mounted) {
        setState(() {
          _isSocketOnline = false;
          _statusMessage = 'Connecting to server...';
        });
      }
    });

    _socket!.onError((err) {
      debugPrint('[Socket Error] $err');
    });
  }

  void _handlePaired(dynamic data) {
    if (!mounted || data == null) return;
    final String sessionId = data['sessionId'] ?? '';
    final String token = data['token'] ?? '';
    final String laptopName = data['laptopName'] ?? 'Laptop Host';
    final String laptopBtAddress = data['laptopBtAddress'] ?? '00:1A:7D:DA:71:11';
    final String serverUrl = data['serverUrl'] ?? _serverUrl;

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
          ),
        ),
      );
    }
  }

  void _requestConnectToLaptop() {
    if (_socket != null && _socket!.connected) {
      setState(() => _statusMessage = 'Pairing with active laptop session...');
      _socket!.emit('phone:join', {
        'authToken': _authToken,
        'deviceName': _deviceName,
        'phoneBtAddress': _deviceBtAddress,
        'phoneOsType': _deviceOs,
        'phoneIpAddress': _deviceIp,
      });
    }
  }

  Future<void> _logout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('auth_token');
    await prefs.remove('user_id');
    await prefs.remove('username');
    await prefs.remove('user_email');
    await prefs.remove('connection_uri');

    _socket?.disconnect();
    _socket?.dispose();

    if (mounted) {
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (context) => const LoginScreen()),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
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
              if (_errorMessage.isNotEmpty) ...[
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
                          _errorMessage,
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
                            _role.toUpperCase(),
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
                              Text(_username, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Colors.white)),
                              if (_email.isNotEmpty)
                                Text(_email, style: const TextStyle(fontSize: 12, color: Color(0xFF94A3B8))),
                              Text('Tenant: $_tenantId', style: const TextStyle(fontSize: 10, fontFamily: 'monospace', color: Color(0xFF64748B))),
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
                    color: _isSocketOnline ? const Color(0xFF10B981).withOpacity(0.3) : const Color(0xFF1E293B),
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
                                color: _isSocketOnline ? const Color(0xFF10B981) : Colors.redAccent,
                              ),
                            ),
                            const SizedBox(width: 6),
                            Text(
                              _isSocketOnline ? 'ONLINE' : 'CONNECTING',
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.bold,
                                color: _isSocketOnline ? const Color(0xFF10B981) : Colors.redAccent,
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
                              Text(_deviceName, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Colors.white)),
                              Text('$_deviceOs • Octal App v1.2.0 • IP: $_deviceIp', style: const TextStyle(fontSize: 11, color: Color(0xFF94A3B8))),
                              Text('BT Bridge: $_deviceBtAddress', style: const TextStyle(fontSize: 10, fontFamily: 'monospace', color: Color(0xFF64748B))),
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
                            _isSocketOnline ? Icons.check_circle_outline : Icons.sync,
                            size: 14,
                            color: _isSocketOnline ? const Color(0xFF10B981) : const Color(0xFFFFB800),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              _statusMessage,
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.bold,
                                color: _isSocketOnline ? const Color(0xFF10B981) : const Color(0xFFFFB800),
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
                onPressed: _isSocketOnline ? _requestConnectToLaptop : null,
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
                              socket: _socket,
                              serverUrl: _serverUrl,
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
                              socket: _socket,
                              serverUrl: _serverUrl,
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
