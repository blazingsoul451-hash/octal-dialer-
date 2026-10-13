import 'package:flutter/material.dart';
import '../../../services/dialer_settings_service.dart';

class CallingAccountsScreen extends StatefulWidget {
  const CallingAccountsScreen({super.key});

  @override
  State<CallingAccountsScreen> createState() => _CallingAccountsScreenState();
}

class _CallingAccountsScreenState extends State<CallingAccountsScreen> {
  final DialerSettingsService _settings = DialerSettingsService.instance;

  void _showSimPreferenceDialog() {
    showDialog(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          backgroundColor: const Color(0xFF28231F),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          title: const Text(
            'Make calls with',
            style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _buildSimRadio('Ask every time', -1, ctx),
              _buildSimRadio('SIM 1 (ZONG)', 0, ctx),
              _buildSimRadio('SIM 2 (Jazz)', 1, ctx),
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

  Widget _buildSimRadio(String label, int value, BuildContext dlgCtx) {
    return ListTile(
      title: Text(label, style: const TextStyle(color: Colors.white, fontSize: 14.5)),
      leading: Radio<int>(
        value: value,
        groupValue: _settings.preferredSim,
        activeColor: const Color(0xFF5BB974),
        onChanged: (val) {
          if (val != null) {
            _settings.setPreferredSim(val);
            setState(() {});
            Navigator.pop(dlgCtx);
          }
        },
      ),
      contentPadding: EdgeInsets.zero,
      onTap: () {
        _settings.setPreferredSim(value);
        setState(() {});
        Navigator.pop(dlgCtx);
      },
    );
  }

  String _getSimPreferenceLabel() {
    switch (_settings.preferredSim) {
      case 0:
        return 'SIM 1 (ZONG)';
      case 1:
        return 'SIM 2 (Jazz)';
      case -1:
      default:
        return 'Ask every time';
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
          'Calling accounts',
          style: TextStyle(color: Color(0xFFF0DFD8), fontSize: 20, fontWeight: FontWeight.w500),
        ),
      ),
      body: ListView(
        children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(20, 16, 20, 8),
            child: Text(
              'Call settings',
              style: TextStyle(color: Color(0xFFA49691), fontSize: 13, fontWeight: FontWeight.w600),
            ),
          ),
          ListTile(
            leading: const Icon(Icons.sim_card_outlined, color: Color(0xFFF0DFD8)),
            title: const Text('Make calls with', style: TextStyle(color: Color(0xFFF0DFD8), fontSize: 15.5)),
            subtitle: Text(_getSimPreferenceLabel(), style: const TextStyle(color: Color(0xFFA49691), fontSize: 13)),
            onTap: _showSimPreferenceDialog,
          ),
          const Divider(color: Color(0xFF2E2622), height: 1),
          const Padding(
            padding: EdgeInsets.fromLTRB(20, 16, 20, 8),
            child: Text(
              'Active SIM cards',
              style: TextStyle(color: Color(0xFFA49691), fontSize: 13, fontWeight: FontWeight.w600),
            ),
          ),
          const ListTile(
            leading: CircleAvatar(
              radius: 14,
              backgroundColor: Color(0xFF382923),
              child: Text('1', style: TextStyle(color: Color(0xFFF0DFD8), fontSize: 12, fontWeight: FontWeight.bold)),
            ),
            title: Text('SIM 1', style: TextStyle(color: Color(0xFFF0DFD8), fontSize: 15.5)),
            subtitle: Text('ZONG • Active', style: TextStyle(color: Color(0xFFA49691), fontSize: 13)),
          ),
          const ListTile(
            leading: CircleAvatar(
              radius: 14,
              backgroundColor: Color(0xFF382923),
              child: Text('2', style: TextStyle(color: Color(0xFFF0DFD8), fontSize: 12, fontWeight: FontWeight.bold)),
            ),
            title: Text('SIM 2', style: TextStyle(color: Color(0xFFF0DFD8), fontSize: 15.5)),
            subtitle: Text('Jazz • Active', style: TextStyle(color: Color(0xFFA49691), fontSize: 13)),
          ),
          const Divider(color: Color(0xFF2E2622), height: 1),
          const Padding(
            padding: EdgeInsets.fromLTRB(20, 16, 20, 8),
            child: Text(
              'Other call features',
              style: TextStyle(color: Color(0xFFA49691), fontSize: 13, fontWeight: FontWeight.w600),
            ),
          ),
          const ListTile(
            title: Text('Call forwarding', style: TextStyle(color: Color(0xFFF0DFD8), fontSize: 15.5)),
            subtitle: Text('Managed by carrier', style: TextStyle(color: Color(0xFFA49691), fontSize: 13)),
          ),
          const ListTile(
            title: Text('Call waiting', style: TextStyle(color: Color(0xFFF0DFD8), fontSize: 15.5)),
            subtitle: Text('Notify during active call', style: TextStyle(color: Color(0xFFA49691), fontSize: 13)),
          ),
        ],
      ),
    );
  }
}
