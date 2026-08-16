process.env.PORT = '5199';
process.env.NODE_ENV = 'test';

const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs');

async function runAuditTests() {
  console.log('\n========================================================================');
  console.log('🚀 RUNNING COMPREHENSIVE BEHAVIORAL MULTI-TENANT AUDIT SUITE');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  // Import backend modules directly to test in-process DB and auth
  const { db, getUserPermissions, createCampaign, getCampaigns, getLeads, deleteLead, getLogs, reserveLead, releaseLeadLock, updateLogDisposition } = require('./dist/databaseManager');
  const { registerGoogleSignUp, authenticateGoogleSignIn, handleGoogleAuthWithIntent, validateToken } = require('./dist/authManager');
  const { isEmergencyStopped, triggerEmergencyStop, clearEmergencyStop, checkCallAllowed } = require('./dist/safetyController');
  const { createSession, reclaimOrCreateSession, getSessionById, pairPhone, pairAuthenticatedDevice, getSessions } = require('./dist/sessionManager');
  const { io } = require('./dist/server');

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 1: GOOGLE OAUTH INTENT SEPARATION & TENANT ISOLATION
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- [SECTION 1: Google OAuth Intent Separation & Multi-Tenant Provisioning] ---');

    const emailA = `audit_user_a_${Date.now()}@example.com`;
    const googleIdA = `gid_a_${Date.now()}`;
    const emailB = `audit_user_b_${Date.now()}@example.com`;
    const googleIdB = `gid_b_${Date.now()}`;

    // 1.1 Signin for non-existent account must fail with GOOGLE_ACCOUNT_NOT_FOUND
    let signinFailedAsExpected = false;
    try {
      handleGoogleAuthWithIntent({ email: emailA, googleId: googleIdA }, 'signin');
    } catch (err) {
      if (err.code === 'GOOGLE_ACCOUNT_NOT_FOUND') signinFailedAsExpected = true;
    }
    assert(signinFailedAsExpected, 'Google Sign-In fails with GOOGLE_ACCOUNT_NOT_FOUND for non-existent account');

    // 1.2 Signup creates dedicated tenant for Tenant A
    const resA = handleGoogleAuthWithIntent({ email: emailA, googleId: googleIdA, name: 'Alice Org' }, 'signup');
    assert(resA.isNewUser === true, 'Google Sign-Up registers user A as isNewUser: true');
    assert(resA.user.tenantId && resA.user.tenantId.startsWith('tenant_'), 'User A receives unique tenant ID');
    assert(resA.user.tenantId !== 'tenant_default', 'User A tenant is NOT tenant_default');

    // 1.3 Signup creates dedicated tenant for Tenant B
    const resB = handleGoogleAuthWithIntent({ email: emailB, googleId: googleIdB, name: 'Bob Org' }, 'signup');
    assert(resB.user.tenantId !== resA.user.tenantId, 'User B receives distinct tenant ID from User A');

    // 1.4 Signup duplicate fails with GOOGLE_ACCOUNT_ALREADY_EXISTS
    let duplicateSignupFailed = false;
    try {
      handleGoogleAuthWithIntent({ email: emailA, googleId: googleIdA }, 'signup');
    } catch (err) {
      if (err.code === 'GOOGLE_ACCOUNT_ALREADY_EXISTS') duplicateSignupFailed = true;
    }
    assert(duplicateSignupFailed, 'Google Sign-Up fails with GOOGLE_ACCOUNT_ALREADY_EXISTS for existing account');

    // 1.5 Signin succeeds for registered user A
    const signinA = handleGoogleAuthWithIntent({ email: emailA, googleId: googleIdA }, 'signin');
    assert(signinA.token && signinA.user.tenantId === resA.user.tenantId, 'Google Sign-In succeeds for existing user A with same tenant');

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 2: USER MODULE PERMISSIONS & TENANT PROVISIONING
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- [SECTION 2: User Permissions & Entitlement Checks] ---');

    const permsA = getUserPermissions(resA.user.id, resA.user.tenantId);
    assert(permsA['octalDialer'] === true, 'Tenant A provisioned with octalDialer permission');
    assert(permsA['campaigns'] === true, 'Tenant A provisioned with campaigns permission');
    assert(permsA['leads'] === true, 'Tenant A provisioned with leads permission');

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 3: CAMPAIGN & LEAD TENANT ISOLATION
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- [SECTION 3: Campaigns, Leads & Logs Strict Cross-Tenant Isolation] ---');

    const campA = createCampaign('Campaign Alpha', 'leads_a.csv', [
      { name: 'Lead A1', phone: '+12025550101' },
      { name: 'Lead A2', phone: '+12025550102' }
    ], resA.user.tenantId);

    const campB = createCampaign('Campaign Beta', 'leads_b.csv', [
      { name: 'Lead B1', phone: '+12025550201' }
    ], resB.user.tenantId);

    // Tenant A campaigns query
    const listA = getCampaigns(resA.user.tenantId);
    assert(listA.some(c => c.id === campA.campaign.id), 'Tenant A can view Campaign Alpha');
    assert(!listA.some(c => c.id === campB.campaign.id), 'Tenant A CANNOT view Campaign Beta');

    // Tenant B campaigns query
    const listB = getCampaigns(resB.user.tenantId);
    assert(listB.some(c => c.id === campB.campaign.id), 'Tenant B can view Campaign Beta');
    assert(!listB.some(c => c.id === campA.campaign.id), 'Tenant B CANNOT view Campaign Alpha');

    // Tenant A lead query on Tenant B campaign must return empty
    const leadsCross = getLeads(campB.campaign.id, resA.user.tenantId);
    assert(leadsCross.length === 0, 'Tenant A querying Tenant B leads returns 0 leads');

    // Tenant A delete on Tenant B lead must fail
    const bLeadId = getLeads(campB.campaign.id, resB.user.tenantId)[0].id;
    const deleteCrossRes = deleteLead(bLeadId, resA.user.tenantId);
    assert(deleteCrossRes === false, 'Tenant A cannot delete Tenant B lead');

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 4: SAFETY CONTROLLER & EMERGENCY STOP SCOPING
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- [SECTION 4: Safety Controller & Scoped Emergency Stop] ---');

    // Trigger emergency stop for Tenant A only
    triggerEmergencyStop(resA.user.tenantId);
    assert(isEmergencyStopped(resA.user.tenantId) === true, 'Tenant A is marked emergency stopped');
    assert(isEmergencyStopped(resB.user.tenantId) === false, 'Tenant B is NOT affected by Tenant A emergency stop');

    clearEmergencyStop(resA.user.tenantId);
    assert(isEmergencyStopped(resA.user.tenantId) === false, 'Tenant A emergency stop cleared');

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 5: LIVE SOCKET.IO & CALL LIFECYCLE VERIFICATION
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- [SECTION 5: Live Socket Event Handlers & Call Lifecycle] ---');

    // Create Mock Sockets
    class MockSocket extends EventEmitter {
      constructor(id) {
        super();
        this.id = id;
        this.data = {};
        this.rooms = new Set([id]);
      }
      join(room) { this.rooms.add(room); }
      leave(room) { this.rooms.delete(room); }
      to(room) {
        return {
          emit: (event, ...args) => {
            // Forward to registered mock sockets in this room
            for (const sock of allMockSockets) {
              if (sock.id !== this.id && sock.rooms.has(room)) {
                sock.emit(event, ...args);
              }
            }
          }
        };
      }
    }

    const allMockSockets = [];
    function createMockSocket(id) {
      const s = new MockSocket(id);
      allMockSockets.push(s);
      return s;
    }

    // Attach server socket event listener to mock sockets
    // Retrieve connection listener from io
    const connectListeners = io.listeners('connection');
    function initMockSocket(sock) {
      if (io.sockets && io.sockets.sockets) {
        io.sockets.sockets.set(sock.id, sock);
      }
      for (const listener of connectListeners) {
        listener(sock);
      }
    }

    const laptopSockA = createMockSocket('mock_laptop_socket_a');
    initMockSocket(laptopSockA);

    let sessionAData = null;
    laptopSockA.on('session:created', (data) => {
      sessionAData = data;
    });

    laptopSockA.emit('laptop:register', { authToken: resA.token });
    assert(sessionAData && sessionAData.sessionId, 'Laptop A registered and received session ID');

    // Connect Phone Mock Socket A
    const phoneSockA = createMockSocket('mock_phone_socket_a');
    initMockSocket(phoneSockA);

    let phonePairedA = false;
    phoneSockA.on('phone:paired', (data) => {
      phonePairedA = true;
    });

    phoneSockA.emit('phone:join', {
      token: sessionAData.token,
      sessionId: sessionAData.sessionId,
      deviceName: 'Pixel 8 Pro - Alice'
    });

    assert(phonePairedA, 'Phone A paired successfully with Laptop A session');

    // Rogue socket attempting spoofed call:picked-up
    const rogueSock = createMockSocket('mock_rogue_socket');
    initMockSocket(rogueSock);

    rogueSock.emit('call:picked-up', { sessionId: sessionAData.sessionId });
    const sessCheck = getSessionById(sessionAData.sessionId);
    assert(sessCheck.status !== 'CALLING', 'Rogue socket cannot trigger call:picked-up on Session A');

    // Dial lead A1 via Laptop A
    const leadA1 = getLeads(campA.campaign.id, resA.user.tenantId)[0];
    let dialReceivedByPhone = false;
    let receivedCommandId = null;

    phoneSockA.on('phone:dial', (payload) => {
      dialReceivedByPhone = true;
      receivedCommandId = payload.commandId;
    });

    laptopSockA.emit('dial:lead', {
      sessionId: sessionAData.sessionId,
      phone: leadA1.phone,
      name: leadA1.name,
      leadId: leadA1.id,
      campaignId: campA.campaign.id,
      timeout: 30
    });

    assert(dialReceivedByPhone === true, 'Phone A received phone:dial event with commandId');
    assert(receivedCommandId && receivedCommandId.startsWith('cmd_'), 'Valid commandId issued in dial dispatch');

    // Phone A reports call:picked-up
    phoneSockA.emit('call:picked-up', { sessionId: sessionAData.sessionId });
    assert(getSessionById(sessionAData.sessionId).status === 'CALLING', 'Session status updated to CALLING on verified phone pickup');

    // Phone A reports call:ended
    let callFinishedReceivedByLaptop = false;
    laptopSockA.on('call:finished', (data) => {
      if (data.leadId === leadA1.id) {
        callFinishedReceivedByLaptop = true;
      }
    });

    phoneSockA.emit('call:ended', {
      sessionId: sessionAData.sessionId,
      leadId: leadA1.id,
      phone: leadA1.phone,
      name: leadA1.name,
      reason: 'ANSWERED',
      duration: 15,
      commandId: receivedCommandId
    });

    assert(callFinishedReceivedByLaptop === true, 'Laptop A received call:finished event with matching leadId');

    // Save call disposition via updateLogDisposition
    const dispSaved = updateLogDisposition({
      leadId: leadA1.id,
      outcome: 'SALE_CLOSED',
      notes: 'Customer signed contract.',
      tenantId: resA.user.tenantId,
      userId: resA.user.id,
      username: resA.user.username
    });
    assert(dispSaved === true, 'Call disposition saved successfully in Tenant A database');

    const updatedLeadA1 = getLeads(campA.campaign.id, resA.user.tenantId).find(l => l.id === leadA1.id);
    assert(updatedLeadA1.outcome === 'SALE_CLOSED', 'Lead outcome verified as SALE_CLOSED');

  } catch (err) {
    console.error('Audit test exception:', err);
    failed++;
  } finally {
    console.log('\n========================================================================');
    console.log(`AUDIT TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('========================================================================\n');
    process.exit(failed > 0 ? 1 : 0);
  }
}

runAuditTests();
