import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../widgets/octal_logo.dart';
import '../../models/phone_models.dart';
import '../../services/phone_data_service.dart';
import '../../services/telecom_service.dart';
import 'phone_contacts_view.dart';
import 'create_contact_screen.dart';

class PhoneHomeTab extends StatefulWidget {
  final Function(String number, int? simSlot)? onDirectCall;
  final VoidCallback? onOpenKeypad;

  const PhoneHomeTab({
    super.key,
    this.onDirectCall,
    this.onOpenKeypad,
  });

  @override
  State<PhoneHomeTab> createState() => _PhoneHomeTabState();
}

class _PhoneHomeTabState extends State<PhoneHomeTab> {
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();
  final TextEditingController _searchController = TextEditingController();
  final PhoneDataService _dataService = PhoneDataService.instance;

  String _selectedFilter = 'All';
  String _searchQuery = '';
  bool _isFavouritesExpanded = true;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    await _dataService.loadData();
    if (mounted) {
      setState(() {});
    }
  }

  void _callNumber(String number) {
    HapticFeedback.mediumImpact();
    if (widget.onDirectCall != null) {
      widget.onDirectCall!(number, null);
    } else {
      TelecomService.instance.placeCall(number);
    }
  }

  void _openCreateContact() async {
    await Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const CreateContactScreen()),
    );
    _loadData();
  }

  Offset _lastTapPosition = Offset.zero;

  void _showContactContextMenu(BuildContext context, String number, String? callId) {
    HapticFeedback.lightImpact();
    final screenSize = MediaQuery.of(context).size;
    const double popupWidth = 238.0;
    const double popupHeight = 210.0;

    // Position on right side of screen as shown in screenshot
    final double left = (screenSize.width - popupWidth - 18).clamp(16.0, screenSize.width - popupWidth - 18);

    // Position vertically around tap position
    double top = _lastTapPosition.dy - 30;
    if (top + popupHeight > screenSize.height - 70) {
      top = screenSize.height - popupHeight - 70;
    }
    if (top < 90) {
      top = 90;
    }

    showGeneralDialog(
      context: context,
      barrierDismissible: true,
      barrierLabel: 'Dismiss',
      barrierColor: Colors.black.withOpacity(0.35),
      transitionDuration: const Duration(milliseconds: 140),
      pageBuilder: (dialogCtx, anim1, anim2) {
        return Stack(
          children: [
            Positioned(
              left: left,
              top: top,
              width: popupWidth,
              child: FadeTransition(
                opacity: anim1,
                child: ScaleTransition(
                  scale: Tween<double>(begin: 0.92, end: 1.0).animate(
                    CurvedAnimation(parent: anim1, curve: Curves.easeOutCubic),
                  ),
                  alignment: Alignment.topRight,
                  child: Material(
                    color: Colors.transparent,
                    child: Container(
                      decoration: BoxDecoration(
                        color: const Color(0xFF28231F),
                        borderRadius: BorderRadius.circular(16),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withOpacity(0.6),
                            blurRadius: 24,
                            spreadRadius: 2,
                            offset: const Offset(0, 8),
                          ),
                        ],
                      ),
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Padding(
                            padding: const EdgeInsets.only(left: 4.0, bottom: 12.0),
                            child: Text(
                              number,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 14.5,
                                fontWeight: FontWeight.w600,
                                letterSpacing: 0.2,
                              ),
                            ),
                          ),
                          _buildContextMenuItem(
                            icon: Icons.copy_rounded,
                            label: 'Copy number',
                            onTap: () {
                              Navigator.pop(dialogCtx);
                              _copyNumber(number);
                            },
                          ),
                          _buildContextMenuItem(
                            icon: Icons.edit_outlined,
                            label: 'Edit number before call',
                            onTap: () {
                              Navigator.pop(dialogCtx);
                              _editNumberBeforeCall(number);
                            },
                          ),
                          _buildContextMenuItem(
                            icon: Icons.error_outline_rounded,
                            label: 'Block or report',
                            onTap: () {
                              Navigator.pop(dialogCtx);
                              _showBlockDialog(number);
                            },
                          ),
                          _buildContextMenuItem(
                            icon: Icons.delete_outline_rounded,
                            label: 'Delete',
                            onTap: () {
                              Navigator.pop(dialogCtx);
                              _deleteCallLog(callId, number);
                            },
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _buildContextMenuItem({
    required IconData icon,
    required String label,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8.0, horizontal: 4.0),
        child: Row(
          children: [
            Icon(icon, color: Colors.white, size: 20),
            const SizedBox(width: 14),
            Expanded(
              child: Text(
                label,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 13.5,
                  fontWeight: FontWeight.w400,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _copyNumber(String number) {
    Clipboard.setData(ClipboardData(text: number));
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('$number copied to clipboard'),
        duration: const Duration(seconds: 2),
        backgroundColor: const Color(0xFF28231F),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    );
  }

  void _editNumberBeforeCall(String number) {
    _dataService.pendingKeypadNumber.value = number;
    if (widget.onOpenKeypad != null) {
      widget.onOpenKeypad!();
    }
  }

  void _showBlockDialog(String number) {
    showDialog(
      context: context,
      builder: (ctx) {
        bool reportSpam = true;
        return StatefulBuilder(
          builder: (context, setDlgState) {
            return AlertDialog(
              backgroundColor: const Color(0xFF28231F),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
              title: const Text(
                'Block or report number?',
                style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
              ),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'You will no longer receive calls or messages from $number.',
                    style: const TextStyle(color: OctalColors.textSecondary, fontSize: 13.5),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Checkbox(
                        value: reportSpam,
                        activeColor: OctalColors.coralAccent,
                        checkColor: Colors.black,
                        onChanged: (val) => setDlgState(() => reportSpam = val ?? false),
                      ),
                      const Text('Report call as spam', style: TextStyle(color: Colors.white, fontSize: 13)),
                    ],
                  ),
                ],
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(ctx),
                  child: const Text('Cancel', style: TextStyle(color: OctalColors.textSecondary)),
                ),
                TextButton(
                  onPressed: () {
                    _dataService.blockNumber(number);
                    Navigator.pop(ctx);
                    setState(() {});
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text('$number blocked'),
                        backgroundColor: const Color(0xFF28231F),
                        behavior: SnackBarBehavior.floating,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      ),
                    );
                  },
                  child: const Text('Block', style: TextStyle(color: Colors.redAccent, fontWeight: FontWeight.bold)),
                ),
              ],
            );
          },
        );
      },
    );
  }

  void _deleteCallLog(String? callId, String number) {
    if (callId != null) {
      _dataService.deleteCallLog(callId);
    }
    setState(() {});
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Call log deleted'),
        backgroundColor: Color(0xFF28231F),
        behavior: SnackBarBehavior.floating,
        duration: Duration(seconds: 2),
      ),
    );
  }

  String _formatCallTime(DateTime ts, String number, String name) {
    final now = DateTime.now();
    final diff = now.difference(ts);
    String timeStr;
    if (diff.inMinutes < 60) {
      timeStr = '${diff.inMinutes.clamp(1, 59)} min ago';
    } else if (diff.inHours < 24 && ts.day == now.day) {
      timeStr = '${diff.inHours} hr ago';
    } else if (diff.inDays == 1 || (diff.inHours < 48 && ts.day == now.subtract(const Duration(days: 1)).day)) {
      timeStr = 'Yesterday';
    } else {
      timeStr = '${ts.day}/${ts.month}';
    }

    final isRawNumber = name == number || name.replaceAll(RegExp(r'[^0-9]'), '') == number.replaceAll(RegExp(r'[^0-9]'), '');
    final prefix = isRawNumber ? 'Pakistan' : 'Mobile';
    return '$prefix • $timeStr';
  }

  @override
  Widget build(BuildContext context) {
    final filteredRecents = _dataService.filterRecentCalls(_selectedFilter);
    final searchMatches = _searchQuery.isNotEmpty ? _dataService.searchContacts(_searchQuery) : [];

    // Grouping by Today vs Yesterday
    final now = DateTime.now();
    final todayCalls = filteredRecents.where((c) {
      final diff = now.difference(c.timestamp);
      return diff.inHours < 24 && c.timestamp.day == now.day;
    }).toList();
    final yesterdayCalls = filteredRecents.where((c) => !todayCalls.contains(c)).toList();

    return Scaffold(
      key: _scaffoldKey,
      backgroundColor: OctalColors.bgDark,
      drawer: _buildSideDrawer(),
      body: SafeArea(
        child: RefreshIndicator(
          color: OctalColors.coralAccent,
          backgroundColor: OctalColors.surfaceCard,
          onRefresh: _loadData,
          child: ListView(
            padding: const EdgeInsets.only(bottom: 24),
            children: [
              const SizedBox(height: 8),

              // 1. Top Stock Search Bar: [ ≡  Search contacts       🎙 ]
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14.0),
                child: Container(
                  height: 48,
                  decoration: BoxDecoration(
                    color: OctalColors.surfaceCard,
                    borderRadius: BorderRadius.circular(28.0),
                  ),
                  child: Row(
                    children: [
                      const SizedBox(width: 4),
                      IconButton(
                        icon: const Icon(Icons.menu_rounded, color: OctalColors.textSecondary, size: 22),
                        onPressed: () {
                          _scaffoldKey.currentState?.openDrawer();
                        },
                      ),
                      const SizedBox(width: 4),
                      Expanded(
                        child: TextField(
                          controller: _searchController,
                          onChanged: (val) => setState(() => _searchQuery = val),
                          style: const TextStyle(color: Colors.white, fontSize: 14.5),
                          decoration: const InputDecoration(
                            hintText: 'Search contacts',
                            hintStyle: TextStyle(color: OctalColors.textSecondary, fontSize: 14.5),
                            border: InputBorder.none,
                            isDense: true,
                            contentPadding: EdgeInsets.zero,
                          ),
                        ),
                      ),
                      if (_searchQuery.isNotEmpty)
                        IconButton(
                          icon: const Icon(Icons.close_rounded, color: OctalColors.textSecondary, size: 20),
                          onPressed: () {
                            _searchController.clear();
                            setState(() => _searchQuery = '');
                          },
                        )
                      else
                        const Padding(
                          padding: EdgeInsets.only(right: 14),
                          child: Icon(Icons.mic_none_rounded, color: OctalColors.textSecondary, size: 22),
                        ),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 12),

              // 2. Filter Pills matching media_1789167955724.jpg
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14.0),
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      _buildFilterChip('All'),
                      const SizedBox(width: 8),
                      _buildFilterChip('Contacts'),
                      const SizedBox(width: 8),
                      _buildFilterChip('Non-spam'),
                      const SizedBox(width: 8),
                      _buildFilterChip('Spam'),
                      const SizedBox(width: 8),
                      _buildFilterChip('Recordings'),
                      const SizedBox(width: 8),
                      _buildFilterChip('Missed'),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 16),

              // Search results or Normal Home Feed
              if (_searchQuery.isNotEmpty) ...[
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 6.0),
                  child: Text(
                    'Matching Contacts (${searchMatches.length})',
                    style: const TextStyle(color: OctalColors.textSecondary, fontSize: 13, fontWeight: FontWeight.w600),
                  ),
                ),
                ...searchMatches.map((c) => _buildContactSearchRow(c)),
              ] else ...[
                // 3. Favourites Header + Row
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16.0),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      GestureDetector(
                        onTap: () {
                          setState(() {
                            _isFavouritesExpanded = !_isFavouritesExpanded;
                          });
                        },
                        behavior: HitTestBehavior.opaque,
                        child: Row(
                          children: [
                            const Text(
                              'Favourites',
                              style: TextStyle(
                                fontSize: 14.5,
                                fontWeight: FontWeight.w600,
                                color: Colors.white,
                              ),
                            ),
                            const SizedBox(width: 4),
                            Icon(
                              _isFavouritesExpanded
                                  ? Icons.keyboard_arrow_up_rounded
                                  : Icons.keyboard_arrow_down_rounded,
                              color: OctalColors.textSecondary,
                              size: 20,
                            ),
                          ],
                        ),
                      ),
                      GestureDetector(
                        onTap: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(builder: (_) => const PhoneContactsView()),
                          );
                        },
                        child: const Text(
                          'View contacts',
                          style: TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w600,
                            color: OctalColors.textSecondary,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),

                if (_isFavouritesExpanded) ...[
                  const SizedBox(height: 12),
                  SizedBox(
                    height: 98,
                    child: ListView(
                      scrollDirection: Axis.horizontal,
                      padding: const EdgeInsets.symmetric(horizontal: 14.0),
                      children: [
                        ..._dataService.favorites.map((contact) => _buildFavoriteItem(contact)),
                        _buildAddFavoriteButton(),
                      ],
                    ),
                  ),
                ],

                const SizedBox(height: 14),

                // 4. Section: 'Today'
                if (todayCalls.isNotEmpty) ...[
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 16.0, vertical: 6.0),
                    child: Text(
                      'Today',
                      style: TextStyle(
                        fontSize: 13.5,
                        fontWeight: FontWeight.w600,
                        color: OctalColors.textSecondary,
                      ),
                    ),
                  ),
                  ...todayCalls.map((call) => _buildRecentCallRow(call)),
                  const SizedBox(height: 8),
                ],

                // 5. Section: 'Yesterday'
                const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 16.0, vertical: 6.0),
                  child: Text(
                    'Yesterday',
                    style: TextStyle(
                      fontSize: 13.5,
                      fontWeight: FontWeight.w600,
                      color: OctalColors.textSecondary,
                    ),
                  ),
                ),
                ...yesterdayCalls.map((call) => _buildRecentCallRow(call)),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSideDrawer() {
    return Drawer(
      backgroundColor: const Color(0xFF1F1C19),
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(24, 28, 24, 16),
              child: Text(
                'Phone',
                style: TextStyle(
                  fontSize: 26,
                  fontWeight: FontWeight.w500,
                  color: Colors.white,
                ),
              ),
            ),
            _buildDrawerItem(
              icon: Icons.people_outline_rounded,
              title: 'Contacts',
              onTap: () {
                Navigator.pop(context);
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const PhoneContactsView()),
                );
              },
            ),
            _buildDrawerItem(
              icon: Icons.settings_outlined,
              title: 'Settings',
              onTap: () {
                Navigator.pop(context);
              },
            ),
            _buildDrawerItem(
              icon: Icons.history_toggle_off_rounded,
              title: 'Clear call history',
              onTap: () {
                Navigator.pop(context);
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Call history cleared')),
                );
              },
            ),
            _buildDrawerItem(
              icon: Icons.help_outline_rounded,
              title: 'Help and feedback',
              onTap: () {
                Navigator.pop(context);
              },
            ),
            const Spacer(),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 16.0),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                decoration: BoxDecoration(
                  color: const Color(0xFF2B2622),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: const Text(
                  'Google speech services converts audio to text and shares the text with this app...',
                  style: TextStyle(color: OctalColors.textSecondary, fontSize: 12, height: 1.3),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDrawerItem({
    required IconData icon,
    required String title,
    required VoidCallback onTap,
  }) {
    return ListTile(
      leading: Icon(icon, color: Colors.white, size: 24),
      title: Text(
        title,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 15,
          fontWeight: FontWeight.w500,
        ),
      ),
      onTap: onTap,
      contentPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 2),
    );
  }

  Widget _buildFilterChip(String label) {
    final bool isSelected = _selectedFilter == label;

    return GestureDetector(
      onTap: () {
        HapticFeedback.selectionClick();
        setState(() {
          _selectedFilter = label;
        });
      },
      behavior: HitTestBehavior.opaque,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected ? OctalColors.pillActive : OctalColors.surfaceCard,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 13,
            fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
            color: isSelected ? Colors.white : OctalColors.textSecondary,
          ),
        ),
      ),
    );
  }

  Widget _buildFavoriteItem(PhoneContact contact) {
    final initial = contact.name.isNotEmpty ? contact.name[0].toUpperCase() : '?';
    Color avatarColor;
    if (initial == 'A') {
      avatarColor = const Color(0xFF1E6B47); // green
    } else if (initial == 'D') {
      avatarColor = const Color(0xFF12635B); // teal
    } else if (initial == 'F') {
      avatarColor = const Color(0xFF7D431D); // brown
    } else {
      avatarColor = const Color(0xFF8C3A27); // rust
    }

    return GestureDetector(
      onTapDown: (details) => _lastTapPosition = details.globalPosition,
      onTap: () => _callNumber(contact.number),
      onLongPress: () => _showContactContextMenu(context, contact.number, contact.id),
      child: Container(
        width: 76,
        margin: const EdgeInsets.only(right: 12),
        child: Column(
          children: [
            CircleAvatar(
              radius: 26,
              backgroundColor: avatarColor,
              child: Text(
                initial,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            const SizedBox(height: 6),
            Text(
              contact.name,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 11,
                height: 1.2,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAddFavoriteButton() {
    return GestureDetector(
      onTap: _openCreateContact,
      child: Container(
        width: 68,
        margin: const EdgeInsets.only(right: 12),
        child: const Column(
          children: [
            CircleAvatar(
              radius: 26,
              backgroundColor: OctalColors.surfaceCard,
              child: Icon(
                Icons.person_add_outlined,
                color: OctalColors.textSecondary,
                size: 22,
              ),
            ),
            SizedBox(height: 6),
            Text(
              'Add',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: OctalColors.textSecondary,
                fontSize: 11,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildRecentCallRow(PhoneRecentCall call, {String? customTime}) {
    final initial = call.name.isNotEmpty ? call.name[0].toUpperCase() : '?';
    Color avatarBg;
    if (initial == 'B') {
      avatarBg = const Color(0xFF8B2522);
    } else if (initial == 'O') {
      avatarBg = const Color(0xFF8C5325);
    } else if (initial == 'T') {
      avatarBg = const Color(0xFF8B2522);
    } else if (initial == 'N') {
      avatarBg = const Color(0xFF1E6B47);
    } else {
      avatarBg = OctalColors.surfaceElevated;
    }

    // Direction arrow and text
    IconData directionIcon;
    Color directionColor;
    if (call.direction == CallDirection.missed || call.direction == CallDirection.rejected) {
      directionIcon = Icons.call_missed_rounded;
      directionColor = Colors.redAccent;
    } else if (call.direction == CallDirection.incoming) {
      directionIcon = Icons.call_received_rounded;
      directionColor = OctalColors.textSecondary;
    } else {
      directionIcon = Icons.call_made_rounded;
      directionColor = OctalColors.textSecondary;
    }

    final subtitleText = customTime != null ? 'Mobile • $customTime' : _formatCallTime(call.timestamp, call.number, call.name);

    return InkWell(
      onTapDown: (details) => _lastTapPosition = details.globalPosition,
      onTap: () => _showContactContextMenu(context, call.number, call.id),
      onLongPress: () => _showContactContextMenu(context, call.number, call.id),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 11.0),
        child: Row(
          children: [
            // Avatar
            CircleAvatar(
              radius: 22,
              backgroundColor: avatarBg,
              child: Text(
                initial,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 17,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
            const SizedBox(width: 14),

            // Name & Info
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    call.name,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Row(
                    children: [
                      Icon(directionIcon, size: 14, color: directionColor),
                      const SizedBox(width: 4),
                      Text(
                        subtitleText,
                        style: const TextStyle(
                          color: OctalColors.textSecondary,
                          fontSize: 12.5,
                        ),
                      ),
                    ],
                  ),
                  if (call.simName != null && call.simName!.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      call.simName!,
                      style: const TextStyle(
                        color: OctalColors.purpleSim,
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.4,
                      ),
                    ),
                  ],
                ],
              ),
            ),

            // Call handset button on right
            IconButton(
              icon: const Icon(
                Icons.phone_outlined,
                color: OctalColors.textSecondary,
                size: 21,
              ),
              onPressed: () => _callNumber(call.number),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildContactSearchRow(PhoneContact contact) {
    final initial = contact.name.isNotEmpty ? contact.name[0].toUpperCase() : '?';

    return InkWell(
      onTapDown: (details) => _lastTapPosition = details.globalPosition,
      onTap: () => _showContactContextMenu(context, contact.number, contact.id),
      onLongPress: () => _showContactContextMenu(context, contact.number, contact.id),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 10.0),
        child: Row(
          children: [
            CircleAvatar(
              radius: 20,
              backgroundColor: OctalColors.surfaceElevated,
              child: Text(
                initial,
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    contact.name,
                    style: const TextStyle(color: Colors.white, fontSize: 14.5, fontWeight: FontWeight.w600),
                  ),
                  Text(
                    contact.number,
                    style: const TextStyle(color: OctalColors.textSecondary, fontSize: 12.5),
                  ),
                ],
              ),
            ),
            IconButton(
              icon: const Icon(Icons.phone_outlined, color: OctalColors.textSecondary, size: 20),
              onPressed: () => _callNumber(contact.number),
            ),
          ],
        ),
      ),
    );
  }
}
