import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:http/http.dart' as http;
import 'standalone_dialer_screen.dart';

class CampaignInfo {
  final String id;
  final String name;
  final String fileName;
  final int leadCount;
  final String status;
  final String createdAt;

  CampaignInfo({
    required this.id,
    required this.name,
    required this.fileName,
    required this.leadCount,
    required this.status,
    required this.createdAt,
  });

  factory CampaignInfo.fromJson(Map<String, dynamic> json) {
    return CampaignInfo(
      id: json['id'] ?? '',
      name: json['name'] ?? '',
      fileName: json['fileName'] ?? '',
      leadCount: json['leadCount'] ?? 0,
      status: json['status'] ?? 'ACTIVE',
      createdAt: json['createdAt'] ?? '',
    );
  }
}

class DashboardScreen extends StatefulWidget {
  final List<LeadItem> queue;
  final String serverUrl;
  final Function(List<LeadItem> campaignLeads, String campaignId) onLoadCampaign;

  const DashboardScreen({
    super.key,
    required this.queue,
    required this.serverUrl,
    required this.onLoadCampaign,
  });

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  List<CampaignInfo> _campaigns = [];
  bool _loadingCampaigns = true;
  String? _campaignError;

  // Selection state
  // null means "Active/Temporary Queue"
  String? _selectedCampaignId;
  String _selectedCampaignName = "Active/Temporary Queue";
  List<LeadItem> _selectedCampaignLeads = [];
  bool _loadingLeads = false;
  String? _leadsError;

  static const Color _card = Color(0xFF0F172A);
  static const Color _border = Color(0xFF1E293B);
  static const Color _amber = Color(0xFFFFB800);
  static const Color _emerald = Color(0xFF10B981);
  static const Color _slateGray = Color(0xFF64748B);

  @override
  void initState() {
    super.initState();
    _fetchCampaigns();
  }

