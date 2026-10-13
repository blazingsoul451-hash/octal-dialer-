import 'package:flutter/material.dart';
import '../../models/phone_models.dart';
import '../../services/phone_data_service.dart';
import '../../services/telecom_service.dart';
import 'contact_detail_screen.dart';

class PhoneRecentsView extends StatefulWidget {
  const PhoneRecentsView({super.key});

  @override
  State<PhoneRecentsView> createState() => _PhoneRecentsViewState();
}

class _PhoneRecentsViewState extends State<PhoneRecentsView> {
  final PhoneDataService _dataService = PhoneDataService.instance;
  String _selectedFilter = 'All';

  void _confirmClearCallHistory() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF28231F),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Text(
          'Clear call history?',
          style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
        ),
        content: const Text(
          'This will delete all calls from your history',
          style: TextStyle(color: Color(0xFFA49691), fontSize: 14),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel', style: TextStyle(color: Color(0xFFA49691))),
          ),
          TextButton(
            onPressed: () async {
              Navigator.pop(ctx);
              await _dataService.clearAllCallLogs();
              if (mounted) {
                setState(() {});
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Call history cleared'),
                    backgroundColor: Color(0xFF28231F),
                    behavior: SnackBarBehavior.floating,
                  ),
                );
              }
            },
            child: const Text('Clear', style: TextStyle(color: Color(0xFF5BB974), fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final calls = _dataService.filterRecentCalls(_selectedFilter);

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
          'Recents',
          style: TextStyle(fontSize: 20, fontWeight: FontWeight.w500, color: Color(0xFFF0DFD8)),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.more_vert, color: Color(0xFFF0DFD8)),
            onPressed: () {
              showModalBottomSheet(
                context: context,
                backgroundColor: const Color(0xFF28231F),
                shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
                builder: (ctx) => SafeArea(
                  child: ListTile(
                    leading: const Icon(Icons.delete_sweep_outlined, color: Color(0xFFF0DFD8)),
                    title: const Text('Clear call history', style: TextStyle(color: Color(0xFFF0DFD8))),
                    onTap: () {
                      Navigator.pop(ctx);
                      _confirmClearCallHistory();
                    },
                  ),
                ),
              );
            },
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            // Filter Pills
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    _buildChip('All'),
                    const SizedBox(width: 8),
                    _buildChip('Missed'),
                    const SizedBox(width: 8),
                    _buildChip('Contacts'),
                    const SizedBox(width: 8),
                    _buildChip('Non-spam'),
                  ],
                ),
              ),
            ),

            const SizedBox(height: 8),

            // Call history list
            Expanded(
              child: calls.isEmpty
                  ? const Center(
                      child: Text('No call history', style: TextStyle(color: Color(0xFFA49691), fontSize: 14)),
                    )
                  : ListView.builder(
                      itemCount: calls.length,
                      itemBuilder: (ctx, idx) {
                        final call = calls[idx];
                        final isMissed = call.direction == CallDirection.missed || call.direction == CallDirection.rejected;

                        IconData dirIcon;
                        Color dirColor;
                        switch (call.direction) {
                          case CallDirection.outgoing:
                            dirIcon = Icons.call_made_rounded;
                            dirColor = const Color(0xFFA49691);
                            break;
                          case CallDirection.missed:
                          case CallDirection.rejected:
                            dirIcon = Icons.call_missed_rounded;
                            dirColor = const Color(0xFFE57373);
                            break;
                          case CallDirection.blocked:
                            dirIcon = Icons.block_rounded;
                            dirColor = const Color(0xFFA49691);
                            break;
                          case CallDirection.incoming:
                          default:
                            dirIcon = Icons.call_received_rounded;
                            dirColor = const Color(0xFFA49691);
                        }

                        return ListTile(
                          contentPadding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 4.0),
                          leading: CircleAvatar(
                            radius: 20,
                            backgroundColor: call.avatarColor,
                            child: Text(
                              call.initials,
                              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                            ),
                          ),
                          title: Text(
                            call.name,
                            style: TextStyle(
                              color: isMissed ? const Color(0xFFE57373) : const Color(0xFFF0DFD8),
                              fontSize: 15,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                          subtitle: Row(
                            children: [
                              Icon(dirIcon, size: 14, color: dirColor),
                              const SizedBox(width: 4),
                              Text(call.formattedTime, style: const TextStyle(color: Color(0xFFA49691), fontSize: 12.5)),
                              if (call.simName != null && call.simName!.isNotEmpty) ...[
                                const SizedBox(width: 6),
                                Text(
                                  call.simName!,
                                  style: const TextStyle(fontSize: 11, color: Color(0xFFC4B5FD), fontWeight: FontWeight.bold),
                                ),
                              ],
                            ],
                          ),
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              IconButton(
                                icon: const Icon(Icons.phone_outlined, color: Color(0xFFA49691), size: 21),
                                onPressed: () => TelecomService.instance.placeCall(call.number),
                              ),
                              IconButton(
                                icon: const Icon(Icons.info_outline, color: Color(0xFFA49691), size: 20),
                                onPressed: () {
                                  Navigator.push(
                                    context,
                                    MaterialPageRoute(
                                      builder: (_) => ContactDetailScreen(
                                        contact: PhoneContact(id: call.id, name: call.name, number: call.number),
                                      ),
                                    ),
                                  );
                                },
                              ),
                            ],
                          ),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildChip(String label) {
    final isSelected = _selectedFilter == label;
    return GestureDetector(
      onTap: () => setState(() => _selectedFilter = label),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 7),
        decoration: BoxDecoration(
          color: isSelected ? const Color(0xFF382923) : const Color(0xFF28231F),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: isSelected ? const Color(0xFF5BB974) : const Color(0xFF382923)),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 13,
            fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400,
            color: isSelected ? const Color(0xFF5BB974) : const Color(0xFFA49691),
          ),
        ),
      ),
    );
  }
}
