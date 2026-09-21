/**
 * capture_crm_audit.cjs
 * Comprehensive Automated Visual Audit for Zestify CRM Phase 2
 * Captures role-scoped screenshots for:
 * - Company Owner
 * - Team Lead
 * - Member Agent
 * - Quotes & Pricing Calculator (with role discount ceilings)
 * - Modals & Global Cross-Entity Search
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const BASE_URL = 'http://localhost:5000';
const FRONTEND_URL = 'http://localhost:5173';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const AUDIT_DIR = path.resolve(__dirname, '../../ZESTIFY_CRM_COMPLETION_AUDIT');
const DIRS = {
  owner: path.join(AUDIT_DIR, '01_company_owner'),
  lead: path.join(AUDIT_DIR, '02_team_lead'),
  member: path.join(AUDIT_DIR, '03_member'),
  quotes: path.join(AUDIT_DIR, '04_quotes_and_pricing'),
  modals: path.join(AUDIT_DIR, '05_modals_and_search')
};

// Ensure directories
for (const d of Object.values(DIRS)) {
  fs.mkdirSync(d, { recursive: true });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runAudit() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('STARTING ZESTIFY CRM COMPLETION & ROLE-BASED VISUAL AUDIT');
  console.log('═══════════════════════════════════════════════════════════════════');

  // 1. Authenticate Platform Admin & Provision Dedicated Audit Tenant
  console.log('\n[1/5] Provisioning Audit Tenant & Seeding Multi-Role Users...');
  const suffix = Date.now();
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'AdminPassword1234!' })
  });
  const adminData = await loginRes.json();
  const superToken = adminData.token;

  const tenantName = `Zestify Enterprise ${suffix}`;
  const provRes = await fetch(`${BASE_URL}/api/super-admin/provision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superToken}` },
    body: JSON.stringify({
      name: tenantName,
      username: `owner_${suffix}`,
      password: 'OwnerPassword1234!',
      email: `owner_${suffix}@zestifyaudit.com`
    })
  });
  const provData = await provRes.json();
  const tenantId = provData.tenantId;

  // Login Owner
  const ownerLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: `owner_${suffix}`, password: 'OwnerPassword1234!' })
  });
  const ownerAuth = await ownerLoginRes.json();
  const ownerToken = ownerAuth.token;
  const ownerUser = ownerAuth.user;

  // Create Team Alpha
  const teamRes = await fetch(`${BASE_URL}/api/admin/teams`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ownerToken}` },
    body: JSON.stringify({ name: 'Alpha Sales Team', description: 'Enterprise Outbound & Inbound Accounts' })
  });
  const teamAlpha = await teamRes.json();
  const teamId = teamAlpha.team?.id || teamAlpha.id;

  // Create Team Lead in Team Alpha
  const leadRes = await fetch(`${BASE_URL}/api/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ownerToken}` },
    body: JSON.stringify({
      username: `lead_${suffix}`,
      displayName: 'Lead Larry',
      email: `lead_${suffix}@zestifyaudit.com`,
      password: 'Password1234!',
      role: 'team_lead',
      teamId: teamId,
      modules: { crm: true, dialer: true, campaigns: true }
    })
  });
  const leadData = await leadRes.json();

  const leadLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: `lead_${suffix}`, password: 'Password1234!' })
  });
  const leadAuth = await leadLoginRes.json();
  const leadToken = leadAuth.token;
  const leadUser = leadAuth.user;

  // Create Member Agent in Team Alpha
  const memberRes = await fetch(`${BASE_URL}/api/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ownerToken}` },
    body: JSON.stringify({
      username: `agent_${suffix}`,
      displayName: 'Agent Alice',
      email: `agent_${suffix}@zestifyaudit.com`,
      password: 'Password1234!',
      role: 'agent',
      teamId: teamId,
      modules: { crm: true, dialer: true, campaigns: true }
    })
  });
  const memberData = await memberRes.json();

  const memberLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: `agent_${suffix}`, password: 'Password1234!' })
  });
  const memberAuth = await memberLoginRes.json();
  const memberToken = memberAuth.token;
  const memberUser = memberAuth.user;

  console.log(`  Tenant ID: ${tenantId}`);
  console.log(`  Owner: ${ownerUser.username} (${ownerUser.email})`);
  console.log(`  Team Lead: ${leadUser.username} (${leadUser.email})`);
  console.log(`  Member Agent: ${memberUser.username} (${memberUser.email})`);

  // 2. Seed Rich Data for the Audit Tenant
  console.log('\n[2/5] Seeding Rich CRM Companies, Contacts, Leads, Tasks, Work Items & Quotes...');

  // Companies
  const companiesData = [
    { name: 'Apex Global Telecom', industry: 'Telecommunications', country: 'United States', status: 'client', paymentStatus: 'paid', website: 'https://apextelecom.com' },
    { name: 'Meridian Logistics Group', industry: 'Supply Chain & Freight', country: 'United Kingdom', status: 'client', paymentStatus: 'due_soon', website: 'https://meridianlogistics.co.uk' },
    { name: 'Nexa Cloud Solutions', industry: 'Cloud Computing & SaaS', country: 'Germany', status: 'lead', paymentStatus: 'pending', website: 'https://nexacloud.de' },
    { name: 'Vertex Financial Partners', industry: 'FinTech & Capital Markets', country: 'Switzerland', status: 'client', paymentStatus: 'overdue', website: 'https://vertexpartners.ch' },
    { name: 'Helios Media & Interactive', industry: 'Digital Media & AdTech', country: 'Singapore', status: 'partner', paymentStatus: 'paid', website: 'https://heliosinteractive.sg' }
  ];

  const seededCompanies = [];
  for (const c of companiesData) {
    const res = await fetch(`${BASE_URL}/api/crm/companies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ownerToken}` },
      body: JSON.stringify(c)
    });
    const json = await res.json();
    seededCompanies.push(json.company);
  }

  // Contacts
  const contactsData = [
    { name: 'Alexander Vance', email: 'avance@apextelecom.com', phone: '+14155550199', roleTitle: 'Chief Technology Officer', crmCompanyId: seededCompanies[0].id, assignedUserId: memberUser.id },
    { name: 'Sophia Chen', email: 'schen@apextelecom.com', phone: '+14155550188', roleTitle: 'Director of Telecom Operations', crmCompanyId: seededCompanies[0].id, assignedUserId: leadUser.id },
    { name: 'Marcus Sterling', email: 'msterling@meridianlogistics.co.uk', phone: '+442079460912', roleTitle: 'VP of Global Logistics', crmCompanyId: seededCompanies[1].id, assignedUserId: leadUser.id },
    { name: 'Elena Rostova', email: 'erostova@nexacloud.de', phone: '+493012345678', roleTitle: 'Head of Infrastructure Architecture', crmCompanyId: seededCompanies[2].id, assignedUserId: memberUser.id },
    { name: 'Lucas Dubois', email: 'ldubois@vertexpartners.ch', phone: '+41223456789', roleTitle: 'Managing Director & Partner', crmCompanyId: seededCompanies[3].id, assignedUserId: ownerUser.id },
    { name: 'Kavita Rao', email: 'krao@heliosinteractive.sg', phone: '+6567890123', roleTitle: 'Chief Revenue Officer', crmCompanyId: seededCompanies[4].id, assignedUserId: memberUser.id }
  ];

  const seededContacts = [];
  for (const ct of contactsData) {
    const res = await fetch(`${BASE_URL}/api/crm/contacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ownerToken}` },
      body: JSON.stringify(ct)
    });
    const json = await res.json();
    seededContacts.push(json.contact);
  }

  // Canonical Leads
  const leadsData = [
    { name: 'Apex Primary Trunk Expansion', phone: '+14155550199', status: 'WON', crmCompanyId: seededCompanies[0].id, contactId: seededContacts[0].id, assignedTo: memberUser.id, requirement: '100 Concurrent Channels SIP Trunking' },
    { name: 'Meridian EU Tracking Lead', phone: '+442079460912', status: 'NEGOTIATION', crmCompanyId: seededCompanies[1].id, contactId: seededContacts[2].id, assignedTo: leadUser.id, requirement: 'Cloud PBX & Automated Dispatch Dialer' },
    { name: 'Nexa Multi-Region Kubernetes Pilot', phone: '+493012345678', status: 'PROPOSAL', crmCompanyId: seededCompanies[2].id, contactId: seededContacts[3].id, assignedTo: memberUser.id, requirement: 'Low-latency voice termination' },
    { name: 'Vertex Trading Floor Line Renewal', phone: '+41223456789', status: 'QUALIFIED', crmCompanyId: seededCompanies[3].id, contactId: seededContacts[4].id, assignedTo: ownerUser.id, requirement: 'Ultra-redundant carrier trunks' },
    { name: 'Helios APAC Regional Campaign', phone: '+6567890123', status: 'NEW', crmCompanyId: seededCompanies[4].id, contactId: seededContacts[5].id, assignedTo: memberUser.id, requirement: 'AdTech call tracking & Webhooks' }
  ];

  for (const l of leadsData) {
    await fetch(`${BASE_URL}/api/crm/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ownerToken}` },
      body: JSON.stringify(l)
    });
  }

  // Tasks & Meetings
  const tasksData = [
    { title: 'Follow up on Q3 Contract Terms', taskType: 'follow_up', priority: 'high', dueAt: new Date(Date.now() + 86400000).toISOString(), crmCompanyId: seededCompanies[0].id, contactId: seededContacts[0].id, assignedUserId: memberUser.id, description: 'Verify SLA clauses with Alexander Vance.' },
    { title: 'Executive Architecture Review (Zoom)', taskType: 'online_meeting', priority: 'urgent', dueAt: new Date(Date.now() + 172800000).toISOString(), crmCompanyId: seededCompanies[2].id, contactId: seededContacts[3].id, assignedUserId: memberUser.id, description: 'Review multi-region Kubernetes PBX topology on Zoom.' },
    { title: 'Q4 Budget & Trunking Strategy Meeting', taskType: 'meeting', priority: 'normal', dueAt: new Date(Date.now() + 259200000).toISOString(), crmCompanyId: seededCompanies[1].id, contactId: seededContacts[2].id, assignedUserId: leadUser.id, description: 'In-person meeting at London logistics terminal.' },
    { title: 'Overdue Compliance Documentation', taskType: 'call', priority: 'urgent', dueAt: new Date(Date.now() - 86400000).toISOString(), crmCompanyId: seededCompanies[3].id, contactId: seededContacts[4].id, assignedUserId: ownerUser.id, description: 'Urgent carrier KYC check required.' }
  ];

  for (const t of tasksData) {
    await fetch(`${BASE_URL}/api/crm/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ownerToken}` },
      body: JSON.stringify(t)
    });
  }

  // Client Work Items
  const workItemsData = [
    { title: 'SIP Trunk Integration & Porting', category: 'Integration', subcategory: 'Telecom', priority: 'high', status: 'IN_PROGRESS', dueAt: new Date(Date.now() + 864000000).toISOString(), crmCompanyId: seededCompanies[0].id, contactId: seededContacts[0].id, assignedUserId: memberUser.id, description: 'Port 50 DIDs from legacy carrier to Zestify high-capacity trunk.' },
    { title: 'Custom CRM Webhook Provisioning', category: 'Deliverable', subcategory: 'API Scripting', priority: 'normal', status: 'TODO', dueAt: new Date(Date.now() + 432000000).toISOString(), crmCompanyId: seededCompanies[1].id, contactId: seededContacts[2].id, assignedUserId: leadUser.id, description: 'Configure real-time webhooks for live call outcome ingest.' },
    { title: 'Enterprise Security & Penetration Audit', category: 'Project', subcategory: 'Compliance', priority: 'critical', status: 'PENDING', dueAt: new Date(Date.now() + 604800000).toISOString(), crmCompanyId: seededCompanies[3].id, contactId: seededContacts[4].id, assignedUserId: ownerUser.id, description: 'Client security team verifying TLS 1.3 encryption standards.' },
    { title: 'Cloud PBX IVR Deployment', category: 'Onboarding', subcategory: 'Voice Menu', priority: 'normal', status: 'COMPLETED', dueAt: new Date(Date.now() - 86400000).toISOString(), crmCompanyId: seededCompanies[4].id, contactId: seededContacts[5].id, assignedUserId: memberUser.id, description: 'Interactive multi-language menu deployed successfully.' }
  ];

  for (const w of workItemsData) {
    await fetch(`${BASE_URL}/api/crm/work-items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ownerToken}` },
      body: JSON.stringify(w)
    });
  }

  // Quotes
  const quotesData = [
    { crmCompanyId: seededCompanies[0].id, contactId: seededContacts[0].id, packageId: 'enterprise_annual', userCount: 25, billingCycle: 'annual', addonIds: ['dedicated_ip', 'call_recording_storage'], discountPct: 5, notes: 'Apex Global enterprise package with dedicated SBC and redundant routing.' },
    { crmCompanyId: seededCompanies[1].id, contactId: seededContacts[2].id, packageId: 'pro_monthly', userCount: 10, billingCycle: 'monthly', addonIds: ['call_recording_storage'], discountPct: 15, notes: 'Meridian logistics call center quote with recording storage.' },
    { crmCompanyId: seededCompanies[2].id, contactId: seededContacts[3].id, packageId: 'base_monthly', userCount: 5, billingCycle: 'monthly', addonIds: [], discountPct: 0, notes: 'Nexa cloud evaluation tier.' }
  ];

  for (const q of quotesData) {
    await fetch(`${BASE_URL}/api/crm/quotes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ownerToken}` },
      body: JSON.stringify(q)
    });
  }

  console.log('  Rich data seeded successfully.');

  // 3. Launch Puppeteer Browser
  console.log('\n[3/5] Launching Chrome Browser for Visual Capture...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--window-size=1600,1050'],
    defaultViewport: { width: 1600, height: 1050 }
  });

  const page = await browser.newPage();

  // Helper to authenticate session in browser
  async function authenticateSession(token, user) {
    await page.goto(FRONTEND_URL, { waitUntil: 'domcontentloaded' });
    await page.evaluate((tok, usr) => {
      localStorage.setItem('octal_auth_token', tok);
      localStorage.setItem('octal_auth_user', usr.username || usr.name || 'User');
      localStorage.setItem('octal_theme', 'dark');
      localStorage.setItem('octal_nav_pinned', 'true');
    }, token, user);
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(1000);

    // Switch to CRM workspace tab
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const crmBtn = buttons.find(b => b.textContent && b.textContent.includes('CRM Workspace'));
      if (crmBtn) crmBtn.click();
    });
    await sleep(1200);
  }

  // Helper to select a subtab inside CRM workspace
  async function selectSubTab(tabLabel) {
    await page.evaluate((label) => {
      const subtabBtns = Array.from(document.querySelectorAll('button'));
      const target = subtabBtns.find(b => b.textContent && b.textContent.trim().startsWith(label));
      if (target) target.click();
    }, tabLabel);
    await sleep(1000);
  }

  // =========================================================================
  // AUDIT STAGE 1: COMPANY OWNER PERSPECTIVE (All 10 Subtabs + Drawer)
  // =========================================================================
  console.log('\n[4/5] Capturing Stage 1: Company Owner Views...');
  await authenticateSession(ownerToken, ownerUser);

  // 1. CRM Overview
  await selectSubTab('CRM Overview');
  await page.screenshot({ path: path.join(DIRS.owner, '01_overview.png') });
  console.log('  📸 Saved: 01_company_owner/01_overview.png');

  // 2. Companies
  await selectSubTab('Companies');
  await page.screenshot({ path: path.join(DIRS.owner, '02_companies.png') });
  console.log('  📸 Saved: 01_company_owner/02_companies.png');

  // 3. Contacts
  await selectSubTab('Contacts');
  await page.screenshot({ path: path.join(DIRS.owner, '03_contacts.png') });
  console.log('  📸 Saved: 01_company_owner/03_contacts.png');

  // 4. Contact Profile Drawer
  await page.evaluate(() => {
    const profileBtns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent && b.textContent.includes('Profile'));
    if (profileBtns.length > 0) profileBtns[0].click();
  });
  await sleep(1200);
  await page.screenshot({ path: path.join(DIRS.owner, '04_contact_drawer.png') });
  console.log('  📸 Saved: 01_company_owner/04_contact_drawer.png');

  // Close Drawer
  await page.evaluate(() => {
    const closeBtns = Array.from(document.querySelectorAll('button'));
    const xBtn = closeBtns.find(b => b.querySelector('svg.lucide-x') || b.textContent === 'Cancel');
    if (xBtn) xBtn.click();
  });
  await sleep(500);

  // 5. Canonical Leads
  await selectSubTab('Canonical Leads');
  await page.screenshot({ path: path.join(DIRS.owner, '05_leads.png') });
  console.log('  📸 Saved: 01_company_owner/05_leads.png');

  // 6. Tasks
  await selectSubTab('Tasks');
  await page.screenshot({ path: path.join(DIRS.owner, '06_tasks.png') });
  console.log('  📸 Saved: 01_company_owner/06_tasks.png');

  // 7. Dedicated Meetings
  await selectSubTab('Meetings');
  await page.screenshot({ path: path.join(DIRS.owner, '07_meetings.png') });
  console.log('  📸 Saved: 01_company_owner/07_meetings.png');

  // 8. Client Work
  await selectSubTab('Client Work');
  await page.screenshot({ path: path.join(DIRS.owner, '08_client_work.png') });
  console.log('  📸 Saved: 01_company_owner/08_client_work.png');

  // 9. Quotes & Pricing (Note: Owner has Configure Base Pricing button)
  await selectSubTab('Quotes & Pricing');
  await page.screenshot({ path: path.join(DIRS.owner, '09_quotes.png') });
  console.log('  📸 Saved: 01_company_owner/09_quotes.png');

  // 10. Performance Dashboard
  await selectSubTab('Performance');
  await page.screenshot({ path: path.join(DIRS.owner, '10_performance.png') });
  console.log('  📸 Saved: 01_company_owner/10_performance.png');

  // 11. Unified Activity
  await selectSubTab('Unified Activity');
  await page.screenshot({ path: path.join(DIRS.owner, '11_activity.png') });
  console.log('  📸 Saved: 01_company_owner/11_activity.png');

  // =========================================================================
  // AUDIT STAGE 2: TEAM LEAD PERSPECTIVE
  // =========================================================================
  console.log('\n[4/5] Capturing Stage 2: Team Lead Views...');
  await authenticateSession(leadToken, leadUser);

  // 1. Overview Team Lead
  await selectSubTab('CRM Overview');
  await page.screenshot({ path: path.join(DIRS.lead, '01_overview_team_lead.png') });
  console.log('  📸 Saved: 02_team_lead/01_overview_team_lead.png');

  // 2. Tasks Team Lead
  await selectSubTab('Tasks');
  await page.screenshot({ path: path.join(DIRS.lead, '02_tasks_team_lead.png') });
  console.log('  📸 Saved: 02_team_lead/02_tasks_team_lead.png');

  // 3. Client Work Team Lead
  await selectSubTab('Client Work');
  await page.screenshot({ path: path.join(DIRS.lead, '03_client_work_team_lead.png') });
  console.log('  📸 Saved: 02_team_lead/03_client_work_team_lead.png');

  // 4. Quotes Team Lead (Demonstrating "Configure Base Pricing" is HIDDEN)
  await selectSubTab('Quotes & Pricing');
  await page.screenshot({ path: path.join(DIRS.lead, '04_quotes_team_lead.png') });
  console.log('  📸 Saved: 02_team_lead/04_quotes_team_lead.png');

  // 5. Performance Team Lead (Scoped breakdown of Alpha Team)
  await selectSubTab('Performance');
  await page.screenshot({ path: path.join(DIRS.lead, '05_performance_team_lead.png') });
  console.log('  📸 Saved: 02_team_lead/05_performance_team_lead.png');

  // =========================================================================
  // AUDIT STAGE 3: MEMBER AGENT PERSPECTIVE
  // =========================================================================
  console.log('\n[4/5] Capturing Stage 3: Member Agent Views...');
  await authenticateSession(memberToken, memberUser);

  // 1. Overview Member
  await selectSubTab('CRM Overview');
  await page.screenshot({ path: path.join(DIRS.member, '01_overview_member.png') });
  console.log('  📸 Saved: 03_member/01_overview_member.png');

  // 2. Tasks Member
  await selectSubTab('Tasks');
  await page.screenshot({ path: path.join(DIRS.member, '02_tasks_member.png') });
  console.log('  📸 Saved: 03_member/02_tasks_member.png');

  // 3. Performance Member (Personal Scorecard Only; Agent Leaderboard Hidden)
  await selectSubTab('Performance');
  await page.screenshot({ path: path.join(DIRS.member, '03_performance_member.png') });
  console.log('  📸 Saved: 03_member/03_performance_member.png');

  // =========================================================================
  // AUDIT STAGE 4: QUOTES & PRICING CALCULATOR (Role Badges & Ceilings)
  // =========================================================================
  console.log('\n[4/5] Capturing Stage 4: Quotes & Pricing Calculator...');

  // 1. Quote Builder as Owner
  await authenticateSession(ownerToken, ownerUser);
  await selectSubTab('Quotes & Pricing');
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('New Quote'));
    if (btn) btn.click();
  });
  await sleep(1000);
  await page.screenshot({ path: path.join(DIRS.quotes, '01_quote_builder_owner.png') });
  console.log('  📸 Saved: 04_quotes_and_pricing/01_quote_builder_owner.png');

  // Close Quote Builder
  await page.keyboard.press('Escape');
  await sleep(500);

  // 2. Pricing Rules Modal as Owner
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Configure Base Pricing'));
    if (btn) btn.click();
  });
  await sleep(1000);
  await page.screenshot({ path: path.join(DIRS.quotes, '04_pricing_rules_modal.png') });
  console.log('  📸 Saved: 04_quotes_and_pricing/04_pricing_rules_modal.png');

  await page.keyboard.press('Escape');
  await sleep(500);

  // 3. Quote Builder as Team Lead (25% Discount Ceiling Badge)
  await authenticateSession(leadToken, leadUser);
  await selectSubTab('Quotes & Pricing');
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('New Quote'));
    if (btn) btn.click();
  });
  await sleep(1000);
  await page.screenshot({ path: path.join(DIRS.quotes, '02_quote_builder_team_lead.png') });
  console.log('  📸 Saved: 04_quotes_and_pricing/02_quote_builder_team_lead.png');

  await page.keyboard.press('Escape');
  await sleep(500);

  // 4. Quote Builder as Member Agent (10% Discount Ceiling Badge & Validation)
  await authenticateSession(memberToken, memberUser);
  await selectSubTab('Quotes & Pricing');
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('New Quote'));
    if (btn) btn.click();
  });
  await sleep(1000);
  // Attempt to enter a 15% discount to trigger ceiling cap
  await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input[type="number"]'));
    const discountInput = inputs.find(i => i.min === '0' && i.max !== '500');
    if (discountInput) {
      discountInput.value = '15';
      discountInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await sleep(600);
  await page.screenshot({ path: path.join(DIRS.quotes, '03_quote_builder_member.png') });
  console.log('  📸 Saved: 04_quotes_and_pricing/03_quote_builder_member.png');

  await page.keyboard.press('Escape');
  await sleep(500);

  // =========================================================================
  // AUDIT STAGE 5: MODALS & GLOBAL CROSS-ENTITY SEARCH
  // =========================================================================
  console.log('\n[4/5] Capturing Stage 5: Modals & Global Cross-Entity Search...');
  await authenticateSession(ownerToken, ownerUser);

  // 1. Global Search Dropdown
  await page.evaluate(() => {
    const searchInput = document.querySelector('input[placeholder*="Global CRM Search"]');
    if (searchInput) {
      searchInput.focus();
      searchInput.value = 'Apex';
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      searchInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await sleep(1200);
  await page.screenshot({ path: path.join(DIRS.modals, '01_global_search_dropdown.png') });
  console.log('  📸 Saved: 05_modals_and_search/01_global_search_dropdown.png');

  // Clear search
  await page.evaluate(() => {
    const searchInput = document.querySelector('input[placeholder*="Global CRM Search"]');
    if (searchInput) {
      searchInput.value = '';
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await sleep(500);

  // 2. Create Client Work Item Modal
  await selectSubTab('Client Work');
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Create Work Item'));
    if (btn) btn.click();
  });
  await sleep(1000);
  await page.screenshot({ path: path.join(DIRS.modals, '02_create_work_item_modal.png') });
  console.log('  📸 Saved: 05_modals_and_search/02_create_work_item_modal.png');
  await page.keyboard.press('Escape');
  await sleep(500);

  // 3. Edit Company Modal
  await selectSubTab('Companies');
  await page.evaluate(() => {
    const editBtns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent && b.textContent.includes('Edit'));
    if (editBtns.length > 0) editBtns[0].click();
  });
  await sleep(1000);
  await page.screenshot({ path: path.join(DIRS.modals, '03_edit_company_modal.png') });
  console.log('  📸 Saved: 05_modals_and_search/03_edit_company_modal.png');
  await page.keyboard.press('Escape');
  await sleep(500);

  // 4. Edit Contact Modal
  await selectSubTab('Contacts');
  await page.evaluate(() => {
    const editBtns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent && b.textContent.includes('Edit'));
    if (editBtns.length > 0) editBtns[0].click();
  });
  await sleep(1000);
  await page.screenshot({ path: path.join(DIRS.modals, '04_edit_contact_modal.png') });
  console.log('  📸 Saved: 05_modals_and_search/04_edit_contact_modal.png');
  await page.keyboard.press('Escape');
  await sleep(500);

  // 5. Edit Lead Modal
  await selectSubTab('Canonical Leads');
  await page.evaluate(() => {
    const editBtns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent && b.textContent.includes('Edit'));
    if (editBtns.length > 0) editBtns[0].click();
  });
  await sleep(1000);
  await page.screenshot({ path: path.join(DIRS.modals, '05_edit_lead_modal.png') });
  console.log('  📸 Saved: 05_modals_and_search/05_edit_lead_modal.png');
  await page.keyboard.press('Escape');
  await sleep(500);

  // 6. Edit Task Modal
  await selectSubTab('Tasks');
  await page.evaluate(() => {
    const editBtns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent && b.textContent.includes('Edit'));
    if (editBtns.length > 0) editBtns[0].click();
  });
  await sleep(1000);
  await page.screenshot({ path: path.join(DIRS.modals, '06_edit_task_modal.png') });
  console.log('  📸 Saved: 05_modals_and_search/06_edit_task_modal.png');
  await page.keyboard.press('Escape');
  await sleep(500);

  // 7. Close Task Modal (with chained follow-up options)
  await page.evaluate(() => {
    const closeBtns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent && b.textContent.includes('Close'));
    if (closeBtns.length > 0) closeBtns[0].click();
  });
  await sleep(1000);
  await page.screenshot({ path: path.join(DIRS.modals, '07_close_task_modal.png') });
  console.log('  📸 Saved: 05_modals_and_search/07_close_task_modal.png');
  await page.keyboard.press('Escape');
  await sleep(500);

  await browser.close();

  console.log('\n[5/5] Visual capture complete! All 30 screenshots generated.');
  console.log(`Directory: ${AUDIT_DIR}`);
}

runAudit().catch(err => {
  console.error('Audit failed with error:', err);
  process.exit(1);
});
