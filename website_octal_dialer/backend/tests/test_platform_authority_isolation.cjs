/**
 * tests/test_platform_authority_isolation.cjs
 * Comprehensive Automated Regression Suite for Platform Authority & Customer Tenant Isolation.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const http = require('http');
const assert = require('assert');
const { dbAdapter: db } = require('../dist/db/dbAdapter.js');

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

const get = (path, token) => request('GET', path, null, token);
const post = (path, body, token) => request('POST', path, body, token);
const put = (path, body, token) => request('PUT', path, body, token);
const patch = (path, body, token) => request('PATCH', path, body, token);
const del = (path, token) => request('DELETE', path, null, token);

async function runTests() {
  await db.init();
  console.log('=== ZESTIFY PLATFORM AUTHORITY & TENANT ISOLATION REGRESSION SUITE ===\n');

  // 1. Authenticate Platform Admin
  console.log('[TEST 1] Authenticating Platform Admin...');
  const superRes = await post('/api/auth/login', { username: 'admin', password: 'AdminPassword1234!' });
  assert.strictEqual(superRes.status, 200, 'Platform Admin login must succeed');
  const superToken = superRes.data.token;
  const platformAdminUser = superRes.data.user;
  assert.ok(superToken, 'Platform Admin token must exist');
  assert.strictEqual(platformAdminUser.role, 'platform_admin', 'Role must be platform_admin');
  assert.strictEqual(platformAdminUser.tenantId, null, 'Platform Admin tenantId MUST be null (detached from tenants)');
  console.log('✓ Platform Admin authenticated and verified detached (tenantId: null).\n');

  // 2. Provision Isolated Customer Tenant
  console.log('[TEST 2] Provisioning customer tenant with Company Owner...');
  const suffix = Date.now();
  const provRes = await post('/api/super-admin/provision', {
    name: `Aegis Corp ${suffix}`,
    username: `aegis_owner_${suffix}`,
    password: 'OwnerPassword123!',
    email: `aegis_${suffix}@corp.io`
  }, superToken);
  assert.strictEqual(provRes.status, 201, 'Customer tenant provisioning must succeed');
  const tenantId = provRes.data.tenantId;
  const ownerUsername = provRes.data.username;
  console.log(`✓ Provisioned tenant ${tenantId} with owner ${ownerUsername}.\n`);

  // 3. Authenticate Company Owner
  console.log('[TEST 3] Authenticating Company Owner...');
  const ownerRes = await post('/api/auth/login', {
    username: ownerUsername,
    password: 'OwnerPassword123!'
  });
  assert.strictEqual(ownerRes.status, 200, 'Company Owner login must succeed');
  const ownerToken = ownerRes.data.token;
  const ownerUser = ownerRes.data.user;
  assert.strictEqual(ownerUser.role, 'admin', 'Company Owner role must be admin');
  assert.strictEqual(ownerUser.tenantId, tenantId, 'Company Owner tenantId must match provisioned tenant');
  console.log('✓ Company Owner authenticated within tenant boundary.\n');

  // 4. Verify Seat Quota - Platform Admin Does NOT Consume Customer Seats
  console.log('[TEST 4] Verifying seat accounting isolates platform roles...');
  const seatRes = await get(`/api/super-admin/tenants/${tenantId}/detail`, superToken);
  assert.strictEqual(seatRes.status, 200);
  const activeSeats = seatRes.data.detail?.organization?.totalUsers;
  assert.strictEqual(activeSeats, 1, 'Only the Company Owner consumes 1 seat; platform admin consumes 0');
  console.log('✓ Verified: Platform Admin does not consume customer seats.\n');

  // 5. Customer Owner CANNOT See Platform Admin in Customer User Directory
  console.log('[TEST 5] Verifying customer user directory excludes platform roles...');
  const usersRes = await get('/api/admin/users', ownerToken);
  assert.strictEqual(usersRes.status, 200);
  const usersList = usersRes.data.users || usersRes.data;
  const hasPlatformAdmin = usersList.some(u => u.role === 'platform_admin' || u.id === platformAdminUser.id);
  assert.strictEqual(hasPlatformAdmin, false, 'Platform Admin must NEVER appear in customer users list');
  console.log('✓ Verified: Customer user list strictly excludes platform roles.\n');

  // 6. Customer Owner CANNOT Create a Platform Admin
  console.log('[TEST 6] Testing escalation blocking: Customer Owner attempts to create platform_admin...');
  const createPlatformUserRes = await post('/api/admin/users', {
    username: `rogue_admin_${suffix}`,
    displayName: 'Rogue Admin',
    password: 'Password123!',
    role: 'platform_admin'
  }, ownerToken);
  assert.strictEqual(createPlatformUserRes.status, 403, 'Must reject platform_admin creation with 403');
  console.log('✓ Verified: Customer Owner cannot create platform_admin accounts.\n');

  // 7. Customer Owner CANNOT Mutate, Reset Password, or Delete Platform Admin
  console.log('[TEST 7] Testing mutation protection: Customer Owner attempts to target Platform Admin...');
  const putRes = await put(`/api/admin/users/${platformAdminUser.id}`, { displayName: 'Hacked Admin' }, ownerToken);
  assert.strictEqual(putRes.status, 403, 'Must reject modifying platform admin through customer API with 403');

  const pwRes = await post(`/api/admin/users/${platformAdminUser.id}/password`, { newPassword: 'HackedPassword123!' }, ownerToken);
  assert.strictEqual(pwRes.status, 403, 'Must reject resetting platform admin password through customer API with 403');

  const delRes = await del(`/api/admin/users/${platformAdminUser.id}`, ownerToken);
  assert.strictEqual(delRes.status, 403, 'Must reject deleting platform admin through customer API with 403');
  console.log('✓ Verified: Platform Admin cannot be updated, password-reset, or deleted via customer APIs.\n');

  // 8. Create Customer Member and Verify Customer Owner CANNOT Promote to Platform Admin
  console.log('[TEST 8] Customer Owner attempts to promote customer agent to platform_admin...');
  const createAgentRes = await post('/api/admin/users', {
    username: `agent_${suffix}`,
    displayName: 'Regular Agent',
    password: 'Password123!',
    role: 'agent'
  }, ownerToken);
  assert.ok(createAgentRes.status === 200 || createAgentRes.status === 201, 'Customer agent creation should succeed');
  const agentId = createAgentRes.data.user?.id || createAgentRes.data.id;

  const promoteRes = await put(`/api/admin/users/${agentId}`, { role: 'platform_admin' }, ownerToken);
  assert.strictEqual(promoteRes.status, 403, 'Must reject promotion to platform_admin with 403');
  console.log('✓ Verified: Customer Owner cannot promote members to platform roles.\n');

  // 9. Verify Platform Admin CANNOT Be Assigned to Customer Leads
  console.log('[TEST 9] Attempting to assign customer lead to Platform Admin...');
  const campaignId = `camp_${suffix}`;
  const leadId = `lead_${suffix}`;
  const now = new Date().toISOString();
  await db.execute(`
    INSERT INTO campaigns (id, name, "fileName", "leadCount", "tenantId", "createdAt")
    VALUES ($1, $2, 'test.csv', 1, $3, $4)
  `, [campaignId, 'Isolation Campaign', tenantId, now]);

  await db.execute(`
    INSERT INTO leads (id, name, phone, status, "campaignId", "tenantId", "createdAt")
    VALUES ($1, $2, '5550199281', 'PENDING', $3, $4, $5)
  `, [leadId, 'Test Isolation Lead', campaignId, tenantId, now]);

  const assignPlatformRes = await patch(`/api/leads/${leadId}`, { assignedTo: platformAdminUser.id }, ownerToken);
  assert.strictEqual(assignPlatformRes.status, 400, 'Must reject assigning lead to Platform Admin');
  assert.ok(assignPlatformRes.data.error.includes('platform administrator') || assignPlatformRes.data.error.includes('Invalid assigned user'), 'Rejection error message must be specific');
  console.log('✓ Verified: Platform Admin cannot be assigned to customer leads.\n');

  // 10. Verify Platform Admin CANNOT Be Assigned to Customer CRM Tasks
  console.log('[TEST 10] Attempting to assign CRM Task to Platform Admin...');
  const assignTaskRes = await post('/api/crm/tasks', {
    title: 'Customer Task for Admin',
    leadId: leadId,
    assignedUserId: platformAdminUser.id,
    dueAt: new Date().toISOString()
  }, ownerToken);
  assert.strictEqual(assignTaskRes.status, 400, 'Must reject assigning task to Platform Admin');
  assert.ok(assignTaskRes.data.error.includes('platform administrator') || assignTaskRes.data.error.includes('Invalid assigned user'), 'Rejection error message must be specific');
  console.log('✓ Verified: Platform Admin cannot be assigned to customer CRM tasks.\n');

  // 11. Security Enforcement: Reassigned Lead Cannot Be Dispositioned by Former Callers
  console.log('[TEST 11] Verifying historical disposition guard for reassigned leads...');
  const { canDispositionLead } = require('../dist/databaseManager.js');
  const reassignedLead = {
    id: leadId,
    tenantId: tenantId,
    assignedTo: agentId
  };
  // Former caller (e.g. past agent) attempts to disposition lead reassigned to another agent
  const formerCaller = { id: 'former_caller_id_999', role: 'agent', tenantId };
  const dispositionAllowed = await canDispositionLead(formerCaller, reassignedLead, tenantId);
  assert.strictEqual(dispositionAllowed, false, 'Former caller must NOT be permitted to disposition lead reassigned to another agent');

  // Currently assigned agent CAN disposition
  const currentAgent = { id: agentId, role: 'agent', tenantId };
  const assigneeAllowed = await canDispositionLead(currentAgent, reassignedLead, tenantId);
  assert.strictEqual(assigneeAllowed, true, 'Currently assigned agent MUST be permitted to disposition lead');
  console.log('✓ Verified: Historical call disposition fallback safely blocks former callers from modifying reassigned leads.\n');

  console.log('======================================================================');
  console.log('🏆 ALL 11 PLATFORM AUTHORITY & TENANT ISOLATION TESTS PASSED (100%)');
  console.log('======================================================================');
}

runTests().catch(err => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
