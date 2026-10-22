import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:path_provider/path_provider.dart';
import 'api_service.dart';

enum FbWorkerStatus { idle, connecting, loggedIn, running, paused, error }

class FbLocalWorker {
  static final FbLocalWorker instance = FbLocalWorker._internal();
  FbLocalWorker._internal();

  FbWorkerStatus status = FbWorkerStatus.idle;
  String? connectedProfileName;
  Process? _activeProcess;

  final _logController = StreamController<String>.broadcast();
  Stream<String> get logStream => _logController.stream;

  final _progressController = StreamController<Map<String, dynamic>>.broadcast();
  Stream<Map<String, dynamic>> get progressStream => _progressController.stream;

  void addLog(String msg) {
    final time = DateTime.now().toIso8601String().substring(11, 19);
    _logController.add('[$time] $msg');
  }

  /// Launch 1-Click interactive Facebook login on user's PC to grab cookies without extensions
  Future<bool> startCookieCapture(String profileName) async {
    status = FbWorkerStatus.connecting;
    addLog('Launching native browser for Profile: $profileName (Residential IP)...');

    try {
      final appDir = await getApplicationDocumentsDirectory();
      final scriptPath = File('${appDir.path}/octal_agent/local_cookie_grabber.js');

      // Ensure local script exists
      if (!scriptPath.existsSync()) {
        await _ensureLocalScriptsExist(appDir.path);
      }

      final proc = await Process.start('node', [
        scriptPath.path,
        '--profile', profileName,
        '--dataDir', '${appDir.path}/octal_agent/data'
      ]);

      proc.stdout.transform(utf8.decoder).listen((data) {
        for (final line in data.split('\n')) {
          if (line.trim().isNotEmpty) {
            addLog('[Auth] ${line.trim()}');
            if (line.contains('COOKIES_CAPTURED_SUCCESS')) {
              status = FbWorkerStatus.loggedIn;
              connectedProfileName = profileName;
            }
          }
        }
      });

      proc.stderr.transform(utf8.decoder).listen((data) {
        if (data.trim().isNotEmpty) addLog('[Auth Error] ${data.trim()}');
      });

      final exitCode = await proc.exitCode;
      if (exitCode == 0 && status == FbWorkerStatus.loggedIn) {
        addLog('✅ Facebook connected successfully! Active cookies saved locally.');
        return true;
      }
      status = FbWorkerStatus.idle;
      return false;
    } catch (e) {
      addLog('❌ Failed to launch browser: $e');
      status = FbWorkerStatus.error;
      return false;
    }
  }

