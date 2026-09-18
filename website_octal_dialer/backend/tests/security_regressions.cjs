// Isolated behavioral regressions against actual TypeScript; no network/live DB.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const jwt = require('jsonwebtoken');
const root = path.join(__dirname, '../src');
const quiet = { log() {}, error() {}, warn() {} };
const env = { NODE_ENV: 'test', GOOGLE_CLIENT_ID: 'test-client', JWT_SECRET: 'mock-jwt-secret-for-testing-purposes-123456' };
function load(file, imports, extra = {}) {
  const code = fs.readFileSync(path.join(root, file), 'utf8');
  const js = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(js, { module, exports: module.exports, __dirname: root, Buffer, console: quiet,
    process: { env, cwd: () => root }, setTimeout: () => ({ unref() {} }), setInterval: () => 0,
    require: id => {
      if (Object.hasOwn(imports, id)) return imports[id];
      if (['crypto', 'os', 'fs', 'path', 'node:async_hooks'].includes(id)) return require(id);
      throw new Error('Unexpected dependency: ' + id);
    }, ...extra });
  return module.exports;
}
async function main() {
  let count = 0;
  async function check(name, fn) { await fn(); count++; console.log('PASS ' + name); }
  let allowed = true;
  let execute = async () => ({ rowCount: 1 });
  const db = { init: async () => {}, queryOne: async () => null, queryAll: async () => [],
    execute: (...args) => execute(...args), withTransaction: fn => fn({}) };
  const session = load('sessionManager.ts', { './databaseManager': { db }, './entitlementManager': { checkLimit: async () => ({ allowed }) } });
  const pair = (s, token = s.token, socket = 'phone') => session.pairPhone(token, socket, 'test', 'bt-test', 'Android', '127.0.0.1', s.id);
  await check('session ID and invalid token cannot pair', async () => {
    const s = session.createSession('laptop', 'tenant', 'owner');
    assert.equal(await pair(s, s.id), null); assert.equal(await pair(s, 'invalid'), null); assert.equal(s.phoneSocketId, null);
  });
  await check('expired token cannot pair', async () => {
    const s = session.createSession('laptop', 'tenant', 'owner'); s.tokenExpiresAt = new Date(0);
    assert.equal(await pair(s), null);
  });
  await check('valid token pairs only after DB success', async () => {
    const s = session.createSession('laptop', 'tenant', 'owner');
    assert.equal((await pair(s)).id, s.id); assert.equal(s.phoneSocketId, 'phone');
  });
  await check('quota failure leaves session unchanged', async () => {
    const s = session.createSession('laptop', 'tenant', 'owner'); allowed = false;
    assert.equal(await pair(s), null); assert.equal(s.status, 'WAITING'); assert.equal(s.phoneSocketId, null); allowed = true;
  });
  await check('cross-user reclaim gets a fresh session', async () => {
    const s = session.createSession('laptop', 'tenant', 'owner');
    assert.notEqual(session.reclaimOrCreateSession('other', s.id, 'tenant', 'intruder').id, s.id);
    assert.equal(s.userId, 'owner');
  });
  await check('late disconnect cannot clear replacement binding', async () => {
    const s = session.createSession('laptop', 'tenant', 'owner'); s.phoneSocketId = 'old'; s.phoneBtAddress = 'bt';
    let resolve;
    execute = () => new Promise(r => { resolve = r; });
    const pending = session.handlePhoneDisconnect('old');
    s.phoneSocketId = 'new'; resolve({ rowCount: 1 }); await pending;
    assert.equal(s.phoneSocketId, 'new'); execute = async () => ({ rowCount: 1 });
  });
  await check('failed calls cannot shadow or resurrect a later call', async () => {
    const p = { sessionId: 's', tenantId: 't', userId: 'u', phoneDeviceId: 'd', laptopSocketId: 'l', phoneSocketId: 'p', phone: '1', name: 'test', direction: 'OUTBOUND' };
    const a = session.createCallSession(p); session.updateCallSessionState(a.callId, 'DIAL_FAILED');
    const b = session.createCallSession(p);
    assert.equal(session.getCallSessionBySessionId('s').callId, b.callId);
    assert.equal(session.updateCallSessionState(a.callId, 'ACTIVE'), undefined);
    assert.equal(session.updateCallSessionState(b.callId, 'invented-state'), undefined);
  });
  const events = []; let nextId = 0;
  class Pool {
    on() {}
    async query(sql) { events.push(['pool', sql]); return { rows: [], rowCount: 0 }; }
    async connect() {
      const id = ++nextId;
      return { query: async sql => { events.push([id, sql]); return { rows: [], rowCount: 0 }; }, release: () => events.push([id, 'RELEASE']) };
    }
  }
  const pool = load('db/pool.ts', { pg: { Pool } }); pool.initDatabasePool('postgres://isolated-mock');
  await check('pool helpers use transaction connection and rollback on failure', async () => {
    events.length = 0;
    await assert.rejects(pool.withTransaction(async () => { await pool.query('WRITE'); throw new Error('fault'); }));
    assert.deepEqual(events.map(e => e[1]), ['BEGIN', 'WRITE', 'ROLLBACK', 'RELEASE']);
    assert.equal(new Set(events.map(e => e[0])).size, 1);
  });
  await check('concurrent transactions keep independent connections', async () => {
    events.length = 0;
    await Promise.all([1, 2].map(n => pool.withTransaction(async () => { await Promise.resolve(); await pool.query('WRITE' + n); })));
    const writes = events.filter(e => e[1].startsWith('WRITE'));
    assert.equal(new Set(writes.map(e => e[0])).size, 2); assert.equal(events.some(e => e[0] === 'pool'), false);
  });
  await check('caught nested failure still aborts outer transaction', async () => {
    events.length = 0;
    await assert.rejects(pool.withTransaction(async () => { try { await pool.withTransaction(async () => { throw new Error('nested'); }); } catch {} }));
    assert.equal(events.some(e => e[1] === 'COMMIT'), false);
  });
  class OAuth2Client {
    async verifyIdToken({ idToken, audience }) {
      assert.equal(audience, 'test-client');
      if (idToken !== 'verified-token') throw new Error('bad signature');
      return { getPayload: () => ({ sub: 'subject', email: 'test@example.invalid', email_verified: true }) };
    }
  }
  const auth = load('authManager.ts', { './databaseManager': { db }, express: {}, jsonwebtoken: jwt, 'google-auth-library': { OAuth2Client }, './emailVerificationService': {} });
  await check('Google verification rejects missing/forged credentials', async () => {
    await assert.rejects(auth.verifyGoogleIdToken(undefined)); await assert.rejects(auth.verifyGoogleIdToken('forged'));
    assert.equal((await auth.verifyGoogleIdToken('verified-token')).googleId, 'subject');
  });
  await check('unlinked local password account rejects Google takeover without password challenge', async () => {
    const localUser = { id: 'u1', username: 'local_user', email: 'test@example.invalid', role: 'user', tenantId: 't1', authProvider: 'local', googleId: null };
    db.queryOne = async (sql, params) => {
      if (sql.includes('users WHERE "googleId" = $1')) return null;
      if (sql.includes('email = $1 OR username = $2')) return localUser;
      return null;
    };
    await assert.rejects(
      auth.authenticateGoogleSignIn({ googleId: 'attacker-sub', email: 'test@example.invalid' }),
      err => err.code === 'ACCOUNT_LINK_REQUIRED'
    );
  });
  await check('suspended user or revoked token is rejected by validateToken', async () => {
    let mockUser = { id: 'u1', username: 'alice', role: 'user', tenantId: 't1', status: 'suspended' };
    db.queryOne = async (sql) => {
      if (sql.includes('FROM users')) return mockUser;
      if (sql.includes('FROM tenants')) return { status: 'active' };
      return null;
    };
    const validJwt = jwt.sign({ sub: 'u1', username: 'alice', role: 'user', tenantId: 't1' }, 'mock-jwt-secret-for-testing-purposes-123456');
    // Suspended user check
    assert.equal(await auth.validateToken(validJwt), null);

    // Active user check
    mockUser.status = 'active';
    const active = await auth.validateToken(validJwt);
    assert.equal(active?.id, 'u1');

    // Revoked on logout check
    await auth.logout(validJwt);
    assert.equal(await auth.validateToken(validJwt), null);
  });
  await check('expired QR token can be safely refreshed with fresh expiration', async () => {
    const s = session.createSession('laptop', 'tenant', 'owner');
    const oldToken = s.token;
    s.tokenExpiresAt = new Date(0); // Expired
    assert.equal(await pair(s), null);

    const refreshed = session.refreshSessionToken(s.id, 'owner', 'tenant');
    assert.ok(refreshed);
    assert.notEqual(refreshed.token, oldToken);
    assert.ok(refreshed.tokenExpiresAt.getTime() > Date.now());
    assert.equal((await pair(s)).id, s.id);
  });
  await check('all Google JSON aliases invoke verification before account lookup', async () => {
    const source = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
    const start = source.indexOf("app.post(['/auth/google/verify'");
    const end = source.indexOf('// GET /auth/permissions', start);
    let handler, aliases, called = false;
    const script = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(script, { app: { post: (paths, fn) => { aliases = paths; handler = fn; } },
      verifyGoogleIdToken: auth.verifyGoogleIdToken, handleGoogleAuthWithIntent: async () => { called = true; return { token: 'ok', user: {} }; } });
    const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
    await handler({ body: { email: 'victim@example.invalid' } }, response);
    assert.equal(response.code, 400); assert.equal(called, false); assert.equal(aliases.length, 4);
    await handler({ body: { credential: 'forged' } }, response); assert.equal(called, false);
    await handler({ body: { credential: 'verified-token' } }, response); assert.equal(called, true);
  });
  const manager = load('databaseManager.ts', { './entitlementManager': { initializeCatalogPlans: async () => {} }, './db/dbAdapter': { dbAdapter: db } });
  await check('foreign team references fail before destructive membership replacement', async () => {
    let writes = 0; execute = async () => { writes++; return { rowCount: 1 }; };
    await assert.rejects(manager.setTeamMembers('foreign-team', 'tenant', ['user']));
    await assert.rejects(manager.setTeamCampaigns('foreign-team', 'tenant', ['campaign']));
    assert.equal(writes, 0);
  });
  console.log(`${count} isolated regression groups passed. Real PostgreSQL and handset tests remain required.`);
}
main().catch(err => { console.error(err); process.exitCode = 1; });
