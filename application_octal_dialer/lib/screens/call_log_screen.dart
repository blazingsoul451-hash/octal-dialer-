import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

class CallLogEntry {
  final String id;
  final String leadName;
  final String leadPhone;
  final String campaignName;
  final String outcome;
  final double duration;
  final String timestamp;

  CallLogEntry({
    required this.id,
    required this.leadName,
    required this.leadPhone,
    required this.campaignName,
    required this.outcome,
    required this.duration,
    required this.timestamp,
  });

  factory CallLogEntry.fromJson(Map<String, dynamic> json) {
    return CallLogEntry(
      id: json['id'] ?? '',
      leadName: json['leadName'] ?? 'Unknown',
      leadPhone: json['leadPhone'] ?? '',
      campaignName: json['campaignName'] ?? '',
      outcome: json['outcome'] ?? 'UNKNOWN',
      duration: (json['duration'] ?? 0).toDouble(),
      timestamp: json['timestamp'] ?? '',
    );
  }
}

class CallLogScreen extends StatefulWidget {
  final String serverUrl;
  final dynamic socket;

  const CallLogScreen({
    super.key,
    required this.serverUrl,
    this.socket,
  });

  @override
  State<CallLogScreen> createState() => _CallLogScreenState();
}

class _CallLogScreenState extends State<CallLogScreen> {
  List<CallLogEntry> _logs = [];
  bool _loading = true;
  String? _error;
  String _filter = 'ALL'; // ALL, ANSWERED, NO_ANSWER, VOICEMAIL

  static const Color _bg = Color(0xFF020617);
  static const Color _card = Color(0xFF0F172A);
  static const Color _border = Color(0xFF1E293B);
  static const Color _amber = Color(0xFFFFB800);
  static const Color _emerald = Color(0xFF10B981);
  static const Color _slate = Color(0xFF64748B);
  static const Color _red = Color(0xFFEF4444);

  @override
  void initState() {
    super.initState();
    _fetchLogs();

    // Live refresh: when a call finishes, re-fetch
    widget.socket?.on('call:finished', (_) {
      Future.delayed(const Duration(milliseconds: 800), _fetchLogs);
    });
  }

  Future<void> _fetchLogs() async {
    setState(() { _loading = true; _error = null; });
    try {
      final uri = Uri.parse('${widget.serverUrl}/api/logs/mobile');
      final res = await http.get(
        uri,
        headers: {
          'Authorization': 'Bearer ${widget.socket?.id ?? ''}',
        },
      ).timeout(const Duration(seconds: 8));
      if (res.statusCode == 200) {
        final List<dynamic> data = json.decode(res.body);
        setState(() {
          _logs = data.map((e) => CallLogEntry.fromJson(e as Map<String, dynamic>)).toList();
          _loading = false;
        });
      } else if (res.statusCode == 401) {
        // Logs may require auth — show all we know from socket events only
        setState(() { _logs = []; _loading = false; _error = 'Logs require dashboard login. Live events shown below.'; });
      } else {
        setState(() { _error = 'Server error ${res.statusCode}'; _loading = false; });
      }
    } catch (e) {
      setState(() { _error = 'Could not reach server: $e'; _loading = false; });
    }
  }

  Color _outcomeColor(String outcome) {
    switch (outcome.toUpperCase()) {
      case 'ANSWERED': return _emerald;
      case 'VOICEMAIL': return _amber;
      case 'NO_ANSWER': return _slate;
      case 'BUSY': return _red;
      case 'REJECTED': return _red;
      default: return _slate;
    }
  }

  IconData _outcomeIcon(String outcome) {
    switch (outcome.toUpperCase()) {
      case 'ANSWERED': return Icons.phone_callback;
      case 'VOICEMAIL': return Icons.voicemail;
      case 'NO_ANSWER': return Icons.phone_missed;
      case 'BUSY': return Icons.phone_disabled;
      case 'REJECTED': return Icons.phone_disabled;
      default: return Icons.call_end;
    }
  }

  String _formatDuration(double secs) {
    final m = (secs ~/ 60).toString().padLeft(1, '0');
    final s = (secs % 60).toInt().toString().padLeft(2, '0');
    return '${m}m ${s}s';
  }

  String _formatTime(String iso) {
    try {
      final dt = DateTime.parse(iso).toLocal();
      final now = DateTime.now();
      final diff = now.difference(dt);
      if (diff.inMinutes < 1) return 'Just now';
      if (diff.inHours < 1) return '${diff.inMinutes}m ago';
      if (diff.inDays < 1) return '${diff.inHours}h ago';
      return '${dt.day}/${dt.month} ${dt.hour.toString().padLeft(2,'0')}:${dt.minute.toString().padLeft(2,'0')}';
    } catch (_) {
      return iso;
    }
  }

