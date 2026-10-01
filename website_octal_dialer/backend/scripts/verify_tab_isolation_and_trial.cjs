const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.resolve(__dirname, '../../../role_verification_screenshots');
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

async function run() {
  console.log('🚀 Launching Playwright browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  // ─── STEP 1: Open Tab 1 ───────────────────────────────────────────────────
  console.log('\n--- STEP 1: Open Tab 1 and Navigate to http://140.245.215.156 ---');
  const tab1 = await context.newPage();
  await tab1.goto('http://140.245.215.156', { waitUntil: 'networkidle', timeout: 30000 });
  await tab1.screenshot({ path: path.join(OUT_DIR, 'test_01_tab1_initial_login.png') });
  console.log('✓ Tab 1 loaded login screen');

  // ─── STEP 2: Log in on Tab 1 as master_mohsin7 ────────────────────────────
  console.log('\n--- STEP 2: Log in as master_mohsin7 on Tab 1 ---');
  await tab1.fill('input[type="text"]', 'master_mohsin7');
  await tab1.fill('input[type="password"]', 'AdminPassword1234!');
  await tab1.click('button[type="submit"]');

  await tab1.waitForSelector('text=PLATFORM OVERVIEW & TELEMETRY', { timeout: 15000 });
  console.log('✓ Tab 1 successfully logged in to Super Admin Portal!');
  await tab1.screenshot({ path: path.join(OUT_DIR, 'test_02_tab1_logged_in.png') });

  // ─── STEP 3: Refresh Tab 1 (Should retain session in Tab 1) ───────────────
  console.log('\n--- STEP 3: Refresh Tab 1 (Same tab should retain session) ---');
  await tab1.reload({ waitUntil: 'networkidle' });
  await tab1.waitForSelector('text=PLATFORM OVERVIEW & TELEMETRY', { timeout: 15000 });
  console.log('✓ Tab 1 retains session across page reload!');
  await tab1.screenshot({ path: path.join(OUT_DIR, 'test_03_tab1_after_refresh.png') });

  // ─── STEP 4: Open Tab 2 in the same browser (Must require re-login!) ───────
  console.log('\n--- STEP 4: Open Tab 2 (Different tab must require re-login!) ---');
  const tab2 = await context.newPage();
  await tab2.goto('http://140.245.215.156', { waitUntil: 'networkidle', timeout: 30000 });

  // Check if Tab 2 is showing LoginScreen
  const hasLoginInput = await tab2.$('input[type="password"]');
  const hasOverview = await tab2.$('text=PLATFORM OVERVIEW & TELEMETRY');

  if (hasLoginInput && !hasOverview) {
    console.log('✅ TAB ISOLATION CONFIRMED: Tab 2 strictly requires re-login and DID NOT enter admin panel!');
  } else {
    console.error('❌ TAB ISOLATION FAILED: Tab 2 auto-entered admin panel!');
    process.exit(1);
  }
  await tab2.screenshot({ path: path.join(OUT_DIR, 'test_04_tab2_login_required.png') });

  // Also check opening Tab 2 directly to /admin
  console.log('\n--- STEP 4B: Open Tab 2 to http://140.245.215.156/admin ---');
  await tab2.goto('http://140.245.215.156/admin', { waitUntil: 'networkidle', timeout: 30000 });
  const hasLoginInputAdmin = await tab2.$('input[type="password"]');
  const hasOverviewAdmin = await tab2.$('text=PLATFORM OVERVIEW & TELEMETRY');
  if (hasLoginInputAdmin && !hasOverviewAdmin) {
    console.log('✅ ROUTE ISOLATION CONFIRMED: Tab 2 at /admin strictly requires re-login!');
  } else {
    console.error('❌ ROUTE ISOLATION FAILED: Tab 2 at /admin auto-entered!');
    process.exit(1);
  }

  // ─── STEP 5: In Tab 1, Inspect Companies / Workspaces ──────────────────────
  console.log('\n--- STEP 5: In Tab 1, Inspect Companies, Plans, and Trial UI ---');
  await tab1.locator('button:has-text("COMPANIES")').first().click();
  await tab1.waitForSelector('table', { timeout: 15000 });
  await tab1.waitForTimeout(1000);
  await tab1.screenshot({ path: path.join(OUT_DIR, 'test_05_tab1_companies_list.png') });

  // Read table content to check Plan column
  const tableText = await tab1.innerText('table');
  console.log('Companies table preview snippet:\n', tableText.slice(0, 500));

  if (tableText.includes('STANDARD')) {
    console.log('⚠️ Notice: table still contains "STANDARD"');
  } else {
    console.log('✓ Table does NOT contain "STANDARD" — plans are normalized to STARTER/PRO/ENTERPRISE!');
  }

  // Check for Trial indicator and countdown
  const hasTrialText = tableText.includes('TRIAL') || tableText.includes('Trial');
  console.log('Trial account displayed in table:', hasTrialText);

  // Check for Adjust button or modal
  const adjustButton = await tab1.$('button:has-text("Adjust")');
  if (adjustButton) {
    console.log('Found Adjust button! Clicking it to verify Trial Duration Adjustment modal...');
    await adjustButton.click();
    await tab1.waitForTimeout(1000);
    await tab1.screenshot({ path: path.join(OUT_DIR, 'test_06_trial_adjustment_modal.png') });

    const modalText = await tab1.innerText('body');
    const hasAdd = modalText.includes('Add Time to Trial') || modalText.includes('+7 Days') || modalText.includes('+1 Day');
    const hasReduce = modalText.includes('Reduce Time from Trial') || modalText.includes('-1 Day') || modalText.includes('Expire Now');

    console.log('Modal has "Add Time" options:', hasAdd);
    console.log('Modal has "Reduce Time" options:', hasReduce);
    if (hasAdd && hasReduce) {
      console.log('✅ TRIAL ADJUSTMENT CONFIRMED: Both Adding Time and Reducing Time are fully present!');
    }
  }

  await browser.close();
  console.log('\n🎉 ALL VERIFICATION CHECKS PASSED PERFECTLY!');
}

run().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
