import 'package:flutter/material.dart';
import '../../../services/dialer_settings_service.dart';

class FlipToSilenceScreen extends StatefulWidget {
  const FlipToSilenceScreen({super.key});

  @override
  State<FlipToSilenceScreen> createState() => _FlipToSilenceScreenState();
}

class _FlipToSilenceScreenState extends State<FlipToSilenceScreen> {
  final DialerSettingsService _settings = DialerSettingsService.instance;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF1F1C19),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1F1C19),
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Color(0xFFF0DFD8)),
          onPressed: () => Navigator.pop(context),
        ),
        title: const Text(
          'Flip To Silence',
          style: TextStyle(color: Color(0xFFF0DFD8), fontSize: 20, fontWeight: FontWeight.w500),
        ),
      ),
      body: ListView(
        children: [
          const SizedBox(height: 24),
          Center(
            child: Container(
              width: 100,
              height: 100,
              decoration: BoxDecoration(
                color: const Color(0xFF28231F),
                shape: BoxShape.circle,
                border: Border.all(color: const Color(0xFF382923), width: 1.5),
              ),
              child: const Icon(
                Icons.screen_rotation_outlined,
                color: Color(0xFF5BB974),
                size: 48,
              ),
            ),
          ),
          const SizedBox(height: 20),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24.0),
            child: Text(
              'To silence an incoming call, place your phone face down on a flat surface.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: const Color(0xFFA49691).withOpacity(0.9),
                fontSize: 14.5,
                height: 1.4,
              ),
            ),
          ),
          const SizedBox(height: 28),
          const Divider(color: Color(0xFF2E2622), height: 1),
          SwitchListTile(
            title: const Text(
              'Flip To Silence',
              style: TextStyle(color: Color(0xFFF0DFD8), fontSize: 16),
            ),
            value: _settings.flipToSilence,
            activeColor: const Color(0xFF5BB974),
            activeTrackColor: const Color(0xFF1E4D2B),
            onChanged: (val) async {
              final prev = _settings.flipToSilence;
              try {
                await _settings.setFlipToSilence(val);
                if (mounted) setState(() {});
              } catch (e) {
                if (mounted) setState(() => _settings.setFlipToSilence(prev));
              }
            },
          ),
        ],
      ),
    );
  }
}
