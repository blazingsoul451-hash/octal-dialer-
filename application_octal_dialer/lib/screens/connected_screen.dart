import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import '../services/phone_bridge_service.dart';
import 'connect_screen.dart';
import 'device_dashboard_screen.dart';
import 'calling_screen.dart';
import 'standalone_dialer_screen.dart';
import 'call_log_screen.dart';
import 'dashboard_screen.dart';
import 'main_shell_screen.dart';

class ConnectedScreen extends StatefulWidget {
  final String sessionId;
  final String token;
  final String serverUrl;
  final String laptopName;
  final String laptopBtAddress;
  final PairingMode mode;

  const ConnectedScreen({
    super.key,
    required this.sessionId,
    required this.token,
    required this.serverUrl,
    required this.laptopName,
    required this.laptopBtAddress,
    this.mode = PairingMode.authenticated,
  });

  @override
  State<ConnectedScreen> createState() => _ConnectedScreenState();
}

class _ConnectedScreenState extends State<ConnectedScreen> with WidgetsBindingObserver {
  io.Socket? _socket;
  bool _isConnected = false;
  int _selectedTabIndex = 0;
  final List<String> _logs = [];
  Timer? _pingTimer;

  late String _deviceBtAddress;
  late String _deviceName;
  bool _isInCall = false;

