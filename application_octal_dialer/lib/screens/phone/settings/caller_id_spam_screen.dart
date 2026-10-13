import 'package:flutter/material.dart';
import '../../../services/dialer_settings_service.dart';

class CallerIdSpamScreen extends StatefulWidget {
  const CallerIdSpamScreen({super.key});

  @override
  State<CallerIdSpamScreen> createState() => _CallerIdSpamScreenState();
}

class _CallerIdSpamScreenState extends State<CallerIdSpamScreen> {
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
          'Caller ID & spam',
          style: TextStyle(color: Color(0xFFF0DFD8), fontSize: 20, fontWeight: FontWeight.w500),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(vertical: 8),
        children: [
          SwitchListTile(
            title: const Text(
              'See caller and spam ID',
              style: TextStyle(color: Color(0xFFF0DFD8), fontSize: 16),
            ),
            subtitle: const Text(
              'Identify business and spam numbers with names and verified information.',
              style: TextStyle(color: Color(0xFFA49691), fontSize: 13),
            ),
            value: _settings.callerIdAndSpam,
            activeColor: const Color(0xFF5BB974),
            activeTrackColor: const Color(0xFF1E4D2B),
            onChanged: (val) {
              setState(() => _settings.setCallerIdAndSpam(val));
            },
          ),
          const Divider(color: Color(0xFF2E2622), height: 1),
          SwitchListTile(
            title: const Text(
              'Filter spam calls',
              style: TextStyle(color: Color(0xFFF0DFD8), fontSize: 16),
            ),
            subtitle: const Text(
              'Prevent suspected spam calls from disturbing you. You will still see them in call history.',
              style: TextStyle(color: Color(0xFFA49691), fontSize: 13),
            ),
            value: _settings.filterSpam,
            activeColor: const Color(0xFF5BB974),
            activeTrackColor: const Color(0xFF1E4D2B),
            onChanged: (val) {
              setState(() => _settings.setFilterSpam(val));
            },
          ),
          const Divider(color: Color(0xFF2E2622), height: 1),
          SwitchListTile(
            title: const Text(
              'Verified calls',
              style: TextStyle(color: Color(0xFFF0DFD8), fontSize: 16),
            ),
            subtitle: const Text(
              'See caller ID and reason for incoming calls from businesses.',
              style: TextStyle(color: Color(0xFFA49691), fontSize: 13),
            ),
            value: _settings.verifiedCalls,
            activeColor: const Color(0xFF5BB974),
            activeTrackColor: const Color(0xFF1E4D2B),
            onChanged: (val) {
              setState(() => _settings.setVerifiedCalls(val));
            },
          ),
        ],
      ),
    );
  }
}
