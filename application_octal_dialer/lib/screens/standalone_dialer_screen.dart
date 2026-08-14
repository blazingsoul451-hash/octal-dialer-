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

class LeadItem {
  final String id;
  final String name;
  final String phone;
  String status; // 'PENDING', 'CALLING', 'COMPLETED', 'NO_ANSWER', 'SKIPPED'

  LeadItem({required this.id, required this.name, required this.phone, this.status = 'PENDING'});
}

class StandaloneDialerScreen extends StatefulWidget {
  final dynamic socket;
  final String? serverUrl;
  final List<LeadItem>? queue;
  final VoidCallback? onQueueUpdated;

  final String? sessionId;

  const StandaloneDialerScreen({
    super.key,
    this.socket,
    this.serverUrl,
    this.queue,
    this.onQueueUpdated,
    this.sessionId,
  });

  @override
  State<StandaloneDialerScreen> createState() => _StandaloneDialerScreenState();
}

class _StandaloneDialerScreenState extends State<StandaloneDialerScreen> with WidgetsBindingObserver {
  final TextEditingController _phoneController = TextEditingController();
  final TextEditingController _nameController = TextEditingController();
  
  late List<LeadItem> _queue;
  
  bool _isAutoDialing = false;
  int _currentIndex = -1;
  int _intervalSeconds = 35; // Ring timeout
  int _delayBetweenCallsSeconds = 3; // Delay between calls
  Timer? _autoDialTimer;
  int _countdown = 0;

  DateTime? _callStartTime;
  bool _callActive = false;
  String? _activeCallLeadId;

  static const Color _slateGray = Color(0xFF64748B);
  static const Color _emerald = Color(0xFF10B981);
  static const Color _amber = Color(0xFFFFB800);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _queue = widget.queue ?? [];
    
