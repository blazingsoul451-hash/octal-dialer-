import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import 'dart:async';
import 'package:file_picker/file_picker.dart';
import 'package:csv/csv.dart';
import 'package:excel/excel.dart' hide Border;
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/app_config.dart';
import '../services/phone_bridge_service.dart';
import '../widgets/octal_logo.dart';

class LeadItem {
  final String id;
  final String name;
  final String phone;
  String status; // 'PENDING', 'CALLING', 'COMPLETED', 'NO_ANSWER', 'SKIPPED'
  String? disposition;
  String? notes;
  int? duration;

  LeadItem({
    required this.id,
    required this.name,
    required this.phone,
    this.status = 'PENDING',
    this.disposition,
    this.notes,
    this.duration,
  });
}

class StandaloneDialerScreen extends StatefulWidget {
  final dynamic socket;
  final String? serverUrl;
  final List<LeadItem>? queue;
  final VoidCallback? onQueueUpdated;
  final String? sessionId;
  final String? campaignId;
  final String? campaignName;

  const StandaloneDialerScreen({
    super.key,
    this.socket,
    this.serverUrl,
    this.queue,
    this.onQueueUpdated,
    this.sessionId,
    this.campaignId,
    this.campaignName,
  });

  @override
  State<StandaloneDialerScreen> createState() => _StandaloneDialerScreenState();
}

class _StandaloneDialerScreenState extends State<StandaloneDialerScreen> with WidgetsBindingObserver {
  final TextEditingController _phoneController = TextEditingController();
  final TextEditingController _nameController = TextEditingController();
  
  late List<LeadItem> _queue;
  String _selectedFilter = 'Pending'; // 'Pending', 'Calling', 'Completed', 'Failed'
  
  bool _isAutoDialing = false;
  int _currentIndex = -1;
  int _intervalSeconds = 35; // Ring timeout
  int _delayBetweenCallsSeconds = 3; // Configurable Next-Call Delay
  Timer? _autoDialTimer;
  int _countdown = 0;

  DateTime? _callStartTime;
  bool _callActive = false;
  String? _activeCallLeadId;

  static const MethodChannel _nativeChannel = MethodChannel('com.octal.dialer/call');

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _queue = widget.queue ?? [];
    
    _nativeChannel.setMethodCallHandler((call) async {
      if (call.method == 'onCallStateChanged') {
        final state = call.arguments as String;
        if (mounted) {
          _handleNativeCallStateChange(state);
        }
      }
    });

    if (widget.socket != null) {
      widget.socket.on('leads:updated', (_) {
        if (mounted) _fetchBackendQueue();
      });
      widget.socket.on('campaigns:updated', (_) {
        if (mounted) _fetchBackendQueue();
      });
      widget.socket.on('campaign:selected', (data) {
        final campId = data is Map ? data['campaignId']?.toString() : data?.toString();
        if (campId != null && mounted) {
          _fetchBackendQueue(campId);
        }
      });
    }

