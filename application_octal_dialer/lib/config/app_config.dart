import 'package:shared_preferences/shared_preferences.dart';

/// Single source of truth for the Octal Dialer Android application backend configuration.
class AppConfig {
  /// Default backend URL if none configured (Production Cloud Server)
  static const String defaultBaseUrl = 'http://140.245.215.156';

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

    if (savedUrl != null && savedUrl.isNotEmpty && savedUrl != 'http://127.0.0.1:3000' && savedUrl != 'http://localhost:3000' && savedUrl != 'http://192.168.1.35:3000') {
      final sanitized = sanitizeUrl(savedUrl);
      if (sanitized != null) {
        _currentBaseUrl = sanitized;
      } else {
        _currentBaseUrl = defaultBaseUrl;
        await prefs.setString(serverUrlKey, defaultBaseUrl);
      }
    } else {
      _currentBaseUrl = defaultBaseUrl;
      await prefs.setString(serverUrlKey, defaultBaseUrl);
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

  /// Sanitize URL
  static String? sanitizeUrl(String rawUrl) {
    String trimmed = rawUrl.trim().replaceAll(RegExp(r'/+$'), '');
    if (trimmed.isEmpty) return null;

    if (!trimmed.contains('://')) trimmed = 'http://$trimmed';
    final uri = Uri.tryParse(trimmed);
    if (uri == null || !['http', 'https'].contains(uri.scheme) ||
        uri.host.isEmpty || uri.userInfo.isNotEmpty || uri.hasQuery || uri.hasFragment ||
        (uri.path.isNotEmpty && uri.path != '/')) {
      return null;
    }
    // Preserve explicit origin/port; silently rewriting it can send credentials to another service.

    return trimmed;
  }
}
