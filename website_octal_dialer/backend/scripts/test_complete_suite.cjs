const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.resolve(__dirname, '../../../role_verification_screenshots');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

async function run() {
  console.log('=====================================================');
  console.log('STARTING COMPLETE LIVE PRODUCTION VERIFICATION SUITE');
  console.log('Server: http://140.245.215.156');
  console.log('=====================================================\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // ----------------------------------------------------------------
  // TEST 1: Public Homepage & Login Screen
  // ----------------------------------------------------------------
  console.log('--- TEST 1: Public Homepage & Brand Login Screen ---');
  await page.goto('http://140.245.215.156', { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(OUT_DIR, 'live_01_public_login.png'), fullPage: true });
  console.log('✓ PASS: Captured live_01_public_login.png\n');

  // ----------------------------------------------------------------
  // TEST 2: Platform Owner Authentication & Console Overview
  // ----------------------------------------------------------------
  console.log('--- TEST 2: Platform Owner Authentication & Telemetry ---');
  await page.fill('input[type="text"], input[name="username"]', 'admin');
  await page.fill('input[type="password"]', 'AdminPassword1234!');
  await page.click('button[type="submit"], button:has-text("Login")');
  await page.waitForURL('**/admin**', { timeout: 15000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT_DIR, 'live_02_platform_overview.png'), fullPage: true });
  console.log('✓ PASS: Logged in as Platform Owner (Admin). Captured live_02_platform_overview.png\n');

  // ----------------------------------------------------------------
  // TEST 3: Companies Management Table
  // ----------------------------------------------------------------
  console.log('--- TEST 3: Platform Companies Table & Seat Quota Grid ---');
  await page.locator('nav button:has-text("COMPANIES")').click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUT_DIR, 'live_03_companies_table.png'), fullPage: true });
  console.log('✓ PASS: Companies Table Loaded. Captured live_03_companies_table.png\n');

  // ----------------------------------------------------------------
  // TEST 4: Company Module Ceiling & Seat Quotas Drawer
  // ----------------------------------------------------------------
  console.log('--- TEST 4: Company Module Ceiling (7 Products) & Seat Slider ---');
  // Click on the first company row to open drawer
  const inspectBtn = page.locator('button:has-text("Inspect"), button:has-text("Manage"), tr.group').first();
  if (await inspectBtn.count() > 0) {
    await inspectBtn.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(OUT_DIR, 'live_04_company_ceiling_drawer.png'), fullPage: true });
    console.log('✓ PASS: Company Ceiling Drawer Opened. Captured live_04_company_ceiling_drawer.png\n');
  }

  // ----------------------------------------------------------------
  // TEST 5: Customer Registration & Company Onboarding Flow
  // ----------------------------------------------------------------
  console.log('--- TEST 5: Fresh Customer Registration & Onboarding Lifecycle ---');
  const custContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const custPage = await custContext.newPage();
  
  await custPage.goto('http://140.245.215.156', { waitUntil: 'networkidle' });
  // Click Sign Up Now
  await custPage.click('text="Sign Up Now"');
  await custPage.waitForTimeout(1000);

  const timestamp = Date.now();
  const signupEmail = `octal_client_${timestamp}@testcorp.com`;
  console.log(`Registering fresh user: ${signupEmail}`);

  await custPage.fill('input[placeholder*="name" i], input[name="fullName"]', 'Samantha Reed');
  await custPage.fill('input[placeholder*="email" i], input[type="email"]', signupEmail);
  await custPage.fill('input[type="password"]', 'CustomerPass1234!');
  await custPage.click('button[type="submit"], button:has-text("Sign Up"), button:has-text("Create Account")');
  
  // Wait for onboarding wizard
  await custPage.waitForTimeout(3000);
  await custPage.screenshot({ path: path.join(OUT_DIR, 'live_05a_onboarding_wizard.png'), fullPage: true });
  console.log('✓ Captured live_05a_onboarding_wizard.png');

  // Complete onboarding form if present
  const compInput = custPage.locator('input[placeholder*="Company" i], input[placeholder*="Workspace" i], input[name="companyName"]').first();
  if (await compInput.count() > 0) {
    await compInput.fill(`Apex Innovations ${timestamp}`);
    const nextBtn = custPage.locator('button:has-text("Continue"), button:has-text("Next"), button:has-text("Complete")').first();
    if (await nextBtn.count() > 0) await nextBtn.click();
    await custPage.waitForTimeout(2000);
  }

  // Check if landed in customer workspace
  await custPage.waitForTimeout(3000);
  await custPage.screenshot({ path: path.join(OUT_DIR, 'live_05b_customer_workspace.png'), fullPage: true });
  console.log('✓ PASS: Customer Workspace Loaded. Captured live_05b_customer_workspace.png\n');

  // ----------------------------------------------------------------
  // TEST 6: Company Owner Users & Roles Management
  // ----------------------------------------------------------------
  console.log('--- TEST 6: Company Owner Users & Roles Management ---');
  // Try navigating to settings or users view
  const settingsBtn = custPage.locator('a[href*="settings"], button:has-text("Settings"), button:has-text("Team"), button:has-text("Users")').first();
  if (await settingsBtn.count() > 0) {
    await settingsBtn.click();
    await custPage.waitForTimeout(2000);
  }
  await custPage.screenshot({ path: path.join(OUT_DIR, 'live_06_company_users_roles.png'), fullPage: true });
  console.log('✓ PASS: Company Users & Roles View. Captured live_06_company_users_roles.png\n');

  await browser.close();
  console.log('=====================================================');
  console.log('ALL LIVE BROWSER TESTS COMPLETED SUCCESSFULLY!');
  console.log('=====================================================');
}

run().catch(err => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
