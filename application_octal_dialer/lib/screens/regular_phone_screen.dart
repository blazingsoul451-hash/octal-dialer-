import 'dart:async';
import 'package:flutter/material.dart';
import '../services/telecom_service.dart';
import '../services/phone_bridge_service.dart';
import '../widgets/octal_logo.dart';

/// Temporary Regular Phone Screen for Phase 2 Physical Testing.
///
/// Exposes:
/// 1. Real Default Dialer Status & Role Request (RoleManager.ROLE_DIALER)
/// 2. Minimal dialpad for physical GSM outgoing calls via TelecomManager.placeCall()
/// 3. Shared In-Call UI with genuine hardware controls (Mute, Speaker, DTMF, End, Answer)
class RegularPhoneScreen extends StatefulWidget {
  const RegularPhoneScreen({super.key});

  @override
  State<RegularPhoneScreen> createState() => _RegularPhoneScreenState();
}

class _RegularPhoneScreenState extends State<RegularPhoneScreen> {
  final TelecomService _telecom = TelecomService.instance;
  final PhoneBridgeService _bridge = PhoneBridgeService.instance;

  String _phoneNumber = '';
  bool _isDefaultDialer = false;
  bool _checkingRole = false;
  int? _selectedSimSlot;

  // Active in-call state
  StreamSubscription<TelecomCallEvent>? _callSub;
  TelecomCallEvent? _currentCall;
  bool _isMuted = false;
  bool _isSpeaker = false;
  int _callDurationSeconds = 0;
  Timer? _durationTimer;
  bool _showDtmfKeypad = false;

  @override
  void initState() {
    super.initState();
    _checkDefaultDialerStatus();
    _initSimSelection();
    _initCallListener();
  }

  @override
  void dispose() {
    _callSub?.cancel();
    _durationTimer?.cancel();
    super.dispose();
  }

  Future<void> _checkDefaultDialerStatus() async {
    setState(() => _checkingRole = true);
    final isDefault = await _telecom.isDefaultDialer();
    if (mounted) {
      setState(() {
        _isDefaultDialer = isDefault;
        _checkingRole = false;
      });
    }
  }

  Future<void> _requestDefaultDialer() async {
    setState(() => _checkingRole = true);
    final result = await _telecom.requestDefaultDialerRole();
    if (mounted) {
      setState(() {
        _isDefaultDialer = result;
        _checkingRole = false;
      });
    }
  }

  void _initSimSelection() {
    _selectedSimSlot = _bridge.selectedSimSlot;
    if (_selectedSimSlot == null && _bridge.sims.isNotEmpty) {
      _selectedSimSlot = _bridge.sims.first['slot'] as int?;
    }
  }

  void _initCallListener() {
    _callSub = _telecom.callEvents.listen((event) {
      debugPrint('[RegularPhone] Telecom call event: ${event.type} state=${event.state} id=${event.callId}');
      if (mounted) {
        setState(() {
          if (event.type == 'removed' || event.state == 'DISCONNECTED') {
            _currentCall = null;
            _durationTimer?.cancel();
            _callDurationSeconds = 0;
            _showDtmfKeypad = false;
          } else {
            _currentCall = event;
            if (event.isMuted != null) _isMuted = event.isMuted!;
            if (event.audioRoute != null) {
              _isSpeaker = event.audioRoute == 'SPEAKER';
            }
            if (event.state == 'ACTIVE') {
              _startDurationTimer();
            }
          }
        });
      }
    });

    // Check if there is already an active call
    _telecom.getInCallDetails().then((details) {
      if (details != null && mounted) {
        setState(() {
          _currentCall = TelecomCallEvent(
            type: 'snapshot',
            callId: details['callId']?.toString() ?? '',
            phoneNumber: details['phoneNumber']?.toString() ?? '',
            state: details['state']?.toString() ?? '',
            isIncoming: details['isIncoming'] == true,
            isMuted: details['isMuted'] as bool?,
            audioRoute: details['audioRoute']?.toString(),
          );
          _isMuted = details['isMuted'] == true;
          _isSpeaker = details['isSpeaker'] == true;
          if (details['state'] == 'ACTIVE') {
            _callDurationSeconds = details['duration'] as int? ?? 0;
            _startDurationTimer();
          }
        });
      }
    });
  }

