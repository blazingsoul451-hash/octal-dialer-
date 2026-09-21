const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUTPUT_DIR = path.resolve(__dirname, '..', 'LEAD_GEN_Z_LOCAL_AUDIT');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function run() {
  const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1.25
  });
  const page = await context.newPage();

  // Helper function
  async function snap(filename, desc) {
    const filePath = path.join(OUTPUT_DIR, filename);
    await page.screenshot({ path: filePath });
    console.log(`📸 Saved [${filename}]: ${desc}`);
  }

  // ─── PART 1: LEAD GEN Z (http://localhost:5174) ─────────────────────────────
  console.log('\n--- Auditing LEAD GEN Z (http://localhost:5174) ---');
  await page.goto('http://localhost:5174', { waitUntil: 'networkidle' });
  await sleep(1500);

  // 001_dashboard.png
  await snap('001_dashboard.png', 'Lead Gen Z Dashboard with KPIs, credits usage, and activity feed');

  // 002_google_leads.png
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const b = btns.find(x => x.textContent && x.textContent.includes('Google Leads'));
    if (b) b.click();
  });
  await sleep(1200);
  await snap('002_google_leads.png', 'Google Maps lead generator search workspace');

  // 003_google_results.png (Scroll table to view extracted rows & dedupe badges)
  await page.evaluate(() => window.scrollBy(0, 300));
  await sleep(600);
  await snap('003_google_results.png', 'Google Maps search results table with deduplication badges');
  await page.evaluate(() => window.scrollTo(0, 0));

  // 004_facebook_leads.png
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const b = btns.find(x => x.textContent && x.textContent.includes('Facebook Leads'));
    if (b) b.click();
  });
  await sleep(1200);
  await snap('004_facebook_leads.png', 'Facebook lead generator with execution console and extracted profiles');

  // 005_lead_lists.png
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const b = btns.find(x => x.textContent && x.textContent.includes('Lead Lists'));
    if (b) b.click();
  });
  await sleep(1200);
  await snap('005_lead_lists.png', 'Lead Lists workspace (Dubai Real Estate, Dental Clinics Texas)');

  // 006_saved_leads.png
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const b = btns.find(x => x.textContent && x.textContent.includes('Saved Leads'));
    if (b) b.click();
  });
  await sleep(1200);
  await snap('006_saved_leads.png', 'Saved Leads master repository with deduplication status indicators');

  // 007_export.png
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const b = btns.find(x => x.textContent && x.textContent.includes('Exports'));
    if (b) b.click();
  });
  await sleep(1200);
  await snap('007_export.png', 'Exports center with CSV & XLSX dataset download options');

  // 008_send_to_zestify.png (Open Send to Zestify modal)
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const b = btns.find(x => x.textContent && x.textContent.includes('Saved Leads'));
    if (b) b.click();
  });
  await sleep(800);
  // Select first two rows
  await page.evaluate(() => {
    const checkboxes = Array.from(document.querySelectorAll('tbody input[type="checkbox"]'));
    if (checkboxes[0]) checkboxes[0].click();
    if (checkboxes[1]) checkboxes[1].click();
  });
  await sleep(600);
  // Click Send to Zestify button
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const sendBtn = btns.find(x => x.textContent && x.textContent.includes('Send to Zestify'));
    if (sendBtn) sendBtn.click();
  });
  await sleep(1000);
  await snap('008_send_to_zestify.png', 'Send to Zestify modal with workspace, CRM company, team, and campaign mapping');

  // Close modal
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const cancelBtn = btns.find(x => x.textContent && x.textContent.includes('Cancel'));
    if (cancelBtn) cancelBtn.click();
  });
  await sleep(600);

  // 009_integrations.png
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const b = btns.find(x => x.textContent && x.textContent.includes('Integrations'));
    if (b) b.click();
  });
  await sleep(1200);
  await snap('009_integrations.png', 'Integrations view with Zestify Direct Connect status & boundary contract');

  // 010_settings.png
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const b = btns.find(x => x.textContent && x.textContent.includes('Settings'));
    if (b) b.click();
  });
  await sleep(1200);
  await snap('010_settings.png', 'Settings page with deduplication matching rules and future cloud architecture');

  // ─── PART 2: ZESTIFY CRM (http://localhost:5173) ────────────────────────────
  console.log('\n--- Auditing Zestify CRM (http://localhost:5173) ---');
  // Login to Zestify
  try {
    const loginRes = await fetch('http://localhost:5000/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'AdminPassword1234!' })
    });
    const loginData = await loginRes.json();
    const token = loginData.token || '';

    await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
    await page.evaluate((data) => {
      localStorage.setItem('octal_auth_token', data.jwt);
      localStorage.setItem('octal_auth_user', data.user.username || 'admin');
      localStorage.setItem('octal_auth_role', data.user.role || 'admin');
      localStorage.setItem('octal_theme', 'dark');
    }, { jwt: token, user: loginData.user || { username: 'admin', role: 'admin' } });

    await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
    await sleep(2500);

    // 011_zestify_navigation.png
    await snap('011_zestify_navigation.png', 'Zestify navigation sidebar showing scrapers removed from customer navigation');

    // Navigate to Company Settings
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, a'));
      const settingsBtn = btns.find(x => x.textContent && x.textContent.includes('Settings'));
      if (settingsBtn) settingsBtn.click();
    });
    await sleep(1800);

    // 012_zestify_company_modules.png
    await page.evaluate(() => window.scrollBy(0, 300));
    await sleep(600);
    await snap('012_zestify_company_modules.png', 'Zestify Company Settings showing active company modules without scrapers');

  } catch (zErr) {
    console.error('Error capturing Zestify screens:', zErr);
  }

  await browser.close();
  console.log('\n✅ All 12 audit screenshots successfully captured into LEAD_GEN_Z_LOCAL_AUDIT/');
}

run().catch(console.error);