  /// Run local Facebook group sharing campaign using local PC resources
  Future<void> runCampaign({
    required String profileName,
    required List<String> postUrls,
    required String caption,
    int maxPostsPerDay = 10,
    int delayMinutesMin = 5,
    int delayMinutesMax = 12,
  }) async {
    if (status == FbWorkerStatus.running) return;
    status = FbWorkerStatus.running;
    addLog('🚀 Starting Local Facebook Campaign for $profileName...');
    addLog('Target: ${postUrls.length} posts | Daily Cap: $maxPostsPerDay | Delays: $delayMinutesMin-$delayMinutesMax mins');

    try {
      final appDir = await getApplicationDocumentsDirectory();
      final scriptPath = File('${appDir.path}/octal_agent/local_fb_bot.js');

      if (!scriptPath.existsSync()) {
        await _ensureLocalScriptsExist(appDir.path);
      }

      // Save campaign config locally
      final configDir = Directory('${appDir.path}/octal_agent/data');
      if (!configDir.existsSync()) configDir.createSync(recursive: true);

      final configFile = File('${configDir.path}/campaign_config.json');
      await configFile.writeAsString(jsonEncode({
        'profileName': profileName,
        'postUrls': postUrls,
        'caption': caption,
        'maxPostsPerDay': maxPostsPerDay,
        'delayMin': delayMinutesMin,
        'delayMax': delayMinutesMax,
      }));

      _activeProcess = await Process.start('node', [
        scriptPath.path,
        '--config', configFile.path,
        '--dataDir', configDir.path
      ]);

      int sent = 0;
      _activeProcess!.stdout.transform(utf8.decoder).listen((data) {
        for (final line in data.split('\n')) {
          final trimmed = line.trim();
          if (trimmed.isEmpty) continue;
          addLog(trimmed);

          // Intercept Wire-Sniffed Facebook Replies
          if (trimmed.startsWith('OCTAL_EVENT_JSON:')) {
            try {
              final jsonStr = trimmed.substring('OCTAL_EVENT_JSON:'.length);
              final Map<String, dynamic> evt = jsonDecode(jsonStr);
              if (evt['eventType'] == 'FB_INCOMING_REPLY') {
                addLog('🔥 Incoming FB Reply from ${evt['senderName']}: "${evt['bodyRaw']}"');
                ApiService.instance.forwardIncomingFacebookReply(evt);
              }
            } catch (_) {}
          }

          if (trimmed.contains('EVENT_POST_SUCCESS')) {
            sent++;
            _progressController.add({'current': sent, 'total': postUrls.length, 'status': 'posting'});
            ApiService.instance.sendTelemetryLog(
              type: 'fb_post',
              account: profileName,
              detail: 'Shared post ($sent/${postUrls.length})',
              status: 'success',
            );
          }
        }
      });

      _activeProcess!.stderr.transform(utf8.decoder).listen((data) {
        if (data.trim().isNotEmpty) addLog('[Bot Error] ${data.trim()}');
      });

      await _activeProcess!.exitCode;
      status = FbWorkerStatus.idle;
      addLog('🏁 Local campaign run finished.');
    } catch (e) {
      status = FbWorkerStatus.error;
      addLog('❌ Campaign execution failed: $e');
    }
  }

  void stop() {
    if (_activeProcess != null) {
      _activeProcess!.kill();
      _activeProcess = null;
      status = FbWorkerStatus.idle;
      addLog('⏸️ Local campaign stopped by user.');
    }
  }

  Future<void> _ensureLocalScriptsExist(String basePath) async {
    final dir = Directory('$basePath/octal_agent');
    if (!dir.existsSync()) dir.createSync(recursive: true);

    // 1. Write local cookie grabber
    final grabberFile = File('${dir.path}/local_cookie_grabber.js');
    if (!grabberFile.existsSync()) {
      await grabberFile.writeAsString('''
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
let profile = 'default';
let dataDir = path.resolve(__dirname, 'data');
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--profile') profile = args[++i];
  else if (args[i] === '--dataDir') dataDir = args[++i];
}

(async () => {
  console.log('Opening local Edge/Chrome window for Facebook login...');
  const userProfileDir = path.join(dataDir, 'profiles', profile);
  if (!fs.existsSync(userProfileDir)) fs.mkdirSync(userProfileDir, { recursive: true });

  const context = await chromium.launchPersistentContext(userProfileDir, {
    headless: false,
    channel: 'msedge',
    viewport: null,
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled']
  });

  const page = (await context.pages())[0] || await context.newPage();
  await page.goto('https://www.facebook.com');

  console.log('Waiting for user login on Facebook...');
  let loggedIn = false;
  for (let i = 0; i < 300; i++) {
    const cookies = await context.cookies();
    const hasCUser = cookies.some(c => c.name === 'c_user');
    if (hasCUser) {
      console.log('Session confirmed! Capturing cookies...');
      const cookieFile = path.join(userProfileDir, 'cookies.json');
      fs.writeFileSync(cookieFile, JSON.stringify(cookies, null, 2));
      console.log('COOKIES_CAPTURED_SUCCESS');
      loggedIn = true;
      break;
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  await context.close();
  process.exit(loggedIn ? 0 : 1);
})();
''');
    }

    // 2. Write local Facebook bot engine
    final botFile = File('${dir.path}/local_fb_bot.js');
    if (!botFile.existsSync()) {
      // Copy from workspace local_engine or write fallback
      final workspaceBot = File('desktop_octal_agent/local_engine/local_fb_bot.js');
      if (workspaceBot.existsSync()) {
        await workspaceBot.copy(botFile.path);
      }
    }
  }
}
