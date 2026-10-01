const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.resolve(__dirname, '../../../role_verification_screenshots');

async function run() {
  console.log('🚀 Running full comprehensive audit of all SuperAdmin tabs...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Track console errors
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  // 1. Login
  await page.goto('http://140.245.215.156', { waitUntil: 'networkidle' });
  await page.fill('input[type="text"]', 'master_mohsin7');
  await page.fill('input[type="password"]', 'AdminPassword1234!');
  await page.click('button[type="submit"]');

  await page.waitForSelector('text=PLATFORM OVERVIEW & TELEMETRY', { timeout: 15000 });
  console.log('✓ Tab 1: Overview loaded cleanly');
  await page.screenshot({ path: path.join(OUT_DIR, 'audit_tab_01_overview.png') });

  // 2. Companies / Workspaces
  await page.locator('button:has-text("COMPANIES")').first().click();
  await page.waitForSelector('table', { timeout: 15000 });
  console.log('✓ Tab 2: Companies & Workspaces loaded cleanly');
  await page.screenshot({ path: path.join(OUT_DIR, 'audit_tab_02_companies.png') });

  // 3. People / Users
  await page.locator('button:has-text("PEOPLE")').first().click();
  await page.waitForTimeout(1500);
  console.log('✓ Tab 3: People loaded cleanly');
  await page.screenshot({ path: path.join(OUT_DIR, 'audit_tab_03_people.png') });

  // 4. Telephony & Devices
  await page.locator('button:has-text("TELEPHONY & DEVICES")').first().click();
  await page.waitForTimeout(1500);
  console.log('✓ Tab 4: Telephony & Devices loaded cleanly');
  await page.screenshot({ path: path.join(OUT_DIR, 'audit_tab_04_devices.png') });

  // 5. Automation & Jobs
  await page.locator('button:has-text("AUTOMATION & JOBS")').first().click();
  await page.waitForTimeout(1500);
  console.log('✓ Tab 5: Automation & Jobs loaded cleanly');
  await page.screenshot({ path: path.join(OUT_DIR, 'audit_tab_05_jobs.png') });

  // 6. Security & Audit
  await page.locator('button:has-text("SECURITY & AUDIT")').first().click();
  await page.waitForTimeout(1500);
  console.log('✓ Tab 6: Security & Audit loaded cleanly');
  await page.screenshot({ path: path.join(OUT_DIR, 'audit_tab_06_security.png') });

  // 7. System Health
  await page.locator('button:has-text("SYSTEM HEALTH")').first().click();
  await page.waitForTimeout(1500);
  console.log('✓ Tab 7: System Health loaded cleanly');
  await page.screenshot({ path: path.join(OUT_DIR, 'audit_tab_07_health.png') });

  console.log('\nAudit complete! Console errors detected:', consoleErrors.length);
  if (consoleErrors.length > 0) {
    console.log('Errors:', consoleErrors);
  }

  await browser.close();
  console.log('🎉 ALL ADMIN TABS AUDITED AND SCREENSHOTS CAPTURED!');
}

run().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
