/**
 * Phase 5 Code Review - Manual Signup Verification Test
 * Tests the actual signup implementation
 */

const Database = require('better-sqlite3');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config();

const DB_FILE = path.join(__dirname, 'data', 'octal_dialer.db');
const db = new Database(DB_FILE);
db.pragma('foreign_keys = ON');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('❌ JWT_SECRET not found in .env');
  process.exit(1);
}

// Import the signupTenant function
const { signupTenant } = require('./dist/authManager');

console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('PHASE 5 CODE REVIEW: SIGNUP VERIFICATION TEST');
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

try {
  // Test 1: Basic signup
  console.log('\n[TEST 1] Basic Signup Flow\n');

  const testCompany = 'Test Corp ' + Date.now();
  const testUser = 'testadmin' + Date.now();

  let signupResult;
  try {
    signupResult = signupTenant({
      companyName: testCompany,
      username: testUser,
      password: 'password123'
    });
    assert(true, 'signupTenant() executed without throwing');
  } catch (err) {
    assert(false, 'signupTenant() executed without throwing', err.message);
    throw err;
  }

  // Test 2: Verify return structure
  assert(signupResult && typeof signupResult === 'object', 'signupTenant() returns an object');
  assert(signupResult.token && typeof signupResult.token === 'string', 'Return includes JWT token');
  assert(signupResult.user && typeof signupResult.user === 'object', 'Return includes user object');
  assert(signupResult.tenant && typeof signupResult.tenant === 'object', 'Return includes tenant object');

  // Test 3: Verify JWT structure
  console.log('\n[TEST 2] JWT Token Verification\n');

  let decoded;
  try {
    decoded = jwt.verify(signupResult.token, JWT_SECRET);
    assert(true, 'JWT signature is valid');
  } catch (err) {
    assert(false, 'JWT signature is valid', err.message);
    throw err;
  }

  assert(decoded.sub && decoded.sub.startsWith('user_admin_'), 'JWT contains valid user ID in sub claim');
  assert(decoded.username === testUser, 'JWT username matches input');
  assert(decoded.role === 'admin', 'JWT role is "admin"');
  assert(decoded.tenantId && decoded.tenantId.startsWith('tenant_'), 'JWT contains valid tenantId');
  assert(decoded.tenantId === signupResult.user.tenantId, 'JWT tenantId matches user.tenantId');

  // Test 4: Verify database records
  console.log('\n[TEST 3] Database Record Verification\n');

  const tenantId = signupResult.tenant.id;
  const userId = signupResult.user.id;

  const dbTenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId);
  assert(dbTenant !== undefined, 'Tenant record exists in database');
  assert(dbTenant && dbTenant.name === testCompany, 'Tenant name matches input');
  assert(dbTenant && dbTenant.slug && dbTenant.slug.length > 0, 'Tenant slug generated');
  assert(dbTenant && dbTenant.status === 'active', 'Tenant status is "active"');

  const dbUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  assert(dbUser !== undefined, 'User record exists in database');
  assert(dbUser && dbUser.username === testUser, 'User username matches input');
  assert(dbUser && dbUser.role === 'admin', 'User role is "admin"');
  assert(dbUser && dbUser.tenantId === tenantId, 'User tenantId matches tenant ID');
  assert(dbUser && dbUser.passwordHash && dbUser.passwordHash.length > 0, 'User has password hash');

  // Test 5: Verify subscription
  console.log('\n[TEST 4] Subscription Verification\n');

  const dbSub = db.prepare('SELECT * FROM subscriptions WHERE tenantId = ?').get(tenantId);
  assert(dbSub !== undefined, 'Subscription record exists');
  assert(dbSub && dbSub.status === 'active', 'Subscription status is "active"');
  assert(dbSub && dbSub.planId && dbSub.planId.length > 0, 'Subscription has planId');
  assert(dbSub && dbSub.currentPeriodStart, 'Subscription has currentPeriodStart');
  assert(dbSub && dbSub.currentPeriodEnd, 'Subscription has currentPeriodEnd');

  // Test 6: Verify permissions
  console.log('\n[TEST 5] Permission Verification\n');

  const dbPerms = db.prepare('SELECT * FROM user_permissions WHERE userId = ? AND tenantId = ?').all(userId, tenantId);
  assert(dbPerms.length === 5, 'User has 5 module permissions', `Found ${dbPerms.length}`);
  const modules = ['octalDialer', 'googleScraper', 'autoEmailer', 'facebookScraper', 'facebookPoster'];
  for (const mod of modules) {
    const hasMod = dbPerms.some(p => p.moduleId === mod && p.enabled === 1);
    assert(hasMod, `User has ${mod} permission enabled`);
  }

  // Test 7: Security - Client cannot control tenantId
  console.log('\n[TEST 6] Security - Client Control Prevention\n');

  try {
    const maliciousInput = {
      companyName: 'Malicious Corp',
      username: 'attacker' + Date.now(),
      password: 'password123',
      tenantId: 'tenant_default', // Attacker tries to join default tenant
      role: 'super_admin' // Attacker tries to become super admin
    };

    const result2 = signupTenant(maliciousInput);

    // Verify the attacker got their OWN tenant, not tenant_default
    assert(result2.tenant.id !== 'tenant_default', 'Client-supplied tenantId is ignored');
    assert(result2.user.tenantId !== 'tenant_default', 'User not assigned to attacker-specified tenant');
    assert(result2.user.role === 'admin', 'Client-supplied role ignored, assigned "admin"');

    // Cleanup malicious tenant
    db.prepare('DELETE FROM user_permissions WHERE tenantId = ?').run(result2.tenant.id);
    db.prepare('DELETE FROM subscriptions WHERE tenantId = ?').run(result2.tenant.id);
    db.prepare('DELETE FROM users WHERE tenantId = ?').run(result2.tenant.id);
    db.prepare('DELETE FROM tenants WHERE id = ?').run(result2.tenant.id);
  } catch (err) {
    assert(false, 'Security test completed', err.message);
  }

  // Test 8: Duplicate username rejection
  console.log('\n[TEST 7] Duplicate Username Rejection\n');

  try {
    signupTenant({
      companyName: 'Another Corp',
      username: testUser, // Same username as Test 1
      password: 'password456'
    });
    assert(false, 'Duplicate username rejected');
  } catch (err) {
    assert(err.message && err.message.includes('already taken'), 'Duplicate username rejected with proper error');
  }

  // Test 9: Atomic rollback - check no orphan tenant created
  const orphanCheck = db.prepare('SELECT COUNT(*) as count FROM tenants WHERE name = ?').get('Another Corp');
  assert(orphanCheck.count === 0, 'No orphan tenant created on username conflict');

  // Test 10: Input validation
  console.log('\n[TEST 8] Input Validation\n');

  try {
    signupTenant({ companyName: 'X', username: 'test', password: 'pass' });
    assert(false, 'Short company name rejected');
  } catch (err) {
    assert(err.message && err.message.includes('at least 2 characters'), 'Short company name rejected');
  }

  try {
    signupTenant({ companyName: 'Valid Corp', username: 'ab', password: 'password' });
    assert(false, 'Short username rejected');
  } catch (err) {
    assert(err.message && err.message.includes('at least 3 characters'), 'Short username rejected');
  }

  try {
    signupTenant({ companyName: 'Valid Corp', username: 'validuser', password: '12345' });
    assert(false, 'Short password rejected');
  } catch (err) {
    assert(err.message && err.message.includes('at least 6 characters'), 'Short password rejected');
  }

  // Test 11: Tenant isolation after signup
  console.log('\n[TEST 9] Tenant Isolation After Signup\n');

  // Create a second tenant
  const testCompany2 = 'Second Corp ' + Date.now();
  const testUser2 = 'secondadmin' + Date.now();
  const result2 = signupTenant({
    companyName: testCompany2,
    username: testUser2,
    password: 'password789'
  });

  // Verify Tenant 1 cannot see Tenant 2's leads
  const tenant1Id = tenantId;
  const tenant2Id = result2.tenant.id;

  // Create test lead for Tenant 2
  const campId = 'camp_test_' + Date.now();
  db.prepare("INSERT INTO campaigns (id, name, fileName, leadCount, tenantId, createdAt) VALUES (?, ?, ?, ?, ?, datetime('now'))").run(
    campId,
    'Test Campaign',
    'test.csv',
    1,
    tenant2Id
  );
  const leadId = 'lead_test_' + Date.now();
  db.prepare("INSERT INTO leads (id, campaignId, name, phone, status, tenantId, createdAt) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))").run(
    leadId,
    campId,
    'Test Lead',
    '+15551234567',
    'PENDING',
    tenant2Id
  );

  // Try to query Tenant 2's lead using Tenant 1's context
  const crossTenantQuery = db.prepare('SELECT * FROM leads WHERE id = ? AND tenantId = ?').get(leadId, tenant1Id);
  assert(crossTenantQuery === undefined, 'Tenant 1 cannot access Tenant 2 lead with tenant-scoped query');

  // Cleanup test tenants
  console.log('\n[CLEANUP] Removing test data\n');
  db.prepare('DELETE FROM leads WHERE tenantId IN (?, ?)').run(tenant1Id, tenant2Id);
  db.prepare('DELETE FROM campaigns WHERE tenantId IN (?, ?)').run(tenant1Id, tenant2Id);
  db.prepare('DELETE FROM user_permissions WHERE tenantId IN (?, ?)').run(tenant1Id, tenant2Id);
  db.prepare('DELETE FROM subscriptions WHERE tenantId IN (?, ?)').run(tenant1Id, tenant2Id);
  db.prepare('DELETE FROM users WHERE tenantId IN (?, ?)').run(tenant1Id, tenant2Id);
  db.prepare('DELETE FROM tenants WHERE id IN (?, ?)').run(tenant1Id, tenant2Id);

  console.log('Test data cleaned up.');

} catch (err) {
  console.error('\n❌ TEST SUITE FAILED WITH ERROR:', err.message);
  console.error(err.stack);
  process.exit(1);
}

console.log('\n═══════════════════════════════════════════════════════════════════════════');
console.log(`RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
console.log('═══════════════════════════════════════════════════════════════════════════\n');

if (passedTests === totalTests) {
  console.log('✅ ALL SIGNUP VERIFICATION TESTS PASSED!');
  process.exit(0);
} else {
  console.error('❌ SOME TESTS FAILED');
  process.exit(1);
}
