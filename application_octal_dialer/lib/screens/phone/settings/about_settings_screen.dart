import 'package:flutter/material.dart';

class AboutSettingsScreen extends StatelessWidget {
  const AboutSettingsScreen({super.key});

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
          'About, terms & privacy',
          style: TextStyle(color: Color(0xFFF0DFD8), fontSize: 20, fontWeight: FontWeight.w500),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(vertical: 8),
        children: [
          const ListTile(
            title: Text('Version', style: TextStyle(color: Color(0xFFF0DFD8), fontSize: 16)),
            subtitle: Text('1.2.4+10 (Google Phone edition)', style: TextStyle(color: Color(0xFFA49691), fontSize: 13)),
          ),
          const Divider(color: Color(0xFF2E2622), height: 1),
          ListTile(
            title: const Text('Open source licenses', style: TextStyle(color: Color(0xFFF0DFD8), fontSize: 16)),
            subtitle: const Text('License details for open source software', style: TextStyle(color: Color(0xFFA49691), fontSize: 13)),
            onTap: () {
              showLicensePage(
                context: context,
                applicationName: 'Phone',
                applicationVersion: '1.2.4+10',
              );
            },
          ),
          const Divider(color: Color(0xFF2E2622), height: 1),
          const ListTile(
            title: Text('Terms of service', style: TextStyle(color: Color(0xFFF0DFD8), fontSize: 16)),
            subtitle: Text('Google Terms of Service', style: TextStyle(color: Color(0xFFA49691), fontSize: 13)),
          ),
          const Divider(color: Color(0xFF2E2622), height: 1),
          const ListTile(
            title: Text('Privacy policy', style: TextStyle(color: Color(0xFFF0DFD8), fontSize: 16)),
            subtitle: Text('Google Privacy Policy', style: TextStyle(color: Color(0xFFA49691), fontSize: 13)),
          ),
        ],
      ),
    );
  }
}
