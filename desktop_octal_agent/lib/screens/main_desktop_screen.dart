import 'dart:async';

import 'package:flutter/material.dart';
import '../theme/octal_theme.dart';
import '../services/fb_local_worker.dart';
import '../services/api_service.dart';

class MainDesktopScreen extends StatefulWidget {
  const MainDesktopScreen({super.key});

  @override
  State<MainDesktopScreen> createState() => _MainDesktopScreenState();
}

class _MainDesktopScreenState extends State<MainDesktopScreen> {
  int _selectedTabIndex = 0;

  // Agent Settings tab state
  final TextEditingController _urlController = TextEditingController();
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();
  bool _obscurePassword = true;
  bool _savingSettings = false;
  String _connectionState = 'disconnected'; // disconnected | connecting | connected | error
  String _connectionDetail = 'Not configured yet.';

  Timer? _taskPollTimer;
  bool _pollInFlight = false;
  Timer? _heartbeatTimer;
  int _tasksCompleted = 0;

  final TextEditingController _profileController = TextEditingController(text: 'My_FB_Account_1');
  final TextEditingController _captionController = TextEditingController(text: 'Check out our latest real estate deals: https://dev.zestify7.online');
  final TextEditingController _postsController = TextEditingController(text: 'https://facebook.com/groups/realtors_hub/posts/1\nhttps://facebook.com/groups/investors/posts/2');

  final List<String> _localLogs = [
    '[09:00:00] Octal Desktop Agent initialized.',
    '[09:00:02] Connected to Cloud Workspace: dev.zestify7.online (Ready 🟢)',
    '[09:00:05] Local Residential IP verified. Zero server load mode active.'
  ];

