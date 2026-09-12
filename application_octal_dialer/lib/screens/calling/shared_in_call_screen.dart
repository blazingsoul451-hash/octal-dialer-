import 'dart:async';
import 'package:flutter/material.dart';
import '../../widgets/octal_logo.dart';
import '../../services/telecom_service.dart';
import '../../services/phone_data_service.dart';

class SharedInCallScreen extends StatefulWidget {
  final String phoneNumber;
  final String contactName;
  final String? simName;

  const SharedInCallScreen({
    super.key,
    required this.phoneNumber,
    this.contactName = '',
    this.simName,
  });

  @override
  State<SharedInCallScreen> createState() => _SharedInCallScreenState();
}

class _SharedInCallScreenState extends State<SharedInCallScreen> {
  final TelecomService _telecomService = TelecomService.instance;
  StreamSubscription<TelecomCallEvent>? _sub;

  bool _isMuted = false;
  bool _isSpeaker = false;
  bool _isOnHold = false;
  bool _showDtmf = false;
  int _seconds = 0;
  Timer? _timer;
  String _callStatus = 'Calling...';

  @override
  void initState() {
    super.initState();
    _startTimer();
    _sub = _telecomService.callEvents.listen((event) {
      if (!mounted) return;
      if (event.type == 'removed') {
        Navigator.pop(context);
      } else if (event.type == 'state_changed') {
        final st = event.state.toUpperCase();
        setState(() {
          _callStatus = st;
          if (st == 'HOLDING') {
            _isOnHold = true;
          } else if (st == 'ACTIVE') {
            _isOnHold = false;
          }
        });
      } else if (event.type == 'audio_changed') {
        setState(() {
          if (event.isMuted != null) _isMuted = event.isMuted!;
          if (event.audioRoute != null) _isSpeaker = event.audioRoute == 'SPEAKER';
        });
      }
    });
  }

