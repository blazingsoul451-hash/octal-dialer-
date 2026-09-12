import 'package:flutter/material.dart';
import '../../widgets/octal_logo.dart';
import '../../models/phone_models.dart';
import '../../services/phone_data_service.dart';
import '../../services/telecom_service.dart';
import 'contact_detail_screen.dart';

class PhoneContactsView extends StatefulWidget {
  const PhoneContactsView({super.key});

  @override
  State<PhoneContactsView> createState() => _PhoneContactsViewState();
}

class _PhoneContactsViewState extends State<PhoneContactsView> {
  final TextEditingController _searchController = TextEditingController();
  final PhoneDataService _dataService = PhoneDataService.instance;
  String _searchQuery = '';

  @override
  Widget build(BuildContext context) {
    final contacts = _searchQuery.isNotEmpty
        ? _dataService.searchContacts(_searchQuery)
        : _dataService.contacts;

    // Group contacts by first letter
    final Map<String, List<PhoneContact>> grouped = {};
    for (var c in contacts) {
      final letter = c.name.isNotEmpty ? c.name[0].toUpperCase() : '#';
      grouped.putIfAbsent(letter, () => []).add(c);
    }
    final sortedKeys = grouped.keys.toList()..sort();

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
          'Contacts',
          style: TextStyle(fontFamily: 'Ubuntu', fontSize: 17, fontWeight: FontWeight.bold, color: Colors.white),
        ),
        centerTitle: true,
      ),
      body: SafeArea(
        child: Column(
          children: [
            // Search Input
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
              child: Container(
                height: 46,
                decoration: BoxDecoration(
                  color: OctalColors.surfaceCard,
                  borderRadius: BorderRadius.circular(23.0),
                  border: Border.all(color: OctalColors.border, width: 1.2),
                ),
                child: Row(
                  children: [
                    const SizedBox(width: 14),
                    const Icon(Icons.search_rounded, color: OctalColors.textSecondary, size: 20),
                    const SizedBox(width: 10),
                    Expanded(
                      child: TextField(
                        controller: _searchController,
                        onChanged: (val) => setState(() => _searchQuery = val),
                        style: const TextStyle(color: Colors.white, fontSize: 13.5),
                        decoration: const InputDecoration(
                          hintText: 'Search contacts...',
                          hintStyle: TextStyle(color: OctalColors.textMuted, fontSize: 13.0),
                          border: InputBorder.none,
                          isDense: true,
                        ),
                      ),
                    ),
                    if (_searchQuery.isNotEmpty)
                      IconButton(
                        icon: const Icon(Icons.close_rounded, color: OctalColors.textSecondary, size: 18),
                        onPressed: () {
                          _searchController.clear();
                          setState(() => _searchQuery = '');
                        },
                      ),
                  ],
                ),
              ),
            ),

            // Contacts List
            Expanded(
              child: contacts.isEmpty
                  ? const Center(
                      child: Text('No contacts found', style: TextStyle(color: OctalColors.textSecondary)),
                    )
                  : ListView.builder(
                      itemCount: sortedKeys.length,
                      itemBuilder: (ctx, idx) {
                        final key = sortedKeys[idx];
                        final list = grouped[key]!;

                        return Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 20.0, vertical: 6.0),
                              child: Text(
                                key,
                                style: const TextStyle(
                                  color: OctalColors.primaryGold,
                                  fontSize: 13,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                            ...list.map((contact) {
                              return ListTile(
                                contentPadding: const EdgeInsets.symmetric(horizontal: 18.0, vertical: 2.0),
                                leading: CircleAvatar(
                                  radius: 20,
                                  backgroundColor: contact.avatarColor,
                                  child: Text(
                                    contact.initials,
                                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                                  ),
                                ),
                                title: Text(
                                  contact.name,
                                  style: const TextStyle(color: Colors.white, fontSize: 14.5, fontWeight: FontWeight.w600),
                                ),
                                subtitle: Text(
                                  contact.number,
                                  style: const TextStyle(color: OctalColors.textSecondary, fontSize: 12),
                                ),
                                trailing: IconButton(
                                  icon: const Icon(Icons.call_rounded, color: OctalColors.primaryGold, size: 22),
                                  onPressed: () => TelecomService.instance.placeCall(contact.number),
                                ),
                                onTap: () {
                                  Navigator.push(
                                    context,
                                    MaterialPageRoute(
                                      builder: (_) => ContactDetailScreen(contact: contact),
                                    ),
                                  );
                                },
                              );
                            }),
                          ],
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
