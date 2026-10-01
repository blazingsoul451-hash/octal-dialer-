const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.resolve(__dirname, '../../../role_verification_screenshots');

async function run() {
  console.log('Opening Company Owner Settings & Users/Roles Modal...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Login as Samantha Reed (Company Owner)
  await page.goto('http://140.245.215.156', { waitUntil: 'networkidle' });
  await page.fill('input[type="text"], input[name="username"]', 'samanthareed_175b');
  await page.fill('input[type="password"]', 'CustomerPass1234!');
  await page.click('button[type="submit"], button:has-text("Login")');
  await page.waitForTimeout(4000);

  console.log('Finding and clicking Settings gear icon...');
  // Find gear button in header
  const gearBtn = page.locator('header button svg.lucide-settings, button svg.lucide-settings, header button:has(svg)').nth(1);
  if (await gearBtn.count() > 0) {
    await gearBtn.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUT_DIR, 'live_08_company_settings_modal.png'), fullPage: true });
    console.log('✓ Captured live_08_company_settings_modal.png');

    // Click on "Users & Roles" or "Team" tab inside settings modal
    const usersTab = page.locator('button:has-text("Users & Roles"), button:has-text("Users"), button:has-text("Team")').first();
    if (await usersTab.count() > 0) {
      await usersTab.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: path.join(OUT_DIR, 'live_09_company_users_and_roles_tab.png'), fullPage: true });
      console.log('✓ Captured live_09_company_users_and_roles_tab.png');
    }
  }

  await browser.close();
  console.log('Settings verification completed!');
}

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