  static const MethodChannel _nativeChannel = MethodChannel('com.octal.dialer/call');

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);

    // Initial placeholder values before the async call completes
    _deviceName = 'Android Device';
    _deviceBtAddress = '';

    _initDeviceCredentials().then((_) {
      _initSocket();
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _pingTimer?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      // App came back to foreground — verify socket connection
      if (_socket != null && !_socket!.connected) {
        _socket!.connect();
      }
    }
  }

  Future<void> _initDeviceCredentials() async {
    String modelName = 'Android Device';
    if (Platform.isAndroid) {
      try {
        final Map? info = await _nativeChannel.invokeMethod('getDeviceInfo');
        if (info != null) {
          final manufacturer = (info['manufacturer'] ?? '').toString().trim();
          final model = (info['model'] ?? '').toString().trim();

          if (manufacturer.length > 256 || model.length > 256) {
            throw Exception('Invalid device info length');
          }
          if (manufacturer.contains('\n') || model.contains('\n')) {
            throw Exception('Invalid device info format');
          }

          modelName = '$manufacturer $model'.trim();
          if (modelName.isEmpty) modelName = 'Android Device';
        }
      } catch (_) {}
    } else if (Platform.isIOS) {
      modelName = 'iPhone';
    }

    _deviceName = modelName;

    final host = _deviceName;
    int hash = 0;
    for (int i = 0; i < host.length; i++) {
      hash = host.codeUnitAt(i) + ((hash << 5) - hash);
    }
    final mac = ['48', 'D2', '24', 'D3'];
    for (int i = 0; i < 2; i++) {
      final byte = ((hash >> (i * 8)) & 0xFF).toRadixString(16).toUpperCase().padLeft(2, '0');
      mac.add(byte);
    }
    _deviceBtAddress = mac.join(':');

    if (mounted) {
      setState(() {});
    }
  }

  void _addLog(String log) {
    if (mounted) {
      setState(() {
        final timeStr = DateTime.now().toLocal().toString().split(' ')[1].substring(0, 8);
        _logs.add('[$timeStr] $log');
        if (_logs.length > 30) {
          _logs.removeAt(0);
        }
      });
    }
  }

  void _initSocket() {
    _addLog('[System] Using Authenticated Phone Bridge socket...');
    _socket = PhoneBridgeService.instance.socket;
    _isConnected = PhoneBridgeService.instance.isPaired || PhoneBridgeService.instance.isConnected;
    if (_socket == null || !_socket!.connected) {
      _addLog('[Bridge] Warning: Authenticated socket not connected. Re-connecting...');
      PhoneBridgeService.instance.initializeAuthenticated();
      _socket = PhoneBridgeService.instance.socket;
    }
    _attachSocketListeners();
    _addLog('[Bridge] Bluetooth Link Channel Active! Ready for calls.');
    _startHeartbeat();
    _checkOtaUpdate();
  }

  void _attachSocketListeners() {
    if (_socket == null) return;

    _socket!.onDisconnect((_) {
      if (mounted) {
        setState(() {
          _isConnected = false;
        });
      }
      _addLog('[Socket] Disconnected from server');
    });

    _socket!.onConnectError((err) {
      _addLog('[Socket] Connect error: $err');
    });

    void onPairedHandler(dynamic data) {
      if (mounted) {
        setState(() {
          _isConnected = true;
        });
      }
      _addLog('[Bridge] Bluetooth Link Channel Active! Ready for calls.');
      _startHeartbeat();
      _checkOtaUpdate();
      _syncSimInfo();
    }

    _socket!.on('bridge:paired', onPairedHandler);
    _socket!.on('phone:paired', onPairedHandler);

    _socket!.on('phone:pong', (_) {
      // Heartbeat acknowledged by laptop server
    });

    _socket!.on('phone:ping', (data) {
      final timestamp = data != null ? data['timestamp'] : null;
      _socket!.emit('phone:pong', {
        'sessionId': widget.sessionId,
        'timestamp': timestamp,
      });
    });

    _socket!.on('app:update_available', (data) {
      final String latestVersion = data['latestVersion'] ?? '1.0.1';
      final String apkUrl = data['apkUrl'] ?? '';
      final String releaseNotes = data['releaseNotes'] ?? '';
      _addLog('[OTA Engine] NEW UPDATE DETECTED: v$latestVersion!');
      _showUpdateDialog(latestVersion, apkUrl, releaseNotes);
    });

    _socket!.on('app:up_to_date', (data) {
      _addLog('[OTA Engine] App is on latest release (v${data['version']}).');
    });

    _socket!.on('phone:kicked', (data) {
      _addLog('[Bridge] Revoked by host: ${data['reason'] ?? 'None'}');
      _disconnect();
    });

    _socket!.on('bridge:unpaired', (_) {
      _addLog('[Bridge] Unpaired by laptop dashboard.');
      _disconnect();
    });

    _socket!.on('session:ended', (_) {
      _addLog('[Bridge] Session ended by laptop.');
      _disconnect();
    });

    _socket!.on('phone:dial', (data) {
      final String phone = data['phone'] ?? '';
      final String name = data['name'] ?? 'Unknown Lead';
      final String leadId = data['leadId'] ?? '';
      final String? commandId = data['commandId'];
      final String? callId = data['callId'];
      final int timeout = data['timeout'] ?? 30;
      final int? simSlot = data['simSlot'] is int
          ? data['simSlot'] as int
          : (data['simSlot'] != null ? int.tryParse(data['simSlot'].toString()) : null);

      _addLog('[Bridge] LAPTOP REQUEST CALL -> $name ($phone)');

      // Guard: If already in a call, reject explicitly with dial-ack so backend/laptop doesn't hang!
      if (_isInCall) {
        _addLog('[Bridge] Busy: currently in active call — rejecting dial command');
        _socket?.emit('phone:dial-ack', {
          'commandId': commandId,
          'callId': callId,
          'accepted': false,
          'reason': 'BUSY_IN_CALL',
        });
        return;
      }

      if (mounted) {
        _isInCall = true;
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (context) => CallingScreen(
              phone: phone,
              name: name,
              leadId: leadId,
              commandId: commandId,
              callId: callId,
              simSlot: simSlot,
              timeout: timeout,
              socket: _socket!,
              sessionId: widget.sessionId,
              onCallEnded: () {
                _isInCall = false;
              },
            ),
          ),
        ).then((_) {
          _isInCall = false;
        });
      }
    });
  }

  Future<void> _syncSimInfo() async {
    try {
      final res = await _nativeChannel.invokeMethod('getSimInfo');
      if (res is Map && _socket != null) {
        _socket!.emit('phone:sim-info', {
          'sessionId': widget.sessionId,
          'sims': res['sims'],
          'selectedSimSlot': res['selectedSimSlot'],
          'selectedCarrierName': res['selectedCarrierName'],
        });
        _addLog('[Bridge] Synced SIM profile to dashboard (${res['sims'] is List ? (res['sims'] as List).length : 0} SIMs)');
      }
    } catch (e) {
      debugPrint('[ConnectedScreen] _syncSimInfo error: $e');
    }
  }

  void _startHeartbeat() {
    _pingTimer?.cancel();
    _pingTimer = Timer.periodic(const Duration(seconds: 10), (timer) {
      if (_socket != null && _socket!.connected) {
        _socket!.emit('phone:ping');
      }
    });
  }

  void _checkOtaUpdate() {
    _addLog('[OTA Engine] Checking for live backend updates...');
    _socket?.emit('app:version_check', {'currentVersion': '1.2.0'});
  }

  void _showUpdateDialog(String version, String apkUrl, String notes) {
    if (!mounted) return;
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => _OtaUpdateDialog(
        version: version,
        apkUrl: apkUrl,
        notes: notes,
      ),
    );
  }

  Future<void> _disconnect() async {
    PhoneBridgeService.instance.disconnectSession();

    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('connection_uri');
    final authToken = prefs.getString('auth_token');

    if (mounted) {
      if (authToken != null && authToken.isNotEmpty) {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (context) => const DeviceDashboardScreen()),
        );
      } else {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (context) => const ConnectScreen()),
        );
      }
    }
  }

  // Lifted state for mobile queue
  final List<LeadItem> _mobileQueue = [];

  void _onQueueUpdated() {
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF020617),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0F172A),
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded, color: Colors.white),
          tooltip: 'Back to Phone',
          onPressed: () {
            Navigator.of(context).pushAndRemoveUntil(
              MaterialPageRoute(builder: (_) => const MainShellScreen(initialTabIndex: 0)),
              (route) => false,
            );
          },
        ),
        title: Text(
          _selectedTabIndex == 0
              ? 'Campaign Dashboard'
              : (_selectedTabIndex == 1
                  ? 'Auto Dialer'
                  : (_selectedTabIndex == 2 ? 'Call Log' : 'Bluetooth Link')),
          style: const TextStyle(fontFamily: 'Ubuntu', fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.power_settings_new, color: Colors.redAccent),
            tooltip: 'Disconnect',
            onPressed: _disconnect,
          ),
        ],
      ),
      body: IndexedStack(
        index: _selectedTabIndex,
        children: [
          DashboardScreen(
            queue: _mobileQueue,
            serverUrl: widget.serverUrl,
            onLoadCampaign: (campaignLeads, campaignId) {
              setState(() {
                _mobileQueue.clear();
                _mobileQueue.addAll(campaignLeads);
                _selectedTabIndex = 1; // switch to auto-dialer tab
              });
            },
          ),
          StandaloneDialerScreen(
            socket: _socket,
            serverUrl: widget.serverUrl,
            queue: _mobileQueue,
            onQueueUpdated: _onQueueUpdated,
            sessionId: widget.sessionId,
          ),
          CallLogScreen(
            socket: _socket,
            serverUrl: widget.serverUrl,
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(20.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: const Color(0xFF0F172A),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: const Color(0xFF1E293B)),
                    ),
                    child: Column(
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Row(
                              children: [
                                Icon(
                                  _isConnected ? Icons.bluetooth_connected : Icons.bluetooth_disabled,
                                  color: _isConnected ? const Color(0xFFFFB800) : Colors.redAccent,
                                  size: 20,
                                ),
                                const SizedBox(width: 8),
                                Text(
                                  _isConnected ? 'PAIRED & LINKED' : 'UNPAIRED',
                                  style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.bold,
                                    color: _isConnected ? const Color(0xFFFFB800) : Colors.redAccent,
                                    letterSpacing: 1.0,
                                  ),
                                ),
                              ],
                            ),
                            Container(
                              width: 8,
                              height: 8,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: _isConnected ? const Color(0xFFFFB800) : Colors.redAccent,
                              ),
                            )
                          ],
                        ),
                        const SizedBox(height: 16),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text('LAPTOP HOST', style: TextStyle(fontSize: 8, fontFamily: 'monospace', color: Color(0xFF64748B))),
                                Text(widget.laptopName, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Colors.white)),
                                Text(widget.laptopBtAddress, style: const TextStyle(fontSize: 10, fontFamily: 'monospace', color: Color(0xFFFFB800))),
                              ],
                            ),
                            const Icon(Icons.swap_horiz, color: Color(0xFF64748B)),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                const Text('PAIRED MOBILE', style: TextStyle(fontSize: 8, fontFamily: 'monospace', color: Color(0xFF64748B))),
                                Text(_deviceName, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Colors.white)),
                                Text(_deviceBtAddress, style: const TextStyle(fontSize: 10, fontFamily: 'monospace', color: Color(0xFFFFB800))),
                              ],
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),

                  const Text(
                    'BRIDGE CHANNEL LOG MONITOR',
                    style: TextStyle(fontSize: 9, fontFamily: 'monospace', fontWeight: FontWeight.bold, color: Color(0xFF94A3B8)),
                  ),
                  const SizedBox(height: 8),
                  Expanded(
                    child: Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: const Color(0xFF020617),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: const Color(0xFF1E293B)),
                      ),
                      child: _logs.isEmpty
                          ? const Center(child: Text('Initializing serial channel...', style: TextStyle(fontFamily: 'monospace', fontSize: 10, color: Color(0xFF64748B))))
                          : ListView.builder(
                              itemCount: _logs.length,
                              itemBuilder: (context, index) {
                                return Padding(
                                  padding: const EdgeInsets.only(bottom: 4.0),
                                  child: Text(
                                    _logs[index],
                                    style: const TextStyle(
                                      fontFamily: 'monospace',
                                      fontSize: 10,
                                      color: Color(0xFFFFB800),
                                      height: 1.4,
                                    ),
                                  ),
                                );
                              },
                            ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _selectedTabIndex + 1,
        onTap: (index) {
          if (index == 0) {
            Navigator.of(context).pushAndRemoveUntil(
              MaterialPageRoute(builder: (_) => const MainShellScreen(initialTabIndex: 0)),
              (route) => false,
            );
          } else {
            setState(() {
              _selectedTabIndex = index - 1;
            });
          }
        },
        backgroundColor: const Color(0xFF0F172A),
        selectedItemColor: const Color(0xFFFFB800),
        unselectedItemColor: const Color(0xFF64748B),
        selectedFontSize: 11,
        unselectedFontSize: 11,
        type: BottomNavigationBarType.fixed,
        items: const [
          BottomNavigationBarItem(
            icon: Icon(Icons.home_outlined),
            activeIcon: Icon(Icons.home_rounded, color: Color(0xFFFFB800)),
            label: 'Home',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.pie_chart_outline),
            activeIcon: Icon(Icons.pie_chart, color: Color(0xFFFFB800)),
            label: 'Dashboard',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.phone_in_talk_outlined),
            activeIcon: Icon(Icons.phone_in_talk, color: Color(0xFFFFB800)),
            label: 'Auto Dialer',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.history_outlined),
            activeIcon: Icon(Icons.history, color: Color(0xFFFFB800)),
            label: 'Call Log',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.bluetooth),
            activeIcon: Icon(Icons.bluetooth_connected, color: Color(0xFFFFB800)),
            label: 'BT Link',
          ),
        ],
      ),
    );
  }
}

