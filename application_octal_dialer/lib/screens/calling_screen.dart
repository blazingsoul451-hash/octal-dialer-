import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../widgets/octal_logo.dart';

class CallingScreen extends StatefulWidget {
  final String phone;
  final String name;
  final String leadId;
  final String? commandId;
  final String? callId;
  final int timeout;
  final io.Socket socket;
  final String sessionId;
  final VoidCallback? onCallEnded;

  const CallingScreen({
    super.key,
    required this.phone,
    required this.name,
    required this.leadId,
    this.commandId,
    this.callId,
    required this.timeout,
    required this.socket,
    required this.sessionId,
    this.onCallEnded,
  });

  @override
  State<CallingScreen> createState() => _CallingScreenState();
}

enum CallPhase { ringing, connected, ended }

class _CallingScreenState extends State<CallingScreen> with SingleTickerProviderStateMixin {
  // ignore: prefer_final_fields
  String _callStatus = '00:00';
  int _secondsLeft = 30;
  // ignore: prefer_final_fields
  int _talkDuration = 0;
  Timer? _ringingTimer;
  Timer? _talkTimer;
  CallPhase _phase = CallPhase.ringing;
  bool _callEnded = false;
  bool _isMuted = false;
  bool _isSpeaker = false;

  late AnimationController _waveAnimController;

  @override
  void initState() {
    super.initState();
    _secondsLeft = widget.timeout > 0 ? widget.timeout : 30;
    _startRingingTimer();

    _waveAnimController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat(reverse: true);

    // 1. Send explicit command acknowledgement to backend
    widget.socket.emit('phone:dial-ack', {
      'commandId': widget.commandId,
      'callId': widget.callId,
      'accepted': true,
    });

    // Register native telephony call state listener to track real GSM hardware states
    _nativeChannel.setMethodCallHandler((call) async {
      if (call.method == 'onCallStateChanged') {
        String state = 'UNKNOWN';
        if (call.arguments is Map) {
          state = (call.arguments['state'] ?? 'UNKNOWN').toString();
        } else if (call.arguments is String) {
          state = call.arguments as String;
        }
        if (mounted) {
          _handleCallStateChange(state);
        }
      }
    });

    // Start Foreground Service so Android 14 doesn't freeze app during call
    _nativeChannel.invokeMethod('startForegroundService', {
      'status': 'Calling ${widget.name.isNotEmpty ? widget.name : widget.phone}...'
    }).catchError((_) {});

    // Listen for remote hangup commands from web dashboard
    widget.socket.on('phone:hangup', (_) => _handleRemoteHangup());
    widget.socket.on('phone:hangup-call', (_) => _handleRemoteHangup());

    _placeGsmCall();
  }

  void _handleRemoteHangup() {
    debugPrint('CallingScreen: Received remote hangup command');
    _nativeChannel.invokeMethod('endCall').catchError((e) {
      debugPrint('CallingScreen: Native endCall ignored: $e');
    });
    _endCall('CANCELLED');
  }

  void _handleCallStateChange(String state) {
    debugPrint("CallingScreen: Native GSM state -> $state");
    if (state == 'OFFHOOK') {
      // Physical limitation: Android enters CALL_STATE_OFFHOOK as soon as dialing starts on the GSM radio.
      // OFFHOOK does NOT indicate a remote human answered.
      // Remain in non-confirmed RINGING state. DO NOT emit call:picked-up.
      widget.socket.emit('call:state-changed', {
        'callId': widget.callId,
        'commandId': widget.commandId,
        'state': 'RINGING',
      });
    } else if (state == 'IDLE') {
      // Cellular radio returned to IDLE.
      // If the call was explicitly confirmed as answered, emit CONNECTED.
      // Otherwise emit NO_ANSWER (prevents false ANSWERED disposition popups).
      if (_phase == CallPhase.connected) {
        _endCall('CONNECTED');
      } else {
        _endCall('NO_ANSWER');
      }
    }
  }

