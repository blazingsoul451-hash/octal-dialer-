import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

class CallOutboxEntry {
  final String outboxId;
  final String callId;
  final String sessionId;
  final String? leadId;
  final String? commandId;
  final String? phone;
  final String? name;
  final String reason;
  final int duration;
  final bool answered;
  final int createdAtMs;
  int retryCount;

  CallOutboxEntry({
    required this.outboxId,
    required this.callId,
    required this.sessionId,
    this.leadId,
    this.commandId,
    this.phone,
    this.name,
    required this.reason,
    required this.duration,
    required this.answered,
    required this.createdAtMs,
    this.retryCount = 0,
  });

  Map<String, dynamic> toJson() => {
    'outboxId': outboxId,
    'callId': callId,
    'sessionId': sessionId,
    'leadId': leadId,
    'commandId': commandId,
    'phone': phone,
    'name': name,
    'reason': reason,
    'duration': duration,
    'answered': answered,
    'createdAtMs': createdAtMs,
    'retryCount': retryCount,
  };

  factory CallOutboxEntry.fromJson(Map<String, dynamic> json) => CallOutboxEntry(
    outboxId: json['outboxId'] as String? ?? '',
    callId: json['callId'] as String? ?? '',
    sessionId: json['sessionId'] as String? ?? '',
    leadId: json['leadId'] as String?,
    commandId: json['commandId'] as String?,
    phone: json['phone'] as String?,
    name: json['name'] as String?,
    reason: json['reason'] as String? ?? 'UNKNOWN',
    duration: (json['duration'] as num?)?.toInt() ?? 0,
    answered: json['answered'] as bool? ?? false,
    createdAtMs: (json['createdAtMs'] as num?)?.toInt() ?? 0,
    retryCount: (json['retryCount'] as num?)?.toInt() ?? 0,
  );
}

class CallOutboxService {
  static final CallOutboxService _instance = CallOutboxService._internal();
  static CallOutboxService get instance => _instance;
  CallOutboxService._internal();

  static const String _storageKey = 'octal_call_outbox_queue';
  bool _isFlushing = false;

  Future<List<CallOutboxEntry>> getPendingEntries() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_storageKey);
      if (raw == null || raw.isEmpty) return [];
      final List<dynamic> decoded = jsonDecode(raw);
      return decoded
          .map((e) => CallOutboxEntry.fromJson(Map<String, dynamic>.from(e)))
          .toList();
    } catch (e) {
      debugPrint('[CallOutbox] Error reading outbox: $e');
      return [];
    }
  }

  Future<void> enqueueOutcome(CallOutboxEntry entry) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final entries = await getPendingEntries();
      // Remove any duplicate callId if present before adding the latest
      entries.removeWhere((e) => e.callId == entry.callId);
      entries.add(entry);
      final raw = jsonEncode(entries.map((e) => e.toJson()).toList());
      await prefs.setString(_storageKey, raw);
      debugPrint('[CallOutbox] Persisted terminal outcome for callId=${entry.callId} to durable storage');
    } catch (e) {
      debugPrint('[CallOutbox] Error saving outbox entry: $e');
    }
  }

  Future<void> acknowledgeOutcome(String callId) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final entries = await getPendingEntries();
      final initialCount = entries.length;
      entries.removeWhere((e) => e.callId == callId);
      if (entries.length != initialCount) {
        final raw = jsonEncode(entries.map((e) => e.toJson()).toList());
        await prefs.setString(_storageKey, raw);
        debugPrint('[CallOutbox] Acknowledged and cleared outcome for callId=$callId (remaining: ${entries.length})');
      }
    } catch (e) {
      debugPrint('[CallOutbox] Error acknowledging outbox entry: $e');
    }
  }

  Future<void> flush(io.Socket? socket) async {
    if (_isFlushing) return;
    if (socket == null || !socket.connected) {
      debugPrint('[CallOutbox] Cannot flush: socket is disconnected');
      return;
    }

    _isFlushing = true;
    try {
      final entries = await getPendingEntries();
      if (entries.isEmpty) return;

      debugPrint('[CallOutbox] Flushing ${entries.length} pending terminal event(s)...');
      for (final entry in entries) {
        socket.emit('call:ended', {
          'sessionId': entry.sessionId,
          'callId': entry.callId,
          'leadId': entry.leadId,
          'phone': entry.phone,
          'name': entry.name,
          'commandId': entry.commandId,
          'reason': entry.reason,
          'duration': entry.duration,
          'answered': entry.answered,
          'outboxId': entry.outboxId,
          'retryCount': entry.retryCount,
        });
        entry.retryCount++;
      }

      final prefs = await SharedPreferences.getInstance();
      final raw = jsonEncode(entries.map((e) => e.toJson()).toList());
      await prefs.setString(_storageKey, raw);
    } catch (e) {
      debugPrint('[CallOutbox] Error flushing outbox: $e');
    } finally {
      _isFlushing = false;
    }
  }
}
