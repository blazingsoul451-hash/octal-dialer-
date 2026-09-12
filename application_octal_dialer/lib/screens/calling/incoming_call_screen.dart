import 'dart:async';
import 'package:flutter/material.dart';
import '../../widgets/octal_logo.dart';
import '../../services/telecom_service.dart';
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
    final displayName = widget.callerName.isNotEmpty ? widget.callerName : widget.phoneNumber;

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
              if (widget.callerName.isNotEmpty)
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

              // Animated Pulsing Avatar
              Container(
                width: 130,
                height: 130,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: OctalColors.surfaceCard,
                  border: Border.all(color: OctalColors.primaryGold, width: 2),
                  boxShadow: [
                    BoxShadow(
                      color: OctalColors.primaryGold.withOpacity(0.35),
                      blurRadius: 36,
                      spreadRadius: 4,
                    ),
                  ],
                ),
                child: const Center(
                  child: Icon(Icons.person, color: OctalColors.primaryGold, size: 70),
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
                              color: OctalColors.error,
                              shape: BoxShape.circle,
                              boxShadow: [
                                BoxShadow(
                                  color: OctalColors.error.withOpacity(0.4),
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
                              color: OctalColors.success,
                              shape: BoxShape.circle,
                              boxShadow: [
                                BoxShadow(
                                  color: OctalColors.success.withOpacity(0.4),
                                  blurRadius: 18,
                                  offset: const Offset(0, 4),
                                ),
                              ],
                            ),
                            child: const Center(
                              child: Icon(Icons.call_rounded, color: Colors.white, size: 32),
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
