import 'package:flutter/material.dart';
import '../../../services/dialer_settings_service.dart';
import '../../../services/phone_data_service.dart';

class BlockedNumbersScreen extends StatefulWidget {
  const BlockedNumbersScreen({super.key});

  @override
  State<BlockedNumbersScreen> createState() => _BlockedNumbersScreenState();
}

class _BlockedNumbersScreenState extends State<BlockedNumbersScreen> {
  final DialerSettingsService _settings = DialerSettingsService.instance;
  final TextEditingController _numberController = TextEditingController();

  void _showAddNumberDialog() {
    _numberController.clear();
    showDialog(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          backgroundColor: const Color(0xFF28231F),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          title: const Text(
            'Add a phone number',
            style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
          ),
          content: TextField(
            controller: _numberController,
            keyboardType: TextInputType.phone,
            autofocus: true,
            style: const TextStyle(color: Colors.white, fontSize: 16),
            decoration: const InputDecoration(
              hintText: 'Phone number',
              hintStyle: TextStyle(color: Color(0xFFA49691)),
              enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF5BB974))),
              focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF5BB974), width: 2)),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFA49691))),
            ),
            TextButton(
              onPressed: () {
                final text = _numberController.text.trim();
                if (text.isNotEmpty) {
                  _settings.addBlockedNumber(text);
                  PhoneDataService.instance.blockNumber(text);
                  setState(() {});
                  Navigator.pop(ctx);
                }
              },
              child: const Text('Block', style: TextStyle(color: Color(0xFF5BB974), fontWeight: FontWeight.bold)),
            ),
          ],
        );
      },
    );
  }

  void _unblockNumber(String number) {
    showDialog(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          backgroundColor: const Color(0xFF28231F),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          title: Text(
            'Unblock $number?',
            style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
          ),
          content: const Text(
            'You will be able to receive calls and messages from this number again.',
            style: TextStyle(color: Color(0xFFA49691), fontSize: 14),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFA49691))),
            ),
            TextButton(
              onPressed: () {
                _settings.removeBlockedNumber(number);
                PhoneDataService.instance.unblockNumber(number);
                setState(() {});
                Navigator.pop(ctx);
              },
              child: const Text('Unblock', style: TextStyle(color: Color(0xFF5BB974), fontWeight: FontWeight.bold)),
            ),
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final blockedList = _settings.blockedNumbers;

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
          'Blocked numbers',
          style: TextStyle(color: Color(0xFFF0DFD8), fontSize: 20, fontWeight: FontWeight.w500),
        ),
      ),
      body: ListView(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
            child: Text(
              'You won’t receive calls or texts from blocked numbers.',
              style: TextStyle(color: const Color(0xFFA49691).withOpacity(0.9), fontSize: 13.5),
            ),
          ),
          SwitchListTile(
            title: const Text(
              'Unknown',
              style: TextStyle(color: Color(0xFFF0DFD8), fontSize: 16),
            ),
            subtitle: const Text(
              'Block calls from unidentified callers',
              style: TextStyle(color: Color(0xFFA49691), fontSize: 13),
            ),
            value: _settings.blockUnknown,
            activeColor: const Color(0xFF5BB974),
            activeTrackColor: const Color(0xFF1E4D2B),
            onChanged: (val) {
              setState(() => _settings.setBlockUnknown(val));
            },
          ),
          const Divider(color: Color(0xFF2E2622), height: 1),
          ListTile(
            leading: const Icon(Icons.add, color: Color(0xFF5BB974), size: 24),
            title: const Text(
              'Add a number',
              style: TextStyle(color: Color(0xFF5BB974), fontSize: 15.5, fontWeight: FontWeight.w500),
            ),
            onTap: _showAddNumberDialog,
          ),
          const Divider(color: Color(0xFF2E2622), height: 1),
          if (blockedList.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 28),
              child: Center(
                child: Text(
                  'No blocked numbers',
                  style: TextStyle(color: const Color(0xFFA49691).withOpacity(0.7), fontSize: 14),
                ),
              ),
            )
          else
            ...blockedList.map((blockedNum) => ListTile(
                  title: Text(blockedNum, style: const TextStyle(color: Color(0xFFF0DFD8), fontSize: 15.5)),
                  trailing: IconButton(
                    icon: const Icon(Icons.close, color: Color(0xFFA49691), size: 20),
                    onPressed: () => _unblockNumber(blockedNum),
                  ),
                )),
        ],
      ),
    );
  }
}
