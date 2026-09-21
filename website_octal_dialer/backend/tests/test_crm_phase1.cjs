/**
 * Automated Test Suite: Phase 1 CRM Verification
 *
 * Uses authoritative login via /api/auth/login and /api/super-admin/provision.
 *
 * Verifies:
 * 1. Health & Server Connectivity
 * 2. Tenant Isolation across CRM Companies, Contacts, Tasks, Notes, Timeline, Overview
 * 3. 4-Tier Role Scoping: Company Owner vs Member Agent across Teams
 * 4. Task Lifecycle: Create -> Reschedule -> Close with Chained Follow-up -> Cancel
 * 5. Canonical Lead Integration: Lead created via CRM is dialer-compatible and links to company
 * 6. Dialer Regression: Key dialer endpoints remain intact and functional
 */

const BASE_URL = process.env.SERVER_URL || 'http://localhost:5000';

console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('PHASE 1 CRM VERIFICATION TEST SUITE');
console.log(`Target Server: ${BASE_URL}`);
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

async function api(path, token, options = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
  const res = await fetch(url, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) }
  });
  let body = null;
  try {
    body = await res.json();
  } catch {}
  return { status: res.status, ok: res.ok, body };
}

async function runTests() {
  const suffix = Date.now();

  console.log('--- 0. Authenticate & Provision Test Tenants ---');
  // 1. Log in as SuperAdmin
  const superLogin = await api('/api/auth/login', null, {
    method: 'POST',
    body: JSON.stringify({ username: 'admin', password: 'AdminPassword1234!' })
  });
  assert(superLogin.status === 200 && !!superLogin.body?.token, 'Platform SuperAdmin logs in successfully');
  const superToken = superLogin.body.token;

  // 2. Provision Tenant A
  const provA = await api('/api/super-admin/provision', superToken, {
    method: 'POST',
    body: JSON.stringify({
      name: `Apex CRM Corp A ${suffix}`,
      username: `crm_owner_a_${suffix}`,
      password: 'OwnerPassword1234!',
      email: `crm_owner_a_${suffix}@testcorp.io`
    })
  });
  assert(provA.status === 201, 'Provision Tenant A');
  const tenantAId = provA.body.tenantId;
  const ownerAUsername = provA.body.username;

  // 3. Provision Tenant B
  const provB = await api('/api/super-admin/provision', superToken, {
    method: 'POST',
    body: JSON.stringify({
      name: `Apex CRM Corp B ${suffix}`,
      username: `crm_owner_b_${suffix}`,
      password: 'OwnerPassword1234!',
      email: `crm_owner_b_${suffix}@testcorp.io`
    })
  });
  assert(provB.status === 201, 'Provision Tenant B');
  const tenantBId = provB.body.tenantId;
  const ownerBUsername = provB.body.username;

  // 4. Authenticate Owner A
  const ownerALogin = await api('/api/auth/login', null, {
    method: 'POST',
    body: JSON.stringify({ username: ownerAUsername, password: 'OwnerPassword1234!' })
  });
  assert(ownerALogin.status === 200, 'Company Owner A authenticated');
  const tokenOwnerA = ownerALogin.body.token;

  // 5. Authenticate Owner B
  const ownerBLogin = await api('/api/auth/login', null, {
    method: 'POST',
    body: JSON.stringify({ username: ownerBUsername, password: 'OwnerPassword1234!' })
  });
  assert(ownerBLogin.status === 200, 'Company Owner B authenticated');
  const tokenOwnerB = ownerBLogin.body.token;

  // 6. Create Team Alpha and Member A in Tenant A
  const teamAlphaRes = await api('/api/admin/teams', tokenOwnerA, {
    method: 'POST',
    body: JSON.stringify({ name: `Team Alpha ${suffix}`, description: 'Enterprise Sales' })
  });
  const teamAlphaId = teamAlphaRes.body?.team?.id || teamAlphaRes.body?.id;

  const memberARes = await api('/api/admin/users', tokenOwnerA, {
    method: 'POST',
    body: JSON.stringify({
      username: `member_a_${suffix}`,
      displayName: 'Agent Alice',
      password: 'MemberPassword123!',
      role: 'agent',
      teamId: teamAlphaId,
      modules: { crm: true, dialer: true }
    })
  });
  assert(memberARes.status === 200 || memberARes.status === 201, 'Create Member Agent A in Team Alpha');
  const memberAId = memberARes.body?.user?.id || memberARes.body?.id;

  // Member A Login
  const memberALogin = await api('/api/auth/login', null, {
    method: 'POST',
    body: JSON.stringify({ username: `member_a_${suffix}`, password: 'MemberPassword123!' })
  });
  assert(memberALogin.status === 200, 'Member Agent A authenticated');
  const tokenMemberA = memberALogin.body.token;

  // 7. Create Team Beta and Member B in Tenant A
  const teamBetaRes = await api('/api/admin/teams', tokenOwnerA, {
    method: 'POST',
    body: JSON.stringify({ name: `Team Beta ${suffix}`, description: 'Field Ops' })
  });
  const teamBetaId = teamBetaRes.body?.team?.id || teamBetaRes.body?.id;

  const memberBRes = await api('/api/admin/users', tokenOwnerA, {
    method: 'POST',
    body: JSON.stringify({
      username: `member_b_${suffix}`,
      displayName: 'Agent Bob',
      password: 'MemberPassword123!',
      role: 'agent',
      teamId: teamBetaId,
      modules: { crm: true, dialer: true }
    })
  });
  assert(memberBRes.status === 200 || memberBRes.status === 201, 'Create Member Agent B in Team Beta');

  // Member B Login
  const memberBLogin = await api('/api/auth/login', null, {
    method: 'POST',
    body: JSON.stringify({ username: `member_b_${suffix}`, password: 'MemberPassword123!' })
  });
  assert(memberBLogin.status === 200, 'Member Agent B authenticated');
  const tokenMemberB = memberBLogin.body.token;

  console.log('\n--- 1. Health & CRM Overview Initialization ---');
  const overviewRes = await api('/api/crm/overview?range=30d', tokenOwnerA);
  assert(overviewRes.status === 200, 'CRM Overview endpoint returns 200 OK', JSON.stringify(overviewRes.body));
  assert(overviewRes.body?.metrics !== undefined, 'CRM Overview metrics object present');

  console.log('\n--- 2. Client Company CRUD & Tenant Scoping ---');
  // Tenant A creates company
  const compRes = await api('/api/crm/companies', tokenOwnerA, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Titanium Logistics Ltd',
      industry: 'Freight & Supply Chain',
      country: 'United Kingdom',
      phone: '+44 20 7946 0990',
      email: 'ops@titaniumlogistics.co.uk',
      website: 'https://titaniumlogistics.co.uk',
      status: 'active',
      paymentStatus: 'pending',
      initialContact: {
        name: 'Arthur Pendelton',
        roleTitle: 'Operations Director',
        email: 'arthur@titaniumlogistics.co.uk',
        phone: '+44 7911 123456'
      },
      initialNote: 'Acquired via cold outreach; logistics automation review'
    })
  });

  assert(compRes.status === 200 || compRes.status === 201, 'Company Owner creates client company with initial contact and note', JSON.stringify(compRes.body));
  const companyAId = compRes.body?.company?.id;
  assert(!!companyAId, 'Created company has valid ID');

  // Tenant B attempts to read Tenant A's company
  const compBGet = await api(`/api/crm/companies/${companyAId}`, tokenOwnerB);
  assert(compBGet.status === 404, 'Tenant B receives 404 attempting to access Tenant A company');

  // Tenant B queries company list
  const compBList = await api('/api/crm/companies', tokenOwnerB);
  const leakedToB = compBList.body?.companies?.some(c => c.id === companyAId);
  assert(!leakedToB, 'Tenant B company list does NOT contain Tenant A company (Strict Tenant Isolation)');

  console.log('\n--- 3. Client Contacts & Company Association ---');
  // Add another contact to company
  const contRes = await api('/api/crm/contacts', tokenOwnerA, {
    method: 'POST',
    body: JSON.stringify({
      crmCompanyId: companyAId,
      name: 'Eleanor Vance',
      roleTitle: 'Procurement Specialist',
      email: 'eleanor@titaniumlogistics.co.uk',
      phone: '+44 7911 654321'
    })
  });
  assert(contRes.status === 200 || contRes.status === 201, 'Creates secondary contact linked to company');
  const contactAId = contRes.body?.contact?.id;

  // Retrieve company profile with enriched relationships
  const compDetailRes = await api(`/api/crm/companies/${companyAId}`, tokenOwnerA);
  assert(compDetailRes.status === 200, 'Company profile retrieved successfully');
  assert(compDetailRes.body?.contacts?.length >= 2, 'Company profile contains both primary and secondary contacts');
  assert(compDetailRes.body?.notes?.length >= 1, 'Company profile includes initial onboarding note');

  console.log('\n--- 4. Canonical Leads Integration with CRM ---');
  // Create lead linked to company
  const leadRes = await api('/api/crm/leads', tokenOwnerA, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Titanium Fleet HQ',
      phone: '+44 20 7946 0888',
      email: 'fleet@titaniumlogistics.co.uk',
      country: 'United Kingdom',
      requirement: 'Fleet telemetry & automated dialer dispatch integration',
      crmCompanyId: companyAId
    })
  });
  assert(leadRes.status === 200 || leadRes.status === 201, 'Creates canonical lead linked to CRM company', JSON.stringify(leadRes.body));
  const leadId = leadRes.body?.lead?.id;

  // Verify lead profile endpoint
  const leadProfileRes = await api(`/api/crm/leads/${leadId}/profile`, tokenOwnerA);
  assert(leadProfileRes.status === 200, 'Lead profile endpoint returns 200 OK');
  assert(leadProfileRes.body?.lead?.crmCompanyId === companyAId, 'Lead authoritative profile confirms CRM Company linkage');
  assert(leadProfileRes.body?.lead?.crmCompanyName === 'Titanium Logistics Ltd', 'Lead authoritative profile returns company name');

  console.log('\n--- 5. Task Lifecycle & Role Scoping ---');
  // Owner creates a task assigned to Member A
  const taskCreateRes = await api('/api/crm/tasks', tokenOwnerA, {
    method: 'POST',
    body: JSON.stringify({
      title: 'Initial Discovery Call',
      description: 'Review logistics dispatch volume',
      taskType: 'call',
      priority: 'high',
      dueAt: new Date(Date.now() + 86400000).toISOString(),
      crmCompanyId: companyAId,
      contactId: contactAId,
      leadId: leadId,
      assignedUserId: memberAId,
      assignedTeamId: teamAlphaId
    })
  });
  assert(taskCreateRes.status === 200 || taskCreateRes.status === 201, 'Creates task with multi-entity association and assignee', JSON.stringify(taskCreateRes.body));
  const taskId = taskCreateRes.body?.task?.id;

  // Verify Member A can see task
  const memberTasks = await api('/api/crm/tasks', tokenMemberA);
  const memberCanSeeTask = memberTasks.body?.tasks?.some(t => t.id === taskId);
  assert(memberCanSeeTask, 'Assigned Member A can view their assigned task');

  // Verify Member B in team_beta CANNOT see task (Strict Member role scoping)
  const memberBTasks = await api('/api/crm/tasks', tokenMemberB);
  const memberBCanSeeTask = memberBTasks.body?.tasks?.some(t => t.id === taskId);
  assert(!memberBCanSeeTask, 'Unassigned Member B in team_beta cannot see task assigned to Member A (Strict Role Scoping)');

  // Reschedule Task
  const newDue = new Date(Date.now() + 172800000).toISOString();
  const reschedRes = await api(`/api/crm/tasks/${taskId}/reschedule`, tokenMemberA, {
    method: 'POST',
    body: JSON.stringify({
      newDueAt: newDue,
      taskType: 'meeting',
      remarks: 'Client requested zoom meeting instead of quick call'
    })
  });
  assert(reschedRes.status === 200, 'Member reschedules task successfully');
  assert(reschedRes.body?.task?.taskType === 'meeting', 'Task type updated to meeting');

  // Close Task with Chained Next Task
  const closeRes = await api(`/api/crm/tasks/${taskId}/close`, tokenMemberA, {
    method: 'POST',
    body: JSON.stringify({
      outcome: 'Completed',
      outcomeRemarks: 'Great discussion; client agreed to proceed with proposal',
      nextTask: {
        title: 'Send Enterprise Contract Proposal',
        taskType: 'email',
        dueAt: new Date(Date.now() + 259200000).toISOString(),
        priority: 'urgent',
        assignedUserId: memberAId
      }
    })
  });
  assert(closeRes.status === 200, 'Close task endpoint returns 200 OK');
  assert(closeRes.body?.task?.status === 'completed', 'Initial task marked completed');
  assert(closeRes.body?.nextTask !== undefined, 'Chained next task created automatically');
  const chainedTaskId = closeRes.body?.nextTask?.id;

  // Cancel Chained Task
  const cancelRes = await api(`/api/crm/tasks/${chainedTaskId}/cancel`, tokenMemberA, {
    method: 'POST',
    body: JSON.stringify({
      cancellationReason: 'Client called in to sign on the spot; proposal superseded'
    })
  });
  assert(cancelRes.status === 200, 'Cancel task endpoint marks task as cancelled');
  assert(cancelRes.body?.task?.status === 'cancelled', 'Chained task status is cancelled');

  console.log('\n--- 6. Unified Activity Stream & Notes ---');
  const timelineRes = await api('/api/crm/timeline?limit=20', tokenOwnerA);
  assert(timelineRes.status === 200, 'Timeline endpoint returns 200 OK');
  const itemCount = (timelineRes.body?.items || timelineRes.body?.timeline || []).length;
  assert(itemCount >= 2, 'Timeline aggregates notes, closed tasks, and rescheduled events', `Count: ${itemCount}`);

  console.log('\n--- 7. Dialer & Telephony Regression Check ---');
  // Check that campaigns endpoint still works
  const campRes = await api('/api/campaigns', tokenOwnerA);
  assert(campRes.status === 200, 'Core dialer campaigns endpoint remains functional and untouched');

  // Check that canonical leads queue still works
  const leadsQueueRes = await api('/api/leads?limit=10', tokenOwnerA);
  assert(leadsQueueRes.status === 200, 'Core dialer leads endpoint remains functional and untouched');

  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log(`TEST RESULTS: ${passedTests} / ${totalTests} PASSED`);
  if (passedTests === totalTests) {
    console.log('🎉 ALL PHASE 1 CRM ACCEPTANCE TESTS PASSED SUCCESSFULLY!');
  } else {
    console.error('❌ SOME TESTS FAILED.');
    process.exit(1);
  }
  console.log('═══════════════════════════════════════════════════════════════════════════\n');
}

runTests().catch(err => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
