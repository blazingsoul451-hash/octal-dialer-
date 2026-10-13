import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

class DialerSettingsService extends ChangeNotifier {
  static final DialerSettingsService _instance = DialerSettingsService._internal();
  static DialerSettingsService get instance => _instance;
  DialerSettingsService._internal();

  bool _initialized = false;
  bool get isInitialized => _initialized;

  // Settings properties
  bool _callerIdAndSpam = true;
  bool _filterSpam = true;
  bool _verifiedCalls = true;

  String _ttyMode = 'off'; // 'off', 'full', 'hco', 'vco'
  bool _hearingAids = false;

  bool _blockUnknown = false;
  List<String> _blockedNumbers = [];

  int _preferredSim = -1; // -1: Ask every time, 0: SIM 1, 1: SIM 2
  String _sortBy = 'first'; // 'first', 'last'
  String _nameFormat = 'first_first'; // 'first_first', 'last_first'
  String _themeMode = 'system'; // 'system', 'dark', 'light'
  bool _nearbyPlaces = true;

  List<String> _quickResponses = [
    "Can't talk now. What's up?",
    "I'll call you right back.",
    "I'll call you later.",
    "Can't talk now. Call me later?",
  ];

  String _phoneRingtone = 'Default ringtone';
  bool _callVibrate = true;
  bool _dialpadTones = true;
  bool _dialpadVibrate = true;

  String _callerIdAnnouncement = 'never'; // 'never', 'headset', 'always'
  bool _flipToSilence = false;

  // Getters
  bool get callerIdAndSpam => _callerIdAndSpam;
  bool get filterSpam => _filterSpam;
  bool get verifiedCalls => _verifiedCalls;
  String get ttyMode => _ttyMode;
  bool get hearingAids => _hearingAids;
  bool get blockUnknown => _blockUnknown;
  List<String> get blockedNumbers => List.unmodifiable(_blockedNumbers);
  int get preferredSim => _preferredSim;
  String get sortBy => _sortBy;
  String get nameFormat => _nameFormat;
  String get themeMode => _themeMode;
  bool get nearbyPlaces => _nearbyPlaces;
  List<String> get quickResponses => List.unmodifiable(_quickResponses);
  String get phoneRingtone => _phoneRingtone;
  bool get callVibrate => _callVibrate;
  bool get dialpadTones => _dialpadTones;
  bool get dialpadVibrate => _dialpadVibrate;
  String get callerIdAnnouncement => _callerIdAnnouncement;
  bool get flipToSilence => _flipToSilence;

  Future<void> init() async {
    if (_initialized) return;
    try {
      final prefs = await SharedPreferences.getInstance();
      _callerIdAndSpam = prefs.getBool('caller_id_and_spam') ?? true;
      _filterSpam = prefs.getBool('filter_spam') ?? true;
      _verifiedCalls = prefs.getBool('verified_calls') ?? true;
      _ttyMode = prefs.getString('tty_mode') ?? 'off';
      _hearingAids = prefs.getBool('hearing_aids') ?? false;
      _blockUnknown = prefs.getBool('block_unknown') ?? false;
      _blockedNumbers = prefs.getStringList('blocked_numbers') ?? [];
      _preferredSim = prefs.getInt('preferred_sim') ?? -1;
      _sortBy = prefs.getString('sort_by') ?? 'first';
      _nameFormat = prefs.getString('name_format') ?? 'first_first';
      _themeMode = prefs.getString('theme_mode') ?? 'system';
      _nearbyPlaces = prefs.getBool('nearby_places') ?? true;
      _quickResponses = prefs.getStringList('quick_responses') ?? [
        "Can't talk now. What's up?",
        "I'll call you right back.",
        "I'll call you later.",
        "Can't talk now. Call me later?",
      ];
      _phoneRingtone = prefs.getString('phone_ringtone') ?? 'Default ringtone';
      _callVibrate = prefs.getBool('call_vibrate') ?? true;
      _dialpadTones = prefs.getBool('dialpad_tones') ?? true;
      _dialpadVibrate = prefs.getBool('dialpad_vibrate') ?? true;
      _callerIdAnnouncement = prefs.getString('caller_id_announcement') ?? 'never';
      _flipToSilence = prefs.getBool('flip_to_silence') ?? false;
      _initialized = true;
      notifyListeners();
    } catch (e) {
      debugPrint('[DialerSettingsService] init error: $e');
    }
  }

  // Setters with persistent storage
  Future<void> setCallerIdAndSpam(bool value) async {
    _callerIdAndSpam = value;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('caller_id_and_spam', value);
  }

  Future<void> setFilterSpam(bool value) async {
    _filterSpam = value;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('filter_spam', value);
  }

  Future<void> setVerifiedCalls(bool value) async {
    _verifiedCalls = value;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('verified_calls', value);
  }

  Future<void> setTtyMode(String value) async {
    _ttyMode = value;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('tty_mode', value);
  }

  Future<void> setHearingAids(bool value) async {
    _hearingAids = value;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('hearing_aids', value);
  }

  Future<void> setBlockUnknown(bool value) async {
    _blockUnknown = value;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('block_unknown', value);
  }

  Future<void> addBlockedNumber(String number) async {
    final clean = number.trim();
    if (clean.isNotEmpty && !_blockedNumbers.contains(clean)) {
      _blockedNumbers.add(clean);
      notifyListeners();
      final prefs = await SharedPreferences.getInstance();
      await prefs.setStringList('blocked_numbers', _blockedNumbers);
    }
  }

  Future<void> removeBlockedNumber(String number) async {
    if (_blockedNumbers.remove(number.trim())) {
      notifyListeners();
      final prefs = await SharedPreferences.getInstance();
      await prefs.setStringList('blocked_numbers', _blockedNumbers);
    }
  }

  Future<void> setPreferredSim(int value) async {
    _preferredSim = value;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt('preferred_sim', value);
  }

  Future<void> setSortBy(String value) async {
    _sortBy = value;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('sort_by', value);
  }

  Future<void> setNameFormat(String value) async {
    _nameFormat = value;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('name_format', value);
  }

  Future<void> setThemeMode(String value) async {
    _themeMode = value;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('theme_mode', value);
  }

  Future<void> setNearbyPlaces(bool value) async {
    _nearbyPlaces = value;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('nearby_places', value);
  }

  Future<void> updateQuickResponse(int index, String text) async {
    if (index >= 0 && index < _quickResponses.length && text.trim().isNotEmpty) {
      _quickResponses[index] = text.trim();
      notifyListeners();
      final prefs = await SharedPreferences.getInstance();
      await prefs.setStringList('quick_responses', _quickResponses);
    }
  }

  Future<void> setCallVibrate(bool value) async {
    _callVibrate = value;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('call_vibrate', value);
  }

  Future<void> setDialpadTones(bool value) async {
    _dialpadTones = value;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('dialpad_tones', value);
  }

  Future<void> setDialpadVibrate(bool value) async {
    _dialpadVibrate = value;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('dialpad_vibrate', value);
  }

  Future<void> setCallerIdAnnouncement(String value) async {
    _callerIdAnnouncement = value;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('caller_id_announcement', value);
  }

  Future<void> setFlipToSilence(bool value) async {
    _flipToSilence = value;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('flip_to_silence', value);
  }
}
