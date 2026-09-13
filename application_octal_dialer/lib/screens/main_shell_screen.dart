import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../widgets/octal_logo.dart';
import '../services/telecom_service.dart';
import '../services/phone_data_service.dart';
import 'phone/phone_home_tab.dart';
import 'phone/phone_keypad_view.dart';
import 'auto_dialer/auto_dialer_tab.dart';
import 'calling/incoming_call_screen.dart';
import 'calling/shared_in_call_screen.dart';

class MainShellScreen extends StatefulWidget {
  final int initialTabIndex;

  const MainShellScreen({
    super.key,
    this.initialTabIndex = 0,
  });

  @override
  State<MainShellScreen> createState() => _MainShellScreenState();
}

class _MainShellScreenState extends State<MainShellScreen> {
  late int _currentIndex;
  StreamSubscription<TelecomCallEvent>? _telecomSub;
  bool _isCallScreenActive = false;

  @override
  void initState() {
    super.initState();
    _currentIndex = widget.initialTabIndex.clamp(0, 2);
    TelecomService.instance.reinitialize();
    _listenToTelecomEvents();
  }

  @override
  void dispose() {
    _telecomSub?.cancel();
    super.dispose();
  }

  void _listenToTelecomEvents() {
    TelecomService.instance.getInCallDetails().then((details) {
      if (details != null && mounted && !_isCallScreenActive && !TelecomService.instance.isAutoDialerCallActive) {
        final isIncoming = details['isIncoming'] == true;
        final phone = details['phoneNumber']?.toString() ?? '';
        final name = details['displayName']?.toString() ?? '';
        _isCallScreenActive = true;
        if (isIncoming) {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => IncomingCallScreen(
                phoneNumber: phone,
                callerName: name,
              ),
            ),
          ).then((_) {
            _isCallScreenActive = false;
          });
        } else {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => SharedInCallScreen(
                phoneNumber: phone,
                contactName: name,
              ),
            ),
          ).then((_) {
            _isCallScreenActive = false;
          });
        }
      }
    });

    _telecomSub = TelecomService.instance.callEvents.listen((event) {
      if (!mounted) return;

      // Only show foreground InCallScreen if not already active and not handled by Auto Dialer CallingScreen
      if (event.type == 'added' && !_isCallScreenActive && !TelecomService.instance.isAutoDialerCallActive) {
        _isCallScreenActive = true;
        final resolvedName = PhoneDataService.instance.getContactNameForNumber(event.phoneNumber) ?? '';
        if (event.isIncoming) {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => IncomingCallScreen(
                phoneNumber: event.phoneNumber,
                callerName: resolvedName,
              ),
            ),
          ).then((_) {
            _isCallScreenActive = false;
          });
        } else {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => SharedInCallScreen(
                phoneNumber: event.phoneNumber,
                contactName: resolvedName,
              ),
            ),
          ).then((_) {
            _isCallScreenActive = false;
          });
        }
      } else if (event.type == 'removed') {
        _isCallScreenActive = false;
      }
    });
  }

  void _switchToTab(int index) {
    HapticFeedback.selectionClick();
    setState(() {
      _currentIndex = index.clamp(0, 2);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: OctalColors.bgDark,
      body: IndexedStack(
        index: _currentIndex,
        children: [
          PhoneHomeTab(
            onOpenKeypad: () => _switchToTab(1),
          ),
          const PhoneKeypadView(),
          const AutoDialerTab(),
        ],
      ),
      bottomNavigationBar: _buildBottomNav(),
    );
  }

  Widget _buildBottomNav() {
    final bottomPadding = MediaQuery.of(context).padding.bottom;

    return Container(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 6,
        bottom: bottomPadding > 0 ? bottomPadding + 4 : 10,
      ),
      decoration: const BoxDecoration(
        color: OctalColors.bgDark,
        border: Border(
          top: BorderSide(color: Color(0xFF28231F), width: 1.0),
        ),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          // Tab 0: Home
          _buildNavItem(
            index: 0,
            icon: Icons.home_rounded,
            label: 'Home',
          ),
          // Tab 1: Keypad
          _buildNavItem(
            index: 1,
            icon: Icons.dialpad_rounded,
            label: 'Keypad',
          ),
          // Tab 2: Auto Dialer
          _buildNavItem(
            index: 2,
            icon: Icons.laptop_chromebook_rounded,
            label: 'Auto Dialer',
          ),
        ],
      ),
    );
  }

  Widget _buildNavItem({
    required int index,
    required IconData icon,
    required String label,
  }) {
    final bool isSelected = _currentIndex == index;

    return GestureDetector(
      onTap: () => _switchToTab(index),
      behavior: HitTestBehavior.opaque,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 4),
            decoration: BoxDecoration(
              color: isSelected ? OctalColors.pillActive : Colors.transparent,
              borderRadius: BorderRadius.circular(18),
            ),
            child: Icon(
              icon,
              size: 24,
              color: isSelected ? Colors.white : OctalColors.textSecondary,
            ),
          ),
          const SizedBox(height: 3),
          Text(
            label,
            style: TextStyle(
              fontSize: 11.5,
              fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
              color: isSelected ? Colors.white : OctalColors.textSecondary,
              letterSpacing: 0.2,
            ),
          ),
        ],
      ),
    );
  }
}