// ─── OTA Update Dialog with in-app download + auto install ────────────────────
class _OtaUpdateDialog extends StatefulWidget {
  final String version;
  final String apkUrl;
  final String notes;
  const _OtaUpdateDialog({required this.version, required this.apkUrl, required this.notes});

  @override
  State<_OtaUpdateDialog> createState() => _OtaUpdateDialogState();
}

class _OtaUpdateDialogState extends State<_OtaUpdateDialog> {
  double _progress = 0;
  int _receivedBytes = 0;
  int _totalBytes = 0;
  String _status = 'idle'; // idle | downloading | done | error
  String _errorMsg = '';

  Future<void> _downloadAndInstall() async {
    setState(() { _status = 'downloading'; _errorMsg = ''; });
    http.Client? client;
    IOSink? sink;
    try {
      final dir = await getTemporaryDirectory();
      final apkPath = '${dir.path}/OctalDialer_update.apk';
      final file = File(apkPath);

      int existingLength = 0;
      if (await file.exists()) {
        try {
          existingLength = await file.length();
        } catch (_) {
          existingLength = 0;
        }
      }

      final request = http.Request('GET', Uri.parse(widget.apkUrl));
      if (existingLength > 0) {
        request.headers['Range'] = 'bytes=$existingLength-';
      }

      client = http.Client();
      final response = await client.send(request);

      bool isPartial = response.statusCode == 206;
      int total = (response.contentLength ?? 0) + (isPartial ? existingLength : 0);
      int received = isPartial ? existingLength : 0;

      if (!isPartial && existingLength > 0 && response.statusCode == 200) {
        // Server doesn't support range resume — restart clean
        try { await file.delete(); } catch (_) {}
        received = 0;
      }

      sink = file.openWrite(mode: isPartial ? FileMode.append : FileMode.write);

      await response.stream.forEach((chunk) {
        received += chunk.length;
        if (mounted) {
          setState(() {
            _receivedBytes = received;
            _totalBytes = total;
            _progress = total > 0 ? (received / total) : 0;
          });
        }
        sink!.add(chunk);
      });

      await sink.flush();
      await sink.close();
      sink = null;

      if (mounted) {
        setState(() { _status = 'done'; _progress = 1.0; });
      }

      if (mounted) {
        setState(() { _errorMsg = 'APK signature verification not yet implemented. Manual installation required.'; });
      }
    } catch (e) {
      if (sink != null) {
        try { await sink.close(); } catch (_) {}
      }
      if (mounted) {
        setState(() {
          _status = 'error';
          _errorMsg = 'Download interrupted. Tap RETRY to resume (${_formatMb(_receivedBytes)} downloaded).';
        });
      }
    } finally {
      client?.close();
    }
  }

