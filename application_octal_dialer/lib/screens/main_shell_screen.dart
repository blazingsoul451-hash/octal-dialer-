import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../widgets/octal_logo.dart';
import '../services/telecom_service.dart';
import '../services/phone_data_service.dart';
import '../services/phone_bridge_service.dart';
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
  StreamSubscription<int>? _tabSwitchSub;
  bool _isCallScreenActive = false;

  @override
  void initState() {
    super.initState();
    _currentIndex = widget.initialTabIndex.clamp(0, 2);
    PhoneBridgeService.instance.addListener(_onBridgeUpdate);
    TelecomService.instance.reinitialize();
    _listenToTelecomEvents();
    _tabSwitchSub = TelecomService.instance.onSwitchTab.listen((tab) {
      if (mounted) _switchToTab(tab);
    });
    const MethodChannel('com.octal.dialer/call').invokeMethod<int>('getInitialTab').then((tab) {
      if (tab != null && tab > 0 && mounted) {
        _switchToTab(tab);
      }
    });
    _checkDefaultDialer();
  }

  Future<void> _checkDefaultDialer() async {
    try {
      final isDefault = await TelecomService.instance.isDefaultDialer();
      if (!isDefault && mounted) {
        // Automatically request Default Dialer role so Octal InCallService UI activates for calls
        await TelecomService.instance.requestDefaultDialerRole();
      }
    } catch (e) {
      debugPrint('[MainShellScreen] checkDefaultDialer error: $e');
    }
  }

  @override
  void dispose() {
    PhoneBridgeService.instance.removeListener(_onBridgeUpdate);
    _telecomSub?.cancel();
    _tabSwitchSub?.cancel();
    super.dispose();
  }

  void _onBridgeUpdate() {
    if (mounted) setState(() {});
  }

  void _listenToTelecomEvents() async {
    await _telecomSub?.cancel();

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
      } else if (event.type == 'removed' || event.type == 'disconnected') {
        if (_isCallScreenActive) {
          if (mounted && Navigator.canPop(context)) {
            Navigator.pop(context);
          }
          _isCallScreenActive = false;
        }
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
    final bool isPairedInAutoDialer = _currentIndex == 2 && PhoneBridgeService.instance.isPaired;
    final bool isLandscape = MediaQuery.of(context).orientation == Orientation.landscape;

    return Scaffold(
      backgroundColor: OctalColors.bgDark,
      body: isLandscape
          ? Row(
              children: [
                if (!isPairedInAutoDialer) _buildLandscapeNavRail(),
                Expanded(
                  child: IndexedStack(
                    index: _currentIndex,
                    children: [
                      PhoneHomeTab(
                        onOpenKeypad: () => _switchToTab(1),
                      ),
                      const PhoneKeypadView(),
                      const AutoDialerTab(),
                    ],
                  ),
                ),
              ],
            )
          : IndexedStack(
              index: _currentIndex,
              children: [
                PhoneHomeTab(
                  onOpenKeypad: () => _switchToTab(1),
                ),
                const PhoneKeypadView(),
                const AutoDialerTab(),
              ],
            ),
      bottomNavigationBar: (isLandscape || isPairedInAutoDialer) ? null : _buildBottomNav(),
    );
  }

  Widget _buildLandscapeNavRail() {
    return Container(
      width: 80,
      decoration: const BoxDecoration(
        color: Color(0xFF160F0B),
        border: Border(
          right: BorderSide(color: Color(0xFF261D18), width: 1.0),
        ),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          _buildNavItem(
            index: 0,
            icon: Icons.home_outlined,
            activeIcon: Icons.home_rounded,
            label: 'Home',
          ),
          const SizedBox(height: 20),
          _buildNavItem(
            index: 1,
            icon: Icons.dialpad_outlined,
            activeIcon: Icons.dialpad_rounded,
            label: 'Keypad',
          ),
          const SizedBox(height: 20),
          _buildNavItem(
            index: 2,
            icon: Icons.laptop_chromebook_outlined,
            activeIcon: Icons.laptop_chromebook_rounded,
            label: 'Auto Dialer',
          ),
        ],
      ),
    );
  }

  Widget _buildBottomNav() {
    final bottomPadding = MediaQuery.of(context).padding.bottom;

    return Container(
      height: 80 + bottomPadding,
      padding: EdgeInsets.only(
        left: 12,
        right: 12,
        top: 10,
        bottom: bottomPadding > 0 ? bottomPadding : 8,
      ),
      decoration: const BoxDecoration(
        color: Color(0xFF160F0B),
        border: Border(
          top: BorderSide(color: Color(0xFF261D18), width: 1.0),
        ),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          // Tab 0: Home
          _buildNavItem(
            index: 0,
            icon: Icons.home_outlined,
            activeIcon: Icons.home_rounded,
            label: 'Home',
          ),
          // Tab 1: Keypad
          _buildNavItem(
            index: 1,
            icon: Icons.dialpad_outlined,
            activeIcon: Icons.dialpad_rounded,
            label: 'Keypad',
          ),
          // Tab 2: Auto Dialer
          _buildNavItem(
            index: 2,
            icon: Icons.laptop_chromebook_outlined,
            activeIcon: Icons.laptop_chromebook_rounded,
            label: 'Auto Dialer',
          ),
        ],
      ),
    );
  }

  Widget _buildNavItem({
    required int index,
    required IconData icon,
    required IconData activeIcon,
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
            width: 64,
            height: 32,
            decoration: BoxDecoration(
              color: isSelected ? const Color(0xFF564137) : Colors.transparent,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Center(
              child: Icon(
                isSelected ? activeIcon : icon,
                size: 24,
                color: isSelected ? const Color(0xFFF0DFD8) : const Color(0xFFB8A9A3),
              ),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
              color: isSelected ? const Color(0xFFF0DFD8) : const Color(0xFFB8A9A3),
              letterSpacing: 0.2,
            ),
          ),
        ],
      ),
    );
  }
}
