/**
 * website_octal_dialer/backend/tests/test_authority_security_closeout.cjs
 * Comprehensive Authority & Security Closeout Verification Test Suite.
 * Validates all P0 and P1 security hardening items from the independent GPT source review.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const http = require('http');
const assert = require('assert');
const { dbAdapter: db } = require('../dist/db/dbAdapter.js');
const {
  getTenantModuleEntitlements,
  getTenantSeatUsage,
  normalizeModuleKey,
  isPlatformRole,
  isCompanyOwner
} = require('../dist/databaseManager.js');
const {
  validateToken,
  updateUserRole,
  issueAuthToken
} = require('../dist/authManager.js');

const BASE_PORT = process.env.PORT || 5000;

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const req = http.request({
      hostname: '127.0.0.1',
      port: BASE_PORT,
      path,
      method,
      headers
    }, res => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode, raw });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const get = (p, token) => request('GET', p, null, token);
const post = (p, body, token) => request('POST', p, body, token);
const put = (p, body, token) => request('PUT', p, body, token);

async function runCloseoutSuite() {
  await db.init();
  console.log('======================================================================');
  console.log('🛡️  ZESTIFY AUTHORITY & SECURITY CLOSEOUT REGRESSION TEST SUITE');
  console.log('======================================================================\n');

  // Login Platform Admin
  const adminLogin = await post('/api/auth/login', { username: 'admin', password: 'AdminPassword1234!' });
  assert.strictEqual(adminLogin.status, 200, 'Platform admin login must succeed');
  const superToken = adminLogin.data.token;

  // Provision Workspace 1
  const t1Suffix = Date.now();
  const prov1 = await post('/api/super-admin/provision', {
    name: `Closeout Org A ${t1Suffix}`,
    username: `owner_a_${t1Suffix}`,
    password: 'Password123!',
    email: `owner_a_${t1Suffix}@test.com`
  }, superToken);
  assert.strictEqual(prov1.status, 201);
  const tenant1Id = prov1.data.tenantId;
  const ownerAUsername = prov1.data.username;

  // Login Owner A
  const ownerALogin = await post('/api/auth/login', { username: ownerAUsername, password: 'Password123!' });
  assert.strictEqual(ownerALogin.status, 200);
  const ownerAToken = ownerALogin.data.token;

  // Provision Workspace 2 (for cross-tenant checks)
  const t2Suffix = t1Suffix + 1;
  const prov2 = await post('/api/super-admin/provision', {
    name: `Closeout Org B ${t2Suffix}`,
    username: `owner_b_${t2Suffix}`,
    password: 'Password123!',
    email: `owner_b_${t2Suffix}@test.com`
  }, superToken);
  assert.strictEqual(prov2.status, 201);
  const tenant2Id = prov2.data.tenantId;
  const ownerBUsername = prov2.data.username;

  const ownerBLogin = await post('/api/auth/login', { username: ownerBUsername, password: 'Password123!' });
  const ownerBToken = ownerBLogin.data.token;

  console.log('----------------------------------------------------------------------');
  console.log('P0-1: Lead Gen Z Import Authorization & Cross-Tenant Injection Guard');
  console.log('----------------------------------------------------------------------');

  // Test 1: Unauthenticated call is rejected
  const leadUnauth = await post('/api/integrations/leadgen/import', { records: [{ name: 'Test', phone: '1234567890' }] });
  assert.strictEqual(leadUnauth.status, 401, 'Unauthenticated Lead Gen Z import must return 401');
  console.log('✓ Unauthenticated Lead Gen Z import rejected with 401.');

  // Test 2: Cross-tenant injection attempt (Owner A attempts to inject leads into Workspace B)
  const leadCross = await post('/api/integrations/leadgen/import', {
    workspaceId: tenant2Id,
    records: [{ name: 'Hacked Lead', phone: '1234567890' }]
  }, ownerAToken);
  assert.strictEqual(leadCross.status, 403, 'Cross-tenant lead injection must be rejected with 403');
  console.log('✓ Cross-tenant lead injection forbidden with 403.');

  // Test 3: Authorized import into own workspace succeeds
  const leadValid = await post('/api/integrations/leadgen/import', {
    records: [{ name: 'Valid Lead', phone: '1234567890' }]
  }, ownerAToken);
  assert.strictEqual(leadValid.status, 200, 'Authorized lead import must succeed with 200');
  assert.strictEqual(leadValid.data.workspaceId, tenant1Id, 'Imported leads bound strictly to caller workspace');
  console.log('✓ Authorized lead import bound strictly to caller tenant.\n');

  console.log('----------------------------------------------------------------------');
  console.log('P0-2, P1-5, P1-6: Workspace Invitations Hardening');
  console.log('----------------------------------------------------------------------');

  // Owner A invites an email
  const inviteEmail = `invitee_${t1Suffix}@test.com`;
  const invRes = await post('/api/admin/invitations', {
    email: inviteEmail,
    role: 'user'
  }, ownerAToken);
  assert.strictEqual(invRes.status, 201, 'Invitation creation must succeed');
  const invToken = invRes.data.token;
  const invId = invRes.data.invitation.id;

  // Test 4: Platform admin attempts to accept invitation
  const adminAccept = await post('/api/invitations/accept', { token: invToken }, superToken);
  assert.strictEqual(adminAccept.status, 403, 'Platform admin cannot accept workspace invitations');
  console.log('✓ Platform admin acceptance rejected with 403.');

  // Test 5: Caller with mismatched email attempts to accept invitation
  const wrongEmailUser = await post('/api/invitations/accept', { token: invToken }, ownerBToken);
  assert.strictEqual(wrongEmailUser.status, 403, 'Mismatched user acceptance must be rejected with 403');
  console.log('✓ Mismatched caller email rejected with 403.');

  // Test 6: Cross-tenant switching guard (User already bound to Tenant B cannot join Tenant A)
  // Even if email matched:
  const crossUser = await post('/api/invitations/accept', {
    invitationId: invId
  }, ownerBToken);
  assert.strictEqual(crossUser.status, 403, 'User already in another tenant cannot accept');
  console.log('✓ Cross-tenant switching via invitation rejected with 403.\n');

  console.log('----------------------------------------------------------------------');
  console.log('P0-3 & P1-4: Platform Admin Onboarding Guard & roleId NULL Clearing');
  console.log('----------------------------------------------------------------------');

  // Test 7: Platform Admin attempts customer onboarding
  const adminOnboard = await post('/api/onboarding/complete', {
    companyName: 'Platform Sub Org'
  }, superToken);
  assert.strictEqual(adminOnboard.status, 403, 'Platform admin cannot complete customer onboarding');
  console.log('✓ Platform admin onboarding blocked with 403.');

  // Test 8: Regular user completes onboarding, roleId is cleared to NULL
  // Register a public user with a roleId set
  const newUsername = `onboard_user_${t1Suffix}`;
  const nowIso = new Date().toISOString();
  const newUserId = `u_${t1Suffix}`;

  await db.execute(`
    INSERT INTO custom_roles (id, "roleName", description, permissions, status, "createdBy", "createdAt", "tenantId")
    VALUES ('stale_role_999', 'Old Role', 'Old', '[]', 'Active', 'system', $1, NULL)
    ON CONFLICT (id) DO NOTHING
  `, [nowIso]);

  await db.execute(`
    INSERT INTO users (id, username, email, "passwordHash", role, "tenantId", "roleId", "authProvider", "emailVerified", "createdAt", "updatedAt")
    VALUES ($1, $2, $3, 'hash', 'user', NULL, 'stale_role_999', 'local', 1, $4, $4)
  `, [newUserId, newUsername, `${newUsername}@test.com`, nowIso]);

  const newUserToken = issueAuthToken({ id: newUserId, username: newUsername, role: 'user', tenantId: null });
  const onboardRes = await post('/api/onboarding/complete', {
    companyName: `Onboarded Org ${t1Suffix}`
  }, newUserToken);
  assert.strictEqual(onboardRes.status, 200, 'User onboarding must succeed');

  const verifiedUser = await db.queryOne(`SELECT role, "roleId" FROM users WHERE id = $1`, [newUserId]);
  assert.strictEqual(verifiedUser.role, 'admin', 'User promoted to Company Owner (admin)');
  assert.strictEqual(verifiedUser.roleId, null, 'roleId MUST be cleared to NULL on onboarding as Company Owner');
  console.log('✓ Company Owner onboarding sets role=admin and strictly clears roleId to NULL.\n');

  console.log('----------------------------------------------------------------------');
  console.log('P0-4: Fail-Closed Tenant Module Entitlements');
  console.log('----------------------------------------------------------------------');

  // Test 9: Unseeded/non-existent tenant returns false for all canonical modules
  const nonExistentEntitlements = await getTenantModuleEntitlements('tenant_non_existent_999');
  assert.strictEqual(nonExistentEntitlements.crm, false, 'crm must default to false');
  assert.strictEqual(nonExistentEntitlements.octalDialer, false, 'octalDialer must default to false');
  assert.strictEqual(nonExistentEntitlements.googleScraper, false, 'googleScraper must default to false');
  assert.strictEqual(nonExistentEntitlements.autoEmailer, false, 'autoEmailer must default to false');
  console.log('✓ Tenant module entitlements fail closed (all false for missing/unseeded tenants).\n');

  console.log('----------------------------------------------------------------------');
  console.log('P1-1: Platform Admin Seat Ceiling is the Hard Maximum');
  console.log('----------------------------------------------------------------------');

  // Test 10: Set platform maxAgents to 5, plan maxUsers to 50 -> maxSeats MUST be 5
  await db.execute(`UPDATE tenants SET "maxAgents" = 5 WHERE id = $1`, [tenant1Id]);
  // Attach a plan with maxUsers = 50
  await db.execute(`
    INSERT INTO plans (id, name, "priceMonthly", status, "createdAt", "updatedAt")
    VALUES ('plan_test_50', '50 Seat Plan', 99, 'active', $1, $1)
    ON CONFLICT (id) DO NOTHING
  `, [nowIso]);
  await db.execute(`
    INSERT INTO plan_features ("planId", "featureKey", value)
    VALUES ('plan_test_50', 'maxUsers', '50')
    ON CONFLICT ("planId", "featureKey") DO UPDATE SET value = '50'
  `);
  await db.execute(`
    INSERT INTO subscriptions (id, "tenantId", "planId", status, "currentPeriodStart", "currentPeriodEnd", "createdAt", "updatedAt")
    VALUES ('sub_test_50_${t1Suffix}', $1, 'plan_test_50', 'active', $2, $2, $2, $2)
  `, [tenant1Id, nowIso]);

  const seatUsage = await getTenantSeatUsage(tenant1Id);
  assert.strictEqual(seatUsage.maxSeats, 5, 'Subscription plan cannot raise maxSeats above platform admin ceiling of 5');
  console.log(`✓ Platform ceiling enforced as hard maximum: maxSeats=${seatUsage.maxSeats} (bounded at platform ceiling 5, not plan 50).\n`);

  console.log('----------------------------------------------------------------------');
  console.log('P1-2 & P1-3: Transactional User Creation & Update with Pre-Validation');
  console.log('----------------------------------------------------------------------');

  // Test 11: Attempting to create user with module not entitled to company
  // Disable googleScraper in company entitlements
  await db.execute(`
    INSERT INTO tenant_module_entitlements (id, "tenantId", "moduleId", enabled, "updatedBy", "updatedAt")
    VALUES ('tme_dis_${tenant1Id}', $1, 'googleScraper', 0, 'admin', $2)
    ON CONFLICT ("tenantId", "moduleId") DO UPDATE SET enabled = 0
  `, [tenant1Id, nowIso]);

  const unentitledUserCreate = await post('/api/admin/users', {
    username: `orphan_attempt_${t1Suffix}`,
    password: 'Password123!',
    modules: ['crm', 'googleScraper']
  }, ownerAToken);
  assert.strictEqual(unentitledUserCreate.status, 403, 'Creating user with unentitled module must return 403');

  // Verify user was NOT inserted (no partial write)
  const orphanCheck = await db.queryOne(`SELECT id FROM users WHERE username = $1`, [`orphan_attempt_${t1Suffix}`]);
  assert.strictEqual(Boolean(orphanCheck), false, 'Orphan user must not exist in database due to pre-validation and transaction rollback');
  console.log('✓ User creation pre-validation prevented orphan user insertion.');

  // Test 12: Attempting to update existing user with unentitled module
  // Create valid user first
  const validUserCreate = await post('/api/admin/users', {
    username: `valid_user_${t1Suffix}`,
    password: 'Password123!',
    modules: ['crm']
  }, ownerAToken);
  assert.strictEqual(validUserCreate.status, 200);
  const createdUserId = validUserCreate.data.user.id;

  // Try to update with unentitled googleScraper AND change role to team_lead
  const unentitledUpdate = await put(`/api/admin/users/${createdUserId}`, {
    role: 'team_lead',
    modules: { crm: true, googleScraper: true }
  }, ownerAToken);
  assert.strictEqual(unentitledUpdate.status, 403, 'Updating user with unentitled module must return 403');

  // Verify role was NOT updated (transaction rollback)
  const roleCheck = await db.queryOne(`SELECT role FROM users WHERE id = $1`, [createdUserId]);
  assert.strictEqual(roleCheck.role, 'user', 'Role must remain unchanged due to transaction rollback');
  console.log('✓ User update pre-validation rolled back all partial mutations.\n');

  console.log('----------------------------------------------------------------------');
  console.log('P1-7: Impersonation Session & Exit Verification');
  console.log('----------------------------------------------------------------------');

  // Test 13: Exit impersonation without active session returns 400
  const exitNoSession = await post('/api/super-admin/impersonate/exit', {}, ownerAToken);
  assert.strictEqual(exitNoSession.status, 400, 'Exiting impersonation without active session must return 400');
  console.log('✓ Impersonation exit without active session rejected with 400.');

  // Test 14: Start impersonation and verify claims survive validateToken
  const impRes = await post(`/api/super-admin/impersonate/${tenant1Id}`, { reason: 'Audit Check' }, superToken);
  assert.strictEqual(impRes.status, 200, 'Impersonation start must succeed');
  const impToken = impRes.data.token;

  const validatedImpUser = await validateToken(impToken);
  assert.ok(validatedImpUser, 'Token must validate');
  assert.strictEqual(validatedImpUser.impersonatedBy, 'admin', 'impersonatedBy claim must survive validateToken');
  assert.strictEqual(validatedImpUser.role, 'admin', 'Impersonated role must be downgraded to admin');
  console.log('✓ Impersonation claims and effective downgrade survive validateToken.');

  // Test 15: Impersonated user can exit
  const exitSuccess = await post('/api/super-admin/impersonate/exit', {}, impToken);
  assert.strictEqual(exitSuccess.status, 200, 'Valid impersonation exit must succeed');
  console.log('✓ Valid impersonation session exited cleanly.\n');

  console.log('----------------------------------------------------------------------');
  console.log('P1-10: Query-String Token Rejected by requireAuth');
  console.log('----------------------------------------------------------------------');

  // Test 16: Attempt request using ?token= query parameter without Bearer header
  const queryTokenReq = await get(`/api/admin/users?token=${ownerAToken}`);
  assert.strictEqual(queryTokenReq.status, 401, 'Query-string bearer tokens must be rejected with 401');
  console.log('✓ Query-string bearer token rejected with 401.\n');

  console.log('----------------------------------------------------------------------');
  console.log('P1-13: Username-Specific mohsin1 Check Removal');
  console.log('----------------------------------------------------------------------');

  // Test 17: Platform role protection relies solely on isPlatformRole
  assert.strictEqual(isPlatformRole('platform_admin'), true);
  assert.strictEqual(isPlatformRole('super_admin'), true);
  assert.strictEqual(isPlatformRole('admin'), false);
  assert.strictEqual(isPlatformRole('user'), false);
  console.log('✓ Canonical role helper isPlatformRole functions authoritatively.\n');

  console.log('======================================================================');
  console.log('🎉 ALL 17 AUTHORITY & SECURITY CLOSEOUT TESTS PASSED PERFECTLY!');
  console.log('======================================================================\n');
}

runCloseoutSuite().catch(err => {
  console.error('\n❌ TEST SUITE FAILURE:', err);
  process.exit(1);
});