    if (_queue.isEmpty) {
      _fetchBackendQueue();
    }
  }

  @override
  void didUpdateWidget(StandaloneDialerScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.queue != null && widget.queue != oldWidget.queue) {
      setState(() {
        _queue = widget.queue!;
      });
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _nativeChannel.invokeMethod('keepScreenOn', {'enable': false});
    _autoDialTimer?.cancel();
    _phoneController.dispose();
    _nameController.dispose();
    super.dispose();
  }

  void _handleNativeCallStateChange(String state) {
    if (state == 'OFFHOOK') {
      _callActive = true;
      _callStartTime = DateTime.now();
    } else if (state == 'IDLE' && _callActive) {
      _callActive = false;
      final duration = _callStartTime != null 
          ? DateTime.now().difference(_callStartTime!).inSeconds 
          : 0;
      
      if (_activeCallLeadId != null) {
        _showDispositionDialog(_activeCallLeadId!, duration);
      }
    }
  }

  Future<void> _makeCall(String phone, String name, {String? leadId}) async {
    final cleanPhone = phone.replaceAll(RegExp(r'[^\d+]'), '');
    if (cleanPhone.isEmpty) return;

    if (leadId != null) {
      _activeCallLeadId = leadId;
      final idx = _queue.indexWhere((l) => l.id == leadId);
      if (idx != -1) {
        setState(() {
          _queue[idx].status = 'CALLING';
        });
      }
    }

    // Launch direct phone dialer via Android MethodChannel
    try {
      await _nativeChannel.invokeMethod('makeDirectCall', {'phone': cleanPhone});
    } catch (e) {
      final telUri = Uri.parse('tel:$cleanPhone');
      try {
        await launchUrl(telUri, mode: LaunchMode.externalApplication);
      } catch (err) {
        debugPrint('Could not launch native phone: $err');
      }
    }
  }

  void _startAutoDialing() {
    if (_queue.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Lead queue is empty. Import or add leads to start dialing.')),
      );
      return;
    }

    setState(() {
      _isAutoDialing = true;
    });

    _nativeChannel.invokeMethod('keepScreenOn', {'enable': true});
    _dialNextInQueue();
  }

  void _pauseAutoDialing() {
    _autoDialTimer?.cancel();
    setState(() {
      _isAutoDialing = false;
      _countdown = 0;
    });
    _nativeChannel.invokeMethod('keepScreenOn', {'enable': false});
  }

  void _dialNextInQueue() {
    if (!_isAutoDialing) return;

    final nextIdx = _queue.indexWhere((l) => l.status == 'PENDING');
    if (nextIdx == -1) {
      _pauseAutoDialing();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Auto dialing complete! All leads processed.')),
      );
      return;
    }

    setState(() {
      _currentIndex = nextIdx;
    });

    final lead = _queue[nextIdx];
    _makeCall(lead.phone, lead.name, leadId: lead.id);
  }

  void _showDispositionDialog(String leadId, int duration) {
    final idx = _queue.indexWhere((l) => l.id == leadId);
    if (idx == -1) return;
    final lead = _queue[idx];

    String selectedDisp = 'Interested';
    final notesCtrl = TextEditingController();
    final List<String> dispOptions = [
      'Interested',
      'Not Interested',
      'No Answer',
      'Busy',
      'Wrong Number',
      'Callback Request',
      'Other'
    ];

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: OctalColors.bgDark,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            return Padding(
              padding: EdgeInsets.only(
                left: 20,
                right: 20,
                top: 20,
                bottom: MediaQuery.of(context).viewInsets.bottom + 20,
              ),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Header Bar
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          'Call Disposition',
                          style: TextStyle(
                            fontFamily: 'Ubuntu',
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                            color: Colors.white,
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.close, color: OctalColors.textSecondary, size: 22),
                          onPressed: () => Navigator.pop(ctx),
                        ),
                      ],
                    ),

                    const SizedBox(height: 12),

                    // Contact & Duration Banner from Reference Screen 5
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: OctalColors.surfaceCard,
                        borderRadius: BorderRadius.circular(18),
                        border: Border.all(color: OctalColors.border),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  lead.name,
                                  style: const TextStyle(
                                    fontFamily: 'Ubuntu',
                                    fontSize: 16,
                                    fontWeight: FontWeight.bold,
                                    color: Colors.white,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  lead.phone,
                                  style: const TextStyle(
                                    fontFamily: 'monospace',
                                    fontSize: 13,
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
                                '00:${duration.toString().padLeft(2, '0')}',
                                style: const TextStyle(
                                  fontFamily: 'monospace',
                                  fontSize: 14,
                                  fontWeight: FontWeight.bold,
                                  color: OctalColors.primaryGold,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                'Call Duration',
                                style: TextStyle(fontSize: 10, color: OctalColors.textMuted),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 16),

                    // Quick Disposition Chips Grid from Reference Screen 5
                    const Text(
                      'Disposition Result',
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: OctalColors.textSecondary),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: dispOptions.map((disp) {
                        final isSelected = selectedDisp == disp;
                        return ChoiceChip(
                          label: Text(
                            disp,
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.bold,
                              color: isSelected ? OctalColors.bgDark : Colors.white,
                            ),
                          ),
                          selected: isSelected,
                          selectedColor: OctalColors.primaryGold,
                          backgroundColor: OctalColors.surfaceCard,
                          side: BorderSide(
                            color: isSelected ? OctalColors.primaryGold : OctalColors.border,
                          ),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          onSelected: (val) {
                            if (val) {
                              setModalState(() => selectedDisp = disp);
                            }
                          },
                        );
                      }).toList(),
                    ),

                    const SizedBox(height: 16),

                    // Notes Text Area from Reference Screen 5
                    const Text(
                      'Notes',
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: OctalColors.textSecondary),
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: notesCtrl,
                      maxLines: 3,
                      maxLength: 500,
                      style: const TextStyle(color: Colors.white, fontSize: 13),
                      decoration: InputDecoration(
                        hintText: 'Enter lead notes or follow-up instructions...',
                        hintStyle: TextStyle(color: OctalColors.textMuted, fontSize: 12),
                        filled: true,
                        fillColor: OctalColors.surfaceCard,
                        counterStyle: TextStyle(color: OctalColors.textMuted, fontSize: 11),
                        contentPadding: const EdgeInsets.all(14),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                          borderSide: const BorderSide(color: OctalColors.border),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                          borderSide: const BorderSide(color: OctalColors.primaryGold, width: 1.5),
                        ),
                      ),
                    ),

                    const SizedBox(height: 12),

                    // Save & Next Full Width Button from Reference Screen 5
                    SizedBox(
                      height: 52,
                      child: ElevatedButton(
                        onPressed: () {
                          Navigator.pop(ctx);
                          _saveDisposition(leadId, selectedDisp, notesCtrl.text, duration);
                        },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: OctalColors.primaryGold,
                          foregroundColor: OctalColors.bgDark,
                          elevation: 4,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                        ),
                        child: const Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(
                              'Save & Next',
                              style: TextStyle(
                                fontFamily: 'Ubuntu',
                                fontSize: 15,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                            SizedBox(width: 8),
                            Icon(Icons.arrow_forward, size: 18),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  void _saveDisposition(String leadId, String disposition, String notes, int duration) {
    final idx = _queue.indexWhere((l) => l.id == leadId);
    if (idx != -1) {
      setState(() {
        _queue[idx].status = 'COMPLETED';
        _queue[idx].disposition = disposition;
        _queue[idx].notes = notes;
        _queue[idx].duration = duration;
      });
    }

    // If Auto Dialing is active, run the configurable next-call delay countdown!
    if (_isAutoDialing) {
      _startNextCallDelayCountdown();
    }
  }

  void _startNextCallDelayCountdown() {
    _autoDialTimer?.cancel();

    if (_delayBetweenCallsSeconds <= 0) {
      _dialNextInQueue();
      return;
    }

    setState(() {
      _countdown = _delayBetweenCallsSeconds;
    });

    _autoDialTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }
      setState(() {
        _countdown--;
        if (_countdown <= 0) {
          timer.cancel();
          _dialNextInQueue();
        }
      });
    });
  }

  Future<void> _fetchBackendQueue([String? targetCampId]) async {
    final serverUrl = widget.serverUrl ?? AppConfig.apiBaseUrl;
    final token = PhoneBridgeService.instance.authToken;
    if (token.isEmpty) return;

    try {
      final campRes = await http.get(
        Uri.parse('$serverUrl/api/campaigns'),
        headers: {
          'Authorization': 'Bearer $token',
          'bypass-tunnel-reminder': 'true',
        },
      ).timeout(const Duration(seconds: 25));

      if (campRes.statusCode == 200) {
        final List camps = jsonDecode(campRes.body);
        if (camps.isNotEmpty) {
          final typedCamps = camps.map((e) => Map<String, dynamic>.from(e as Map)).toList();
          Map<String, dynamic> activeCamp = typedCamps.first;

          final requestedId = targetCampId ?? widget.campaignId;
          if (requestedId != null) {
            activeCamp = typedCamps.firstWhere((c) => c['id'] == requestedId, orElse: () => typedCamps.first);
          } else {
            // Default to largest production campaign (e.g. 5,168 leads)
            final sorted = List<Map<String, dynamic>>.from(typedCamps);
            sorted.sort((a, b) => ((b['leadCount'] ?? 0) as int).compareTo((a['leadCount'] ?? 0) as int));
            activeCamp = sorted.first;
          }

          final campId = activeCamp['id']?.toString() ?? '';
          final leadsRes = await http.get(
            Uri.parse('$serverUrl/api/campaigns/$campId/leads'),
            headers: {
              'Authorization': 'Bearer $token',
              'bypass-tunnel-reminder': 'true',
            },
          ).timeout(const Duration(seconds: 25));

          if (leadsRes.statusCode == 200) {
            final List list = jsonDecode(leadsRes.body);
            final List<LeadItem> loaded = list.map((item) => LeadItem(
              id: item['id']?.toString() ?? '',
              name: item['name']?.toString() ?? 'Contact',
              phone: item['phone']?.toString() ?? '',
              status: item['status']?.toString() ?? 'PENDING',
              disposition: item['outcome']?.toString(),
              duration: item['duration'] is int ? item['duration'] : null,
            )).toList();

            if (mounted) {
              setState(() {
                _queue = loaded;
              });
              widget.onQueueUpdated?.call();
            }
          }
        }
      }
    } catch (e) {
      debugPrint('Queue fetch error: $e');
    }
  }

  void _exportLeads() {
    if (_queue.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No leads to export.')),
      );
      return;
    }
    final csvRows = [
      ['Name', 'Phone', 'Status', 'Outcome', 'Duration (s)'],
      ..._queue.map((l) => [l.name, l.phone, l.status, l.disposition ?? '', l.duration?.toString() ?? '0'])
    ];
    final csv = const ListToCsvConverter().convert(csvRows);
    Clipboard.setData(ClipboardData(text: csv));
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Exported ${_queue.length} leads (copied to clipboard as CSV).'),
        backgroundColor: const Color(0xFF10B981),
      ),
    );
  }

  Future<void> _pickAndImportFile() async {
    final res = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['csv', 'xlsx', 'xls'],
    );
    if (res == null || res.files.single.path == null) return;

    final filePath = res.files.single.path!;
    final fileName = res.files.single.name;
    List<Map<String, String>> rawLeads = [];

    try {
      if (filePath.endsWith('.csv')) {
        final input = File(filePath).openRead();
        final fields = await input.transform(utf8.decoder).transform(const CsvToListConverter()).toList();
        for (int i = 1; i < fields.length; i++) {
          final row = fields[i];
          if (row.length >= 2) {
            final name = row[0].toString().trim();
            final phone = row[1].toString().trim();
            if (phone.isNotEmpty) {
              rawLeads.add({'name': name.isEmpty ? 'Contact' : name, 'phone': phone});
            }
          }
        }
      } else {
        final bytes = File(filePath).readAsBytesSync();
        final excel = Excel.decodeBytes(bytes);
        for (final table in excel.tables.keys) {
          final sheet = excel.tables[table]!;
          for (int i = 1; i < sheet.rows.length; i++) {
            final row = sheet.rows[i];
            if (row.length >= 2 && row[1]?.value != null) {
              final name = row[0]?.value?.toString().trim() ?? 'Contact';
              final phone = row[1]?.value?.toString().trim() ?? '';
              if (phone.isNotEmpty) {
                rawLeads.add({'name': name.isEmpty ? 'Contact' : name, 'phone': phone});
              }
            }
          }
        }
      }

      if (rawLeads.isEmpty) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('No valid lead rows found in file.')),
          );
        }
        return;
      }

      final serverUrl = widget.serverUrl ?? AppConfig.apiBaseUrl;
      final token = PhoneBridgeService.instance.authToken;

      final postRes = await http.post(
        Uri.parse('$serverUrl/api/leads/import/mobile'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $token',
          'bypass-tunnel-reminder': 'true',
        },
        body: jsonEncode({
          'campaignName': 'Mobile Import - ${fileName.replaceAll(RegExp(r'\.[^.]+$'), '')}',
          'fileName': fileName,
          'leads': rawLeads,
        }),
      ).timeout(const Duration(seconds: 15));

      if (postRes.statusCode == 200) {
        final data = jsonDecode(postRes.body);
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                'Imported ${data['count']} unique leads (${data['dedupedCount'] ?? 0} duplicates skipped)!',
              ),
              backgroundColor: const Color(0xFF10B981),
            ),
          );
        }
        _fetchBackendQueue();
      } else {
        final err = jsonDecode(postRes.body);
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Import failed: ${err['error'] ?? 'Server error'}')),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to import leads: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final pendingCount = _queue.where((l) => l.status == 'PENDING').length;
    final callingCount = _queue.where((l) => l.status == 'CALLING').length;
    final completedCount = _queue.where((l) => l.status == 'COMPLETED').length;
    final failedCount = _queue.where((l) => l.status == 'NO_ANSWER' || l.status == 'SKIPPED').length;

    List<LeadItem> filteredLeads = [];
    if (_selectedFilter == 'Pending') {
      filteredLeads = _queue.where((l) => l.status == 'PENDING').toList();
    } else if (_selectedFilter == 'Calling') {
      filteredLeads = _queue.where((l) => l.status == 'CALLING').toList();
    } else if (_selectedFilter == 'Completed') {
      filteredLeads = _queue.where((l) => l.status == 'COMPLETED').toList();
    } else {
      filteredLeads = _queue.where((l) => l.status == 'NO_ANSWER' || l.status == 'SKIPPED').toList();
    }

    final isPendingTab = _selectedFilter == 'Pending';

    return Scaffold(
      backgroundColor: OctalColors.bgDark,
      appBar: AppBar(
        backgroundColor: OctalColors.surfaceCard,
        title: const Text(
          'Leads Queue',
          style: TextStyle(
            fontFamily: 'Ubuntu',
            fontSize: 16,
            fontWeight: FontWeight.bold,
            color: Colors.white,
          ),
        ),
        actions: [
          if (isPendingTab)
            IconButton(
              icon: const Icon(Icons.file_upload_outlined, color: OctalColors.primaryGold, size: 22),
              tooltip: 'Import Leads',
              onPressed: _pickAndImportFile,
            ),
          IconButton(
            icon: const Icon(Icons.file_download_outlined, color: Colors.white70, size: 22),
            tooltip: 'Export Leads',
            onPressed: _exportLeads,
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            // Top Status Filter Pill Tabs from Reference Screen 4
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              color: OctalColors.surfaceCard,
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    _buildPillTab('Pending', pendingCount),
                    const SizedBox(width: 8),
                    _buildPillTab('Calling', callingCount),
                    const SizedBox(width: 8),
                    _buildPillTab('Completed', completedCount),
                    const SizedBox(width: 8),
                    _buildPillTab('Failed', failedCount),
                  ],
                ),
              ),
            ),

            // Next-Call Delay Countdown Bar (if auto dialing)
            if (_isAutoDialing && _countdown > 0) ...[
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
                color: OctalColors.primaryGold.withOpacity(0.15),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(color: OctalColors.primaryGold, strokeWidth: 2),
                        ),
                        const SizedBox(width: 12),
                        Text(
                          'Next Call in ${_countdown}s...',
                          style: const TextStyle(
                            fontFamily: 'Ubuntu',
                            fontSize: 13,
                            fontWeight: FontWeight.bold,
                            color: OctalColors.primaryGold,
                          ),
                        ),
                      ],
                    ),
                    TextButton(
                      onPressed: _dialNextInQueue,
                      child: const Text('Dial Now', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                    ),
                  ],
                ),
              ),
            ],

            // Leads Queue List View
            Expanded(
              child: filteredLeads.isEmpty
                  ? Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.people_outline, color: OctalColors.textMuted, size: 48),
                          const SizedBox(height: 12),
                          Text(
                            'No ${_selectedFilter.toLowerCase()} leads in queue',
                            style: const TextStyle(fontSize: 14, color: OctalColors.textSecondary),
                          ),
                          const SizedBox(height: 16),
                          if (isPendingTab)
                            OutlinedButton.icon(
                              onPressed: _pickAndImportFile,
                              icon: const Icon(Icons.add, color: OctalColors.primaryGold, size: 18),
                              label: const Text('Import Leads', style: TextStyle(color: OctalColors.primaryGold)),
                              style: OutlinedButton.styleFrom(
                                side: const BorderSide(color: OctalColors.primaryGold),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                              ),
                            ),
                        ],
                      ),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.all(16),
                      itemCount: filteredLeads.length,
                      itemBuilder: (context, index) {
                        final lead = filteredLeads[index];
                        final globalIdx = _queue.indexOf(lead) + 1;

                        return Container(
                          margin: const EdgeInsets.only(bottom: 10),
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: OctalColors.surfaceCard,
                            borderRadius: BorderRadius.circular(18),
                            border: Border.all(
                              color: lead.status == 'CALLING' 
                                  ? OctalColors.primaryGold 
                                  : OctalColors.border,
                              width: lead.status == 'CALLING' ? 1.5 : 1.0,
                            ),
                          ),
                          child: Row(
                            children: [
                              // Number Pill from Reference Screen 4
                              Container(
                                width: 34,
                                height: 34,
                                decoration: BoxDecoration(
                                  color: lead.status == 'CALLING' 
                                      ? OctalColors.primaryGold 
                                      : OctalColors.surfaceElevated,
                                  borderRadius: BorderRadius.circular(10),
                                ),
                                child: Center(
                                  child: Text(
                                    '$globalIdx',
                                    style: TextStyle(
                                      fontFamily: 'Ubuntu',
                                      fontSize: 12,
                                      fontWeight: FontWeight.w900,
                                      color: lead.status == 'CALLING' ? OctalColors.bgDark : Colors.white,
                                    ),
                                  ),
                                ),
                              ),
                              const SizedBox(width: 14),

                              // Name & Phone
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      lead.name,
                                      style: const TextStyle(
                                        fontFamily: 'Ubuntu',
                                        fontSize: 14,
                                        fontWeight: FontWeight.bold,
                                        color: Colors.white,
                                      ),
                                    ),
                                    const SizedBox(height: 3),
                                    Text(
                                      lead.phone,
                                      style: const TextStyle(
                                        fontFamily: 'monospace',
                                        fontSize: 12,
                                        color: OctalColors.textSecondary,
                                      ),
                                    ),
                                  ],
                                ),
                              ),

                              // Action / Status
                              if (lead.status == 'PENDING') ...[
                                ElevatedButton(
                                  onPressed: () => _makeCall(lead.phone, lead.name, leadId: lead.id),
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: OctalColors.surfaceElevated,
                                    foregroundColor: OctalColors.primaryGold,
                                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                                  ),
                                  child: const Text('Next', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                                ),
                              ] else if (lead.status == 'CALLING') ...[
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                  decoration: BoxDecoration(
                                    color: OctalColors.primaryGold.withOpacity(0.2),
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: const Text(
                                    'DIALING',
                                    style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, color: OctalColors.primaryGold),
                                  ),
                                ),
                              ] else ...[
                                Text(
                                  lead.disposition ?? lead.status,
                                  style: const TextStyle(fontSize: 11, color: OctalColors.success, fontWeight: FontWeight.bold),
                                ),
                              ],
                            ],
                          ),
                        );
                      },
                    ),
            ),

            // Sticky Bottom Action Bar from Reference Screen 4: "▶ Start Auto Dial"
            Container(
              padding: const EdgeInsets.all(16),
              decoration: const BoxDecoration(
                color: OctalColors.surfaceCard,
                border: Border(top: BorderSide(color: OctalColors.border)),
              ),
              child: SizedBox(
                width: double.infinity,
                height: 52,
                child: ElevatedButton.icon(
                  onPressed: _isAutoDialing ? _pauseAutoDialing : _startAutoDialing,
                  icon: Icon(
                    _isAutoDialing ? Icons.pause : Icons.play_arrow,
                    color: OctalColors.bgDark,
                    size: 22,
                  ),
                  label: Text(
                    _isAutoDialing ? 'Pause Auto Dial' : 'Start Auto Dial',
                    style: const TextStyle(
                      fontFamily: 'Ubuntu',
                      fontSize: 15,
                      fontWeight: FontWeight.w900,
                      color: OctalColors.bgDark,
                    ),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: OctalColors.primaryGold,
                    elevation: 4,
                    shadowColor: OctalColors.primaryGold.withOpacity(0.4),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPillTab(String title, int count) {
    final isSelected = _selectedFilter == title;
    return GestureDetector(
      onTap: () => setState(() => _selectedFilter = title),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected ? OctalColors.primaryGold : OctalColors.surfaceElevated,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Row(
          children: [
            Text(
              title,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.bold,
                color: isSelected ? OctalColors.bgDark : Colors.white,
              ),
            ),
            const SizedBox(width: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: isSelected ? OctalColors.bgDark.withOpacity(0.2) : OctalColors.bgDark,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                '$count',
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.bold,
                  color: isSelected ? OctalColors.bgDark : OctalColors.primaryGold,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
