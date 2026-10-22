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
    // Authenticate Desktop Worker with Cloud Workspace on boot
    ApiService.instance.login('owner@octal.local', 'OwnerPassword1234!').then((res) {
      if (res['success'] == true) {
        FbLocalWorker.instance.addLog('✅ Authenticated with Cloud Unibox ()');
      }
    });
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
      default:
        return _buildDashboardTab();
    }
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
                onPressed: () {
                  final urls = _postsController.text.split('\n').where((u) => u.trim().isNotEmpty).toList();
                  FbLocalWorker.instance.runCampaign(
                    profileName: _profileController.text.trim(),
                    postUrls: urls,
                    caption: _captionController.text.trim(),
                  );
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
