import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../widgets/octal_logo.dart';
import '../services/telecom_service.dart';
import '../services/call_outbox_service.dart';
import '../services/phone_bridge_service.dart';

class CallingScreen extends StatefulWidget {
  final String phone;
  final String name;
  final String leadId;
  final String? commandId;
  final String? callId;
  final int timeout;
  final io.Socket socket;
  final String sessionId;
  final int? simSlot;
  final VoidCallback? onCallEnded;

  const CallingScreen({
    super.key,
    required this.phone,
    required this.name,
    required this.leadId,
    this.commandId,
    this.callId,
    this.simSlot,
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
  int _talkSeconds = 0;
  Timer? _ringingTimer;
  Timer? _talkTimer;
  StreamSubscription<TelecomCallEvent>? _telecomSub;
  CallPhase _phase = CallPhase.ringing;
  bool _callEnded = false;
  bool _cancelRequested = false;
  bool _hasEmittedPickedUp = false;
  bool _isMuted = false;
  bool _isSpeaker = false;

  late AnimationController _waveAnimController;

  @override
  void initState() {
    super.initState();
    _secondsLeft = widget.timeout > 0 ? widget.timeout : 30;


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

    // Mark Auto Dialer call active to prevent duplicate InCallScreen overlay
    TelecomService.instance.isAutoDialerCallActive = true;

    // Register Telecom call event listener (primary source of truth for GSM calls)
    _telecomSub = TelecomService.instance.callEvents.listen((event) {
      if (!mounted || _callEnded) return;

      // Uncorrelated event guard: If event specifies a callId and our widget has a callId, and they don't match, ignore it.
      // This prevents call waiting or foreign calls from terminating the active campaign call.
      if (event.callId.isNotEmpty && widget.callId != null && widget.callId!.isNotEmpty && event.callId != widget.callId) {
        debugPrint('CallingScreen: Ignored event for different callId ${event.callId} (current: ${widget.callId})');
        return;
      }

      if (event.type == 'state_changed') {
        final st = event.state.toUpperCase();
        debugPrint('CallingScreen: Telecom state_changed -> $st');
        if (st == 'ACTIVE') {
          if (_phase != CallPhase.connected) {
            setState(() {
              _phase = CallPhase.connected;
            });
            _startTalkTimer();
          }
          if (!_hasEmittedPickedUp) {
            _hasEmittedPickedUp = true;
            debugPrint('CallingScreen: Emitting call:picked-up to sync ACTIVE state with server & web');
            widget.socket.emit('call:picked-up', {
              'callId': widget.callId,
              'sessionId': widget.sessionId,
            });
          }
        } else if (st == 'RINGING' || st == 'DIALING') {
          widget.socket.emit('call:state-changed', {
            'callId': widget.callId,
            'commandId': widget.commandId,
            'state': 'RINGING',
          });
        }
      } else if (event.type == 'removed') {
        final int dur = (event.duration != null && event.duration! > 0) ? event.duration! : _talkSeconds;
        // Authoritative: Native ACTIVE transition is evidence of an answered call. No 10-second heuristic.
        final bool answered = _hasEmittedPickedUp || _phase == CallPhase.connected || event.reason == 'ANSWERED' || (event.answered == true);
        final String reason = answered ? 'ANSWERED' : (dur > 0 && event.reason != 'CANCELLED' ? 'COMPLETED' : (event.reason ?? 'NO_ANSWER'));
        _endCall(
          reason: reason,
          duration: dur,
          answered: answered,
        );
      } else if (event.type == 'legacy_state') {
        // Legacy telephony state from TelephonyManager (routed through TelecomService)
        if (mounted) {
          _handleCallStateChange(event.state);
        }
      } else if (event.type == 'legacy_ended') {
        // Legacy call ended event (routed through TelecomService)
        if (mounted) {
          final bool answered = _hasEmittedPickedUp || _phase == CallPhase.connected || event.answered == true || event.reason == 'ANSWERED';
          _endCall(
            reason: answered ? 'ANSWERED' : (event.reason ?? 'NO_ANSWER'),
            duration: event.duration ?? _talkSeconds,
            answered: answered,
          );
        }
      }
    });

    // Start Foreground Service so Android 14 doesn't freeze app during call
    _nativeChannel.invokeMethod('startForegroundService', {
      'status': 'Calling ${widget.name.isNotEmpty ? widget.name : widget.phone}...'
    }).catchError((_) {});

    // Listen for remote hangup commands using named reference to avoid stripping service handlers
    widget.socket.on('phone:hangup', _onRemoteHangup);
    widget.socket.on('phone:hangup-call', _onRemoteHangup);

    _placeGsmCall();
  }

  void _onRemoteHangup(dynamic _) => _handleRemoteHangup();

  void _startTalkTimer() {
    _ringingTimer?.cancel();
    _talkTimer?.cancel();
    _talkSeconds = 0;
    _talkTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (mounted) {
        setState(() {
          _talkSeconds++;
          final m = (_talkSeconds ~/ 60).toString().padLeft(2, '0');
          final s = (_talkSeconds % 60).toString().padLeft(2, '0');
          _callStatus = '$m:$s';
        });
      }
    });
  }

