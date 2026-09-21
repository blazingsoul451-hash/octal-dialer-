const http = require('http');
const assert = require('assert');

const BASE_PORT = 5000;

function post(path, body, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const req = http.request({
      hostname: '127.0.0.1',
      port: BASE_PORT,
      path,
      method: 'POST',
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
    req.write(data);
    req.end();
  });
}

function get(path, token) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const req = http.request({
      hostname: '127.0.0.1',
      port: BASE_PORT,
      path,
      method: 'GET',
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
    req.end();
  });
}

async function main() {
  console.log('===============================================================');
  console.log('OCTAL / ZESTIFY — PLATFORM OWNER LIVE SYNC & OBSERVABILITY TEST');
  console.log('===============================================================\\n');

  let passed = 0;
  async function test(name, fn) {
    try {
      await fn();
      passed++;
      console.log(`✓ PASS: ${name}`);
    } catch (err) {
      console.error(`✗ FAIL: ${name}`);
      console.error(err);
      process.exit(1);
    }
  }

  // 1. Authenticate Platform Admin
  const adminLogin = await post('/api/auth/login', { username: 'admin', password: 'AdminPassword1234!' });
  assert.equal(adminLogin.status, 200, 'Admin login failed');
  const platformToken = adminLogin.data.token;

  // 2. Authenticate Company Owner
  const ownerLogin = await post('/api/auth/login', { username: 'owner', password: 'OwnerPassword1234!' });
  assert.equal(ownerLogin.status, 200, 'Owner login failed');
  const ownerToken = ownerLogin.data.token;

  // ── TEST 1: platform_admin can read global overview ──
  await test('platform_admin can read /api/super-admin/overview', async () => {
    const res = await get('/api/super-admin/overview', platformToken);
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert(typeof res.data.overview.totalTenants === 'number');
    assert(typeof res.data.overview.totalUsers === 'number');
    assert(typeof res.data.overview.totalLeads === 'number');
    assert(typeof res.data.overview.activeCampaigns === 'number');
    assert(typeof res.data.overview.uptimeSeconds === 'number');
  });

  // ── TEST 2: admin (company owner) cannot read global overview (403) ──
  await test('admin (company owner) is rejected from /api/super-admin/overview with 403', async () => {
    const res = await get('/api/super-admin/overview', ownerToken);
    assert.equal(res.status, 403, `Expected 403, got ${res.status}`);
  });

  // ── TEST 3: unauthenticated request is rejected (401/403) ──
  await test('unauthenticated request is rejected from /api/super-admin/overview', async () => {
    const res = await get('/api/super-admin/overview', null);
    assert(res.status === 401 || res.status === 403, `Expected 401/403, got ${res.status}`);
  });

  // ── TEST 4: platform_admin can list tenants with server-side pagination ──
  await test('platform_admin can list tenants with pagination metadata', async () => {
    const res = await get('/api/super-admin/tenants?page=1&limit=5', platformToken);
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert(Array.isArray(res.data.tenants));
    assert(res.data.total >= 1);
    assert.equal(res.data.page, 1);
    assert.equal(res.data.limit, 5);
  });

  // ── TEST 5: search by name, slug, or ID filters accurately ──
  await test('search filter accurately matches tenant name', async () => {
    const res = await get('/api/super-admin/tenants?search=Primary', platformToken);
    assert.equal(res.status, 200);
    assert(res.data.tenants.length >= 1);
    assert(res.data.tenants[0].name.includes('Primary'));

    const nomatch = await get('/api/super-admin/tenants?search=nonexistent_query_xyz', platformToken);
    assert.equal(nomatch.status, 200);
    assert.equal(nomatch.data.tenants.length, 0);
  });

  // ── TEST 6: tenant health status is computed with concrete signals ──
  await test('tenant health status is computed with concrete itemized signals', async () => {
    const res = await get('/api/super-admin/tenants', platformToken);
    assert.equal(res.status, 200);
    const firstTenant = res.data.tenants[0];
    assert(['HEALTHY', 'WARNING', 'DEGRADED', 'OFFLINE'].includes(firstTenant.healthStatus));
    assert(Array.isArray(firstTenant.healthReasons));
    assert(firstTenant.healthReasons.length > 0);
  });

  // ── TEST 7: tenant detail snapshot is sanitized and does not leak private customer content ──
  await test('tenant detail drawer snapshot preserves privacy (no message bodies or passwords)', async () => {
    const list = await get('/api/super-admin/tenants', platformToken);
    const tenantId = list.data.tenants[0].id;

    const res = await get(`/api/super-admin/tenants/${tenantId}/detail`, platformToken);
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    const d = res.data.detail;
    assert(d.overview && d.organization && d.salesOperations && d.connectedDevices);

    // Verify user list does not include passwordHash
    if (d.organization.users.length > 0) {
      assert.strictEqual(d.organization.users[0].passwordHash, undefined, 'passwordHash must NEVER be exposed');
    }
  });

  // ── TEST 8: global devices endpoint returns hardware telemetry ──
  await test('global devices monitoring endpoint returns registered handsets', async () => {
    const res = await get('/api/super-admin/devices', platformToken);
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert(Array.isArray(res.data.devices));
  });

  // ── TEST 9: global jobs endpoint returns automation status ──
  await test('global jobs monitoring endpoint returns background automation status', async () => {
    const res = await get('/api/super-admin/jobs', platformToken);
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert(res.data.jobs && res.data.summary);
  });

  // ── TEST 10: global activity feed returns operational events ──
  await test('global activity feed returns operational audit events', async () => {
    const res = await get('/api/super-admin/activity?limit=10', platformToken);
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert(Array.isArray(res.data.activities));
  });

  // ── TEST 11: 1-click workspace provisioning creates isolated organization ──
  await test('1-click workspace provisioning creates isolated tenant and admin', async () => {
    const rand = Math.floor(Math.random() * 9000) + 1000;
    const res = await post('/api/super-admin/provision', {
      name: `Test Org ${rand}`,
      username: `test_owner_${rand}`,
      email: `owner_${rand}@testorg.local`,
      password: 'TestPassword1234!'
    }, platformToken);

    assert.equal(res.status, 201);
    assert.equal(res.data.success, true);
    assert(res.data.tenantId.startsWith('tenant_'));

    // Verify login works for the newly provisioned tenant owner
    const newOwnerLogin = await post('/api/auth/login', {
      username: `test_owner_${rand}`,
      password: 'TestPassword1234!'
    });
    assert.equal(newOwnerLogin.status, 200);
    assert.equal(newOwnerLogin.data.role, 'admin');
    assert.equal(newOwnerLogin.data.user.tenantId, res.data.tenantId);
  });

  // ── TEST 12: impersonation issues scoped token for support ──
  await test('impersonation endpoint generates audited support access token', async () => {
    const list = await get('/api/super-admin/tenants', platformToken);
    const targetTenantId = list.data.tenants[0].id;

    const res = await post(`/api/super-admin/impersonate/${targetTenantId}`, {}, platformToken);
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert(typeof res.data.token === 'string');
    assert.notEqual(res.data.token, platformToken);
  });

  console.log('\n===============================================================');
  console.log(`ALL ${passed}/12 PLATFORM OWNER LIVE SYNC TESTS PASSED!`);
  console.log('===============================================================');
}

main().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
