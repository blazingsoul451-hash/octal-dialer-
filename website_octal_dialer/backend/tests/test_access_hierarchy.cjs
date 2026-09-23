const http = require('http');
const assert = require('assert');

const BASE_PORT = process.env.PORT || 5000;

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = {
      'Content-Type': 'application/json'
    };
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

const get = (path, token) => request('GET', path, null, token);
const post = (path, body, token) => request('POST', path, body, token);
const put = (path, body, token) => request('PUT', path, body, token);

async function runTests() {
  console.log('=== OCTAL / ZESTIFY ACCESS ENTITLEMENT HIERARCHY REGRESSION SUITE ===\n');

  // 1. Authenticate Platform Admin (SuperAdmin)
  console.log('[TEST 1] Logging in as Platform Admin...');
  const superRes = await post('/api/auth/login', { username: 'admin', password: 'AdminPassword1234!' });
  assert.strictEqual(superRes.status, 200, 'SuperAdmin login should succeed');
  const superToken = superRes.data.token;
  assert.ok(superToken, 'SuperAdmin token must exist');
  console.log('? Platform Admin authenticated.\n');

  // 2. Provision Isolated Tenant for Test
  console.log('[TEST 2] Provisioning isolated test tenant...');
  const tenantSuffix = Date.now();
  const provRes = await post('/api/super-admin/provision', {
    name: `Apex Entitlements Corp ${tenantSuffix}`,
    username: `apex_owner_${tenantSuffix}`,
    password: 'OwnerPassword1234!',
    email: `apex_${tenantSuffix}@testcorp.io`
  }, superToken);
  assert.strictEqual(provRes.status, 201, 'Tenant provisioning should succeed with 201');
  const tenantId = provRes.data.tenantId;
  const ownerUsername = provRes.data.username;
  console.log(`? Provisioned tenant ${tenantId} with owner ${ownerUsername}.\n`);

  // 3. Authenticate Company Owner
  console.log('[TEST 3] Authenticating as Company Owner...');
  const ownerRes = await post('/api/auth/login', {
    username: ownerUsername,
    password: 'OwnerPassword1234!'
  });
  assert.strictEqual(ownerRes.status, 200, 'Company Owner login should succeed');
  const ownerToken = ownerRes.data.token;
  console.log('? Company Owner authenticated.\n');

  // 4. Verify Baseline Entitlements
  console.log('[TEST 4] Verifying canonical modules baseline ceiling...');
  const superEntRes = await get(`/api/super-admin/tenants/${tenantId}/entitlements`, superToken);
  assert.strictEqual(superEntRes.status, 200, 'SuperAdmin can fetch tenant entitlements');
  assert.ok(superEntRes.data.entitlements, 'Entitlements map must exist');
  assert.strictEqual(superEntRes.data.entitlements.crm, true, 'CRM should be entitled by default');
  assert.strictEqual(superEntRes.data.entitlements.auto_emailer, true, 'Auto Emailer should be entitled by default');
  assert.strictEqual(superEntRes.data.entitlements.google_scraper, false, 'Google Scraper should be disabled by default');

  const compEntRes = await get('/api/company/entitlements', ownerToken);
  assert.strictEqual(compEntRes.status, 200, 'Company Owner can fetch company platform entitlements');
  assert.strictEqual(compEntRes.data.entitlements.auto_emailer, true, 'Company sees auto_emailer entitled');
  console.log('? Baseline entitlements verified for both Platform Owner and Company Owner.\n');

  // 5. Platform Owner Restricts Company Ceiling (Disables auto_emailer and google_scraper)
  console.log('[TEST 5] Platform Owner lowers ceiling (disables auto_emailer and google_scraper)...');
  const putEntRes = await put(`/api/super-admin/tenants/${tenantId}/entitlements`, {
    entitlements: {
      auto_emailer: false,
      google_scraper: false
    }
  }, superToken);
  assert.strictEqual(putEntRes.status, 200, 'Entitlements update should succeed');
  assert.strictEqual(putEntRes.data.entitlements.auto_emailer, false, 'auto_emailer should be false');
  assert.strictEqual(putEntRes.data.entitlements.google_scraper, false, 'google_scraper should be false');

  const compEntRes2 = await get('/api/company/entitlements', ownerToken);
  assert.strictEqual(compEntRes2.data.entitlements.auto_emailer, false, 'Company Owner sees auto_emailer restricted');
  assert.strictEqual(compEntRes2.data.entitlements.google_scraper, false, 'Company Owner sees google_scraper restricted');
  console.log('? Platform ceiling successfully lowered and verified across company APIs.\n');

  // 6. Security Enforcement: Company Admin attempts to grant restricted module
  console.log('[TEST 6] Testing escalation blocking: Company Admin tries to assign disabled module...');
  const escalateUserRes = await post('/api/admin/users', {
    username: `member_escalate_${tenantSuffix}`,
    displayName: 'Escalation Target Member',
    password: 'MemberPass123!',
    role: 'agent',
    modules: {
      crm: true,
      auto_emailer: true // RESTRICTED BY PLATFORM CEILING
    }
  }, ownerToken);
  assert.strictEqual(escalateUserRes.status, 403, 'Escalation attempt MUST return 403 Forbidden');
  assert.match(escalateUserRes.data.error, /platform entitlements ceiling/i, 'Error message must specify ceiling violation');
  console.log(`? Escalation blocked with 403: "${escalateUserRes.data.error}"\n`);

  // 7. Legitimate User Creation: User granted entitled modules only
  console.log('[TEST 7] Creating legitimate member within platform ceiling...');
  const legitUserRes = await post('/api/admin/users', {
    username: `legit_member_${tenantSuffix}`,
    displayName: 'Legitimate Member',
    password: 'MemberPass123!',
    role: 'agent',
    modules: {
      crm: true,
      dialer: true
    }
  }, ownerToken);
  assert.ok(legitUserRes.status === 200 || legitUserRes.status === 201, 'User creation within ceiling should succeed');
  const legitUserId = legitUserRes.data.user.id;
  console.log(`? Legitimate member created with ID: ${legitUserId}.\n`);

  // 8. Security Enforcement: Company Admin attempts PUT edit with restricted module
  console.log('[TEST 8] Testing escalation blocking via user update PUT /api/admin/users/:id...');
  const editEscalateRes = await put(`/api/admin/users/${legitUserId}`, {
    role: 'agent',
    modules: {
      crm: true,
      google_scraper: true // RESTRICTED BY PLATFORM CEILING
    }
  }, ownerToken);
  assert.strictEqual(editEscalateRes.status, 403, 'Update escalation attempt MUST return 403 Forbidden');
  assert.match(editEscalateRes.data.error, /platform entitlements ceiling/i, 'Error must identify ceiling violation');
  console.log(`? Update escalation blocked with 403: "${editEscalateRes.data.error}"\n`);

  // 9. Security Enforcement: Direct permission grant endpoint
  console.log('[TEST 9] Testing escalation blocking via direct POST /api/admin/permissions...');
  const permEscalateRes = await post('/api/admin/permissions', {
    userId: legitUserId,
    moduleId: 'auto_emailer',
    enabled: true
  }, ownerToken);
  assert.strictEqual(permEscalateRes.status, 403, 'Direct permission escalation MUST return 403 Forbidden');
  console.log('? Direct permission escalation blocked with 403.\n');

  // 10. Platform Admin Protection & Effective Modules Calculation
  console.log('[TEST 10] Verifying customer user list excludes platform admins and computes effective modules...');
  const usersListRes = await get('/api/admin/users', ownerToken);
  assert.strictEqual(usersListRes.status, 200, 'Fetch users should succeed');
  const customerUsers = usersListRes.data;
  assert.ok(Array.isArray(customerUsers), 'Users response must be an array');
  const hasPlatformAdmin = customerUsers.some(u => u.role === 'platform_admin' || u.role === 'master_admin');
  assert.strictEqual(hasPlatformAdmin, false, 'Customer user list must NEVER include platform admins');

  const memberInList = customerUsers.find(u => u.id === legitUserId);
  assert.ok(memberInList, 'Legitimate member must be in user list');
  assert.ok(Array.isArray(memberInList.effectiveModules), 'effectiveModules must be an array');
  assert.ok(memberInList.effectiveModules.includes('crm'), 'Effective modules should contain crm');
  assert.strictEqual(memberInList.effectiveModules.includes('auto_emailer'), false, 'Effective modules must NOT contain auto_emailer');
  console.log('? Customer users list isolated from platform admins and verified effective module calculations.\n');

  // 11. Access Matrix Inspection by Platform Owner
  console.log('[TEST 11] Platform Owner inspecting tenant access matrix...');
  const matrixRes = await get(`/api/super-admin/tenants/${tenantId}/access-matrix`, superToken);
  assert.strictEqual(matrixRes.status, 200, 'SuperAdmin can fetch tenant access matrix');
  assert.ok(matrixRes.data.accessMatrix, 'Access matrix must be present');
  const matrixUsers = matrixRes.data.accessMatrix.users;
  assert.ok(Array.isArray(matrixUsers), 'Matrix users must be an array');
  const ownerInMatrix = matrixUsers.find(u => u.role === 'admin');
  assert.ok(ownerInMatrix, 'Company Owner must be in matrix');
  assert.strictEqual(ownerInMatrix.effectiveModules.includes('auto_emailer'), false, 'Restricted module is NOT effective even for owner');
  console.log('? Authoritative access matrix verified for Platform Owner.\n');

  // 12. Dynamic Platform Elevation: Platform Owner re-enables module
  console.log('[TEST 12] Platform Owner re-enables auto_emailer entitlement...');
  const reEnableRes = await put(`/api/super-admin/tenants/${tenantId}/entitlements`, {
    entitlements: {
      auto_emailer: true
    }
  }, superToken);
  assert.strictEqual(reEnableRes.status, 200, 'Re-enabling module entitlement should succeed');

  // Now Company Owner should be permitted to grant auto_emailer
  const grantAfterElevationRes = await put(`/api/admin/users/${legitUserId}`, {
    role: 'agent',
    modules: {
      crm: true,
      dialer: true,
      auto_emailer: true
    }
  }, ownerToken);
  assert.strictEqual(grantAfterElevationRes.status, 200, 'Granting re-entitled module should now succeed');
  console.log('? Module dynamically re-enabled by Platform Owner and granted by Company Admin successfully.\n');

  console.log('======================================================================');
  console.log('?? ALL 12 ACCESS ENTITLEMENT HIERARCHY TESTS PASSED WITH 100% SUCCESS');
  console.log('======================================================================');
}

runTests().catch(err => {
  console.error('\n? Test Suite Failed:', err);
  process.exit(1);
});
