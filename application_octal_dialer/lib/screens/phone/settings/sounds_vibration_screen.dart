import 'package:flutter/material.dart';
import '../../../services/dialer_settings_service.dart';

class SoundsVibrationScreen extends StatefulWidget {
  const SoundsVibrationScreen({super.key});

  @override
  State<SoundsVibrationScreen> createState() => _SoundsVibrationScreenState();
}

class _SoundsVibrationScreenState extends State<SoundsVibrationScreen> {
  final DialerSettingsService _settings = DialerSettingsService.instance;

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
          'Sounds and vibration',
          style: TextStyle(color: Color(0xFFF0DFD8), fontSize: 20, fontWeight: FontWeight.w500),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(vertical: 8),
        children: [
          ListTile(
            title: const Text('Phone ringtone', style: TextStyle(color: Color(0xFFF0DFD8), fontSize: 16)),
            subtitle: Text(_settings.phoneRingtone, style: const TextStyle(color: Color(0xFFA49691), fontSize: 13)),
            onTap: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Ringtone controlled by system audio settings'),
                  backgroundColor: Color(0xFF28231F),
                ),
              );
            },
          ),
          const Divider(color: Color(0xFF2E2622), height: 1),
          SwitchListTile(
            title: const Text('Also vibrate for calls', style: TextStyle(color: Color(0xFFF0DFD8), fontSize: 16)),
            subtitle: const Text(
              'Vibrate phone when an incoming call arrives.',
              style: TextStyle(color: Color(0xFFA49691), fontSize: 13),
            ),
            value: _settings.callVibrate,
            activeColor: const Color(0xFF5BB974),
            activeTrackColor: const Color(0xFF1E4D2B),
            onChanged: (val) {
              setState(() => _settings.setCallVibrate(val));
            },
          ),
          const Divider(color: Color(0xFF2E2622), height: 1),
          SwitchListTile(
            title: const Text('Dialpad tones', style: TextStyle(color: Color(0xFFF0DFD8), fontSize: 16)),
            subtitle: const Text(
              'Play audible DTMF tones when tapping numbers on the dialpad.',
              style: TextStyle(color: Color(0xFFA49691), fontSize: 13),
            ),
            value: _settings.dialpadTones,
            activeColor: const Color(0xFF5BB974),
            activeTrackColor: const Color(0xFF1E4D2B),
            onChanged: (val) {
              setState(() => _settings.setDialpadTones(val));
            },
          ),
          const Divider(color: Color(0xFF2E2622), height: 1),
          SwitchListTile(
            title: const Text('Dialpad vibration', style: TextStyle(color: Color(0xFFF0DFD8), fontSize: 16)),
            subtitle: const Text(
              'Haptic feedback vibration on dialpad keypresses.',
              style: TextStyle(color: Color(0xFFA49691), fontSize: 13),
            ),
            value: _settings.dialpadVibrate,
            activeColor: const Color(0xFF5BB974),
            activeTrackColor: const Color(0xFF1E4D2B),
            onChanged: (val) {
              setState(() => _settings.setDialpadVibrate(val));
            },
          ),
        ],
      ),
    );
  }
}