  void _startTimer() {
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() => _seconds++);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _sub?.cancel();
    super.dispose();
  }

  String _formatDuration(int sec) {
    final m = (sec ~/ 60).toString().padLeft(2, '0');
    final s = (sec % 60).toString().padLeft(2, '0');
    return '$m:$s';
  }

  void _toggleMute() async {
    final newMute = !_isMuted;
    final ok = await _telecomService.setMuted(newMute);
    if (ok && mounted) setState(() => _isMuted = newMute);
  }

  void _toggleSpeaker() async {
    final newSpeaker = !_isSpeaker;
    final ok = await _telecomService.setSpeaker(newSpeaker);
    if (ok && mounted) setState(() => _isSpeaker = newSpeaker);
  }

  void _toggleHold() async {
    final nextHold = !_isOnHold;
    final ok = nextHold
        ? await _telecomService.holdCall()
        : await _telecomService.unholdCall();
    if (ok && mounted) {
      setState(() => _isOnHold = nextHold);
    }
  }

  void _endCall() async {
    await _telecomService.disconnect();
    if (mounted) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final resolvedContactName = (widget.contactName.isNotEmpty && widget.contactName != widget.phoneNumber)
        ? widget.contactName
        : (PhoneDataService.instance.getContactNameForNumber(widget.phoneNumber) ?? widget.contactName);
    final displayName = resolvedContactName.isNotEmpty ? resolvedContactName : widget.phoneNumber;

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
              const SizedBox(height: 24),

              // SIM badge
              if (widget.simName != null)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: OctalColors.purpleSim.withOpacity(0.25),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: OctalColors.purpleSim.withOpacity(0.5)),
                  ),
                  child: Text(
                    widget.simName!,
                    style: const TextStyle(
                      color: Color(0xFFC4B5FD),
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),

              const SizedBox(height: 16),

              // Contact Name
              Text(
                displayName,
                style: const TextStyle(
                  fontFamily: 'Ubuntu',
                  fontSize: 24,
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
                  style: const TextStyle(fontSize: 13, color: OctalColors.textSecondary),
                ),

              const SizedBox(height: 8),

              // Duration / Status
              Text(
                _callStatus == 'ACTIVE' ? _formatDuration(_seconds) : _callStatus,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: _callStatus == 'ACTIVE' ? OctalColors.primaryGold : OctalColors.textSecondary,
                ),
              ),

              const Spacer(),

              // Large Center Avatar DP
              Container(
                width: 120,
                height: 120,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: OctalColors.surfaceCard,
                  border: Border.all(color: OctalColors.borderGold, width: 2),
                  boxShadow: [
                    BoxShadow(
                      color: OctalColors.primaryGold.withOpacity(0.25),
                      blurRadius: 30,
                      spreadRadius: 2,
                    ),
                  ],
                ),
                child: Center(
                  child: initials.isNotEmpty
                      ? Text(
                          initials,
                          style: const TextStyle(
                            color: OctalColors.primaryGold,
                            fontSize: 44,
                            fontWeight: FontWeight.bold,
                            fontFamily: 'Ubuntu',
                            letterSpacing: 1.5,
                          ),
                        )
                      : const Icon(Icons.person, color: OctalColors.primaryGold, size: 64),
                ),
              ),

              const Spacer(),

              // In-call DTMF Keypad (collapsible)
              if (_showDtmf)
                Container(
                  margin: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: OctalColors.surfaceCard,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: OctalColors.border),
                  ),
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                        children: ['1', '2', '3'].map((d) => _buildDtmfKey(d)).toList(),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                        children: ['4', '5', '6'].map((d) => _buildDtmfKey(d)).toList(),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                        children: ['7', '8', '9'].map((d) => _buildDtmfKey(d)).toList(),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                        children: ['*', '0', '#'].map((d) => _buildDtmfKey(d)).toList(),
                      ),
                    ],
                  ),
                ),

              // In-Call Controls: Mute, Speaker, Keypad, Hold
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 28.0),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    _buildInCallControl(
                      icon: _isMuted ? Icons.mic_off_rounded : Icons.mic_rounded,
                      label: _isMuted ? 'Unmute' : 'Mute',
                      isActive: _isMuted,
                      onTap: _toggleMute,
                    ),
                    _buildInCallControl(
                      icon: _showDtmf ? Icons.dialpad_rounded : Icons.dialpad_outlined,
                      label: 'Keypad',
                      isActive: _showDtmf,
                      onTap: () => setState(() => _showDtmf = !_showDtmf),
                    ),
                    _buildInCallControl(
                      icon: _isSpeaker ? Icons.volume_up_rounded : Icons.volume_down_rounded,
                      label: 'Speaker',
                      isActive: _isSpeaker,
                      onTap: _toggleSpeaker,
                    ),
                    _buildInCallControl(
                      icon: _isOnHold ? Icons.play_arrow_rounded : Icons.pause_rounded,
                      label: _isOnHold ? 'Resume' : 'Hold',
                      isActive: _isOnHold,
                      onTap: _toggleHold,
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 36),

              // End Call Button
              GestureDetector(
                onTap: _endCall,
                child: Container(
                  width: 72,
                  height: 72,
                  decoration: BoxDecoration(
                    color: OctalColors.error,
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: OctalColors.error.withOpacity(0.4),
                        blurRadius: 24,
                        offset: const Offset(0, 4),
                      ),
                    ],
                  ),
                  child: const Center(
                    child: Icon(Icons.call_end_rounded, color: Colors.white, size: 36),
                  ),
                ),
              ),

              const SizedBox(height: 32),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildInCallControl({
    required IconData icon,
    required String label,
    required bool isActive,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        children: [
          Container(
            width: 58,
            height: 58,
            decoration: BoxDecoration(
              color: isActive ? OctalColors.primaryGold : OctalColors.surfaceCard,
              shape: BoxShape.circle,
              border: Border.all(color: isActive ? OctalColors.primaryGold : OctalColors.border),
            ),
            child: Center(
              child: Icon(icon, color: isActive ? Colors.black : Colors.white, size: 26),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            label,
            style: TextStyle(
              color: isActive ? OctalColors.primaryGold : OctalColors.textSecondary,
              fontSize: 12,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDtmfKey(String key) {
    return GestureDetector(
      onTap: () => _telecomService.sendDtmf(key),
      child: Container(
        width: 52,
        height: 44,
        decoration: BoxDecoration(
          color: OctalColors.surfaceElevated,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Center(
          child: Text(
            key,
            style: const TextStyle(fontSize: 18, color: Colors.white, fontWeight: FontWeight.bold),
          ),
        ),
      ),
    );
  }
}
