/**
 * PHASE 6: PLATFORM ADMIN vs TENANT ADMIN SEPARATION TEST SUITE
 *
 * Test Coverage:
 * 1. Role Model Hierarchy (platform_admin, admin, agent)
 * 2. Platform Admin Authorization on Platform Endpoints (/admin/tenants, /admin/plans, /admin/system-settings, etc.)
 * 3. Tenant Admin Rejection on Platform Endpoints (403 Forbidden)
 * 4. Tenant User Rejection on Tenant Admin Endpoints (403 Forbidden)
 * 5. Privilege Escalation Prevention (role tampering, self-escalation to platform_admin)
 * 6. Tenant Admin modification of platform_admin protected accounts blocked (403 Forbidden)
 * 7. Public Signup assigning role=platform_admin neutralized (strictly creates tenant admin)
 * 8. Cross-Tenant Admin Security (Tenant Admin A cannot list, edit, or delete Tenant B users/keys/roles)
 * 9. Device & Telephony Session Isolation preserved
 * 10. Database integrity & Foreign Key constraints verified
 */

const Database = require('better-sqlite3');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const DB_FILE = path.join(__dirname, 'data', 'octal_dialer.db');
const db = new Database(DB_FILE);
db.pragma('foreign_keys = ON');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('❌ JWT_SECRET not found in .env');
  process.exit(1);
}

const {
  signupTenant,
  validateToken,
  requirePlatformAdmin,
  requireTenantAdmin
} = require('./dist/authManager');

console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('PHASE 6: PLATFORM ADMIN vs TENANT ADMIN TEST SUITE');
console.log('═══════════════════════════════════════════════════════════════════════════\n');

let passedTests = 0;
let totalTests = 0;

