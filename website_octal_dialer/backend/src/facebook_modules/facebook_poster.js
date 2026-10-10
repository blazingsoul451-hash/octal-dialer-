'use strict';

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────
//  SETTINGS & ARGUMENT PARSING
// ─────────────────────────────────────────────────────────────
let mode = 'share'; // 'share' or 'join'
let profileName = '';
let tenantName = 'default';
let customProfileDir = '';
let customDataDir = '';

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--mode') mode = args[++i];
  else if (args[i] === '--profile') profileName = args[++i];
  else if (args[i] === '--tenant') tenantName = args[++i];
  else if (args[i] === '--profileDir') customProfileDir = args[++i];
  else if (args[i] === '--dataDir') customDataDir = args[++i];
}

if (!profileName) {
  console.error('❌ Error: --profile is required.');
  process.exit(1);
}

const profileDir = customProfileDir || path.resolve(__dirname, '..', '..', 'data', 'facebook_profiles', tenantName, profileName);
const dataDir = customDataDir || path.resolve(__dirname, '..', '..', 'data', 'facebook_poster', tenantName);

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });

const configPath = path.join(dataDir, 'fb_config.json');
const joinConfigPath = path.join(dataDir, 'fb_join_config.json');
const groupsPath = path.join(dataDir, 'fb_groups.json');
const activityPath = path.join(dataDir, 'fb_activity_log.json');
const accountsPath = path.join(dataDir, 'accounts.json');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const randomBetween = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const humanDelay = (min = 1500, max = 4000) => sleep(randomBetween(min, max));

function updateAccountStatus(profileId, status) {
  try {
    if (fs.existsSync(accountsPath)) {
      const accounts = JSON.parse(fs.readFileSync(accountsPath, 'utf8'));
      let changed = false;
      for (const a of accounts) {
        if (a.profileId === profileId) {
          a.status = status;
          changed = true;
        }
      }
      if (changed) {
        fs.writeFileSync(accountsPath, JSON.stringify(accounts, null, 2), 'utf8');
      }
    }
  } catch (_) {}
}

function logActivity(type, account, detail, status = 'success') {
  try {
    const list = fs.existsSync(activityPath) ? JSON.parse(fs.readFileSync(activityPath, 'utf8')) : [];
    list.unshift({
      time: new Date().toISOString(),
      type, // 'share' or 'join'
      account,
      detail,
      status
    });
    // Keep last 250 records
    fs.writeFileSync(activityPath, JSON.stringify(list.slice(0, 250), null, 2), 'utf8');
  } catch (_) {}
}

async function typeLikeAHuman(page, locator, text) {
  await locator.click();
  await humanDelay(800, 1600);
  for (const char of text) {
    if (char === '\n') {
      await page.keyboard.press('Shift+Enter');
      await sleep(randomBetween(120, 280));
    } else {
      await page.keyboard.insertText(char);
      await sleep(randomBetween(30, 85));
    }
  }
}

