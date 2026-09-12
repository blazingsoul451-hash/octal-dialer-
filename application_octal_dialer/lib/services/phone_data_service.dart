import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import '../models/phone_models.dart';

class PhoneDataService {
  static final PhoneDataService _instance = PhoneDataService._internal();
  static PhoneDataService get instance => _instance;
  PhoneDataService._internal();

  static const MethodChannel _channel = MethodChannel('com.octal.dialer/call');

  List<PhoneContact> _contacts = [];
  List<PhoneRecentCall> _recentCalls = [];
  bool _initialized = false;
  final ValueNotifier<String> pendingKeypadNumber = ValueNotifier<String>('');
  final Set<String> _blockedNumbers = {};

  List<PhoneContact> get contacts => _contacts;
  List<PhoneRecentCall> get recentCalls => _recentCalls;
  List<PhoneContact> get favorites => _contacts.where((c) => c.isFavorite).toList();
  bool get isInitialized => _initialized;

  bool isNumberBlocked(String number) {
    final clean = number.replaceAll(RegExp(r'[^0-9+]'), '');
    return _blockedNumbers.contains(clean);
  }

  void blockNumber(String number) {
    final clean = number.replaceAll(RegExp(r'[^0-9+]'), '');
    _blockedNumbers.add(clean);
    for (int i = 0; i < _recentCalls.length; i++) {
      if (_recentCalls[i].number == number || _recentCalls[i].number.replaceAll(RegExp(r'[^0-9+]'), '') == clean) {
        _recentCalls[i] = PhoneRecentCall(
          id: _recentCalls[i].id,
          name: _recentCalls[i].name,
          number: _recentCalls[i].number,
          direction: CallDirection.blocked,
          timestamp: _recentCalls[i].timestamp,
          durationSeconds: _recentCalls[i].durationSeconds,
          simName: _recentCalls[i].simName,
          isSpam: true,
        );
      }
    }
  }

  void deleteCallLog(String id) {
    _recentCalls.removeWhere((c) => c.id == id);
  }

  Future<void> loadData() async {
    await Future.wait([
      fetchContacts(),
      fetchCallLogs(),
    ]);
    _initialized = true;
  }

  Future<List<PhoneContact>> fetchContacts() async {
    try {
      final List<dynamic>? raw = await _channel.invokeMethod<List<dynamic>>('getDeviceContacts');
      if (raw != null && raw.isNotEmpty) {
        _contacts = raw.map((item) {
          final m = Map<String, dynamic>.from(item as Map);
          return PhoneContact(
            id: m['id']?.toString() ?? '',
            name: m['name']?.toString() ?? 'Unknown',
            number: m['number']?.toString() ?? '',
            isFavorite: m['isFavorite'] == true,
          );
        }).toList();
        return _contacts;
      }
    } catch (e) {
      debugPrint('[PhoneDataService] fetchContacts native error: $e');
    }

    // Default reference contacts if native list is empty
    if (_contacts.isEmpty) {
      _contacts = _generateSampleContacts();
    }
    return _contacts;
  }

  Future<List<PhoneRecentCall>> fetchCallLogs() async {
    try {
      final List<dynamic>? raw = await _channel.invokeMethod<List<dynamic>>('getDeviceCallLogs');
      if (raw != null && raw.isNotEmpty) {
        _recentCalls = raw.map((item) {
          final m = Map<String, dynamic>.from(item as Map);
          final typeStr = m['type']?.toString() ?? 'INCOMING';
          CallDirection dir;
          switch (typeStr) {
            case 'OUTGOING':
              dir = CallDirection.outgoing;
              break;
            case 'MISSED':
              dir = CallDirection.missed;
              break;
            case 'REJECTED':
              dir = CallDirection.rejected;
              break;
            case 'BLOCKED':
              dir = CallDirection.blocked;
              break;
            default:
              dir = CallDirection.incoming;
          }

          final tsMillis = m['timestamp'] is int ? m['timestamp'] as int : DateTime.now().millisecondsSinceEpoch;
          final simId = m['simId']?.toString() ?? '';
          final simName = simId == '4' ? 'ZONG' : (simId == '3' ? 'Jazz' : 'ZONG');

          return PhoneRecentCall(
            id: m['id']?.toString() ?? '',
            name: m['name']?.toString() ?? (m['number']?.toString() ?? 'Unknown'),
            number: m['number']?.toString() ?? '',
            direction: dir,
            timestamp: DateTime.fromMillisecondsSinceEpoch(tsMillis),
            durationSeconds: m['duration'] is int ? m['duration'] as int : 0,
            simName: simName,
          );
        }).toList();
        return _recentCalls;
      }
    } catch (e) {
      debugPrint('[PhoneDataService] fetchCallLogs native error: $e');
    }

    // Default reference calls if native log is empty
    if (_recentCalls.isEmpty) {
      _recentCalls = _generateSampleCalls();
    }
    return _recentCalls;
  }

  static const Map<String, String> _t9Map = {
    'a': '2', 'b': '2', 'c': '2',
    'd': '3', 'e': '3', 'f': '3',
    'g': '4', 'h': '4', 'i': '4',
    'j': '5', 'k': '5', 'l': '5',
    'm': '6', 'n': '6', 'o': '6',
    'p': '7', 'q': '7', 'r': '7', 's': '7',
    't': '8', 'u': '8', 'v': '8',
    'w': '9', 'x': '9', 'y': '9', 'z': '9',
  };

  String _nameToT9(String name) {
    final sb = StringBuffer();
    for (int i = 0; i < name.length; i++) {
      final c = name[i].toLowerCase();
      sb.write(_t9Map[c] ?? '');
    }
    return sb.toString();
  }

