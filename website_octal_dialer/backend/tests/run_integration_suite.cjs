// run_integration_suite.cjs
// ─────────────────────────────────────────────────────────────────────────────
// Brings up a disposable PostgreSQL instance and a real backend server, then
// runs every end-to-end suite that needs a live API against it.
//
// These suites were already written but had no way to run: each one expects an
// HTTP server on port 5000 and fails with ECONNREFUSED standalone. Between them
// they cover platform/tenant authority isolation, production portal isolation,
// per-role permission enforcement, CRM phases 1-2, and the onboarding lifecycle
// — i.e. the OWASP A01 access-control surface that static review cannot reach.
//
// Usage:  npm run test:e2e
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawn } = require('child_process');
const EmbeddedPostgres = require('embedded-postgres').default;

const PG_PORT = 54332;
const API_PORT = 5000;
const PG_PASSWORD = 'integration_test_pw';

// Suites that require the live API. Order matters only for readability.
const SUITES = [
  'test_platform_authority_isolation.cjs',
  'test_production_portal_isolation.cjs',
  'test_final_platform_customer_security_audit.cjs',
  'test_authority_security_closeout.cjs',
  'test_access_hierarchy.cjs',
  'test_onboarding_lifecycle.cjs',
  'test_platform_sync.cjs',
  'test_crm_phase1.cjs',
  'test_crm_phase2.cjs'
];

function waitForHealth(timeoutMs = 300000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      process.stdout.write('.');
      const req = http.get(
        { host: '127.0.0.1', port: API_PORT, path: '/api/health', timeout: 2000 },
        (res) => {
          res.resume();
          if (res.statusCode === 200) return resolve();
          retry();
        }
      );
      req.on('error', retry);
      req.on('timeout', () => { req.destroy(); retry(); });
    };
    const retry = () => {
      if (Date.now() > deadline) {
        return reject(new Error(`API did not become healthy on port ${API_PORT} within ${timeoutMs}ms`));
      }
      setTimeout(attempt, 1000);
    };
    attempt();
  });
}

function runSuite(file, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(__dirname, file)], {
      cwd: path.join(__dirname, '..'),
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    // A suite that cannot spawn must not take the runner down.
    child.on('error', (err) => resolve({ file, code: -1, out: `spawn failed: ${err.message}` }));
    child.on('close', (code) => resolve({ file, code, out }));
  });
}

function summarise(out) {
  const m =
    out.match(/ALL\s+[\d/]+[^\n]*PASSED[^\n]*/i) ||
    out.match(/\d+\s+PASSED,\s+\d+\s+FAILED/i) ||
    out.match(/RESULTS:[^\n]*/i) ||
    out.match(/ECONNREFUSED[^\n]*/i);
  return m ? m[0].trim().slice(0, 90) : out.trim().split('\n').pop().slice(0, 90);
}

async function main() {
  console.log('===============================================================');
  console.log('END-TO-END INTEGRATION SUITE (live PostgreSQL + live API)');
  console.log('===============================================================\n');

  const dataDir = path.join(os.tmpdir(), 'pg_e2e_' + Date.now());
  fs.mkdirSync(dataDir, { recursive: true });

  const pgServer = new EmbeddedPostgres({
    port: PG_PORT,
    databaseDir: dataDir,
    user: 'postgres',
    password: PG_PASSWORD,
    persistent: false
  });

  let serverProc = null;
  let serverLog = '';

  try {
    console.log('1. Starting disposable PostgreSQL...');
    await pgServer.initialise();
    await pgServer.start();
    console.log(`   PostgreSQL up on ${PG_PORT}.\n`);

    const env = {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(API_PORT),
      DATABASE_URL: `postgresql://postgres:${PG_PASSWORD}@127.0.0.1:${PG_PORT}/postgres`,
      JWT_SECRET: 'integration_test_jwt_secret_at_least_32_chars_long',
      SECRETS_KEY: 'integration_test_secrets_key_at_least_32_chars',
      BILLING_WEBHOOK_SECRET: 'integration_test_webhook_secret_value',
      ALLOWED_ORIGINS: `http://127.0.0.1:${API_PORT},http://localhost:${API_PORT}`,
      TRUST_PROXY: '0',
      // server.ts intentionally skips listen() under NODE_ENV=test unless
      // this is set, so the suites would never find an API without it.
      TEST_LISTEN: 'true'
    };

    console.log('2. Booting the backend (migrations run on startup)...');
    serverProc = spawn(
      process.execPath,
      [path.join(__dirname, '../node_modules/tsx/dist/cli.mjs'), path.join(__dirname, '../src/server.ts')],
      { cwd: path.join(__dirname, '..'), env, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    serverProc.stdout.on('data', (d) => (serverLog += d));
    serverProc.stderr.on('data', (d) => (serverLog += d));
    serverProc.on('error', (err) => { serverLog += `\n[spawn error] ${err.message}`; });

    await waitForHealth();
    console.log(`   API healthy on ${API_PORT}.\n`);

    console.log('3. Running integration suites:\n');
    const results = [];
    for (const file of SUITES) {
      if (!fs.existsSync(path.join(__dirname, file))) {
        console.log(`   SKIP  ${file} (not present)`);
        continue;
      }
      const r = await runSuite(file, env);
      results.push(r);
      const status = r.code === 0 ? 'PASS' : 'FAIL';
      console.log(`   ${status}  ${file.padEnd(48)} ${summarise(r.out)}`);
    }

    const failed = results.filter((r) => r.code !== 0);
    console.log('\n---------------------------------------------------------------');
    console.log(`${results.length - failed.length}/${results.length} integration suites passed.`);

    if (failed.length) {
      console.log('\nFailing suite output:\n');
      for (const f of failed) {
        console.log(`===== ${f.file} (exit ${f.code}) =====`);
        console.log(f.out.split('\n').slice(-40).join('\n'));
        console.log('');
      }
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('\nHarness failed before suites could run:', err.message);
    console.error('\n--- server output ---\n' + serverLog.split('\n').slice(-60).join('\n'));
    process.exitCode = 1;
  } finally {
    if (serverProc) { try { serverProc.kill(); } catch (_) {} }
    try { await pgServer.stop(); } catch (_) {}
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (_) {}
  }
}

main();
