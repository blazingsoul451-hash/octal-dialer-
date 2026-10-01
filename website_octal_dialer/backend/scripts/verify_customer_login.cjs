const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.resolve(__dirname, '../../../role_verification_screenshots');

async function run() {
  console.log('🚀 Testing customer trial account login (mohsin_mughal7)...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Login as mohsin_mughal7
  await page.goto('http://140.245.215.156', { waitUntil: 'networkidle' });
  await page.fill('input[type="text"]', 'mohsin_mughal7');
  await page.fill('input[type="password"]', 'CompanyPassword1234!');
  await page.click('button[type="submit"]');

  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(OUT_DIR, 'test_08_customer_trial_workspace.png') });
  console.log('✓ Captured test_08_customer_trial_workspace.png');

  // Check if trial pill exists in header
  const pageText = await page.innerText('body');
  const hasTrialPill = pageText.includes('Trial:') || pageText.includes('Free Trial');
  console.log('Customer sees Trial countdown pill in top header:', hasTrialPill);

  await browser.close();
  console.log('✓ Customer trial login test completed successfully!');
}

run().catch(console.error);
