/**
 * tests/security_hardening_fixes.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Regression coverage for the hardening pass:
 *
 *  1. Facebook profile paths cannot escape their tenant directory.
 *  2. Credentials are encrypted at rest and legacy plaintext still reads back.
 *  3. The emailer's daily counter increments in SQL, not in JavaScript.
 *  4. The IMAP watcher performs a UID catch-up before idling.
 *  5. Abandoned Facebook tasks are requeued by the reaper.
 *
 * Run with: npm run test:hardening
 * ─────────────────────────────────────────────────────────────────────────────
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';

process.env.NODE_ENV = process.env.NODE_ENV || 'test';

let passed = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`PASS ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}`);
    console.error(err);
    process.exit(1);
  }
}

const SRC = path.resolve(__dirname, '../src');
const read = (rel: string): string => fs.readFileSync(path.join(SRC, rel), 'utf8');

// ─── 1. Tenant path traversal ───────────────────────────────────────────────

import { sanitizeId, resolveProfileDir } from '../src/facebookPosterRoutes';

test('sanitizeId strips every path-traversal primitive', () => {
  for (const hostile of ['../../etc/passwd', '..\\..\\windows', 'a/../../b', '/abs/path', 'C:\\Windows']) {
    const safe = sanitizeId(hostile);
    assert.ok(!/[\\/]/.test(safe), `separators must not survive: ${hostile} -> ${safe}`);
    assert.ok(!safe.includes('..'), `parent refs must not survive: ${hostile} -> ${safe}`);
    assert.ok(!safe.includes(':'), `drive letters must not survive: ${hostile} -> ${safe}`);
    assert.equal(safe.length, hostile.length, 'sanitising replaces rather than removes characters');
  }
  assert.equal(sanitizeId('good_profile-1'), 'good_profile-1');
  assert.equal(sanitizeId(''), '');
  assert.equal(sanitizeId(undefined), '');
  assert.ok(!sanitizeId('a/../../b').includes('/'), 'no slashes may survive');
  assert.ok(!sanitizeId('a/../../b').includes('..'), 'no parent refs may survive');
});

test('resolveProfileDir confines every profile to its own tenant directory', () => {
  const victimDir = resolveProfileDir('tenant_victim', 'secret_profile');

  // The classic cross-tenant attack: reach a sibling tenant via ../
  const attackerDir = resolveProfileDir('tenant_attacker', '../tenant_victim/secret_profile');

  assert.ok(
    attackerDir.includes('tenant_attacker'),
    'traversal attempt must stay inside the attacker tenant directory'
  );
  assert.notEqual(attackerDir, victimDir, 'attacker must not resolve onto the victim profile');
  assert.ok(!attackerDir.includes('..'), 'resolved path must contain no parent references');

  // Absolute paths must not escape either.
  const absAttempt = resolveProfileDir('tenant_attacker', 'C:\\Windows\\Temp');
  assert.ok(absAttempt.includes('tenant_attacker'), 'absolute path attempt must be contained');
});

test('every FB profile path is built from a sanitised segment', () => {
  const src = read('facebookPosterRoutes.ts');

  // The spawn path previously used the raw request body value.
  assert.ok(
    !/path\.resolve\(getTenantProfilesDir\(tenantId\),\s*account\)/.test(src),
    'spawnPosterJob must not resolve an unsanitised account into a path'
  );
  assert.ok(
    src.includes('const safeAccount = sanitizeId(account);'),
    'spawnPosterJob must sanitise the account before use'
  );
  assert.ok(
    src.includes('rel.startsWith(\'..\')'),
    'resolveProfileDir must assert containment within the tenant root'
  );
});

test('run/toggle resolve the profile from the database, scoped by tenant', () => {
  const src = read('facebookPosterRoutes.ts');
  assert.ok(src.includes('async function prepareRun('), 'a shared run guard must exist');
  assert.ok(
    src.includes('FROM fb_accounts WHERE "tenantId" = $1 AND "profileId" = $2'),
    'ownership must be proven by a tenant-scoped lookup'
  );
  assert.ok(src.includes('Daily limit reached for'), 'the daily ceiling must be enforced before spawning');
});

// ─── 2. Credential vault ────────────────────────────────────────────────────

import { encryptSecret, decryptSecret, isEncrypted, decryptEmailAccount } from '../src/services/secretVault';

test('secrets round-trip through AES-256-GCM', () => {
  const plain = 'hunter2-mailbox-password';
  const sealed = encryptSecret(plain);

  assert.notEqual(sealed, plain, 'ciphertext must differ from plaintext');
  assert.ok(isEncrypted(sealed), 'sealed value must carry the v1 envelope prefix');
  assert.ok(!sealed.includes(plain), 'plaintext must not appear inside the envelope');
  assert.equal(decryptSecret(sealed), plain);
});

test('encryption is non-deterministic and never double-wraps', () => {
  const a = encryptSecret('same-secret');
  const b = encryptSecret('same-secret');
  assert.notEqual(a, b, 'a fresh IV must produce different ciphertext each time');
  assert.equal(decryptSecret(a), decryptSecret(b));
  assert.equal(encryptSecret(a), a, 'an already-sealed value must pass through untouched');
});

test('legacy plaintext rows keep working', () => {
  assert.equal(decryptSecret('legacy-plaintext-password'), 'legacy-plaintext-password');
  assert.equal(decryptSecret(''), '');
  assert.equal(decryptSecret(null), '');
  assert.equal(decryptSecret(undefined), '');
  assert.equal(encryptSecret(''), '', 'empty values stay empty rather than becoming ciphertext');
});

test('a tampered envelope fails closed instead of throwing', () => {
  const sealed = encryptSecret('authentic-token');
  const parts = sealed.split(':');
  const flipped = Buffer.from(parts[3], 'base64');
  flipped[0] = flipped[0] ^ 0xff;
  const tampered = [parts[0], parts[1], parts[2], flipped.toString('base64')].join(':');

  assert.equal(decryptSecret(tampered), '', 'GCM auth failure must yield empty, not a crash');
  assert.equal(decryptSecret('v1:not:enough'), '', 'malformed envelopes must yield empty');
});

test('decryptEmailAccount unseals exactly the credential columns', () => {
  const row = {
    id: 'acc_1',
    email: 'rep@example.com',
    password: encryptSecret('smtp-pass'),
    refreshToken: encryptSecret('refresh-abc'),
    accessToken: encryptSecret('access-xyz'),
    smtpHost: 'smtp.example.com'
  };
  const out = decryptEmailAccount(row)!;

  assert.equal(out.password, 'smtp-pass');
  assert.equal(out.refreshToken, 'refresh-abc');
  assert.equal(out.accessToken, 'access-xyz');
  assert.equal(out.smtpHost, 'smtp.example.com', 'non-secret columns must be untouched');
  assert.equal(out.email, 'rep@example.com');
  assert.equal(decryptEmailAccount(undefined), undefined);
});

test('mailbox credentials are sealed on every write path', () => {
  const src = read('server.ts');
  assert.ok(
    src.includes("acc.password === '***keep***' ? acc.password : encryptSecret(acc.password)"),
    'SMTP password must be sealed while preserving the keep sentinel'
  );
  assert.ok(src.includes('encryptSecret(accessToken)'), 'OAuth access token must be sealed');
  assert.ok(src.includes('encryptSecret(refreshToken)'), 'OAuth refresh token must be sealed');
  assert.ok(src.includes('decryptEmailAccounts(await db.queryAll<any>(accountsQuery'), 'campaign reads must unseal');

  const engine = read('services/omnichannelReplyEngine.ts');
  assert.ok(engine.includes('encryptSecret(data.access_token)'), 'refreshed tokens must be re-sealed');
  assert.ok(engine.includes('decryptEmailAccount('), 'reply sender must unseal before building transport');
});

// ─── 3. Atomic daily counter ────────────────────────────────────────────────

test('the emailer daily counter is incremented in SQL, not JavaScript', () => {
  const src = read('server.ts');

  assert.ok(
    !/SET "sentToday" = \$1, "lastResetDate" = \$2 WHERE id = \$3/.test(src),
    'the read-modify-write counter update must be gone'
  );
  assert.ok(
    src.includes('SET "sentToday" = CASE WHEN "lastResetDate" = $1 THEN "sentToday" + 1 ELSE 1 END'),
    'the counter must be bumped server-side with a same-day guard'
  );
  assert.ok(src.includes('RETURNING "sentToday"'), 'the authoritative value must be read back');
});

test('lead eligibility is filtered in SQL rather than loading the whole table', () => {
  const src = read('server.ts');
  assert.ok(
    !/SELECT \* FROM email_leads WHERE "tenantId" = \$1 AND status IN \('pending', 'sent'\) ORDER BY/.test(src),
    'the unbounded full-table lead query must be gone'
  );
  assert.ok(src.includes('AND l."repliedAt" IS NULL'), 'replied leads must be excluded in SQL');
  assert.ok(src.includes('FROM email_unsubscribes u'), 'unsubscribes must be excluded in SQL');
  assert.ok(src.includes('LIMIT $3'), 'the candidate set must be bounded');
});

// ─── 4. IMAP restart catch-up ───────────────────────────────────────────────

test('the IMAP watcher replays missed messages before idling', () => {
  const src = read('services/omnichannelReplyEngine.ts');

  assert.ok(src.includes('async function processSingleImapMessage('), 'a shared message processor must exist');
  assert.ok(src.includes('async function catchUpMissedImapMessages('), 'a catch-up routine must exist');
  assert.ok(src.includes('await catchUpMissedImapMessages(account, client);'), 'catch-up must run on connect');
  assert.ok(src.includes('uid: `${lastUid + 1}:*`'), 'catch-up must fetch strictly newer UIDs');
  assert.ok(
    src.includes('SET "lastImapUid" = GREATEST(COALESCE("lastImapUid", 0), $1)'),
    'the high-water UID must be persisted monotonically'
  );

  // Catch-up must happen before the blocking idle loop, or it never runs.
  const catchUpAt = src.indexOf('await catchUpMissedImapMessages(account, client);');
  const idleAt = src.indexOf('while (client.usable)');
  assert.ok(catchUpAt > 0 && idleAt > 0 && catchUpAt < idleAt, 'catch-up must precede the idle loop');
});

test('reply ingestion stays idempotent so replay cannot duplicate threads', () => {
  const src = read('services/omnichannelReplyEngine.ts');
  assert.ok(
    src.includes('ON CONFLICT ("tenantId", channel, "externalMessageId") DO NOTHING'),
    'inbound messages must be deduplicated by external id'
  );
});

// ─── 5. Facebook task queue recovery ────────────────────────────────────────

test('claiming a task is atomic and records a lease', () => {
  const src = read('uniboxRoutes.ts');
  assert.ok(src.includes("status = 'processing'"), 'claim must move the task to processing');
  assert.ok(src.includes("AND status = 'pending'"), 'claim must be conditional on the task still being pending');
  assert.ok(src.includes('RETURNING *'), 'claim must report whether it won the race');
  assert.ok(src.includes('"claimedAt" = $2'), 'claim must stamp a lease time');
  assert.ok(src.includes('"attempts" = "attempts" + 1'), 'claim must count the attempt');
});

test('abandoned tasks are requeued and poison tasks eventually fail', () => {
  const src = read('uniboxRoutes.ts');
  assert.ok(src.includes('export async function reapStaleFbTasks('), 'a reaper must exist');
  assert.ok(src.includes('FB_TASK_LEASE_MS'), 'the lease window must be explicit');
  assert.ok(src.includes('MAX_FB_TASK_ATTEMPTS'), 'a retry ceiling must exist');
  assert.ok(src.includes("SET status = 'pending'"), 'expired leases must return to pending');
  assert.ok(src.includes("SET status = 'failed'"), 'tasks past the retry ceiling must fail');

  const server = read('server.ts');
  assert.ok(server.includes('reapStaleFbTasks().catch(() => {});'), 'the reaper must run on boot');
  assert.ok(server.includes('const fbTaskReaper = setInterval('), 'the reaper must run periodically');
});

// ─── 6. Schema integrity ────────────────────────────────────────────────────

test('schema baseline has no duplicate table definitions', () => {
  const schema = fs.readFileSync(path.join(SRC, 'db/schema.sql'), 'utf8');
  const names = [...schema.matchAll(/CREATE TABLE IF NOT EXISTS "([a-z_]+)"/g)].map((m) => m[1]);
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const n of names) {
    if (seen.has(n)) dupes.add(n);
    seen.add(n);
  }
  assert.deepEqual([...dupes], [], `duplicate table definitions found: ${[...dupes].join(', ')}`);
});

test('Facebook state has durable tables and referential integrity', () => {
  const schema = fs.readFileSync(path.join(SRC, 'db/schema.sql'), 'utf8');
  for (const t of ['fb_campaign_config', 'fb_groups', 'fb_activity_log']) {
    assert.ok(schema.includes(`CREATE TABLE IF NOT EXISTS "${t}"`), `${t} must exist in the baseline`);
  }
  assert.ok(schema.includes('"cookiesEnc" TEXT'), 'cookie jars must have an encrypted column');

  const migration = fs.readFileSync(
    path.join(SRC, 'db/migrations/025_fb_persistence_and_integrity.sql'),
    'utf8'
  );
  for (const fk of [
    'fk_outreach_messages_thread',
    'fk_outreach_threads_email_lead',
    'fk_email_dispatch_lead',
    'fk_email_dispatch_run'
  ]) {
    assert.ok(migration.includes(fk), `${fk} must be added`);
  }
  assert.ok(migration.includes('idx_fb_tasks_pending_dedupe'), 'pending tasks must be de-duplicated');
  assert.ok(migration.includes("ALTER TABLE teams ALTER COLUMN \"status\" SET DEFAULT 'active'"), 'teams default must be normalised');
});

// ─── 7. Mobile + desktop client hardening ───────────────────────────────────

const REPO = path.resolve(__dirname, '../../..');

test('the Android login flow cannot downgrade to cleartext HTTP', () => {
  const src = fs.readFileSync(
    path.join(REPO, 'application_octal_dialer/lib/screens/login_screen.dart'),
    'utf8'
  );
  assert.ok(!src.includes("url = 'http://\$url';"), 'the http:// fallback must be gone');
  assert.ok(src.includes('AppConfig.sanitizeUrl(rawUrl)'), 'candidates must go through the shared sanitiser');
});

test('OTA installs are gated on a SHA-256 checksum', () => {
  const dart = fs.readFileSync(
    path.join(REPO, 'application_octal_dialer/lib/screens/connected_screen.dart'),
    'utf8'
  );
  assert.ok(dart.includes("import 'package:crypto/crypto.dart';"), 'crypto must be imported');
  assert.ok(dart.includes('sha256.bind(file.openRead())'), 'the APK must be hashed from disk');
  assert.ok(dart.includes('if (actual != expected)'), 'the hash must be compared');
  assert.ok(dart.includes("invokeMethod('installApk'"), 'install must go through the native bridge');
  assert.ok(
    !dart.includes('APK signature verification not yet implemented'),
    'the unimplemented stub must be gone'
  );

  const kotlin = fs.readFileSync(
    path.join(REPO, 'application_octal_dialer/android/app/src/main/kotlin/com/octal/dialer/octal_dialer/MainActivity.kt'),
    'utf8'
  );
  assert.ok(kotlin.includes('"installApk" ->'), 'the native handler must be registered');
  assert.ok(kotlin.includes('FileProvider.getUriForFile'), 'the APK must be shared via FileProvider');

  const server = read('server.ts');
  assert.ok(server.includes('function computeServedApkHash()'), 'the server must hash the served APK');
  assert.ok(server.includes('sha256Hash: computeServedApkHash()'), 'the socket event must publish the hash');
});

test('the desktop agent has no hard-coded workspace credentials', () => {
  const screen = fs.readFileSync(
    path.join(REPO, 'desktop_octal_agent/lib/screens/main_desktop_screen.dart'),
    'utf8'
  );
  assert.ok(!screen.includes('owner@octal.local'), 'the hard-coded login must be gone');
  assert.ok(!screen.includes('OwnerPassword1234!'), 'the hard-coded password must be gone');
  assert.ok(screen.includes('Widget _buildSettingsTab()'), 'the Agent Settings tab must exist');
  assert.ok(screen.includes('case 4:'), 'the settings tab must be reachable from the sidebar');

  const api = fs.readFileSync(path.join(REPO, 'desktop_octal_agent/lib/services/api_service.dart'), 'utf8');
  for (const ep of ['/api/fb-tasks/pending', '/claim', '/complete']) {
    assert.ok(api.includes(ep), `the agent must call ${ep}`);
  }
  assert.ok(api.includes('sendHeartbeat'), 'the agent must send heartbeats');
  assert.ok(api.includes('SharedPreferences'), 'settings must be persisted');
});

test('the Messenger sniffer supports a resident daemon mode', () => {
  const bot = fs.readFileSync(path.join(REPO, 'desktop_octal_agent/local_engine/local_fb_bot.js'), 'utf8');
  assert.ok(bot.includes("mode = 'listen'"), '--listen must select daemon mode');
  assert.ok(bot.includes('const isListenMode'), 'daemon mode must be a distinct branch');
  assert.ok(bot.includes('DAEMON MODE'), 'daemon mode must announce itself');
  assert.ok(bot.includes("process.on('SIGTERM'"), 'daemon mode must shut down cleanly');
  assert.ok(
    !/await sleep\(60000\);\s*\r?\n\s*console\.log\(`🏁 Campaign cycle finished[\s\S]*?process\.exit\(0\);\s*\r?\n\}\)\(\);\s*$/.test(bot),
    'the unconditional 60s-then-exit tail must be gone'
  );
});

console.log(`\n${passed} security hardening regression tests passed.`);
