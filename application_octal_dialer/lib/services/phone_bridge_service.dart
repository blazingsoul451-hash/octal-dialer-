import 'dart:async';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../config/app_config.dart';
import 'telecom_service.dart';

enum PairingMode {
  authenticated,
  qr,
}

enum BridgeStatus {
  disconnected,
  connecting,
  online,
  paired,
  calling,
  error,
}

class PhoneBridgeService extends ChangeNotifier {
  static final PhoneBridgeService _instance = PhoneBridgeService._internal();
  static PhoneBridgeService get instance => _instance;
  PhoneBridgeService._internal();

  io.Socket? _socket;
  io.Socket? get socket => _socket;

  PairingMode _mode = PairingMode.authenticated;
  PairingMode get mode => _mode;

  BridgeStatus _status = BridgeStatus.disconnected;
  BridgeStatus get status => _status;

  String _statusMessage = 'Disconnected';
  String get statusMessage => _statusMessage;

  String _errorMessage = '';
  String get errorMessage => _errorMessage;

  String _serverUrl = AppConfig.defaultBaseUrl;
  String get serverUrl => _serverUrl;

  String _authToken = '';
  String get authToken => _authToken;

  String _username = '';
  String get username => _username;

  String _email = '';
  String get email => _email;

  String _role = 'user';
  String get role => _role;

  String _tenantId = '';
  String get tenantId => _tenantId;

  String _deviceId = '';
  String get deviceId => _deviceId;

  String _deviceUid = '';
  String get deviceUid => _deviceUid;

  String _deviceName = 'Android Device';
  String get deviceName => _deviceName;

  String _deviceOs = 'Android';
  String get deviceOs => _deviceOs;

  String _deviceBtAddress = '';
  String get deviceBtAddress => _deviceBtAddress;

  String _deviceIp = '127.0.0.1';
  String get deviceIp => _deviceIp;

  // Active Session State
  String? _currentSessionId;
  String? get currentSessionId => _currentSessionId;

  String? _currentLaptopName;
  String? get currentLaptopName => _currentLaptopName;

  String? _currentLaptopBtAddress;
  String? get currentLaptopBtAddress => _currentLaptopBtAddress;

  String? _sessionToken;
  String? get sessionToken => _sessionToken;

  Timer? _heartbeatTimer;
  static const MethodChannel _nativeChannel = MethodChannel('com.octal.dialer/call');

  // Event callbacks
  void Function(Map<String, dynamic> data)? onBridgePaired;
  void Function(String reason)? onBridgeUnpaired;
  void Function(Map<String, dynamic> data)? onPhoneDial;
  void Function(Map<String, dynamic> data)? onUpdateAvailable;

  bool get isConnected => _socket != null && _socket!.connected;
  bool get isPaired => _status == BridgeStatus.paired || _currentSessionId != null;

  // SIM management state
  List<Map<String, dynamic>> _sims = [];
  int? _selectedSimSlot;
  int? _selectedSubscriptionId;
  String? _selectedCarrierName;
  String? _selectedDisplayName;
  bool _needsUserSimSelection = false;

  List<Map<String, dynamic>> get sims => _sims;
  int? get selectedSimSlot => _selectedSimSlot;
  int? get selectedSubscriptionId => _selectedSubscriptionId;
  String? get selectedCarrierName => _selectedCarrierName;
  String? get selectedDisplayName => _selectedDisplayName;
  bool get needsUserSimSelection => _needsUserSimSelection;

