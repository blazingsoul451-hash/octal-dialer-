import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../widgets/octal_logo.dart';
import '../../models/phone_models.dart';
import '../../services/phone_data_service.dart';
import '../../services/telecom_service.dart';
import 'create_contact_screen.dart';

class PhoneKeypadView extends StatefulWidget {
  final String initialNumber;
  final Function(String number, int? simSlot)? onCall;

  const PhoneKeypadView({
    super.key,
    this.initialNumber = '',
    this.onCall,
  });

  @override
  State<PhoneKeypadView> createState() => _PhoneKeypadViewState();
}

class _PhoneKeypadViewState extends State<PhoneKeypadView> {
  String _phoneNumber = '';
  final PhoneDataService _dataService = PhoneDataService.instance;

  @override
  void initState() {
    super.initState();
    _phoneNumber = widget.initialNumber;
    if (_dataService.pendingKeypadNumber.value.isNotEmpty) {
      _phoneNumber = _dataService.pendingKeypadNumber.value;
      _dataService.pendingKeypadNumber.value = '';
    }
    _dataService.pendingKeypadNumber.addListener(_onPendingNumberChanged);
    _dataService.loadData();
  }

  void _onPendingNumberChanged() {
    final pending = _dataService.pendingKeypadNumber.value;
    if (pending.isNotEmpty && mounted) {
      setState(() {
        _phoneNumber = pending;
      });
      _dataService.pendingKeypadNumber.value = '';
    }
  }

  @override
  void dispose() {
    _dataService.pendingKeypadNumber.removeListener(_onPendingNumberChanged);
    super.dispose();
  }

  void _onKeyPress(String key) {
    HapticFeedback.lightImpact();
    TelecomService.instance.sendDtmf(key);
    setState(() {
      _phoneNumber += key;
    });
  }

  void _onBackspace() {
    if (_phoneNumber.isNotEmpty) {
      HapticFeedback.selectionClick();
      setState(() {
        _phoneNumber = _phoneNumber.substring(0, _phoneNumber.length - 1);
      });
    }
  }

  void _onClear() {
    if (_phoneNumber.isNotEmpty) {
      HapticFeedback.mediumImpact();
      setState(() {
        _phoneNumber = '';
      });
    }
  }

  void _handleCall([String? directNumber]) {
    final numToCall = (directNumber ?? _phoneNumber).trim();
    if (numToCall.isEmpty) return;
    HapticFeedback.mediumImpact();

    if (widget.onCall != null) {
      widget.onCall!(numToCall, null);
    } else {
      TelecomService.instance.placeCall(numToCall);
    }
  }

