import 'package:flutter/material.dart';

enum CallDirection { incoming, outgoing, missed, rejected, blocked }

class PhoneContact {
  final String id;
  final String name;
  final String number;
  final bool isFavorite;
  final String? photoUri;
  final Color avatarColor;
  final String cleanNumber;
  final String lowerName;
  final String t9Name;

  PhoneContact({
    required this.id,
    required this.name,
    required this.number,
    this.isFavorite = false,
    this.photoUri,
    Color? avatarColor,
  })  : avatarColor = avatarColor ?? _generateAvatarColor(name),
        cleanNumber = number.replaceAll(RegExp(r'[^0-9+]'), ''),
        lowerName = name.toLowerCase(),
        t9Name = _computeT9(name);

  static String _computeT9(String str) {
    const t9Map = {
      'a': '2', 'b': '2', 'c': '2',
      'd': '3', 'e': '3', 'f': '3',
      'g': '4', 'h': '4', 'i': '4',
      'j': '5', 'k': '5', 'l': '5',
      'm': '6', 'n': '6', 'o': '6',
      'p': '7', 'q': '7', 'r': '7', 's': '7',
      't': '8', 'u': '8', 'v': '8',
      'w': '9', 'x': '9', 'y': '9', 'z': '9',
    };
    final sb = StringBuffer();
    for (int i = 0; i < str.length; i++) {
      final c = str[i].toLowerCase();
      sb.write(t9Map[c] ?? '');
    }
    return sb.toString();
  }

  String get initials {
    if (name.isEmpty) return '#';
    final hasLetter = RegExp(r'[a-zA-Z]').hasMatch(name);
    if (!hasLetter) {
      final clean = name.replaceAll(RegExp(r'[^0-9]'), '');
      return clean.isNotEmpty ? clean.substring(0, mathMin(clean.length, 2)) : '#';
    }
    final parts = name.trim().split(RegExp(r'\s+'));
    if (parts.length >= 2 && parts[0].isNotEmpty && parts[1].isNotEmpty) {
      final f1 = parts[0].split('').firstWhere((c) => RegExp(r'[a-zA-Z]').hasMatch(c), orElse: () => '');
      final f2 = parts[1].split('').firstWhere((c) => RegExp(r'[a-zA-Z]').hasMatch(c), orElse: () => '');
      if (f1.isNotEmpty && f2.isNotEmpty) {
        return (f1 + f2).toUpperCase();
      }
    }
    final f1 = name.split('').firstWhere((c) => RegExp(r'[a-zA-Z]').hasMatch(c), orElse: () => '');
    return f1.isNotEmpty ? f1.toUpperCase() : '#';
  }

  static int mathMin(int a, int b) => a < b ? a : b;

  static Color _generateAvatarColor(String seed) {
    const colors = [
      Color(0xFF059669), // Green
      Color(0xFFD97706), // Amber
      Color(0xFF0284C7), // Blue
      Color(0xFFDC2626), // Red
      Color(0xFF7C3AED), // Purple
      Color(0xFFEA580C), // Orange
      Color(0xFF0D9488), // Teal
      Color(0xFF4F46E5), // Indigo
    ];
    int hash = 0;
    for (int i = 0; i < seed.length; i++) {
      hash = (hash + seed.codeUnitAt(i)) % colors.length;
    }
    return colors[hash.abs()];
  }
}

class PhoneRecentCall {
  final String id;
  final String name;
  final String number;
  final CallDirection direction;
  final DateTime timestamp;
  final int durationSeconds;
  final String? simName; // e.g. "ZONG", "Jazz"
  final bool isSpam;

  PhoneRecentCall({
    required this.id,
    required this.name,
    required this.number,
    required this.direction,
    required this.timestamp,
    this.durationSeconds = 0,
    this.simName,
    this.isSpam = false,
  });

  String get formattedTime {
    final now = DateTime.now();
    final diff = now.difference(timestamp);

    final hour = timestamp.hour > 12 ? timestamp.hour - 12 : (timestamp.hour == 0 ? 12 : timestamp.hour);
    final period = timestamp.hour >= 12 ? 'pm' : 'am';
    final minuteStr = timestamp.minute.toString().padLeft(2, '0');
    final timeStr = '$hour:$minuteStr $period';

    if (diff.inDays == 0 && now.day == timestamp.day) {
      return 'Today • $timeStr';
    } else if (diff.inDays <= 1 && now.day != timestamp.day) {
      return 'Yesterday • $timeStr';
    } else if (diff.inDays < 7) {
      const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      return '${weekdays[timestamp.weekday - 1]} • $timeStr';
    } else {
      return '${timestamp.day}/${timestamp.month} • $timeStr';
    }
  }

  String get initials {
    if (name.isEmpty) return '?';
    return name[0].toUpperCase();
  }

  Color get avatarColor {
    return PhoneContact._generateAvatarColor(name);
  }
}
