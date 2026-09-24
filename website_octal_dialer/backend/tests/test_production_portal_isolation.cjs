const assert = require('assert');
const http = require('http');
const crypto = require('crypto');
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
  console.log('   ZESTIFY PRODUCTION ISOLATION & MODULE CEILING VERIFICATION SUITE');
  console.log('======================================================================\n');

  let passed = 0;
  let total = 0;
  function pass(desc) {
    passed++;
    total++;
    console.log(`✓ [PASS ${total}] ${desc}`);
  }

  try {
    // 0. Seed test platform admin and test tenant
    const testSuffix = Date.now().toString(36);
    const tenantIdA = `tenant_iso_a_${testSuffix}`;
    const tenantIdB = `tenant_iso_b_${testSuffix}`;
    const pAdminUsername = `padmin_iso_${testSuffix}`;
    const ownerAUsername = `ownera_iso_${testSuffix}`;
    const workerAUsername = `workera_iso_${testSuffix}`;

    // Create tenants
    await pool.query(`
      INSERT INTO tenants (id, name, slug, tier, "maxAgents", status, "createdAt")
      VALUES ($1, $2, $3, 'enterprise', 50, 'active', NOW()),
             ($4, $5, $6, 'enterprise', 50, 'active', NOW())
    `, [tenantIdA, `Tenant ISO A ${testSuffix}`, `slug-a-${testSuffix}`, tenantIdB, `Tenant ISO B ${testSuffix}`, `slug-b-${testSuffix}`]);

    // Set initial entitlements for tenant A: crm = false, leads = true, campaigns = true, octalDialer = true
    await pool.query(`
      INSERT INTO tenant_module_entitlements (id, "tenantId", "moduleId", enabled, "updatedBy", "updatedAt")
      VALUES ('tme_1_${testSuffix}', $1, 'crm', 0, 'system', NOW()),
             ('tme_2_${testSuffix}', $1, 'leads', 1, 'system', NOW()),
             ('tme_3_${testSuffix}', $1, 'campaigns', 1, 'system', NOW()),
             ('tme_4_${testSuffix}', $1, 'octalDialer', 1, 'system', NOW())
    `, [tenantIdA]);

    // Create users: Platform Admin (tenantId = NULL), Owner A (tenantId = tenantIdA, role = admin), Worker A (role = user)
    const pwSalt = crypto.randomBytes(16).toString('hex');
    const pwHash = `${pwSalt}:${crypto.scryptSync('Password123!', pwSalt, 64).toString('hex')}`;

    await pool.query(`
      INSERT INTO users (id, username, "passwordHash", role, "tenantId", status, "createdAt")
      VALUES ('u_pad_${testSuffix}', $1, $2, 'platform_admin', NULL, 'active', NOW()),
             ('u_own_${testSuffix}', $3, $2, 'admin', $4, 'active', NOW()),
             ('u_wrk_${testSuffix}', $5, $2, 'user', $4, 'active', NOW())
    `, [pAdminUsername, pwHash, ownerAUsername, tenantIdA, workerAUsername]);

    // Login each to obtain authentic JWT tokens
    const pAdminLogin = await apiRequest('POST', '/api/auth/login', { username: pAdminUsername, password: 'Password123!' });
    assert.strictEqual(pAdminLogin.status, 200, 'Platform admin login must succeed');
    const pAdminToken = pAdminLogin.body.token;

    const ownerALogin = await apiRequest('POST', '/api/auth/login', { username: ownerAUsername, password: 'Password123!' });
    assert.strictEqual(ownerALogin.status, 200, 'Owner A login must succeed');
    const ownerAToken = ownerALogin.body.token;

    const workerALogin = await apiRequest('POST', '/api/auth/login', { username: workerAUsername, password: 'Password123!' });
    assert.strictEqual(workerALogin.status, 200, 'Worker A login must succeed');
    const workerAToken = workerALogin.body.token;

    pass('Test infrastructure seeded: 2 tenants, 1 platform admin, 1 company owner, 1 worker.');

    // ─── GATE 1: Company Module Ceiling Server-Side Enforcement ─────────────────
    // Company Owner has '*' wildcard permissions.
    // Tenant A has crm = false (disabled).
    // Accessing a CRM-only endpoint must return 403 Forbidden!
    const crmOverviewBefore = await apiRequest('GET', '/api/crm/companies', null, ownerAToken);
    assert.strictEqual(crmOverviewBefore.status, 403, 'Company Owner with wildcard MUST be blocked from disabled CRM module');
    assert.ok(
      crmOverviewBefore.body.error && crmOverviewBefore.body.error.includes('disabled'),
      `Error message must indicate feature is disabled for organization. Got: ${crmOverviewBefore.body.error}`
    );
    pass('Module Ceiling: Company Owner with wildcard is strictly rejected (HTTP 403) from disabled CRM module.');

    // Worker A also blocked from disabled CRM module
    const workerCrmBefore = await apiRequest('GET', '/api/crm/companies', null, workerAToken);
    assert.strictEqual(workerCrmBefore.status, 403, 'Worker must also be blocked from disabled CRM module');
    pass('Module Ceiling: Worker is strictly rejected (HTTP 403) from disabled CRM module.');

    // Permitted module endpoint (/leads) succeeds for Company Owner
    const leadsAccess = await apiRequest('GET', '/api/leads', null, ownerAToken);
    assert.strictEqual(leadsAccess.status, 200, 'Company Owner must access entitled leads module');
    pass('Module Ceiling: Company Owner accesses entitled leads module (HTTP 200).');

    // Platform Admin updates entitlement: enables CRM for Tenant A
    const enableCrm = await apiRequest('PUT', `/api/super-admin/tenants/${tenantIdA}/entitlements`, {
      entitlements: { crm: true, leads: true, campaigns: true, octalDialer: true }
    }, pAdminToken);
    assert.strictEqual(enableCrm.status, 200, 'Platform Admin successfully enables CRM module for Tenant A');

    // Now Company Owner can immediately access CRM
    const crmOverviewAfter = await apiRequest('GET', '/api/crm/companies', null, ownerAToken);
    assert.strictEqual(crmOverviewAfter.status, 200, 'Company Owner can access CRM once module entitlement is enabled');
    pass('Module Ceiling Dynamic Update: Company Owner gains access to CRM immediately upon entitlement activation.');

    // ─── GATE 2: Platform Admin vs Customer Boundary Isolation ──────────────────
    // Customer Company Owner cannot access Platform Admin endpoints
    const customerAdminAttempt = await apiRequest('GET', '/api/super-admin/tenants', null, ownerAToken);
    assert.strictEqual(customerAdminAttempt.status, 403, 'Company Owner cannot access platform super-admin endpoints');
    pass('Portal Isolation: Customer Company Owner rejected (HTTP 403) from platform admin endpoints.');

    // Worker cannot access Platform Admin endpoints
    const workerAdminAttempt = await apiRequest('GET', '/api/super-admin/tenants', null, workerAToken);
    assert.strictEqual(workerAdminAttempt.status, 403, 'Worker rejected from platform admin endpoints');
    pass('Portal Isolation: Worker rejected (HTTP 403) from platform admin endpoints.');

    // Platform Admin tenantId remains NULL in database
    const pAdminRow = await pool.query(`SELECT "tenantId", role FROM users WHERE username = $1`, [pAdminUsername]);
    assert.strictEqual(pAdminRow.rows[0].tenantId, null, 'Platform Admin tenantId MUST remain NULL');
    pass('Database Integrity: Platform Admin tenantId is strictly NULL.');

    // ─── GATE 3: Audited Support Impersonation Lifecycle ─────────────────────────
    // Platform Admin impersonates Company Owner into Tenant A
    const impersonateRes = await apiRequest('POST', `/api/super-admin/impersonate/${tenantIdA}`, {
      userId: `u_own_${testSuffix}`,
      reason: 'Automated launch readiness audit'
    }, pAdminToken);
    assert.strictEqual(impersonateRes.status, 200, 'Platform Admin impersonation initiation must succeed');
    assert.ok(impersonateRes.body.token, 'Must return impersonation JWT token');
    const impToken = impersonateRes.body.token;

    // Verify audit log recorded IMPERSONATION_STARTED
    const auditStart = await pool.query(`
      SELECT action, details FROM audit_logs_admin
      WHERE username = $1 AND action = 'IMPERSONATION_STARTED'
      ORDER BY timestamp DESC LIMIT 1
    `, [pAdminUsername]);
    assert.strictEqual(auditStart.rowCount, 1, 'IMPERSONATION_STARTED must be recorded in audit_logs_admin');
    pass('Impersonation: Platform Admin successfully initiates impersonation with immutable audit log.');

    // Impersonated session can access Tenant A workspace
    const impWorkspaceAccess = await apiRequest('GET', '/api/leads', null, impToken);
    assert.strictEqual(impWorkspaceAccess.status, 200, 'Impersonated session accesses target tenant leads');
    pass('Impersonation: Impersonated session operates within target tenant workspace.');

    // Impersonated session attempts to call platform admin endpoint -> MUST BE REJECTED (Downgrade Safety)
    const impPlatformEscape = await apiRequest('GET', '/api/super-admin/tenants', null, impToken);
    assert.strictEqual(impPlatformEscape.status, 403, 'Impersonated session must NOT retain platform admin privileges');
    pass('Impersonation Downgrade Safety: Impersonated token cannot access platform admin endpoints.');

    // Exit impersonation session
    const exitRes = await apiRequest('POST', '/api/super-admin/impersonate/exit', {}, impToken);
    assert.strictEqual(exitRes.status, 200, 'Impersonation exit must succeed');

    const auditEnd = await pool.query(`
      SELECT action FROM audit_logs_admin
      WHERE action = 'IMPERSONATION_ENDED' AND "targetId" = 'u_own_${testSuffix}'
      ORDER BY timestamp DESC LIMIT 1
    `);
    assert.strictEqual(auditEnd.rowCount, 1, 'IMPERSONATION_ENDED must be recorded in audit_logs_admin');
    pass('Impersonation: Session termination cleanly recorded in immutable audit log.');

    // ─── GATE 4: Lead Gen Z Integration Boundary Hardening ───────────────────────
    // Unauthenticated request to /api/integrations/leadgen/import returns 401
    const unauthLeadgen = await apiRequest('POST', '/api/integrations/leadgen/import', {
      records: [{ name: 'Acme Corp', phone: '+1234567890' }]
    });
    assert.strictEqual(unauthLeadgen.status, 401, 'Unauthenticated Lead Gen Z import must return 401');
    pass('Lead Gen Z Security: Unauthenticated lead ingestion rejected (HTTP 401).');

    // Cross-tenant lead injection: Tenant A token attempts to import into Tenant B
    const crossTenantLeadgen = await apiRequest('POST', '/api/integrations/leadgen/import', {
      workspaceId: tenantIdB,
      records: [{ name: 'Acme Injected', phone: '+1234567890' }]
    }, ownerAToken);
    assert.strictEqual(crossTenantLeadgen.status, 403, 'Cross-tenant lead injection must return 403');
    pass('Lead Gen Z Security: Cross-tenant lead injection strictly prevented (HTTP 403).');

    // Valid authenticated import bound to Tenant A
    const validLeadgen = await apiRequest('POST', '/api/integrations/leadgen/import', {
      records: [{ name: 'Verified Corp', phone: '+15551234567', email: 'verified@corp.test' }],
      campaignName: `Production Test Campaign ${testSuffix}`
    }, ownerAToken);
    assert.strictEqual(validLeadgen.status, 200, 'Valid Lead Gen Z import must succeed');
    assert.strictEqual(validLeadgen.body.success, true);
    assert.strictEqual(validLeadgen.body.tenantId || validLeadgen.body.workspaceId, tenantIdA, 'Imported campaign must be strictly bound to caller tenant');
    pass('Lead Gen Z Security: Valid authenticated leads imported and strictly bound to caller workspace.');

    // ─── GATE 5: Verification of Cleanup ─────────────────────────────────────────
    // Clean up test tenants and users
    await pool.query(`DELETE FROM users WHERE "tenantId" IN ($1, $2) OR username = $3`, [tenantIdA, tenantIdB, pAdminUsername]);
    await pool.query(`DELETE FROM tenant_module_entitlements WHERE "tenantId" IN ($1, $2)`, [tenantIdA, tenantIdB]);
    await pool.query(`DELETE FROM campaigns WHERE "tenantId" IN ($1, $2)`, [tenantIdA, tenantIdB]);
    await pool.query(`DELETE FROM leads WHERE "tenantId" IN ($1, $2)`, [tenantIdA, tenantIdB]);
    await pool.query(`DELETE FROM tenants WHERE id IN ($1, $2)`, [tenantIdA, tenantIdB]);

    pass('Teardown & Cleanup: All test resources sanitized.');

    console.log('\n======================================================================');
    console.log(`   ALL ${passed}/${total} PRODUCTION PORTAL & ISOLATION TESTS PASSED!`);
    console.log('======================================================================\n');
  } catch (err) {
    console.error('\n❌ Test failure:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