(async () => {
  console.log(`🚀 Starting Auto Poster Bot in mode: ${mode.toUpperCase()} on Profile: ${profileName}...`);
  console.log(`📁 Profile directory: ${profileDir}`);
  console.log(`📁 Data directory: ${dataDir}`);

  let browser, context;
  try {
    // Stealth Chromium launch configuration
    const launchOptions = {
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-infobars',
        '--disable-gpu',
        '--lang=en-US',
        '--window-size=1280,800',
        '--disable-dev-shm-usage',
        '--no-first-run',
        '--no-service-autorun'
      ],
      ignoreDefaultArgs: ['--enable-automation'],
      locale: 'en-US',
      viewport: { width: 1280, height: 800 }
    };

    context = await chromium.launchPersistentContext(profileDir, launchOptions);

    // Inject cookies if stored in profile folder
    const cookiesFile = path.join(profileDir, 'cookies.json');
    if (fs.existsSync(cookiesFile)) {
      try {
        const rawCookies = JSON.parse(fs.readFileSync(cookiesFile, 'utf8'));
        if (Array.isArray(rawCookies) && rawCookies.length > 0) {
          const sanitizedCookies = rawCookies.map(c => ({
            name: c.name,
            value: c.value,
            domain: c.domain ? c.domain.replace(/^\.?/, '.') : '.facebook.com',
            path: c.path || '/',
            expires: c.expires || c.expirationDate || Math.floor(Date.now() / 1000) + 86400 * 30,
            httpOnly: !!c.httpOnly,
            secure: c.secure !== undefined ? !!c.secure : true,
            sameSite: c.sameSite === 'Strict' || c.sameSite === 'Lax' || c.sameSite === 'None' ? c.sameSite : 'Lax'
          }));
          await context.addCookies(sanitizedCookies);
          console.log(`🍪 Injected ${sanitizedCookies.length} session cookies.`);
        }
      } catch (err) {
        console.warn(`⚠️ Warning: could not parse cookies.json: ${err.message}`);
      }
    }

    const page = (await context.pages())[0] || await context.newPage();

    // Stealth evasion script
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      window.chrome = { runtime: {} };
    });

    // ─────────────────────────────────────────────────────────────
    //  SESSION HEALTH CHECK
    // ─────────────────────────────────────────────────────────────
    console.log('🔍 Verifying Facebook session health...');
    await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 40000 });
    await humanDelay(2000, 3500);

    const currentUrl = page.url();
    const isLoginPage = currentUrl.includes('/login') || currentUrl.includes('login_attempt') ||
      (await page.locator('input[name="email"], input[id="email"]').isVisible().catch(() => false));

    if (isLoginPage) {
      console.error('❌ Session invalid/expired: Facebook redirected to login page.');
      updateAccountStatus(profileName, 'expired');
      logActivity(mode, profileName, 'Session invalid or expired (redirected to login)', 'failed');
      await context.close();
      process.exit(1);
    }

    // Check if security checkpoint or temporary block
    const isRestricted = await page.locator('text="You\'re Temporarily Blocked", text="Account Restricted", text="We suspended your account"').first().isVisible().catch(() => false);
    if (isRestricted) {
      console.error('🛑 Facebook Action Block or Account Restriction detected.');
      updateAccountStatus(profileName, 'error');
      logActivity(mode, profileName, 'Account has temporary Facebook action block or checkpoint', 'failed');
      await context.close();
      process.exit(1);
    }

    console.log('✅ Session active and verified.');
    updateAccountStatus(profileName, 'valid');

    if (mode === 'share') {
      // ─────────────────────────────────────────────────────────────
      //  SHARE MODE
      // ─────────────────────────────────────────────────────────────
      if (!fs.existsSync(configPath)) {
        console.error('❌ Configuration file fb_config.json not found.');
        await context.close();
        process.exit(1);
      }

      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const postUrls = config.postUrls || [];
      const caption = config.caption || '';

      if (postUrls.length === 0 && !caption) {
        console.log('⚠️ No post URLs or caption configured. Nothing to share.');
        await context.close();
        process.exit(0);
      }

      // Load target groups to share to
      let groups = [];
      if (fs.existsSync(groupsPath)) {
        try { groups = JSON.parse(fs.readFileSync(groupsPath, 'utf8')); } catch (_) {}
      }
      const targetGroups = groups.filter(g => g.status === 'member' || g.status === 'approved' || !g.status);

      if (targetGroups.length === 0) {
        console.log('⚠️ No groups found for sharing. Please add target groups or run auto joiner first.');
        await context.close();
        process.exit(0);
      }

      console.log(`📢 Target queue: ${targetGroups.length} groups.`);

      for (let idx = 0; idx < targetGroups.length; idx++) {
        const group = targetGroups[idx];
        try {
          // Normalize URL and lock target to /discussion tab
          let cleanUrl = group.url.split('?')[0].replace(/\/+$/, '');
          if (!cleanUrl.endsWith('/discussion') && !cleanUrl.endsWith('/feed')) {
            cleanUrl += '/discussion';
          }

          console.log(`\n[${idx + 1}/${targetGroups.length}] Navigating to: ${group.name} (${cleanUrl})`);
          await page.goto(cleanUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
          await humanDelay(2000, 4000); // Human reading delay

          // Check for action block notice on page
          if (await page.locator('text="You\'re Temporarily Blocked", text="Account Restricted"').first().isVisible().catch(() => false)) {
            console.error('🛑 Action block notice detected during post queue.');
            logActivity('share', profileName, 'Action blocked by Facebook. Halting queue.', 'failed');
            break;
          }

          // Resilient composer trigger selectors
          const writePostSelectors = [
            'span:has-text("Write something...")',
            'span:has-text("Create a public post...")',
            'span:has-text("What\'s on your mind?")',
            'div[role="button"]:has-text("Write something...")',
            'div[role="button"]:has-text("Create a public post...")',
            'div[role="button"]:has-text("What\'s on your mind?")',
            'div[role="button"][tabindex="0"]'
          ];

          let postInputClicked = false;
          for (const sel of writePostSelectors) {
            try {
              const el = page.locator(sel).first();
              if (await el.isVisible()) {
                await el.click();
                postInputClicked = true;
                break;
              }
            } catch (_) {}
          }

          if (!postInputClicked) {
            console.log('⚠️ Primary composer trigger not found, attempting generic dialog fallback...');
            await page.click('div[role="textbox"]', { timeout: 4000 }).catch(() => {});
          }

          await humanDelay(1500, 3000);

          // Find active post editor in compose modal
          const editor = page.locator('div[role="dialog"] div[role="textbox"], div[role="textbox"][contenteditable="true"]').first();
          if (await editor.isVisible()) {
            // Build post message
            const randomPostUrl = postUrls.length > 0 ? postUrls[Math.floor(Math.random() * postUrls.length)] : '';
            const message = [caption, randomPostUrl].filter(Boolean).join('\n\n');

            console.log('✍️ Typing post content with human cadence...');
            await typeLikeAHuman(page, editor, message);
            await humanDelay(2000, 3500);

            // Locate and click Post button
            const postBtn = page.locator('div[role="dialog"] div[role="button"]:has-text("Post"), div[role="dialog"] button:has-text("Post"), div[aria-label="Post"][role="button"]').first();
            await postBtn.waitFor({ state: 'visible', timeout: 10000 });
            await postBtn.click();
            console.log('📤 Clicked Submit/Post button.');
            await humanDelay(3000, 5000);

            // Handle potential "Agree to group rules" or "Submit to admin" modals
            try {
              const confirmBtn = page.locator('div[role="dialog"] div[role="button"]:has-text("Submit"), div[role="dialog"] div[role="button"]:has-text("Agree"), div[role="dialog"] button:has-text("Submit"), div[role="dialog"] button:has-text("Agree")').first();
              if (await confirmBtn.isVisible({ timeout: 3000 })) {
                console.log('🤝 Group rules/submission modal detected. Confirming...');
                await confirmBtn.click();
                await sleep(2000);
              }
            } catch (_) {}

            console.log(`✅ Successfully shared to group: ${group.name}`);
            logActivity('share', profileName, `Shared post to group: ${group.name}`, 'success');
          } else {
            console.log(`❌ Failed to open post editor in ${group.name}`);
            logActivity('share', profileName, `Failed to post in ${group.name} (editor not found)`, 'failed');
          }

        } catch (err) {
          console.log(`⚠️ Error sharing to group: ${err.message}`);
          logActivity('share', profileName, `Error in group ${group.name}: ${err.message}`, 'failed');
        }

        // Delay between group posts (45s - 90s)
        if (idx < targetGroups.length - 1) {
          const delay = randomBetween(45000, 90000);
          console.log(`⏳ Waiting ${Math.round(delay / 1000)}s before next group post (anti-ban pacing)...`);
          await sleep(delay);
        }
      }

    } else if (mode === 'join') {
      // ─────────────────────────────────────────────────────────────
      //  JOIN MODE
      // ─────────────────────────────────────────────────────────────
      if (!fs.existsSync(joinConfigPath)) {
        console.error('❌ Configuration file fb_join_config.json not found.');
        await context.close();
        process.exit(1);
      }

      const config = JSON.parse(fs.readFileSync(joinConfigPath, 'utf8'));
      const keywords = config.keywords || [];
      const limit = config.joinsPerSession || 5;

      if (keywords.length === 0) {
        console.log('⚠️ No keywords configured for group search.');
        await context.close();
        process.exit(0);
      }

      const searchKeyword = keywords[Math.floor(Math.random() * keywords.length)];
      console.log(`🔎 Searching for groups with keyword: "${searchKeyword}"...`);

      const searchUrl = `https://www.facebook.com/search/groups/?q=${encodeURIComponent(searchKeyword)}`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
      await humanDelay(3000, 5000);

      // Extract discovered group links
      const groupLinks = await page.$$eval('a[href*="/groups/"]', els => {
        const list = [];
        const seen = new Set();
        for (const el of els) {
          const href = el.href.split('?')[0].replace(/\/+$/, '');
          const match = href.match(/\/groups\/([0-9a-zA-Z._-]+)/);
          if (match && !['feed', 'discover', 'joins', 'search', 'notifications'].includes(match[1]) && !seen.has(href)) {
            seen.add(href);
            list.push({
              url: href,
              name: (el.innerText || '').trim() || `Group ${match[1]}`
            });
          }
        }
        return list;
      });

      console.log(`Found ${groupLinks.length} groups in search results.`);
      const targetList = groupLinks.slice(0, limit);

      let joinedCount = 0;
      for (let i = 0; i < targetList.length; i++) {
        const gp = targetList[i];
        try {
          console.log(`\nNavigating to target group: ${gp.name} (${gp.url})`);
          await page.goto(gp.url, { waitUntil: 'domcontentloaded', timeout: 25000 });
          await humanDelay(2500, 4000);

          const joinBtn = page.locator('div[role="button"]:has-text("Join group"), button:has-text("Join Group"), div[aria-label="Join group"]').first();
          if (await joinBtn.isVisible()) {
            await joinBtn.click();
            console.log('✅ Clicked Join Group!');
            joinedCount++;

            // Save to groups list
            let savedGroups = [];
            if (fs.existsSync(groupsPath)) {
              try { savedGroups = JSON.parse(fs.readFileSync(groupsPath, 'utf8')); } catch (_) {}
            }
            if (!savedGroups.some(g => g.url === gp.url)) {
              savedGroups.push({
                name: gp.name,
                url: gp.url,
                status: 'pending',
                joinedAt: new Date().toISOString()
              });
              fs.writeFileSync(groupsPath, JSON.stringify(savedGroups, null, 2), 'utf8');
            }

            logActivity('join', profileName, `Requested to join group: ${gp.name}`, 'success');
            await humanDelay(2000, 4000);
          } else {
            console.log('ℹ️ Already member or Join button not present.');
          }
        } catch (err) {
          console.log(`⚠️ Error joining group: ${err.message}`);
        }

        // Pacing delay between group join attempts (15s - 30s)
        if (i < targetList.length - 1) {
          const joinDelay = randomBetween(15000, 30000);
          console.log(`Waiting ${Math.round(joinDelay / 1000)}s before next group join...`);
          await sleep(joinDelay);
        }
      }
      console.log(`🎉 Finished auto-join session. Joined/requested ${joinedCount} groups.`);
    }

    await context.close();
    process.exit(0);

  } catch (err) {
    console.error(`❌ Process Error: ${err.message}`);
    logActivity(mode, profileName, `Process crashed: ${err.message}`, 'failed');
    if (context) await context.close().catch(() => {});
    process.exit(1);
  }
})();