  String _formatMb(int bytes) {
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      backgroundColor: const Color(0xFF0F172A),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: Color(0xFFFFB800)),
      ),
      title: Row(
        children: [
          const Icon(Icons.system_update_alt, color: Color(0xFFFFB800)),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'UPDATE v${widget.version} AVAILABLE',
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.white),
            ),
          ),
        ],
      ),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (widget.notes.isNotEmpty) ...[
            Text(widget.notes, style: const TextStyle(fontSize: 10, color: Color(0xFFFFB800), fontFamily: 'monospace')),
            const SizedBox(height: 12),
          ],
          if (_status == 'idle')
            const Text(
              'New version ready on your laptop. Tap UPDATE to download and install automatically.',
              style: TextStyle(fontSize: 11, color: Colors.white70),
            ),
          if (_status == 'downloading') ...[
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('Downloading update...', style: TextStyle(fontSize: 11, color: Colors.white70)),
                Text(
                  _totalBytes > 0
                      ? '${_formatMb(_receivedBytes)} / ${_formatMb(_totalBytes)}'
                      : _formatMb(_receivedBytes),
                  style: const TextStyle(fontSize: 10, color: Color(0xFFFFB800), fontFamily: 'monospace', fontWeight: FontWeight.bold),
                ),
              ],
            ),
            const SizedBox(height: 8),
            LinearProgressIndicator(
              value: _progress > 0 ? _progress : null,
              backgroundColor: const Color(0xFF1E293B),
              valueColor: const AlwaysStoppedAnimation<Color>(Color(0xFFFFB800)),
              minHeight: 6,
              borderRadius: BorderRadius.circular(3),
            ),
            const SizedBox(height: 6),
            Text(
              '${(_progress * 100).toStringAsFixed(0)}% Completed',
              style: const TextStyle(fontSize: 11, color: Color(0xFFFFB800), fontFamily: 'monospace'),
            ),
          ],
          if (_status == 'done')
            const Row(
              children: [
                Icon(Icons.check_circle, color: Color(0xFF10B981), size: 16),
                SizedBox(width: 6),
                Text('Download complete! Opening installer...', style: TextStyle(fontSize: 11, color: Color(0xFF10B981))),
              ],
            ),
          if (_status == 'error') ...[
            const Row(
              children: [
                Icon(Icons.error_outline, color: Colors.redAccent, size: 16),
                SizedBox(width: 6),
                Text('Download failed', style: TextStyle(fontSize: 11, color: Colors.redAccent)),
              ],
            ),
            const SizedBox(height: 4),
            Text(_errorMsg, style: const TextStyle(fontSize: 9, color: Color(0xFF64748B))),
          ],
        ],
      ),
      actions: [
        if (_status == 'idle' || _status == 'error') ...[
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('LATER', style: TextStyle(color: Color(0xFF64748B), fontSize: 11)),
          ),
          ElevatedButton.icon(
            onPressed: _downloadAndInstall,
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFFFB800),
              foregroundColor: Colors.black,
            ),
            icon: Icon(_status == 'error' ? Icons.refresh : Icons.download, size: 16),
            label: Text(_status == 'error' ? 'RETRY' : 'UPDATE NOW',
                style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
          ),
        ],
        if (_status == 'downloading')
          const Padding(
            padding: EdgeInsets.all(8.0),
            child: Text('Please wait...', style: TextStyle(color: Color(0xFF64748B), fontSize: 11)),
          ),
        if (_status == 'done')
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('CLOSE', style: TextStyle(color: Color(0xFF64748B), fontSize: 11)),
          ),
      ],
    );
  }
}
