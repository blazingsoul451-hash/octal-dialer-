import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import '../config/app_config.dart';
import '../services/phone_bridge_service.dart';
import '../widgets/octal_logo.dart';
import 'login_screen.dart';
import 'connected_screen.dart';
import 'standalone_dialer_screen.dart';
import 'call_log_screen.dart';
import 'calling_screen.dart';

class DeviceDashboardScreen extends StatefulWidget {
  const DeviceDashboardScreen({super.key});

  @override
  State<DeviceDashboardScreen> createState() => _DeviceDashboardScreenState();
}

class _DeviceDashboardScreenState extends State<DeviceDashboardScreen> with WidgetsBindingObserver {
  final PhoneBridgeService _bridge = PhoneBridgeService.instance;
  int _selectedTabIndex = 0;

  // Settings state
  int _ringTimeoutSeconds = 35;
  int _nextCallDelaySeconds = 3;
  String _autoDialMode = 'Full Auto';
  bool _callRecording = false;
  bool _vibrateOnAnswer = true;
  bool _playDialTone = true;

  List<LeadItem> _localQueue = [];
  List<Map<String, dynamic>> _campaignsList = [];
  String? _selectedCampaignId;
  String _activeCampaignName = 'Pakistan Tax Consultants COMBINED FINAL';
  int _totalLeads = 5168;
  int _completedLeads = 0;
  int _answeredLeads = 0;
  int _remainingLeads = 5168;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _bridge.addListener(_onBridgeUpdate);
    _bridge.onBridgePaired = _handlePaired;
    _bridge.initializeAuthenticated().then((_) {
      if (_bridge.authToken.isEmpty && mounted) {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (context) => const LoginScreen()),
        );
      } else {
        _fetchRealCampaignAndLeads();
      }
    });

    if (_bridge.socket != null) {
      _bridge.socket!.on('leads:updated', (_) {
        if (mounted) _fetchRealCampaignAndLeads(_selectedCampaignId);
      });
      _bridge.socket!.on('campaigns:updated', (_) {
        if (mounted) _fetchRealCampaignAndLeads(_selectedCampaignId);
      });
    }
  }

  Future<void> _fetchRealCampaignAndLeads([String? targetCampId]) async {
    final serverUrl = AppConfig.apiBaseUrl.isNotEmpty ? AppConfig.apiBaseUrl : 'http://127.0.0.1:3000';
    final token = _bridge.authToken;
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
        if (camps.isEmpty) {
          if (mounted) {
            setState(() {
              _campaignsList = [];
              _selectedCampaignId = null;
              _activeCampaignName = 'No Active Campaign';
              _totalLeads = 0;
              _remainingLeads = 0;
              _completedLeads = 0;
              _answeredLeads = 0;
              _localQueue = [];
            });
          }
          return;
        }

        final typedCamps = camps.map((e) => Map<String, dynamic>.from(e as Map)).toList();

        Map<String, dynamic> activeCamp = typedCamps.first;
        if (targetCampId != null) {
          activeCamp = typedCamps.firstWhere((c) => c['id'] == targetCampId, orElse: () => typedCamps.first);
        } else if (_selectedCampaignId != null) {
          activeCamp = typedCamps.firstWhere((c) => c['id'] == _selectedCampaignId, orElse: () => typedCamps.first);
        } else {
          // Default to the main / largest production campaign (e.g. 5,168 leads)
          final sorted = List<Map<String, dynamic>>.from(typedCamps);
          sorted.sort((a, b) => ((b['leadCount'] ?? 0) as int).compareTo((a['leadCount'] ?? 0) as int));
          activeCamp = sorted.first;
        }

        final campId = activeCamp['id']?.toString() ?? '';
        final campName = activeCamp['name']?.toString() ?? 'Active Campaign';
        final count = (activeCamp['leadCount'] is int) ? (activeCamp['leadCount'] as int) : 0;

        if (mounted) {
          setState(() {
            _campaignsList = typedCamps;
            _selectedCampaignId = campId;
            _activeCampaignName = campName;
            _totalLeads = count;
            _remainingLeads = count;
          });
        }

          final leadsRes = await http.get(
            Uri.parse('$serverUrl/api/campaigns/$campId/leads'),
            headers: {
              'Authorization': 'Bearer $token',
              'bypass-tunnel-reminder': 'true',
            },
          ).timeout(const Duration(seconds: 25));

          if (leadsRes.statusCode == 200) {
            final List leadData = jsonDecode(leadsRes.body);
            final List<LeadItem> loadedLeads = [];
            int completed = 0;
            int answered = 0;

            for (final l in leadData) {
              final leadItem = LeadItem(
                id: l['id']?.toString() ?? '',
                name: l['name']?.toString() ?? 'Contact',
                phone: l['phone']?.toString() ?? '',
                status: l['status']?.toString() ?? 'PENDING',
              );
              loadedLeads.add(leadItem);
              if (leadItem.status == 'COMPLETED' || leadItem.status == 'ANSWERED') {
                completed++;
              }
              if (leadItem.status == 'ANSWERED' || leadItem.status == 'INTERESTED') {
                answered++;
              }
            }

            if (mounted) {
              setState(() {
                _localQueue = loadedLeads;
                _completedLeads = completed;
                _answeredLeads = answered;
                _remainingLeads = loadedLeads.length - completed;
                _totalLeads = loadedLeads.length;
              });
            }
          }
        }
    } catch (e) {
      debugPrint('Campaign fetch: $e');
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _bridge.removeListener(_onBridgeUpdate);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      if (_bridge.socket != null && !_bridge.socket!.connected) {
        _bridge.socket!.connect();
      }
    }
  }

  void _onBridgeUpdate() {
    if (mounted) setState(() {});
  }

  void _handlePaired(Map<String, dynamic> data) {
    if (!mounted) return;
    final String sessionId = data['sessionId']?.toString() ?? '';
    final String token = data['token']?.toString() ?? '';
    final String laptopName = data['laptopName']?.toString() ?? 'Laptop Host';
    final String laptopBtAddress = data['laptopBtAddress']?.toString() ?? '00:1A:7D:DA:71:11';
    final String serverUrl = data['serverUrl']?.toString() ?? _bridge.serverUrl;

    if (sessionId.isNotEmpty) {
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (context) => ConnectedScreen(
            sessionId: sessionId,
            token: token,
            serverUrl: serverUrl,
            laptopName: laptopName,
            laptopBtAddress: laptopBtAddress,
            mode: PairingMode.authenticated,
          ),
        ),
      );
    }
  }

  Future<void> _logout() async {
    await _bridge.logout();
    if (mounted) {
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (context) => const LoginScreen()),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: OctalColors.bgDark,
      drawer: _buildSideDrawer(),
      body: SafeArea(
        child: IndexedStack(
          index: _selectedTabIndex,
          children: [
            _buildHomeDashboardTab(),
            _buildLeadsQueueTab(),
            const CallLogScreen(),
            _buildSettingsTab(),
          ],
        ),
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _selectedTabIndex,
        onTap: (idx) => setState(() => _selectedTabIndex = idx),
        backgroundColor: OctalColors.surfaceCard,
        selectedItemColor: OctalColors.primaryGold,
        unselectedItemColor: OctalColors.textSecondary,
        selectedLabelStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 11),
        unselectedLabelStyle: const TextStyle(fontSize: 10),
        type: BottomNavigationBarType.fixed,
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.dialpad), label: 'Dialer'),
          BottomNavigationBarItem(icon: Icon(Icons.people_alt_outlined), label: 'Leads'),
          BottomNavigationBarItem(icon: Icon(Icons.history), label: 'History'),
          BottomNavigationBarItem(icon: Icon(Icons.settings_outlined), label: 'Settings'),
        ],
      ),
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TAB 0: HOME DASHBOARD (Matching Reference Screen 2)
  // ══════════════════════════════════════════════════════════════════════════
  Widget _buildHomeDashboardTab() {
    final isOnline = _bridge.isConnected;
    final user = _bridge.username.isNotEmpty ? _bridge.username : 'Agent';

    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 18.0, vertical: 12.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // App Header Bar from Reference Screen 2
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Builder(
                builder: (ctx) => IconButton(
                  icon: const Icon(Icons.menu, color: Colors.white, size: 24),
                  onPressed: () => Scaffold.of(ctx).openDrawer(),
                ),
              ),
              const Row(
                children: [
                  OctalLogo(size: 24),
                  SizedBox(width: 8),
                  Text(
                    'OCTAL DIALER',
                    style: TextStyle(
                      fontFamily: 'Ubuntu',
                      fontSize: 15,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 2.0,
                      color: Colors.white,
                    ),
                  ),
                ],
              ),
              IconButton(
                icon: const Icon(Icons.notifications_none, color: Colors.white, size: 24),
                onPressed: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('All system notifications are up to date.')),
                  );
                },
              ),
            ],
          ),

          const SizedBox(height: 14),

          // 1. Welcome Card from Reference Screen 2
          Container(
            padding: const EdgeInsets.all(16.0),
            decoration: BoxDecoration(
              color: OctalColors.surfaceCard,
              borderRadius: BorderRadius.circular(20.0),
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
                        'Welcome, $user',
                        style: const TextStyle(
                          fontFamily: 'Ubuntu',
                          fontSize: 15,
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                        ),
                      ),
                      const SizedBox(height: 4),
                      const Text(
                        'Ready to Make Calls',
                        style: TextStyle(fontSize: 12, color: OctalColors.textSecondary),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Icon(Icons.phone_android, size: 14, color: isOnline ? OctalColors.success : OctalColors.textMuted),
                          const SizedBox(width: 6),
                          Text(
                            isOnline ? 'Phone Connected' : 'Connecting...',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: isOnline ? OctalColors.success : OctalColors.textMuted,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                InkWell(
                  onTap: () async {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Connecting phone to server...')),
                    );
                    await AppConfig.setBaseUrl('http://127.0.0.1:3000');
                    await _bridge.initializeAuthenticated();
                    _bridge.reconnect();
                    _fetchRealCampaignAndLeads();
                  },
                  borderRadius: BorderRadius.circular(12),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: isOnline ? OctalColors.success.withOpacity(0.15) : OctalColors.primaryGold.withOpacity(0.2),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: isOnline ? OctalColors.success.withOpacity(0.5) : OctalColors.primaryGold,
                        width: 1.5,
                      ),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          isOnline ? Icons.check_circle : Icons.sync,
                          size: 14,
                          color: isOnline ? OctalColors.success : OctalColors.primaryGold,
                        ),
                        const SizedBox(width: 5),
                        Text(
                          isOnline ? 'Connected' : 'Connect Phone',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w900,
                            color: isOnline ? OctalColors.success : OctalColors.primaryGold,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),

          if (!isOnline) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: OctalColors.primaryGold.withOpacity(0.12),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: OctalColors.primaryGold.withOpacity(0.4)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.info_outline, color: OctalColors.primaryGold, size: 18),
                  const SizedBox(width: 10),
                  const Expanded(
                    child: Text(
                      'Phone is not connected to backend. Tap to connect.',
                      style: TextStyle(fontSize: 11, color: Colors.white70),
                    ),
                  ),
                  ElevatedButton(
                    onPressed: () async {
                      await AppConfig.setBaseUrl('http://127.0.0.1:3000');
                      await _bridge.initializeAuthenticated();
                      _bridge.reconnect();
                      _fetchRealCampaignAndLeads();
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: OctalColors.primaryGold,
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      minimumSize: Size.zero,
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                    child: const Text(
                      'Connect',
                      style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: OctalColors.bgDark),
                    ),
                  ),
                ],
              ),
            ),
          ],

          const SizedBox(height: 14),

          // 2. Current Campaign Card from Reference Screen 2
          Container(
            padding: const EdgeInsets.all(16.0),
            decoration: BoxDecoration(
              color: OctalColors.surfaceCard,
              borderRadius: BorderRadius.circular(20.0),
              border: Border.all(color: OctalColors.border),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Current Campaign',
                            style: TextStyle(fontSize: 11, color: OctalColors.textSecondary),
                          ),
                          const SizedBox(height: 4),
                          if (_campaignsList.length > 1)
                            DropdownButtonHideUnderline(
                              child: DropdownButton<String>(
                                value: _selectedCampaignId,
                                isDense: true,
                                isExpanded: true,
                                dropdownColor: OctalColors.surfaceCard,
                                icon: const Icon(Icons.keyboard_arrow_down, color: OctalColors.primaryGold, size: 20),
                                style: const TextStyle(
                                  fontFamily: 'Ubuntu',
                                  fontSize: 14,
                                  fontWeight: FontWeight.bold,
                                  color: Colors.white,
                                ),
                                items: _campaignsList.map((c) {
                                  final name = c['name']?.toString() ?? 'Campaign';
                                  final count = c['leadCount'] ?? 0;
                                  return DropdownMenuItem<String>(
                                    value: c['id']?.toString(),
                                    child: Text(
                                      '$name ($count leads)',
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(fontSize: 13, color: Colors.white),
                                    ),
                                  );
                                }).toList(),
                                onChanged: (newCampId) {
                                  if (newCampId != null) {
                                    _fetchRealCampaignAndLeads(newCampId);
                                  }
                                },
                              ),
                            )
                          else
                            Text(
                              _activeCampaignName,
                              style: const TextStyle(
                                fontFamily: 'Ubuntu',
                                fontSize: 15,
                                fontWeight: FontWeight.bold,
                                color: Colors.white,
                              ),
                            ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    TextButton(
                      onPressed: () => setState(() => _selectedTabIndex = 1),
                      style: TextButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      ),
                      child: const Text('View All', style: TextStyle(color: OctalColors.primaryGold, fontSize: 12, fontWeight: FontWeight.bold)),
                    ),
                  ],
                ),
                const SizedBox(height: 14),

                // 4 Metric Pills Row from Real Data
                Row(
                  children: [
                    _buildMetricPill('Total Leads', '$_totalLeads', Colors.white),
                    const SizedBox(width: 8),
                    _buildMetricPill('Completed', '$_completedLeads', OctalColors.success),
                    const SizedBox(width: 8),
                    _buildMetricPill('Answered', '$_answeredLeads', OctalColors.primaryGold),
                    const SizedBox(width: 8),
                    _buildMetricPill('Remaining', '$_remainingLeads', OctalColors.textSecondary),
                  ],
                ),
              ],
            ),
          ),

          const SizedBox(height: 14),

          // 3. Active Call / Lead Dial Card with REAL Lead
          Container(
            padding: const EdgeInsets.all(18.0),
            decoration: BoxDecoration(
              color: OctalColors.surfaceCard,
              borderRadius: BorderRadius.circular(20.0),
              border: Border.all(color: OctalColors.primaryGold.withOpacity(0.3), width: 1.5),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'ACTIVE CALL / NEXT UP',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 1.2,
                        color: OctalColors.primaryGold,
                      ),
                    ),
                    Icon(Icons.graphic_eq, color: OctalColors.primaryGold, size: 18),
                  ],
                ),
                const SizedBox(height: 12),

                Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: OctalColors.primaryGold.withOpacity(0.15),
                        border: Border.all(color: OctalColors.primaryGold),
                      ),
                      child: Center(
                        child: Text(
                          _localQueue.isNotEmpty && _localQueue.first.name.isNotEmpty 
                              ? _localQueue.first.name[0].toUpperCase() 
                              : '•',
                          style: const TextStyle(
                            fontFamily: 'Ubuntu',
                            fontSize: 18,
                            fontWeight: FontWeight.w900,
                            color: OctalColors.primaryGold,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            _localQueue.isNotEmpty ? _localQueue.first.name : 'No Leads in Queue',
                            style: const TextStyle(
                              fontFamily: 'Ubuntu',
                              fontSize: 15,
                              fontWeight: FontWeight.bold,
                              color: Colors.white,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            _localQueue.isNotEmpty ? '${_localQueue.first.phone} • READY' : 'Campaign ready on server',
                            style: const TextStyle(fontSize: 12, color: OctalColors.textSecondary, fontFamily: 'monospace'),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),

                const SizedBox(height: 16),

                // Quick In-Call Action Row (Mute, Keypad, Speaker)
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    _buildMiniAction(Icons.mic_none, 'Mute'),
                    _buildMiniAction(Icons.dialpad, 'Keypad'),
                    _buildMiniAction(Icons.volume_up_outlined, 'Speaker'),
                  ],
                ),

                const SizedBox(height: 16),

                // Start Dialing Full Width Gold Button
                SizedBox(
                  height: 48,
                  child: ElevatedButton.icon(
                    onPressed: () {
                      if (_localQueue.isNotEmpty && _bridge.socket != null) {
                        final lead = _localQueue.first;
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (context) => CallingScreen(
                              phone: lead.phone,
                              name: lead.name,
                              leadId: lead.id,
                              timeout: _ringTimeoutSeconds,
                              socket: _bridge.socket!,
                              sessionId: (_bridge.currentSessionId != null && _bridge.currentSessionId!.isNotEmpty) ? _bridge.currentSessionId! : 'sess_standalone',
                            ),
                          ),
                        );
                      } else {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('No leads currently in queue. Please select a campaign.')),
                        );
                      }
                    },
                    icon: const Icon(Icons.phone, color: OctalColors.bgDark, size: 20),
                    label: const Text(
                      'Dial Lead Now',
                      style: TextStyle(
                        fontFamily: 'Ubuntu',
                        fontSize: 14,
                        fontWeight: FontWeight.w900,
                        color: OctalColors.bgDark,
                      ),
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: OctalColors.primaryGold,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    ),
                  ),
                ),

                const SizedBox(height: 10),

                // Pause Auto Dial / Lead Queue Button
                Center(
                  child: TextButton.icon(
                    onPressed: () => setState(() => _selectedTabIndex = 1),
                    icon: const Icon(Icons.playlist_play, color: OctalColors.textSecondary, size: 18),
                    label: const Text(
                      'Open Full Lead Queue',
                      style: TextStyle(color: OctalColors.textSecondary, fontSize: 12, fontWeight: FontWeight.bold),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMetricPill(String title, String value, Color color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 6),
        decoration: BoxDecoration(
          color: OctalColors.surfaceElevated,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: OctalColors.border),
        ),
        child: Column(
          children: [
            Text(
              value,
              style: TextStyle(
                fontFamily: 'Ubuntu',
                fontSize: 16,
                fontWeight: FontWeight.w900,
                color: color,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 9, color: OctalColors.textSecondary),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMiniAction(IconData icon, String label) {
    return Column(
      children: [
        Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: OctalColors.surfaceElevated,
            border: Border.all(color: OctalColors.border),
          ),
          child: Icon(icon, color: Colors.white, size: 18),
        ),
        const SizedBox(height: 4),
        Text(label, style: const TextStyle(fontSize: 10, color: OctalColors.textSecondary)),
      ],
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TAB 1: LEADS QUEUE TAB (Matching Reference Screen 4)
  // ══════════════════════════════════════════════════════════════════════════
  Widget _buildLeadsQueueTab() {
    return StandaloneDialerScreen(
      socket: _bridge.socket,
      serverUrl: _bridge.serverUrl,
      queue: _localQueue,
      sessionId: _bridge.currentSessionId,
      campaignId: _selectedCampaignId,
      campaignName: _activeCampaignName,
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TAB 3: SETTINGS TAB (Matching Reference Screens 8 & 9)
  // ══════════════════════════════════════════════════════════════════════════
  Widget _buildSettingsTab() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'Settings',
            style: TextStyle(
              fontFamily: 'Ubuntu',
              fontSize: 20,
              fontWeight: FontWeight.w900,
              color: Colors.white,
            ),
          ),

          const SizedBox(height: 18),

          // 1. Phone Connection Status Card from Reference Screen 9
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: OctalColors.surfaceCard,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: OctalColors.border),
            ),
            child: Column(
              children: [
                const OctalLogo(size: 48),
                const SizedBox(height: 12),
                const Text(
                  'Phone Connected',
                  style: TextStyle(fontFamily: 'Ubuntu', fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white),
                ),
                const SizedBox(height: 4),
                Text(
                  'Device ID: ${_bridge.deviceUid.isNotEmpty ? _bridge.deviceUid : "ANDR-7F3A89"}',
                  style: const TextStyle(fontSize: 11, fontFamily: 'monospace', color: OctalColors.textSecondary),
                ),
                const SizedBox(height: 16),
                const Divider(color: OctalColors.border),
                const SizedBox(height: 12),

                _buildStatusRow(Icons.wifi, 'Socket Connection', _bridge.isConnected ? 'Connected' : 'Connecting', OctalColors.success),
                const SizedBox(height: 10),
                _buildStatusRow(Icons.sim_card_outlined, 'GSM Service', 'Ready', OctalColors.success),
                const SizedBox(height: 10),
                _buildStatusRow(Icons.battery_charging_full, 'Battery Level', '78%', OctalColors.primaryGold),
                const SizedBox(height: 10),
                _buildStatusRow(Icons.signal_cellular_alt, 'Signal Strength', 'Good', OctalColors.success),
              ],
            ),
          ),

          const SizedBox(height: 20),

          // 2. Dialer Settings Section from Reference Screen 8
          const Text(
            'Dialer Settings',
            style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: OctalColors.primaryGold, letterSpacing: 0.5),
          ),
          const SizedBox(height: 10),

          Container(
            decoration: BoxDecoration(
              color: OctalColors.surfaceCard,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: OctalColors.border),
            ),
            child: Column(
              children: [
                ListTile(
                  title: const Text('Ring Timeout', style: TextStyle(fontSize: 13, color: Colors.white)),
                  trailing: Text('$_ringTimeoutSeconds Seconds >', style: const TextStyle(color: OctalColors.primaryGold, fontSize: 12, fontWeight: FontWeight.bold)),
                  onTap: () {
                    _showTimeoutPicker();
                  },
                ),
                const Divider(height: 1, color: OctalColors.border),
                ListTile(
                  title: const Text('Next Call Delay', style: TextStyle(fontSize: 13, color: Colors.white)),
                  trailing: Text('$_nextCallDelaySeconds Seconds >', style: const TextStyle(color: OctalColors.primaryGold, fontSize: 12, fontWeight: FontWeight.bold)),
                  onTap: () {
                    _showDelayPicker();
                  },
                ),
                const Divider(height: 1, color: OctalColors.border),
                ListTile(
                  title: const Text('Auto Dial Mode', style: TextStyle(fontSize: 13, color: Colors.white)),
                  trailing: Text('$_autoDialMode >', style: const TextStyle(color: OctalColors.primaryGold, fontSize: 12, fontWeight: FontWeight.bold)),
                ),
                const Divider(height: 1, color: OctalColors.border),
                SwitchListTile(
                  title: const Text('Call Recording', style: TextStyle(fontSize: 13, color: Colors.white)),
                  value: _callRecording,
                  activeColor: OctalColors.primaryGold,
                  onChanged: (val) => setState(() => _callRecording = val),
                ),
                const Divider(height: 1, color: OctalColors.border),
                SwitchListTile(
                  title: const Text('Vibrate on Answer', style: TextStyle(fontSize: 13, color: Colors.white)),
                  value: _vibrateOnAnswer,
                  activeColor: OctalColors.primaryGold,
                  onChanged: (val) => setState(() => _vibrateOnAnswer = val),
                ),
              ],
            ),
          ),

          const SizedBox(height: 20),

          // 3. General Section from Reference Screen 8
          const Text(
            'General',
            style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: OctalColors.primaryGold, letterSpacing: 0.5),
          ),
          const SizedBox(height: 10),

          Container(
            decoration: BoxDecoration(
              color: OctalColors.surfaceCard,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: OctalColors.border),
            ),
            child: Column(
              children: [
                const ListTile(
                  title: Text('Theme', style: TextStyle(fontSize: 13, color: Colors.white)),
                  trailing: Text('Octal Gold >', style: TextStyle(color: OctalColors.primaryGold, fontSize: 12, fontWeight: FontWeight.bold)),
                ),
                const Divider(height: 1, color: OctalColors.border),
                const ListTile(
                  title: Text('Language', style: TextStyle(fontSize: 13, color: Colors.white)),
                  trailing: Text('English >', style: TextStyle(color: OctalColors.primaryGold, fontSize: 12, fontWeight: FontWeight.bold)),
                ),
                const Divider(height: 1, color: OctalColors.border),
                const ListTile(
                  title: Text('About Octal Dialer', style: TextStyle(fontSize: 13, color: Colors.white)),
                  trailing: Text('Version 1.2.0 >', style: TextStyle(color: OctalColors.textSecondary, fontSize: 12)),
                ),
              ],
            ),
          ),

          const SizedBox(height: 24),

          // Log Out Button
          SizedBox(
            height: 48,
            child: OutlinedButton.icon(
              onPressed: _logout,
              icon: const Icon(Icons.logout, color: OctalColors.error, size: 18),
              label: const Text('Log Out Account', style: TextStyle(color: OctalColors.error, fontWeight: FontWeight.bold)),
              style: OutlinedButton.styleFrom(
                side: BorderSide(color: OctalColors.error.withOpacity(0.4)),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              ),
            ),
          ),

          const SizedBox(height: 24),
        ],
      ),
    );
  }

  Widget _buildStatusRow(IconData icon, String label, String value, Color color) {
    return Row(
      children: [
        Icon(icon, size: 16, color: OctalColors.textSecondary),
        const SizedBox(width: 10),
        Text(label, style: const TextStyle(fontSize: 12, color: OctalColors.textSecondary)),
        const Spacer(),
        Text(value, style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: color)),
      ],
    );
  }

  void _showDelayPicker() {
    showModalBottomSheet(
      context: context,
      backgroundColor: OctalColors.surfaceCard,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) {
        final delays = [0, 1, 2, 3, 5, 10, 15, 30, 60];
        return Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Select Next Call Delay',
                style: TextStyle(fontFamily: 'Ubuntu', fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white),
              ),
              const SizedBox(height: 12),
              ...delays.map((d) => ListTile(
                    title: Text(d == 0 ? '0s (Instant)' : '$d Seconds', style: const TextStyle(color: Colors.white, fontSize: 14)),
                    trailing: _nextCallDelaySeconds == d ? const Icon(Icons.check, color: OctalColors.primaryGold) : null,
                    onTap: () {
                      setState(() => _nextCallDelaySeconds = d);
                      Navigator.pop(ctx);
                    },
                  )),
            ],
          ),
        );
      },
    );
  }

  void _showTimeoutPicker() {
    showModalBottomSheet(
      context: context,
      backgroundColor: OctalColors.surfaceCard,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) {
        final timeouts = [15, 20, 25, 30, 35, 45, 60];
        return Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Select Ring Timeout',
                style: TextStyle(fontFamily: 'Ubuntu', fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white),
              ),
              const SizedBox(height: 12),
              ...timeouts.map((t) => ListTile(
                    title: Text('$t Seconds', style: const TextStyle(color: Colors.white, fontSize: 14)),
                    trailing: _ringTimeoutSeconds == t ? const Icon(Icons.check, color: OctalColors.primaryGold) : null,
                    onTap: () {
                      setState(() => _ringTimeoutSeconds = t);
                      Navigator.pop(ctx);
                    },
                  )),
            ],
          ),
        );
      },
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SIDE DRAWER MENU (Matching Reference Screen 10)
  // ══════════════════════════════════════════════════════════════════════════
  Widget _buildSideDrawer() {
    final username = _bridge.username.isNotEmpty ? _bridge.username : 'agent';
    final email = _bridge.email.isNotEmpty ? _bridge.email : 'agent@octal.com';
    final role = _bridge.role.isNotEmpty ? _bridge.role : 'Administrator';

    return Drawer(
      backgroundColor: OctalColors.bgDark,
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // User Header from Reference Screen 10
            Container(
              padding: const EdgeInsets.all(20),
              decoration: const BoxDecoration(
                color: OctalColors.surfaceCard,
                border: Border(bottom: BorderSide(color: OctalColors.border)),
              ),
              child: Row(
                children: [
                  Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: OctalColors.primaryGold.withOpacity(0.15),
                      border: Border.all(color: OctalColors.primaryGold),
                    ),
                    child: const Center(
                      child: Icon(Icons.person, color: OctalColors.primaryGold, size: 26),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          username,
                          style: const TextStyle(
                            fontFamily: 'Ubuntu',
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                            color: Colors.white,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          email,
                          style: const TextStyle(fontSize: 11, color: OctalColors.textSecondary),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          role.toUpperCase(),
                          style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: OctalColors.primaryGold),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 12),

            // Menu Items from Reference Screen 10
            _buildDrawerItem(Icons.dashboard_outlined, 'Dashboard', _selectedTabIndex == 0, () {
              Navigator.pop(context);
              setState(() => _selectedTabIndex = 0);
            }),
            _buildDrawerItem(Icons.campaign_outlined, 'Campaigns', false, () {
              Navigator.pop(context);
              setState(() => _selectedTabIndex = 0);
            }),
            _buildDrawerItem(Icons.people_alt_outlined, 'Leads', _selectedTabIndex == 1, () {
              Navigator.pop(context);
              setState(() => _selectedTabIndex = 1);
            }),
            _buildDrawerItem(Icons.history, 'Call History', _selectedTabIndex == 2, () {
              Navigator.pop(context);
              setState(() => _selectedTabIndex = 2);
            }),
            _buildDrawerItem(Icons.playlist_add_check, 'Dispositions', false, () {
              Navigator.pop(context);
              setState(() => _selectedTabIndex = 1);
            }),
            _buildDrawerItem(Icons.settings_outlined, 'Settings', _selectedTabIndex == 3, () {
              Navigator.pop(context);
              setState(() => _selectedTabIndex = 3);
            }),

            const Spacer(),
            const Divider(color: OctalColors.border),

            _buildDrawerItem(Icons.logout, 'Log Out', false, _logout, color: OctalColors.error),
            const SizedBox(height: 12),
          ],
        ),
      ),
    );
  }

  Widget _buildDrawerItem(IconData icon, String title, bool isSelected, VoidCallback onTap, {Color? color}) {
    return ListTile(
      leading: Icon(icon, color: color ?? (isSelected ? OctalColors.primaryGold : OctalColors.textSecondary), size: 20),
      title: Text(
        title,
        style: TextStyle(
          fontFamily: 'Ubuntu',
          fontSize: 14,
          fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
          color: color ?? (isSelected ? OctalColors.primaryGold : Colors.white),
        ),
      ),
      selected: isSelected,
      selectedTileColor: OctalColors.primaryGold.withOpacity(0.1),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 2),
      onTap: onTap,
    );
  }
}
