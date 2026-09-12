import 'package:flutter/material.dart';
import '../../widgets/octal_logo.dart';
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

  @override
  Widget build(BuildContext context) {
    final calls = _dataService.filterRecentCalls(_selectedFilter);

    return Scaffold(
      backgroundColor: OctalColors.bgDark,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, color: Colors.white, size: 20),
          onPressed: () => Navigator.pop(context),
        ),
        title: const Text(
          'Call History',
          style: TextStyle(fontFamily: 'Ubuntu', fontSize: 17, fontWeight: FontWeight.bold, color: Colors.white),
        ),
        centerTitle: true,
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
                      child: Text('No call logs in this category', style: TextStyle(color: OctalColors.textSecondary)),
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
                            dirColor = const Color(0xFF38BDF8);
                            break;
                          case CallDirection.missed:
                          case CallDirection.rejected:
                            dirIcon = Icons.call_missed_rounded;
                            dirColor = OctalColors.error;
                            break;
                          case CallDirection.blocked:
                            dirIcon = Icons.block_rounded;
                            dirColor = Colors.grey;
                            break;
                          case CallDirection.incoming:
                          default:
                            dirIcon = Icons.call_received_rounded;
                            dirColor = OctalColors.success;
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
                              color: isMissed ? OctalColors.error : Colors.white,
                              fontSize: 14.5,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          subtitle: Row(
                            children: [
                              Icon(dirIcon, size: 13, color: dirColor),
                              const SizedBox(width: 4),
                              Text(call.formattedTime, style: const TextStyle(color: OctalColors.textSecondary, fontSize: 11.5)),
                              if (call.simName != null) ...[
                                const SizedBox(width: 6),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                                  decoration: BoxDecoration(
                                    color: OctalColors.purpleSim.withOpacity(0.2),
                                    borderRadius: BorderRadius.circular(4),
                                    border: Border.all(color: OctalColors.purpleSim.withOpacity(0.4), width: 0.8),
                                  ),
                                  child: Text(
                                    call.simName!,
                                    style: const TextStyle(fontSize: 9.5, color: Color(0xFFC4B5FD), fontWeight: FontWeight.bold),
                                  ),
                                ),
                              ],
                            ],
                          ),
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              IconButton(
                                icon: const Icon(Icons.call_rounded, color: Colors.white, size: 20),
                                onPressed: () => TelecomService.instance.placeCall(call.number),
                              ),
                              IconButton(
                                icon: const Icon(Icons.info_outline_rounded, color: OctalColors.textSecondary, size: 20),
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
          color: isSelected ? OctalColors.primaryGold : OctalColors.surfaceCard,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: isSelected ? OctalColors.primaryGold : OctalColors.border),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12.5,
            fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
            color: isSelected ? Colors.black : Colors.white,
          ),
        ),
      ),
    );
  }
}
