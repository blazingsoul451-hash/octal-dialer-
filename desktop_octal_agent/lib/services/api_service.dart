import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

/// Cloud API client for the Octal Desktop Agent.
///
/// Holds the agent's workspace settings (persisted via shared_preferences),
/// performs JWT login, claims and completes Facebook tasks from the cloud
/// queue, and reports heartbeats and telemetry.
class ApiService {
  static final ApiService instance = ApiService._internal();
  ApiService._internal();

  // ── Persisted settings keys ──
  static const _kBaseUrl = 'octal_agent_base_url';
  static const _kEmail = 'octal_agent_email';
  static const _kPassword = 'octal_agent_password';
  static const _kAgentId = 'octal_agent_id';

  static const String defaultBaseUrl = 'https://zestify7.online';

  /// Known-good workspace origins offered in the settings screen.
  static const List<String> presetUrls = <String>[
    'https://zestify7.online',
    'https://dev.zestify7.online',
    'http://localhost:3000',
  ];

  String baseUrl = defaultBaseUrl;
  String? authToken;
  String tenantId = 'tenant_default';
  String? username;
  String savedEmail = '';
  String savedPassword = '';
  String agentId = '';

  bool get isConfigured => savedEmail.isNotEmpty && savedPassword.isNotEmpty;
  bool get isAuthenticated => authToken != null;

  Map<String, String> get _headers => {
    'Content-Type': 'application/json',
    if (authToken != null) 'Authorization': 'Bearer $authToken',
  };

  /// Normalise a workspace origin, defaulting bare hosts to https://.
  static String? sanitizeUrl(String rawUrl) {
    var trimmed = rawUrl.trim().replaceAll(RegExp(r'/+$'), '');
    if (trimmed.isEmpty) return null;
    if (!trimmed.contains('://')) trimmed = 'https://$trimmed';

    final uri = Uri.tryParse(trimmed);
    if (uri == null ||
        !['http', 'https'].contains(uri.scheme) ||
        uri.host.isEmpty ||
        uri.userInfo.isNotEmpty ||
        uri.hasQuery ||
        uri.hasFragment ||
        (uri.path.isNotEmpty && uri.path != '/')) {
      return null;
    }
    return trimmed;
  }

  /// Load persisted settings. Call once at app start before auto-login.
  Future<void> loadSettings() async {
    final prefs = await SharedPreferences.getInstance();
    baseUrl = prefs.getString(_kBaseUrl) ?? defaultBaseUrl;
    savedEmail = prefs.getString(_kEmail) ?? '';
    savedPassword = prefs.getString(_kPassword) ?? '';
    agentId = prefs.getString(_kAgentId) ?? '';

    if (agentId.isEmpty) {
      agentId = 'desktop_${DateTime.now().millisecondsSinceEpoch}';
      await prefs.setString(_kAgentId, agentId);
    }
  }