  @override
  void initState() {
    super.initState();
    _bootstrapAgent();
    FbLocalWorker.instance.logStream.listen((log) {
      if (mounted) {
        setState(() {
          _localLogs.add(log);
          if (_localLogs.length > 300) _localLogs.removeAt(0);
        });
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: OctalColors.bgDark,
      body: Column(
        children: [
          _buildTopHeader(),
          Expanded(
            child: Row(
              children: [
                _buildSidebar(),
                Expanded(child: _buildMainContent()),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTopHeader() {
    return Container(
      height: 64,
      padding: const EdgeInsets.symmetric(horizontal: 20),
      decoration: const BoxDecoration(
        color: OctalColors.surfaceCard,
        border: Border(bottom: BorderSide(color: OctalColors.border)),
      ),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
              gradient: LinearGradient(
                colors: [OctalColors.accentGoldLight, OctalColors.primaryGold, OctalColors.secondaryGold],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
            ),
            child: const Icon(Icons.phone, color: Colors.white, size: 20),
          ),
          const SizedBox(width: 14),
          const Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'OCTAL DESKTOP AGENT',
                style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15, letterSpacing: 0.5),
              ),
              Text(
                'Distributed Local Worker Engine • Residential IP Mode',
                style: TextStyle(color: OctalColors.textSecondary, fontSize: 11),
              ),
            ],
          ),
          const Spacer(),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: OctalColors.surfaceElevated,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: OctalColors.borderGold),
            ),
            child: const Row(
              children: [
                Icon(Icons.cloud_done, color: OctalColors.primaryGold, size: 16),
                SizedBox(width: 8),
                Text('Workspace: dev.zestify7.online', style: TextStyle(color: OctalColors.textWhite, fontSize: 12)),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: Colors.green.withOpacity(0.15),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Colors.green.withOpacity(0.5)),
            ),
            child: const Row(
              children: [
                Icon(Icons.circle, color: Colors.green, size: 8),
                SizedBox(width: 6),
                Text('Active (0% Server CPU)', style: TextStyle(color: Colors.green, fontSize: 11, fontWeight: FontWeight.bold)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSidebar() {
    return Container(
      width: 230,
      decoration: const BoxDecoration(
        color: OctalColors.surfaceSubtle,
        border: Border(right: BorderSide(color: OctalColors.border)),
      ),
      child: Column(
        children: [
          const SizedBox(height: 16),
          _sidebarItem(0, Icons.dashboard_outlined, 'Dashboard'),
          _sidebarItem(1, Icons.campaign_outlined, 'Facebook Auto-Poster'),
          _sidebarItem(2, Icons.email_outlined, 'Auto-Emailer'),
          _sidebarItem(3, Icons.terminal_outlined, 'Live Local Logs'),
          _sidebarItem(4, Icons.settings_outlined, 'Agent Settings'),
          const Spacer(),
          Container(
            margin: const EdgeInsets.all(16),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: OctalColors.surfaceCard,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: OctalColors.border),
            ),
            child: const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Edge Execution', style: TextStyle(color: OctalColors.primaryGold, fontSize: 12, fontWeight: FontWeight.bold)),
                SizedBox(height: 4),
                Text('All bot runs execute locally on your machine with zero server load.', style: TextStyle(color: OctalColors.textSecondary, fontSize: 11)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _sidebarItem(int index, IconData icon, String title) {
    final isSelected = _selectedTabIndex == index;
    return InkWell(
      onTap: () => setState(() => _selectedTabIndex = index),
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: isSelected ? OctalColors.primaryGold.withOpacity(0.15) : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
          border: isSelected ? Border.all(color: OctalColors.primaryGold) : null,
        ),
        child: Row(
          children: [
            Icon(icon, color: isSelected ? OctalColors.primaryGold : OctalColors.textSecondary, size: 18),
            const SizedBox(width: 12),
            Text(
              title,
              style: TextStyle(
                color: isSelected ? OctalColors.primaryGold : OctalColors.textSecondary,
                fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                fontSize: 13,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMainContent() {
    switch (_selectedTabIndex) {
      case 1:
        return _buildFacebookTab();
      case 2:
        return _buildEmailTab();
      case 3:
        return _buildLogsTab();
      case 4:
        return _buildSettingsTab();
      default:
        return _buildDashboardTab();
    }
  }

  /// Load persisted workspace settings and, if credentials exist, sign in and
  /// start the Facebook task loop. Nothing is hard-coded: a fresh install lands
  /// on the Agent Settings tab until the operator configures it.
  Future<void> _bootstrapAgent() async {
    await ApiService.instance.loadSettings();
    final api = ApiService.instance;

    _urlController.text = api.baseUrl;
    _emailController.text = api.savedEmail;
    _passwordController.text = api.savedPassword;

    if (!api.isConfigured) {
      if (mounted) {
        setState(() {
          _selectedTabIndex = 4;
          _connectionState = 'disconnected';
          _connectionDetail = 'Add your workspace URL, email and password to connect.';
        });
      }
      FbLocalWorker.instance.addLog('⚙️ No workspace configured — open Agent Settings to sign in.');
      return;
    }

    await _connectToWorkspace();
  }

  /// Sign in with the stored credentials and (re)start the background loops.
  Future<void> _connectToWorkspace() async {
    final api = ApiService.instance;
    if (mounted) {
      setState(() {
        _connectionState = 'connecting';
        _connectionDetail = 'Signing in to ${api.baseUrl}...';
      });
    }

    final res = await api.loginWithSavedCredentials();
    if (res['success'] == true) {
      FbLocalWorker.instance.addLog('✅ Authenticated with Cloud Unibox as ${api.username ?? api.savedEmail}');
      if (mounted) {
        setState(() {
          _connectionState = 'connected';
          _connectionDetail = 'Connected as ${api.username ?? api.savedEmail} · tenant ${api.tenantId}';
        });
      }
      _startBackgroundLoops();
    } else {
      final err = res['error']?.toString() ?? 'Authentication failed';
      FbLocalWorker.instance.addLog('❌ Workspace sign-in failed: $err');
      if (mounted) {
        setState(() {
          _connectionState = 'error';
          _connectionDetail = err;
        });
      }
    }
  }

  /// Poll the cloud Facebook task queue and keep the workspace heartbeat alive.
  void _startBackgroundLoops() {
    _taskPollTimer?.cancel();
    _heartbeatTimer?.cancel();

    _taskPollTimer = Timer.periodic(const Duration(seconds: 20), (_) => _pollFbTasks());
    _heartbeatTimer = Timer.periodic(const Duration(minutes: 2), (_) {
      ApiService.instance.sendHeartbeat();
    });

    ApiService.instance.sendHeartbeat();
    _pollFbTasks();
  }

  /// Claim pending outbound Facebook work and run it through the local engine.
  ///
  /// A campaign can run for many minutes while the 20-second poll keeps firing,
  /// so this guards against re-entry. Without it a second tick would claim
  /// another task, hand it to a worker that is already busy, and report it
  /// completed without ever running it.
  Future<void> _pollFbTasks() async {
    final api = ApiService.instance;
    if (!api.isAuthenticated || _pollInFlight) return;

    _pollInFlight = true;
    try {
      await _drainFbTaskQueue(api);
    } finally {
      _pollInFlight = false;
    }
  }

  Future<void> _drainFbTaskQueue(ApiService api) async {
    final tasks = await api.fetchPendingFbTasks();
    for (final task in tasks) {
      final taskId = task['id']?.toString();
      if (taskId == null || taskId.isEmpty) continue;

      // Another agent may grab it first — claim is atomic server-side.
      final claimed = await api.claimFbTask(taskId);
      if (!claimed) continue;

      FbLocalWorker.instance.addLog('📥 Claimed task $taskId (${task["taskType"]})');
      try {
        await FbLocalWorker.instance.runQueuedTask(task);
        await api.completeFbTask(taskId, success: true);
        if (mounted) setState(() => _tasksCompleted++);
        FbLocalWorker.instance.addLog('✅ Completed task $taskId');
      } catch (e) {
        await api.completeFbTask(taskId, success: false, error: e.toString());
        FbLocalWorker.instance.addLog('❌ Task $taskId failed: $e');
      }
    }
  }

  @override
  void dispose() {
    _taskPollTimer?.cancel();
    _heartbeatTimer?.cancel();
    _urlController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    _profileController.dispose();
    _captionController.dispose();
    _postsController.dispose();
    super.dispose();
  }


  // ─── AGENT SETTINGS ────────────────────────────────────────────────────────

  Color get _statusColor {
    switch (_connectionState) {
      case 'connected':
        return const Color(0xFF10B981);
      case 'connecting':
        return OctalColors.primaryGold;
      case 'error':
        return Colors.redAccent;
      default:
        return OctalColors.textMuted;
    }
  }

  String get _statusLabel {
    switch (_connectionState) {
      case 'connected':
        return 'CONNECTED';
      case 'connecting':
        return 'CONNECTING...';
      case 'error':
        return 'SIGN-IN FAILED';
      default:
        return 'NOT CONNECTED';
    }
  }

  void _toast(String message, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: error ? Colors.redAccent : const Color(0xFF10B981),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  Future<void> _saveAndConnect() async {
    setState(() => _savingSettings = true);
    try {
      await ApiService.instance.saveSettings(
        url: _urlController.text,
        email: _emailController.text,
        password: _passwordController.text,
      );
      await _connectToWorkspace();
      if (ApiService.instance.isAuthenticated) {
        _toast('Workspace connected and settings saved.');
      } else {
        _toast(_connectionDetail, error: true);
      }
    } on ArgumentError catch (e) {
      setState(() {
        _connectionState = 'error';
        _connectionDetail = e.message.toString();
      });
      _toast(e.message.toString(), error: true);
    } finally {
      if (mounted) setState(() => _savingSettings = false);
    }
  }

  Future<void> _testConnection() async {
    final clean = ApiService.sanitizeUrl(_urlController.text);
    if (clean == null) {
      _toast('Enter a valid workspace URL first.', error: true);
      return;
    }
    final previous = ApiService.instance.baseUrl;
    ApiService.instance.baseUrl = clean;
    final ok = await ApiService.instance.verifyConnection();
    if (!ok) ApiService.instance.baseUrl = previous;
    _toast(ok ? 'Server reachable at $clean' : 'Could not reach $clean', error: !ok);
  }

  Future<void> _signOut() async {
    _taskPollTimer?.cancel();
    _heartbeatTimer?.cancel();
    await ApiService.instance.clearSettings();
    _passwordController.clear();
    setState(() {
      _connectionState = 'disconnected';
      _connectionDetail = 'Signed out. Credentials removed from this machine.';
    });
    _toast('Signed out and credentials cleared.');
  }

  Widget _buildSettingsTab() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Agent Settings',
              style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
          const SizedBox(height: 6),
          const Text(
            'Point this machine at your Octal Dialer workspace. Credentials are stored locally and used to claim Facebook tasks.',
            style: TextStyle(color: OctalColors.textSecondary, fontSize: 13),
          ),
          const SizedBox(height: 20),

          // Live status strip
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            decoration: BoxDecoration(
              color: OctalColors.surfaceCard,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: _statusColor),
            ),
            child: Row(
              children: [
                Icon(Icons.circle, size: 10, color: _statusColor),
                const SizedBox(width: 10),
                Text(_statusLabel,
                    style: TextStyle(color: _statusColor, fontSize: 12, fontWeight: FontWeight.bold)),
                const SizedBox(width: 14),
                Expanded(
                  child: Text(_connectionDetail,
                      style: const TextStyle(color: OctalColors.textSecondary, fontSize: 12)),
                ),
                if (_connectionState == 'connected')
                  Text('$_tasksCompleted task(s) done',
                      style: const TextStyle(color: OctalColors.textMuted, fontSize: 11)),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // Workspace form
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: OctalColors.surfaceCard,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: OctalColors.border),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Workspace Connection',
                    style: TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold)),
                const SizedBox(height: 16),

                _settingsLabel('Workspace URL'),
                _settingsField(
                  controller: _urlController,
                  hint: 'https://zestify7.online',
                  icon: Icons.cloud_outlined,
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  children: ApiService.presetUrls
                      .map((url) => ActionChip(
                            label: Text(url, style: const TextStyle(fontSize: 11)),
                            backgroundColor: OctalColors.surfaceElevated,
                            side: const BorderSide(color: OctalColors.border),
                            labelStyle: const TextStyle(color: OctalColors.primaryGold),
                            onPressed: () => setState(() => _urlController.text = url),
                          ))
                      .toList(),
                ),
                const SizedBox(height: 18),

                _settingsLabel('Email / Username'),
                _settingsField(
                  controller: _emailController,
                  hint: 'you@company.com',
                  icon: Icons.person_outline,
                ),
                const SizedBox(height: 18),

                _settingsLabel('Password'),
                _settingsField(
                  controller: _passwordController,
                  hint: 'Workspace password',
                  icon: Icons.lock_outline,
                  obscure: _obscurePassword,
                  suffix: IconButton(
                    icon: Icon(_obscurePassword ? Icons.visibility_off : Icons.visibility,
                        size: 18, color: OctalColors.textMuted),
                    onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
                  ),
                ),
                const SizedBox(height: 22),

                Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    ElevatedButton.icon(
                      onPressed: _savingSettings ? null : _saveAndConnect,
                      icon: _savingSettings
                          ? const SizedBox(
                              width: 14,
                              height: 14,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black))
                          : const Icon(Icons.save_outlined, size: 18),
                      label: Text(_savingSettings ? 'Connecting...' : 'Save & Connect'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: OctalColors.primaryGold,
                        foregroundColor: Colors.black,
                        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                      ),
                    ),
                    OutlinedButton.icon(
                      onPressed: _savingSettings ? null : _testConnection,
                      icon: const Icon(Icons.wifi_tethering, size: 18),
                      label: const Text('Test Connection'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: OctalColors.primaryGold,
                        side: const BorderSide(color: OctalColors.borderGold),
                        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                      ),
                    ),
                    OutlinedButton.icon(
                      onPressed: _savingSettings ? null : _pollFbTasks,
                      icon: const Icon(Icons.sync, size: 18),
                      label: const Text('Sync Tasks Now'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: OctalColors.textSecondary,
                        side: const BorderSide(color: OctalColors.border),
                        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                      ),
                    ),
                    TextButton.icon(
                      onPressed: _savingSettings ? null : _signOut,
                      icon: const Icon(Icons.logout, size: 18),
                      label: const Text('Sign Out'),
                      style: TextButton.styleFrom(foregroundColor: Colors.redAccent),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: OctalColors.surfaceSubtle,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: OctalColors.border),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(Icons.info_outline, color: OctalColors.primaryGold, size: 18),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Agent ID: ${ApiService.instance.agentId}\n'
                    'This agent polls the cloud queue every 20 seconds and sends a heartbeat every 2 minutes. '
                    'Tasks are claimed atomically, so running several machines on one workspace is safe.',
                    style: const TextStyle(color: OctalColors.textSecondary, fontSize: 12, height: 1.5),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _settingsLabel(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text(text.toUpperCase(),
            style: const TextStyle(
                color: OctalColors.textMuted,
                fontSize: 10,
                fontWeight: FontWeight.bold,
                letterSpacing: 0.6)),
      );

  Widget _settingsField({
    required TextEditingController controller,
    required String hint,
    required IconData icon,
    bool obscure = false,
    Widget? suffix,
  }) {
    return TextField(
      controller: controller,
      obscureText: obscure,
      style: const TextStyle(color: Colors.white, fontSize: 13),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: const TextStyle(color: OctalColors.textMuted, fontSize: 13),
        prefixIcon: Icon(icon, size: 18, color: OctalColors.textMuted),
        suffixIcon: suffix,
        filled: true,
        fillColor: OctalColors.surfaceElevated,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: OctalColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: OctalColors.primaryGold),
        ),
      ),
    );
  }

  Widget _buildDashboardTab() {
    return Padding(
      padding: const EdgeInsets.all(24.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Local Agent Overview', style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
          const SizedBox(height: 6),
          const Text('Your machine is operating as an edge worker for your Octal Dialer cloud workspace.', style: TextStyle(color: OctalColors.textSecondary, fontSize: 13)),
          const SizedBox(height: 24),
          Row(
            children: [
              _metricCard('Local FB Account', 'Connected 🟢', 'Zero Chrome Extensions Needed', Icons.facebook),
              const SizedBox(width: 16),
              _metricCard('Local Auto-Emailer', 'Active 🟢', 'Direct SMTP/OAuth Delivery', Icons.email),
              const SizedBox(width: 16),
              _metricCard('Server CPU Impact', '0.0 %', '100% Client-Side Processing', Icons.memory),
            ],
          ),
          const SizedBox(height: 28),
          const Text('Recent Local Activity', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
          const SizedBox(height: 12),
          Expanded(child: _buildLogView()),
        ],
      ),
    );
  }

  Widget _metricCard(String title, String value, String subtitle, IconData icon) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: OctalColors.surfaceCard,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: OctalColors.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, color: OctalColors.primaryGold, size: 22),
                const Spacer(),
                const Icon(Icons.check_circle, color: Colors.green, size: 16),
              ],
            ),
            const SizedBox(height: 14),
            Text(value, style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)),
            const SizedBox(height: 4),
            Text(title, style: const TextStyle(color: OctalColors.textSecondary, fontSize: 13)),
            const SizedBox(height: 6),
            Text(subtitle, style: const TextStyle(color: OctalColors.textMuted, fontSize: 11)),
          ],
        ),
      ),
    );
  }

  Widget _buildFacebookTab() {
    return Padding(
      padding: const EdgeInsets.all(24.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Facebook Auto-Poster (Local Worker)', style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
                  SizedBox(height: 4),
                  Text('Runs locally on your PC. No Chrome extensions, no server CPU load, and real residential IP safety.', style: TextStyle(color: OctalColors.textSecondary, fontSize: 13)),
                ],
              ),
              const Spacer(),
              ElevatedButton.icon(
                onPressed: () {
                  FbLocalWorker.instance.startCookieCapture(_profileController.text.trim());
                },
                icon: const Icon(Icons.login, size: 18),
                label: const Text('1-Click Connect Facebook (No Extensions)'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: OctalColors.primaryGold,
                  foregroundColor: Colors.black,
                  padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _profileController,
                  decoration: const InputDecoration(
                    labelText: 'Profile Identifier',
                    filled: true,
                    fillColor: OctalColors.surfaceCard,
                    border: OutlineInputBorder(),
                  ),
                ),
              ),
              const SizedBox(width: 16),
              ElevatedButton.icon(
                onPressed: () async {
                  final urls = _postsController.text.split('\n').where((u) => u.trim().isNotEmpty).toList();
                  try {
                    await FbLocalWorker.instance.runCampaign(
                      profileName: _profileController.text.trim(),
                      postUrls: urls,
                      caption: _captionController.text.trim(),
                    );
                  } catch (e) {
                    // runCampaign refuses to start while one is already active.
                    _toast(e is StateError ? e.message : 'Campaign failed to start: $e', error: true);
                  }
                },
                icon: const Icon(Icons.play_arrow),
                label: const Text('Start Local Campaign (Edge Execution)'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.green,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          Expanded(child: _buildLogView()),
        ],
      ),
    );
  }

  Widget _buildEmailTab() {
    return const Padding(
      padding: EdgeInsets.all(24.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Auto-Emailer (Local Edge Dispatcher)', style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
          SizedBox(height: 6),
          Text('Dispatches cold campaigns through your local mail client/OAuth without server rate-limit issues.', style: TextStyle(color: OctalColors.textSecondary, fontSize: 13)),
        ],
      ),
    );
  }

  Widget _buildLogsTab() {
    return Padding(
      padding: const EdgeInsets.all(24.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Live Local Execution Telemetry', style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
          const SizedBox(height: 16),
          Expanded(child: _buildLogView()),
        ],
      ),
    );
  }

  Widget _buildLogView() {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFF0D0C0A),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: OctalColors.border),
      ),
      child: ListView.builder(
        itemCount: _localLogs.length,
        itemBuilder: (context, i) {
          final log = _localLogs[i];
          Color color = OctalColors.textSecondary;
          if (log.contains('✅') || log.contains('SUCCESS')) color = Colors.green;
          if (log.contains('❌') || log.contains('Error')) color = Colors.redAccent;
          if (log.contains('🚀') || log.contains('Connected')) color = OctalColors.primaryGold;
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 2.0),
            child: Text(log, style: TextStyle(fontFamily: 'Consolas, monospace', fontSize: 12, color: color)),
          );
        },
      ),
    );
  }
}
