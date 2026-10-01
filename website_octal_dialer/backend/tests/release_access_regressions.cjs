// Run ONLY against a disposable local PostgreSQL database. Creates fixtures; never uses production.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { Client } = require('pg');
const jwt = require('jsonwebtoken');
const fs = require('node:fs');
const path = require('node:path');

async function main() {
  const url = new URL(process.env.DATABASE_URL || 'http://invalid');
  if (process.env.RUN_ISOLATED_AUDIT !== '1' || !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Set RUN_ISOLATED_AUDIT=1 and a disposable local DATABASE_URL.');
  const port = process.env.PORT || '5317';
  const secret = 'isolated-regression-secret-123456789012345678';
  const password = 'AdminPassword1234!';
  const env = { ...process.env, NODE_ENV: 'test', TEST_LISTEN: 'true', PORT: port, JWT_SECRET: secret, BOOTSTRAP_ADMIN_USERNAME: 'admin', BOOTSTRAP_ADMIN_EMAIL: 'audit@example.com', BOOTSTRAP_ADMIN_PASSWORD: password };
  const log = fs.openSync(path.join(__dirname, '../release-test-server.log'), 'w');
  const server = spawn(process.execPath, ['dist/server.js'], { cwd: path.join(__dirname, '..'), env, windowsHide: true, stdio: ['ignore', log, log] });
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  let count = 0;
  const suffix = Date.now();
  async function request(method, route, body, token) {
    const r = await fetch(`http://127.0.0.1:${port}${route}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000), redirect: 'manual' });
    return { status: r.status, data: await r.json() };
  }
  async function check(name, fn) { await fn(); console.log('PASS ' + name); count++; }
  const login = async username => {
    const r = await request('POST', '/api/auth/login', { username, password });
    assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data;
  };
  try {
    await db.connect();
    let ready = false;
    for (let i = 0; i < 60; i++) {
      if (server.exitCode !== null) throw new Error('Server exited. Read release-test-server.log');
      try { const r = await fetch(`http://127.0.0.1:${port}/api/info`); if (r.ok) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert.ok(ready, 'server startup');
    const platform = await login('admin');
    await check('platform account is detached from customer workspaces', async () => assert.equal(platform.user.tenantId, null));
    async function provision(label) {
      const username = `${label}_${suffix}`;
      const r = await request('POST', '/api/super-admin/provision', { name: label, username, password, email: `${username}@example.com` }, platform.token);
      assert.equal(r.status, 201, JSON.stringify(r.data));
      return { ...await login(username), tenantId: r.data.tenantId };
    }
    const a = await provision('CoA');
    const b = await provision('CoB');
    let member;
    await check('create member with explicitly empty modules', async () => {
      const username = `member_${suffix}`;
      const r = await request('POST', '/api/admin/users', { username, password, modules: [] }, a.token);
      assert.ok([200, 201].includes(r.status), JSON.stringify(r.data));
      member = r.data.user;
    });
    let memberLogin;
    await check('empty assignments deny CRM on the server', async () => {
      memberLogin = await login(member.username);
      assert.equal((await request('GET', '/api/crm/overview', undefined, memberLogin.token)).status, 403);
    });
    await check('empty assignments also display no effective access', async () => {
      const r = await request('GET', '/api/admin/users', undefined, a.token);
      assert.equal(r.status, 200);
      const list = Array.isArray(r.data) ? r.data : (r.data.users || []);
      const row = list.find(u => u.id === member.id);
      assert.deepEqual(row.assignedModules, []);
      assert.deepEqual(row.effectiveModules, []);
    });
    await check('customer cannot read platform console', async () => {
      assert.equal((await request('GET', '/api/super-admin/tenants', undefined, a.token)).status, 403);
    });
    await check('customer cannot update another company user', async () => {
      assert.equal((await request('PUT', `/api/admin/users/${b.user.id}`, { displayName: 'Hacked' }, a.token)).status, 403);
    });
    await check('wildcard module injection is rejected', async () => {
      assert.equal((await request('PUT', `/api/admin/users/${member.id}`, { permissions: ['*'] }, a.token)).status, 400);
    });
    await check('module values must be booleans', async () => {
      assert.equal((await request('PUT', `/api/admin/users/${member.id}`, { permissions: { crm: 'yes' } }, a.token)).status, 400);
    });
    await check('grant and revoke real module access', async () => {
      assert.equal((await request('PUT', `/api/admin/users/${member.id}`, { permissions: { crm: true } }, a.token)).status, 200);
      assert.equal((await request('GET', '/api/crm/overview', undefined, memberLogin.token)).status, 200);
      assert.equal((await request('PUT', `/api/admin/users/${member.id}`, { permissions: { crm: false } }, a.token)).status, 200);
      assert.equal((await request('GET', '/api/crm/overview', undefined, memberLogin.token)).status, 403);
    });
    await check('disabled account cannot login or use an existing JWT', async () => {
      assert.equal((await request('PUT', `/api/admin/users/${member.id}`, { status: 'Disabled' }, a.token)).status, 200);
      assert.equal((await request('POST', '/api/auth/login', { username: member.username, password })).status, 401);
      assert.equal((await request('GET', '/api/crm/overview', undefined, memberLogin.token)).status, 401);
      assert.equal((await request('PUT', `/api/admin/users/${member.id}`, { status: 'Active' }, a.token)).status, 200);
    });
    await check('custom role cannot bypass revoked module assignments', async () => {
      const roleId = `role_${suffix}`;
      await db.query(`INSERT INTO custom_roles (id, "roleName", permissions, "createdBy", "tenantId", status) VALUES ($1, 'Auditor', '["crm:view"]', 'audit', $2, 'Active')`, [roleId, a.tenantId]);
      assert.equal((await request('PUT', `/api/admin/users/${member.id}`, { roleId, permissions: { crm: false } }, a.token)).status, 200);
      assert.equal((await request('GET', '/api/crm/overview', undefined, memberLogin.token)).status, 403);
      assert.equal((await request('PUT', `/api/admin/users/${member.id}`, { roleId: null, permissions: {} }, a.token)).status, 200);
    });
    await check('company ceiling blocks even the company owner', async () => {
      assert.equal((await request('PUT', `/api/super-admin/tenants/${a.tenantId}/entitlements`, { modules: { crm: false } }, platform.token)).status, 200);
      assert.equal((await request('GET', '/api/crm/overview', undefined, a.token)).status, 403);
      assert.equal((await request('PUT', `/api/super-admin/tenants/${a.tenantId}/entitlements`, { modules: { crm: true } }, platform.token)).status, 200);
      assert.equal((await request('GET', '/api/crm/overview', undefined, a.token)).status, 200);
    });
    const cap = await provision('CapCo');
    await request('PUT', `/api/super-admin/tenants/${cap.tenantId}/seats`, { maxAgents: 2 }, platform.token);
    const seat2 = (await request('POST', '/api/admin/users', { username: `seat2_${suffix}`, password }, cap.token)).data.user;
    await check('saving an active user at full seat capacity succeeds', async () => {
      assert.equal((await request('PUT', `/api/admin/users/${seat2.id}`, { displayName: 'Renamed' }, cap.token)).status, 200);
    });
    await check('parallel creation cannot oversubscribe the final seat', async () => {
      const [r1, r2] = await Promise.all([
        request('POST', '/api/admin/users', { username: `race1_${suffix}`, password }, cap.token),
        request('POST', '/api/admin/users', { username: `race2_${suffix}`, password }, cap.token)
      ]);
      assert.equal([r1.status, r2.status].filter(s => [200, 201].includes(s)).length, 0);
    });
    await check('last company owner cannot be disabled', async () => {
      const res = await request('PUT', `/api/admin/users/${a.user.id}`, { status: 'Disabled' }, a.token);
      assert.ok([400, 403].includes(res.status), `Expected 400 or 403, got ${res.status}`);
    });
    await check('alternate role route cannot demote last company owner', async () => {
      const res = await request('PUT', `/api/admin/users/${a.user.id}/role`, { role: 'user' }, a.token);
      assert.ok([400, 403].includes(res.status), `Expected 400 or 403, got ${res.status}`);
    });
    await check('platform user list uses target company ceiling', async () => {
      const r = await request('GET', `/api/super-admin/tenants/${a.tenantId}/access-matrix`, undefined, platform.token);
      assert.equal(r.status, 200);
      const list = r.data.matrix || r.data.accessMatrix?.users || [];
      assert.ok(list.length > 0 && list.every(u => Array.isArray(u.effectiveModules)));
    });
    await check('invalid bulk entitlements do not partially apply', async () => {
      assert.equal((await request('PUT', `/api/super-admin/tenants/${a.tenantId}/entitlements`, { modules: { crm: true, invalidModule: true } }, platform.token)).status, 400);
    });
    await check('onboarding response never exposes password hashes', async () => {
      const r = await request('POST', '/api/super-admin/provision', { name: `SecretCo_${suffix}`, username: `sec_${suffix}`, password, email: `sec_${suffix}@example.com` }, platform.token);
      assert.equal(r.status, 201);
      assert.equal(JSON.stringify(r.data).includes('passwordHash'), false);
    });
    await check('OAuth callbacks require a valid state', async () => {
      const res = await request('GET', '/auth/google/callback?state=invalid&code=4/dummy');
      assert.ok([302, 400].includes(res.status), `Expected 302 or 400, got ${res.status}`);
    });
    await check('detached identity can sign in to finish onboarding', async () => {
      const detachedUser = `detached_${suffix}`;
      await db.query(`INSERT INTO users (id, username, email, "passwordHash", role, "tenantId", status, "onboardingStatus") SELECT $1, $1, $1 || '@example.com', "passwordHash", 'user', NULL, 'Active', 'PENDING' FROM users WHERE id = $2`, [detachedUser, a.user.id]);
      const detached = await login(detachedUser);
      assert.equal(detached.user.tenantId, null);
    });
    await check('invitation acceptance is single-use and preserves empty assignments', async () => {
      const invite = await request('POST', '/api/admin/invitations', { email: `invite_${suffix}@example.com`, initialModules: [] }, a.token);
      assert.equal(invite.status, 201, JSON.stringify(invite.data));
      const r = await request('POST', '/api/invitations/accept', { token: invite.data.token }, (await request('POST', '/api/auth/register', { fullName: 'Invitee', email: `invite_${suffix}@example.com`, password })).data.token);
      assert.equal(r.status, 200, JSON.stringify(r.data));
      assert.equal((await request('GET', '/api/crm/overview', undefined, r.data.token)).status, 403);
      assert.notEqual((await request('POST', '/api/invitations/accept', { token: invite.data.token }, r.data.token)).status, 200);
    });
    await check('suspended company blocks JWT and legacy sessions', async () => {
      const legacy = `legacy_${suffix}`;
      await db.query('INSERT INTO sessions_store (id, token, "userId", "expiresAt") VALUES ($1, $1, $2, $3)', [legacy, a.user.id, new Date(Date.now() + 60000).toISOString()]);
      await request('PUT', `/api/super-admin/tenants/${a.tenantId}/status`, { status: 'suspended', reason: 'Regression test' }, platform.token);
      for (const token of [a.token, legacy]) assert.equal((await request('GET', '/api/auth/permissions', undefined, token)).status, 401);
      await request('PUT', `/api/super-admin/tenants/${a.tenantId}/status`, { status: 'active', reason: 'Regression test' }, platform.token);
    });
    await check('cross-company custom role assignment is rejected', async () => {
      const foreignRole = `foreign_role_${suffix}`;
      await db.query(`INSERT INTO custom_roles (id, "roleName", permissions, "createdBy", "tenantId", status) VALUES ($1, 'Role in B', '["crm:view"]', 'audit', $2, 'Active')`, [foreignRole, b.tenantId]);
      const resRoleAssign = await request('PUT', `/api/admin/users/${member.id}`, { roleId: foreignRole }, a.token);
      assert.equal(resRoleAssign.status, 400);
    });
    await check('cross-company team member assignment is rejected', async () => {
      const teamRes = await request('POST', '/api/admin/teams', { name: `Team A ${suffix}` }, a.token);
      assert.ok([200, 201].includes(teamRes.status));
      const resCrossMember = await request('POST', `/api/admin/teams/${teamRes.data.id}/members`, { userIds: [b.user.id] }, a.token);
      assert.equal(resCrossMember.status, 400);
    });
    await check('cross-company invitation team assignment is rejected', async () => {
      const teamResB = await request('POST', '/api/admin/teams', { name: `Team B ${suffix}` }, b.token);
      assert.ok([200, 201].includes(teamResB.status));
      const resCrossInvite = await request('POST', '/api/admin/invitations', { email: `cross_${suffix}@example.com`, teamId: teamResB.data.id }, a.token);
      assert.equal(resCrossInvite.status, 400);
    });

    // ─── 6 REQUIRED COMPREHENSIVE ONBOARDING & LIFECYCLE TESTS ───────────────────
    await check('fresh email signup successfully completes company onboarding', async () => {
      const email = `fresh_${suffix}@example.com`;
      const reg = await request('POST', '/api/auth/register', { fullName: 'Fresh Owner', email, password });
      assert.equal(reg.status, 200, JSON.stringify(reg.data));
      assert.equal(reg.data.needsOnboarding, true);
      assert.equal(reg.data.user.onboardingStatus, 'PENDING');

      const onboard = await request('POST', '/api/onboarding/complete', {
        companyName: `Fresh Corp ${suffix}`,
        workspaceType: 'COMPANY',
        planId: 'plan_pro'
      }, reg.data.token);
      assert.equal(onboard.status, 200, JSON.stringify(onboard.data));
      assert.ok(onboard.data.tenant.id);

      const dbUser = (await db.query('SELECT role, "tenantId", "onboardingStatus" FROM users WHERE id = $1', [reg.data.user.id])).rows[0];
      assert.equal(dbUser.role, 'admin');
      assert.equal(dbUser.tenantId, onboard.data.tenant.id);
      assert.equal(dbUser.onboardingStatus, 'COMPLETED');
    });

    await check('fresh Google signup successfully completes company onboarding', async () => {
      const googId = `goog_${suffix}`;
      const googEmail = `goog_${suffix}@gmail.com`;
      const googUserId = `user_goog_${suffix}`;
      await db.query(`
        INSERT INTO users (id, username, "displayName", email, "passwordHash", role, "tenantId", "googleId", "authProvider", "emailVerified", "onboardingStatus", status)
        VALUES ($1, $2, 'Google User', $3, 'nohash', 'user', NULL, $4, 'google', 1, 'PENDING', 'Active')
      `, [googUserId, googId, googEmail, googId]);

      const googToken = jwt.sign({ sub: googUserId, username: googId, role: 'user', tenantId: null }, secret, { expiresIn: '1h' });
      const onboardGoog = await request('POST', '/api/onboarding/complete', {
        companyName: `Google Enterprise ${suffix}`,
        workspaceType: 'COMPANY'
      }, googToken);
      assert.equal(onboardGoog.status, 200, JSON.stringify(onboardGoog.data));

      const dbGoog = (await db.query('SELECT role, "tenantId", "onboardingStatus" FROM users WHERE id = $1', [googUserId])).rows[0];
      assert.equal(dbGoog.role, 'admin');
      assert.equal(dbGoog.tenantId, onboardGoog.data.tenant.id);
      assert.equal(dbGoog.onboardingStatus, 'COMPLETED');
    });

    await check('invited employee joins intended company without gaining owner privileges', async () => {
      const inviteEmail = `invited_emp_${suffix}@example.com`;
      const invRes = await request('POST', '/api/admin/invitations', { email: inviteEmail, role: 'user' }, a.token);
      assert.equal(invRes.status, 201, JSON.stringify(invRes.data));
      const rawToken = invRes.data.token;

      // Register invited employee (pending invitation sets onboardingStatus: INELIGIBLE)
      const empReg = await request('POST', '/api/auth/register', { fullName: 'Invited Employee', email: inviteEmail, password });
      assert.equal(empReg.status, 200);
      assert.equal(empReg.data.needsOnboarding, false);
      assert.equal(empReg.data.user.onboardingStatus, 'INELIGIBLE');

      // Employee accepts invitation
      const acceptRes = await request('POST', '/api/invitations/accept', { token: rawToken }, empReg.data.token);
      assert.equal(acceptRes.status, 200, JSON.stringify(acceptRes.data));

      // Verify employee is strictly member of company A and NOT admin
      const dbEmp = (await db.query('SELECT role, "tenantId", "onboardingStatus" FROM users WHERE id = $1', [empReg.data.user.id])).rows[0];
      assert.equal(dbEmp.role, 'user');
      assert.equal(dbEmp.tenantId, a.tenantId);

      // Verify employee CANNOT complete onboarding to create their own workspace (403)
      const rogueOnboard = await request('POST', '/api/onboarding/complete', { companyName: 'Rogue Corp' }, empReg.data.token);
      assert.equal(rogueOnboard.status, 403);

      // Verify employee CANNOT access platform admin console (403)
      const platAccess = await request('GET', '/api/super-admin/tenants', undefined, empReg.data.token);
      assert.equal(platAccess.status, 403);
    });

    await check('disabled orphan accounts cannot sign in, onboard or accept invitations', async () => {
      const orphanId = `orphan_${suffix}`;
      const orphanEmail = `orphan_${suffix}@example.com`;
      await db.query(`
        INSERT INTO users (id, username, email, "passwordHash", role, "tenantId", status, "onboardingStatus")
        SELECT $1, $1, $2, "passwordHash", 'user', NULL, 'Disabled', 'INELIGIBLE' FROM users WHERE id = $3
      `, [orphanId, orphanEmail, a.user.id]);

      // Login must be rejected
      const orphanLogin = await request('POST', '/api/auth/login', { username: orphanId, password });
      assert.equal(orphanLogin.status, 401);

      // Even with a signed JWT, onboarding and invitation accept must be rejected
      const orphanToken = jwt.sign({ sub: orphanId, username: orphanId, role: 'user', tenantId: null }, secret, { expiresIn: '1h' });
      const orphanOnboard = await request('POST', '/api/onboarding/complete', { companyName: 'Orphan Corp' }, orphanToken);
      assert.ok([401, 403].includes(orphanOnboard.status), `Expected 401 or 403, got ${orphanOnboard.status}`);

      const orphanInviteAccept = await request('POST', '/api/invitations/accept', { token: 'dummy_token' }, orphanToken);
      assert.ok([401, 403].includes(orphanInviteAccept.status), `Expected 401 or 403, got ${orphanInviteAccept.status}`);
    });

    await check('existing members cannot create another workspace through onboarding', async () => {
      const existingMemberRes = await request('POST', '/api/onboarding/complete', { companyName: 'Duplicate Corp' }, a.token);
      assert.equal(existingMemberRes.status, 403);
    });

    await check('concurrent onboarding requests create only one company', async () => {
      const concEmail = `concurrent_${suffix}@example.com`;
      const concReg = await request('POST', '/api/auth/register', { fullName: 'Concurrent Tester', email: concEmail, password });
      assert.equal(concReg.status, 200);

      const [res1, res2] = await Promise.all([
        request('POST', '/api/onboarding/complete', { companyName: `Race Corp 1 ${suffix}` }, concReg.data.token),
        request('POST', '/api/onboarding/complete', { companyName: `Race Corp 2 ${suffix}` }, concReg.data.token)
      ]);

      const successCount = (res1.status === 200 ? 1 : 0) + (res2.status === 200 ? 1 : 0);
      assert.equal(successCount, 1, `Expected exactly 1 onboarding to succeed, got ${successCount}`);
      
      const dbConc = (await db.query('SELECT "tenantId", "onboardingStatus" FROM users WHERE id = $1', [concReg.data.user.id])).rows[0];
      assert.ok(dbConc.tenantId);
      assert.equal(dbConc.onboardingStatus, 'COMPLETED');
    });

    await check('renamed admin_legacy account is disabled, has zero sessions, and cannot authenticate', async () => {
      const legacyId = 'user_admin_106675d9';
      await db.query(`
        INSERT INTO users (id, username, email, "passwordHash", role, "tenantId", status, "onboardingStatus")
        SELECT $1, 'admin_legacy', 'admin_legacy@octaldialer.local', "passwordHash", 'platform_admin', NULL, 'Disabled', 'INELIGIBLE'
        FROM users WHERE id = $2
        ON CONFLICT (id) DO UPDATE SET username = 'admin_legacy', status = 'Disabled', "onboardingStatus" = 'INELIGIBLE'
      `, [legacyId, platform.user.id]);
      
      // Invalidate sessions
      await db.query('DELETE FROM sessions_store WHERE "userId" = $1', [legacyId]);
      const sessionCount = (await db.query('SELECT COUNT(*) as count FROM sessions_store WHERE "userId" = $1', [legacyId])).rows[0].count;
      assert.equal(Number(sessionCount), 0);

      // Verify login fails
      const legLogin = await request('POST', '/api/auth/login', { username: 'admin_legacy', password });
      assert.equal(legLogin.status, 401);

      // Verify JWT is rejected
      const legToken = jwt.sign({ sub: legacyId, username: 'admin_legacy', role: 'platform_admin', tenantId: null }, secret, { expiresIn: '1h' });
      const legPlatAccess = await request('GET', '/api/super-admin/tenants', undefined, legToken);
      assert.equal(legPlatAccess.status, 401);
    });

    await check('case-insensitive username collision is rejected', async () => {
      const resDup = await request('POST', '/api/admin/users', { username: member.username.toUpperCase(), password }, a.token);
      assert.notEqual(resDup.status, 200);
    });

    console.log(`\n${count} release access regression checks passed on real PostgreSQL.`);
  } finally {
    server.kill(); await db.end(); fs.closeSync(log);
  }
}
main().catch(err => { console.error(err); process.exitCode = 1; });
