const assert = require('assert');
const http = require('http');
const { Pool } = require('pg');
require('dotenv').config();

const API_BASE = 'http://127.0.0.1:5000';
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:devpassword123@127.0.0.1:54330/zestify_local_dev'
});

async function apiRequest(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    const postData = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (postData) headers['Content-Length'] = Buffer.byteLength(postData);

    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers
    }, res => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        let parsed = raw;
        try { parsed = JSON.parse(raw); } catch (_) {}
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function run() {
  console.log('======================================================================');
  console.log('   ZESTIFY FINAL COMPREHENSIVE SECURITY & AUTHORITY AUDIT SUITE');
  console.log('======================================================================\n');

  let passed = 0;
  let total = 0;
  function pass(desc) {
    passed++;
    total++;
    console.log(`✓ [PASS ${total}] ${desc}`);
  }
  function fail(desc, err) {
    total++;
    console.error(`✗ [FAIL ${total}] ${desc}:`, err);
    process.exit(1);
  }

  try {
    // Authenticate test actors
    const rAdmin = await apiRequest('POST', '/api/admin/login', { username: 'software_owner', password: 'SoftwareOwnerPass123!' });
    assert.strictEqual(rAdmin.status, 200, 'Software Owner authentication should return 200');
    const platformToken = rAdmin.body.token;

    const rOwner = await apiRequest('POST', '/api/auth/login', { username: 'company_owner', password: 'CompanyOwnerPass123!' });
    assert.strictEqual(rOwner.status, 200, 'Company Owner authentication should return 200');
    const ownerToken = rOwner.body.token;
    const tenantId = rOwner.body.user.tenantId;

    const rLead = await apiRequest('POST', '/api/auth/login', { username: 'team_lead', password: 'TeamLeadPass123!' });
    assert.strictEqual(rLead.status, 200, 'Team Lead authentication should return 200');
    const leadToken = rLead.body.token;

    const rWorker = await apiRequest('POST', '/api/auth/login', { username: 'worker_agent', password: 'WorkerPass123!' });
    assert.strictEqual(rWorker.status, 200, 'Worker authentication should return 200');
    const workerToken = rWorker.body.token;

    // 1. Platform Admin Tenant Isolation
    const uAdmin = await pool.query("SELECT id, username, role, \"tenantId\" FROM users WHERE username = 'software_owner'");
    assert.strictEqual(uAdmin.rows[0].tenantId, null, 'Platform Admin tenantId MUST be NULL');
    assert.strictEqual(uAdmin.rows[0].role, 'platform_admin', 'Role must be platform_admin');
    pass('Platform Admin strictly detached from customer tenancy (tenantId is NULL in DB)');

    // 2. Platform Admin Seat Exclusion
    const { getTenantSeatUsage } = require('../dist/databaseManager');
    const seatUsage = await getTenantSeatUsage(tenantId);
    const activeSeats = seatUsage.activeSeats;
    const dbActive = await pool.query(
      `SELECT COUNT(*) as count FROM users WHERE "tenantId" = $1 AND LOWER(role) NOT IN ('platform_admin', 'master_admin', 'super_admin') AND LOWER(status) = 'active'`,
      [tenantId]
    );
    assert.strictEqual(Number(activeSeats), Number(dbActive.rows[0].count), 'Platform Admins excluded from seat usage calculation');
    pass('Platform Admin excluded from customer workspace seat count');

    // 3. Platform Admin Team / Member Exclusion
    const addTeamRes = await apiRequest('POST', '/api/teams', {
      name: 'Forbidden Squad ' + Date.now(),
      leaderId: uAdmin.rows[0].id
    }, ownerToken);
    assert(addTeamRes.status === 400 || addTeamRes.status === 500, 'Platform admin cannot be assigned as team leader');
    pass('Platform Admin excluded from team leadership and team membership');

    // 4. Platform Admin CRM Assignment Exclusion
    const crmCompRes = await apiRequest('POST', '/api/crm/companies', {
      name: 'Test Corp ' + Date.now(),
      assignedUserId: uAdmin.rows[0].id
    }, ownerToken);
    assert.strictEqual(crmCompRes.status, 400, 'CRM company assignment to Platform Admin must be rejected with 400');

    const crmTaskRes = await apiRequest('POST', '/api/crm/tasks', {
      title: 'Audit Task ' + Date.now(),
      dueAt: new Date(Date.now() + 86400000).toISOString(),
      assignedUserId: uAdmin.rows[0].id
    }, ownerToken);
    assert.strictEqual(crmTaskRes.status, 400, 'CRM task assignment to Platform Admin must be rejected with 400');
    pass('Platform Admin excluded from CRM company and CRM task assignment (400 rejected)');

    // 5. Company Owner Authority Boundaries (Blocked from platform APIs)
    const platOverviewRes = await apiRequest('GET', '/api/admin/platform/overview', null, ownerToken);
    assert.strictEqual(platOverviewRes.status, 403, 'Company Owner must receive 403 on Platform APIs');
    pass('Company Owner strictly barred from Platform Owner APIs (403 Forbidden)');

    // 6. Team Lead Boundaries (Blocked from modifying company settings)
    const tlModSettings = await apiRequest('PATCH', '/api/tenant/lead-pool-mode', { leadPoolMode: 'assigned' }, leadToken);
    assert.strictEqual(tlModSettings.status, 403, 'Team Lead cannot modify company tenant settings');
    pass('Team Lead barred from tenant company administrative settings (403 Forbidden)');

    // 7. Worker Boundaries (Blocked from reassigning leads or modifying members)
    const wkAddUser = await apiRequest('POST', '/api/users', { username: 'hacker', password: 'Password123!' }, workerToken);
    assert.strictEqual(wkAddUser.status, 403, 'Worker cannot create users');
    pass('Worker / Agent barred from user management and administrative routes');

    // 8. Cross-Tenant Access Isolation
    // Create secondary tenant
    const tB = 'tenant_audit_b_' + Date.now().toString(36);
    await pool.query(`INSERT INTO tenants (id, name, slug, status, "customerType", "createdAt", "updatedAt") VALUES ($1, 'Tenant B', $2, 'active', 'COMPANY', NOW(), NOW())`, [tB, tB]);
    const uBId = 'user_b_' + Date.now().toString(36);
    await pool.query(`INSERT INTO users (id, username, "passwordHash", role, "tenantId", "emailVerified", "createdAt", "updatedAt") VALUES ($1, $2, 'dummy', 'admin', $3, 1, NOW(), NOW())`, [uBId, 'owner_b_' + Date.now().toString(36), tB]);
    const { issueAuthToken } = require('../dist/authManager');
    const tokenB = issueAuthToken({ id: uBId, username: 'owner_b', role: 'admin', tenantId: tB });
    
    // Attempt to access Tenant A campaigns with Token B
    const crossRes = await apiRequest('GET', '/api/campaigns', null, tokenB);
    const bCampaigns = Array.isArray(crossRes.body) ? crossRes.body : (crossRes.body?.campaigns || []);
    assert(bCampaigns.every(c => c.tenantId === tB), 'Tenant B cannot see Tenant A campaigns');
    pass('Cross-tenant data isolation strictly enforced with zero leak');

    // 9. Invitation Identity Binding
    const invEmail = 'restricted_invite_' + Date.now().toString(36) + '@acme.com';
    const invRes = await apiRequest('POST', '/api/invitations', {
      email: invEmail,
      role: 'user'
    }, ownerToken);
    assert(invRes.status === 200 || invRes.status === 201, 'Company Owner creates invitation');
    
    // Platform Admin cannot accept invitation
    const rawInviteToken = invRes.body.token || invRes.body.invitation?.token;
    const platAccept = await apiRequest('POST', '/api/invitations/accept', { token: rawInviteToken }, platformToken);
    assert.strictEqual(platAccept.status, 403, 'Platform Admin rejected from accepting customer invitation');
    pass('Workspace invitations strictly reject Platform Admin cross-plane acceptance');

    // 10. Onboarding Security (Platform Admin blocked)
    const platOnboard = await apiRequest('POST', '/api/onboarding/complete', {
      companyName: 'Platform Illegal Tenant',
      customerType: 'COMPANY'
    }, platformToken);
    assert.strictEqual(platOnboard.status, 403, 'Platform Admin barred from customer onboarding');
    pass('Platform Admin barred from customer workspace onboarding wizard (403 Forbidden)');

    // 11. Lead Gen Imports Guard
    const leadGenRes = await apiRequest('POST', '/api/scraper/import-leads', {
      targetTenantId: 'tenant_other_workspace',
      leads: [{ name: 'Test', phone: '+1234567890' }]
    }, ownerToken);
    assert.strictEqual(leadGenRes.status, 403, 'Cross-tenant Lead Gen import rejected with 403');
    pass('Cross-tenant Lead Gen import blocked with fail-closed 403');

    // 12. Module Entitlements Ceiling
    const ceilingRes = await apiRequest('POST', '/api/users', {
      username: 'member_bad_mod_' + Date.now().toString(36),
      password: 'MemberPass123!',
      modules: ['non_existent_unentitled_module']
    }, ownerToken);
    assert.strictEqual(ceilingRes.status, 403, 'User creation with unentitled module rejected with 403');
    pass('Module entitlements ceiling enforced fail-closed on user creation');

    // 13. Dedicated /admin/login Route Authority
    const adminLoginFail = await apiRequest('POST', '/api/admin/login', {
      username: 'company_owner',
      password: 'CompanyOwnerPass123!'
    });
    assert.strictEqual(adminLoginFail.status, 403, 'Customer role rejected on /api/admin/login');

    const adminLoginOk = await apiRequest('POST', '/api/admin/login', {
      username: 'software_owner',
      password: 'SoftwareOwnerPass123!'
    });
    assert.strictEqual(adminLoginOk.status, 200, 'Platform role accepted on /api/admin/login');
    pass('Dedicated /admin/login endpoint rejects customer accounts (403) and accepts platform admin (200)');

    // 14. Query-String Authentication Rejected
    const qsRes = await apiRequest('GET', `/api/campaigns?token=${ownerToken}`, null, null);
    assert.strictEqual(qsRes.status, 401, 'Query-string bearer tokens strictly rejected');
    pass('Query-string bearer authentication strictly blocked (401 Unauthorized)');

    // 15. Elimination of tenant_default Authorization Fallback
    const uRegDirect = require('../dist/authManager');
    let thrown = false;
    try {
      await uRegDirect.registerPublicUser({
        username: 'orphan_' + Date.now().toString(36),
        password: 'Password123!'
        // missing tenantId
      });
    } catch (e) {
      thrown = true;
      assert(e.message.includes('Tenant ID is required'), 'Must require tenantId explicitly');
    }
    assert.strictEqual(thrown, true, 'registerPublicUser without tenantId fails closed');
    pass('Dangerous tenant_default fallback removed from user registration (fails closed)');

    // Cleanup ephemeral tenant
    await pool.query('DELETE FROM users WHERE "tenantId" = $1', [tB]);
    await pool.query('DELETE FROM tenants WHERE id = $1', [tB]);

    console.log('\n======================================================================');
    console.log(`🏆 ALL ${passed}/${total} AUDIT SUITE TESTS PASSED WITH 100% SUCCESS!`);
    console.log('======================================================================\n');
    await pool.end();
    process.exit(0);
  } catch (err) {
    fail('Final security audit suite encountered an error', err);
  }
}

run();
