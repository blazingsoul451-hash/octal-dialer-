import 'package:shared_preferences/shared_preferences.dart';

/// Single source of truth for the Octal Dialer Android application backend configuration.
class AppConfig {
  /// Default backend URL if none configured via --dart-define or preferences.
  static const String defaultBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: '',
  );

  /// Key used in SharedPreferences
  static const String serverUrlKey = 'server_url';
  static const String connectionUriKey = 'connection_uri';

  /// Cached in-memory URL
  static String _currentBaseUrl = defaultBaseUrl;

  /// Get current effective Base URL
  static String get apiBaseUrl => _currentBaseUrl;

  /// Initialize and sanitize saved server URL from storage
  static Future<String> init() async {
    final prefs = await SharedPreferences.getInstance();
    final savedUrl = prefs.getString(serverUrlKey);

    if (savedUrl != null && savedUrl.isNotEmpty) {
      final sanitized = sanitizeUrl(savedUrl);
      if (sanitized != null) {
        _currentBaseUrl = sanitized;
      } else {
        // Invalid or stale loopback/emulator URL -> migrate to defaultBaseUrl
        _currentBaseUrl = defaultBaseUrl;
        await prefs.setString(serverUrlKey, defaultBaseUrl);
      }
    } else {
      _currentBaseUrl = defaultBaseUrl;
      await prefs.setString(serverUrlKey, defaultBaseUrl);
    }

    // Clean stale connection_uri if it contains loopback/emulator
    final savedUri = prefs.getString(connectionUriKey);
    if (savedUri != null && (savedUri.contains('localhost') || savedUri.contains('127.0.0.1') || savedUri.contains('10.0.2.2'))) {
      await prefs.remove(connectionUriKey);
    }

    return _currentBaseUrl;
  }

  /// Update and persist server URL
  static Future<void> setBaseUrl(String newUrl) async {
    final clean = newUrl.trim().replaceAll(RegExp(r'/+$'), '');
    if (clean.isEmpty) return;

    _currentBaseUrl = clean;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(serverUrlKey, clean);
  }

  /// Sanitize URL and reject unsafe/broken loopback/emulator addresses in physical device mode
  static String? sanitizeUrl(String rawUrl) {
    final trimmed = rawUrl.trim().replaceAll(RegExp(r'/+$'), '');
    if (trimmed.isEmpty) return null;

    final lower = trimmed.toLowerCase();
    // Reject loopbacks and emulator-only addresses
    if (lower.contains('127.0.0.1') || lower.contains('localhost') || lower.contains('10.0.2.2') || lower.contains('api.trycloudflare.com')) {
      return null;
    }

    if (!lower.startsWith('http://') && !lower.startsWith('https://')) {
      return 'https://$trimmed';
    }

    return trimmed;
  }
}
