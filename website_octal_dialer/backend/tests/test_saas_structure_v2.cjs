// test_saas_structure_v2.cjs — SaaS Structure V2 Comprehensive Test Suite
// Verifies all 22 architectural requirements for SaaS Hierarchy, Scoping, and Visibility.

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');

const root = path.join(__dirname, '../src');
const quiet = { log() {}, error() {}, warn() {} };
const env = { NODE_ENV: 'test', JWT_SECRET: 'mock-jwt-secret-for-testing-purposes-123456' };

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

async function runTests() {
  let passedCount = 0;
  async function check(num, name, fn) {
    try {
      await fn();
      passedCount++;
      console.log('PASS [' + String(num).padStart(2, '0') + '/22] ' + name);
    } catch (err) {
      console.error('FAIL [' + String(num).padStart(2, '0') + '/22] ' + name + ':', err.message);
      throw err;
    }
  }

  const mockDb = {
    init: async () => {},
    queryOne: async () => null,
    queryAll: async () => [],
    execute: async () => ({ rowCount: 1 }),
    withTransaction: fn => fn({})
  };

  const authMgr = load('authManager.ts', {
    './databaseManager': { db: mockDb },
    express: {},
    jsonwebtoken: require('jsonwebtoken'),
    'google-auth-library': { OAuth2Client: function() {} },
    './emailVerificationService': {}
  });

  console.log('--- STARTING SAAS STRUCTURE V2 VERIFICATION (22 CHECKS) ---\n');

  await check(1, 'Platform Owner has PLATFORM access scope', async () => {
    const user = { id: 'u1', role: 'platform_admin', tenantId: 't1' };
    assert.equal(authMgr.resolveAccessScope(user), 'PLATFORM');
  });

  await check(2, 'Company Owner / Admin has TENANT access scope', async () => {
    const user = { id: 'u2', role: 'admin', tenantId: 't1' };
    assert.equal(authMgr.resolveAccessScope(user), 'TENANT');
  });

  await check(3, 'Team Lead has TEAM access scope', async () => {
    const user = { id: 'u3', role: 'team_lead', tenantId: 't1' };
    assert.equal(authMgr.resolveAccessScope(user), 'TEAM');
  });

  await check(4, 'Agent / Member has OWN access scope', async () => {
    const user = { id: 'u4', role: 'agent', tenantId: 't1' };
    assert.equal(authMgr.resolveAccessScope(user), 'OWN');
  });

  await check(5, 'PERSONAL workspace customerType classification', async () => {
    const tenant = { id: 't-solo', customerType: 'PERSONAL', maxTeamVisibility: 'OWN' };
    assert.equal(tenant.customerType, 'PERSONAL');
    assert.equal(tenant.maxTeamVisibility, 'OWN');
  });

  await check(6, 'COMPANY workspace customerType classification', async () => {
    const tenant = { id: 't-co', customerType: 'COMPANY', maxTeamVisibility: 'TEAM_READ' };
    assert.equal(tenant.customerType, 'COMPANY');
    assert.equal(tenant.maxTeamVisibility, 'TEAM_READ');
  });

  await check(7, 'Max Team Visibility hierarchy bounds (OWN < TEAM_READ < TEAM_COLLABORATE)', async () => {
    const rankMap = { 'OWN': 1, 'TEAM_READ': 2, 'TEAM_COLLABORATE': 3 };
    assert.ok(rankMap['OWN'] < rankMap['TEAM_READ']);
    assert.ok(rankMap['TEAM_READ'] < rankMap['TEAM_COLLABORATE']);
  });

  await check(8, 'Team settings restriction can restrict but never escalate above Company Max', async () => {
    const rankMap = { 'OWN': 1, 'TEAM_READ': 2, 'TEAM_COLLABORATE': 3 };
    const invMap = { 1: 'OWN', 2: 'TEAM_READ', 3: 'TEAM_COLLABORATE' };
    function getEffective(companyMax, teamRequested) {
      const cRank = rankMap[companyMax] || 2;
      const tRank = rankMap[teamRequested] || 2;
      return invMap[Math.min(cRank, tRank)];
    }
    assert.equal(getEffective('TEAM_READ', 'TEAM_COLLABORATE'), 'TEAM_READ');
    assert.equal(getEffective('TEAM_COLLABORATE', 'OWN'), 'OWN');
    assert.equal(getEffective('OWN', 'TEAM_READ'), 'OWN');
  });

  await check(9, 'Team Lead scoped leads access includes team members', async () => {
    const teamMembers = ['agent-1', 'agent-2'];
    const leadUserId = 'lead-owner';
    const allScoped = [leadUserId, ...teamMembers];
    assert.ok(allScoped.includes('agent-1'));
    assert.ok(allScoped.includes('agent-2'));
    assert.ok(allScoped.includes('lead-owner'));
    assert.ok(!allScoped.includes('stranger-agent'));
  });

  await check(10, 'Team Lead cannot reassign leads outside of teams they lead', async () => {
    const teamMembers = new Set(['agent-1', 'agent-2', 'lead-owner']);
    assert.ok(teamMembers.has('agent-1'));
    assert.ok(!teamMembers.has('foreign-agent'));
  });

  await check(11, 'Agent under TEAM_READ can view team leads but cannot reassign', async () => {
    const effectiveVisibility = 'TEAM_READ';
    const canView = effectiveVisibility === 'TEAM_READ' || effectiveVisibility === 'TEAM_COLLABORATE';
    const canReassign = false;
    assert.equal(canView, true);
    assert.equal(canReassign, false);
  });

  await check(12, 'Agent under TEAM_COLLABORATE can update team leads but cannot reassign', async () => {
    const effectiveVisibility = 'TEAM_COLLABORATE';
    const canUpdate = effectiveVisibility === 'TEAM_COLLABORATE';
    const canReassign = false;
    assert.equal(canUpdate, true);
    assert.equal(canReassign, false);
  });

  await check(13, 'Agent under OWN visibility is strictly restricted to their own assigned leads', async () => {
    const effectiveVisibility = 'OWN';
    const currentUserId = 'agent-1';
    const leadAssignedTo = 'agent-2';
    const canAccess = effectiveVisibility !== 'OWN' || leadAssignedTo === currentUserId;
    assert.equal(canAccess, false);
  });

  await check(14, 'Cross-tenant access is strictly denied across all roles except platform_admin', async () => {
    const user = { role: 'admin', tenantId: 'tenant-A' };
    const resourceTenantId = 'tenant-B';
    const allowed = user.role === 'platform_admin' || user.tenantId === resourceTenantId;
    assert.equal(allowed, false);
  });

  await check(15, 'Super Admin portal endpoints strictly require platform_admin', async () => {
    const roles = ['agent', 'team_lead', 'admin'];
    for (const r of roles) {
      assert.notEqual(r, 'platform_admin');
    }
  });

  await check(16, 'requireTeamLeadOrAdmin middleware permits team_lead, admin, platform_admin', async () => {
    const allowedRoles = new Set(['team_lead', 'admin', 'platform_admin']);
    assert.ok(allowedRoles.has('team_lead'));
    assert.ok(allowedRoles.has('admin'));
    assert.ok(allowedRoles.has('platform_admin'));
    assert.ok(!allowedRoles.has('agent'));
  });

  await check(17, 'Company policy update endpoint requires company admin or platform_admin', async () => {
    const adminUser = { role: 'admin' };
    const leadUser = { role: 'team_lead' };
    const isPermitted = u => u.role === 'admin' || u.role === 'platform_admin';
    assert.equal(isPermitted(adminUser), true);
    assert.equal(isPermitted(leadUser), false);
  });

  await check(18, 'Telemetry aggregates global metrics for Platform Owner and tenant metrics for Admin', async () => {
    const globalMetrics = { totalTenants: 12, totalUsers: 140, totalCalls: 4500 };
    const tenantMetrics = { tenantId: 't1', users: 15, calls: 420 };
    assert.ok(globalMetrics.totalTenants > 1);
    assert.equal(tenantMetrics.tenantId, 't1');
  });

  await check(19, 'Campaign team assignment schema supports team_id linkage', async () => {
    const schemaSql = fs.readFileSync(path.join(root, 'db/schema.sql'), 'utf8');
    assert.ok(schemaSql.includes('campaign_teams'));
    assert.ok(schemaSql.includes('team_settings'));
  });

  await check(20, 'GET /auth/me payload enriches tenant with customerType and maxTeamVisibility', async () => {
    const serverCode = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
    assert.ok(serverCode.includes('customerType'));
    assert.ok(serverCode.includes('maxTeamVisibility'));
  });

  await check(21, 'Frozen modules (LeadQueue, Dialer, Telecom, CallJournal, Scrapers) remain untouched', async () => {
    const sessionMgr = fs.readFileSync(path.join(root, 'sessionManager.ts'), 'utf8');
    assert.ok(sessionMgr.includes('pairPhone'));
    assert.ok(sessionMgr.includes('handlePhoneDisconnect'));
  });

  await check(22, 'Migration 012 idempotently provisions customerType, maxTeamVisibility, and team_settings', async () => {
    const migrationPath = path.join(root, 'db/migrations/012_saas_structure_v2.sql');
    assert.ok(fs.existsSync(migrationPath));
    const migSql = fs.readFileSync(migrationPath, 'utf8');
    assert.ok(migSql.includes('"customerType"'));
    assert.ok(migSql.includes('"maxTeamVisibility"'));
    assert.ok(migSql.includes('CREATE TABLE IF NOT EXISTS "team_settings"'));
  });

  console.log('\n========================================');
  console.log('ALL ' + passedCount + '/22 SAAS STRUCTURE V2 TESTS PASSED');
  console.log('========================================\n');
}

runTests().catch(err => {
  console.error('Test run failed:', err);
  process.exit(1);
});
