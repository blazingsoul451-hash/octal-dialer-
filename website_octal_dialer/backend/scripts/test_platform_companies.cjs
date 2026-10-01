const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.resolve(__dirname, '../../../role_verification_screenshots');

async function run() {
  console.log('Launching browser for comprehensive live platform testing...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Login as platform admin
  await page.goto('http://140.245.215.156', { waitUntil: 'networkidle' });
  await page.fill('input[type="text"], input[name="username"]', 'admin');
  await page.fill('input[type="password"]', 'AdminPassword1234!');
  await page.click('button[type="submit"], button:has-text("Login")');
  await page.waitForURL('**/admin**', { timeout: 15000 });
  await page.waitForTimeout(2000);

  console.log('\n--- Clicking on COMPANIES Navigation ---');
  await page.click('button:has-text("COMPANIES"), div:has-text("COMPANIES")');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT_DIR, 'live_03_companies_table.png'), fullPage: true });
  console.log('✓ Captured live_03_companies_table.png');

  // Find a tenant row and click to open details / ceiling drawer
  console.log('\n--- Inspecting First Company & Access Ceiling ---');
  const viewDetailBtn = await page.$('button:has-text("View Details"), button:has-text("Manage"), tr');
  if (viewDetailBtn) {
    await viewDetailBtn.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUT_DIR, 'live_04_company_detail_ceiling.png'), fullPage: true });
    console.log('✓ Captured live_04_company_detail_ceiling.png');
  }

  await browser.close();
  console.log('Platform testing steps completed successfully!');
}

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