  void _openCreateContact() async {
    final result = await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => CreateContactScreen(initialPhoneNumber: _phoneNumber),
      ),
    );
    if (result is PhoneContact) {
      setState(() {});
    }
  }

  void _openAddToContact() {
    showModalBottomSheet(
      context: context,
      backgroundColor: OctalColors.surfaceCard,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => ListView.builder(
        itemCount: _dataService.contacts.length,
        itemBuilder: (ctx, i) {
          final c = _dataService.contacts[i];
          return ListTile(
            leading: CircleAvatar(
              backgroundColor: OctalColors.surfaceElevated,
              child: Text(c.name.isNotEmpty ? c.name[0] : '?', style: const TextStyle(color: Colors.white)),
            ),
            title: Text(c.name, style: const TextStyle(color: Colors.white)),
            subtitle: Text(c.number, style: const TextStyle(color: OctalColors.textSecondary)),
            onTap: () {
              Navigator.pop(ctx);
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text('Added $_phoneNumber to ${c.name}')),
              );
            },
          );
        },
      ),
    );
  }

  void _sendMessage() async {
    const channel = MethodChannel('com.octal.dialer/call');
    try {
      await channel.invokeMethod('openSms', {'phoneNumber': _phoneNumber});
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Composing SMS to $_phoneNumber')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    // Dynamic real-time T9 & numeric filtering
    final suggestions = _phoneNumber.isEmpty
        ? _dataService.contacts.take(4).toList()
        : _dataService.searchContacts(_phoneNumber);

    return Scaffold(
      backgroundColor: OctalColors.bgDark,
      body: SafeArea(
        child: Column(
          children: [
            // 1. Top Section: Suggested / Matching Contacts & Quick Actions (media_1789167955710.jpg)
            Expanded(
              child: ListView(
                padding: const EdgeInsets.only(top: 8, bottom: 4),
                children: [
                  if (_phoneNumber.isEmpty) ...[
                    const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 16.0, vertical: 6.0),
                      child: Text(
                        'Suggested',
                        style: TextStyle(
                          fontSize: 13.5,
                          fontWeight: FontWeight.w600,
                          color: OctalColors.textSecondary,
                        ),
                      ),
                    ),
                    ...suggestions.map((contact) => _buildSuggestedContactRow(contact)),
                  ] else ...[
                    // Matching contacts with highlighted digits
                    ...suggestions.map((contact) => _buildMatchingContactRow(contact)),

                    const SizedBox(height: 12),

                    // Quick Action 1: + Create new contact
                    _buildQuickActionRow(
                      icon: Icons.person_add_outlined,
                      label: 'Create new contact',
                      onTap: _openCreateContact,
                    ),

                    // Quick Action 2: + Add to a contact
                    _buildQuickActionRow(
                      icon: Icons.person_add_alt_1_outlined,
                      label: 'Add to a contact',
                      onTap: _openAddToContact,
                    ),

                    // Quick Action 3: 💬 Send a message
                    _buildQuickActionRow(
                      icon: Icons.chat_bubble_outline_rounded,
                      label: 'Send a message',
                      onTap: _sendMessage,
                    ),

                    const SizedBox(height: 8),
                  ],
                ],
              ),
            ),

            // 2. Keypad Sheet Overlay (Matching media_1789167955710.jpg)
            Container(
              decoration: const BoxDecoration(
                color: Color(0xFF231F1C),
                borderRadius: BorderRadius.vertical(top: Radius.circular(26)),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black45,
                    offset: Offset(0, -4),
                    blurRadius: 16,
                  ),
                ],
              ),
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 8),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Keypad Header: [ ⋮   0300   [⌫] ]
                  SizedBox(
                    height: 52,
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        IconButton(
                          icon: const Icon(Icons.more_vert_rounded, color: OctalColors.textSecondary, size: 22),
                          onPressed: () {},
                        ),
                        Expanded(
                          child: Text(
                            _phoneNumber,
                            textAlign: TextAlign.center,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 32,
                              fontWeight: FontWeight.w400,
                              color: Colors.white,
                              letterSpacing: 1.0,
                            ),
                          ),
                        ),
                        if (_phoneNumber.isNotEmpty)
                          GestureDetector(
                            onTap: _onBackspace,
                            onLongPress: _onClear,
                            behavior: HitTestBehavior.opaque,
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(16),
                                border: Border.all(color: OctalColors.fieldBorder, width: 1.2),
                              ),
                              child: const Icon(
                                Icons.backspace_outlined,
                                color: Colors.white,
                                size: 18,
                              ),
                            ),
                          )
                        else
                          const SizedBox(width: 44),
                      ],
                    ),
                  ),

                  const SizedBox(height: 8),

                  // Keypad Grid: 4 rows of 3 horizontal stadium pills
                  _buildKeypadRow([
                    _KeyData('1', '➿'),
                    _KeyData('2', 'ABC'),
                    _KeyData('3', 'DEF'),
                  ]),
                  const SizedBox(height: 10),
                  _buildKeypadRow([
                    _KeyData('4', 'GHI'),
                    _KeyData('5', 'JKL'),
                    _KeyData('6', 'MNO'),
                  ]),
                  const SizedBox(height: 10),
                  _buildKeypadRow([
                    _KeyData('7', 'PQRS'),
                    _KeyData('8', 'TUV'),
                    _KeyData('9', 'WXYZ'),
                  ]),
                  const SizedBox(height: 10),
                  _buildKeypadRow([
                    _KeyData('*', ''),
                    _KeyData('0', '+'),
                    _KeyData('#', ''),
                  ]),

                  const SizedBox(height: 14),

                  // Green Pill Call Button: [ 📞 Call ]
                  GestureDetector(
                    onTap: () => _handleCall(),
                    child: Container(
                      height: 52,
                      width: 140,
                      decoration: BoxDecoration(
                        color: OctalColors.callGreen,
                        borderRadius: BorderRadius.circular(26),
                      ),
                      child: const Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.phone_rounded, color: Colors.black, size: 20),
                          SizedBox(width: 8),
                          Text(
                            'Call',
                            style: TextStyle(
                              color: Colors.black,
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.3,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),

                  const SizedBox(height: 4),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSuggestedContactRow(PhoneContact contact) {
    final initial = contact.name.isNotEmpty ? contact.name[0].toUpperCase() : '?';
    Color avatarBg;
    if (initial == 'B') {
      avatarBg = const Color(0xFF8B2522);
    } else if (initial == 'N') {
      avatarBg = const Color(0xFF1E6B47);
    } else if (initial == 'S') {
      avatarBg = const Color(0xFF8B2522);
    } else {
      avatarBg = const Color(0xFF3E3732);
    }

    return InkWell(
      onTap: () {
        setState(() {
          _phoneNumber = contact.number;
        });
      },
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 10.0),
        child: Row(
          children: [
            CircleAvatar(
              radius: 20,
              backgroundColor: avatarBg,
              child: initial == '?'
                  ? const Icon(Icons.person, color: OctalColors.textSecondary, size: 20)
                  : Text(
                      initial,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    contact.name,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'Mobile ${contact.number}',
                    style: const TextStyle(
                      color: OctalColors.textSecondary,
                      fontSize: 12.5,
                    ),
                  ),
                ],
              ),
            ),
            IconButton(
              icon: const Icon(
                Icons.phone_outlined,
                color: OctalColors.textSecondary,
                size: 20,
              ),
              onPressed: () => _handleCall(contact.number),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMatchingContactRow(PhoneContact contact) {
    return InkWell(
      onTap: () {
        setState(() {
          _phoneNumber = contact.number;
        });
      },
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 10.0),
        child: Row(
          children: [
            const CircleAvatar(
              radius: 20,
              backgroundColor: Color(0xFF3E3732),
              child: Icon(Icons.person, color: OctalColors.textSecondary, size: 20),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildHighlightedNumber(contact.number, _phoneNumber),
                  const SizedBox(height: 2),
                  Text(
                    '${contact.name} • Mon 2:12 am',
                    style: const TextStyle(
                      color: OctalColors.textSecondary,
                      fontSize: 12.5,
                    ),
                  ),
                ],
              ),
            ),
            IconButton(
              icon: const Icon(
                Icons.phone_outlined,
                color: OctalColors.textSecondary,
                size: 20,
              ),
              onPressed: () => _handleCall(contact.number),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHighlightedNumber(String fullNumber, String query) {
    final cleanQuery = query.replaceAll(RegExp(r'[^0-9+]'), '');
    final cleanFull = fullNumber.replaceAll(RegExp(r'[^0-9+]'), '');

    final matchIndex = cleanFull.indexOf(cleanQuery);
    if (matchIndex == -1 || cleanQuery.isEmpty) {
      return Text(
        fullNumber,
        style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w600),
      );
    }

    final matchEnd = matchIndex + cleanQuery.length;
    final before = cleanFull.substring(0, matchIndex);
    final matched = cleanFull.substring(matchIndex, matchEnd);
    final after = cleanFull.substring(matchEnd);

    return RichText(
      text: TextSpan(
        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        children: [
          if (before.isNotEmpty)
            TextSpan(text: '$before ', style: const TextStyle(color: Colors.white)),
          TextSpan(text: matched, style: const TextStyle(color: OctalColors.coralAccent)),
          if (after.isNotEmpty)
            TextSpan(text: ' $after', style: const TextStyle(color: Colors.white)),
        ],
      ),
    );
  }

  Widget _buildQuickActionRow({
    required IconData icon,
    required String label,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 12.0),
        child: Row(
          children: [
            Icon(icon, color: OctalColors.coralAccent, size: 22),
            const SizedBox(width: 16),
            Text(
              label,
              style: const TextStyle(
                color: OctalColors.coralAccent,
                fontSize: 15,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildKeypadRow(List<_KeyData> keys) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
      children: keys.map((key) => _buildKeypadButton(key)).toList(),
    );
  }

  Widget _buildKeypadButton(_KeyData data) {
    return GestureDetector(
      onTap: () => _onKeyPress(data.digit),
      onLongPress: () {
        if (data.digit == '0') {
          _onKeyPress('+');
        } else if (data.digit == '1') {
          _handleCall('*123#');
        }
      },
      behavior: HitTestBehavior.opaque,
      child: Container(
        width: 104,
        height: 52,
        decoration: BoxDecoration(
          color: const Color(0xFF2C2723),
          borderRadius: BorderRadius.circular(26),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              data.digit,
              style: const TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w500,
                color: Colors.white,
                height: 1.1,
              ),
            ),
            if (data.letters.isNotEmpty)
              Text(
                data.letters,
                style: const TextStyle(
                  fontSize: 9.5,
                  fontWeight: FontWeight.w600,
                  color: OctalColors.textSecondary,
                  letterSpacing: 0.8,
                  height: 1.0,
                ),
              )
            else
              const SizedBox(height: 2),
          ],
        ),
      ),
    );
  }
}

class _KeyData {
  final String digit;
  final String letters;

  _KeyData(this.digit, this.letters);
}