  List<PhoneContact> searchContacts(String query) {
    if (query.isEmpty) return _contacts;
    final cleanQ = query.toLowerCase().trim();
    final numberQ = query.replaceAll(RegExp(r'[^0-9+]'), '');

    return _contacts.where((c) {
      final matchesName = c.name.toLowerCase().contains(cleanQ);
      final matchesNumber = numberQ.isNotEmpty && c.number.replaceAll(RegExp(r'[^0-9+]'), '').contains(numberQ);
      final matchesT9 = numberQ.isNotEmpty && _nameToT9(c.name).contains(numberQ);
      return matchesName || matchesNumber || matchesT9;
    }).toList();
  }

  List<PhoneRecentCall> filterRecentCalls(String filter) {
    switch (filter) {
      case 'Missed':
        return _recentCalls.where((c) => c.direction == CallDirection.missed || c.direction == CallDirection.rejected).toList();
      case 'Contacts':
        return _recentCalls.where((c) => c.name != c.number).toList();
      case 'Non-spam':
        return _recentCalls.where((c) => !c.isSpam && c.direction != CallDirection.blocked).toList();
      case 'All':
      default:
        return _recentCalls;
    }
  }

  List<PhoneContact> _generateSampleContacts() {
    return [
      PhoneContact(
        id: '1',
        name: 'Abad Shah Da...',
        number: '+92 300 1234567',
        isFavorite: true,
      ),
      PhoneContact(
        id: '2',
        name: 'Abdul Rehman...',
        number: '+92 301 2345678',
        isFavorite: true,
      ),
      PhoneContact(
        id: '3',
        name: 'Drishfaq ishfaq',
        number: '+92 302 3456789',
        isFavorite: true,
      ),
      PhoneContact(
        id: '4',
        name: 'Fahad Ali New',
        number: '+92 303 4567890',
        isFavorite: true,
      ),
      PhoneContact(
        id: '5',
        name: 'Baba Faizi',
        number: '0300 4717059',
        isFavorite: true,
      ),
      PhoneContact(
        id: '6',
        name: 'Nadia Babar',
        number: '032-343-21246',
        isFavorite: false,
      ),
      PhoneContact(
        id: '7',
        name: '0327 8841614',
        number: '0327 8841614',
        isFavorite: false,
      ),
      PhoneContact(
        id: '8',
        name: 'Shalamar Fish',
        number: '03224048133',
        isFavorite: false,
      ),
      PhoneContact(
        id: '9',
        name: 'NADIA API',
        number: '0312 9876543',
        isFavorite: false,
      ),
      PhoneContact(
        id: '10',
        name: 'OJahanzaib Bhi',
        number: '0314 7654321',
        isFavorite: false,
      ),
      PhoneContact(
        id: '11',
        name: 'Talha Bhai Oa',
        number: '0315 6543210',
        isFavorite: false,
      ),
    ];
  }

  List<PhoneRecentCall> _generateSampleCalls() {
    final now = DateTime.now();
    return [
      PhoneRecentCall(
        id: 'c1',
        name: 'NADIA API',
        number: '0323 4321246',
        direction: CallDirection.incoming,
        timestamp: now.subtract(const Duration(minutes: 27)),
        durationSeconds: 145,
        simName: 'ZONG',
      ),
      PhoneRecentCall(
        id: 'c2',
        name: 'NADIA API',
        number: '0323 4321246',
        direction: CallDirection.outgoing,
        timestamp: now.subtract(const Duration(minutes: 29)),
        durationSeconds: 88,
        simName: 'ZONG',
      ),
      PhoneRecentCall(
        id: 'c3',
        name: 'NADIA API',
        number: '0323 4321246',
        direction: CallDirection.incoming,
        timestamp: now.subtract(const Duration(minutes: 41)),
        durationSeconds: 210,
        simName: 'ZONG',
      ),
      PhoneRecentCall(
        id: 'c4',
        name: 'NADIA API',
        number: '0323 4321246',
        direction: CallDirection.outgoing,
        timestamp: now.subtract(const Duration(minutes: 41)),
        durationSeconds: 65,
        simName: 'ZONG',
      ),
      PhoneRecentCall(
        id: 'c5',
        name: '0312 9876543',
        number: '0312 9876543',
        direction: CallDirection.outgoing,
        timestamp: now.subtract(const Duration(minutes: 55)),
        durationSeconds: 0,
        simName: 'ZONG',
      ),
      PhoneRecentCall(
        id: 'c6',
        name: 'NADIA API',
        number: '0323 4321246',
        direction: CallDirection.incoming,
        timestamp: now.subtract(const Duration(hours: 2)),
        durationSeconds: 180,
        simName: 'ZONG',
      ),
      PhoneRecentCall(
        id: 'c7',
        name: 'Baba Faizi',
        number: '0300 4717059',
        direction: CallDirection.outgoing,
        timestamp: now.subtract(const Duration(days: 1, hours: 3)),
        durationSeconds: 88,
        simName: 'ZONG',
      ),
      PhoneRecentCall(
        id: 'c8',
        name: 'OJahanzaib Bhi',
        number: '0314 7654321',
        direction: CallDirection.incoming,
        timestamp: now.subtract(const Duration(days: 1, hours: 6)),
        durationSeconds: 210,
        simName: 'ZONG',
      ),
      PhoneRecentCall(
        id: 'c9',
        name: 'Talha Bhai Oa',
        number: '0315 6543210',
        direction: CallDirection.missed,
        timestamp: now.subtract(const Duration(days: 1, hours: 8)),
        durationSeconds: 0,
        simName: 'ZONG',
      ),
    ];
  }
}
