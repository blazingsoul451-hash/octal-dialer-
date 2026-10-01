const { chromium } = require('playwright');

async function test() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER LOG:', msg.type(), msg.text()));
  page.on('requestfailed', request => console.log('FAILED REQUEST:', request.url(), request.failure()?.errorText));
  page.on('response', response => {
    if (response.status() >= 400) {
      console.log('HTTP ERROR:', response.status(), response.url());
    }
  });

  console.log('Navigating to https://zestify7.online/admin...');
  await page.goto('https://zestify7.online/admin', { waitUntil: 'networkidle', timeout: 30000 });

  console.log('Filling form...');
  await page.fill('input[type="text"], input[name="username"], input[placeholder*="email" i], input[placeholder*="username" i]', 'master_mohsin7');
  await page.fill('input[type="password"]', 'testpassword123');
  
  console.log('Clicking login...');
  await page.click('button[type="submit"], button:has-text("Login")');

  await page.waitForTimeout(4000);
  
  const errorText = await page.textContent('.text-red-500, .bg-red-500\\/10, [class*="red"]').catch(() => null);
  console.log('Error text on page:', errorText);

  await browser.close();
}

test().catch(console.error);