  List<CallLogEntry> get _filteredLogs {
    if (_filter == 'ALL') return _logs;
    return _logs.where((l) => l.outcome.toUpperCase() == _filter).toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _bg,
      appBar: AppBar(
        backgroundColor: const Color(0xFF0F172A),
        automaticallyImplyLeading: false,
        title: const Text(
          'CALL LOG HISTORY',
          style: TextStyle(
            fontFamily: 'Ubuntu',
            fontSize: 13,
            fontWeight: FontWeight.bold,
            color: Colors.white,
            letterSpacing: 1.2,
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: Color(0xFFFFB800), size: 20),
            onPressed: _fetchLogs,
            tooltip: 'Refresh',
          ),
        ],
      ),
      body: Column(
        children: [
          // Filter chips
          Container(
            color: const Color(0xFF0F172A),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: ['ALL', 'ANSWERED', 'NO_ANSWER', 'VOICEMAIL', 'BUSY'].map((f) {
                  final active = _filter == f;
                  return Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: GestureDetector(
                      onTap: () => setState(() => _filter = f),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(
                          color: active ? _amber.withOpacity(0.15) : _border,
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: active ? _amber : _border),
                        ),
                        child: Text(
                          f.replaceAll('_', ' '),
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                            color: active ? _amber : _slate,
                          ),
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),
          ),
          // Stats bar
          if (_logs.isNotEmpty)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              color: _bg,
              child: Row(
                children: [
                  _statChip('TOTAL', '${_logs.length}', _slate),
                  const SizedBox(width: 8),
                  _statChip('ANSWERED', '${_logs.where((l) => l.outcome.toUpperCase() == 'ANSWERED').length}', _emerald),
                  const SizedBox(width: 8),
                  _statChip('MISSED', '${_logs.where((l) => l.outcome.toUpperCase() == 'NO_ANSWER').length}', _slate),
                  const SizedBox(width: 8),
                  _statChip('BUSY', '${_logs.where((l) => l.outcome.toUpperCase() == 'BUSY').length}', _red),
                ],
              ),
            ),
          // Content
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: Color(0xFFFFB800)))
                : _error != null && _logs.isEmpty
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.all(32),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.history, color: Color(0xFF1E293B), size: 48),
                              const SizedBox(height: 12),
                              Text(_error!, textAlign: TextAlign.center, style: const TextStyle(color: Color(0xFF64748B), fontSize: 12)),
                              const SizedBox(height: 16),
                              ElevatedButton(
                                onPressed: _fetchLogs,
                                style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF1E293B)),
                                child: const Text('RETRY', style: TextStyle(color: Color(0xFFFFB800), fontSize: 11)),
                              ),
                            ],
                          ),
                        ),
                      )
                    : _filteredLogs.isEmpty
                        ? Center(
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(Icons.phone_missed_outlined, color: Color(0xFF1E293B), size: 48),
                                const SizedBox(height: 12),
                                Text(
                                  _logs.isEmpty ? 'No calls made yet.\nDial a lead to see history here.' : 'No calls match this filter.',
                                  textAlign: TextAlign.center,
                                  style: const TextStyle(color: Color(0xFF64748B), fontSize: 12),
                                ),
                              ],
                            ),
                          )
                        : RefreshIndicator(
                            color: _amber,
                            backgroundColor: _card,
                            onRefresh: _fetchLogs,
                            child: ListView.builder(
                              padding: const EdgeInsets.all(12),
                              itemCount: _filteredLogs.length,
                              itemBuilder: (context, index) {
                                final log = _filteredLogs[index];
                                final color = _outcomeColor(log.outcome);
                                return Container(
                                  margin: const EdgeInsets.only(bottom: 8),
                                  padding: const EdgeInsets.all(14),
                                  decoration: BoxDecoration(
                                    color: _card,
                                    borderRadius: BorderRadius.circular(14),
                                    border: Border.all(color: _border),
                                  ),
                                  child: Row(
                                    children: [
                                      // Outcome icon
                                      Container(
                                        width: 40,
                                        height: 40,
                                        decoration: BoxDecoration(
                                          color: color.withOpacity(0.1),
                                          borderRadius: BorderRadius.circular(10),
                                          border: Border.all(color: color.withOpacity(0.3)),
                                        ),
                                        child: Icon(_outcomeIcon(log.outcome), color: color, size: 18),
                                      ),
                                      const SizedBox(width: 12),
                                      // Lead info
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                              log.leadName,
                                              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Colors.white),
                                            ),
                                            const SizedBox(height: 2),
                                            Text(
                                              log.leadPhone,
                                              style: const TextStyle(fontSize: 11, fontFamily: 'monospace', color: Color(0xFF94A3B8)),
                                            ),
                                            if (log.campaignName.isNotEmpty)
                                              Text(
                                                log.campaignName,
                                                style: const TextStyle(fontSize: 9, color: Color(0xFF64748B)),
                                              ),
                                          ],
                                        ),
                                      ),
                                      // Right side: outcome + duration + time
                                      Column(
                                        crossAxisAlignment: CrossAxisAlignment.end,
                                        children: [
                                          Container(
                                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                            decoration: BoxDecoration(
                                              color: color.withOpacity(0.12),
                                              borderRadius: BorderRadius.circular(6),
                                            ),
                                            child: Text(
                                              log.outcome.replaceAll('_', ' '),
                                              style: TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: color),
                                            ),
                                          ),
                                          const SizedBox(height: 4),
                                          Text(
                                            log.duration > 0 ? _formatDuration(log.duration) : '—',
                                            style: const TextStyle(fontSize: 10, color: Color(0xFF64748B), fontFamily: 'monospace'),
                                          ),
                                          const SizedBox(height: 2),
                                          Text(
                                            _formatTime(log.timestamp),
                                            style: const TextStyle(fontSize: 9, color: Color(0xFF475569)),
                                          ),
                                        ],
                                      ),
                                    ],
                                  ),
                                );
                              },
                            ),
                          ),
          ),
        ],
      ),
    );
  }

  Widget _statChip(String label, String value, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withOpacity(0.08),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withOpacity(0.2)),
      ),
      child: Row(
        children: [
          Text(label, style: TextStyle(fontSize: 8, color: color, fontWeight: FontWeight.bold)),
          const SizedBox(width: 4),
          Text(value, style: TextStyle(fontSize: 12, color: color, fontWeight: FontWeight.w900)),
        ],
      ),
    );
  }
}
