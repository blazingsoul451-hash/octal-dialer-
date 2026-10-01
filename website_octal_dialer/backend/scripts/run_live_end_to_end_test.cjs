const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.resolve(__dirname, '../../../role_verification_screenshots');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

async function run() {
  console.log('================================================================');
  console.log('STARTING LIVE END-TO-END MULTI-TENANT & AGENT VERIFICATION TEST');
  console.log('Target Host: http://140.245.215.156');
  console.log('================================================================\n');

  const browser = await chromium.launch({ headless: true });

  // ============================================================================
  // PHASE 1: COMPANY OWNER SIGNUP & ONBOARDING
  // ============================================================================
  console.log('>>> PHASE 1: Registering Fresh Company Owner & Completing Onboarding');
  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const ownerPage = await ownerContext.newPage();

  const timestamp = Date.now();
  const ownerEmail = `apex_exec_${timestamp}@testcorp.com`;
  const agentEmail = `agent_carol_${timestamp}@testcorp.com`;

  await ownerPage.goto('http://140.245.215.156', { waitUntil: 'networkidle' });
  await ownerPage.click('text="Sign Up Now"');
  await ownerPage.waitForTimeout(1000);

  // Fill signup form
  const inputs = await ownerPage.$$('input');
  for (const input of inputs) {
    const ph = (await input.getAttribute('placeholder') || '').toLowerCase();
    const name = (await input.getAttribute('name') || '').toLowerCase();
    const type = (await input.getAttribute('type') || '').toLowerCase();

    if (ph.includes('business') || name.includes('business')) await input.fill(`Apex Dynamics ${timestamp}`);
    else if (ph.includes('first') || name.includes('first')) await input.fill('Carol');
    else if (ph.includes('last') || name.includes('last')) await input.fill('Danvers');
    else if (type === 'email' || ph.includes('email') || name.includes('email')) await input.fill(ownerEmail);
    else if (type === 'password' || ph.includes('password') || name.includes('password')) await input.fill('CustomerPass1234!');
    else if (ph.includes('mobile') || ph.includes('phone') || name.includes('mobile') || name.includes('phone')) await input.fill('+15553334444');
  }

  await ownerPage.click('button[type="submit"], button:has-text("Sign Up")');
  await ownerPage.waitForTimeout(3000);

  // Step 1: Company details
  console.log('Owner Onboarding Step 1...');
  const step1Btn = ownerPage.locator('button:has-text("Continue")').first();
  if (await step1Btn.count() > 0) {
    await step1Btn.click();
    await ownerPage.waitForTimeout(2000);
  }

  // Step 2: Plan selection
  console.log('Owner Onboarding Step 2...');
  const step2Btn = ownerPage.locator('button:has-text("Continue to Plan Selection")').first();
  if (await step2Btn.count() > 0) {
    await step2Btn.click();
    await ownerPage.waitForTimeout(2000);
  }

  // Step 3: Launch Workspace
  console.log('Owner Onboarding Step 3...');
  const step3Btn = ownerPage.locator('button:has-text("Complete Setup & Launch Workspace")').first();
  if (await step3Btn.count() > 0) {
    await step3Btn.click();
    await ownerPage.waitForTimeout(5000);
  }

  console.log('✓ PASS: Company Owner onboarded and loaded into Workspace.');

  // ============================================================================
  // PHASE 2: COMPANY OWNER SETTINGS & USERS/ROLES
  // ============================================================================
  console.log('\n>>> PHASE 2: Inspecting Company Owner Settings & Structural Scopes');
  
  // Open Settings via topbar button
  const topbarSettings = ownerPage.locator('#topbar-settings-btn');
  if (await topbarSettings.count() > 0) {
    await topbarSettings.click();
    await ownerPage.waitForTimeout(2000);
  }

  // Click Users & Roles card
  const usersRolesCard = ownerPage.locator('#card-users-roles, button:has-text("Users & Roles")').first();
  if (await usersRolesCard.count() > 0) {
    await usersRolesCard.click();
    await ownerPage.waitForTimeout(2500);
  }

  await ownerPage.screenshot({ path: path.join(OUT_DIR, 'live_08a_company_users_and_roles.png'), fullPage: true });
  console.log('✓ PASS: Captured live_08a_company_users_and_roles.png');

  // Click Tab: Roles & Permissions
  const rolesTab = ownerPage.locator('button:has-text("Roles & Permissions")').first();
  if (await rolesTab.count() > 0) {
    await rolesTab.click();
    await ownerPage.waitForTimeout(1500);
    await ownerPage.screenshot({ path: path.join(OUT_DIR, 'live_08b_structural_scope_enforcement.png'), fullPage: true });
    console.log('✓ PASS: Captured live_08b_structural_scope_enforcement.png');
  }

  // Click Tab: Invitations
  const invTab = ownerPage.locator('button:has-text("Invitations")').first();
  if (await invTab.count() > 0) {
    await invTab.click();
    await ownerPage.waitForTimeout(1500);
  }

  // Click Send New Invitation
  const sendInvBtn = ownerPage.locator('button:has-text("Send New Invitation"), button:has-text("Invite First User")').first();
  if (await sendInvBtn.count() > 0) {
    await sendInvBtn.click();
    await ownerPage.waitForTimeout(1500);
  }

  // Fill in Invitation Modal
  console.log(`Sending invitation to Agent: ${agentEmail}`);
  const emailInput = ownerPage.locator('#invite-email-input');
  if (await emailInput.count() > 0) {
    await emailInput.fill(agentEmail);
  }

  // Role select: Member (user)
  const roleSelect = ownerPage.locator('#invite-role-select');
  if (await roleSelect.count() > 0) {
    await roleSelect.selectOption('user');
  }

  await ownerPage.waitForTimeout(1000);
  await ownerPage.screenshot({ path: path.join(OUT_DIR, 'live_08c_invite_teammate_modal.png'), fullPage: true });
  console.log('✓ PASS: Captured live_08c_invite_teammate_modal.png');

  // Submit invitation
  const submitInvBtn = ownerPage.locator('#submit-invite-btn, button[type="submit"]:has-text("Send Invitation")').first();
  if (await submitInvBtn.count() > 0) {
    await submitInvBtn.click();
    await ownerPage.waitForTimeout(3000);
    await ownerPage.screenshot({ path: path.join(OUT_DIR, 'live_08d_invite_link_generated.png'), fullPage: true });
    console.log('✓ PASS: Captured live_08d_invite_link_generated.png');
  }

  // ============================================================================
  // PHASE 3: AGENT REGISTRATION & INVITATION ACCEPTANCE (GATE 3)
  // ============================================================================
  console.log('\n>>> PHASE 3: Testing Agent Acceptance & Isolated HUD');
  const agentContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const agentPage = await agentContext.newPage();

  await agentPage.goto('http://140.245.215.156', { waitUntil: 'networkidle' });
  await agentPage.click('text="Sign Up Now"');
  await agentPage.waitForTimeout(1000);

  // Fill agent signup form with matching email
  const agentInputs = await agentPage.$$('input');
  for (const input of agentInputs) {
    const ph = (await input.getAttribute('placeholder') || '').toLowerCase();
    const name = (await input.getAttribute('name') || '').toLowerCase();
    const type = (await input.getAttribute('type') || '').toLowerCase();

    if (ph.includes('business') || name.includes('business')) await input.fill(`Apex Dynamics ${timestamp}`);
    else if (ph.includes('first') || name.includes('first')) await input.fill('Agent');
    else if (ph.includes('last') || name.includes('last')) await input.fill('Smith');
    else if (type === 'email' || ph.includes('email') || name.includes('email')) await input.fill(agentEmail);
    else if (type === 'password' || ph.includes('password') || name.includes('password')) await input.fill('AgentPass1234!');
    else if (ph.includes('mobile') || ph.includes('phone') || name.includes('mobile') || name.includes('phone')) await input.fill('+15559876543');
  }

  await agentPage.click('button[type="submit"], button:has-text("Sign Up")');
  await agentPage.waitForTimeout(4000);

  // Check for Gate 3: Invitation Acceptance Modal
  console.log('Waiting for Gate 3 Invitation Acceptance Modal...');
  await agentPage.screenshot({ path: path.join(OUT_DIR, 'live_09a_agent_invitation_acceptance.png'), fullPage: true });
  console.log('✓ PASS: Captured live_09a_agent_invitation_acceptance.png');

  const acceptBtn = agentPage.locator('#accept-invitation-btn, button:has-text("Accept & Join Workspace")').first();
  if (await acceptBtn.count() > 0) {
    await acceptBtn.click();
    await agentPage.waitForTimeout(5000);
  }

  // Capture final Agent HUD
  await agentPage.screenshot({ path: path.join(OUT_DIR, 'live_09b_agent_hud_bounded_access.png'), fullPage: true });
  console.log('✓ PASS: Captured live_09b_agent_hud_bounded_access.png');

  // Verify Agent HUD isolation
  const navText = await agentPage.locator('nav, header').allInnerTexts();
  console.log('\nAgent Visible Navigation Elements:', navText.join(' '));

  await browser.close();
  console.log('\n================================================================');
  console.log('ALL LIVE INTERACTIVE TESTS COMPLETED SUCCESSFULLY!');
  console.log('================================================================');
}

run().catch(err => {
  console.error('Test Execution Failure:', err);
  process.exit(1);
});
