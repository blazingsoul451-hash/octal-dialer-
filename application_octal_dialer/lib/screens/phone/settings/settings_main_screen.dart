import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../widgets/octal_logo.dart';
import '../../../services/dialer_settings_service.dart';
import 'caller_id_spam_screen.dart';
import 'accessibility_settings_screen.dart';
import 'blocked_numbers_screen.dart';
import 'calling_accounts_screen.dart';
import 'display_options_screen.dart';
import 'nearby_places_screen.dart';
import 'quick_responses_screen.dart';
import 'sounds_vibration_screen.dart';
import 'voicemail_settings_screen.dart';
import 'flip_to_silence_screen.dart';
import 'about_settings_screen.dart';

class SettingsMainScreen extends StatefulWidget {
  const SettingsMainScreen({super.key});

  @override
  State<SettingsMainScreen> createState() => _SettingsMainScreenState();
}

class _SettingsMainScreenState extends State<SettingsMainScreen> {
  final DialerSettingsService _settings = DialerSettingsService.instance;

  @override
  void initState() {
    super.initState();
    _settings.init().then((_) {
      if (mounted) setState(() {});
    });
    _settings.addListener(_onSettingsChanged);
  }

  @override
  void dispose() {
    _settings.removeListener(_onSettingsChanged);
    super.dispose();
  }

  void _onSettingsChanged() {
    if (mounted) setState(() {});
  }

  void _showCallerIdAnnouncementDialog() {
    HapticFeedback.lightImpact();
    showDialog(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          backgroundColor: const Color(0xFF28231F),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          title: const Text(
            'Caller ID announcement',
            style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _buildRadioOption('Always', 'always', ctx),
              _buildRadioOption('Only when using a headset', 'headset', ctx),
              _buildRadioOption('Never', 'never', ctx),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancel', style: TextStyle(color: OctalColors.textSecondary)),
            ),
          ],
        );
      },
    );
  }

  Widget _buildRadioOption(String label, String value, BuildContext dialogCtx) {
    return ListTile(
      title: Text(label, style: const TextStyle(color: Colors.white, fontSize: 14.5)),
      leading: Radio<String>(
        value: value,
        groupValue: _settings.callerIdAnnouncement,
        activeColor: const Color(0xFF5BB974),
        onChanged: (val) {
          if (val != null) {
            _settings.setCallerIdAnnouncement(val);
            Navigator.pop(dialogCtx);
          }
        },
      ),
      contentPadding: EdgeInsets.zero,
      onTap: () {
        _settings.setCallerIdAnnouncement(value);
        Navigator.pop(dialogCtx);
      },
    );
  }

  String _getCallerIdAnnouncementLabel() {
    switch (_settings.callerIdAnnouncement) {
      case 'always':
        return 'Always';
      case 'headset':
        return 'Only when using a headset';
      case 'never':
      default:
        return 'Never';
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF1F1C19),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1F1C19),
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Color(0xFFF0DFD8)),
          onPressed: () => Navigator.pop(context),
        ),
        title: const Text(
          'Settings',
          style: TextStyle(
            color: Color(0xFFF0DFD8),
            fontSize: 20,
            fontWeight: FontWeight.w500,
          ),
        ),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(color: const Color(0xFF2E2622), height: 1),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(vertical: 8.0),
        children: [
          _buildCategoryHeader('General'),

          _buildSettingsTile(
            icon: Icons.shield_outlined,
            title: 'Caller ID & spam',
            subtitle: 'Identify business and spam numbers',
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const CallerIdSpamScreen()),
            ),
          ),

          _buildSettingsTile(
            icon: Icons.accessibility_new_rounded,
            title: 'Accessibility',
            subtitle: 'TTY mode, hearing aids',
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const AccessibilitySettingsScreen()),
            ),
          ),

          _buildSettingsTile(
            icon: Icons.block_rounded,
            title: 'Blocked numbers',
            subtitle: '${_settings.blockedNumbers.length} numbers blocked',
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const BlockedNumbersScreen()),
            ),
          ),

          _buildSettingsTile(
            icon: Icons.sim_card_outlined,
            title: 'Calling accounts',
            subtitle: 'SIM cards, call settings',
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const CallingAccountsScreen()),
            ),
          ),

          _buildSettingsTile(
            icon: Icons.palette_outlined,
            title: 'Display options',
            subtitle: 'Sort by, name format, theme',
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const DisplayOptionsScreen()),
            ),
          ),

          _buildSettingsTile(
            icon: Icons.location_on_outlined,
            title: 'Nearby places',
            subtitle: _settings.nearbyPlaces ? 'Personalized search on' : 'Off',
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const NearbyPlacesScreen()),
            ),
          ),

          _buildSettingsTile(
            icon: Icons.message_outlined,
            title: 'Quick responses',
            subtitle: 'Edit responses for declined calls',
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const QuickResponsesScreen()),
            ),
          ),

          _buildSettingsTile(
            icon: Icons.volume_up_outlined,
            title: 'Sounds and vibration',
            subtitle: 'Ringtone, dialpad tones, vibration',
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const SoundsVibrationScreen()),
            ),
          ),

          _buildSettingsTile(
            icon: Icons.voicemail_rounded,
            title: 'Voicemail',
            subtitle: 'Notifications, advanced settings',
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const VoicemailSettingsScreen()),
            ),
          ),

          _buildSettingsTile(
            icon: Icons.record_voice_over_outlined,
            title: 'Caller ID announcement',
            subtitle: _getCallerIdAnnouncementLabel(),
            onTap: _showCallerIdAnnouncementDialog,
          ),

          _buildSettingsTile(
            icon: Icons.screen_rotation_outlined,
            title: 'Flip To Silence',
            subtitle: _settings.flipToSilence ? 'On' : 'Off',
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const FlipToSilenceScreen()),
            ),
          ),

          const SizedBox(height: 12),
          const Divider(color: Color(0xFF2E2622), height: 1),
          const SizedBox(height: 8),

          _buildCategoryHeader('About'),

          _buildSettingsTile(
            icon: Icons.info_outline_rounded,
            title: 'About, terms & privacy',
            subtitle: 'Version 1.2.4+10 • Google Phone edition',
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const AboutSettingsScreen()),
            ),
          ),

          const SizedBox(height: 32),
        ],
      ),
    );
  }

  Widget _buildCategoryHeader(String title) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
      child: Text(
        title,
        style: const TextStyle(
          color: Color(0xFFA49691),
          fontSize: 13,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.3,
        ),
      ),
    );
  }

  Widget _buildSettingsTile({
    required IconData icon,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    return ListTile(
      leading: Icon(icon, color: const Color(0xFFF0DFD8), size: 23),
      title: Text(
        title,
        style: const TextStyle(
          color: Color(0xFFF0DFD8),
          fontSize: 15.5,
          fontWeight: FontWeight.w400,
        ),
      ),
      subtitle: Padding(
        padding: const EdgeInsets.only(top: 2.0),
        child: Text(
          subtitle,
          style: const TextStyle(
            color: Color(0xFFA49691),
            fontSize: 13,
            fontWeight: FontWeight.w400,
          ),
        ),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 3),
      onTap: onTap,
    );
  }
}