  /// Persist workspace settings entered in the Agent Settings tab.
  Future<void> saveSettings({
    required String url,
    required String email,
    required String password,
  }) async {
    final clean = sanitizeUrl(url);
    if (clean == null) {
      throw ArgumentError('Enter a valid workspace URL, e.g. https://zestify7.online');
    }

    baseUrl = clean;
    savedEmail = email.trim();
    savedPassword = password;

    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_kBaseUrl, clean);
    await prefs.setString(_kEmail, savedEmail);
    await prefs.setString(_kPassword, savedPassword);
  }

  /// Forget stored credentials and drop the session.
  Future<void> clearSettings() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_kEmail);
    await prefs.remove(_kPassword);
    savedEmail = '';
    savedPassword = '';
    authToken = null;
    username = null;
  }

  void configure({String? url, String? token, String? tenant}) {
    if (url != null) baseUrl = url.replaceAll(RegExp(r'/+$'), '');
    if (token != null) authToken = token;
    if (tenant != null) tenantId = tenant;
  }

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
  Future<Map<String, dynamic>> login(String identifier, String password) async {
    try {
      final res = await http.post(
        Uri.parse('$baseUrl/api/auth/login'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'identifier': identifier, 'password': password}),
      ).timeout(const Duration(seconds: 8));

      final data = jsonDecode(res.body);
      if (res.statusCode == 200 && data['token'] != null) {
        authToken = data['token'];
        tenantId = data['user']?['tenantId'] ?? 'tenant_default';
        username = data['user']?['username'] ?? identifier;
        return {'success': true, 'data': data};
      }
      return {'success': false, 'error': data['error'] ?? 'Authentication failed'};
    } catch (e) {
      return {'success': false, 'error': 'Network error: $e'};
    }
  }

  /// Sign in using the credentials stored in settings.
  Future<Map<String, dynamic>> loginWithSavedCredentials() async {
    if (!isConfigured) {
      return {'success': false, 'error': 'No workspace credentials configured.'};
    }
    return login(savedEmail, savedPassword);
  }

  // ─── Facebook task queue ───────────────────────────────────────────────────

  /// Fetch outbound Facebook tasks waiting for this workspace.
  Future<List<Map<String, dynamic>>> fetchPendingFbTasks({int limit = 10}) async {
    if (authToken == null) return <Map<String, dynamic>>[];
    try {
      final res = await http.get(
        Uri.parse('$baseUrl/api/fb-tasks/pending?limit=$limit'),
        headers: _headers,
      ).timeout(const Duration(seconds: 10));

      if (res.statusCode != 200) return <Map<String, dynamic>>[];
      final data = jsonDecode(res.body);
      final tasks = data is Map ? data['tasks'] : null;
      if (tasks is List) {
        return tasks.whereType<Map>().map((t) => Map<String, dynamic>.from(t)).toList();
      }
      return <Map<String, dynamic>>[];
    } catch (_) {
      return <Map<String, dynamic>>[];
    }
  }

  /// Claim a task. Returns false when another agent got there first (HTTP 409).
  Future<bool> claimFbTask(String taskId) async {
    if (authToken == null) return false;
    try {
      final res = await http.post(
        Uri.parse('$baseUrl/api/fb-tasks/$taskId/claim'),
        headers: _headers,
        body: jsonEncode({'agentId': agentId}),
      ).timeout(const Duration(seconds: 10));
      return res.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  /// Report a task as completed or failed so the queue can move on.
  Future<void> completeFbTask(String taskId, {bool success = true, String? error}) async {
    if (authToken == null) return;
    try {
      await http.post(
        Uri.parse('$baseUrl/api/fb-tasks/$taskId/complete'),
        headers: _headers,
        body: jsonEncode({
          'status': success ? 'completed' : 'failed',
          if (error != null) 'error': error,
        }),
      ).timeout(const Duration(seconds: 10));
    } catch (_) {}
  }

  /// Periodic liveness ping so the workspace knows this agent is online.
  Future<void> sendHeartbeat({String status = 'online'}) async {
    if (authToken == null) return;
    await sendTelemetryLog(
      type: 'heartbeat',
      account: username ?? agentId,
      detail: 'Desktop agent $agentId $status',
      status: status,
    );
  }

  /// Forward intercepted Facebook DM or Comment Reply to Backend Unibox Engine
  Future<void> forwardIncomingFacebookReply(Map<String, dynamic> eventPayload) async {
    if (authToken == null) return;
    try {
      await http.post(
        Uri.parse('$baseUrl/api/webhooks/facebook/incoming-reply'),
        headers: _headers,
        body: jsonEncode(eventPayload),
      ).timeout(const Duration(seconds: 6));
    } catch (_) {}
  }

  /// Sync local campaign activity log to the cloud server
  Future<void> sendTelemetryLog({
    required String type, // 'fb_post', 'fb_join', 'email_send', 'heartbeat'
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
