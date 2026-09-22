const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const http = require('http');

const OUTPUT_DIR = path.resolve(__dirname, '../../audit_screenshots');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function loginApi() {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ username: 'admin', password: 'AdminPassword1234!' });
    const req = http.request({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, res => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function impersonateApi(token, tenantId) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ reason: 'Audit & Telemetry Verification' });
    const req = http.request({
      hostname: '127.0.0.1',
      port: 5000,
      path: `/api/super-admin/impersonate/${tenantId}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'Authorization': `Bearer ${token}`
      }
    }, res => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function run() {
  console.log('Logging in via API...');
  const loginRes = await loginApi();
  if (!loginRes.token) {
    throw new Error('API Login failed: ' + JSON.stringify(loginRes));
  }
  const token = loginRes.token;
  const username = loginRes.user.username;
  console.log(`Logged in as ${username}, token acquired.`);

  console.log('Launching headless Chrome...');
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--window-size=1440,900'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // Pre-seed localStorage before navigation
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
  await page.evaluate((tok, usr) => {
    localStorage.setItem('octal_auth_token', tok);
    localStorage.setItem('octal_auth_user', usr);
  }, token, username);

  // Reload with authenticated session
  console.log('Navigating to authenticated Platform Console...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
  await sleep(2500);

  // Screenshot 01: Platform Overview
  console.log('Capturing 01_platform_overview.png...');
  await page.screenshot({ path: path.join(OUTPUT_DIR, '01_platform_overview.png'), fullPage: false });

  // Screenshot 02: Workspaces Table
  console.log('Switching to Workspaces tab...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const wsBtn = buttons.find(b => b.textContent && b.textContent.includes('WORKSPACES'));
    if (wsBtn) wsBtn.click();
  });
  await sleep(1500);
  console.log('Capturing 02_workspace_table.png...');
  await page.screenshot({ path: path.join(OUTPUT_DIR, '02_workspace_table.png'), fullPage: false });

  // Screenshot 03: Workspace Detail (Drawer - Overview / Summary tab)
  console.log('Opening Workspace Detail Drawer...');
  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('tbody tr'));
    if (rows.length > 0) {
      rows[0].click();
    }
  });
  await sleep(2000);
  console.log('Capturing 03_workspace_detail.png...');
  await page.screenshot({ path: path.join(OUTPUT_DIR, '03_workspace_detail.png'), fullPage: false });

  // Screenshot 04: Workspace Users tab (Verifying Platform Admin is strictly absent)
  console.log('Switching to Users tab in drawer...');
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('button'));
    const userTab = tabs.find(b => b.textContent && b.textContent.includes('Users ('));
    if (userTab) userTab.click();
  });
  await sleep(1500);
  console.log('Capturing 04_workspace_users.png...');
  await page.screenshot({ path: path.join(OUTPUT_DIR, '04_workspace_users.png'), fullPage: false });

  // Screenshot 05: Workspace Teams tab
  console.log('Switching to Teams tab in drawer...');
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('button'));
    const teamTab = tabs.find(b => b.textContent && b.textContent.includes('Teams ('));
    if (teamTab) teamTab.click();
  });
  await sleep(1500);
  console.log('Capturing 05_workspace_teams.png...');
  await page.screenshot({ path: path.join(OUTPUT_DIR, '05_workspace_teams.png'), fullPage: false });

  // Screenshot 06: Access Matrix tab
  console.log('Switching to Access Matrix tab in drawer...');
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('button'));
    const matrixTab = tabs.find(b => b.textContent && b.textContent.includes('Access Matrix'));
    if (matrixTab) matrixTab.click();
  });
  await sleep(1500);
  console.log('Capturing 06_access_matrix.png...');
  await page.screenshot({ path: path.join(OUTPUT_DIR, '06_access_matrix.png'), fullPage: false });

  // Screenshot 07: Module Entitlements tab
  console.log('Switching to Module Entitlements tab in drawer...');
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('button'));
    const modTab = tabs.find(b => b.textContent && b.textContent.includes('Module Ceiling'));
    if (modTab) modTab.click();
  });
  await sleep(1500);
  console.log('Capturing 07_module_entitlements.png...');
  await page.screenshot({ path: path.join(OUTPUT_DIR, '07_module_entitlements.png'), fullPage: false });

  // Screenshot 08: Seat Management Modal
  console.log('Opening Seat Management Modal...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const seatBtn = buttons.find(b => b.textContent && b.textContent.includes('Edit Seat Limits'));
    if (seatBtn) seatBtn.click();
  });
  await sleep(1500);
  console.log('Capturing 08_seat_management.png...');
  await page.screenshot({ path: path.join(OUTPUT_DIR, '08_seat_management.png'), fullPage: false });

  // Close Seat Modal
  await page.evaluate(() => {
    const cancelBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.trim() === 'Cancel');
    if (cancelBtn) cancelBtn.click();
  });
  await sleep(1000);

  // Screenshot 09: Impersonation Dialog
  console.log('Opening Impersonation Modal...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const impBtn = buttons.find(b => b.textContent && b.textContent.includes('Impersonate Support'));
    if (impBtn) impBtn.click();
  });
  await sleep(1500);
  console.log('Capturing 09_impersonation_dialog.png...');
  await page.screenshot({ path: path.join(OUTPUT_DIR, '09_impersonation_dialog.png'), fullPage: false });

  // Close Impersonation Modal
  console.log('Closing Impersonation Modal...');
  await page.evaluate(() => {
    const cancelBtn = Array.from(document.querySelectorAll('div.fixed button')).find(b => b.textContent && b.textContent.trim() === 'Cancel');
    if (cancelBtn) cancelBtn.click();
  });
  await sleep(1000);

  // Close Drawer cleanly by clicking the backdrop overlay
  console.log('Closing Detail Drawer via backdrop...');
  await page.evaluate(() => {
    const backdropOverlay = document.querySelector('div.fixed.inset-0 div.absolute.inset-0');
    if (backdropOverlay) {
      backdropOverlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
  });
  await sleep(1200);

  // Screenshot 10: Impersonation Active in Customer Workspace
  console.log('Generating audited impersonation token for Workspace...');
  const tenantRes = await new Promise((resolve) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/super-admin/tenants?limit=1',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    }, res => {
      let raw = ''; res.on('data', c => raw += c); res.on('end', () => resolve(JSON.parse(raw)));
    });
    req.end();
  });

  const targetTenant = tenantRes.tenants && tenantRes.tenants[0];
  if (targetTenant) {
    const impData = await impersonateApi(token, targetTenant.id);
    console.log('Opening customer workspace with impersonation banner...');
    const customerPage = await browser.newPage();
    await customerPage.setViewport({ width: 1440, height: 900 });

    const targetUserName = impData.user.displayName || impData.user.username;
    const targetUserRole = impData.user.role === 'admin' ? 'Company Owner' : 'Member';
    const hashUrl = `http://localhost:5173/#impersonateToken=${encodeURIComponent(impData.token)}&impersonateTenant=${encodeURIComponent(targetTenant.name)}&impersonateUser=${encodeURIComponent(targetUserName)}&impersonateRole=${encodeURIComponent(targetUserRole)}`;

    await customerPage.goto(hashUrl, { waitUntil: 'networkidle0' });
    await sleep(2500);
    console.log('Capturing 10_impersonation_active.png...');
    await customerPage.screenshot({ path: path.join(OUTPUT_DIR, '10_impersonation_active.png'), fullPage: false });
    await customerPage.close();
  }

  // Ensure primary page is on the SuperAdmin console (re-navigate if needed)
  await page.bringToFront();
  await page.evaluate((tok, usr) => {
    localStorage.setItem('octal_auth_token', tok);
    localStorage.setItem('octal_auth_user', usr);
  }, token, username);
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
  await sleep(2000);

  // Screenshot 11: Devices & Telephony
  console.log('Switching to Devices tab...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('aside nav button'));
    const devBtn = buttons.find(b => b.textContent && b.textContent.includes('DEVICES'));
    if (devBtn) devBtn.click();
  });
  await sleep(1500);
  console.log('Capturing 11_devices.png...');
  await page.screenshot({ path: path.join(OUTPUT_DIR, '11_devices.png'), fullPage: false });

  // Screenshot 12: Jobs & Automation
  console.log('Switching to Jobs tab...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('aside nav button'));
    const jobBtn = buttons.find(b => b.textContent && b.textContent.includes('AUTOMATION & JOBS'));
    if (jobBtn) jobBtn.click();
  });
  await sleep(1500);
  console.log('Capturing 12_jobs.png...');
  await page.screenshot({ path: path.join(OUTPUT_DIR, '12_jobs.png'), fullPage: false });

  // Screenshot 13: Platform Activity
  console.log('Switching to Activity tab...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('aside nav button'));
    const actBtn = buttons.find(b => b.textContent && b.textContent.includes('PLATFORM ACTIVITY'));
    if (actBtn) actBtn.click();
  });
  await sleep(1500);
  console.log('Capturing 13_platform_activity.png...');
  await page.screenshot({ path: path.join(OUTPUT_DIR, '13_platform_activity.png'), fullPage: false });

  // Screenshot 14: System Health
  console.log('Switching to Health tab...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('aside nav button'));
    const hBtn = buttons.find(b => b.textContent && b.textContent.includes('SYSTEM HEALTH'));
    if (hBtn) hBtn.click();
  });
  await sleep(1500);
  console.log('Capturing 14_system_health.png...');
  await page.screenshot({ path: path.join(OUTPUT_DIR, '14_system_health.png'), fullPage: false });

  // Screenshot 15: Provision Workspace Modal
  console.log('Opening Provision Workspace Modal...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('header button'));
    const provBtn = buttons.find(b => b.textContent && b.textContent.includes('Provision Workspace'));
    if (provBtn) provBtn.click();
  });
  await sleep(1500);
  console.log('Capturing 15_provision_workspace.png...');
  await page.screenshot({ path: path.join(OUTPUT_DIR, '15_provision_workspace.png'), fullPage: false });

  await browser.close();
  console.log('All 15 screenshots successfully captured in:', OUTPUT_DIR);
}

run().catch(err => {
  console.error('Execution failed:', err);
  process.exit(1);
});
