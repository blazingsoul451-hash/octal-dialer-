import 'package:flutter/material.dart';

class HelpFeedbackScreen extends StatefulWidget {
  const HelpFeedbackScreen({super.key});

  @override
  State<HelpFeedbackScreen> createState() => _HelpFeedbackScreenState();
}

class _HelpFeedbackScreenState extends State<HelpFeedbackScreen> {
  final TextEditingController _feedbackController = TextEditingController();
  final TextEditingController _searchController = TextEditingController();
  bool _includeLogs = true;

  final List<Map<String, String>> _helpTopics = [
    {
      'title': 'Make and receive phone calls',
      'detail': 'To make a call, tap Keypad, enter a number, and tap Call. To answer an incoming call, swipe up or tap the Answer button.'
    },
    {
      'title': 'Block or unblock a phone number',
      'detail': 'In Recents, tap any call log to view options and select "Block or report". You can also manage blocked numbers in Settings > Blocked numbers.'
    },
    {
      'title': 'Clear call history',
      'detail': 'Open the menu drawer or tap the options menu and select "Clear call history". Confirm to remove all entries from your device call logs.'
    },
    {
      'title': 'Use Caller ID & spam protection',
      'detail': 'Caller ID helps identify unknown callers and suspected spam. You can enable or disable spam filtering in Settings > Caller ID & spam.'
    },
    {
      'title': 'Change call settings and ringtones',
      'detail': 'Go to Settings > Sounds and vibration to toggle dialpad tones, dialpad vibration, and ringtone preferences.'
    },
  ];

  String _searchFilter = '';

  void _showHelpDetail(String title, String detail) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF28231F),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text(title, style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.bold)),
        content: Text(detail, style: const TextStyle(color: Color(0xFFA49691), fontSize: 14, height: 1.4)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Close', style: TextStyle(color: Color(0xFF5BB974), fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }

  void _showSendFeedbackDialog() {
    _feedbackController.clear();
    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setDlgState) => AlertDialog(
          backgroundColor: const Color(0xFF28231F),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          title: const Text('Send feedback', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: _feedbackController,
                maxLines: 4,
                style: const TextStyle(color: Colors.white, fontSize: 14),
                decoration: const InputDecoration(
                  hintText: 'Describe your issue or share your ideas...',
                  hintStyle: TextStyle(color: Color(0xFFA49691)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF382923))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF5BB974))),
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Checkbox(
                    value: _includeLogs,
                    activeColor: const Color(0xFF5BB974),
                    onChanged: (val) => setDlgState(() => _includeLogs = val ?? true),
                  ),
                  const Expanded(
                    child: Text('Include system logs & diagnostic info', style: TextStyle(color: Color(0xFFA49691), fontSize: 12)),
                  ),
                ],
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFA49691))),
            ),
            TextButton(
              onPressed: () {
                Navigator.pop(ctx);
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Thank you for your feedback!'),
                    backgroundColor: Color(0xFF28231F),
                    behavior: SnackBarBehavior.floating,
                  ),
                );
              },
              child: const Text('Submit', style: TextStyle(color: Color(0xFF5BB974), fontWeight: FontWeight.bold)),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _helpTopics.where((t) {
      if (_searchFilter.isEmpty) return true;
      return t['title']!.toLowerCase().contains(_searchFilter.toLowerCase()) ||
          t['detail']!.toLowerCase().contains(_searchFilter.toLowerCase());
    }).toList();

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
          'Help & feedback',
          style: TextStyle(color: Color(0xFFF0DFD8), fontSize: 20, fontWeight: FontWeight.w500),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        children: [
          // Search box
          Container(
            height: 48,
            decoration: BoxDecoration(
              color: const Color(0xFF28231F),
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: const Color(0xFF382923)),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                const Icon(Icons.search, color: Color(0xFFA49691), size: 20),
                const SizedBox(width: 10),
                Expanded(
                  child: TextField(
                    controller: _searchController,
                    onChanged: (val) => setState(() => _searchFilter = val),
                    style: const TextStyle(color: Colors.white, fontSize: 14.5),
                    decoration: const InputDecoration(
                      hintText: 'Search help',
                      hintStyle: TextStyle(color: Color(0xFFA49691)),
                      border: InputBorder.none,
                      isDense: true,
                    ),
                  ),
                ),
                if (_searchFilter.isNotEmpty)
                  IconButton(
                    icon: const Icon(Icons.close, color: Color(0xFFA49691), size: 18),
                    onPressed: () {
                      _searchController.clear();
                      setState(() => _searchFilter = '');
                    },
                  ),
              ],
            ),
          ),

          const SizedBox(height: 20),
          const Text(
            'Popular help topics',
            style: TextStyle(color: Color(0xFFA49691), fontSize: 13, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 8),

          ...filtered.map((item) => ListTile(
                leading: const Icon(Icons.article_outlined, color: Color(0xFFF0DFD8), size: 22),
                title: Text(item['title']!, style: const TextStyle(color: Color(0xFFF0DFD8), fontSize: 15)),
                contentPadding: const EdgeInsets.symmetric(vertical: 2),
                onTap: () => _showHelpDetail(item['title']!, item['detail']!),
              )),

          const SizedBox(height: 16),
          const Divider(color: Color(0xFF2E2622), height: 1),
          const SizedBox(height: 12),

          ListTile(
            leading: const Icon(Icons.feedback_outlined, color: Color(0xFF5BB974), size: 22),
            title: const Text('Send feedback', style: TextStyle(color: Color(0xFF5BB974), fontSize: 15.5, fontWeight: FontWeight.w500)),
            subtitle: const Text('Share diagnostics or suggest improvements', style: TextStyle(color: Color(0xFFA49691), fontSize: 13)),
            contentPadding: EdgeInsets.zero,
            onTap: _showSendFeedbackDialog,
          ),
        ],
      ),
    );
  }
}
