import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
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
  final String? serverOrigin;
  final String? tenantId;
  final String? deviceId;
  int retryCount;
  int lastAttemptMs;

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
    this.serverOrigin,
    this.tenantId,
    this.deviceId,
    this.retryCount = 0,
    this.lastAttemptMs = 0,
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
    'serverOrigin': serverOrigin,
    'tenantId': tenantId,
    'deviceId': deviceId,
    'retryCount': retryCount,
    'lastAttemptMs': lastAttemptMs,
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
    serverOrigin: json['serverOrigin'] as String?,
    tenantId: json['tenantId'] as String?,
    deviceId: json['deviceId'] as String?,
    retryCount: (json['retryCount'] as num?)?.toInt() ?? 0,
    lastAttemptMs: (json['lastAttemptMs'] as num?)?.toInt() ?? 0,
  );
}

class CallOutboxService {
  static final CallOutboxService _instance = CallOutboxService._internal();
  static CallOutboxService get instance => _instance;
  CallOutboxService._internal();

  static const String _storageKey = 'octal_call_outbox_queue';
  Future<void> _lock = Future.value();
  Timer? _periodicRetryTimer;

  Future<T> _runSerialized<T>(Future<T> Function() task) {
    final prev = _lock;
    final completer = Completer<void>();
    _lock = completer.future;
    return prev.then((_) => task()).whenComplete(() {
      completer.complete();
    });
  }

  Future<List<CallOutboxEntry>> _readEntriesInternal(SharedPreferences prefs) async {
    final raw = prefs.getString(_storageKey);
    if (raw == null || raw.isEmpty) return [];

    try {
      final List<dynamic> decoded = jsonDecode(raw);
      return decoded
          .map((e) => CallOutboxEntry.fromJson(Map<String, dynamic>.from(e)))
          .toList();
    } catch (e) {
      debugPrint('[CallOutbox] Corrupt storage detected: $e. Quarantining...');
      final quarantineKey = '${_storageKey}_corrupt_${DateTime.now().millisecondsSinceEpoch}';
      final backupOk = await prefs.setString(quarantineKey, raw);
      if (backupOk) {
        await prefs.remove(_storageKey);
      } else {
        debugPrint('[CallOutbox] Failed to write quarantine backup; keeping primary intact');
      }
      throw StateError('Outbox storage was corrupt and quarantined to $quarantineKey: $e');
    }
  }

  Future<List<CallOutboxEntry>> getPendingEntries() async {
    return _runSerialized(() async {
      final prefs = await SharedPreferences.getInstance();
      try {
        return await _readEntriesInternal(prefs);
      } catch (e) {
        debugPrint('[CallOutbox] Error reading outbox: $e');
        return [];
      }
    });
  }

  Future<void> enqueueOutcome(CallOutboxEntry entry) async {
    return _runSerialized(() async {
      final prefs = await SharedPreferences.getInstance();
      List<CallOutboxEntry> entries;
      try {
        entries = await _readEntriesInternal(prefs);
      } catch (_) {
        entries = [];
      }

      entries.removeWhere((e) => (entry.tenantId == null || e.tenantId == entry.tenantId) && e.callId == entry.callId);
      entries.add(entry);

      final raw = jsonEncode(entries.map((e) => e.toJson()).toList());
      final ok = await prefs.setString(_storageKey, raw);
      if (!ok) {
        throw StateError('Failed to persist call outbox entry to durable storage');
      }
      debugPrint('[CallOutbox] Serialized terminal outcome for callId=${entry.callId} to durable journal');
    });
  }

  Future<bool> acknowledgeOutcome(String callId, {String? tenantId, String? deviceId, String? serverOrigin, String? outboxId}) async {
    return _runSerialized(() async {
      final prefs = await SharedPreferences.getInstance();
      List<CallOutboxEntry> entries;
      try {
        entries = await _readEntriesInternal(prefs);
      } catch (e) {
        debugPrint('[CallOutbox] Error reading outbox on ack: $e');
        return false;
      }

      final initialCount = entries.length;
      entries.removeWhere((e) =>
          e.callId == callId &&
          (tenantId == null || e.tenantId == null || e.tenantId == tenantId) &&
          (deviceId == null || e.deviceId == null || e.deviceId == deviceId) &&
          (outboxId == null || e.outboxId == outboxId) &&
          (serverOrigin == null || e.serverOrigin == null || e.serverOrigin == serverOrigin));

      if (entries.length != initialCount) {
        final raw = jsonEncode(entries.map((e) => e.toJson()).toList());
        final ok = await prefs.setString(_storageKey, raw);
        if (!ok) {
          throw StateError('Failed to persist outbox acknowledgement to durable storage');
        }
        debugPrint('[CallOutbox] Acknowledged and removed outcome for callId=$callId (remaining: ${entries.length})');
        return true;
      }
      return false;
    });
  }

  Future<void> flush(io.Socket? socket, {String? currentOrigin, String? currentTenantId, String? currentDeviceId}) async {
    if (socket == null || !socket.connected) {
      debugPrint('[CallOutbox] Cannot flush: socket is disconnected');
      return;
    }

    return _runSerialized(() async {
      final prefs = await SharedPreferences.getInstance();
      List<CallOutboxEntry> entries;
      try {
        entries = await _readEntriesInternal(prefs);
      } catch (e) {
        debugPrint('[CallOutbox] Flush abort: could not read entries: $e');
        return;
      }

      if (entries.isEmpty) return;

      final now = DateTime.now().millisecondsSinceEpoch;
      int flushedCount = 0;

      for (final entry in entries) {
        // Multi-tenant, device, and origin scoping: never transmit to mismatched scopes
        if (currentTenantId != null && entry.tenantId != null && entry.tenantId != currentTenantId) {
          continue;
        }
        if (currentDeviceId != null && entry.deviceId != null && entry.deviceId != currentDeviceId) {
          continue;
        }
        if (currentOrigin != null && entry.serverOrigin != null && entry.serverOrigin != currentOrigin) {
          continue;
        }

        // Bounded backoff retry with jitter: min(60s, 2s * 2^retryCount) + jitter
        if (entry.retryCount > 0 && entry.lastAttemptMs > 0) {
          final baseBackoff = math.min(60000, 2000 * math.pow(2, math.min(entry.retryCount, 5))).toInt();
          final jitter = math.Random().nextInt(1000);
          final backoffMs = baseBackoff + jitter;
          if (now - entry.lastAttemptMs < backoffMs) {
            continue;
          }
        }

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
          'deviceId': entry.deviceId ?? currentDeviceId,
        });

        entry.retryCount++;
        entry.lastAttemptMs = now;
        flushedCount++;
      }

      if (flushedCount > 0) {
        final raw = jsonEncode(entries.map((e) => e.toJson()).toList());
        await prefs.setString(_storageKey, raw);
        debugPrint('[CallOutbox] Flushed $flushedCount pending terminal event(s) to server');
      }
    });
  }

  void startPeriodicRetry(io.Socket? Function() getSocket, {String? Function()? getTenantId, String? Function()? getDeviceId, String? Function()? getOrigin}) {
    stopPeriodicRetry();
    _periodicRetryTimer = Timer.periodic(const Duration(seconds: 25), (_) {
      final s = getSocket();
      if (s != null && s.connected) {
        flush(
          s,
          currentTenantId: getTenantId?.call(),
          currentDeviceId: getDeviceId?.call(),
          currentOrigin: getOrigin?.call(),
        );
      }
    });
  }

  void stopPeriodicRetry() {
    _periodicRetryTimer?.cancel();
    _periodicRetryTimer = null;
  }
}
