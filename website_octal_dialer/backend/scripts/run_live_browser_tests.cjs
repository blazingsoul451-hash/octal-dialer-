const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.resolve(__dirname, '../../../role_verification_screenshots');
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

async function run() {
  console.log('Launching browser for live production testing...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log('\n--- TEST 1: Public Homepage & Login Screen ---');
  await page.goto('http://140.245.215.156', { waitUntil: 'networkidle', timeout: 30000 });
  await page.screenshot({ path: path.join(OUT_DIR, 'live_01_login_screen.png'), fullPage: true });
  console.log('✓ Captured live_01_login_screen.png');

  console.log('\n--- TEST 2: Platform Owner Login & Super Admin Portal ---');
  // Fill in platform admin credentials
  await page.fill('input[type="text"], input[name="username"], input[placeholder*="username" i]', 'admin');
  await page.fill('input[type="password"]', 'AdminPassword1234!');
  await page.click('button[type="submit"], button:has-text("Sign In"), button:has-text("Login")');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUT_DIR, 'live_02_platform_admin_view.png'), fullPage: true });
  console.log('✓ Captured live_02_platform_admin_view.png');

  // Verify navigation to Super Admin / Companies if in customer portal or toggle
  const currentUrl = page.url();
  console.log('Current URL after login:', currentUrl);

  await browser.close();
  console.log('\nInitial browser checks completed successfully!');
}

run().catch(err => {
  console.error('Browser Test Error:', err);
  process.exit(1);
});
