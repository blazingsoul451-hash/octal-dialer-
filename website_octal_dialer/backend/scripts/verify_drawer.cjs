const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.resolve(__dirname, '../../../role_verification_screenshots');

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto('http://140.245.215.156', { waitUntil: 'networkidle' });
  await page.fill('input[type="text"]', 'master_mohsin7');
  await page.fill('input[type="password"]', 'AdminPassword1234!');
  await page.click('button[type="submit"]');

  await page.waitForSelector('text=PLATFORM OVERVIEW & TELEMETRY', { timeout: 15000 });
  await page.locator('button:has-text("COMPANIES")').first().click();
  await page.waitForSelector('table', { timeout: 15000 });

  // Click on nano banana row
  await page.locator('tr:has-text("nano banana")').click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT_DIR, 'test_07_nano_banana_drawer.png') });
  console.log('✓ Captured test_07_nano_banana_drawer.png');

  await browser.close();
}

run().catch(console.error);
