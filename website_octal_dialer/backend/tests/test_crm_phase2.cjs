/**
 * Automated Test Suite: Phase 2 CRM Complete Verification
 *
 * Tests:
 * 1. Meetings subtab querying & filtering
 * 2. Client Work Items lifecycle (Create -> Update -> Completed -> Scoping)
 * 3. Pricing Rules configuration (Owner allowed, Agent denied 403)
 * 4. Quote Calculator with role-based discount ceilings (Agent 10%, Lead 25%, Owner 100%)
 * 5. Quote creation with frozen line items snapshot & status transitions
 * 6. Task general update & Lead CRM fields update
 * 7. CRM Performance Dashboard (KPI calculation scoped by role)
 * 8. Cross-entity Global Search
 */

const BASE_URL = process.env.SERVER_URL || 'http://localhost:5000';

console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('PHASE 2 CRM COMPLETE VERIFICATION TEST SUITE');
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

  console.log('--- 0. Setup: Authenticate Platform Admin, Provision Tenant & Users ---');
  const superLogin = await api('/api/auth/login', null, {
    method: 'POST',
    body: JSON.stringify({ username: 'admin', password: 'AdminPassword1234!' })
  });
  assert(superLogin.ok, 'SuperAdmin login succeeded');
  const superToken = superLogin.body.token;

  // Provision Tenant
  const provRes = await api('/api/super-admin/provision', superToken, {
    method: 'POST',
    body: JSON.stringify({
      name: `Apex CRM Corp ${suffix}`,
      username: `owner_${suffix}`,
      password: 'OwnerPassword1234!',
      email: `owner_${suffix}@testcorp.io`
    })
  });
  assert(provRes.status === 201, 'Tenant provisioned successfully');
  const tenantId = provRes.body.tenantId;

  // Login Owner
  const ownerLogin = await api('/api/auth/login', null, {
    method: 'POST',
    body: JSON.stringify({ username: `owner_${suffix}`, password: 'OwnerPassword1234!' })
  });
  assert(ownerLogin.ok, 'Company Owner logged in');
  const ownerToken = ownerLogin.body.token;
  const ownerId = ownerLogin.body.user.id;

  // Create Team Alpha
  const teamRes = await api('/api/admin/teams', ownerToken, {
    method: 'POST',
    body: JSON.stringify({ name: `Alpha Sales ${suffix}`, description: 'Outbound sales team' })
  });
  const teamAlphaId = teamRes.body?.team?.id || teamRes.body?.id;

  // Create Team Lead user
  const leadUserRes = await api('/api/admin/users', ownerToken, {
    method: 'POST',
    body: JSON.stringify({
      username: `lead_${suffix}`,
      displayName: 'Lead Larry',
      email: `lead_${suffix}@test.com`,
      password: 'Password1234!',
      role: 'team_lead',
      teamId: teamAlphaId,
      modules: { crm: true, dialer: true }
    })
  });
  const leadUserId = leadUserRes.body?.user?.id || leadUserRes.body?.id;

  // Create Member Agent user
  const agentUserRes = await api('/api/admin/users', ownerToken, {
    method: 'POST',
    body: JSON.stringify({
      username: `agent_${suffix}`,
      displayName: 'Agent Alice',
      email: `agent_${suffix}@test.com`,
      password: 'Password1234!',
      role: 'agent',
      teamId: teamAlphaId,
      modules: { crm: true, dialer: true }
    })
  });
  const agentUserId = agentUserRes.body?.user?.id || agentUserRes.body?.id;

  // Login Team Lead & Member
  const leadLogin = await api('/api/auth/login', null, {
    method: 'POST',
    body: JSON.stringify({ username: `lead_${suffix}`, password: 'Password1234!' })
  });
  const leadToken = leadLogin.body.token;

  const agentLogin = await api('/api/auth/login', null, {
    method: 'POST',
    body: JSON.stringify({ username: `agent_${suffix}`, password: 'Password1234!' })
  });
  const agentToken = agentLogin.body.token;

  // 1. Create a Company & Contact for testing
  console.log('\n--- 1. Seed CRM Company & Contact ---');
  const compRes = await api('/api/crm/companies', ownerToken, {
    method: 'POST',
    body: JSON.stringify({
      name: `Acme Corp ${suffix}`,
      industry: 'SaaS & Telephony',
      country: 'United States',
      phone: '+14155550199',
      email: `contact@acme${suffix}.com`,
      status: 'Active',
      paymentStatus: 'Paying',
      assignedUserId: agentUserId
    })
  });
  assert(compRes.ok, 'Company created');
  const companyId = compRes.body.company.id;

  const contactRes = await api('/api/crm/contacts', ownerToken, {
    method: 'POST',
    body: JSON.stringify({
      crmCompanyId: companyId,
      name: 'John Doe',
      email: 'john@acme.com',
      phone: '+14155550188',
      roleTitle: 'VP Technology',
      assignedUserId: agentUserId
    })
  });
  assert(contactRes.ok, 'Contact created');
  const contactId = contactRes.body.contact.id;

  // 2. CRM Meetings subtab
  console.log('\n--- 2. CRM Meetings Subtab ---');
  const meetingTaskRes = await api('/api/crm/tasks', agentToken, {
    method: 'POST',
    body: JSON.stringify({
      title: 'Quarterly Commercial Review',
      taskType: 'meeting',
      crmCompanyId: companyId,
      contactId: contactId,
      dueAt: new Date(Date.now() + 3600000).toISOString(),
      priority: 'high',
      assignedUserId: agentUserId
    })
  });
  assert(meetingTaskRes.ok, 'Meeting task created via CRM tasks engine');

  const regularTaskRes = await api('/api/crm/tasks', agentToken, {
    method: 'POST',
    body: JSON.stringify({
      title: 'Regular phone callback',
      taskType: 'call',
      crmCompanyId: companyId,
      contactId: contactId,
      dueAt: new Date(Date.now() + 7200000).toISOString(),
      priority: 'medium',
      assignedUserId: agentUserId
    })
  });
  assert(regularTaskRes.ok, 'Regular call task created');

  const meetingsRes = await api('/api/crm/meetings', agentToken);
  assert(meetingsRes.ok && meetingsRes.body.meetings.length >= 1, 'GET /api/crm/meetings returns meeting tasks');
  const allAreMeetings = meetingsRes.body.meetings.every(m => m.taskType === 'meeting' || m.taskType === 'online_meeting');
  assert(allAreMeetings, 'Meetings tab strictly filters for meeting/online_meeting taskTypes only');
  assert(meetingsRes.body.meetings[0].companyName === `Acme Corp ${suffix}`, 'Meetings join company name');

  // 3. Client Work Items (Deliverables, Tickets & Projects)
  console.log('\n--- 3. Client Work Items Tracking ---');
  const createWorkRes = await api('/api/crm/work-items', agentToken, {
    method: 'POST',
    body: JSON.stringify({
      title: 'Configure Dedicated SIP Trunk',
      description: 'Setup private trunk and verify audio codecs',
      category: 'Implementation',
      priority: 'high',
      status: 'TODO',
      crmCompanyId: companyId,
      contactId: contactId,
      assignedUserId: agentUserId,
      dueAt: new Date(Date.now() + 86400000).toISOString()
    })
  });
  assert(createWorkRes.ok, 'POST /api/crm/work-items creates work item');
  const workItemId = createWorkRes.body.workItem.id;

  const getWorkRes = await api('/api/crm/work-items', agentToken);
  assert(getWorkRes.ok && getWorkRes.body.workItems.length >= 1, 'GET /api/crm/work-items returns list');

  const updateWorkRes = await api(`/api/crm/work-items/${workItemId}`, agentToken, {
    method: 'PUT',
    body: JSON.stringify({
      status: 'COMPLETED',
      priority: 'critical'
    })
  });
  assert(updateWorkRes.ok, 'PUT /api/crm/work-items/:id updates status');
  assert(updateWorkRes.body.workItem.status === 'COMPLETED', 'Work item marked as COMPLETED');
  assert(!!updateWorkRes.body.workItem.completedAt, 'completedAt auto-stamped on completion');

  // 4. Sales Pricing Rules & Role-based Discount Policies
  console.log('\n--- 4. Sales Pricing Rules & Role Ceilings ---');
  const rulesRes = await api('/api/crm/pricing-rules', agentToken);
  assert(rulesRes.ok, 'GET /api/crm/pricing-rules accessible to agents');
  assert(rulesRes.body.pricingRules.agentMaxDiscountPct === 10, 'Default Agent max discount is 10%');
  assert(rulesRes.body.pricingRules.teamLeadMaxDiscountPct === 25, 'Default Team Lead max discount is 25%');

  // Agent tries to modify pricing rules -> Must be 403 Forbidden!
  const agentUpdateRules = await api('/api/crm/pricing-rules', agentToken, {
    method: 'PUT',
    body: JSON.stringify({ agentMaxDiscountPct: 50 })
  });
  assert(agentUpdateRules.status === 403, 'Agent is strictly forbidden (403) from editing pricing rules');

  // Owner modifies pricing rules -> Allowed
  const ownerUpdateRules = await api('/api/crm/pricing-rules', ownerToken, {
    method: 'PUT',
    body: JSON.stringify({
      taxRate: 5.0,
      agentMaxDiscountPct: 15.0,
      teamLeadMaxDiscountPct: 30.0
    })
  });
  assert(ownerUpdateRules.ok, 'Owner can successfully update pricing rules');
  assert(ownerUpdateRules.body.pricingRules.agentMaxDiscountPct === 15, 'Updated agent discount ceiling reflected');

  // 5. Price Calculator & Quote Generation
  console.log('\n--- 5. Quote Calculator & Discount Ceiling Enforcement ---');
  // Agent requests 25% discount when their ceiling is 15% -> Must return 400!
  const calcExcessiveDiscount = await api('/api/crm/quotes/calculate', agentToken, {
    method: 'POST',
    body: JSON.stringify({
      packageId: 'pkg_pro',
      userCount: 5,
      billingCycle: 'monthly',
      discountPct: 25
    })
  });
  assert(calcExcessiveDiscount.status === 400, 'Quote Calculator rejects discount exceeding caller role ceiling (400)');

  // Agent requests 10% discount -> Allowed
  const calcValid = await api('/api/crm/quotes/calculate', agentToken, {
    method: 'POST',
    body: JSON.stringify({
      packageId: 'pkg_pro',
      userCount: 12, // 10 included, 2 extra seats ($15/ea = $30) -> Base $129 + $30 = $159
      billingCycle: 'monthly',
      discountPct: 10,
      selectedAddons: [{ addonId: 'addon_phone', quantity: 2 }] // 2 * $5 = $10 -> Subtotal = $169
    })
  });
  assert(calcValid.ok, 'Quote Calculator successfully computes valid quote');
  assert(calcValid.body.subtotal === 169, `Subtotal correct: expected 169, got ${calcValid.body.subtotal}`);
  assert(calcValid.body.discountAmount === 16.9, `Discount correct: expected 16.9, got ${calcValid.body.discountAmount}`);

  // Create Quote & Verify Frozen Snapshots
  console.log('\n--- 6. Frozen Quote Snapshot & Status Lifecycle ---');
  const createQuoteRes = await api('/api/crm/quotes', agentToken, {
    method: 'POST',
    body: JSON.stringify({
      crmCompanyId: companyId,
      contactId: contactId,
      packageId: 'pkg_pro',
      userCount: 12,
      billingCycle: 'monthly',
      discountPct: 10,
      selectedAddons: [{ addonId: 'addon_phone', quantity: 2 }],
      notes: 'Initial 1-year contract proposal'
    })
  });
  assert(createQuoteRes.ok, 'POST /api/crm/quotes creates quote snapshot');
  const quoteId = createQuoteRes.body.quote.id;
  assert(createQuoteRes.body.quote.quoteNumber.startsWith('QTE-'), 'Quote number generated with QTE- prefix');
  assert(createQuoteRes.body.items.length >= 3, 'Frozen line items saved in crm_quote_items (package, seats, addon)');

  // Transition Quote Status
  const sendQuoteRes = await api(`/api/crm/quotes/${quoteId}/status`, agentToken, {
    method: 'PUT',
    body: JSON.stringify({ status: 'SENT' })
  });
  assert(sendQuoteRes.ok && sendQuoteRes.body.quote.status === 'SENT', 'Quote status updated to SENT');

  const acceptQuoteRes = await api(`/api/crm/quotes/${quoteId}/status`, agentToken, {
    method: 'PUT',
    body: JSON.stringify({ status: 'ACCEPTED' })
  });
  assert(acceptQuoteRes.ok && acceptQuoteRes.body.quote.status === 'ACCEPTED', 'Quote status updated to ACCEPTED');

  // 7. General Task & Lead CRM Updates
  console.log('\n--- 7. General Task & Lead CRM Field Updates ---');
  const taskUpdateRes = await api(`/api/crm/tasks/${meetingsRes.body.meetings[0].id}`, agentToken, {
    method: 'PUT',
    body: JSON.stringify({
      title: 'Updated Commercial Strategy Review',
      priority: 'critical'
    })
  });
  assert(taskUpdateRes.ok && taskUpdateRes.body.task.title === 'Updated Commercial Strategy Review', 'PUT /api/crm/tasks/:id updates task');

  // Create and update a lead
  const createLeadRes = await api('/api/crm/leads', ownerToken, {
    method: 'POST',
    body: JSON.stringify({
      name: `Prospect Bob ${suffix}`,
      phone: '+18005559988',
      email: `bob@prospect${suffix}.com`,
      crmCompanyId: companyId,
      contactId: contactId,
      assignedTo: agentUserId
    })
  });
  assert(createLeadRes.ok, 'Lead created with CRM links');
  const leadId = createLeadRes.body.lead.id;

  const updateLeadRes = await api(`/api/crm/leads/${leadId}`, agentToken, {
    method: 'PUT',
    body: JSON.stringify({
      requirement: 'Wants 50 AI VoIP seats and custom integration',
      status: 'QUALIFIED'
    })
  });
  if (!updateLeadRes.ok) {
    console.error('DEBUG updateLeadRes error:', updateLeadRes.status, updateLeadRes.body);
  }
  assert(updateLeadRes.ok && updateLeadRes.body?.lead?.requirement?.includes('50 AI VoIP seats'), 'PUT /api/crm/leads/:id updates CRM fields');

  // 8. Performance Dashboard (Real KPIs)
  console.log('\n--- 8. CRM Performance Dashboard ---');
  const perfOwnerRes = await api('/api/crm/performance', ownerToken);
  assert(perfOwnerRes.ok, 'GET /api/crm/performance returns 200 for Owner');
  assert(perfOwnerRes.body.isOwner === true, 'Owner perspective identified');
  assert(perfOwnerRes.body.agentBreakdown.length >= 1, 'Owner gets company-wide agent breakdown');
  assert(perfOwnerRes.body.summary.totalQuotesWon >= 1, 'Summary calculates quotes won');
  assert(perfOwnerRes.body.summary.totalWorkCompleted >= 1, 'Summary calculates work items completed');

  const perfMemberRes = await api('/api/crm/performance', agentToken);
  assert(perfMemberRes.ok, 'GET /api/crm/performance returns 200 for Member Agent');
  assert(perfMemberRes.body.agentBreakdown.length === 0, 'Member Agent does NOT see other agents breakdown (Strict Privacy)');

  // 9. Global CRM Search
  console.log('\n--- 9. Global CRM Search ---');
  const searchRes = await api(`/api/crm/search?q=Acme`, agentToken);
  assert(searchRes.ok, 'GET /api/crm/search returns 200');
  assert(searchRes.body.results.length >= 1, 'Global search finds Acme entities');
  const hasCompany = searchRes.body.results.some(r => r.type === 'company');
  assert(hasCompany, 'Search indexed and returned Company');

  const searchQuoteRes = await api(`/api/crm/search?q=QTE-`, agentToken);
  assert(searchQuoteRes.ok && searchQuoteRes.body.results.some(r => r.type === 'quote'), 'Search indexed and returned Quote');

  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log(`PHASE 2 TEST RESULTS: ${passedTests} / ${totalTests} PASSED`);
  if (passedTests === totalTests) {
    console.log('🎉 ALL PHASE 2 CRM COMPLETION ACCEPTANCE TESTS PASSED SUCCESSFULLY!');
  } else {
    console.error(`⚠️ ${totalTests - passedTests} TESTS FAILED.`);
    process.exit(1);
  }
  console.log('═══════════════════════════════════════════════════════════════════════════\n');
}

runTests().catch(err => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});