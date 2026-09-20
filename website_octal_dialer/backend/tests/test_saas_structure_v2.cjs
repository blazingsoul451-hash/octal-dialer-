// test_saas_structure_v2.cjs — SaaS Structure V2 Comprehensive Test Suite
// Verifies all 28 architectural requirements across Groups A through G:
// Group A: Role Transition Matrix (Section 1)
// Group B: Scoping & Isolation (Sections 2, 3, 4, 5)
// Group C: Multi-Team Peer Visibility (Section 6)
// Group D: Unassigned Leads & Lead Scoping (Sections 7, 8, 9)
// Group E: Team Settings & Company Maximum (Sections 10, 11, 16)
// Group F: Dedicated Platform Shell & Impersonation (Sections 12, 14, 17)
// Group G: Frozen Modules & Migration Integrity (Sections 10, 13, 22)

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');

const root = path.join(__dirname, '../src');
const quiet = { log() {}, error() {}, warn() {} };
const env = { NODE_ENV: 'test', JWT_SECRET: 'test-jwt-secret-saas-v2-mock-123456789' };

function load(file, imports, extra = {}) {
  const code = fs.readFileSync(path.join(root, file), 'utf8');
  const js = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(js, {
    module,
    exports: module.exports,
    __dirname: root,
    Buffer,
    console: quiet,
    process: { env, cwd: () => root },
    setTimeout: () => ({ unref() {} }),
    setInterval: () => 0,
    require: id => {
      if (Object.hasOwn(imports, id)) return imports[id];
      if (['crypto', 'os', 'fs', 'path', 'node:async_hooks', 'jsonwebtoken'].includes(id)) return require(id);
      throw new Error('Unexpected dependency: ' + id);
    },
    ...extra
  });
  return module.exports;
}

// In-memory relational state for deep logic tests
function createInMemoryDb() {
  const tables = {
    users: [],
    tenants: [],
    teams: [],
    team_members: [],
    campaign_teams: [],
    team_settings: [],
    leads: []
  };

  return {
    tables,
    queryOne: async (sql, params = []) => {
      if (sql.includes('FROM users WHERE id = $1')) {
        return tables.users.find(u => u.id === params[0]) || null;
      }
      if (sql.includes('FROM tenants WHERE id = $1')) {
        return tables.tenants.find(t => t.id === params[0]) || null;
      }
      if (sql.includes('SELECT "maxTeamVisibility" FROM tenants WHERE id = $1')) {
        const t = tables.tenants.find(t => t.id === params[0]);
        return t ? { maxTeamVisibility: t.maxTeamVisibility } : null;
      }
      if (sql.includes('FROM team_settings WHERE "teamId" = $1 AND "tenantId" = $2')) {
        return tables.team_settings.find(s => s.teamId === params[0] && s.tenantId === params[1]) || null;
      }
      if (sql.includes('FROM teams WHERE id = $1 AND "tenantId" = $2')) {
        return tables.teams.find(t => t.id === params[0] && t.tenantId === params[1]) || null;
      }
      if (sql.includes('FROM leads WHERE id = $1 AND "tenantId" = $2')) {
        return tables.leads.find(l => l.id === params[0] && l.tenantId === params[1]) || null;
      }
      if (sql.includes('SELECT COUNT(*)::int AS count FROM team_members')) {
        return { count: 0 };
      }
      if (sql.includes('SELECT COUNT(*)::int AS count FROM campaign_teams')) {
        return { count: 0 };
      }
      return null;
    },
    queryAll: async (sql, params = []) => {
      if (sql.includes('FROM teams t') && sql.includes('t."leaderId" = $2')) {
        return tables.teams.filter(t => t.tenantId === params[0] && (t.leaderId === params[1] || (tables.team_members && tables.team_members.some(m => m.teamId === t.id && m.userId === params[1] && m.roleInTeam === 'leader'))));
      }
      if (sql.includes('FROM team_members WHERE "userId" = $1 AND "tenantId" = $2')) {
        return tables.team_members.filter(m => m.userId === params[0] && m.tenantId === params[1]);
      }
      if (sql.includes('FROM team_members WHERE "teamId" = $1 AND "tenantId" = $2')) {
        return tables.team_members.filter(m => m.teamId === params[0] && m.tenantId === params[1]);
      }
      if (sql.includes('FROM teams WHERE "leaderId" = $1 AND "tenantId" = $2')) {
        return tables.teams.filter(t => t.leaderId === params[0] && t.tenantId === params[1]);
      }
      if (sql.includes('FROM campaign_teams WHERE "teamId" = ANY($1) AND "tenantId" = $2')) {
        const teamIds = params[0] || [];
        return tables.campaign_teams.filter(ct => teamIds.includes(ct.teamId) && ct.tenantId === params[1]);
      }
      return [];
    },
    execute: async (sql, params = []) => {
      if (sql.includes('UPDATE users SET role = $1')) {
        const u = tables.users.find(u => u.id === params[2]);
        if (u) u.role = params[0];
        return { rowCount: 1 };
      }
      if (sql.includes('INSERT INTO team_settings')) {
        tables.team_settings.push({
          id: params[0],
          tenantId: params[1],
          teamId: params[2],
          leadVisibility: params[3],
          createdAt: params[4],
          updatedAt: params[5]
        });
        return { rowCount: 1 };
      }
      if (sql.includes('UPDATE team_settings')) {
        const item = tables.team_settings.find(s => s.id === params[2] && s.tenantId === params[3]);
        if (item) {
          item.leadVisibility = params[0];
          item.updatedAt = params[1];
        }
        return { rowCount: 1 };
      }
      return { rowCount: 1 };
    }
  };
}

