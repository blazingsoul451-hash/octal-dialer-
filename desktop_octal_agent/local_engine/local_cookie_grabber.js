/**
 * Octal Desktop Agent — 1-Click Zero-Extension Cookie Grabber
 * Runs locally on the user's PC using Microsoft Edge (Edge WebView2)
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
let profile = 'default_profile';
let dataDir = path.resolve(__dirname, 'data');

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--profile') profile = args[++i];
  else if (args[i] === '--dataDir') dataDir = args[++i];
}

(async () => {
  console.log(`[Desktop Agent] Launching interactive browser for profile: ${profile}...`);
  console.log('[Desktop Agent] Residential IP mode active. Real hardware rendering.');

  const profileDir = path.join(dataDir, 'profiles', profile);
  if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    channel: 'msedge', // Uses built-in Microsoft Edge on Windows
    viewport: null,
    args: [
      '--start-maximized',
      '--disable-blink-features=AutomationControlled'
    ]
  });

  const page = (await context.pages())[0] || await context.newPage();
  await page.goto('https://www.facebook.com');

  console.log('[Desktop Agent] Please log into your Facebook account in the opened window...');

  // Poll for successful login
  let captured = false;
  for (let i = 0; i < 300; i++) {
    const cookies = await context.cookies();
    const hasCUser = cookies.some(c => c.name === 'c_user');
    if (hasCUser) {
      const cookieFile = path.join(profileDir, 'cookies.json');
      fs.writeFileSync(cookieFile, JSON.stringify(cookies, null, 2));
      console.log('COOKIES_CAPTURED_SUCCESS');
      console.log(`[Desktop Agent] Successfully captured ${cookies.length} session cookies for ${profile}!`);
      captured = true;
      break;
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  await context.close();
  process.exit(captured ? 0 : 1);
})();
