/**
 * tests/web_hardening.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Covers the web-layer hardening pass:
 *
 *  1. Security headers are actually emitted (helmet config is valid).
 *  2. Credential endpoints are rate limited and return 429 under a burst.
 *  3. Open redirects are closed (OAuth returnUrl allowlist + click-tracker HMAC).
 *  4. No cleartext transport fallbacks or raw-HTML sinks in the web client.
 *  5. Dependency posture stays on the patched majors.
 *
 * Run with: npm run test:web-hardening
 * ─────────────────────────────────────────────────────────────────────────────
 */

import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import {
  makeSafeRedirectTarget,
  signTrackedUrl,
  isTrackedUrlSignatureValid
} from '../src/services/redirectGuard';
import { sanitizeSpreadsheetValue } from '../src/utils/spreadsheetSafety';

process.env.NODE_ENV = process.env.NODE_ENV || 'test';

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`PASS ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}`);
    console.error(err);
    process.exit(1);
  }
}

const SRC = path.resolve(__dirname, '../src');
const WEB = path.resolve(__dirname, '../../frontend/src');
const read = (rel: string): string => fs.readFileSync(path.join(SRC, rel), 'utf8');
const serverSrc = read('server.ts');
const guardSrc = read('services/redirectGuard.ts');

/** Lift a literal block out of server.ts so the test exercises the real config. */
function extractBlock(startMarker: string, endMarker: string): string {
  const a = serverSrc.indexOf(startMarker);
  assert.ok(a > 0, `marker not found: ${startMarker}`);
  const b = serverSrc.indexOf(endMarker, a);
  assert.ok(b > a, `end marker not found: ${endMarker}`);
  return serverSrc.slice(a, b + endMarker.length);
}

function request(
  server: http.Server,
  reqPath: string,
  method = 'GET'
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  const addr = server.address() as { port: number };
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: addr.port, path: reqPath, method }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode || 0, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function withServer(fn: (s: http.Server) => Promise<void>): Promise<void> {
  const app = express();

  // Mount helmet with the exact options server.ts uses, so a bad directive
  // fails this test rather than production boot.
  const helmetBlock = extractBlock('app.use(helmet({', '}));');
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const mountHelmet = new Function('app', 'helmet', 'isProduction', helmetBlock);
  mountHelmet(app, helmet, false);

  app.use(
    '/auth/login',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 20,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      skipSuccessfulRequests: true,
      message: { error: 'Too many sign-in attempts. Please wait a few minutes and try again.' }
    })
  );
  app.post('/auth/login', (_req, res) => res.status(401).json({ error: 'nope' }));
  app.get('/ok', (_req, res) => res.json({ ok: true }));

  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  try {
    await fn(server);
  } finally {
    server.close();
  }
}

