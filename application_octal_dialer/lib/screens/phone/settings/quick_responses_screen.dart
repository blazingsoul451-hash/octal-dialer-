import 'package:flutter/material.dart';
import '../../../services/dialer_settings_service.dart';

class QuickResponsesScreen extends StatefulWidget {
  const QuickResponsesScreen({super.key});

  @override
  State<QuickResponsesScreen> createState() => _QuickResponsesScreenState();
}

class _QuickResponsesScreenState extends State<QuickResponsesScreen> {
  final DialerSettingsService _settings = DialerSettingsService.instance;
  final TextEditingController _editController = TextEditingController();

  void _showEditResponseDialog(int index) {
    _editController.text = _settings.quickResponses[index];
    showDialog(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          backgroundColor: const Color(0xFF28231F),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          title: const Text('Quick response', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
          content: TextField(
            controller: _editController,
            autofocus: true,
            maxLines: 3,
            style: const TextStyle(color: Colors.white, fontSize: 15),
            decoration: const InputDecoration(
              hintText: 'Response message',
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
                final text = _editController.text.trim();
                if (text.isNotEmpty) {
                  _settings.updateQuickResponse(index, text);
                  setState(() {});
                  Navigator.pop(ctx);
                }
              },
              child: const Text('OK', style: TextStyle(color: Color(0xFF5BB974), fontWeight: FontWeight.bold)),
            ),
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final responses = _settings.quickResponses;

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
          'Quick responses',
          style: TextStyle(color: Color(0xFFF0DFD8), fontSize: 20, fontWeight: FontWeight.w500),
        ),
      ),
      body: ListView.separated(
        padding: const EdgeInsets.symmetric(vertical: 8),
        itemCount: responses.length,
        separatorBuilder: (_, __) => const Divider(color: Color(0xFF2E2622), height: 1),
        itemBuilder: (ctx, idx) {
          return ListTile(
            title: Text(
              responses[idx],
              style: const TextStyle(color: Color(0xFFF0DFD8), fontSize: 15.5),
            ),
            contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
            onTap: () => _showEditResponseDialog(idx),
          );
        },
      ),
    );
  }
}
