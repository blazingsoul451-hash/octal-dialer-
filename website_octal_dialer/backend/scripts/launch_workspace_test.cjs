const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.resolve(__dirname, '../../../role_verification_screenshots');

async function run() {
  console.log('Testing final launch into Company Owner Workspace...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const timestamp = Date.now();
  const signupEmail = `apex_final_${timestamp}@testcorp.com`;

  await page.goto('http://140.245.215.156', { waitUntil: 'networkidle' });
  await page.click('text="Sign Up Now"');
  await page.waitForTimeout(1000);

  // Fill signup form
  const inputs = await page.$$('input');
  for (const input of inputs) {
    const ph = (await input.getAttribute('placeholder') || '').toLowerCase();
    const name = (await input.getAttribute('name') || '').toLowerCase();
    const type = (await input.getAttribute('type') || '').toLowerCase();

    if (ph.includes('business') || name.includes('business')) await input.fill('Apex Innovations Inc');
    else if (ph.includes('first') || name.includes('first')) await input.fill('Samantha');
    else if (ph.includes('last') || name.includes('last')) await input.fill('Reed');
    else if (type === 'email' || ph.includes('email') || name.includes('email')) await input.fill(signupEmail);
    else if (type === 'password' || ph.includes('password') || name.includes('password')) await input.fill('CustomerPass1234!');
    else if (ph.includes('mobile') || ph.includes('phone') || name.includes('mobile') || name.includes('phone')) await input.fill('+15552345678');
  }

  await page.click('button[type="submit"], button:has-text("Sign Up")');
  await page.waitForTimeout(3000);

  // Step 1: Continue
  console.log('Onboarding Step 1 -> Continue');
  await page.click('button:has-text("Continue")');
  await page.waitForTimeout(2000);

  // Step 2: Continue to Plan Selection
  console.log('Onboarding Step 2 -> Plan Selection');
  await page.click('button:has-text("Continue to Plan Selection")');
  await page.waitForTimeout(2000);

  // Step 3: Complete Setup & Launch Workspace
  console.log('Onboarding Step 3 -> Launch Workspace');
  await page.click('button:has-text("Complete Setup & Launch Workspace")');
  
  // Wait for company owner workspace to load
  await page.waitForTimeout(5000);
  await page.screenshot({ path: path.join(OUT_DIR, 'live_06_company_owner_workspace.png'), fullPage: true });
  console.log('✓ Captured live_06_company_owner_workspace.png');

  // Navigate to Users & Roles / Settings
  const settingsTab = page.locator('button:has-text("Settings"), a[href*="settings"], div:has-text("Settings"), nav button:has-text("Team"), nav button:has-text("Users")').first();
  if (await settingsTab.count() > 0) {
    await settingsTab.click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(OUT_DIR, 'live_07_company_settings_users.png'), fullPage: true });
    console.log('✓ Captured live_07_company_settings_users.png');
  }

  await browser.close();
  console.log('Workspace launch test completed successfully!');
}

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