  Future<void> checkAndReconcileSim() async {
    if (!Platform.isAndroid) return;
    try {
      final res = await _nativeChannel.invokeMethod('getSimInfo');
      if (res is Map) {
        final map = Map<String, dynamic>.from(res);
        if (map['sims'] is List) {
          _sims = (map['sims'] as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
        }
        _selectedSimSlot = map['selectedSimSlot'] as int?;
        _selectedSubscriptionId = map['selectedSubscriptionId'] as int?;
        _selectedCarrierName = map['selectedCarrierName']?.toString();
        _selectedDisplayName = map['selectedDisplayName']?.toString();
        _needsUserSimSelection = map['needsUserSelection'] == true;
        notifyListeners();
      }
    } catch (e) {
      debugPrint('[PhoneBridge] checkAndReconcileSim error: $e');
    }
  }

  Future<bool> setPreferredSim({int? subscriptionId, int? simSlotIndex}) async {
    try {
      final success = await _nativeChannel.invokeMethod('setPreferredSim', {
        'subscriptionId': subscriptionId,
        'simSlotIndex': simSlotIndex,
      });
      if (success == true) {
        await checkAndReconcileSim();
        return true;
      }
    } catch (e) {
      debugPrint('[PhoneBridge] setPreferredSim error: $e');
    }
    return false;
  }

  /// Initialize and authenticate the single persistent phone bridge socket
  Future<void> initializeAuthenticated() async {
    final prefs = await SharedPreferences.getInstance();
    _authToken = prefs.getString('auth_token') ?? '';
    _username = prefs.getString('username') ?? 'Octal User';
    _email = prefs.getString('user_email') ?? '';
    _role = prefs.getString('user_role') ?? 'user';
    _tenantId = prefs.getString('tenant_id') ?? '';
    _serverUrl = await AppConfig.init();
    _deviceUid = prefs.getString('octal_device_uid') ?? '';
    _mode = PairingMode.authenticated;

    if (_authToken.isEmpty) {
      _setStatus(BridgeStatus.disconnected, 'Not authenticated');
      return;
    }

    await _gatherDeviceInfo();
    await checkAndReconcileSim();
    _setupTelephonyChannel();
    _connectAuthenticatedSocket();
  }

  StreamSubscription<TelecomCallEvent>? _telecomCallEventsSub;

  void _setupTelephonyChannel() {
    _telecomCallEventsSub?.cancel();
    _telecomCallEventsSub = TelecomService.instance.callEvents.listen((event) {
      if (event.type == 'legacy_state') {
        final state = event.state;
        final phoneNumber = event.phoneNumber;

        debugPrint('[PhoneBridge] Native call state change: $state (incoming phone: $phoneNumber)');

        if (state == 'RINGING') {
          if (TelecomService.instance.isAutoDialerCallActive) {
            debugPrint('[PhoneBridge] Suppressing incoming-call event for outbound Auto Dialer call');
            return;
          }
          _socket?.emit('phone:incoming-call', {
            'sessionId': _currentSessionId,
            'deviceId': _deviceId,
            'phone': phoneNumber,
          });
        } else if (state == 'IDLE') {
          _socket?.emit('phone:call-idle', {
            'sessionId': _currentSessionId,
            'deviceId': _deviceId,
          });
        }
      }
    });
  }

  /// Manually force reconnect the authenticated socket
  Future<void> reconnect() async {
    await initializeAuthenticated();
  }

  /// Connect or re-point the authenticated socket to a specific server URL
  Future<void> connectTo(String url) async {
    final sanitized = AppConfig.sanitizeUrl(url);
    if (sanitized == null) throw ArgumentError('Invalid server URL');
    if (_authToken.isNotEmpty && Uri.parse(sanitized).origin != Uri.parse(_serverUrl).origin) {
      throw StateError('Sign out before changing the authenticated server.');
    }
    _serverUrl = sanitized;
    await AppConfig.setBaseUrl(sanitized);
    if (_deviceName == 'Android Device') {
      await _gatherDeviceInfo();
    }
    _connectAuthenticatedSocket();
  }

  /// Connect and pair with a laptop session via QR code payload
  Future<void> pairWithQrSession({
    required String sessionId,
    required String token,
    required String serverUrl,
    String? laptopName,
    String? laptopBtAddress,
  }) async {
    _mode = PairingMode.qr;
    _currentSessionId = sessionId;
    _sessionToken = token;
    _currentLaptopName = laptopName ?? 'Laptop Host';
    _currentLaptopBtAddress = laptopBtAddress ?? '';

    final sanitized = AppConfig.sanitizeUrl(serverUrl);
    if (sanitized == null) throw ArgumentError('Invalid QR server URL');
    if (_authToken.isNotEmpty && Uri.parse(sanitized).origin != Uri.parse(_serverUrl).origin) {
      throw StateError('QR server differs from your login server. Sign out before switching servers.');
    }
    _serverUrl = sanitized;
    await AppConfig.setBaseUrl(sanitized);

    if (_deviceName == 'Android Device') {
      await _gatherDeviceInfo();
    }
    await checkAndReconcileSim();
    _setupTelephonyChannel();

    if (_socket != null) {
      _socket!.disconnect();
      _socket!.dispose();
      _socket = null;
    }

    _setStatus(BridgeStatus.connecting, 'Pairing with laptop via QR...');

    _socket = io.io(
      _serverUrl,
      io.OptionBuilder()
          .setTransports(['websocket', 'polling'])
          .setExtraHeaders({'bypass-tunnel-reminder': 'true'})
          .enableAutoConnect()
          .enableReconnection()
          .setReconnectionAttempts(9999)
          .setReconnectionDelay(1500)
          .build(),
    );

    void emitJoin() {
      if (_socket != null && _socket!.connected) {
        debugPrint('[PhoneBridge] Emitting phone:join for session $sessionId');
        _socket!.emit('phone:join', {
          'sessionId': sessionId,
          'token': token,
          'deviceName': _deviceName,
          'deviceId': _deviceId,
          'phoneOsType': Platform.isAndroid ? 'Android' : 'iOS',
          'phoneBtAddress': _deviceBtAddress,
          // A QR pairing grants only session access; never forward a saved login token.
        });
      }
    }

    _socket!.onConnect((_) {
      debugPrint('[PhoneBridge] Socket connected. Emitting phone:join...');
      emitJoin();
    });

    _socket!.on('phone:paired', (data) {
      debugPrint('[PhoneBridge] phone:paired received: $data');
      _handlePairingData(data);
    });

    _socket!.on('bridge:paired', (data) {
      debugPrint('[PhoneBridge] bridge:paired received: $data');
      _handlePairingData(data);
    });

    _socket!.on('bridge:unpaired', (data) {
      final reason = data != null ? data['reason'] : 'Unpaired by dashboard';
      debugPrint('[PhoneBridge] bridge:unpaired: $reason');
      _handleUnpaired(reason?.toString() ?? 'Unpaired');
    });

    _socket!.on('phone:kicked', (data) {
      final reason = data != null ? data['reason'] : 'Revoked by dashboard';
      debugPrint('[PhoneBridge] phone:kicked: $reason');
      _handleUnpaired(reason?.toString() ?? 'Revoked');
    });

    _socket!.on('phone:dial', (data) {
      debugPrint('[PhoneBridge] phone:dial received: $data');
      if (onPhoneDial != null && data != null) {
        onPhoneDial!(Map<String, dynamic>.from(data));
      }
    });

    _socket!.on('phone:answer-call', (_) {
      debugPrint('[PhoneBridge] Answering call via native TelecomManager');
      _nativeChannel.invokeMethod('answerCall').catchError((e) {
        debugPrint('[PhoneBridge] Native answerCall error: $e');
      });
    });

    _socket!.on('phone:hangup-call', (_) {
      debugPrint('[PhoneBridge] Ending call via native TelecomManager');
      _nativeChannel.invokeMethod('endCall').catchError((e) {
        debugPrint('[PhoneBridge] Native endCall error: $e');
      });
    });

    _socket!.on('phone:ping', (data) {
      final timestamp = data != null ? data['timestamp'] : null;
      _socket?.emit('phone:pong', {
        'sessionId': _currentSessionId,
        'timestamp': timestamp,
      });
    });

    _socket!.on('app:update_available', (data) {
      if (onUpdateAvailable != null && data != null) {
        onUpdateAvailable!(Map<String, dynamic>.from(data));
      }
    });

    _socket!.onDisconnect((_) {
      debugPrint('[PhoneBridge] Socket disconnected');
      if (_status != BridgeStatus.error) {
        _setStatus(BridgeStatus.disconnected, 'Disconnected from server');
      }
    });

    _socket!.onConnectError((err) {
      debugPrint('[PhoneBridge] Connect error: $err');
      _setStatus(BridgeStatus.error, 'Connect error: $err');
    });

    if (_socket!.connected) {
      emitJoin();
    }
  }

  /// Gather hardware & network identifiers
  Future<void> _gatherDeviceInfo() async {
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
    mac.add((hash & 0xFF).toRadixString(16).padLeft(2, '0').toUpperCase());
    mac.add(((hash >> 8) & 0xFF).toRadixString(16).padLeft(2, '0').toUpperCase());
    _deviceBtAddress = mac.join(':');
  }

  /// Connect the single authenticated socket
  void _connectAuthenticatedSocket() {
    if (_socket != null) {
      _socket!.disconnect();
      _socket!.dispose();
      _socket = null;
    }

    _setStatus(BridgeStatus.connecting, 'Connecting to Octal Bridge...');

    _socket = io.io(
      _serverUrl,
      io.OptionBuilder()
          .setTransports(['websocket', 'polling'])
          .setExtraHeaders({'bypass-tunnel-reminder': 'true'})
          .setAuth({'token': _authToken})
          .enableAutoConnect()
          .enableReconnection()
          .setReconnectionAttempts(9999)
          .setReconnectionDelay(1500)
          .build(),
    );

    _socket!.onConnect((_) {
      if (_authToken.isNotEmpty) {
        debugPrint('[PhoneBridge] Connected to server. Registering authenticated device...');
        _setStatus(BridgeStatus.connecting, 'Registering device with backend...');

        _socket!.emit('phone:auth-register', {
          'token': _authToken,
          'deviceUid': _deviceUid,
          'deviceName': _deviceName,
          'btAddress': _deviceBtAddress,
          'osType': _deviceOs,
          'ipAddress': _deviceIp,
          'platform': 'android',
          'appVersion': '1.2.0',
          'sims': _sims,
          'selectedSimSlot': _selectedSimSlot,
          'selectedCarrierName': _selectedCarrierName,
        });
      } else {
        debugPrint('[PhoneBridge] Connected to server in QR / unauthenticated mode.');
        _setStatus(BridgeStatus.online, '● Connected to Octal Bridge');
      }
    });

    _socket!.on('phone:auth-success', (data) {
      debugPrint('[PhoneBridge] Auth registration successful: $data');
      if (data != null && data['deviceId'] != null) {
        _deviceId = data['deviceId'];
      }
      _errorMessage = '';
      _setStatus(BridgeStatus.online, '● Device Online & Ready to Connect');
      _startHeartbeat();
      _checkOtaUpdate();

      // Broadcast SIM capabilities to backend
      if (_socket != null && _sims.isNotEmpty) {
        _socket!.emit('phone:sim-info', {
          'sessionId': _currentSessionId,
          'sims': _sims,
          'selectedSimSlot': _selectedSimSlot,
          'selectedCarrierName': _selectedCarrierName,
        });
      }
    });

    _socket!.on('phone:auth-error', (data) {
      final err = data != null ? data['error'] : 'Authentication failed.';
      debugPrint('[PhoneBridge] Auth error: $err');
      _errorMessage = err?.toString() ?? 'Auth failed';
      _setStatus(BridgeStatus.error, 'Authentication error: $_errorMessage');
    });

    _socket!.on('bridge:paired', (data) {
      debugPrint('[PhoneBridge] bridge:paired received: $data');
      _handlePairingData(data);
    });

    _socket!.on('phone:paired', (data) {
      debugPrint('[PhoneBridge] phone:paired received: $data');
      _handlePairingData(data);
    });

    _socket!.on('bridge:unpaired', (data) {
      final reason = data != null ? data['reason'] : 'Unpaired by dashboard';
      debugPrint('[PhoneBridge] bridge:unpaired: $reason');
      _handleUnpaired(reason?.toString() ?? 'Unpaired');
    });

    _socket!.on('phone:kicked', (data) {
      final reason = data != null ? data['reason'] : 'Revoked by dashboard';
      debugPrint('[PhoneBridge] phone:kicked: $reason');
      _handleUnpaired(reason?.toString() ?? 'Revoked');
    });

    _socket!.on('phone:dial', (data) {
      debugPrint('[PhoneBridge] phone:dial received: $data');
      if (onPhoneDial != null && data != null) {
        onPhoneDial!(Map<String, dynamic>.from(data));
      }
    });

    _socket!.on('phone:answer-call', (_) {
      debugPrint('[PhoneBridge] Answering call via native TelecomManager');
      _nativeChannel.invokeMethod('answerCall').catchError((e) {
        debugPrint('[PhoneBridge] Native answerCall error: $e');
      });
    });

    _socket!.on('phone:hangup-call', (_) {
      debugPrint('[PhoneBridge] Ending call via native TelecomManager');
      _nativeChannel.invokeMethod('endCall').catchError((e) {
        debugPrint('[PhoneBridge] Native endCall error: $e');
      });
    });

    _socket!.on('phone:ping', (data) {
      final timestamp = data != null ? data['timestamp'] : null;
      _socket?.emit('phone:pong', {
        'sessionId': _currentSessionId,
        'timestamp': timestamp,
      });
    });

    _socket!.on('app:update_available', (data) {
      if (onUpdateAvailable != null && data != null) {
        onUpdateAvailable!(Map<String, dynamic>.from(data));
      }
    });

    _socket!.onDisconnect((_) {
      debugPrint('[PhoneBridge] Socket disconnected');
      if (_status != BridgeStatus.error) {
        _setStatus(BridgeStatus.disconnected, 'Disconnected from server');
      }
    });

    _socket!.onConnectError((err) {
      debugPrint('[PhoneBridge] Connect error: $err');
      _setStatus(BridgeStatus.error, 'Connect error: $err');
    });
  }

  void _handlePairingData(dynamic data) {
    if (data == null) return;
    final map = Map<String, dynamic>.from(data);
    final newSessionId = map['sessionId']?.toString();

    // Idempotency: if already paired with this identical session, do not re-emit duplicate state transition
    if (_status == BridgeStatus.paired && _currentSessionId != null && _currentSessionId == newSessionId) {
      debugPrint('[PhoneBridge] Already paired with session $newSessionId, skipping redundant transition');
      return;
    }

    _currentSessionId = newSessionId;
    _currentLaptopName = map['laptopName']?.toString() ?? 'Laptop Dashboard';
    _currentLaptopBtAddress = map['laptopBtAddress']?.toString() ?? '';
    _sessionToken = map['token']?.toString();

    _setStatus(BridgeStatus.paired, '● Paired with $_currentLaptopName');

    // Keep app alive and responsive during GSM calls
    _nativeChannel.invokeMethod('startForegroundService', {
      'status': 'Paired with $_currentLaptopName. Ready for calls.'
    }).catchError((_) {});

    if (onBridgePaired != null) {
      onBridgePaired!(map);
    }
  }

  void _handleUnpaired(String reason) {
    _currentSessionId = null;
    _currentLaptopName = null;
    _currentLaptopBtAddress = null;
    _sessionToken = null;
    _setStatus(BridgeStatus.online, '● Device Online & Ready to Connect');

    if (onBridgeUnpaired != null) {
      onBridgeUnpaired!(reason);
    }
  }

  void _startHeartbeat() {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = Timer.periodic(const Duration(seconds: 15), (_) {
      if (_socket != null && _socket!.connected) {
        _socket!.emit('phone:ping');
      }
    });
  }

  void _checkOtaUpdate() {
    if (_socket != null && _socket!.connected) {
      _socket!.emit('app:version_check', {'currentVersion': '1.2.0'});
    }
  }

  void _setStatus(BridgeStatus newStatus, String message) {
    _status = newStatus;
    _statusMessage = message;
    notifyListeners();
  }

  /// Request manual advertisement to laptop session in authenticated mode
  void requestPairWithActiveLaptop() {
    if (_socket != null && _socket!.connected && _authToken.isNotEmpty) {
      _setStatus(BridgeStatus.connecting, 'Advertising device to active laptop session...');
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
    }
  }

  /// Explicit disconnect from current session
  void disconnectSession() {
    if (_currentSessionId != null && _socket != null && _socket!.connected) {
      _socket!.emit('phone:disconnect-session', {
        'sessionId': _currentSessionId,
      });
    }
    try {
      _nativeChannel.invokeMethod('updateServiceStatus', {
        'status': 'Phone Link idle. Ready to pair.'
      });
    } catch (_) {}
    _handleUnpaired('Disconnected by user');
  }

  /// Full logout cleanup
  Future<void> logout() async {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = null;

    try {
      _nativeChannel.invokeMethod('stopForegroundService');
    } catch (_) {}

    if (_socket != null) {
      if (_currentSessionId != null) {
        _socket!.emit('phone:disconnect-session', {'sessionId': _currentSessionId});
      }
      _socket!.disconnect();
      _socket!.dispose();
      _socket = null;
    }

    _authToken = '';
    _username = '';
    _email = '';
    _role = 'user';
    _tenantId = '';
    _deviceId = '';
    _currentSessionId = null;
    _currentLaptopName = null;
    _currentLaptopBtAddress = null;
    _sessionToken = null;
    _setStatus(BridgeStatus.disconnected, 'Logged out');

    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('auth_token');
    await prefs.remove('user_id');
    await prefs.remove('username');
    await prefs.remove('user_email');
    await prefs.remove('user_role');
    await prefs.remove('tenant_id');
  }

  /// Emit event over the authoritative bridge socket
  void emit(String event, [dynamic data]) {
    if (_socket != null && _socket!.connected) {
      _socket!.emit(event, data);
    }
  }
}
