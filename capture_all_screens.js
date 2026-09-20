const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const outDir = 'C:\\Users\\ice\\Pictures\\Octal_Dialer_Screenshots';
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function run() {
  console.log('Launching installed Chrome for crystal-clear screenshots...');
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true
  });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1
  });
  const page = await context.newPage();

  // 1. Login Screen (Live)
  console.log('1. Capturing Live Login Screen...');
  await page.goto('https://zestify7.online', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(outDir, '01_login_screen.png') });

  // 2. Super Admin Portal (Full Desktop 1080p)
  console.log('2. Capturing Super Admin Portal...');
  const mockupPath = 'C:/Users/ice/.gemini/antigravity/brain/6e420eba-cacc-4d93-8a48-524cc163b2c6/super_admin_portal_mockup.html';
  await page.goto('file:///' + mockupPath, { waitUntil: 'load' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(outDir, '02_super_admin_portal.png'), fullPage: true });

  // Check if local dev server running or launch local UI viewer
  const localUiViewer = 'C:/Users/ice/.gemini/antigravity/brain/6e420eba-cacc-4d93-8a48-524cc163b2c6/local_ui_viewer.html';
  if (fs.existsSync(localUiViewer)) {
    console.log('3. Capturing Local UI Viewer...');
    await page.goto('file:///' + localUiViewer, { waitUntil: 'load' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(outDir, '03_octal_dialer_cockpit.png'), fullPage: true });
  }

  await browser.close();
  console.log('ALL SCREENSHOTS CAPTURED TO:', outDir);
}

run().catch(err => {
  console.error('Capture error:', err);
  process.exit(1);
});
