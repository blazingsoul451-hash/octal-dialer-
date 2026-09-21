const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.resolve(__dirname, '../../audit_screenshots');
const ARTIFACT_DIR = 'C:/Users/ice/.gemini/antigravity/brain/6e420eba-cacc-4d93-8a48-524cc163b2c6';

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

async function run() {
  console.log('Starting Settings Cleanup Audit capture...');

  // 1. Log in via API to get owner token
  const loginRes = await fetch('http://127.0.0.1:5000/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'owner', password: 'OwnerPassword1234!' })
  });
  const loginData = await loginRes.json();
  if (!loginData.token) {
    throw new Error('Failed to log in as owner: ' + JSON.stringify(loginData));
  }
  console.log('Logged in as owner, token received.');

  // 2. Launch browser
  const browser = await chromium.launch({
    headless: true,
    channel: 'msedge'
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  // 3. Navigate to app and inject auth tokens
  await page.goto('http://localhost:5173');
  await page.evaluate(({ token, user }) => {
    localStorage.setItem('octal_auth_token', token);
    localStorage.setItem('octal_auth_user', user);
    localStorage.setItem('octal_theme', 'dark');
  }, { token: loginData.token, user: 'owner' });

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // 4. Open Settings tab
  console.log('Navigating to Settings tab...');
  const settingsBtn = await page.$('#topbar-settings-btn');
  if (settingsBtn) {
    await settingsBtn.click();
  } else {
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.title?.includes('Settings') || b.textContent?.includes('Settings'));
      if (btn) btn.click();
    });
  }
  await page.waitForTimeout(1500);

  async function saveScreenshot(filename) {
    const p1 = path.join(OUT_DIR, filename);
    const p2 = path.join(ARTIFACT_DIR, filename);
    await page.screenshot({ path: p1, fullPage: false });
    fs.copyFileSync(p1, p2);
    console.log(`Saved screenshot: ${filename}`);
  }

  // ─── 01: Settings Overview ──────────────────────────────────────────────────
  console.log('Capturing 01_settings_overview.png...');
  await page.waitForSelector('#card-company-profile', { timeout: 10000 });
  await page.waitForTimeout(800);
  await saveScreenshot('01_settings_overview.png');

  // ─── 02: Company Profile ────────────────────────────────────────────────────
  console.log('Capturing 02_company_profile.png...');
  await page.click('#card-company-profile');
  await page.waitForTimeout(1200);
  await saveScreenshot('02_company_profile.png');

  // Return to Overview
  await page.click('button:has-text("Back to Overview"), button:has-text("All Settings")');
  await page.waitForTimeout(800);

  // ─── 03: Users & Roles ──────────────────────────────────────────────────────
  console.log('Capturing 03_users_roles.png...');
  await page.click('#card-users-roles');
  await page.waitForTimeout(1500);
  await saveScreenshot('03_users_roles.png');

  // ─── 04: User Edit Modules ──────────────────────────────────────────────────
  console.log('Capturing 04_user_edit_modules.png...');
  // Click on 'Users (' sub-tab within Users & Roles
  const usersSubTab = await page.$('button:has-text("Users (")');
  if (usersSubTab) {
    await usersSubTab.click();
    await page.waitForTimeout(1000);
  }

  // Find the Edit User button for agent1 (the second row) so checkboxes are visible
  const editUserBtns = await page.$$('button[title="Edit User"]');
  if (editUserBtns.length > 1) {
    await editUserBtns[1].click();
  } else if (editUserBtns.length > 0) {
    await editUserBtns[0].click();
  }
  await page.waitForTimeout(1200);
  await saveScreenshot('04_user_edit_modules.png');

  // Close drawer/modal
  const cancelDrawerBtn = await page.$('button:has-text("Cancel"), button:has-text("Close"), button:has-text("✕")');
  if (cancelDrawerBtn) {
    await cancelDrawerBtn.click();
    await page.waitForTimeout(600);
  }

  // Click Back to Settings in UsersAndRolesView header
  const backToSettingsBtn = await page.$('button[title="Back to Settings"]');
  if (backToSettingsBtn) {
    await backToSettingsBtn.click();
    await page.waitForTimeout(800);
  }

  // ─── 05: Account Settings ───────────────────────────────────────────────────
  console.log('Capturing 05_account.png...');
  await page.waitForSelector('#card-account', { timeout: 10000 });
  await page.click('#card-account');
  await page.waitForTimeout(1200);
  await saveScreenshot('05_account.png');

  // Return to Overview
  await page.click('button:has-text("Back to Overview"), button:has-text("All Settings")');
  await page.waitForTimeout(800);

  // ─── 06: Billing & Plans ────────────────────────────────────────────────────
  console.log('Capturing 06_billing.png...');
  await page.waitForSelector('#card-billing', { timeout: 10000 });
  await page.click('#card-billing');
  await page.waitForTimeout(1200);
  await saveScreenshot('06_billing.png');

  await browser.close();
  console.log('All 6 audit screenshots captured successfully!');
}

run().catch(err => {
  console.error('Capture error:', err);
  process.exit(1);
});