    // Listen to native phone state changes (IDLE, OFFHOOK, RINGING)
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
        if (mounted) {
          setState(() {
            _queue.clear();
            widget.onQueueUpdated?.call();
          });
        }
      });
    }
  }

  static const MethodChannel _nativeChannel = MethodChannel('com.octal.dialer/call');

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _nativeChannel.setMethodCallHandler(null);
    _nativeChannel.invokeMethod('keepScreenOn', {'enable': false});
    _autoDialTimer?.cancel();
    _phoneController.dispose();
    _nameController.dispose();
    super.dispose();
  }

  void _handleNativeCallStateChange(String state) {
    debugPrint("Native Call State Changed: $state");
    if (state == 'OFFHOOK' || state == 'RINGING') {
      _callActive = true;
    } else if (state == 'IDLE') {
      if (_isAutoDialing && _currentIndex >= 0 && _currentIndex < _queue.length) {
        final currentLead = _queue[_currentIndex];
        if (_callActive && _activeCallLeadId == currentLead.id) {
          _callActive = false;
          _activeCallLeadId = null;
          _autoDialTimer?.cancel();

          final durationSecs = _callStartTime != null
              ? DateTime.now().difference(_callStartTime!).inSeconds
              : 0;

          if (widget.socket != null && widget.socket.connected) {
            widget.socket.emit('call:ended', {
              'sessionId': widget.sessionId ?? 'sess_default',
              'leadId': currentLead.id.startsWith('local_') ? null : currentLead.id,
              'phone': currentLead.phone,
              'name': currentLead.name,
              'reason': 'ANSWERED',
              'duration': durationSecs,
            });
          }

          setState(() {
            currentLead.status = 'COMPLETED';
          });
          _startBetweenCallsDelay();
        }
      }
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      if (_isAutoDialing && _currentIndex >= 0 && _currentIndex < _queue.length) {
        final currentLead = _queue[_currentIndex];
        if (_callActive && _activeCallLeadId == currentLead.id) {
          _callActive = false;
          _activeCallLeadId = null;
          _autoDialTimer?.cancel();

          final durationSecs = _callStartTime != null
              ? DateTime.now().difference(_callStartTime!).inSeconds
              : 0;

          if (widget.socket != null && widget.socket.connected) {
            widget.socket.emit('call:ended', {
              'sessionId': widget.sessionId ?? 'sess_default',
              'leadId': currentLead.id.startsWith('local_') ? null : currentLead.id,
              'phone': currentLead.phone,
              'name': currentLead.name,
              'reason': 'ANSWERED',
              'duration': durationSecs,
            });
          }

          setState(() {
            currentLead.status = 'COMPLETED';
          });
          _startBetweenCallsDelay();
        }
      }
    }
  }

  Future<void> _makeCall(String phone) async {
    final cleanPhone = phone.replaceAll(RegExp(r'[^\d+]'), '');
    try {
      await _nativeChannel.invokeMethod('makeDirectCall', {'phone': cleanPhone});
    } catch (e) {
      final uri = Uri.parse('tel:$cleanPhone');
      try {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      } catch (err) {
        debugPrint('Direct call error: $err');
      }
    }
  }

  void _addLead() {
    final phone = _phoneController.text.trim();
    final name = _nameController.text.trim();
    if (phone.isEmpty) return;

    setState(() {
      _queue.add(LeadItem(
        id: 'local_${DateTime.now().millisecondsSinceEpoch}',
        name: name.isEmpty ? 'Lead ${_queue.length + 1}' : name,
        phone: phone,
      ));
      _phoneController.clear();
      _nameController.clear();
      widget.onQueueUpdated?.call();
    });
  }

  Future<void> _importFile() async {
    try {
      FilePickerResult? result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['csv', 'xlsx', 'xls'],
      );

      if (result != null && result.files.single.path != null) {
        final file = File(result.files.single.path!);
        final extension = result.files.single.extension?.toLowerCase();
        
        List<LeadItem> importedLeads = [];
        
        if (extension == 'csv') {
          final input = await file.readAsString();
          List<List<dynamic>> rows = const CsvToListConverter().convert(input);
          if (rows.length > 1) { // Skip header assuming row 0 is header
            for (int i = 1; i < rows.length; i++) {
              final row = rows[i];
              if (row.length >= 2) {
                final name = row[0].toString().trim();
                final phone = row[1].toString().replaceAll(RegExp(r'[^\d+]'), '').trim();

                if (name.isNotEmpty && name.length <= 255 && phone.isNotEmpty && phone.length >= 10 && phone.length <= 20) {
                  importedLeads.add(LeadItem(
                    id: 'import_${DateTime.now().millisecondsSinceEpoch}_$i',
                    name: name,
                    phone: phone,
                  ));
                }
              }
            }
          }
        } else if (extension == 'xlsx' || extension == 'xls') {
          var bytes = await file.readAsBytes();
          var excel = Excel.decodeBytes(bytes);
          for (var table in excel.tables.keys) {
            final sheet = excel.tables[table];
            if (sheet != null && sheet.rows.length > 1) {
              for (int i = 1; i < sheet.rows.length; i++) {
                final row = sheet.rows[i];
                if (row.length >= 2 && row[0] != null && row[1] != null) {
                  final name = row[0]!.value.toString().trim();
                  final phone = row[1]!.value.toString().replaceAll(RegExp(r'[^\d+]'), '').trim();

                  if (name.isNotEmpty && name.length <= 255 && phone.isNotEmpty && phone.length >= 10 && phone.length <= 20) {
                    importedLeads.add(LeadItem(
                      id: 'import_${DateTime.now().millisecondsSinceEpoch}_$i',
                      name: name,
                      phone: phone,
                    ));
                  }
                }
              }
            }
          }
        }
        
        if (importedLeads.isNotEmpty) {
          bool saveToServer = false;
          String defaultCampaignName = result.files.single.name.replaceFirst(RegExp(r'\.[^.]+$'), '');
          
          if (widget.serverUrl != null && mounted) {
            // Show custom dialog asking to save as server campaign
            saveToServer = await showDialog<bool>(
              context: context,
              builder: (context) => AlertDialog(
                backgroundColor: const Color(0xFF0F172A),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                  side: const BorderSide(color: _amber),
                ),
                title: const Text(
                  'SAVE AS CAMPAIGN?',
                  style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold, letterSpacing: 1.2),
                ),
                content: Text(
                  'Would you like to save this file as a campaign on the server, so you can select and reuse it directly from the dashboard?',
                  style: TextStyle(color: Colors.white.withOpacity(0.8), fontSize: 11),
                ),
                actions: [
                  TextButton(
                    onPressed: () => Navigator.pop(context, false),
                    child: const Text('NO, JUST LOCAL', style: TextStyle(color: _slateGray, fontSize: 10, fontWeight: FontWeight.bold)),
                  ),
                  ElevatedButton(
                    onPressed: () => Navigator.pop(context, true),
                    style: ElevatedButton.styleFrom(backgroundColor: _emerald),
                    child: const Text('YES, SAVE IT', style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold)),
                  ),
                ],
              ),
            ) ?? false;
          }

          if (saveToServer && widget.serverUrl != null && mounted) {
            // Ask for Campaign Name
            final controller = TextEditingController(text: defaultCampaignName);
            bool submitted = await showDialog<bool>(
              context: context,
              builder: (context) => AlertDialog(
                backgroundColor: const Color(0xFF0F172A),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                  side: const BorderSide(color: _amber),
                ),
                title: const Text(
                  'CAMPAIGN NAME',
                  style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold, letterSpacing: 1.2),
                ),
                content: TextField(
                  controller: controller,
                  style: const TextStyle(color: Colors.white, fontSize: 12),
                  decoration: const InputDecoration(
                    labelText: 'Enter campaign name',
                    labelStyle: TextStyle(color: _slateGray, fontSize: 11),
                    enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: _slateGray)),
                    focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: _amber)),
                  ),
                ),
                actions: [
                  TextButton(
                    onPressed: () => Navigator.pop(context, false),
                    child: const Text('CANCEL', style: TextStyle(color: _slateGray, fontSize: 10, fontWeight: FontWeight.bold)),
                  ),
                  ElevatedButton(
                    onPressed: () => Navigator.pop(context, true),
                    style: ElevatedButton.styleFrom(backgroundColor: _amber),
                    child: const Text('SUBMIT', style: TextStyle(color: Colors.black, fontSize: 10, fontWeight: FontWeight.bold)),
                  ),
                ],
              ),
            ) ?? false;

            if (submitted && controller.text.trim().isNotEmpty && mounted) {
              final campaignName = controller.text.trim();
              // Make REST post request to backend /api/leads/import/mobile
              try {
                // Show loading spinner
                showDialog(
                  context: context,
                  barrierDismissible: false,
                  builder: (context) => const Center(
                    child: CircularProgressIndicator(color: _amber),
                  ),
                );

                final uri = Uri.parse('${widget.serverUrl}/api/leads/import/mobile');
                final response = await http.post(
                  uri,
                  headers: {'Content-Type': 'application/json'},
                  body: json.encode({
                    'campaignName': campaignName,
                    'fileName': result.files.single.name,
                    'leads': importedLeads.map((l) => {
                      'name': l.name,
                      'phone': l.phone,
                    }).toList(),
                  }),
                ).timeout(const Duration(seconds: 12));

                // Pop loading spinner
                if (mounted) Navigator.pop(context);

                if (response.statusCode == 200 || response.statusCode == 201) {
                  // Reload the dashboard campaign list by letting the app know
                  if (widget.socket != null) {
                    widget.socket.emit('leads:updated');
                  }

                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('Campaign "$campaignName" saved on server successfully!'), backgroundColor: _emerald),
                    );
                  }
                } else {
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('Failed to save on server (Code ${response.statusCode}). Saved locally instead.'), backgroundColor: Colors.redAccent),
                    );
                  }
                }
              } catch (e) {
                // Pop loading spinner if active
                if (mounted) Navigator.pop(context);
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Network error saving to server: $e. Saved locally instead.'), backgroundColor: Colors.redAccent),
                  );
                }
              }
            }
          }

          setState(() {
            _queue.clear(); // Clear old queue and populate with new leads
            _queue.addAll(importedLeads);
            _currentIndex = -1; // reset index for new queue
            widget.onQueueUpdated?.call();
          });
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('No valid leads found in file. Make sure columns are Name, Phone.')),
          );
        }
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error parsing file: $e')),
      );
    }
  }

  Future<void> _startAutoDialer() async {
    if (_queue.isEmpty) return;
    
    try {
      final bool granted = await _nativeChannel.invokeMethod('checkCallPermission');
      if (!granted) {
        final bool requestResult = await _nativeChannel.invokeMethod('requestCallPermission');
        if (!requestResult) {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('Permissions (CALL_PHONE and READ_PHONE_STATE) are required for auto-dialing!'),
                backgroundColor: Colors.redAccent,
              ),
            );
          }
          return;
        }
      }
    } catch (e) {
      debugPrint('Permission error: $e');
    }

    _nativeChannel.invokeMethod('keepScreenOn', {'enable': true});
    setState(() {
      _isAutoDialing = true;
      if (_currentIndex < 0 || _currentIndex >= _queue.length) {
        _currentIndex = 0;
      }
    });
    _dialNext();
  }

  void _stopAutoDialer() {
    _nativeChannel.invokeMethod('keepScreenOn', {'enable': false});
    _autoDialTimer?.cancel();
    setState(() {
      _isAutoDialing = false;
      _countdown = 0;
      _callActive = false;
      _activeCallLeadId = null;
    });
  }

  void _dialNext() {
    if (!_isAutoDialing || _currentIndex >= _queue.length) {
      _stopAutoDialer();
      return;
    }

    final currentLead = _queue[_currentIndex];
    setState(() {
      currentLead.status = 'CALLING';
      _countdown = _intervalSeconds;
      _callActive = true;
      _activeCallLeadId = currentLead.id;
      _callStartTime = DateTime.now();
    });

    _makeCall(currentLead.phone);

    // Start ring timeout countdown
    _autoDialTimer?.cancel();
    _autoDialTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) return;
      if (_countdown > 1) {
        setState(() {
          _countdown--;
        });
      } else {
        timer.cancel();
        _handleNoAnswer();
      }
    });
  }

  void _handleNoAnswer() {
    if (!_isAutoDialing || _currentIndex >= _queue.length) return;
    
    // Try to bring app to foreground
    try {
      _nativeChannel.invokeMethod('bringToForeground');
    } catch (e) {
      debugPrint('Could not bring to foreground: $e');
    }

    final currentLead = _queue[_currentIndex];
    if (_callActive && _activeCallLeadId == currentLead.id) {
      _callActive = false;
      _activeCallLeadId = null;

      // Emit call ended to the server as NO_ANSWER
      if (widget.socket != null && widget.socket.connected) {
        widget.socket.emit('call:ended', {
          'sessionId': widget.sessionId ?? 'sess_default',
          'leadId': currentLead.id.startsWith('local_') ? null : currentLead.id,
          'phone': currentLead.phone,
          'name': currentLead.name,
          'reason': 'NO_ANSWER',
          'duration': 0,
        });
      }

      setState(() {
        currentLead.status = 'NO_ANSWER';
      });
      
      _startBetweenCallsDelay();
    }
  }

  void _startBetweenCallsDelay() {
    if (!_isAutoDialing) return;
    
    _autoDialTimer?.cancel();
    setState(() {
      _countdown = _delayBetweenCallsSeconds; // Use the configured delay
    });

    _autoDialTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) return;
      if (_countdown > 1) {
        setState(() {
          _countdown--;
        });
      } else {
        timer.cancel();
        if (mounted && _isAutoDialing) {
          setState(() {
            _currentIndex++;
          });
          if (_currentIndex < _queue.length) {
            _dialNext();
          } else {
            _stopAutoDialer();
          }
        }
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFF0F172A),
        elevation: 0,
        title: const Row(
          children: [
            Icon(Icons.phone_in_talk, color: _amber, size: 20),
            SizedBox(width: 8),
            Text(
              'OCTAL MOBILE DIALER',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, letterSpacing: 1.2),
            ),
          ],
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Auto Dialer Status Card
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: _isAutoDialing 
                    ? const Color(0xFF064E3B).withOpacity(0.4)
                    : const Color(0xFF0F172A),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: _isAutoDialing ? _emerald : const Color(0xFF1E293B),
                ),
              ),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Row(
                        children: [
                          Container(
                            width: 10,
                            height: 10,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: _isAutoDialing ? _emerald : _amber,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            _isAutoDialing ? 'AUTO DIALER ACTIVE' : 'DIALER STANDBY',
                            style: TextStyle(
                              color: _isAutoDialing ? _emerald : _amber,
                              fontWeight: FontWeight.bold,
                              fontSize: 12,
                              letterSpacing: 1.0,
                            ),
                          ),
                        ],
                      ),
                      if (_isAutoDialing)
                        Text(
                          'Next in: ${_countdown}s',
                          style: const TextStyle(
                            color: Colors.white70,
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  // Interval Slider
                  Row(
                    children: [
                      const SizedBox(
                        width: 80,
                        child: Text('Ring Timeout:', style: TextStyle(fontSize: 11, color: _slateGray)),
                      ),
                      Expanded(
                        child: Slider(
                          value: _intervalSeconds.toDouble(),
                          min: 10,
                          max: 60,
                          divisions: 50,
                          activeColor: _amber,
                          inactiveColor: _slateGray.withOpacity(0.3),
                          label: '${_intervalSeconds}s',
                          onChanged: _isAutoDialing ? null : (val) {
                            setState(() {
                              _intervalSeconds = val.round();
                            });
                          },
                        ),
                      ),
                      Text('${_intervalSeconds}s', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.white)),
                    ],
                  ),
                  const SizedBox(height: 4),
                  // Delay Between Calls Slider
                  Row(
                    children: [
                      const SizedBox(
                        width: 80,
                        child: Text('Call Delay:', style: TextStyle(fontSize: 11, color: _slateGray)),
                      ),
                      Expanded(
                        child: Slider(
                          value: _delayBetweenCallsSeconds.toDouble(),
                          min: 1,
                          max: 15,
                          divisions: 14,
                          activeColor: _emerald,
                          inactiveColor: _slateGray.withOpacity(0.3),
                          label: '${_delayBetweenCallsSeconds}s',
                          onChanged: _isAutoDialing ? null : (val) {
                            setState(() {
                              _delayBetweenCallsSeconds = val.round();
                            });
                          },
                        ),
                      ),
                      Text('${_delayBetweenCallsSeconds}s', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.white)),
                    ],
                  ),
                  const SizedBox(height: 10),
                  // Start / Stop Action Buttons
                  Row(
                    children: [
                      Expanded(
                        child: ElevatedButton.icon(
                          onPressed: _isAutoDialing ? _stopAutoDialer : _startAutoDialer,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: _isAutoDialing ? Colors.redAccent : _amber,
                            foregroundColor: _isAutoDialing ? Colors.white : Colors.black,
                            padding: const EdgeInsets.symmetric(vertical: 12),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                          ),
                          icon: Icon(_isAutoDialing ? Icons.stop : Icons.play_arrow),
                          label: Text(
                            _isAutoDialing ? 'PAUSE AUTO DIALER' : 'START AUTO DIALER',
                            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),

            const SizedBox(height: 20),

            // Quick Add Lead Form
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: const Color(0xFF0F172A),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: const Color(0xFF1E293B)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'ADD LEAD TO MOBILE QUEUE',
                        style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF94A3B8), letterSpacing: 1),
                      ),
                      TextButton.icon(
                        onPressed: _importFile,
                        icon: const Icon(Icons.file_upload, size: 14, color: _amber),
                        label: const Text('IMPORT CSV/XLSX', style: TextStyle(fontSize: 10, color: _amber, fontWeight: FontWeight.bold)),
                        style: TextButton.styleFrom(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          minimumSize: Size.zero,
                          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _nameController,
                    decoration: InputDecoration(
                      hintText: 'Lead Name (Optional)',
                      hintStyle: const TextStyle(color: _slateGray, fontSize: 12),
                      filled: true,
                      fillColor: const Color(0xFF020617),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
                    ),
                    style: const TextStyle(fontSize: 13, color: Colors.white),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _phoneController,
                          keyboardType: TextInputType.phone,
                          decoration: InputDecoration(
                            hintText: 'Phone Number (+1...)',
                            hintStyle: const TextStyle(color: _slateGray, fontSize: 12),
                            filled: true,
                            fillColor: const Color(0xFF020617),
                            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
                          ),
                          style: const TextStyle(fontSize: 13, color: Colors.white),
                        ),
                      ),
                      const SizedBox(width: 8),
                      ElevatedButton(
                        onPressed: _addLead,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF1E293B),
                          foregroundColor: _amber,
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                        child: const Text('ADD', style: TextStyle(fontWeight: FontWeight.bold)),
                      ),
                    ],
                  ),
                ],
              ),
            ),

            const SizedBox(height: 20),

            // Queue Header
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'MOBILE LEAD QUEUE (${_queue.length})',
                  style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF94A3B8), letterSpacing: 1),
                ),
                if (_queue.isNotEmpty)
                  TextButton(
                    onPressed: () {
                      setState(() {
                        _queue.clear();
                        _currentIndex = -1;
                        _stopAutoDialer();
                      });
                    },
                    child: const Text('CLEAR ALL', style: TextStyle(color: Colors.redAccent, fontSize: 10, fontWeight: FontWeight.bold)),
                  ),
              ],
            ),

            const SizedBox(height: 8),

            // Lead Queue List
            _queue.isEmpty
                ? Container(
                    padding: const EdgeInsets.all(32),
                    alignment: Alignment.center,
                    child: const Text(
                      'No leads in queue. Add numbers above to start auto-dialing directly from your phone.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: _slateGray, fontSize: 12),
                    ),
                  )
                : ListView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: _queue.length,
                    itemBuilder: (context, index) {
                      final lead = _queue[index];
                      final isCurrent = index == _currentIndex;

                      return Card(
                        margin: const EdgeInsets.only(bottom: 8),
                        color: isCurrent ? const Color(0xFF1E293B) : const Color(0xFF0F172A),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                          side: BorderSide(
                            color: isCurrent ? _amber : const Color(0xFF1E293B),
                          ),
                        ),
                        child: ListTile(
                          dense: true,
                          title: Text(
                            lead.name,
                            style: TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 13,
                              color: isCurrent ? _amber : Colors.white,
                            ),
                          ),
                          subtitle: Text(
                            lead.phone,
                            style: const TextStyle(fontSize: 11, color: _slateGray),
                          ),
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                decoration: BoxDecoration(
                                  color: lead.status == 'CALLING'
                                      ? _amber.withOpacity(0.2)
                                      : lead.status == 'COMPLETED'
                                          ? _emerald.withOpacity(0.2)
                                          : lead.status == 'NO_ANSWER'
                                              ? Colors.redAccent.withOpacity(0.2)
                                              : _slateGray.withOpacity(0.1),
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: Text(
                                  lead.status,
                                  style: TextStyle(
                                    fontSize: 9,
                                    fontWeight: FontWeight.bold,
                                    color: lead.status == 'CALLING'
                                        ? _amber
                                        : lead.status == 'COMPLETED'
                                            ? _emerald
                                            : lead.status == 'NO_ANSWER'
                                                ? Colors.redAccent
                                                : _slateGray,
                                  ),
                                ),
                              ),
                              IconButton(
                                icon: const Icon(Icons.delete_outline, color: Colors.redAccent, size: 18),
                                onPressed: () {
                                  setState(() {
                                    _queue.removeAt(index);
                                    if (_currentIndex >= _queue.length) {
                                      _currentIndex = _queue.length - 1;
                                    }
                                  });
                                },
                              ),
                              IconButton(
                                icon: const Icon(Icons.phone, color: _emerald, size: 18),
                                onPressed: () => _makeCall(lead.phone),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
          ],
        ),
      ),
    );
  }
}
