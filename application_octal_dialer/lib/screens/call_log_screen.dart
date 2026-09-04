import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../config/app_config.dart';
import '../widgets/octal_logo.dart';

class CallLogItem {
  final String id;
  final String phone;
  final String name;
  final String reason; // 'ANSWERED', 'NO_ANSWER', 'BUSY', 'FAILED', 'CANCELLED'
  final int duration;
  final String createdAt;
  final String? disposition;

  CallLogItem({
    required this.id,
    required this.phone,
    required this.name,
    required this.reason,
    required this.duration,
    required this.createdAt,
    this.disposition,
  });

  factory CallLogItem.fromJson(Map<String, dynamic> json) {
    return CallLogItem(
      id: json['id'] ?? '',
      phone: json['phone'] ?? '',
      name: json['leadName'] ?? json['name'] ?? 'Contact',
      reason: json['reason'] ?? 'UNKNOWN',
      duration: json['duration'] is int ? json['duration'] : int.tryParse(json['duration']?.toString() ?? '0') ?? 0,
      createdAt: json['createdAt'] ?? '',
      disposition: json['disposition'],
    );
  }
}

class CallLogScreen extends StatefulWidget {
  final dynamic socket;
  final String? serverUrl;

  const CallLogScreen({super.key, this.socket, this.serverUrl});

  @override
  State<CallLogScreen> createState() => _CallLogScreenState();
}

class _CallLogScreenState extends State<CallLogScreen> {
  List<CallLogItem> _logs = [];
  bool _isLoading = true;
  String _selectedFilter = 'All'; // 'All', 'Answered', 'No Answer', 'Failed'

  @override
  void initState() {
    super.initState();
    _fetchCallLogs();
  }

  Future<void> _fetchCallLogs() async {
    setState(() {
      _isLoading = true;
    });

    try {
      final baseUrl = widget.serverUrl ?? await AppConfig.init();
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString('auth_token') ?? '';

      final res = await http.get(
        Uri.parse('$baseUrl/api/call-logs'),
        headers: {
          'Authorization': 'Bearer $token',
          'Content-Type': 'application/json',
        },
      ).timeout(const Duration(seconds: 8));

      if (res.statusCode == 200) {
        final List<dynamic> data = jsonDecode(res.body);
        if (mounted) {
          setState(() {
            _logs = data.map((j) => CallLogItem.fromJson(j)).toList();
            _isLoading = false;
          });
        }
      } else {
        if (mounted) setState(() => _isLoading = false);
      }
    } catch (e) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    List<CallLogItem> filtered = [];
    if (_selectedFilter == 'All') {
      filtered = _logs;
    } else if (_selectedFilter == 'Answered') {
      filtered = _logs.where((l) => l.reason == 'ANSWERED').toList();
    } else if (_selectedFilter == 'No Answer') {
      filtered = _logs.where((l) => l.reason == 'NO_ANSWER' || l.reason == 'BUSY' || l.reason == 'CANCELLED').toList();
    } else {
      filtered = _logs.where((l) => l.reason == 'FAILED' || l.reason == 'NETWORK_ERROR').toList();
    }

    return Scaffold(
      backgroundColor: OctalColors.bgDark,
      appBar: AppBar(
        backgroundColor: OctalColors.surfaceCard,
        title: const Text(
          'Call History',
          style: TextStyle(
            fontFamily: 'Ubuntu',
            fontSize: 16,
            fontWeight: FontWeight.bold,
            color: Colors.white,
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: OctalColors.primaryGold, size: 20),
            onPressed: _fetchCallLogs,
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              color: OctalColors.surfaceCard,
              child: Row(
                children: [
                  _buildFilterPill('All'),
                  const SizedBox(width: 8),
                  _buildFilterPill('Answered'),
                  const SizedBox(width: 8),
                  _buildFilterPill('No Answer'),
                  const SizedBox(width: 8),
                  _buildFilterPill('Failed'),
                ],
              ),
            ),
            Expanded(
              child: _isLoading
                  ? const Center(child: CircularProgressIndicator(color: OctalColors.primaryGold))
                  : filtered.isEmpty
                      ? Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              const Icon(Icons.history_toggle_off, color: OctalColors.textMuted, size: 48),
                              const SizedBox(height: 12),
                              Text(
                                'No ${_selectedFilter.toLowerCase()} records found',
                                style: const TextStyle(fontSize: 14, color: OctalColors.textSecondary),
                              ),
                            ],
                          ),
                        )
                      : ListView(
                          padding: const EdgeInsets.all(16),
                          children: [
                            const Padding(
                              padding: EdgeInsets.only(left: 4, bottom: 10),
                              child: Text(
                                'Today',
                                style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.bold,
                                  color: OctalColors.primaryGold,
                                  letterSpacing: 0.5,
                                ),
                              ),
                            ),
                            ...filtered.map((item) => _buildCallCard(item)),
                          ],
                        ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFilterPill(String filter) {
    final isSelected = _selectedFilter == filter;
    return GestureDetector(
      onTap: () => setState(() => _selectedFilter = filter),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
        decoration: BoxDecoration(
          color: isSelected ? OctalColors.primaryGold : OctalColors.surfaceElevated,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Text(
          filter,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.bold,
            color: isSelected ? OctalColors.bgDark : Colors.white,
          ),
        ),
      ),
    );
  }

  Widget _buildCallCard(CallLogItem item) {
    final isAnswered = item.reason == 'ANSWERED';
    final isNoAnswer = item.reason == 'NO_ANSWER' || item.reason == 'BUSY';
    final initial = item.name.isNotEmpty ? item.name[0].toUpperCase() : 'A';

    final Color statusColor = isAnswered
        ? OctalColors.success
        : (isNoAnswer ? OctalColors.warning : OctalColors.error);

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: OctalColors.surfaceCard,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: OctalColors.border),
      ),
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: statusColor.withOpacity(0.12),
              border: Border.all(color: statusColor.withOpacity(0.35)),
            ),
            child: Center(
              child: Text(
                initial,
                style: TextStyle(
                  fontFamily: 'Ubuntu',
                  fontSize: 16,
                  fontWeight: FontWeight.w900,
                  color: statusColor,
                ),
              ),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.name,
                  style: const TextStyle(
                    fontFamily: 'Ubuntu',
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  item.phone,
                  style: const TextStyle(
                    fontFamily: 'monospace',
                    fontSize: 12,
                    color: OctalColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                item.createdAt.isNotEmpty ? item.createdAt : '10:30 AM',
                style: const TextStyle(fontSize: 11, color: OctalColors.primaryGold, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 4),
              Text(
                isAnswered ? '00:${item.duration.toString().padLeft(2, '0')}' : (item.disposition ?? item.reason),
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: isAnswered ? OctalColors.success : (isNoAnswer ? OctalColors.warning : OctalColors.error),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
