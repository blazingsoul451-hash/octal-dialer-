import 'package:flutter/material.dart';
import '../../../services/dialer_settings_service.dart';

class DisplayOptionsScreen extends StatefulWidget {
  const DisplayOptionsScreen({super.key});

  @override
  State<DisplayOptionsScreen> createState() => _DisplayOptionsScreenState();
}

class _DisplayOptionsScreenState extends State<DisplayOptionsScreen> {
  final DialerSettingsService _settings = DialerSettingsService.instance;

  void _showSortByDialog() {
    showDialog(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          backgroundColor: const Color(0xFF28231F),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          title: const Text('Sort by', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _buildRadioOption('First name', 'first', _settings.sortBy, (val) => _settings.setSortBy(val), ctx),
              _buildRadioOption('Last name', 'last', _settings.sortBy, (val) => _settings.setSortBy(val), ctx),
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

  void _showNameFormatDialog() {
    showDialog(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          backgroundColor: const Color(0xFF28231F),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          title: const Text('Name format', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _buildRadioOption('First name first', 'first_first', _settings.nameFormat, (val) => _settings.setNameFormat(val), ctx),
              _buildRadioOption('Last name first', 'last_first', _settings.nameFormat, (val) => _settings.setNameFormat(val), ctx),
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

  void _showThemeDialog() {
    showDialog(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          backgroundColor: const Color(0xFF28231F),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          title: const Text('Choose theme', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _buildRadioOption('Light', 'light', _settings.themeMode, (val) => _settings.setThemeMode(val), ctx),
              _buildRadioOption('Dark', 'dark', _settings.themeMode, (val) => _settings.setThemeMode(val), ctx),
              _buildRadioOption('System default', 'system', _settings.themeMode, (val) => _settings.setThemeMode(val), ctx),
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

  Widget _buildRadioOption(String label, String value, String current, Function(String) onSelect, BuildContext dlgCtx) {
    return ListTile(
      title: Text(label, style: const TextStyle(color: Colors.white, fontSize: 14.5)),
      leading: Radio<String>(
        value: value,
        groupValue: current,
        activeColor: const Color(0xFF5BB974),
        onChanged: (val) {
          if (val != null) {
            onSelect(val);
            setState(() {});
            Navigator.pop(dlgCtx);
          }
        },
      ),
      contentPadding: EdgeInsets.zero,
      onTap: () {
        onSelect(value);
        setState(() {});
        Navigator.pop(dlgCtx);
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final sortLabel = _settings.sortBy == 'last' ? 'Last name' : 'First name';
    final nameFormatLabel = _settings.nameFormat == 'last_first' ? 'Last name first' : 'First name first';
    final themeLabel = _settings.themeMode == 'light' ? 'Light' : (_settings.themeMode == 'dark' ? 'Dark' : 'System default');

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
          'Display options',
          style: TextStyle(color: Color(0xFFF0DFD8), fontSize: 20, fontWeight: FontWeight.w500),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(vertical: 8),
        children: [
          ListTile(
            title: const Text('Sort by', style: TextStyle(color: Color(0xFFF0DFD8), fontSize: 16)),
            subtitle: Text(sortLabel, style: const TextStyle(color: Color(0xFFA49691), fontSize: 13)),
            onTap: _showSortByDialog,
          ),
          const Divider(color: Color(0xFF2E2622), height: 1),
          ListTile(
            title: const Text('Name format', style: TextStyle(color: Color(0xFFF0DFD8), fontSize: 16)),
            subtitle: Text(nameFormatLabel, style: const TextStyle(color: Color(0xFFA49691), fontSize: 13)),
            onTap: _showNameFormatDialog,
          ),
          const Divider(color: Color(0xFF2E2622), height: 1),
          ListTile(
            title: const Text('Theme', style: TextStyle(color: Color(0xFFF0DFD8), fontSize: 16)),
            subtitle: Text(themeLabel, style: const TextStyle(color: Color(0xFFA49691), fontSize: 13)),
            onTap: _showThemeDialog,
          ),
        ],
      ),
    );
  }
}