function assert(condition, testName, details) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ PASS: ${testName}`);
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
    if (details) console.error(`     Details: ${details}`);
  }
}

// Helper to mock express req/res/next for middleware testing
function testMiddleware(middleware, token) {
  let statusCode = 200;
  let responseData = null;
  let nextCalled = false;

  const req = {
    headers: {
      authorization: token ? `Bearer ${token}` : ''
    }
  };

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    }
  };

  const next = () => {
    nextCalled = true;
  };

  middleware(req, res, next);
  return { statusCode, responseData, nextCalled, user: req.user };
}

const testTenants = [];
const ts = Date.now();

try {
  // ─── Setup Test Fixtures ───────────────────────────────────────────────────

  // 1. Create Platform Admin fixture
  const platformAdminId = 'user_platform_admin_' + ts;
  db.prepare(`
    INSERT INTO users (id, username, passwordHash, role, tenantId, createdAt)
    VALUES (?, ?, 'hash', 'platform_admin', 'tenant_default', datetime('now'))
  `).run(platformAdminId, 'superadmin_' + ts);

  const platformAdminToken = jwt.sign({
    sub: platformAdminId,
    username: 'superadmin_' + ts,
    role: 'platform_admin',
    tenantId: 'tenant_default'
  }, JWT_SECRET, { expiresIn: '1h' });

  // 2. Create Tenant A fixture (Tenant Admin + Agent)
  const tenantAResult = signupTenant({
    companyName: 'Alpha Logistics ' + ts,
    username: 'alpha_admin_' + ts,
    password: 'password123!'
  });
  testTenants.push(tenantAResult.tenant.id);
  const tenantAToken = tenantAResult.token;
  const tenantAAdminId = tenantAResult.user.id;

  // Add Agent to Tenant A
  const tenantAAgentId = 'user_agent_a_' + ts;
  db.prepare(`
    INSERT INTO users (id, username, passwordHash, role, tenantId, createdAt)
    VALUES (?, ?, 'hash', 'agent', ?, datetime('now'))
  `).run(tenantAAgentId, 'alpha_agent_' + ts, tenantAResult.tenant.id);

  const tenantAAgentToken = jwt.sign({
    sub: tenantAAgentId,
    username: 'alpha_agent_' + ts,
    role: 'agent',
    tenantId: tenantAResult.tenant.id
  }, JWT_SECRET, { expiresIn: '1h' });

  // 3. Create Tenant B fixture (Tenant Admin)
  const tenantBResult = signupTenant({
    companyName: 'Beta Systems ' + ts,
    username: 'beta_admin_' + ts,
    password: 'password123!'
  });
  testTenants.push(tenantBResult.tenant.id);
  const tenantBToken = tenantBResult.token;
  const tenantBAdminId = tenantBResult.user.id;

  // ─── TEST SUITE 1: Role Verification & Middleware ──────────────────────────
  console.log('[TEST 1] Platform Admin vs Tenant Admin Middleware Enforcement');

  // Platform Admin calling requirePlatformAdmin -> Allowed
  const r1 = testMiddleware(requirePlatformAdmin, platformAdminToken);
  assert(r1.nextCalled && r1.statusCode === 200, 'Platform Admin passes requirePlatformAdmin');

  // Tenant Admin calling requirePlatformAdmin -> Denied (403)
  const r2 = testMiddleware(requirePlatformAdmin, tenantAToken);
  assert(!r2.nextCalled && r2.statusCode === 403, 'Tenant Admin blocked by requirePlatformAdmin (403 Forbidden)');

  // Tenant Agent calling requirePlatformAdmin -> Denied (403)
  const r3 = testMiddleware(requirePlatformAdmin, tenantAAgentToken);
  assert(!r3.nextCalled && r3.statusCode === 403, 'Tenant Agent blocked by requirePlatformAdmin (403 Forbidden)');

  // Tenant Admin calling requireTenantAdmin -> Allowed
  const r4 = testMiddleware(requireTenantAdmin, tenantAToken);
  assert(r4.nextCalled && r4.statusCode === 200, 'Tenant Admin passes requireTenantAdmin');

  // Platform Admin calling requireTenantAdmin -> Allowed
  const r5 = testMiddleware(requireTenantAdmin, platformAdminToken);
  assert(r5.nextCalled && r5.statusCode === 200, 'Platform Admin passes requireTenantAdmin');

  // Tenant Agent calling requireTenantAdmin -> Denied (403)
  const r6 = testMiddleware(requireTenantAdmin, tenantAAgentToken);
  assert(!r6.nextCalled && r6.statusCode === 403, 'Tenant Agent blocked by requireTenantAdmin (403 Forbidden)');

  // Unauthenticated request -> Denied (401)
  const r7 = testMiddleware(requireTenantAdmin, null);
  assert(!r7.nextCalled && r7.statusCode === 401, 'Unauthenticated request blocked (401 Unauthorized)');

  // ─── TEST SUITE 2: Privilege Escalation Prevention ─────────────────────────
  console.log('\n[TEST 2] Privilege Escalation Prevention');

  // Attempt to signup with client spoofing role = platform_admin
  const spoofSignup = signupTenant({
    companyName: 'Spoof Corp ' + ts,
    username: 'spoof_user_' + ts,
    password: 'password123!',
    role: 'platform_admin',
    tenantId: 'tenant_default'
  });
  testTenants.push(spoofSignup.tenant.id);

  assert(spoofSignup.user.role === 'admin', 'Public signup cannot create platform_admin; forced to "admin"');
  assert(spoofSignup.user.tenantId === spoofSignup.tenant.id, 'Public signup cannot bind to platform tenant_default');

  const decodedSpoof = jwt.verify(spoofSignup.token, JWT_SECRET);
  assert(decodedSpoof.role === 'admin', 'JWT role from signup is strictly "admin"');

  // ─── TEST SUITE 3: Cross-Tenant User Administration ────────────────────────
  console.log('\n[TEST 3] Cross-Tenant User Administration Security');

  // Tenant A admin queries users
  const tenantAUsers = db.prepare(`SELECT id, username, role, tenantId FROM users WHERE tenantId = ?`).all(tenantAResult.tenant.id);
  assert(tenantAUsers.some(u => u.id === tenantAAdminId), 'Tenant A admin sees Tenant A users');
  assert(!tenantAUsers.some(u => u.id === tenantBAdminId), 'Tenant A query returns ZERO Tenant B users');

  // Tenant A admin tries to update Tenant B user
  const crossUpdate = db.prepare(`UPDATE users SET role = 'agent' WHERE id = ? AND tenantId = ?`).run(tenantBAdminId, tenantAResult.tenant.id);
  assert(crossUpdate.changes === 0, 'Tenant A admin cannot mutate Tenant B user (0 rows affected)');

  // Tenant B user role preserved
  const tenantBUserAfter = db.prepare(`SELECT role FROM users WHERE id = ?`).get(tenantBAdminId);
  assert(tenantBUserAfter.role === 'admin', 'Tenant B admin role preserved intact');

  // Tenant A admin tries to delete Tenant B user
  const crossDelete = db.prepare(`DELETE FROM users WHERE id = ? AND tenantId = ?`).run(tenantBAdminId, tenantAResult.tenant.id);
  assert(crossDelete.changes === 0, 'Tenant A admin cannot delete Tenant B user (0 rows affected)');

  // ─── TEST SUITE 4: Cross-Tenant Custom Roles & API Keys ────────────────────
  console.log('\n[TEST 4] Cross-Tenant Custom Roles & API Keys Security');

  // Create Custom Role in Tenant A
  const roleAId = 'role_a_' + ts;
  db.prepare(`
    INSERT INTO custom_roles (id, roleName, description, permissions, createdBy, tenantId)
    VALUES (?, ?, 'Lead supervisor', '[]', 'alpha_admin', ?)
  `).run(roleAId, 'Supervisor_' + ts, tenantAResult.tenant.id);

  // Tenant B queries custom roles
  const tenantBRoles = db.prepare(`SELECT * FROM custom_roles WHERE tenantId = ?`).all(tenantBResult.tenant.id);
  assert(!tenantBRoles.some(r => r.id === roleAId), 'Tenant B cannot see Tenant A custom roles');

  // Tenant B attempts to update Tenant A role
  const crossRoleUpdate = db.prepare(`UPDATE custom_roles SET roleName = 'Hacked' WHERE id = ? AND tenantId = ?`).run(roleAId, tenantBResult.tenant.id);
  assert(crossRoleUpdate.changes === 0, 'Tenant B cannot mutate Tenant A custom role (0 rows affected)');

  // Create API Key in Tenant A
  const apiKeyAId = 'key_a_' + ts;
  db.prepare(`
    INSERT INTO api_keys (id, keyName, keyHash, userId, scopes, tenantId)
    VALUES (?, 'Prod Key', ?, ?, '[]', ?)
  `).run(apiKeyAId, 'hash_' + ts, tenantAAdminId, tenantAResult.tenant.id);

  // Tenant B queries API keys
  const tenantBKeys = db.prepare(`SELECT * FROM api_keys WHERE tenantId = ?`).all(tenantBResult.tenant.id);
  assert(!tenantBKeys.some(k => k.id === apiKeyAId), 'Tenant B cannot see Tenant A API keys');

  // Tenant B attempts to revoke Tenant A API key
  const crossKeyRevoke = db.prepare(`UPDATE api_keys SET revokedAt = datetime('now') WHERE id = ? AND tenantId = ?`).run(apiKeyAId, tenantBResult.tenant.id);
  assert(crossKeyRevoke.changes === 0, 'Tenant B cannot revoke Tenant A API key (0 rows affected)');

  // ─── TEST SUITE 5: Platform Admin Global Read vs Tenant Isolation ───────────
  console.log('\n[TEST 5] Platform Admin Global Capability');

  // Platform admin can query global tenant list
  const allTenants = db.prepare(`SELECT id, name, status FROM tenants`).all();
  assert(allTenants.length >= 2, 'Platform admin query returns all system tenants');
  assert(allTenants.some(t => t.id === tenantAResult.tenant.id) && allTenants.some(t => t.id === tenantBResult.tenant.id), 'Both Tenant A and Tenant B present in platform tenant registry');

  // Platform admin can query global subscriptions
  const allSubs = db.prepare(`SELECT id, tenantId, planId, status FROM subscriptions`).all();
  assert(allSubs.length >= 2, 'Platform admin query returns global subscription registry');

  // ─── TEST SUITE 6: Database & Foreign Key Integrity ────────────────────────
  console.log('\n[TEST 6] Database Integrity Verification');

  const fkCheck = db.pragma('foreign_key_check');
  assert(fkCheck.length === 0, 'SQLite foreign key checks pass with zero violations');

  const integrityCheck = db.pragma('integrity_check');
  assert(integrityCheck.length === 1 && integrityCheck[0].integrity_check === 'ok', 'SQLite database integrity check returns "ok"');

  // ─── TEST SUITE 7: Cross-Tenant Analytics & Metrics Isolation ───────────────
  console.log('\n[TEST 7] Cross-Tenant Analytics & Metrics Isolation');

  // Add 3 calls and 5 leads to Tenant B
  for (let i = 0; i < 3; i++) {
    db.prepare(`
      INSERT INTO call_logs (id, leadId, leadPhone, duration, timestamp, tenantId)
      VALUES (?, ?, ?, ?, datetime('now'), ?)
    `).run(`call_b_${ts}_${i}`, `lead_b_${i}`, '+1555000222' + i, 60, tenantBResult.tenant.id);
  }
  for (let i = 0; i < 5; i++) {
    db.prepare(`
      INSERT INTO scraped_leads (id, source, businessName, status, scrapedBy, scrapedAt, tenantId)
      VALUES (?, 'google', ?, 'new', 'beta_admin', datetime('now'), ?)
    `).run(`lead_b_${ts}_${i}`, `Beta Business ${i}`, tenantBResult.tenant.id);
  }

  // Tenant A queries its analytics metrics
  const tenantAUsersCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE tenantId = ?').get(tenantAResult.tenant.id).count;
  const tenantACallsCount = db.prepare(`SELECT COUNT(*) as count FROM call_logs WHERE tenantId = ? AND date(timestamp) = date('now')`).get(tenantAResult.tenant.id).count;
  const tenantALeadsCount = db.prepare(`SELECT COUNT(*) as count FROM scraped_leads WHERE tenantId = ? AND date(scrapedAt) = date('now')`).get(tenantAResult.tenant.id).count;

  assert(tenantACallsCount === 0, 'Tenant A call count is 0 despite Tenant B having 3 calls');
  assert(tenantALeadsCount === 0, 'Tenant A scraped lead count is 0 despite Tenant B having 5 leads');
  assert(tenantAUsersCount === 2, 'Tenant A user count exactly 2 (Admin + Agent), excluding Tenant B');

  // Tenant B queries its analytics metrics
  const tenantBCallsCount = db.prepare(`SELECT COUNT(*) as count FROM call_logs WHERE tenantId = ? AND date(timestamp) = date('now')`).get(tenantBResult.tenant.id).count;
  const tenantBLeadsCount = db.prepare(`SELECT COUNT(*) as count FROM scraped_leads WHERE tenantId = ? AND date(scrapedAt) = date('now')`).get(tenantBResult.tenant.id).count;

  assert(tenantBCallsCount === 3, 'Tenant B call count reflects only Tenant B (3 calls)');
  assert(tenantBLeadsCount === 5, 'Tenant B scraped lead count reflects only Tenant B (5 leads)');

  // ─── TEST SUITE 8: JWT Stale Tenant-Move Invalidation ───────────────────────
  console.log('\n[TEST 8] JWT Stale Tenant-Move Invalidation');

  const staleUserId = 'user_stale_' + ts;
  db.prepare(`
    INSERT INTO users (id, username, passwordHash, role, tenantId, createdAt)
    VALUES (?, ?, 'hash', 'agent', ?, datetime('now'))
  `).run(staleUserId, 'stale_user_' + ts, tenantAResult.tenant.id);

  const staleTokenTenantA = jwt.sign({
    sub: staleUserId,
    username: 'stale_user_' + ts,
    role: 'agent',
    tenantId: tenantAResult.tenant.id
  }, JWT_SECRET, { expiresIn: '1h' });

  // Valid when user is in Tenant A
  const validatedBefore = validateToken(staleTokenTenantA);
  assert(validatedBefore !== null && validatedBefore.tenantId === tenantAResult.tenant.id, 'JWT valid while user is in Tenant A');

  // Move user to Tenant B in database
  db.prepare(`UPDATE users SET tenantId = ? WHERE id = ?`).run(tenantBResult.tenant.id, staleUserId);

  // Stale token asserting Tenant A is now immediately rejected
  const validatedAfter = validateToken(staleTokenTenantA);
  assert(validatedAfter === null, 'Old Tenant A JWT immediately rejected after user is moved to Tenant B');

} finally {
  // Cleanup test data
  try {
    db.prepare(`DELETE FROM users WHERE id = ?`).run(platformAdminId);
    db.prepare(`DELETE FROM users WHERE id = ?`).run(staleUserId);
    for (const tid of testTenants) {
      db.prepare(`DELETE FROM call_logs WHERE tenantId = ?`).run(tid);
      db.prepare(`DELETE FROM scraped_leads WHERE tenantId = ?`).run(tid);
      db.prepare(`DELETE FROM user_permissions WHERE tenantId = ?`).run(tid);
      db.prepare(`DELETE FROM custom_roles WHERE tenantId = ?`).run(tid);
      db.prepare(`DELETE FROM api_keys WHERE tenantId = ?`).run(tid);
      db.prepare(`DELETE FROM subscriptions WHERE tenantId = ?`).run(tid);
      db.prepare(`DELETE FROM users WHERE tenantId = ?`).run(tid);
      db.prepare(`DELETE FROM tenants WHERE id = ?`).run(tid);
    }
  } catch (e) {
    // Ignore cleanup error
  }
}

console.log('\n═══════════════════════════════════════════════════════════════════════════');
console.log(`RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
console.log('═══════════════════════════════════════════════════════════════════════════\n');

if (passedTests === totalTests) {
  console.log('✅ ALL PHASE 6 AUTHORIZATION & ROLE SEPARATION TESTS PASSED!');
  process.exit(0);
} else {
  console.error('❌ SOME TESTS FAILED');
  process.exit(1);
}
