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
      _activeProcess = proc;

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

      final exitCode = await proc.exitCode.timeout(
        const Duration(minutes: 6),
        onTimeout: () {
          proc.kill();
          return -1;
        },
      );
      if (_activeProcess == proc) _activeProcess = null;
      if (exitCode == 0 && status == FbWorkerStatus.loggedIn) {
        addLog('✅ Facebook connected successfully! Active cookies saved locally.');
        return true;
      }
      status = FbWorkerStatus.idle;
      return false;
    } catch (e) {
      _activeProcess?.kill();
      _activeProcess = null;
      addLog('❌ Failed to launch browser: $e');
      status = FbWorkerStatus.error;
      return false;
    }
  }

  /// Run local Facebook group sharing campaign using local PC resources
  /// Coerce a JSON value (num, numeric string, or null) into an int.
  static int _asInt(dynamic value, int fallback) {
    if (value is int) return value;
    if (value is num) return value.toInt();
    if (value is String) return int.tryParse(value.trim()) ?? fallback;
    return fallback;
  }

  /// Execute one task claimed from the cloud `fb_task_queue`.
  ///
  /// The payload is the JSON string stored on the queue row. Unknown task
  /// types throw so the caller reports the task failed rather than silently
  /// marking it complete.
  Future<void> runQueuedTask(Map<String, dynamic> task) async {
    final String taskType = (task['taskType'] ?? '').toString();

    Map<String, dynamic> payload = <String, dynamic>{};
    final raw = task['payload'];
    if (raw is Map) {
      payload = Map<String, dynamic>.from(raw);
    } else if (raw is String && raw.trim().isNotEmpty) {
      try {
        final decoded = jsonDecode(raw);
        if (decoded is Map) payload = Map<String, dynamic>.from(decoded);
      } catch (e) {
        throw Exception('Malformed task payload: $e');
      }
    }

    final String profileName =
        (payload['profileId'] ?? payload['profileName'] ?? task['profileId'] ?? '').toString();
    if (profileName.isEmpty) {
      throw Exception('Task is missing a target Facebook profile.');
    }

    switch (taskType) {
      case 'post_group':
      case 'group_share':
      case 'share':
        final urls = payload['postUrls'];
        await runCampaign(
          profileName: profileName,
          postUrls: urls is List ? urls.map((u) => u.toString()).toList() : <String>[],
          caption: (payload['caption'] ?? '').toString(),
          maxPostsPerDay: _asInt(payload['maxPostsPerDay'], 10),
          delayMinutesMin: _asInt(payload['delayMin'], 5),
          delayMinutesMax: _asInt(payload['delayMax'], 12),
        );
        break;

      case 'send_dm':
        final rawRecipient = (payload['recipient'] ??
                payload['threadUrl'] ??
                payload['recipientAddress'] ??
                payload['externalThreadId'] ??
                '')
            .toString()
            .trim();
        final recipient = rawRecipient.startsWith('http')
            ? rawRecipient
            : (rawRecipient.isNotEmpty ? 'https://www.facebook.com/messages/t/$rawRecipient' : '');
        final message = (payload['message'] ?? payload['body'] ?? '').toString().trim();
        if (recipient.isEmpty || message.isEmpty) {
          throw Exception('send_dm task requires both a recipient and a message.');
        }
        addLog('✉️ Sending Messenger DM to $recipient via $profileName');
        await runCampaign(
          profileName: profileName,
          postUrls: <String>[recipient],
          caption: message,
          maxPostsPerDay: 1,
          delayMinutesMin: 0,
          delayMinutesMax: 1,
        );
        break;

      default:
        throw Exception('Unsupported task type: $taskType');
    }
  }

  Future<void> runCampaign({
    required String profileName,
    required List<String> postUrls,
    required String caption,
    int maxPostsPerDay = 10,
    int delayMinutesMin = 5,
    int delayMinutesMax = 12,
  }) async {
    if (status == FbWorkerStatus.running) {
      throw StateError('A Facebook campaign is already running on this agent.');
    }
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
      _activeProcess = null;
      status = FbWorkerStatus.idle;
      addLog('🏁 Local campaign run finished.');
    } catch (e) {
      _activeProcess?.kill();
      _activeProcess = null;
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
      final candidates = [
        File('local_engine/local_fb_bot.js'),
        File('desktop_octal_agent/local_engine/local_fb_bot.js'),
      ];
      bool copied = false;
      for (final c in candidates) {
        if (c.existsSync()) {
          await c.copy(botFile.path);
          copied = true;
          break;
        }
      }
      if (!copied) {
        addLog('⚠️ local_fb_bot.js not found in relative path; writing embedded fallback...');
        await botFile.writeAsString(r'''/**
 * desktop_octal_agent/local_engine/local_fb_bot.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Stealth Residential Facebook Engine:
 *  1. Uses rebrowser-playwright (CDP leak patch) with standard playwright fallback
 *  2. Fixes Group Post & Share submission modal flow
 *  3. Intercepts live GraphQL & Messenger WebSockets (edge-chat.facebook.com)
 *     to detect 100% of prospect replies & comments in real time!
 * ─────────────────────────────────────────────────────────────────────────────
 */
const { chromium } = (() => {
  try {
    return require('rebrowser-playwright');
  } catch (_) {
    return require('playwright');
  }
})();

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
let configFile = '';
let dataDir = path.resolve(__dirname, 'data');

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--config') configFile = args[++i];
  else if (args[i] === '--dataDir') dataDir = args[++i];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const randomBetween = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

async function typeLikeAHuman(page, locator, text) {
  await locator.click();
  await sleep(randomBetween(600, 1200));
  for (const char of text) {
    if (char === '\n') {
      await page.keyboard.press('Shift+Enter');
      await sleep(randomBetween(120, 250));
    } else {
      await page.keyboard.insertText(char);
      await sleep(randomBetween(35, 85));
    }
  }
}

/**
 * Emit structured JSON event to Flutter parent process (fb_local_worker.dart)
 */
function emitBridgeEvent(eventType, payload) {
  console.log(`OCTAL_EVENT_JSON:${JSON.stringify({ eventType, ...payload })}`);
}

/**
 * Attach Wire-Level Network & WebSocket Sniffer for Incoming Replies
 */
function attachFacebookReplyWireSniffer(page, profileName) {
  // 1. Intercept GraphQL responses for Messenger Thread Replies & Group Post Comments
  page.on('response', async (response) => {
    try {
      const url = response.url();
      if (!url.includes('/api/graphql/')) return;
      const text = await response.text();
      if (!text) return;

      for (const line of text.split('\n')) {
        if (!line.trim().startsWith('{')) continue;
        const json = JSON.parse(line);
        const payloadStr = JSON.stringify(json);

        // Detect inbound Messenger message or Group Comment reply
        if (payloadStr.includes('"message_sender"') && payloadStr.includes('"snippet"')) {
          const matchMsgId = payloadStr.match(/"message_id":"([^"]+)"/);
          const matchThreadId = payloadStr.match(/"thread_fbid":"([^"]+)"|"thread_key":\{"thread_fbid":"([^"]+)"/);
          const matchSender = payloadStr.match(/"messaging_actor":\{"id":"([^"]+)","name":"([^"]+)"/);
          const matchSnippet = payloadStr.match(/"snippet":"([^"]+)"/);

          if (matchMsgId && matchSnippet) {
            emitBridgeEvent('FB_INCOMING_REPLY', {
              channel: 'facebook_dm',
              accountId: profileName,
              externalMessageId: matchMsgId[1],
              externalThreadId: (matchThreadId && (matchThreadId[1] || matchThreadId[2])) || `fb_thd_${Date.now()}`,
              senderAddress: matchSender ? matchSender[1] : 'fb_prospect',
              senderName: matchSender ? matchSender[2] : 'Facebook Prospect',
              bodyRaw: JSON.parse(`"${matchSnippet[1]}"`),
            });
          }
        }
      }
    } catch (_) {}
  });

  // 2. Intercept Messenger Live MQTT over WebSocket (wss://edge-chat.facebook.com)
  page.on('websocket', (ws) => {
    if (!ws.url().includes('edge-chat.facebook.com')) return;
    ws.on('framereceived', (frame) => {
      try {
        const raw = typeof frame.payload === 'string'
          ? frame.payload
          : Buffer.from(frame.payload).toString('utf8');
        if (raw.includes('"deltaNewMessage"') || raw.includes('"body"')) {
          const bodyMatch = raw.match(/"body":"([^"]+)"/);
          const msgIdMatch = raw.match(/"messageId":"([^"]+)"/);
          const senderMatch = raw.match(/"actorFbId":"(\d+)"/);
          const threadMatch = raw.match(/"threadFbId":"(\d+)"/);

          if (bodyMatch && msgIdMatch && senderMatch) {
            emitBridgeEvent('FB_INCOMING_REPLY', {
              channel: 'facebook_dm',
              accountId: profileName,
              externalMessageId: msgIdMatch[1],
              externalThreadId: threadMatch ? threadMatch[1] : senderMatch[1],
              senderAddress: senderMatch[1],
              senderName: `FB User ${senderMatch[1]}`,
              bodyRaw: JSON.parse(`"${bodyMatch[1]}"`),
            });
          }
        }
      } catch (_) {}
    });
  });
}

(async () => {
  if (!configFile || !fs.existsSync(configFile)) {
    console.error('❌ Error: Valid campaign_config.json path required.');
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  const {
    profileName,
    postUrls = [],
    caption = '',
    maxPostsPerDay = 10,
    delayMin = 5,
    delayMax = 12,
  } = config;

  console.log(`[Local Bot] Initializing campaign for Profile: ${profileName}...`);
  console.log(`[Local Bot] Total Target Posts: ${postUrls.length} | Daily Limit: ${maxPostsPerDay}`);

  const profileDir = path.join(dataDir, 'profiles', profileName);
  const cookiesFile = path.join(profileDir, 'cookies.json');

  if (!fs.existsSync(cookiesFile)) {
    console.error(`❌ Error: No cookies found for ${profileName}. Please click "1-Click Connect Facebook" first.`);
    process.exit(1);
  }

  const cookies = JSON.parse(fs.readFileSync(cookiesFile, 'utf8'));

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    channel: 'msedge',
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-gpu',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
  });

  await context.addCookies(cookies);
  const page = (await context.pages())[0] || (await context.newPage());

  // Attach Real-Time Wire Sniffer
  attachFacebookReplyWireSniffer(page, profileName);

  // Stealth masking
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  console.log('🔍 Checking session health...');
  await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 35000 });
  await sleep(2500);

  if (page.url().includes('/login') || page.url().includes('login_attempt')) {
    console.error('❌ Facebook session expired. Please reconnect your account.');
    await context.close();
    process.exit(1);
  }

  console.log('✅ Session active. Starting group sharing with modal completion...');

  let postedCount = 0;
  for (let i = 0; i < postUrls.length && postedCount < maxPostsPerDay; i++) {
    const rawUrl = postUrls[i].trim();
    if (!rawUrl) continue;

    let cleanUrl = rawUrl.split('?')[0].replace(/\/+$/, '');
    if (cleanUrl.includes('/groups/') && !cleanUrl.endsWith('/discussion')) {
      cleanUrl += '/discussion';
    }

    console.log(`[Post ${postedCount + 1}/${Math.min(postUrls.length, maxPostsPerDay)}] Navigating to: ${cleanUrl}...`);

    try {
      await page.goto(cleanUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
      await sleep(randomBetween(2500, 4500));

      // Open group composer modal and actually type + submit the post
      const triggers = [
        'span:has-text("Write something...")',
        'span:has-text("Create a public post...")',
        'div[role="button"]:has-text("Write something...")',
        'div[aria-label="Send this to friends or post it on your profile."]',
      ];
      let opened = false;
      for (const sel of triggers) {
        const el = page.locator(sel).first();
        if (await el.isVisible().catch(() => false)) {
          await el.click();
          opened = true;
          break;
        }
      }

      if (opened) {
        await sleep(randomBetween(1500, 2800));
        const editor = page.locator('div[role="dialog"] div[role="textbox"][contenteditable="true"]').first();
        if (await editor.isVisible().catch(() => false)) {
          await typeLikeAHuman(page, editor, caption);
          await sleep(randomBetween(1800, 3200));

          const postBtn = page.locator('div[role="dialog"] div[aria-label="Post"][role="button"], div[role="dialog"] div[role="button"]:has-text("Post")').first();
          await postBtn.click();
          await sleep(randomBetween(3500, 5500));

          postedCount++;
          console.log('EVENT_POST_SUCCESS');
          console.log(`✅ [Post ${postedCount}] Successfully published post to group!`);
          emitBridgeEvent('FB_OUTBOUND_SUCCESS', { profileName, targetUrl: cleanUrl, postedCount });
        }
      } else {
        console.log(`⚠️ Post trigger not visible for ${cleanUrl}. Skipping.`);
      }
    } catch (err) {
      console.warn(`⚠️ Warning sharing ${cleanUrl}: ${err.message}`);
    }

    if (postedCount < maxPostsPerDay && i < postUrls.length - 1) {
      const waitMinutes = randomBetween(delayMin, delayMax);
      console.log(`⏳ Natural human delay: sleeping for ${waitMinutes} minutes before next action...`);
      await sleep(waitMinutes * 60 * 1000);
    }
  }

  // Keep Messenger tab open in background to continue sniffing incoming DMs
  console.log('📡 Maintaining background Messenger listener session for incoming prospect DMs...');
  await page.goto('https://www.facebook.com/messages/t/', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await sleep(60000);

  console.log(`🏁 Campaign cycle finished. Total published: ${postedCount} posts.`);
  await context.close();
  process.exit(0);
})();
''');
      }
    }
  }
}