  void _startDurationTimer() {
    _durationTimer?.cancel();
    _durationTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted && _currentCall?.state == 'ACTIVE') {
        setState(() => _callDurationSeconds++);
      }
    });
  }

  void _onDigitPressed(String digit) {
    if (_showDtmfKeypad && _currentCall?.state == 'ACTIVE') {
      _telecom.sendDtmf(digit);
      return;
    }
    setState(() {
      _phoneNumber += digit;
    });
  }

  void _onBackspace() {
    if (_phoneNumber.isNotEmpty) {
      setState(() {
        _phoneNumber = _phoneNumber.substring(0, _phoneNumber.length - 1);
      });
    }
  }

  Future<void> _placeCall() async {
    if (_phoneNumber.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a phone number to dial')),
      );
      return;
    }

    final success = await _telecom.placeCall(_phoneNumber, simSlot: _selectedSimSlot);
    if (!success && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Failed to place call via TelecomManager. Verify default dialer / permissions.'),
          backgroundColor: Colors.redAccent,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: OctalColors.bgDark,
      appBar: AppBar(
        title: const Text(
          'Octal Regular Phone (Phase 2 Test)',
          style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
        ),
        backgroundColor: OctalColors.surfaceCard,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, size: 20),
            onPressed: _checkDefaultDialerStatus,
            tooltip: 'Refresh Role Status',
          ),
        ],
      ),
      body: SafeArea(
        child: Stack(
          children: [
            // Main Dialpad Interface
            Column(
              children: [
                _buildDefaultDialerBanner(),
                if (_bridge.sims.isNotEmpty) _buildSimSelector(),
                _buildNumberDisplay(),
                const Divider(color: OctalColors.border, height: 1),
                Expanded(child: _buildKeypad()),
                _buildCallButton(),
                const SizedBox(height: 12),
              ],
            ),

            // Active In-Call Overlay (Telecom In-Call UI)
            if (_currentCall != null) _buildInCallOverlay(),
          ],
        ),
      ),
    );
  }

  Widget _buildDefaultDialerBanner() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: _isDefaultDialer
            ? OctalColors.success.withOpacity(0.12)
            : OctalColors.primaryGold.withOpacity(0.12),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: _isDefaultDialer
              ? OctalColors.success.withOpacity(0.5)
              : OctalColors.primaryGold.withOpacity(0.5),
        ),
      ),
      child: Row(
        children: [
          Icon(
            _isDefaultDialer ? Icons.check_circle : Icons.warning_amber_rounded,
            color: _isDefaultDialer ? OctalColors.success : OctalColors.primaryGold,
            size: 22,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _isDefaultDialer ? 'Octal is Default Phone App' : 'Octal is NOT Default Dialer',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 13,
                    color: _isDefaultDialer ? OctalColors.success : OctalColors.primaryGold,
                  ),
                ),
                Text(
                  _isDefaultDialer
                      ? 'Android Telecom binds to OctalInCallService'
                      : 'Tap button to grant RoleManager.ROLE_DIALER',
                  style: const TextStyle(fontSize: 11, color: OctalColors.textSecondary),
                ),
              ],
            ),
          ),
          if (!_isDefaultDialer)
            ElevatedButton(
              onPressed: _checkingRole ? null : _requestDefaultDialer,
              style: ElevatedButton.styleFrom(
                backgroundColor: OctalColors.primaryGold,
                foregroundColor: OctalColors.bgDark,
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                textStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 11),
              ),
              child: _checkingRole
                  ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Text('Set as Default'),
            ),
        ],
      ),
    );
  }

  Widget _buildSimSelector() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: _bridge.sims.map((sim) {
          final slot = sim['slot'] as int? ?? 0;
          final carrier = sim['carrierName']?.toString() ?? 'SIM ${slot + 1}';
          final isSelected = _selectedSimSlot == slot;
          return Padding(
            padding: const EdgeInsets.symmetric(horizontal: 6.0),
            child: ChoiceChip(
              label: Text(
                'SIM ${slot + 1}: $carrier',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.bold,
                  color: isSelected ? OctalColors.bgDark : Colors.white,
                ),
              ),
              selected: isSelected,
              selectedColor: OctalColors.primaryGold,
              backgroundColor: OctalColors.surfaceCard,
              onSelected: (_) => setState(() => _selectedSimSlot = slot),
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildNumberDisplay() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      child: Row(
        children: [
          Expanded(
            child: Text(
              _phoneNumber.isEmpty ? 'Enter number...' : _phoneNumber,
              style: TextStyle(
                fontFamily: 'monospace',
                fontSize: _phoneNumber.length > 12 ? 22 : 28,
                fontWeight: FontWeight.bold,
                color: _phoneNumber.isEmpty ? OctalColors.textMuted : Colors.white,
              ),
              textAlign: TextAlign.center,
            ),
          ),
          if (_phoneNumber.isNotEmpty)
            GestureDetector(
              onLongPress: () => setState(() => _phoneNumber = ''),
              child: IconButton(
                icon: const Icon(Icons.backspace_outlined, color: OctalColors.textSecondary),
                onPressed: _onBackspace,
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildKeypad() {
    final keys = [
      ['1', '2', '3'],
      ['4', '5', '6'],
      ['7', '8', '9'],
      ['*', '0', '#'],
    ];

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 28.0),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: keys.map((row) {
          return Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: row.map((key) {
              return InkWell(
                onTap: () => _onDigitPressed(key),
                onLongPress: key == '0' ? () => _onDigitPressed('+') : null,
                borderRadius: BorderRadius.circular(40),
                child: Container(
                  width: 68,
                  height: 68,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: OctalColors.surfaceCard,
                    border: Border.all(color: OctalColors.border),
                  ),
                  child: Center(
                    child: Text(
                      key,
                      style: const TextStyle(
                        fontSize: 26,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ),
              );
            }).toList(),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildCallButton() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 36.0),
      child: SizedBox(
        width: double.infinity,
        height: 56,
        child: ElevatedButton.icon(
          onPressed: _placeCall,
          style: ElevatedButton.styleFrom(
            backgroundColor: OctalColors.success,
            foregroundColor: Colors.white,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
            elevation: 4,
          ),
          icon: const Icon(Icons.call, size: 24),
          label: const Text(
            'CALL VIA TELECOM',
            style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, letterSpacing: 1),
          ),
        ),
      ),
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SHARED TELECOM IN-CALL OVERLAY (Genuine Hardware Controls)
  // ══════════════════════════════════════════════════════════════════════════
  Widget _buildInCallOverlay() {
    final call = _currentCall!;
    final isIncoming = call.isIncoming && call.state == 'RINGING';
    final isActive = call.state == 'ACTIVE';

    final minutes = (_callDurationSeconds ~/ 60).toString().padLeft(2, '0');
    final seconds = (_callDurationSeconds % 60).toString().padLeft(2, '0');

    return Container(
      color: OctalColors.bgDark.withOpacity(0.97),
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          // Top Call Status
          Column(
            children: [
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                decoration: BoxDecoration(
                  color: isActive
                      ? OctalColors.success.withOpacity(0.2)
                      : OctalColors.primaryGold.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: isActive ? OctalColors.success : OctalColors.primaryGold,
                  ),
                ),
                child: Text(
                  isIncoming ? 'INCOMING GSM CALL' : 'TELECOM: ${call.state}',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 1.2,
                    color: isActive ? OctalColors.success : OctalColors.primaryGold,
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Text(
                call.phoneNumber.isNotEmpty ? call.phoneNumber : _phoneNumber,
                style: const TextStyle(
                  fontSize: 26,
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                isActive ? '$minutes:$seconds' : 'Connecting...',
                style: const TextStyle(
                  fontFamily: 'monospace',
                  fontSize: 18,
                  color: OctalColors.textSecondary,
                ),
              ),
            ],
          ),

          // DTMF Keypad View (if opened)
          if (_showDtmfKeypad)
            Expanded(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Text('In-Call DTMF Keypad (Real Tones)', style: TextStyle(color: OctalColors.textSecondary, fontSize: 12)),
                  const SizedBox(height: 8),
                  Expanded(child: _buildKeypad()),
                ],
              ),
            )
          else
            const Spacer(),

          // Hardware Controls Row
          if (!isIncoming) ...[
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                _buildInCallButton(
                  icon: _isMuted ? Icons.mic_off : Icons.mic,
                  label: _isMuted ? 'Muted' : 'Mute',
                  isActive: _isMuted,
                  onTap: () async {
                    final next = !_isMuted;
                    await _telecom.setMuted(next);
                    setState(() => _isMuted = next);
                  },
                ),
                _buildInCallButton(
                  icon: _showDtmfKeypad ? Icons.keyboard_hide : Icons.dialpad,
                  label: 'Keypad',
                  isActive: _showDtmfKeypad,
                  onTap: () => setState(() => _showDtmfKeypad = !_showDtmfKeypad),
                ),
                _buildInCallButton(
                  icon: _isSpeaker ? Icons.volume_up : Icons.volume_down,
                  label: _isSpeaker ? 'Speaker' : 'Earpiece',
                  isActive: _isSpeaker,
                  onTap: () async {
                    final next = !_isSpeaker;
                    await _telecom.setSpeaker(next);
                    setState(() => _isSpeaker = next);
                  },
                ),
              ],
            ),
            const SizedBox(height: 24),
            // End Call
            SizedBox(
              width: double.infinity,
              height: 56,
              child: ElevatedButton.icon(
                onPressed: () => _telecom.disconnect(),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.redAccent,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
                ),
                icon: const Icon(Icons.call_end, size: 24),
                label: const Text('END CALL', style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
              ),
            ),
          ] else ...[
            // Incoming Call Answer / Reject
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                ElevatedButton.icon(
                  onPressed: () => _telecom.disconnect(),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.redAccent,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
                  ),
                  icon: const Icon(Icons.call_end),
                  label: const Text('REJECT', style: TextStyle(fontWeight: FontWeight.bold)),
                ),
                ElevatedButton.icon(
                  onPressed: () => _telecom.answer(),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: OctalColors.success,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
                  ),
                  icon: const Icon(Icons.call),
                  label: const Text('ANSWER', style: TextStyle(fontWeight: FontWeight.bold)),
                ),
              ],
            ),
          ],
          const SizedBox(height: 12),
        ],
      ),
    );
  }

  Widget _buildInCallButton({
    required IconData icon,
    required String label,
    required bool isActive,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(36),
      child: Column(
        children: [
          Container(
            width: 60,
            height: 60,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: isActive ? OctalColors.primaryGold : OctalColors.surfaceCard,
              border: Border.all(
                color: isActive ? OctalColors.primaryGold : OctalColors.border,
              ),
            ),
            child: Icon(
              icon,
              color: isActive ? OctalColors.bgDark : Colors.white,
              size: 26,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            label,
            style: TextStyle(
              fontSize: 12,
              color: isActive ? OctalColors.primaryGold : OctalColors.textSecondary,
            ),
          ),
        ],
      ),
    );
  }
}