  Future<void> _fetchCampaigns() async {
    if (!mounted) return;
    setState(() {
      _loadingCampaigns = true;
      _campaignError = null;
    });

    try {
      final uri = Uri.parse('${widget.serverUrl}/api/campaigns/mobile');
      final res = await http.get(uri).timeout(const Duration(seconds: 8));
      if (res.statusCode == 200) {
        final List<dynamic> data = json.decode(res.body);
        if (mounted) {
          setState(() {
            _campaigns = data.map((e) => CampaignInfo.fromJson(e)).toList();
            _loadingCampaigns = false;
          });
        }
      } else {
        if (mounted) {
          setState(() {
            _campaignError = 'Server error ${res.statusCode}';
            _loadingCampaigns = false;
          });
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _campaignError = 'Could not fetch campaigns: $e';
          _loadingCampaigns = false;
        });
      }
    }
  }

  Future<void> _fetchCampaignLeads(String campaignId, String campaignName) async {
    if (!mounted) return;
    setState(() {
      _loadingLeads = true;
      _leadsError = null;
      _selectedCampaignId = campaignId;
      _selectedCampaignName = campaignName;
    });

    try {
      final uri = Uri.parse('${widget.serverUrl}/api/campaigns/$campaignId/leads');
      final res = await http.get(uri).timeout(const Duration(seconds: 8));
      if (res.statusCode == 200) {
        final List<dynamic> data = json.decode(res.body);
        final List<LeadItem> loadedLeads = data.map((item) {
          return LeadItem(
            id: item['id'] ?? '',
            name: item['name'] ?? 'Unknown Lead',
            phone: item['phone'] ?? '',
            status: item['status'] ?? 'PENDING',
          );
        }).toList();

        if (mounted) {
          setState(() {
            _selectedCampaignLeads = loadedLeads;
            _loadingLeads = false;
          });
        }
      } else {
        if (mounted) {
          setState(() {
            _leadsError = 'Server returned code ${res.statusCode}';
            _loadingLeads = false;
          });
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _leadsError = 'Error loading campaign data: $e';
          _loadingLeads = false;
        });
      }
    }
  }

  void _selectActiveQueue() {
    setState(() {
      _selectedCampaignId = null;
      _selectedCampaignName = "Active/Temporary Queue";
      _selectedCampaignLeads = widget.queue;
      _loadingLeads = false;
      _leadsError = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    // Determine the active leads to calculate stats and chart
    final List<LeadItem> activeLeads = _selectedCampaignId == null ? widget.queue : _selectedCampaignLeads;

    int pending = 0;
    int completed = 0;
    int calling = 0;
    int noAnswer = 0;

    for (var lead in activeLeads) {
      if (lead.status == 'PENDING') {
        pending++;
      } else if (lead.status == 'COMPLETED') {
        completed++;
      } else if (lead.status == 'CALLING') {
        calling++;
      } else if (lead.status == 'NO_ANSWER') {
        noAnswer++;
      }
    }

    int total = activeLeads.length;
    bool hasData = total > 0;
    double completionPct = total > 0 ? (completed / total) * 100 : 0.0;

    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 20.0, vertical: 16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Header Banner
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFF1E293B), Color(0xFF0F172A)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: const Color(0xFF334155).withOpacity(0.6)),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.4),
                    blurRadius: 16,
                    offset: const Offset(0, 6),
                  )
                ],
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                              decoration: BoxDecoration(
                                color: _amber.withOpacity(0.2),
                                borderRadius: BorderRadius.circular(6),
                                border: Border.all(color: _amber.withOpacity(0.4)),
                              ),
                              child: const Text(
                                'EXECUTIVE TELECOM',
                                style: TextStyle(
                                  fontSize: 9,
                                  fontWeight: FontWeight.bold,
                                  color: _amber,
                                  letterSpacing: 1.2,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        Text(
                          _selectedCampaignName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w900,
                            color: Colors.white,
                            fontFamily: 'Ubuntu',
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 10),
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: const LinearGradient(
                        colors: [_amber, Color(0xFFD97706)],
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: _amber.withOpacity(0.4),
                          blurRadius: 12,
                          offset: const Offset(0, 4),
                        )
                      ],
                    ),
                    child: IconButton(
                      icon: const Icon(Icons.refresh, color: Color(0xFF0F172A), size: 20),
                      onPressed: () {
                        _fetchCampaigns();
                        if (_selectedCampaignId != null) {
                          _fetchCampaignLeads(_selectedCampaignId!, _selectedCampaignName);
                        }
                      },
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 16),

            // Horizontal Campaigns List
            const Text(
              'SELECT CAMPAIGN TO VIEW OR RESUME',
              style: TextStyle(
                fontSize: 9,
                fontWeight: FontWeight.bold,
                color: _slateGray,
                letterSpacing: 1.0,
              ),
            ),
            const SizedBox(height: 8),
            SizedBox(
              height: 70,
              child: _loadingCampaigns
                  ? const Center(
                      child: SizedBox(
                        width: 24,
                        height: 24,
                        child: CircularProgressIndicator(strokeWidth: 2, color: _amber),
                      ),
                    )
                  : _campaignError != null && _campaigns.isEmpty
                      ? Center(
                          child: Text(
                            _campaignError!,
                            style: const TextStyle(fontSize: 11, color: Colors.redAccent),
                          ),
                        )
                      : ListView(
                      scrollDirection: Axis.horizontal,
                      children: [
                        // Option for local CSV active queue
                        GestureDetector(
                          onTap: _selectActiveQueue,
                          child: Container(
                            width: 140,
                            margin: const EdgeInsets.only(right: 10),
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                            decoration: BoxDecoration(
                              color: _selectedCampaignId == null ? _amber.withOpacity(0.15) : _card,
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(
                                color: _selectedCampaignId == null ? _amber : _border,
                                width: 1.5,
                              ),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                const Text(
                                  'LOCAL FILE / QUEUE',
                                  style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  '${widget.queue.length} Leads',
                                  style: const TextStyle(color: _slateGray, fontSize: 10),
                                ),
                              ],
                            ),
                          ),
                        ),
                        // Fetch campaigns from server
                        ..._campaigns.map((camp) {
                          final isSelected = _selectedCampaignId == camp.id;
                          return GestureDetector(
                            onTap: () => _fetchCampaignLeads(camp.id, camp.name),
                            child: Container(
                              width: 140,
                              margin: const EdgeInsets.only(right: 10),
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                              decoration: BoxDecoration(
                                color: isSelected ? _emerald.withOpacity(0.15) : _card,
                                borderRadius: BorderRadius.circular(14),
                                border: Border.all(
                                  color: isSelected ? _emerald : _border,
                                  width: 1.5,
                                ),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Text(
                                    camp.name,
                                    style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    '${camp.leadCount} Leads',
                                    style: const TextStyle(color: _slateGray, fontSize: 10),
                                  ),
                                ],
                              ),
                            ),
                          );
                        }),
                      ],
                    ),
            ),

            const SizedBox(height: 16),

            // Stats Row
            Row(
              children: [
                _buildStatCard('TOTAL QUEUE', total.toString(), _slateGray, Icons.format_list_bulleted_rounded),
                const SizedBox(width: 10),
                _buildStatCard('PENDING', pending.toString(), const Color(0xFF3B82F6), Icons.hourglass_top_rounded),
                const SizedBox(width: 10),
                _buildStatCard('COMPLETED', completed.toString(), _emerald, Icons.check_circle_rounded),
              ],
            ),

            const SizedBox(height: 16),

            // Pie Chart or Details
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [_card, Color(0xFF1E293B)],
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                ),
                borderRadius: BorderRadius.circular(24),
                border: Border.all(color: const Color(0xFF334155).withOpacity(0.8)),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.5),
                    blurRadius: 20,
                    offset: const Offset(0, 10),
                  )
                ],
              ),
              child: _loadingLeads
                  ? const Center(
                      child: Padding(
                        padding: EdgeInsets.symmetric(vertical: 40.0),
                        child: CircularProgressIndicator(color: _amber),
                      ),
                    )
                  : _leadsError != null
                      ? Center(child: Text(_leadsError!, style: const TextStyle(color: Colors.redAccent)))
                      : Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                const Text(
                                  'CAMPAIGN CONVERSION PIE',
                                  style: TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.bold,
                                    color: _slateGray,
                                    letterSpacing: 1.2,
                                  ),
                                ),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                  decoration: BoxDecoration(
                                    color: _emerald.withOpacity(0.15),
                                    borderRadius: BorderRadius.circular(12),
                                    border: Border.all(color: _emerald.withOpacity(0.3)),
                                  ),
                                  child: Text(
                                    '${completionPct.toStringAsFixed(1)}% Done',
                                    style: const TextStyle(
                                      fontSize: 10,
                                      fontWeight: FontWeight.bold,
                                      color: _emerald,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 20),
                            SizedBox(
                              height: 185,
                              child: !hasData
                                  ? Center(
                                      child: Column(
                                        mainAxisAlignment: MainAxisAlignment.center,
                                        children: [
                                          Icon(Icons.pie_chart_outline_rounded, size: 56, color: Colors.white.withOpacity(0.15)),
                                          const SizedBox(height: 12),
                                          const Text(
                                            'No Queue Data Available\nImport a CSV or select an active campaign to view metrics.',
                                            textAlign: TextAlign.center,
                                            style: TextStyle(color: _slateGray, fontSize: 12, height: 1.5),
                                          ),
                                        ],
                                      ),
                                    )
                                  : Stack(
                                      alignment: Alignment.center,
                                      children: [
                                        PieChart(
                                          PieChartData(
                                            sectionsSpace: 3,
                                            centerSpaceRadius: 65,
                                            startDegreeOffset: -90,
                                            sections: [
                                              if (pending > 0)
                                                PieChartSectionData(
                                                  color: const Color(0xFF3B82F6),
                                                  value: pending.toDouble(),
                                                  title: '${((pending / total) * 100).toStringAsFixed(0)}%',
                                                  radius: 36,
                                                  titleStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w900, color: Colors.white),
                                                ),
                                              if (completed > 0)
                                                PieChartSectionData(
                                                  color: _emerald,
                                                  value: completed.toDouble(),
                                                  title: '${((completed / total) * 100).toStringAsFixed(0)}%',
                                                  radius: 44,
                                                  titleStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w900, color: Colors.white),
                                                ),
                                              if (calling > 0)
                                                PieChartSectionData(
                                                  color: _amber,
                                                  value: calling.toDouble(),
                                                  title: '${((calling / total) * 100).toStringAsFixed(0)}%',
                                                  radius: 40,
                                                  titleStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w900, color: Colors.black),
                                                ),
                                              if (noAnswer > 0)
                                                PieChartSectionData(
                                                  color: Colors.redAccent,
                                                  value: noAnswer.toDouble(),
                                                  title: '${((noAnswer / total) * 100).toStringAsFixed(0)}%',
                                                  radius: 38,
                                                  titleStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w900, color: Colors.white),
                                                ),
                                            ],
                                          ),
                                        ),
                                        Column(
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            Text(
                                              '${completionPct.toStringAsFixed(0)}%',
                                              style: const TextStyle(
                                                fontSize: 28,
                                                fontWeight: FontWeight.w900,
                                                color: Colors.white,
                                                fontFamily: 'monospace',
                                                letterSpacing: -1,
                                              ),
                                            ),
                                            const Text(
                                              'COMPLETED',
                                              style: TextStyle(
                                                fontSize: 8,
                                                fontWeight: FontWeight.bold,
                                                color: _emerald,
                                                letterSpacing: 1.5,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ],
                                    ),
                            ),
                            const SizedBox(height: 16),
                            // Legend
                            if (hasData)
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                                decoration: BoxDecoration(
                                  color: _card.withOpacity(0.8),
                                  borderRadius: BorderRadius.circular(16),
                                  border: Border.all(color: const Color(0xFF334155).withOpacity(0.4)),
                                ),
                                child: Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                                  children: [
                                    _buildLegendItem('Pending', pending, const Color(0xFF3B82F6)),
                                    _buildLegendItem('Calling', calling, _amber),
                                    _buildLegendItem('Done', completed, _emerald),
                                    _buildLegendItem('No Ans', noAnswer, Colors.redAccent),
                                  ],
                                ),
                              ),

                            // Load/Resume Button
                            if (_selectedCampaignId != null && hasData) ...[
                              const SizedBox(height: 14),
                              SizedBox(
                                width: double.infinity,
                                child: pending > 0
                                    ? ElevatedButton.icon(
                                        onPressed: () {
                                          widget.onLoadCampaign(_selectedCampaignLeads, _selectedCampaignId!);
                                        },
                                        style: ElevatedButton.styleFrom(
                                          backgroundColor: _emerald,
                                          foregroundColor: Colors.white,
                                          padding: const EdgeInsets.symmetric(vertical: 12),
                                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                        ),
                                        icon: const Icon(Icons.play_circle_outline, size: 18),
                                        label: const Text(
                                          'RESUME AUTO DIALING',
                                          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12, letterSpacing: 1.0),
                                        ),
                                      )
                                    : Container(
                                        padding: const EdgeInsets.symmetric(vertical: 12),
                                        decoration: BoxDecoration(
                                          color: _amber.withOpacity(0.1),
                                          borderRadius: BorderRadius.circular(12),
                                          border: Border.all(color: _amber.withOpacity(0.3)),
                                        ),
                                        child: const Row(
                                          mainAxisAlignment: MainAxisAlignment.center,
                                          children: [
                                            Icon(Icons.check_circle_outline, color: _amber, size: 16),
                                            SizedBox(width: 8),
                                            Text(
                                              'CAMPAIGN COMPLETED',
                                              style: TextStyle(color: _amber, fontWeight: FontWeight.bold, fontSize: 11, letterSpacing: 1.0),
                                            ),
                                          ],
                                        ),
                                      ),
                              ),
                            ],
                          ],
                        ),
            ),

            // Live Queue Leads Card (Under the Pie Chart with Scrolling)
            if (hasData) ...[
              const SizedBox(height: 16),
              const Text(
                'LIVE QUEUE LEADS',
                style: TextStyle(
                  fontSize: 9,
                  fontWeight: FontWeight.bold,
                  color: _slateGray,
                  letterSpacing: 1.0,
                ),
              ),
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: _card,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: _border),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    ListView.builder(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      itemCount: activeLeads.length,
                      itemBuilder: (context, idx) {
                        final lead = activeLeads[idx];
                        Color statusColor = _slateGray;
                        IconData statusIcon = Icons.hourglass_empty;
                        if (lead.status == 'COMPLETED') {
                          statusColor = _emerald;
                          statusIcon = Icons.check_circle;
                        } else if (lead.status == 'CALLING') {
                          statusColor = _amber;
                          statusIcon = Icons.phone_in_talk;
                        } else if (lead.status == 'NO_ANSWER') {
                          statusColor = Colors.redAccent;
                          statusIcon = Icons.cancel;
                        }

                        return Container(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          decoration: BoxDecoration(
                            border: Border(bottom: BorderSide(color: _border.withOpacity(0.5))),
                          ),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    lead.name,
                                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    lead.phone,
                                    style: const TextStyle(color: _slateGray, fontSize: 10, fontFamily: 'monospace'),
                                  ),
                                ],
                              ),
                              Row(
                                children: [
                                  Icon(statusIcon, color: statusColor, size: 12),
                                  const SizedBox(width: 4),
                                  Text(
                                    lead.status,
                                    style: TextStyle(color: statusColor, fontSize: 9, fontWeight: FontWeight.bold),
                                  ),
                                ],
                              )
                            ],
                          ),
                        );
                      },
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildStatCard(String title, String value, Color color, IconData icon) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: _card,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: color.withOpacity(0.3)),
          boxShadow: [
            BoxShadow(
              color: color.withOpacity(0.05),
              blurRadius: 8,
              offset: const Offset(0, 4),
            )
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 8,
                    fontWeight: FontWeight.bold,
                    color: color,
                    letterSpacing: 0.8,
                  ),
                ),
                Icon(icon, size: 14, color: color),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              value,
              style: const TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w900,
                color: Colors.white,
                fontFamily: 'monospace',
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildLegendItem(String title, int count, Color color) {
    return Row(
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: color,
            boxShadow: [
              BoxShadow(
                color: color.withOpacity(0.6),
                blurRadius: 6,
                spreadRadius: 1,
              )
            ],
          ),
        ),
        const SizedBox(width: 6),
        Text(
          '$title: ',
          style: const TextStyle(
            fontSize: 10,
            color: Colors.white70,
            fontWeight: FontWeight.w500,
          ),
        ),
        Text(
          '$count',
          style: TextStyle(
            fontSize: 10,
            color: color,
            fontWeight: FontWeight.bold,
            fontFamily: 'monospace',
          ),
        ),
      ],
    );
  }
}
