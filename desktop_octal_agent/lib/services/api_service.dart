import 'dart:convert';
import 'package:http/http.dart' as http;

class ApiService {
  static final ApiService instance = ApiService._internal();
  ApiService._internal();

  String baseUrl = 'https://dev.zestify7.online';
  String? authToken;
  String? tenantId;
  String? username;

  void configure({required String url, String? token, String? tenant}) {
    baseUrl = url.replaceAll(RegExp(r'/+$'), '');
    if (token != null) authToken = token;
    if (tenant != null) tenantId = tenant;
  }

  Map<String, String> get _headers => {
    'Content-Type': 'application/json',
    if (authToken != null) 'Authorization': 'Bearer $authToken',
  };

  /// Verify connection with the cloud server
  Future<bool> verifyConnection() async {
    try {
      final res = await http.get(Uri.parse('$baseUrl/api/health')).timeout(const Duration(seconds: 6));
      return res.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  /// Authenticate desktop agent with cloud workspace
  Future<Map<String, dynamic>> login(String email, String password) async {
    try {
      final res = await http.post(
        Uri.parse('$baseUrl/auth/login'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'email': email, 'password': password}),
      ).timeout(const Duration(seconds: 8));

      final data = jsonDecode(res.body);
      if (res.statusCode == 200 && data['token'] != null) {
        authToken = data['token'];
        tenantId = data['user']?['tenantId'] ?? 'tenant_default';
        username = data['user']?['username'] ?? email;
        return {'success': true, 'data': data};
      }
      return {'success': false, 'error': data['error'] ?? 'Authentication failed'};
    } catch (e) {
      return {'success': false, 'error': 'Network error: $e'};
    }
  }

  /// Sync local campaign activity log to the cloud server
  Future<void> sendTelemetryLog({
    required String type, // 'fb_post', 'fb_join', 'email_send'
    required String account,
    required String detail,
    required String status,
  }) async {
    if (authToken == null) return;
    try {
      await http.post(
        Uri.parse('$baseUrl/api/activity/log'),
        headers: _headers,
        body: jsonEncode({
          'type': type,
          'account': account,
          'detail': detail,
          'status': status,
          'timestamp': DateTime.now().toIso8601String(),
          'clientType': 'desktop_agent',
        }),
      ).timeout(const Duration(seconds: 4));
    } catch (_) {}
  }
}