  void _handleRemoteHangup() {
    _cancelRequested = true;
    debugPrint('CallingScreen: Received remote hangup command');
    TelecomService.instance.disconnect(callId: widget.callId).catchError((_) => false);
    _nativeChannel.invokeMethod('endCall').catchError((e) {
      debugPrint('CallingScreen: Native endCall ignored: $e');
    });
    Future.delayed(const Duration(milliseconds: 1500), () {
      if (mounted && !_callEnded) {
        _endCall(reason: 'CANCELLED', duration: 0, answered: false);
      }
    });
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
      // Cellular radio returned to IDLE. Native layer correlates CallLog and emits onCallEnded.
      // Bounded safety fallback in case native thread takes longer than expected:
      Future.delayed(const Duration(milliseconds: 3500), () {
        if (mounted && !_callEnded) {
          _endCall(reason: 'NO_ANSWER', duration: 0, answered: false);
        }
      });
    }
  }

  void _startRingingTimer() {
    _ringingTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (mounted) {
        setState(() {
          _secondsLeft--;
          if (_secondsLeft <= 0) {
            timer.cancel();
            _cancelRequested = true;
            _nativeChannel.invokeMethod('endCall').catchError((_) {});
            Future.delayed(const Duration(milliseconds: 2000), () {
              if (mounted && !_callEnded) {
                _endCall(reason: 'NO_ANSWER', duration: 0, answered: false);
              }
            });
          }
        });
      }
    });
  }

  static const MethodChannel _nativeChannel = MethodChannel('com.octal.dialer/call');

  Future<void> _placeGsmCall() async {
    final cleanPhone = widget.phone.replaceAll(RegExp(r'[^\d+]'), '');
    if (cleanPhone.isEmpty) {
      _endCall(reason: 'INVALID_PHONE');
      return;
    }

    try {
      // 1. Centralized Prerequisite Gate: Default Dialer role + Mandatory Permissions
      final bool prereqsPassed = await TelecomService.instance.ensureCallingPrerequisites();
      if (!mounted || _callEnded || _cancelRequested) return;
      if (!prereqsPassed) {
        debugPrint('CallingScreen: Prerequisites not met (Default Dialer role or permissions denied).');
        _endCall(reason: 'PREREQUISITES_DENIED');
        return;
      }

      // 2. Direct Telecom call placement via TelecomManager.placeCall()
      final bool placed = await TelecomService.instance.placeCall(
        cleanPhone,
        simSlot: widget.simSlot,
        callId: widget.callId,
      );

      if (!mounted || _callEnded || _cancelRequested) return;
      if (!placed) {
        debugPrint('CallingScreen: Telecom placeCall returned false.');
        _endCall(reason: 'CALL_PLACE_FAILED');
        return;
      }

      _startRingingTimer();
      widget.socket.emit('call:state-changed', {
        'callId': widget.callId,
        'commandId': widget.commandId,
        'state': 'DIALING',
      });
    } catch (e) {
      debugPrint('Direct GSM call failed: $e');
      _endCall(reason: 'CALL_FAILED');
    }
  }

  void _endCall({required String reason, int duration = 0, bool answered = false}) {
    if (_callEnded) return; // Guard against duplicate terminal events
    _callEnded = true;
    _phase = CallPhase.ended;
    _ringingTimer?.cancel();
    _talkTimer?.cancel();

    try {
      widget.onCallEnded?.call();
    } catch (_) {}

    final effectiveDuration = duration > 0 ? duration : _talkSeconds;
    final effectiveAnswered = answered || reason == 'ANSWERED' || _hasEmittedPickedUp || _phase == CallPhase.connected;
    final effectiveReason = effectiveAnswered ? 'ANSWERED' : reason;
    final effectiveCallId = widget.callId ?? widget.commandId ?? 'call_${DateTime.now().millisecondsSinceEpoch}';
    PhoneBridgeService.instance.markCallEnqueued(effectiveCallId);

    final outboxEntry = CallOutboxEntry(
      outboxId: 'ob_${DateTime.now().millisecondsSinceEpoch}_$effectiveCallId',
      callId: effectiveCallId,
      sessionId: widget.sessionId,
      leadId: widget.leadId.isNotEmpty ? widget.leadId : null,
      commandId: widget.commandId,
      phone: widget.phone,
      name: widget.name,
      reason: effectiveReason,
      duration: effectiveDuration,
      answered: effectiveAnswered,
      createdAtMs: DateTime.now().millisecondsSinceEpoch,
      serverOrigin: PhoneBridgeService.instance.serverUri,
      tenantId: PhoneBridgeService.instance.tenantId.isNotEmpty ? PhoneBridgeService.instance.tenantId : null,
      deviceId: PhoneBridgeService.instance.deviceId.isNotEmpty ? PhoneBridgeService.instance.deviceId : null,
    );

    // Persist to durable handset outbox BEFORE emitting
    CallOutboxService.instance.enqueueOutcome(outboxEntry).then((_) {
      CallOutboxService.instance.flush(
        widget.socket,
        currentOrigin: PhoneBridgeService.instance.serverUri,
        currentTenantId: PhoneBridgeService.instance.tenantId.isNotEmpty ? PhoneBridgeService.instance.tenantId : null,
        currentDeviceId: PhoneBridgeService.instance.deviceId.isNotEmpty ? PhoneBridgeService.instance.deviceId : null,
      );
    }).catchError((err) {
      debugPrint('[CallingScreen] Outbox enqueue failed: $err. Surface failure and schedule retry without unjournaled bypass.');
      // Persist failure is retained visibly; outbox service periodic retry will re-attempt persistence
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
    _telecomSub?.cancel();
    widget.socket.off('phone:hangup', _onRemoteHangup);
    widget.socket.off('phone:hangup-call', _onRemoteHangup);
    // Clear auto dialer active flag so normal in-call UI operates
    TelecomService.instance.isAutoDialerCallActive = false;
    // Defensively ensure TelecomService handler is active
    TelecomService.instance.reinitialize();
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
                    onTap: () async {
                      final next = !_isMuted;
                      await TelecomService.instance.setMuted(next);
                      if (mounted) setState(() => _isMuted = next);
                    },
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
                    onTap: () async {
                      final next = !_isSpeaker;
                      await TelecomService.instance.setSpeaker(next);
                      if (mounted) setState(() => _isSpeaker = next);
                    },
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
                    _cancelRequested = true;
                    TelecomService.instance.disconnect(callId: widget.callId).catchError((_) => false);
                    _nativeChannel.invokeMethod('endCall').catchError((_) {});
                    Future.delayed(const Duration(milliseconds: 1500), () {
                      if (mounted && !_callEnded) {
                        _endCall(reason: 'CANCELLED', duration: 0, answered: false);
                      }
                    });
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
