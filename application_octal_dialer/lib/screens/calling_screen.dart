import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'package:url_launcher/url_launcher.dart';

class CallingScreen extends StatefulWidget {
  final String phone;
  final String name;
  final String leadId;
  final String? commandId;
  final int timeout;
  final io.Socket socket;
  final String sessionId;

  const CallingScreen({
    super.key,
    required this.phone,
    required this.name,
    required this.leadId,
    this.commandId,
    required this.timeout,
    required this.socket,
    required this.sessionId,
  });

  @override
  State<CallingScreen> createState() => _CallingScreenState();
}

class _CallingScreenState extends State<CallingScreen> {
  String _callStatus = 'Ringing...';
  int _secondsLeft = 30;
  int _talkDuration = 0;
  Timer? _ringingTimer;
  Timer? _talkTimer;
  bool _isAnswered = false;
  bool _callEnded = false;

  @override
  void initState() {
    super.initState();
    _secondsLeft = widget.timeout;
    _startRingingTimer();
    
    // Register native telephony call state listener to automate state tracking
    _nativeChannel.setMethodCallHandler((call) async {
      if (call.method == 'onCallStateChanged') {
        final state = call.arguments as String;
        if (mounted) {
          _handleCallStateChange(state);
        }
      }
    });

    // Listen for remote hangup command from web dashboard
    widget.socket.on('phone:hangup', (_) {
      debugPrint('CallingScreen: Received remote hangup command');
      // Attempt native call termination (may fail on Android 9+ without default dialer privilege)
      _nativeChannel.invokeMethod('endCall').then((_) {
        debugPrint('CallingScreen: Native endCall succeeded');
      }).catchError((e) {
        debugPrint('CallingScreen: Native endCall failed (expected on Android 9+): $e');
      });
      _endCall('CANCELLED');
    });

    _placeGsmCall();
  }

  void _handleCallStateChange(String state) {
    debugPrint("CallingScreen: Native state -> $state");
    if (state == 'OFFHOOK') {
      if (!_isAnswered) {
        _simulateAnswer();
      }
    } else if (state == 'IDLE') {
      _endCall(_isAnswered ? 'ANSWERED' : 'NO_ANSWER');
    }
  }

  void _startRingingTimer() {
    _ringingTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (mounted) {
        setState(() {
          _secondsLeft--;
          if (_secondsLeft <= 0) {
            timer.cancel();
            _endCall('NO_ANSWER');
          }
        });
      }
    });
  }

  static const MethodChannel _nativeChannel = MethodChannel('com.octal.dialer/call');

  Future<void> _placeGsmCall() async {
    final cleanPhone = widget.phone.replaceAll(RegExp(r'[^\d+]'), '');
    try {
      await _nativeChannel.invokeMethod('makeDirectCall', {'phone': cleanPhone});
    } catch (e) {
      final telUri = Uri.parse('tel:$cleanPhone');
      try {
        await launchUrl(telUri, mode: LaunchMode.externalApplication);
      } catch (err) {
        debugPrint('Could not launch native phone: $err');
      }
    }
  }

  void _simulateAnswer() {
    _ringingTimer?.cancel();
    if (mounted) {
      setState(() {
        _isAnswered = true;
        _callStatus = '0:00';
      });
    }

    widget.socket.emit('call:picked-up', {
      'sessionId': widget.sessionId,
    });

    _talkTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (mounted) {
        setState(() {
          _talkDuration++;
          final minutes = (_talkDuration ~/ 60).toString();
          final seconds = (_talkDuration % 60).toString().padLeft(2, '0');
          _callStatus = '$minutes:$seconds';
        });
      }
    });
  }

  void _endCall(String reason) {
    if (_callEnded) return; // Guard against duplicate terminal events (timeout + IDLE + hangup race)
    _callEnded = true;
    _ringingTimer?.cancel();
    _talkTimer?.cancel();

    widget.socket.emit('call:ended', {
      'sessionId': widget.sessionId,
      'leadId': widget.leadId,
      'phone': widget.phone,
      'name': widget.name,
      'commandId': widget.commandId,
      'reason': reason,
      'duration': _talkDuration,
    });

    try {
      _nativeChannel.invokeMethod('bringToForeground');
    } catch (_) {}

    if (mounted) {
      Navigator.pop(context);
    }
  }

  @override
  void dispose() {
    _ringingTimer?.cancel();
    _talkTimer?.cancel();
    widget.socket.off('phone:hangup');
    // Do NOT null out MethodChannel handler — it would strip the listener
    // from StandaloneDialerScreen if it registered one. The handler is
    // scoped to the channel, and the native side continues to emit.
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 40.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                children: [
                  const SizedBox(height: 40),
                  Text(
                    _isAnswered ? 'ACTIVE BRIDGED CALL' : 'ROUTING GSM DIAL...',
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                      letterSpacing: 2.0,
                      color: _isAnswered ? const Color(0xFF10B981) : Colors.amber,
                    ),
                  ),
                  const SizedBox(height: 24),
                  Text(
                    widget.name,
                    style: const TextStyle(
                      fontFamily: 'Ubuntu',
                      fontSize: 28,
                      fontWeight: FontWeight.w900,
                      color: Colors.white,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    widget.phone,
                    style: TextStyle(
                      fontFamily: 'monospace',
                      fontSize: 14,
                      color: Colors.white.withOpacity(0.5),
                    ),
                  ),
                ],
              ),

              Column(
                children: [
                  Text(
                    _isAnswered ? _callStatus : 'Ringing: ${_secondsLeft}s',
                    style: const TextStyle(
                      fontFamily: 'monospace',
                      fontSize: 48,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                      letterSpacing: 1.0,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    _isAnswered ? 'CONNECTED' : 'WAITING FOR GSM HANDSHAKE',
                    style: TextStyle(
                      fontSize: 9,
                      fontWeight: FontWeight.bold,
                      color: Colors.white.withOpacity(0.3),
                      letterSpacing: 1.0,
                    ),
                  ),
                ],
              ),

              Column(
                children: [
                  if (!_isAnswered) ...[
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        ElevatedButton.icon(
                          onPressed: _simulateAnswer,
                          icon: const Icon(Icons.call, size: 18),
                          label: const Text('SIMULATE ANSWER', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF10B981),
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14.0),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(14.0),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                  ],
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      ElevatedButton.icon(
                        onPressed: () => _endCall(_isAnswered ? 'ANSWERED' : 'BUSY'),
                        icon: const Icon(Icons.call_end, size: 20),
                        label: Text(_isAnswered ? 'HANG UP CALL' : 'DECLINE CALL', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.redAccent,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(horizontal: 48, vertical: 16.0),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(16.0),
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
