import 'dart:async';
import 'package:flutter/material.dart';
import '../../widgets/octal_logo.dart';
import '../../services/telecom_service.dart';
import '../../services/phone_data_service.dart';
import 'shared_in_call_screen.dart';

class IncomingCallScreen extends StatefulWidget {
  final String phoneNumber;
  final String callerName;
  final String? simName;

  const IncomingCallScreen({
    super.key,
    required this.phoneNumber,
    this.callerName = '',
    this.simName,
  });

  @override
  State<IncomingCallScreen> createState() => _IncomingCallScreenState();
}

class _IncomingCallScreenState extends State<IncomingCallScreen> {
  final TelecomService _telecomService = TelecomService.instance;
  StreamSubscription<TelecomCallEvent>? _sub;

  @override
  void initState() {
    super.initState();
    _sub = _telecomService.callEvents.listen((event) {
      if (!mounted) return;
      if (event.type == 'removed') {
        Navigator.pop(context);
      }
    });
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  void _answer() async {
    final ok = await _telecomService.answer();
    if (ok && mounted) {
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) => SharedInCallScreen(
            phoneNumber: widget.phoneNumber,
            contactName: widget.callerName,
            simName: widget.simName,
          ),
        ),
      );
    }
  }

  void _decline() async {
    await _telecomService.disconnect();
    if (mounted) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final resolvedName = (widget.callerName.isNotEmpty && widget.callerName != widget.phoneNumber)
        ? widget.callerName
        : (PhoneDataService.instance.getContactNameForNumber(widget.phoneNumber) ?? widget.callerName);
    final displayName = resolvedName.isNotEmpty ? resolvedName : widget.phoneNumber;

    // Generate DP letter initials if displayName contains letters
    final hasLetter = RegExp(r'[a-zA-Z]').hasMatch(displayName);
    String initials = '';
    if (hasLetter) {
      final parts = displayName.trim().split(RegExp(r'\s+'));
      if (parts.length >= 2 && parts[0].isNotEmpty && parts[1].isNotEmpty) {
        final f1 = parts[0].split('').firstWhere((c) => RegExp(r'[a-zA-Z]').hasMatch(c), orElse: () => '');
        final f2 = parts[1].split('').firstWhere((c) => RegExp(r'[a-zA-Z]').hasMatch(c), orElse: () => '');
        if (f1.isNotEmpty && f2.isNotEmpty) {
          initials = (f1 + f2).toUpperCase();
        }
      }
      if (initials.isEmpty) {
        final f1 = displayName.split('').firstWhere((c) => RegExp(r'[a-zA-Z]').hasMatch(c), orElse: () => '');
        initials = f1.toUpperCase();
      }
    }

    return PopScope(
      canPop: false,
      child: Scaffold(
        backgroundColor: OctalColors.bgDark,
        body: SafeArea(
          child: Column(
            children: [
              const SizedBox(height: 36),

              // SIM badge
              if (widget.simName != null)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                  decoration: BoxDecoration(
                    color: OctalColors.purpleSim.withOpacity(0.25),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: OctalColors.purpleSim.withOpacity(0.5)),
                  ),
                  child: Text(
                    'Incoming on ${widget.simName!}',
                    style: const TextStyle(
                      color: Color(0xFFC4B5FD),
                      fontSize: 11.5,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),

              const SizedBox(height: 20),

              // Caller Name
              Text(
                displayName,
                style: const TextStyle(
                  fontFamily: 'Ubuntu',
                  fontSize: 26,
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                ),
                textAlign: TextAlign.center,
              ),

              const SizedBox(height: 6),

              // Number
              if (displayName != widget.phoneNumber && widget.phoneNumber.isNotEmpty)
                Text(
                  widget.phoneNumber,
                  style: const TextStyle(fontSize: 14, color: OctalColors.textSecondary),
                ),

              const SizedBox(height: 10),

              const Text(
                'Incoming Call...',
                style: TextStyle(fontSize: 13, color: OctalColors.primaryGold, fontWeight: FontWeight.w600),
              ),

              const Spacer(),

              // Avatar DP (Matching Native Android Incoming Call)
              Container(
                width: 120,
                height: 120,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: const Color(0xFF2A221E),
                  border: Border.all(color: const Color(0xFF3E3732), width: 1.5),
                ),
                child: Center(
                  child: initials.isNotEmpty
                      ? Text(
                          initials,
                          style: const TextStyle(
                            color: Color(0xFFF0DFD8),
                            fontSize: 46,
                            fontWeight: FontWeight.w600,
                            letterSpacing: 1.0,
                          ),
                        )
                      : const Icon(Icons.person, color: Color(0xFFF0DFD8), size: 66),
                ),
              ),

              const Spacer(),

              // Decline & Answer buttons
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 48.0, vertical: 36.0),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    // Decline button
                    GestureDetector(
                      onTap: _decline,
                      child: Column(
                        children: [
                          Container(
                            width: 68,
                            height: 68,
                            decoration: BoxDecoration(
                              color: const Color(0xFFD93025),
                              shape: BoxShape.circle,
                              boxShadow: [
                                BoxShadow(
                                  color: const Color(0xFFD93025).withOpacity(0.35),
                                  blurRadius: 18,
                                  offset: const Offset(0, 4),
                                ),
                              ],
                            ),
                            child: const Center(
                              child: Icon(Icons.call_end_rounded, color: Colors.white, size: 32),
                            ),
                          ),
                          const SizedBox(height: 10),
                          const Text('Decline', style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w500)),
                        ],
                      ),
                    ),

                    // Answer button
                    GestureDetector(
                      onTap: _answer,
                      child: Column(
                        children: [
                          Container(
                            width: 68,
                            height: 68,
                            decoration: BoxDecoration(
                              color: const Color(0xFF5BB974),
                              shape: BoxShape.circle,
                              boxShadow: [
                                BoxShadow(
                                  color: const Color(0xFF5BB974).withOpacity(0.35),
                                  blurRadius: 18,
                                  offset: const Offset(0, 4),
                                ),
                              ],
                            ),
                            child: const Center(
                              child: Icon(Icons.call_rounded, color: Color(0xFF202124), size: 32),
                            ),
                          ),
                          const SizedBox(height: 10),
                          const Text('Answer', style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w500)),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
