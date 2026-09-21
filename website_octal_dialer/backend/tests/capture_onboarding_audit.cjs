/**
 * capture_onboarding_audit.cjs
 * Automated Visual Audit for Zestify SaaS Onboarding, Seat Enforcement & Invitation Foundation
 *
 * Captures 13 High-Resolution Screenshots (1440x900, 2x DPR):
 *  01_signin.png                      - Clean Sign In screen (Google + email/password)
 *  02_signup.png                      - Clean Sign Up screen (Google + name/email/pw, NO company name)
 *  03_google_new_user_onboarding.png  - Brand new customer landing in onboarding
 *  04_workspace_type.png              - Step 1: For My Company vs Just Me
 *  05_company_setup.png               - Step 2A: Company setup details
 *  06_personal_setup.png              - Step 2B: Personal setup details
 *  07_plan_selection.png              - Step 3: Starter / Pro / Enterprise plan selection
 *  08_company_created.png             - Company Owner landing in "Zestify CRM Test Company" dashboard
 *  09_owner_users_roles.png           - Settings -> Users & Roles showing Seat Usage banner
 *  10_invite_user.png                 - Invite Teammate modal open (role + team selection)
 *  11_invitation_acceptance.png       - Invitee landing on Invitation Acceptance screen
 *  12_teamlead_workspace.png          - Team Lead workspace scoped to Team A
 *  13_member_workspace.png            - Team Member CRM workspace with scoped contacts
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const puppeteer = require('puppeteer-core');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const FRONTEND_URL = 'http://localhost:5173';
const BACKEND_HOST = '127.0.0.1';
const BACKEND_PORT = 5000;

const AUDIT_DIR = path.resolve(__dirname, '../../ZESTIFY_ONBOARDING_AUDIT');
if (!fs.existsSync(AUDIT_DIR)) {
  fs.mkdirSync(AUDIT_DIR, { recursive: true });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function apiRequest(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = body ? JSON.parse(body) : {};
          resolve({ status: res.statusCode, headers: res.headers, body: json });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, body });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(typeof data === 'string' ? data : JSON.stringify(data));
    req.end();
  });
}

async function run() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('STARTING ZESTIFY ONBOARDING & ACCOUNT LIFECYCLE VISUAL AUDIT');
  console.log('═══════════════════════════════════════════════════════════════════');

  console.log('\n[1/4] Launching Headless Chrome (1440x900 @ 2x DPR)...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--window-size=1440,900',
      '--force-device-scale-factor=2'
    ],
    defaultViewport: {
      width: 1440,
      height: 900,
      deviceScaleFactor: 2
    }
  });

  const page = await browser.newPage();

  async function setBrowserAuth(token, username) {
    await page.evaluate((tok, usr) => {
      localStorage.setItem('octal_auth_token', tok);
      localStorage.setItem('octal_auth_user', usr);
      localStorage.setItem('octal_theme', 'dark');
      localStorage.setItem('octal_nav_pinned', 'true');
    }, token, username);
  }

  async function clearBrowserAuth() {
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('octal_theme', 'dark');
    });
  }

  async function typeInto(selector, text) {
    await page.waitForSelector(selector);
    await page.click(selector, { clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.type(selector, text, { delay: 10 });
  }

  async function setSelectValue(selector, value) {
    await page.waitForSelector(selector);
    await page.select(selector, value);
  }

  try {
    // -----------------------------------------------------------------------
    // SCREENSHOT 01: SIGN IN SCREEN
    // -----------------------------------------------------------------------
    console.log('\n📸 [1/13] Capturing 01_signin.png...');
    await page.goto(FRONTEND_URL, { waitUntil: 'networkidle2' });
    await clearBrowserAuth();
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(1000);

    await page.evaluate(() => {
      const btn = document.getElementById('tab-signin-btn');
      if (btn) btn.click();
    });
    await sleep(600);
    await page.screenshot({ path: path.join(AUDIT_DIR, '01_signin.png') });
    console.log('   ✓ Saved: 01_signin.png');

    // -----------------------------------------------------------------------
    // SCREENSHOT 02: SIGN UP SCREEN (Clean, No Company Name)
    // -----------------------------------------------------------------------
    console.log('\n📸 [2/13] Capturing 02_signup.png...');
    await page.evaluate(() => {
      const btn = document.getElementById('tab-signup-btn');
      if (btn) btn.click();
    });
    await sleep(600);
    await page.screenshot({ path: path.join(AUDIT_DIR, '02_signup.png') });
    console.log('   ✓ Saved: 02_signup.png');

    // -----------------------------------------------------------------------
    // SCREENSHOT 03: BRAND NEW USER ARRIVING AT ONBOARDING
    // -----------------------------------------------------------------------
    console.log('\n📸 [3/13] Capturing 03_google_new_user_onboarding.png...');
    const timestamp = Date.now();
    const ownerEmail = `zestify_owner_${timestamp}@zestifycrm.local`;
    
    // Register brand new customer via API
    const regOwner = await apiRequest({
      hostname: BACKEND_HOST,
      port: BACKEND_PORT,
      path: '/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      fullName: 'Zestify Owner',
      email: ownerEmail,
      password: 'OwnerPassword1234!'
    });

    const initialOwnerToken = regOwner.body.token;

    // Set token in browser and reload
    await setBrowserAuth(initialOwnerToken, 'Zestify Owner');
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(1500);

    await page.screenshot({ path: path.join(AUDIT_DIR, '03_google_new_user_onboarding.png') });
    console.log('   ✓ Saved: 03_google_new_user_onboarding.png');

    // -----------------------------------------------------------------------
    // SCREENSHOT 04: WORKSPACE TYPE SELECTION (Company vs Just Me)
    // -----------------------------------------------------------------------
    console.log('\n📸 [4/13] Capturing 04_workspace_type.png...');
    await page.evaluate(() => {
      const el = document.getElementById('workspace-type-company');
      if (el) el.click();
    });
    await sleep(400);
    await page.screenshot({ path: path.join(AUDIT_DIR, '04_workspace_type.png') });
    console.log('   ✓ Saved: 04_workspace_type.png');

    // -----------------------------------------------------------------------
    // SCREENSHOT 05: COMPANY SETUP DETAILS (Step 2A)
    // -----------------------------------------------------------------------
    console.log('\n📸 [5/13] Capturing 05_company_setup.png...');
    await page.evaluate(() => {
      const btn = document.getElementById('step1-next-btn');
      if (btn) btn.click();
    });
    await sleep(600);

    // Type with real keystrokes to ensure React state updates cleanly
    await typeInto('#input-company-name', 'Zestify CRM Test Company');
    await typeInto('#input-full-name', 'Zestify Owner');
    await setSelectValue('#select-country', 'US');
    await setSelectValue('#select-timezone', 'America/New_York');
    await setSelectValue('#select-team-size', '6-15');
    await setSelectValue('#select-industry', 'Technology');
    await sleep(500);

    await page.screenshot({ path: path.join(AUDIT_DIR, '05_company_setup.png') });
    console.log('   ✓ Saved: 05_company_setup.png');

    // -----------------------------------------------------------------------
    // SCREENSHOT 06: PERSONAL SETUP DETAILS (Step 2B)
    // -----------------------------------------------------------------------
    console.log('\n📸 [6/13] Capturing 06_personal_setup.png...');
    // Click Back to Step 1
    await page.evaluate(() => {
      const backBtns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent && b.textContent.includes('Back'));
      if (backBtns.length > 0) backBtns[0].click();
    });
    await sleep(500);

    // Click "Just Me" (Personal Workspace)
    await page.evaluate(() => {
      const pers = document.getElementById('workspace-type-personal');
      if (pers) pers.click();
    });
    await sleep(400);

    // Advance to Step 2
    await page.evaluate(() => {
      const btn = document.getElementById('step1-next-btn');
      if (btn) btn.click();
    });
    await sleep(600);
    await page.screenshot({ path: path.join(AUDIT_DIR, '06_personal_setup.png') });
    console.log('   ✓ Saved: 06_personal_setup.png');

    // -----------------------------------------------------------------------
    // SCREENSHOT 07: PLAN SELECTION (Starter / Pro / Enterprise)
    // -----------------------------------------------------------------------
    console.log('\n📸 [7/13] Capturing 07_plan_selection.png...');
    // Click Back to Step 1, select Company, advance to Step 2 then Step 3
    await page.evaluate(() => {
      const backBtns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent && b.textContent.includes('Back'));
      if (backBtns.length > 0) backBtns[0].click();
    });
    await sleep(400);

    await page.evaluate(() => {
      const comp = document.getElementById('workspace-type-company');
      if (comp) comp.click();
    });
    await sleep(300);

    await page.evaluate(() => {
      const btn = document.getElementById('step1-next-btn');
      if (btn) btn.click();
    });
    await sleep(500);

    // Re-fill company name if needed
    await typeInto('#input-company-name', 'Zestify CRM Test Company');
    await sleep(400);

    // Click Continue to Plan Selection
    await page.evaluate(() => {
      const nextBtn = document.getElementById('step2-next-btn');
      if (nextBtn) nextBtn.click();
    });
    await sleep(600);

    // Select Starter Plan
    await page.evaluate(() => {
      const planStarter = document.getElementById('plan-starter-card');
      if (planStarter) planStarter.click();
    });
    await sleep(400);
    await page.screenshot({ path: path.join(AUDIT_DIR, '07_plan_selection.png') });
    console.log('   ✓ Saved: 07_plan_selection.png');

    // -----------------------------------------------------------------------
    // SCREENSHOT 08: COMPANY CREATED & DASHBOARD LANDING
    // -----------------------------------------------------------------------
    console.log('\n📸 [8/13] Capturing 08_company_created.png...');
    // Click "Complete Setup & Launch Workspace"
    await page.evaluate(() => {
      const completeBtn = document.getElementById('complete-onboarding-btn');
      if (completeBtn) completeBtn.click();
    });
    
    // Wait for modal to dismiss
    await page.waitForFunction(() => !document.getElementById('complete-onboarding-btn'), { timeout: 15000 });
    await sleep(2000);

    await page.screenshot({ path: path.join(AUDIT_DIR, '08_company_created.png') });
    console.log('   ✓ Saved: 08_company_created.png');

    // Get elevated owner token
    const ownerToken = await page.evaluate(() => localStorage.getItem('octal_auth_token'));
    console.log(`   ✓ Owner token obtained: ${ownerToken ? ownerToken.substring(0, 15) + '...' : 'NULL'}`);

    // Create Team A in background so it is available in Settings & Invites
    const teamRes = await apiRequest({
      hostname: BACKEND_HOST,
      port: BACKEND_PORT,
      path: '/api/admin/teams',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ownerToken}`
      }
    }, {
      name: 'Team A',
      description: 'Outbound CRM Sales Squad'
    });
    const teamA = teamRes.body.team || teamRes.body;
    const teamId = teamA.id || teamRes.body.id;
    if (!teamId) {
      throw new Error(`Failed to initialize Team A (status ${teamRes.status}): ${JSON.stringify(teamRes.body)}`);
    }
    console.log(`   ✓ Backend Team A initialized (ID: ${teamId})`);

    // -----------------------------------------------------------------------
    // SCREENSHOT 09: OWNER SETTINGS -> USERS & ROLES (Seat Usage Banner)
    // -----------------------------------------------------------------------
    console.log('\n📸 [9/13] Capturing 09_owner_users_roles.png...');
    // Click topbar Settings button
    await page.evaluate(() => {
      const btn = document.getElementById('topbar-settings-btn');
      if (btn) btn.click();
    });
    await sleep(1000);

    // Click Card 2: Users & Roles
    await page.evaluate(() => {
      const card = document.getElementById('card-users-roles');
      if (card) card.click();
    });
    await sleep(1500);

    await page.screenshot({ path: path.join(AUDIT_DIR, '09_owner_users_roles.png') });
    console.log('   ✓ Saved: 09_owner_users_roles.png');

    // -----------------------------------------------------------------------
    // SCREENSHOT 10: INVITE TEAMMATE MODAL (Role & Team Selection)
    // -----------------------------------------------------------------------
    console.log('\n📸 [10/13] Capturing 10_invite_user.png...');
    // Click "Invite User" banner button
    await page.evaluate(() => {
      const btn = document.getElementById('invite-user-banner-btn') || document.getElementById('invite-user-header-btn');
      if (btn) btn.click();
    });
    await sleep(600);

    // Fill in Email, Select Role: Team Lead, Select Team: Team A
    await typeInto('#invite-email-input', 'lead@zestifycrm.local');
    await setSelectValue('#invite-role-select', 'team_lead');
    await setSelectValue('#invite-team-select', teamId);
    await sleep(500);

    await page.screenshot({ path: path.join(AUDIT_DIR, '10_invite_user.png') });
    console.log('   ✓ Saved: 10_invite_user.png');

    // Close the invite modal in UI
    await page.evaluate(() => {
      const closeBtns = Array.from(document.querySelectorAll('button'));
      const xBtn = closeBtns.find(b => b.querySelector('svg.lucide-x'));
      if (xBtn) xBtn.click();
    });
    await sleep(400);

    // Generate actual Team Lead invitation via API
    const leadEmail = `zestify_lead_${timestamp}@zestifycrm.local`;
    const invLead = await apiRequest({
      hostname: BACKEND_HOST,
      port: BACKEND_PORT,
      path: '/api/admin/invitations',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ownerToken}`
      }
    }, {
      email: leadEmail,
      role: 'team_lead',
      teamId: teamId,
      initialModules: ['crm', 'octalDialer', 'campaigns', 'leads', 'reports']
    });

    const leadInviteToken = invLead.body.token;
    if (!leadInviteToken) {
      throw new Error(`Failed to generate team lead invitation: ${JSON.stringify(invLead.body)}`);
    }

    // -----------------------------------------------------------------------
    // SCREENSHOT 11: INVITATION ACCEPTANCE SCREEN
    // -----------------------------------------------------------------------
    console.log('\n📸 [11/13] Capturing 11_invitation_acceptance.png...');
    // Register identity for lead
    const regLead = await apiRequest({
      hostname: BACKEND_HOST,
      port: BACKEND_PORT,
      path: '/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      fullName: 'Zestify Lead',
      email: leadEmail,
      password: 'LeadPassword1234!'
    });

    // Authenticate lead in browser
    await setBrowserAuth(regLead.body.token, 'Zestify Lead');
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(1500);

    await page.screenshot({ path: path.join(AUDIT_DIR, '11_invitation_acceptance.png') });
    console.log('   ✓ Saved: 11_invitation_acceptance.png');

    // Accept invitation
    console.log('   Accepting invitation as Team Lead...');
    await page.evaluate(() => {
      const btn = document.getElementById('accept-invitation-btn');
      if (btn) btn.click();
    });
    await page.waitForFunction(() => !document.getElementById('accept-invitation-btn'), { timeout: 15000 });
    await sleep(2000);

    // -----------------------------------------------------------------------
    // SCREENSHOT 12: TEAM LEAD WORKSPACE (Scoped to Team A)
    // -----------------------------------------------------------------------
    console.log('\n📸 [12/13] Capturing 12_teamlead_workspace.png...');
    // Navigate to Team Workspace
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const teamBtn = buttons.find(b => b.textContent && b.textContent.includes('Team Workspace'));
      if (teamBtn) teamBtn.click();
    });
    await sleep(1500);

    await page.screenshot({ path: path.join(AUDIT_DIR, '12_teamlead_workspace.png') });
    console.log('   ✓ Saved: 12_teamlead_workspace.png');

    // -----------------------------------------------------------------------
    // SCREENSHOT 13: TEAM MEMBER WORKSPACE (CRM Scoped)
    // -----------------------------------------------------------------------
    console.log('\n📸 [13/13] Capturing 13_member_workspace.png...');
    // 1. Invite member via API
    const memberEmail = `zestify_member_${timestamp}@zestifycrm.local`;
    const invMember = await apiRequest({
      hostname: BACKEND_HOST,
      port: BACKEND_PORT,
      path: '/api/admin/invitations',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ownerToken}`
      }
    }, {
      email: memberEmail,
      role: 'user',
      teamId: teamId,
      initialModules: ['crm', 'octalDialer', 'campaigns', 'leads', 'reports']
    });

    if (!invMember.body.token) {
      throw new Error(`Failed to create member invite (status ${invMember.status}): ${JSON.stringify(invMember.body)}`);
    }

    // 2. Register member
    const regMember = await apiRequest({
      hostname: BACKEND_HOST,
      port: BACKEND_PORT,
      path: '/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      fullName: 'Zestify Member',
      email: memberEmail,
      password: 'MemberPassword1234!'
    });

    // 3. Accept invitation for member
    const accMember = await apiRequest({
      hostname: BACKEND_HOST,
      port: BACKEND_PORT,
      path: '/api/invitations/accept',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${regMember.body.token}`
      }
    }, { token: invMember.body.token });

    if (!accMember.body.token || !accMember.body.user) {
      throw new Error(`Failed member acceptance (status ${accMember.status}): ${JSON.stringify(accMember.body)}`);
    }

    const memberToken = accMember.body.token;
    const memberUserId = accMember.body.user.id;

    // 4. Seed a CRM contact assigned to this member
    await apiRequest({
      hostname: BACKEND_HOST,
      port: BACKEND_PORT,
      path: '/api/crm/contacts',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ownerToken}`
      }
    }, {
      name: 'Acme Prospect Alpha',
      email: 'alpha@acme.test',
      phone: '+1-555-0199',
      roleTitle: 'VP Technology',
      assignedUserId: memberUserId
    });

    // 5. Authenticate member in browser
    await setBrowserAuth(memberToken, 'Zestify Member');
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(1500);

    // Switch to CRM Workspace
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const crmBtn = buttons.find(b => b.textContent && b.textContent.includes('CRM Workspace'));
      if (crmBtn) crmBtn.click();
    });
    await sleep(1500);

    await page.screenshot({ path: path.join(AUDIT_DIR, '13_member_workspace.png') });
    console.log('   ✓ Saved: 13_member_workspace.png');

    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log('VISUAL AUDIT COMPLETE: ALL 13 SCREENSHOTS CAPTURED SUCCESSFULLY!');
    console.log(`Directory: ${AUDIT_DIR}`);
    console.log('═══════════════════════════════════════════════════════════════════');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('\n❌ AUDIT SCRIPT FAILED:', err);
  process.exit(1);
});