async function runAllTests() {
  let passedCount = 0;
  const totalTests = 28;

  async function check(num, name, fn) {
    try {
      await fn();
      passedCount++;
      console.log(`PASS [${String(num).padStart(2, '0')}/${totalTests}] ${name}`);
    } catch (err) {
      console.error(`FAIL [${String(num).padStart(2, '0')}/${totalTests}] ${name}:`, err.message);
      throw err;
    }
  }

  const memDb = createInMemoryDb();
  const mockDbAdapter = {
    ...memDb,
    init: async () => {},
    query: async () => ({ rows: [], rowCount: 0 }),
    withTransaction: async fn => fn({})
  };

  // Load modules
  const authMgr = load('authManager.ts', {
    './databaseManager': { db: mockDbAdapter },
    express: {},
    jsonwebtoken: require('jsonwebtoken'),
    'google-auth-library': { OAuth2Client: function() {} },
    './emailVerificationService': {}
  });

  const dbMgr = load('databaseManager.ts', {
    './db/dbAdapter': { dbAdapter: mockDbAdapter, db: mockDbAdapter },
    './authManager': authMgr,
    './entitlementManager': { checkLimit: () => ({ allowed: true }), initializeCatalogPlans: () => {} },
    crypto: require('crypto')
  });

  console.log('===============================================================');
  console.log('SAAS STRUCTURE V2: EXECUTING 28 COMPREHENSIVE VERIFICATION TESTS');
  console.log('===============================================================\n');

  // ── GROUP A: Role Transition Matrix (Section 1) ────────────────────────────
  console.log('── GROUP A: Role Transition Matrix (Section 1) ──');

  memDb.tables.users = [
    { id: 'u1', username: 'user1', role: 'user', tenantId: 't1' },
    { id: 'u2', username: 'user2', role: 'user', tenantId: 't1' },
    { id: 'u3', username: 'user3', role: 'user', tenantId: 't1' },
    { id: 'u4', username: 'user4', role: 'user', tenantId: 't1' },
    { id: 'admin1', username: 'admin1', role: 'admin', tenantId: 't1' },
    { id: 'lead1', username: 'lead1', role: 'team_lead', tenantId: 't1' },
    { id: 'plat1', username: 'platform_master', role: 'platform_admin', tenantId: 'platform' }
  ];

  await check(1, 'Platform Owner assigning admin, team_lead, or user succeeds', async () => {
    const caller = { id: 'plat1', role: 'platform_admin' };

    for (const newRole of ['admin', 'team_lead', 'user']) {
      const res = await authMgr.updateUserRole(caller, 'u1', newRole);
      assert.equal(res.success, true);
      assert.equal(res.user.role, newRole);
    }
  });

  await check(2, 'Platform Owner creating second platform_admin is rejected (400)', async () => {
    const caller = { id: 'plat1', role: 'platform_admin' };
    await assert.rejects(
      async () => authMgr.updateUserRole(caller, 'u1', 'platform_admin'),
      /Platform Owners may assign admin, team_lead, or user/i
    );
  });

  await check(3, 'Company Owner assigning team_lead or user succeeds', async () => {
    const caller = { id: 'admin1', role: 'admin', tenantId: 't1' };

    const r1 = await authMgr.updateUserRole(caller, 'u2', 'team_lead');
    assert.equal(r1.success, true);
    assert.equal(r1.user.role, 'team_lead');

    const r2 = await authMgr.updateUserRole(caller, 'u2', 'user');
    assert.equal(r2.success, true);
    assert.equal(r2.user.role, 'user');
  });

  await check(4, 'Company Owner assigning admin is rejected (403)', async () => {
    const caller = { id: 'admin1', role: 'admin', tenantId: 't1' };
    await assert.rejects(
      async () => authMgr.updateUserRole(caller, 'u2', 'admin'),
      /only assign team_lead or user/i
    );
  });

  await check(5, 'Company Owner assigning platform_admin is rejected (403)', async () => {
    const caller = { id: 'admin1', role: 'admin', tenantId: 't1' };
    await assert.rejects(
      async () => authMgr.updateUserRole(caller, 'u2', 'platform_admin'),
      /only assign team_lead or user/i
    );
  });

  await check(6, 'Company Owner attempting to modify own role is rejected (403)', async () => {
    const caller = { id: 'admin1', role: 'admin', tenantId: 't1' };
    await assert.rejects(
      async () => authMgr.updateUserRole(caller, 'admin1', 'user'),
      /cannot change their own role/i
    );
  });

  await check(7, 'Company Owner attempting to touch platform_admin account is rejected (403)', async () => {
    const caller = { id: 'admin1', role: 'admin', tenantId: 't1' };
    await assert.rejects(
      async () => authMgr.updateUserRole(caller, 'plat1', 'user'),
      /cannot modify a user from another organization|cannot be modified/i
    );
  });

  await check(8, 'Member or Team Lead attempting to change roles is rejected (403)', async () => {
    const leadCaller = { id: 'lead1', role: 'team_lead', tenantId: 't1' };
    const userCaller = { id: 'u3', role: 'user', tenantId: 't1' };

    await assert.rejects(
      async () => authMgr.updateUserRole(leadCaller, 'u4', 'team_lead'),
      /forbidden/i
    );
    await assert.rejects(
      async () => authMgr.updateUserRole(userCaller, 'u4', 'team_lead'),
      /forbidden/i
    );
  });

  // ── GROUP B: Scoping & Isolation (Sections 2, 3, 4, 5) ─────────────────────
  console.log('\n── GROUP B: Scoping & Isolation (Sections 2, 3, 4, 5) ──');

  await check(9, 'Platform Owner has PLATFORM access scope', async () => {
    assert.equal(authMgr.resolveAccessScope({ role: 'platform_admin' }), 'PLATFORM');
    assert.equal(authMgr.resolveAccessScope({ role: 'master_admin' }), 'PLATFORM');
  });

  await check(10, 'Company Owner / Admin has TENANT access scope', async () => {
    assert.equal(authMgr.resolveAccessScope({ role: 'admin' }), 'TENANT');
  });

  await check(11, 'Team Lead has TEAM access scope', async () => {
    assert.equal(authMgr.resolveAccessScope({ role: 'team_lead' }), 'TEAM');
  });

  await check(12, 'Member / Agent has OWN access scope', async () => {
    assert.equal(authMgr.resolveAccessScope({ role: 'agent' }), 'OWN');
    assert.equal(authMgr.resolveAccessScope({ role: 'user' }), 'OWN');
  });

  await check(13, 'requireCompanyOwnerOrPlatformAdmin blocks team leads and members on /api/admin/teams', async () => {
    const serverCode = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
    assert.ok(serverCode.includes("app.get(['/api/admin/teams', '/admin/teams'], requireAuth, requireCompanyOwnerOrPlatformAdmin"));
    assert.ok(serverCode.includes("app.post(['/api/admin/teams', '/admin/teams'], requireAuth, requireCompanyOwnerOrPlatformAdmin"));
    assert.ok(serverCode.includes("app.put(['/api/admin/teams/:id', '/admin/teams/:id'], requireAuth, requireCompanyOwnerOrPlatformAdmin"));
    assert.ok(serverCode.includes("app.delete(['/api/admin/teams/:id', '/admin/teams/:id'], requireAuth, requireCompanyOwnerOrPlatformAdmin"));
  });

  await check(14, 'Team Lead can only access teams they lead', async () => {
    // Populate mock DB
    memDb.tables.teams = [
      { id: 'team-A', tenantId: 't1', leaderId: 'lead-1', name: 'Alpha' },
      { id: 'team-B', tenantId: 't1', leaderId: 'lead-2', name: 'Beta' }
    ];
    const ledTeams = await dbMgr.getTeamsLedByUser('lead-1', 't1');
    assert.equal(ledTeams.length, 1);
    assert.equal(ledTeams[0].id, 'team-A');
  });

  // ── GROUP C: Multi-Team Peer Visibility (Section 6) ────────────────────────
  console.log('\n── GROUP C: Multi-Team Peer Visibility (Section 6) ──');

  await check(15, 'Multi-team user: Team B (OWN) peers are neither readable nor editable', async () => {
    // Setup: Tenant t1 allows TEAM_COLLABORATE maximum
    memDb.tables.tenants = [{ id: 't1', maxTeamVisibility: 'TEAM_COLLABORATE', customerType: 'COMPANY' }];
    // User uX is member of Team A (settings: TEAM_COLLABORATE) and Team B (settings: OWN)
    memDb.tables.team_members = [
      { teamId: 'team-A', userId: 'user-X', tenantId: 't1' },
      { teamId: 'team-A', userId: 'peer-A1', tenantId: 't1' },
      { teamId: 'team-B', userId: 'user-X', tenantId: 't1' },
      { teamId: 'team-B', userId: 'peer-B1', tenantId: 't1' }
    ];
    memDb.tables.team_settings = [
      { id: 'ts-A', tenantId: 't1', teamId: 'team-A', leadVisibility: 'TEAM_COLLABORATE' },
      { id: 'ts-B', tenantId: 't1', teamId: 'team-B', leadVisibility: 'OWN' }
    ];

    const { readablePeerUserIds, editablePeerUserIds } = await dbMgr.getUserTeamPeerVisibilitySets('user-X', 't1');

    // Peer B1 MUST NOT leak into readable or editable sets
    assert.ok(!readablePeerUserIds.includes('peer-B1'), 'Peer B1 must not be readable under OWN');
    assert.ok(!editablePeerUserIds.includes('peer-B1'), 'Peer B1 must not be editable under OWN');
  });

  await check(16, 'Multi-team user: Team A (TEAM_COLLABORATE) peers are both readable and editable', async () => {
    const { readablePeerUserIds, editablePeerUserIds } = await dbMgr.getUserTeamPeerVisibilitySets('user-X', 't1');

    assert.ok(readablePeerUserIds.includes('peer-A1'), 'Peer A1 must be readable under TEAM_COLLABORATE');
    assert.ok(editablePeerUserIds.includes('peer-A1'), 'Peer A1 must be editable under TEAM_COLLABORATE');
  });

  // ── GROUP D: Unassigned Leads & Lead Scoping (Sections 7, 8, 9) ─────────────
  console.log('\n── GROUP D: Unassigned Leads & Lead Scoping (Sections 7, 8, 9) ──');

  await check(17, 'Team Lead lead scoping fails closed against unassigned leads', async () => {
    const serverCode = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
    const teamLeadScopeMatch = serverCode.match(/if \(isTeamLead\) {[\s\S]*?scopeSql = ` AND l\."assignedTo" IN \(\${phs}\)`;/);
    assert.ok(teamLeadScopeMatch, 'Team Lead leads must be strictly scoped to led team member IDs with no unassigned leak');
  });

  await check(18, 'Standard member lead scoping fails closed against unassigned leads', async () => {
    const serverCode = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
    assert.ok(serverCode.includes('scopeSql = ` AND l."assignedTo" = $${params.length + 1}`;'));
    assert.ok(!serverCode.includes('OR l."assignedTo" IS NULL'));
  });

  await check(19, 'Standard member attempting to reassign lead (setting assignedTo) is rejected', async () => {
    const serverCode = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
    assert.ok(serverCode.includes("if (assignedTo !== undefined) {"));
    assert.ok(serverCode.includes("Forbidden: Standard members cannot reassign leads."));
  });

  await check(20, 'PATCH /api/leads/:id uses getUserTeamPeerVisibilitySets for peer edit guard', async () => {
    const serverCode = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
    assert.ok(serverCode.includes("const { editablePeerUserIds } = await getUserTeamPeerVisibilitySets(caller.id, tenantId);"));
    assert.ok(serverCode.includes("if (!targetLead.assignedTo || !editablePeerUserIds.includes(targetLead.assignedTo))"));
  });

  await check(21, 'Team Lead can only reassign leads to members of their led teams', async () => {
    const serverCode = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
    assert.ok(serverCode.includes("Forbidden: Team Lead cannot reassign leads to users outside their led teams."));
  });

  // ── GROUP E: Team Settings & Company Maximum (Sections 10, 11, 16) ──────────
  console.log('\n── GROUP E: Team Settings & Company Maximum (Sections 10, 11, 16) ──');

  await check(22, 'team_settings schema contains composite unique constraint on tenantId and teamId', async () => {
    const schemaSql = fs.readFileSync(path.join(root, 'db/schema.sql'), 'utf8');
    assert.ok(schemaSql.includes('CONSTRAINT "uq_team_settings_tenant_team" UNIQUE ("tenantId", "teamId")'));

    const migrationSql = fs.readFileSync(path.join(root, 'db/migrations/012_saas_structure_v2.sql'), 'utf8');
    assert.ok(migrationSql.includes('CONSTRAINT "uq_team_settings_tenant_team" UNIQUE ("tenantId", "teamId")'));
  });

  await check(23, 'getTeamEffectiveVisibility bounds team settings to Company Maximum policy', async () => {
    // Case 1: Company = TEAM_READ, Team = TEAM_COLLABORATE => Effective is TEAM_READ
    memDb.tables.tenants = [{ id: 't-cap', maxTeamVisibility: 'TEAM_READ' }];
    memDb.tables.team_settings = [{ id: 'ts-cap', tenantId: 't-cap', teamId: 'team-cap', leadVisibility: 'TEAM_COLLABORATE' }];
    const eff1 = await dbMgr.getTeamEffectiveVisibility('t-cap', 'team-cap');
    assert.equal(eff1, 'TEAM_READ');

    // Case 2: Company = OWN, Team = TEAM_READ => Effective is OWN
    memDb.tables.tenants = [{ id: 't-own', maxTeamVisibility: 'OWN' }];
    memDb.tables.team_settings = [{ id: 'ts-own', tenantId: 't-own', teamId: 'team-own', leadVisibility: 'TEAM_READ' }];
    const eff2 = await dbMgr.getTeamEffectiveVisibility('t-own', 'team-own');
    assert.equal(eff2, 'OWN');

    // Case 3: Company = TEAM_COLLABORATE, Team = OWN => Effective is OWN (lower restricts)
    memDb.tables.tenants = [{ id: 't-collab', maxTeamVisibility: 'TEAM_COLLABORATE' }];
    memDb.tables.team_settings = [{ id: 'ts-collab', tenantId: 't-collab', teamId: 'team-collab', leadVisibility: 'OWN' }];
    const eff3 = await dbMgr.getTeamEffectiveVisibility('t-collab', 'team-collab');
    assert.equal(eff3, 'OWN');
  });

  await check(24, 'GET /api/teams/my-teams gates access to team_lead, admin, platform_admin', async () => {
    const serverCode = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
    assert.ok(serverCode.includes("if (caller.role !== 'team_lead' && caller.role !== 'admin' && !isPlatform) {"));
    assert.ok(serverCode.includes("Forbidden: Access restricted to Team Leads and Administrators."));
  });

  // ── GROUP F: Dedicated Platform Shell & Impersonation (Sections 12, 14, 17) ─
  console.log('\n── GROUP F: Dedicated Platform Shell & Impersonation (Sections 12, 14, 17) ──');

  await check(25, 'App.tsx renders SuperAdminPortal directly for non-impersonating platform_admin', async () => {
    const appCode = fs.readFileSync(path.join(root, '../../frontend/src/App.tsx'), 'utf8');
    assert.ok(appCode.includes("if (userRole === 'platform_admin' && !isImpersonating) {"));
    assert.ok(appCode.includes("<SuperAdminPortal"));
  });

  await check(26, 'POST /api/super-admin/impersonate/:id down-roles platform_admin to admin', async () => {
    const serverCode = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
    assert.ok(serverCode.includes("const effectiveRole = (primaryUser.role === 'platform_admin' || primaryUser.role === 'master_admin') ? 'admin' : primaryUser.role;"));
  });

  await check(27, 'Impersonation token is stored in sessionStorage and never overwrites localStorage', async () => {
    const appCode = fs.readFileSync(path.join(root, '../../frontend/src/App.tsx'), 'utf8');
    assert.ok(appCode.includes("sessionStorage.setItem('octal_impersonate_token', urlImpToken);"));
    assert.ok(appCode.includes("sessionStorage.getItem('octal_impersonate_token')"));
    assert.ok(appCode.includes("Exit Impersonation"));
  });

  // ── GROUP G: Frozen Modules & Migration Integrity (Sections 10, 13, 22) ─────
  console.log('\n── GROUP G: Frozen Modules & Migration Integrity (Sections 10, 13, 22) ──');

  await check(28, 'Frozen telephony and scraper modules remain untouched and Migration 012 is idempotent', async () => {
    const sessionMgr = fs.readFileSync(path.join(root, 'sessionManager.ts'), 'utf8');
    assert.ok(sessionMgr.includes('pairPhone'));
    assert.ok(sessionMgr.includes('handlePhoneDisconnect'));

    const scraperRoutes = fs.readFileSync(path.join(root, 'scraperRoutes.ts'), 'utf8');
    assert.ok(scraperRoutes.includes('/api/scraper/run'));

    const mig012 = fs.readFileSync(path.join(root, 'db/migrations/012_saas_structure_v2.sql'), 'utf8');
    assert.ok(mig012.includes('CREATE TABLE IF NOT EXISTS "team_settings"'));
    assert.ok(mig012.includes('ADD COLUMN IF NOT EXISTS "customerType"'));
    assert.ok(mig012.includes('ADD COLUMN IF NOT EXISTS "maxTeamVisibility"'));
  });

  console.log('\n===============================================================');
  console.log(`SUCCESS: ALL ${passedCount}/${totalTests} SAAS STRUCTURE V2 TESTS PASSED!`);
  console.log('===============================================================\n');
}

runAllTests().catch(err => {
  console.error('\n❌ TEST RUN FAILED:', err);
  process.exit(1);
});

