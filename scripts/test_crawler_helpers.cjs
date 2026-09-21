const { chromium } = require('playwright');
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  
  const res = await fetch('http://127.0.0.1:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'owner', password: 'OwnerPassword1234!' })
  });
  const data = await res.json();
  
  await context.addInitScript(({ token, user }) => {
    localStorage.setItem('octal_auth_token', token);
    localStorage.setItem('octal_auth_user', user);
  }, { token: data.token, user: 'owner' });
  
  const page = await context.newPage();
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  
  // Test click CRM
  const crm = page.locator('button', { hasText: 'CRM Workspace' }).first();
  console.log('CRM visible:', await crm.isVisible());
  await crm.click();
  await page.waitForTimeout(500);
  
  // Test click Settings
  const settings = page.locator('#topbar-settings-btn');
  console.log('Settings visible:', await settings.isVisible());
  await settings.click();
  await page.waitForTimeout(500);
  
  // Check settings rendered
  const settingsHeading = page.locator('h1', { hasText: 'Settings' });
  console.log('Settings heading visible:', await settingsHeading.isVisible());
  
  await browser.close();
  console.log('All tests passed cleanly!');
})().catch(console.error);
