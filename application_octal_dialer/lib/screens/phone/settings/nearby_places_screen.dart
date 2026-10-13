import 'package:flutter/material.dart';
import '../../../services/dialer_settings_service.dart';

class NearbyPlacesScreen extends StatefulWidget {
  const NearbyPlacesScreen({super.key});

  @override
  State<NearbyPlacesScreen> createState() => _NearbyPlacesScreenState();
}

class _NearbyPlacesScreenState extends State<NearbyPlacesScreen> {
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
          'Nearby places',
          style: TextStyle(color: Color(0xFFF0DFD8), fontSize: 20, fontWeight: FontWeight.w500),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(vertical: 8),
        children: [
          SwitchListTile(
            title: const Text('Nearby places', style: TextStyle(color: Color(0xFFF0DFD8), fontSize: 16)),
            subtitle: const Text(
              'When searching from the dialer, use your location to show nearby businesses and points of interest.',
              style: TextStyle(color: Color(0xFFA49691), fontSize: 13),
            ),
            value: _settings.nearbyPlaces,
            activeColor: const Color(0xFF5BB974),
            activeTrackColor: const Color(0xFF1E4D2B),
            onChanged: (val) {
              setState(() => _settings.setNearbyPlaces(val));
            },
          ),
        ],
      ),
    );
  }
}
