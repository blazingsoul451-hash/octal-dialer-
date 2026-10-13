import 'package:flutter/material.dart';

class VoicemailSettingsScreen extends StatelessWidget {
  const VoicemailSettingsScreen({super.key});

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
          'Voicemail',
          style: TextStyle(color: Color(0xFFF0DFD8), fontSize: 20, fontWeight: FontWeight.w500),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(vertical: 8),
        children: const [
          Padding(
            padding: EdgeInsets.fromLTRB(20, 16, 20, 8),
            child: Text(
              'Voicemail settings',
              style: TextStyle(color: Color(0xFFA49691), fontSize: 13, fontWeight: FontWeight.w600),
            ),
          ),
          ListTile(
            title: Text('Service', style: TextStyle(color: Color(0xFFF0DFD8), fontSize: 16)),
            subtitle: Text('Your carrier', style: TextStyle(color: Color(0xFFA49691), fontSize: 13)),
          ),
          Divider(color: Color(0xFF2E2622), height: 1),
          ListTile(
            title: Text('Setup', style: TextStyle(color: Color(0xFFF0DFD8), fontSize: 16)),
            subtitle: Text('Voicemail number provided by SIM', style: TextStyle(color: Color(0xFFA49691), fontSize: 13)),
          ),
          Divider(color: Color(0xFF2E2622), height: 1),
          ListTile(
            title: Text('Notifications', style: TextStyle(color: Color(0xFFF0DFD8), fontSize: 16)),
            subtitle: Text('Sound, vibrate', style: TextStyle(color: Color(0xFFA49691), fontSize: 13)),
          ),
        ],
      ),
    );
  }
}
