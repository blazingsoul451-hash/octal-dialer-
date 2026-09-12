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

  String? getContactNameForNumber(String number) {
    if (number.isEmpty) return null;
    final clean = number.replaceAll(RegExp(r'[^0-9]'), '');
    if (clean.isEmpty) return null;

    for (final c in _contacts) {
      final contactClean = c.number.replaceAll(RegExp(r'[^0-9]'), '');
      if (contactClean.isEmpty) continue;

      if (clean == contactClean) {
        if (c.name.isNotEmpty && c.name != c.number) return c.name;
      }

      final minLen = clean.length < contactClean.length ? clean.length : contactClean.length;
      final matchLen = minLen >= 10 ? 10 : (minLen >= 7 ? 7 : minLen);
      if (matchLen >= 7) {
        final sub1 = clean.substring(clean.length - matchLen);
        final sub2 = contactClean.substring(contactClean.length - matchLen);
        if (sub1 == sub2) {
          if (c.name.isNotEmpty && c.name != c.number) return c.name;
        }
      }
    }
    return null;
  }

  Future<bool> saveContact({required String name, required String number, String? email}) async {
    try {
      final bool? res = await _channel.invokeMethod<bool>('saveDeviceContact', {
        'name': name,
        'number': number,
        'email': email,
      });
      if (res == true) {
        await loadData();
        return true;
      }
    } catch (e) {
      debugPrint('[PhoneDataService] saveContact error: $e');
    }
    // Fallback: update in-memory contacts
    final newContact = PhoneContact(
      id: 'contact_${DateTime.now().millisecondsSinceEpoch}',
      name: name,
      number: number,
      isFavorite: false,
    );
    _contacts.insert(0, newContact);
    return true;
  }

  Future<void> loadData() async {
    await fetchContacts();
    await fetchCallLogs();
    _initialized = true;
  }

  Future<List<PhoneContact>> fetchContacts() async {
    try {
      final List<dynamic>? raw = await _channel.invokeMethod<List<dynamic>>('getDeviceContacts');
      if (raw != null) {
        _contacts = raw.map((item) {
          final m = Map<String, dynamic>.from(item as Map);
          final rawName = m['name']?.toString().trim() ?? '';
          final rawNumber = m['number']?.toString().trim() ?? '';
          final displayName = rawName.isNotEmpty ? rawName : (rawNumber.isNotEmpty ? rawNumber : 'Unknown');
          return PhoneContact(
            id: m['id']?.toString() ?? '',
            name: displayName,
            number: rawNumber,
            isFavorite: m['isFavorite'] == true,
          );
        }).toList();
        return _contacts;
      }
    } catch (e) {
      debugPrint('[PhoneDataService] fetchContacts native error: $e');
    }

    return _contacts;
  }

  Future<List<PhoneRecentCall>> fetchCallLogs() async {
    try {
      final List<dynamic>? raw = await _channel.invokeMethod<List<dynamic>>('getDeviceCallLogs');
      if (raw != null) {
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
          final rawNum = m['number']?.toString().trim() ?? '';
          final rawName = m['name']?.toString().trim() ?? '';

          // Cross-reference with contacts by normalized number
          final resolvedContactName = getContactNameForNumber(rawNum);
          final effectiveName = (resolvedContactName != null && resolvedContactName.isNotEmpty)
              ? resolvedContactName
              : (rawName.isNotEmpty && rawName != 'Unknown' ? rawName : (rawNum.isNotEmpty ? rawNum : 'Unknown'));

          return PhoneRecentCall(
            id: m['id']?.toString() ?? '',
            name: effectiveName,
            number: rawNum,
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
}
