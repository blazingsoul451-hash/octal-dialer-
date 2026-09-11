import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Represents a real-time event dispatched from Android Telecom / OctalInCallService.
class TelecomCallEvent {
  final String type; // 'added', 'removed', 'state_changed', 'audio_changed'
  final String callId;
  final String phoneNumber;
  final String state;
  final bool isIncoming;
  final String? reason;
  final int? duration;
  final bool? isMuted;
  final String? audioRoute;

  TelecomCallEvent({
    required this.type,
    required this.callId,
    required this.phoneNumber,
    this.state = '',
    this.isIncoming = false,
    this.reason,
    this.duration,
    this.isMuted,
    this.audioRoute,
  });

  factory TelecomCallEvent.fromMap(String type, Map<dynamic, dynamic> map) {
    return TelecomCallEvent(
      type: type,
      callId: map['callId']?.toString() ?? '',
      phoneNumber: map['phoneNumber']?.toString() ?? '',
      state: map['state']?.toString() ?? '',
      isIncoming: map['isIncoming'] == true,
      reason: map['reason']?.toString(),
      duration: map['duration'] is int ? map['duration'] as int : null,
      isMuted: map['isMuted'] as bool?,
      audioRoute: map['route']?.toString(),
    );
  }
}

/// Minimal Flutter Integration Boundary for Android Telecom and InCallService (Phase 1).
///
/// Exposes Default Dialer queries and genuine Telecom hardware call controls
/// without duplicating call engines or modifying existing ACTION_CALL behavior.
class TelecomService {
  static final TelecomService _instance = TelecomService._internal();
  static TelecomService get instance => _instance;
  TelecomService._internal() {
    _initMethodCallHandler();
  }

  static const MethodChannel _channel = MethodChannel('com.octal.dialer/call');

  final StreamController<TelecomCallEvent> _callEventController =
      StreamController<TelecomCallEvent>.broadcast();

  /// Stream of genuine hardware Telecom call events (added, removed, state changes, audio routes).
  Stream<TelecomCallEvent> get callEvents => _callEventController.stream;

  void _initMethodCallHandler() {
    _channel.setMethodCallHandler((call) async {
      try {
        final args = call.arguments is Map ? call.arguments as Map : {};
        switch (call.method) {
          case 'onTelecomCallAdded':
            _callEventController.add(TelecomCallEvent.fromMap('added', args));
            break;
          case 'onTelecomCallRemoved':
            _callEventController.add(TelecomCallEvent.fromMap('removed', args));
            break;
          case 'onTelecomCallStateChanged':
            _callEventController.add(TelecomCallEvent.fromMap('state_changed', args));
            break;
          case 'onTelecomAudioStateChanged':
            _callEventController.add(TelecomCallEvent.fromMap('audio_changed', args));
            break;
        }
      } catch (e) {
        debugPrint('[TelecomService] Error handling native method call: $e');
      }
    });
  }

  /// Checks if Octal is currently the system Default Dialer / Default Phone App.
  Future<bool> isDefaultDialer() async {
    try {
      final bool? res = await _channel.invokeMethod<bool>('isDefaultDialer');
      return res ?? false;
    } catch (e) {
      debugPrint('[TelecomService] isDefaultDialer error: $e');
      return false;
    }
  }

  /// Prompts user with the official Android system dialog to set Octal as Default Phone App.
  Future<bool> requestDefaultDialerRole() async {
    try {
      final bool? res = await _channel.invokeMethod<bool>('requestDefaultDialer');
      return res ?? false;
    } catch (e) {
      debugPrint('[TelecomService] requestDefaultDialerRole error: $e');
      return false;
    }
  }

  /// Fetches comprehensive status from Android TelecomManager & PhoneAccount.
  Future<Map<String, dynamic>> getTelecomStatus() async {
    try {
      final Map? res = await _channel.invokeMethod<Map>('getTelecomStatus');
      if (res != null) {
        return Map<String, dynamic>.from(res);
      }
    } catch (e) {
      debugPrint('[TelecomService] getTelecomStatus error: $e');
    }
    return {
      'isDefaultDialer': false,
      'isPhoneAccountEnabled': false,
      'activeCallCount': 0,
      'hasActiveCall': false,
    };
  }

  /// Returns snapshot of current primary active call from OctalCallManager.
  Future<Map<String, dynamic>?> getInCallDetails() async {
    try {
      final Map? res = await _channel.invokeMethod<Map>('getInCallDetails');
      if (res != null) {
        return Map<String, dynamic>.from(res);
      }
    } catch (e) {
      debugPrint('[TelecomService] getInCallDetails error: $e');
    }
    return null;
  }

  /// Genuine hardware call answer via Android Telecom Call object.
  Future<bool> answer() async {
    try {
      final bool? res = await _channel.invokeMethod<bool>('telecomAnswer');
      return res ?? false;
    } catch (e) {
      debugPrint('[TelecomService] answer error: $e');
      return false;
    }
  }

  /// Genuine hardware call disconnect via Android Telecom Call object.
  Future<bool> disconnect() async {
    try {
      final bool? res = await _channel.invokeMethod<bool>('telecomDisconnect');
      return res ?? false;
    } catch (e) {
      debugPrint('[TelecomService] disconnect error: $e');
      return false;
    }
  }

  /// Genuine microphone mute toggle on Android Telecom InCallService.
  Future<bool> setMuted(bool muted) async {
    try {
      final bool? res = await _channel.invokeMethod<bool>('telecomSetMuted', {'muted': muted});
      return res ?? false;
    } catch (e) {
      debugPrint('[TelecomService] setMuted error: $e');
      return false;
    }
  }

  /// Genuine audio routing (Speakerphone vs Earpiece) on Android Telecom InCallService.
  Future<bool> setSpeaker(bool speaker) async {
    try {
      final bool? res = await _channel.invokeMethod<bool>('telecomSetSpeaker', {'speaker': speaker});
      return res ?? false;
    } catch (e) {
      debugPrint('[TelecomService] setSpeaker error: $e');
      return false;
    }
  }

  /// Genuine DTMF tone playback on Android Telecom Call object.
  Future<bool> sendDtmf(String digit) async {
    try {
      final bool? res = await _channel.invokeMethod<bool>('telecomSendDtmf', {'digit': digit});
      return res ?? false;
    } catch (e) {
      debugPrint('[TelecomService] sendDtmf error: $e');
      return false;
    }
  }

  void dispose() {
    _callEventController.close();
  }
}
