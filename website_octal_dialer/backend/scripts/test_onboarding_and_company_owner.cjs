const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.resolve(__dirname, '../../../role_verification_screenshots');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

async function run() {
  console.log('Starting Live Customer Registration & Onboarding Test...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const timestamp = Date.now();
  const signupEmail = `apex_owner_${timestamp}@testcorp.com`;
  console.log(`Registering new customer account: ${signupEmail}`);

  await page.goto('http://140.245.215.156', { waitUntil: 'networkidle' });
  await page.click('text="Sign Up Now"');
  await page.waitForTimeout(1000);

  // Fill in all required fields
  const inputs = await page.$$('input');
  for (const input of inputs) {
    const ph = (await input.getAttribute('placeholder') || '').toLowerCase();
    const name = (await input.getAttribute('name') || '').toLowerCase();
    const type = (await input.getAttribute('type') || '').toLowerCase();

    if (ph.includes('business') || name.includes('business')) {
      await input.fill('Apex Innovations Inc');
    } else if (ph.includes('first') || name.includes('first')) {
      await input.fill('Samantha');
    } else if (ph.includes('last') || name.includes('last')) {
      await input.fill('Reed');
    } else if (type === 'email' || ph.includes('email') || name.includes('email')) {
      await input.fill(signupEmail);
    } else if (type === 'password' || ph.includes('password') || name.includes('password')) {
      await input.fill('CustomerPass1234!');
    } else if (ph.includes('mobile') || ph.includes('phone') || name.includes('mobile') || name.includes('phone')) {
      await input.fill('+15552345678');
    }
  }

  await page.screenshot({ path: path.join(OUT_DIR, 'live_05_signup_form_filled.png'), fullPage: true });
  console.log('✓ Captured live_05_signup_form_filled.png');

  // Click Submit
  await page.click('button[type="submit"], button:has-text("Sign Up")');
  console.log('Submitted signup form, waiting for onboarding...');

  // Wait for onboarding URL or wizard elements
  await page.waitForTimeout(4000);
  console.log('Current URL after submit:', page.url());
  await page.screenshot({ path: path.join(OUT_DIR, 'live_05a_onboarding_step1.png'), fullPage: true });
  console.log('✓ Captured live_05a_onboarding_step1.png');

  // Handle Onboarding Wizard steps if any
  const continueBtn = page.locator('button:has-text("Continue"), button:has-text("Next"), button:has-text("Get Started"), button:has-text("Complete")').first();
  if (await continueBtn.count() > 0) {
    console.log('Clicking continue button in onboarding wizard...');
    await continueBtn.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(OUT_DIR, 'live_05b_onboarding_step2.png'), fullPage: true });
    console.log('✓ Captured live_05b_onboarding_step2.png');
    
    const finalBtn = page.locator('button:has-text("Continue"), button:has-text("Finish"), button:has-text("Complete"), button:has-text("Launch")').first();
    if (await finalBtn.count() > 0) {
      await finalBtn.click();
      await page.waitForTimeout(4000);
    }
  }

  // Final Dashboard Screenshot
  await page.waitForTimeout(3000);
  console.log('Final URL:', page.url());
  await page.screenshot({ path: path.join(OUT_DIR, 'live_05c_company_dashboard.png'), fullPage: true });
  console.log('✓ Captured live_05c_company_dashboard.png');

  // Navigate to Users & Roles / Settings
  console.log('Navigating to Users & Roles in customer workspace...');
  const usersNav = page.locator('a[href*="users"], a[href*="settings"], button:has-text("Users"), button:has-text("Settings"), div:has-text("Settings")').first();
  if (await usersNav.count() > 0) {
    await usersNav.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(OUT_DIR, 'live_06_company_users_view.png'), fullPage: true });
    console.log('✓ Captured live_06_company_users_view.png');
  }

  await browser.close();
  console.log('Onboarding & Company Owner verification completed!');
}

run().catch(err => {
  console.error('Error during onboarding test:', err);
  process.exit(1);
});