  void _startRingingTimer() {
    _ringingTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (mounted) {
        setState(() {
          _secondsLeft--;
          if (_secondsLeft <= 0) {
            timer.cancel();
            _nativeChannel.invokeMethod('endCall').catchError((_) {});
            _endCall('NO_ANSWER');
          }
        });
      }
    });
  }

  static const MethodChannel _nativeChannel = MethodChannel('com.octal.dialer/call');

  Future<void> _placeGsmCall() async {
    final cleanPhone = widget.phone.replaceAll(RegExp(r'[^\d+]'), '');
    if (cleanPhone.isEmpty) {
      _endCall('INVALID_PHONE');
      return;
    }

    try {
      final bool hasPermission = await _nativeChannel.invokeMethod('checkCallPermission') ?? false;
      if (!hasPermission) {
        final bool granted = await _nativeChannel.invokeMethod('requestCallPermission') ?? false;
        if (!granted) {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('Phone call permission (CALL_PHONE) is required to place calls.'),
                backgroundColor: Colors.redAccent,
              ),
            );
          }
          _endCall('CALL_PERMISSION_DENIED');
          return;
        }
      }

      final success = await _nativeChannel.invokeMethod('makeDirectCall', {'phone': cleanPhone});
      if (success != true) {
        _endCall('CALL_INTENT_FAILED');
      } else {
        widget.socket.emit('call:state-changed', {
          'callId': widget.callId,
          'commandId': widget.commandId,
          'state': 'DIALING',
        });
      }
    } catch (e) {
      debugPrint('Direct GSM call failed: $e');
      _endCall('CALL_FAILED');
    }
  }

  void _endCall(String reason) {
    if (_callEnded) return; // Guard against duplicate terminal events
    _callEnded = true;
    _phase = CallPhase.ended;
    _ringingTimer?.cancel();
    _talkTimer?.cancel();

    try {
      widget.onCallEnded?.call();
    } catch (_) {}

    widget.socket.emit('call:ended', {
      'sessionId': widget.sessionId,
      'callId': widget.callId,
      'leadId': widget.leadId,
      'phone': widget.phone,
      'name': widget.name,
      'commandId': widget.commandId,
      'reason': reason,
      'duration': _talkDuration,
    });

    try {
      _nativeChannel.invokeMethod('updateServiceStatus', {
        'status': 'Call ended. Phone Link active.'
      });
      _nativeChannel.invokeMethod('bringToForeground');
    } catch (_) {}

    if (mounted) {
      Navigator.pop(context);
    }
  }

  @override
  void dispose() {
    _waveAnimController.dispose();
    _ringingTimer?.cancel();
    _talkTimer?.cancel();
    widget.socket.off('phone:hangup');
    widget.socket.off('phone:hangup-call');
    _nativeChannel.setMethodCallHandler(null);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final initial = widget.name.isNotEmpty ? widget.name[0].toUpperCase() : 'A';
    final isConnected = _phase == CallPhase.connected;

    return Scaffold(
      backgroundColor: OctalColors.bgDark,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 16.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              // Top Bar
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  IconButton(
                    icon: const Icon(Icons.keyboard_arrow_down, color: Colors.white, size: 28),
                    onPressed: () => Navigator.pop(context),
                  ),
                  Text(
                    isConnected ? 'Active Call' : 'Connecting Call',
                    style: const TextStyle(
                      fontFamily: 'Ubuntu',
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                  const Icon(Icons.signal_cellular_alt, color: OctalColors.success, size: 20),
                ],
              ),

              const SizedBox(height: 10),

              // Hero Glowing Avatar
              Center(
                child: Container(
                  width: 140,
                  height: 140,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: OctalColors.surfaceCard,
                    border: Border.all(color: OctalColors.primaryGold, width: 3.5),
                    boxShadow: [
                      BoxShadow(
                        color: OctalColors.primaryGold.withOpacity(0.3),
                        blurRadius: 36,
                        spreadRadius: 4,
                      ),
                    ],
                  ),
                  child: Center(
                    child: Container(
                      width: 116,
                      height: 116,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: OctalColors.bgDark,
                        border: Border.all(color: OctalColors.secondaryGold.withOpacity(0.5), width: 1.5),
                      ),
                      child: Center(
                        child: Text(
                          initial,
                          style: const TextStyle(
                            fontFamily: 'Ubuntu',
                            fontSize: 48,
                            fontWeight: FontWeight.w900,
                            color: OctalColors.primaryGold,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),

              const SizedBox(height: 16),

              // Lead Contact Info & Timing
              Column(
                children: [
                  Text(
                    widget.name.isNotEmpty ? widget.name : 'Unknown Contact',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontFamily: 'Ubuntu',
                      fontSize: 22,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    widget.phone,
                    style: const TextStyle(
                      fontSize: 14,
                      color: OctalColors.textSecondary,
                      letterSpacing: 0.5,
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Call Status Badge & Timer
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    decoration: BoxDecoration(
                      color: isConnected
                          ? OctalColors.success.withOpacity(0.15)
                          : OctalColors.primaryGold.withOpacity(0.15),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(
                        color: isConnected
                            ? OctalColors.success.withOpacity(0.4)
                            : OctalColors.primaryGold.withOpacity(0.4),
                      ),
                    ),
                    child: Column(
                      children: [
                        Text(
                          isConnected ? 'IN CALL' : 'RINGING',
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 1.5,
                            color: isConnected ? OctalColors.success : OctalColors.primaryGold,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          isConnected ? _callStatus : '00:${_secondsLeft.toString().padLeft(2, '0')}',
                          style: const TextStyle(
                            fontFamily: 'monospace',
                            fontSize: 22,
                            fontWeight: FontWeight.bold,
                            color: Colors.white,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 12),

              // Animated Audio Waveform Visualizer
              AnimatedBuilder(
                animation: _waveAnimController,
                builder: (context, child) {
                  return SizedBox(
                    height: 38,
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: List.generate(24, (index) {
                        final waveVal = math.sin((index * 0.4) + (_waveAnimController.value * math.pi * 2));
                        final height = isConnected
                            ? 8.0 + (waveVal.abs() * 24.0)
                            : 4.0 + (math.sin(index * 0.3).abs() * 12.0);
                        return Container(
                          width: 3.5,
                          height: height,
                          margin: const EdgeInsets.symmetric(horizontal: 2.5),
                          decoration: BoxDecoration(
                            color: isConnected ? OctalColors.primaryGold : OctalColors.textMuted,
                            borderRadius: BorderRadius.circular(4),
                          ),
                        );
                      }),
                    ),
                  );
                },
              ),

              const SizedBox(height: 16),

              // Control Actions (Mute, Keypad, Speaker)
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  _buildControlItem(
                    icon: _isMuted ? Icons.mic_off : Icons.mic,
                    label: 'Mute',
                    isActive: _isMuted,
                    onTap: () => setState(() => _isMuted = !_isMuted),
                  ),
                  _buildControlItem(
                    icon: Icons.dialpad,
                    label: 'Keypad',
                    isActive: false,
                    onTap: () {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('In-call DTMF Keypad active on native phone.')),
                      );
                    },
                  ),
                  _buildControlItem(
                    icon: _isSpeaker ? Icons.volume_up : Icons.volume_down,
                    label: 'Speaker',
                    isActive: _isSpeaker,
                    onTap: () => setState(() => _isSpeaker = !_isSpeaker),
                  ),
                ],
              ),

              const SizedBox(height: 20),

              // End Call Full Width Gold Button
              SizedBox(
                width: double.infinity,
                height: 54,
                child: ElevatedButton.icon(
                  onPressed: () {
                    _nativeChannel.invokeMethod('endCall').catchError((_) {});
                    _endCall(isConnected ? 'CONNECTED' : 'CANCELLED');
                  },
                  icon: const Icon(Icons.call_end, color: OctalColors.bgDark, size: 22),
                  label: const Text(
                    'End Call',
                    style: TextStyle(
                      fontFamily: 'Ubuntu',
                      fontSize: 16,
                      fontWeight: FontWeight.w900,
                      color: OctalColors.bgDark,
                      letterSpacing: 0.5,
                    ),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: OctalColors.primaryGold,
                    elevation: 6,
                    shadowColor: OctalColors.primaryGold.withOpacity(0.4),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(18),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildControlItem({
    required IconData icon,
    required String label,
    required bool isActive,
    required VoidCallback onTap,
  }) {
    return Column(
      children: [
        InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(30),
          child: Container(
            width: 58,
            height: 58,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: isActive ? OctalColors.primaryGold : OctalColors.surfaceCard,
              border: Border.all(
                color: isActive ? OctalColors.primaryGold : OctalColors.border,
                width: 1.5,
              ),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.3),
                  blurRadius: 8,
                ),
              ],
            ),
            child: Icon(
              icon,
              color: isActive ? OctalColors.bgDark : Colors.white,
              size: 24,
            ),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          label,
          style: const TextStyle(fontSize: 12, color: OctalColors.textSecondary, fontWeight: FontWeight.w600),
        ),
      ],
    );
  }
}
