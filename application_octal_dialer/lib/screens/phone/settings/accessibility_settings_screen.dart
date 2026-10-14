import 'package:flutter/material.dart';
import '../../../services/dialer_settings_service.dart';

class AccessibilitySettingsScreen extends StatefulWidget {
  const AccessibilitySettingsScreen({super.key});

  @override
  State<AccessibilitySettingsScreen> createState() => _AccessibilitySettingsScreenState();
}

class _AccessibilitySettingsScreenState extends State<AccessibilitySettingsScreen> {
  final DialerSettingsService _settings = DialerSettingsService.instance;

  void _showTtyDialog() {
    showDialog(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          backgroundColor: const Color(0xFF28231F),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          title: const Text(
            'TTY mode',
            style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _buildTtyRadio('TTY Off', 'off', ctx),
              _buildTtyRadio('TTY Full', 'full', ctx),
              _buildTtyRadio('TTY HCO', 'hco', ctx),
              _buildTtyRadio('TTY VCO', 'vco', ctx),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFA49691))),
            ),
          ],
        );
      },
    );
  }

  Widget _buildTtyRadio(String label, String value, BuildContext dlgCtx) {
    return ListTile(
      title: Text(label, style: const TextStyle(color: Colors.white, fontSize: 14.5)),
      leading: Radio<String>(
        value: value,
        groupValue: _settings.ttyMode,
        activeColor: const Color(0xFF5BB974),
        onChanged: (val) {
          if (val != null) {
            _settings.setTtyMode(val);
            Navigator.pop(dlgCtx);
          }
        },
      ),
      contentPadding: EdgeInsets.zero,
      onTap: () {
        _settings.setTtyMode(value);
        Navigator.pop(dlgCtx);
      },
    );
  }

  String _getTtyLabel() {
    switch (_settings.ttyMode) {
      case 'full':
        return 'TTY Full';
      case 'hco':
        return 'TTY HCO';
      case 'vco':
        return 'TTY VCO';
      case 'off':
      default:
        return 'TTY Off';
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
          'Accessibility',
          style: TextStyle(color: Color(0xFFF0DFD8), fontSize: 20, fontWeight: FontWeight.w500),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(vertical: 8),
        children: [
          ListTile(
            title: const Text('TTY mode', style: TextStyle(color: Color(0xFFF0DFD8), fontSize: 16)),
            subtitle: Text(_getTtyLabel(), style: const TextStyle(color: Color(0xFFA49691), fontSize: 13)),
            onTap: _showTtyDialog,
          ),
          const Divider(color: Color(0xFF2E2622), height: 1),
          SwitchListTile(
            title: const Text('Hearing aids', style: TextStyle(color: Color(0xFFF0DFD8), fontSize: 16)),
            subtitle: const Text(
              'Turn on hearing aid compatibility for enhanced telecoil audio.',
              style: TextStyle(color: Color(0xFFA49691), fontSize: 13),
            ),
            value: _settings.hearingAids,
            activeColor: const Color(0xFF5BB974),
            activeTrackColor: const Color(0xFF1E4D2B),
            onChanged: (val) async {
              final prev = _settings.hearingAids;
              try {
                await _settings.setHearingAids(val);
                if (mounted) setState(() {});
              } catch (e) {
                if (mounted) setState(() => _settings.setHearingAids(prev));
              }
            },
          ),
        ],
      ),
    );
  }
}
