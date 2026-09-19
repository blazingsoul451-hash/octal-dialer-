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
  const safety = load('safetyController.ts', {
    './sessionManager': session,
    './databaseManager': { db, reserveLead: async () => true, recordCall: () => {} },
    './entitlementManager': { checkLimit: async () => ({ allowed: true }) }
  });

  await check('commands and locked leads enforce tenant scoping', async () => {
    let lastQuery = '', lastParams = [];
    db.queryAll = async (sql, params) => { lastQuery = sql; lastParams = params; return []; };
    execute = async (sql, params) => { lastQuery = sql; lastParams = params; return { rowCount: 1 }; };

    await safety.issueCommandId('lead1', 'sess1', 'tenantA');
    assert.ok(lastQuery.includes('"tenantId"'));
    assert.equal(lastParams[5], 'tenantA');

    await safety.getActiveCommands('tenantA');
    assert.ok(lastQuery.includes('"tenantId" = $2'));
    assert.equal(lastParams[1], 'tenantA');

    await manager.getLockedLeads('tenantA');
    assert.ok(lastQuery.includes('"tenantId" = $1'));
    assert.equal(lastParams[0], 'tenantA');
  });

  await check('unlock-all-leads scopes to tenant and awaits release', async () => {
    let releasedTenant = null;
    let releasedMinutes = null;
    let leadsEmitted = null;
    const mockRelease = async (mins, tenantId) => {
      releasedMinutes = mins;
      releasedTenant = tenantId;
      return 5;
    };
    const source = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
    const start = source.indexOf("app.post('/api/admin/system/unlock-all-leads'");
    const end = source.indexOf('// REST: App Version & OTA Update Check', start);
    let handler;
    const script = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(script, {
      app: { post: (p, a, b, fn) => { handler = fn; } },
      requireAuth: (req, res, next) => next(),
      requireAdmin: (req, res, next) => next(),
      releaseExpiredLeases: mockRelease,
      io: { to: (room) => ({ emit: (ev) => { leadsEmitted = { room, ev }; } }), emit: (ev) => { leadsEmitted = { ev }; } }
    });

    const res = { status(c) { this.code = c; return this; }, json(b) { this.body = b; } };
    // Tenant admin cannot unlock other tenants
    await handler({ user: { role: 'admin', tenantId: 'tenant_123' }, body: { tenantId: 'other_tenant' } }, res);
    assert.equal(res.body.success, true);
    assert.equal(res.body.count, 5);
    assert.equal(releasedTenant, 'tenant_123'); // strictly scoped to user tenantId
    assert.equal(leadsEmitted.room, 'tenant_tenant_123');

    // Platform admin can specify target tenant
    await handler({ user: { role: 'platform_admin', tenantId: 'sys' }, body: { tenantId: 'target_tenant' } }, res);
    assert.equal(releasedTenant, 'target_tenant');
  });

  await check('scraper file path traversal is rejected with 403', async () => {
    const temp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'octal-security-'));
    try {
      const service = load('googleMapsScraperService.ts', {
        child_process: {}, exceljs: {}, './databaseManager': { db }
      }, { __dirname: path.join(temp, 'src') });
      const routes = load('scraperRoutes.ts', { './googleMapsScraperService': service });
      let handler;
      routes.registerScraperRoutes({
        get() {},
        post(p, ...handlers) { if (p === '/api/scraper-files/import') handler = handlers.at(-1); }
      }, () => {}, { to() { return { emit() {} }; } }, service);
      const res = { status(c) { this.code = c; return this; }, json(b) { this.body = b; } };
      await handler({ user: { tenantId: 't1' }, body: { filePath: '../../../../etc/passwd' } }, res);
      assert.equal(res.code, 403);
      assert.ok(res.body.error.includes('Forbidden'));
    } finally { fs.rmSync(temp, { recursive: true, force: true }); }
  });

  await check('auto-emailer routes enforce permissions', async () => {
    const permMiddleware = auth.requirePermission(['autoEmailer', 'autoEmailer:view', 'autoEmailer:manage']);
    let called = false;
    const next = () => { called = true; };
    const res = { status(c) { this.code = c; return this; }, json(b) { this.body = b; } };

    // Standard unassigned agent (no autoEmailer)
    db.queryOne = async () => null; // unassigned
    db.queryAll = async () => [];
    await permMiddleware({ user: { id: 'u1', role: 'agent', tenantId: 't1' } }, res, next);
    assert.equal(called, false);
    assert.equal(res.code, 403);

    // Tenant admin has '*' bypass
    called = false;
    await permMiddleware({ user: { id: 'admin1', role: 'admin', tenantId: 't1' } }, res, next);
    assert.equal(called, true);
  });

  await check('socket disconnect preserves active GSM call and does not prematurely unlock active lead', async () => {
    const rawSource = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
    const source = rawSource.replace(/\r\n/g, '\n');
    // Verify disconnect handler does not finalize call session or unlock leads if active call exists
    assert.ok(source.includes("const hasActiveCall = activeCs && activeCs.state !== 'ENDED'"));
    assert.ok(source.includes("if (!hasActiveCall) {\n      await unlockLeadsForSession(session.id);\n    }"));
    assert.ok(!source.includes("finalizeCallSession(activeCs.callId, 'PHONE_DISCONNECTED'"));
    assert.ok(source.includes("socket.emit('call:ended-ack'"));
  });

  await check('R2: call completion ACK emits only after durable commit and deduplicates concurrent requests', async () => {
    const source = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
    // Verify separate inFlightCallFinalizations and committedCallEndings
    assert.ok(source.includes("const inFlightCallFinalizations = new Map<string, Promise<boolean>>()"));
    assert.ok(source.includes("const committedCallEndings = new Set<string>()"));
    // Verify that duplicate in-flight requests await the ongoing transaction rather than acknowledging prematurely
    assert.ok(source.includes("const existingInFlight = inFlightCallFinalizations.get(dedupeKey);"));
    assert.ok(source.includes("const ok = await existingInFlight;"));
    // Verify ownership check occurs before ACK emission
    const handlerStart = source.indexOf("socket.on('call:ended'");
    const handlerEnd = source.indexOf("socket.on('call:rejected'", handlerStart);
    const handlerBody = source.slice(handlerStart, handlerEnd);
    const ownershipIndex = handlerBody.indexOf("authoritativeDeviceId && authoritativeDeviceId !== socketDeviceId");
    const commitAckIndex = handlerBody.indexOf("committedCallEndings.add(dedupeKey)");
    assert.ok(ownershipIndex > 0 && ownershipIndex < commitAckIndex, 'Ownership check must precede commit ACK');
  });

  await check('R3: durable token revocation uses token hash and persists across worker restarts', async () => {
    const testJwt = jwt.sign({ sub: 'user_worker_test', username: 'bob', role: 'agent', tenantId: 't1' }, env.JWT_SECRET);
    const dbRows = new Map();
    db.queryOne = async (sql, params) => {
      if (sql.includes('FROM users')) return { id: 'user_worker_test', username: 'bob', role: 'agent', tenantId: 't1', status: 'active' };
      if (sql.includes('FROM tenants')) return { status: 'active' };
      if (sql.includes('FROM revoked_tokens')) {
        return dbRows.has(params[0]) ? { token: params[0] } : null;
      }
      return null;
    };
    db.execute = async (sql, params) => {
      if (sql.includes('INSERT INTO revoked_tokens')) {
        dbRows.set(params[0], { token: params[0], revokedAt: params[1], expiresAt: params[2] });
        return { rowCount: 1 };
      }
      return { rowCount: 0 };
    };

    // Before revocation: valid
    const userBefore = await auth.validateToken(testJwt);
    assert.ok(userBefore && userBefore.id === 'user_worker_test');

    // Revoke token
    await auth.revokeToken(testJwt);
    assert.ok(dbRows.size > 0, 'Token hash must be inserted into revoked_tokens DB table');

    // Clear local in-memory Set to simulate another worker instance or server restart
    if (auth.clearRevocationCacheForTesting) {
      auth.clearRevocationCacheForTesting();
    }
    // validateToken must check DB and reject the revoked token
    const userAfter = await auth.validateToken(testJwt);
    assert.equal(userAfter, null, 'Revoked token must be rejected even when memory cache was cleared');
  });

  await check('R4: schema initialization pins advisory lock to dedicated client and prevents concurrent runs', async () => {
    const poolSource = fs.readFileSync(path.join(root, 'db/pool.ts'), 'utf8');
    assert.ok(poolSource.includes("let dedicatedClient: PoolClient | null = null;"));
    assert.ok(poolSource.includes("await dedicatedClient.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_ID]);"));
    assert.ok(poolSource.includes("await dedicatedClient.query('SET statement_timeout = 60000');"));
    assert.ok(poolSource.includes("await dedicatedClient.query('SET lock_timeout = 30000');"));
    assert.ok(poolSource.includes("await dedicatedClient.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_ID]);"));
    assert.ok(poolSource.includes("dedicatedClient.release();"));
    assert.ok(poolSource.includes("let schemaInitPromise: Promise<void> | null = null;"));
  });

  console.log(`${count} isolated regression groups passed. Real PostgreSQL and handset tests remain required.`);
}
main().catch(err => { console.error(err); process.exitCode = 1; });