async function main(): Promise<void> {
  // ─── 1. Security headers ──────────────────────────────────────────────────

  await test('helmet config is valid and emits hardening headers', async () => {
    await withServer(async (server) => {
      const res = await request(server, '/ok');
      assert.equal(res.status, 200);

      const csp = String(res.headers['content-security-policy'] || '');
      assert.ok(csp, 'CSP header must be present');
      assert.match(csp, /frame-ancestors 'none'/, 'clickjacking must be blocked');
      assert.match(csp, /object-src 'none'/);
      assert.match(csp, /base-uri 'self'/);
      assert.match(csp, /form-action 'self'/);
      assert.ok(!/script-src[^;]*unsafe-inline/.test(csp), 'inline scripts must not be allowed');

      assert.equal(res.headers['x-content-type-options'], 'nosniff');
      assert.equal(res.headers['referrer-policy'], 'strict-origin-when-cross-origin');
      assert.ok(!res.headers['x-powered-by'], 'Express fingerprint must be suppressed');
    });
  });

  await test('security middleware is mounted ahead of the body parsers', () => {
    const helmetAt = serverSrc.indexOf('app.use(helmet({');
    const limiterAt = serverSrc.indexOf('app.use(express.json(');
    assert.ok(helmetAt > 0, 'helmet must be mounted');
    assert.ok(helmetAt < limiterAt, 'helmet must run before body parsing');
    assert.ok(serverSrc.includes("app.use('/api', apiLimiter);"), 'the API backstop limiter must be mounted');
  });

  // ─── 2. Brute-force protection ────────────────────────────────────────────

  await test('failed sign-in attempts are throttled with 429', async () => {
    await withServer(async (server) => {
      let sawLimit = false;
      let lastStatus = 0;
      for (let i = 0; i < 25; i++) {
        const res = await request(server, '/auth/login', 'POST');
        lastStatus = res.status;
        if (res.status === 429) {
          sawLimit = true;
          assert.match(res.body, /Too many sign-in attempts/);
          break;
        }
      }
      assert.ok(sawLimit, `brute force was never throttled (last status ${lastStatus})`);
    });
  });

  await test('every credential endpoint sits behind a limiter', () => {
    for (const route of [
      "'/auth/login', '/api/auth/login'",
      "'/admin/login', '/api/admin/login'",
      "'/api/mobile/login'",
      "'/auth/register', '/api/auth/register'",
      "'/auth/signup-tenant', '/api/auth/signup-tenant'"
    ]) {
      assert.ok(serverSrc.includes(route), `route group must be listed for throttling: ${route}`);
    }
    assert.ok(serverSrc.includes('], authLimiter);'), 'auth limiter must be applied');
    assert.ok(serverSrc.includes('], signupLimiter);'), 'signup limiter must be applied');
    assert.ok(serverSrc.includes('skipSuccessfulRequests: true'), 'successful logins must not consume quota');
  });

  // ─── 3. Open redirects ────────────────────────────────────────────────────

  await test('safeRedirectTarget rejects every off-origin and scheme trick', () => {
    const FB = 'https://app.example.com';
    const denyAll = makeSafeRedirectTarget(() => false);
    const allowAll = makeSafeRedirectTarget(() => true);

    for (const hostile of [
      'https://evil.com/phish',
      'http://evil.com',
      '//evil.com',
      '/\\evil.com',
      '/\/evil.com',
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      'not a url at all'
    ]) {
      assert.equal(denyAll(hostile, FB), FB, `must reject: ${hostile}`);
    }

    // Same-origin relative paths stay usable.
    assert.equal(denyAll('/settings/mailboxes', FB), '/settings/mailboxes');
    assert.equal(denyAll('', FB), FB);
    assert.equal(denyAll(null, FB), FB);
    assert.equal(denyAll(undefined, FB), FB);

    // An allowed origin passes; a dangerous scheme never does, even then.
    assert.ok(String(allowAll('https://app.example.com/done', FB)).startsWith('https://app.example.com/done'));
    assert.equal(allowAll('javascript:alert(1)', FB), FB);
    assert.equal(allowAll('//evil.com', FB), FB);
  });

  await test('the OAuth returnUrl is constrained at every redirect site', () => {
    assert.ok(
      serverSrc.includes('makeSafeRedirectTarget(isOriginAllowed)'),
      'the guard must be bound to the CORS allowlist'
    );
    assert.ok(
      !/const returnUrl = \(req\.query\.returnUrl as string\) \|\| refererOrigin;/.test(serverSrc),
      'the raw query value must no longer reach a redirect'
    );
    assert.ok(serverSrc.includes('const returnUrl = safeRedirectTarget('), 'connect route must wrap returnUrl');
    assert.ok(
      serverSrc.includes('safeRedirectTarget(state?.returnUrl || fallbackReturn, fallbackReturn)'),
      'the callback must re-check the value carried inside the signed state'
    );
    assert.ok(guardSrc.includes('if (!isOriginAllowed(parsed.origin)) return fallback;'), 'targets must be allowlisted');
  });

  await test('click-tracking redirects require an HMAC we minted', () => {
    const secret = 'test-jwt-secret-value';
    const token = 'tok123';
    const target = 'https://customer.example/landing';
    const good = signTrackedUrl(secret, token, target);

    assert.equal(good.length, 32);
    assert.ok(isTrackedUrlSignatureValid(secret, token, target, good), 'our own link must validate');

    // Swapping either bound field, or forging without the secret, must fail.
    assert.ok(!isTrackedUrlSignatureValid(secret, token, 'https://evil.com', good), 'target is bound');
    assert.ok(!isTrackedUrlSignatureValid(secret, 'otherTok', target, good), 'token is bound');
    assert.ok(!isTrackedUrlSignatureValid('other-secret', token, target, good), 'secret is required');
    assert.ok(!isTrackedUrlSignatureValid(secret, token, target, ''), 'empty signature is rejected');
    assert.ok(!isTrackedUrlSignatureValid(secret, token, target, null), 'missing signature is rejected');
    assert.ok(!isTrackedUrlSignatureValid(secret, token, target, 'x'.repeat(32)), 'forged signature is rejected');

    assert.ok(guardSrc.includes('crypto.timingSafeEqual'), 'comparison must be constant-time');
    assert.ok(serverSrc.includes('&sig=${sig}'), 'generated tracking links must carry the signature');
    assert.ok(
      serverSrc.includes('isTrackedUrlSignatureValid(token, targetUrl, signature)'),
      'the redirector must verify before forwarding'
    );
  });

  // ─── 4. Web client hygiene ────────────────────────────────────────────────

  await test('the web login has no cleartext transport fallback', () => {
    const login = fs.readFileSync(path.join(WEB, 'components/LoginScreen.tsx'), 'utf8');
    assert.ok(!login.includes('140.245.215.156'), 'the stale cleartext IP must be gone');

    // A cleartext URL is only acceptable inside an explicitly local-only
    // branch, so track which lines those blocks cover rather than judging
    // each line in isolation.
    const lines = login.split('\n');
    const localOnly = new Set<number>();
    for (let i = 0; i < lines.length; i++) {
      if (!/if\s*\(\s*isLocal\s*\)/.test(lines[i])) continue;
      let depth = 0;
      let started = false;
      for (let j = i; j < lines.length; j++) {
        depth += (lines[j].match(/\{/g) || []).length;
        depth -= (lines[j].match(/\}/g) || []).length;
        if (/\{/.test(lines[j])) started = true;
        localOnly.add(j);
        if (started && depth <= 0) break;
      }
    }

    lines.forEach((line, i) => {
      if (!line.includes('http://') || line.includes('https://')) return;
      const literalLocal = /127\.0\.0\.1|localhost/.test(line);
      assert.ok(
        literalLocal || localOnly.has(i),
        `cleartext fallback outside a local-only branch (line ${i + 1}): ${line.trim()}`
      );
    });
  });

  await test('externally sourced URLs cannot carry an executable scheme', () => {
    const util = fs.readFileSync(path.join(WEB, 'utils/safeUrl.ts'), 'utf8');
    assert.ok(util.includes('SAFE_PROTOCOLS'), 'a scheme allowlist must exist');
    assert.ok(!util.includes("'javascript:'"), 'javascript: must never be allowlisted');

    for (const f of ['components/FacebookScraper.tsx', 'components/FacebookAutoPoster.tsx']) {
      const src = fs.readFileSync(path.join(WEB, f), 'utf8');
      assert.ok(src.includes('safeExternalHref('), `${f} must guard its dynamic href`);
    }
  });

  await test('the SPA renders no raw HTML and evaluates no strings', () => {
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) return walk(full);
        return /\.tsx?$/.test(e.name) ? [full] : [];
      });

    for (const file of walk(WEB)) {
      const src = fs.readFileSync(file, 'utf8');
      assert.ok(!src.includes('dangerouslySetInnerHTML'), `raw HTML injection sink in ${file}`);
      assert.ok(!/\beval\s*\(/.test(src), `eval() in ${file}`);
      assert.ok(!/new\s+Function\s*\(/.test(src), `dynamic code construction in ${file}`);
    }
  });

  // ─── 4b. Review follow-ups ────────────────────────────────────────────────

  await test('trust proxy is applied before the rate limiters', () => {
    const trustAt = serverSrc.indexOf("app.set('trust proxy'");
    const limiterAt = serverSrc.indexOf('], authLimiter);');
    assert.ok(trustAt > 0, 'trust proxy must be configured, or every client shares one bucket');
    assert.ok(limiterAt > 0, 'auth limiter must be mounted');
    assert.ok(trustAt < limiterAt, 'trust proxy must be set before limiters read req.ip');
    assert.ok(serverSrc.includes('config.trustProxy'), 'it must use the configured value');
  });

  await test('the Facebook worker spawn cannot crash the process', () => {
    const fb = read('facebookPosterRoutes.ts');
    assert.ok(fb.includes("child.on('error'"), 'a spawn error listener is required');

    const errAt = fb.indexOf("child.on('error'");
    const closeAt = fb.indexOf("child.on('close'");
    assert.ok(errAt > 0 && closeAt > errAt, 'the error listener must be attached alongside close');

    const handler = fb.slice(errAt, closeAt);
    assert.ok(handler.includes('scrubDecryptedCookies('), 'a failed spawn must still scrub the cookie jar');
    assert.ok(handler.includes('activeJobs.delete('), 'a failed spawn must release the tenant job slot');
  });

  await test('a failed legacy import is retried rather than remembered', () => {
    const fb = read('facebookPosterRoutes.ts');
    const fn = fb.slice(fb.indexOf('async function importLegacyTenantData'), fb.indexOf('// ─── CONFIG HELPERS'));

    assert.ok(fn.includes('legacyImportsInFlight'), 'concurrent callers must share one in-flight import');
    // The tenant may only be marked done after the import resolves.
    const addAt = fn.indexOf('importedTenants.add(tenantId)');
    const awaitAt = fn.indexOf('await run;');
    assert.ok(addAt > 0 && awaitAt > 0 && awaitAt < addAt, 'the tenant must be marked imported only after success');
  });

  await test('the pending-dedupe index is preceded by a de-duplication step', () => {
    const migration = fs.readFileSync(
      path.join(SRC, 'db/migrations/025_fb_persistence_and_integrity.sql'),
      'utf8'
    );
    const dedupeAt = migration.indexOf('ROW_NUMBER() OVER (');
    const indexAt = migration.indexOf('idx_fb_tasks_pending_dedupe');
    assert.ok(dedupeAt > 0, 'duplicate pending rows must be collapsed first');
    assert.ok(dedupeAt < indexAt, 'de-duplication must run before the UNIQUE index is created');
  });

  await test('the CSV sanitiser lives in a side-effect-free module', () => {
    const util = read('utils/spreadsheetSafety.ts');
    assert.ok(util.includes('export function sanitizeSpreadsheetValue'), 'the sanitiser must live here');
    assert.ok(!util.includes('process.on('), 'the util must register no process listeners');
    assert.ok(
      !serverSrc.includes("from './scraperWorker'"),
      'server.ts must not import the worker module (it registers an IPC listener)'
    );
  });

  // ─── 5. Authentication integrity ──────────────────────────────────────────

  await test('no hardcoded credential backdoor survives in password verification', () => {
    const auth = read('authManager.ts');
    const fn = auth.slice(auth.indexOf('function verifyPassword('), auth.indexOf('export async function verifyCaptcha'));

    assert.ok(!/password === '/.test(fn), 'no literal password comparison may exist');
    assert.ok(!fn.includes('AdminPassword'), 'the admin backdoor literal must be gone');
    assert.ok(!fn.includes('master_mohsin7'), 'no username may shortcut verification');
    assert.ok(fn.includes('crypto.timingSafeEqual'), 'comparison must stay constant-time');
    assert.ok(fn.includes('if (a.length !== b.length) return false;'), 'length mismatch must fail closed');
  });

  await test('bootstrap never rewrites an existing account password', () => {
    const auth = read('authManager.ts');
    for (const marker of [
      "[adminPasswordHash, now, existingAdmin.id]",
      "[adminPasswordHash, now, existingMohsin.id]",
      "[ownerPasswordHash, now, existingOwner.id]"
    ]) {
      assert.ok(!auth.includes(marker), `bootstrap must not reset an existing password: ${marker}`);
    }
    assert.ok(auth.includes('resolveBootstrapPassword('), 'bootstrap passwords must come from the environment');
    assert.ok(auth.includes("process.env.NODE_ENV === 'production'"), 'production must not use a literal default');
    assert.ok(auth.includes('crypto.randomBytes(18)'), 'production must generate a random bootstrap password');
    assert.ok(
      !auth.includes("(owner@octal.local / OwnerPassword1234!)"),
      'the owner credential must not be printed to logs'
    );
  });

  await test('CAPTCHA test tokens are rejected in production', () => {
    const auth = read('authManager.ts');
    const fn = auth.slice(auth.indexOf('export async function verifyCaptcha'));
    const idx = fn.indexOf("1x00000000000000000000AA");
    assert.ok(idx > 0, 'the test-token branch should still exist for local development');

    const guard = fn.slice(Math.max(0, idx - 260), idx);
    assert.ok(
      guard.includes("process.env.NODE_ENV !== 'production'"),
      'the test-token bypass must be gated to non-production'
    );
  });

  await test('spreadsheet exports neutralise formula injection', () => {
    const util = read('utils/spreadsheetSafety.ts');
    assert.ok(util.includes('export function csvField('), 'a CSV field renderer must exist');
    assert.ok(util.includes('sanitizeSpreadsheetValue('), 'it must reuse the shared sanitiser');
    assert.ok(serverSrc.includes('csvField('), 'the exports must use it');
    assert.ok(
      !/`"\$\{\(l\.(leadName|name) \|\| ''\)\.replace/.test(serverSrc),
      'raw quoted interpolation must no longer build export rows'
    );

    assert.ok(util.includes('formula injection'), 'the sanitiser must document its purpose');
    for (const lead of ['=', '+', '-', '@']) {
      assert.ok(
        sanitizeSpreadsheetValue(`${lead}cmd|'/c calc'!A1`).startsWith("'"),
        `formula lead-in must be neutralised: ${lead}`
      );
    }
    // Legitimate values must survive untouched.
    assert.equal(sanitizeSpreadsheetValue('+14155550123'), '+14155550123');
    assert.equal(sanitizeSpreadsheetValue('Acme Plumbing'), 'Acme Plumbing');
  });

  // ─── 5. Dependency posture ────────────────────────────────────────────────

  await test('patched dependency majors are pinned', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));
    const major = (range: string): number => parseInt(String(range).replace(/^[^0-9]*/, ''), 10);

    // nodemailer <10 reuses a process-global DNS cache across transports,
    // leaking SMTP credentials between tenants — this product's threat model.
    assert.ok(major(pkg.dependencies.nodemailer) >= 10, 'nodemailer must be >= 10');
    assert.ok(pkg.dependencies.helmet, 'helmet must be a dependency');
    assert.ok(pkg.dependencies['express-rate-limit'], 'express-rate-limit must be a dependency');
  });
}

main()
  .then(() => {
    console.log(`\n${passed} web hardening regression tests passed.`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
