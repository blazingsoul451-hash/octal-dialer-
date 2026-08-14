'use strict';

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────
//  SETTINGS & ARGUMENT PARSING
// ─────────────────────────────────────────────────────────────
let mode = 'share'; // 'share' or 'join'
let profileName = '';

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--mode') mode = args[++i];
  else if (args[i] === '--profile') profileName = args[++i];
}

if (!profileName) {
  console.error('❌ Error: --profile is required.');
  process.exit(1);
}

const profileDir = path.resolve(__dirname, '..', '..', 'fb_profiles', profileName);
const dataDir = path.resolve(__dirname, '..', '..', 'data');
const configPath = path.join(dataDir, 'fb_config.json');
const joinConfigPath = path.join(dataDir, 'fb_join_config.json');
const groupsPath = path.join(dataDir, 'fb_groups.json');
const activityPath = path.join(dataDir, 'fb_activity_log.json');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

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
    // Limit to 200
    fs.writeFileSync(activityPath, JSON.stringify(list.slice(0, 200), null, 2), 'utf8');
  } catch (_) {}
}

(async () => {
  console.log(`🚀 Starting Auto Poster Bot in mode: ${mode.toUpperCase()} on Profile: ${profileName}...`);

  if (!fs.existsSync(profileDir)) {
    console.error(`❌ Profile folder not found: ${profileDir}`);
    process.exit(1);
  }

  let browser, context;
  try {
    const launchOptions = {
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-infobars',
        '--disable-gpu',
        '--lang=en-US'
      ],
      ignoreDefaultArgs: ['--enable-automation'],
      locale: 'en-US'
    };

    context = await chromium.launchPersistentContext(profileDir, launchOptions);
    const page = await context.newPage();

    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    console.log('Verifying Session...');
    await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded' });
    await sleep(3000);

    if (page.url().includes('/login')) {
      console.error('❌ Session invalid/expired. Cannot proceed.');
      logActivity(mode, profileName, 'Session invalid or expired', 'failed');
      await context.close();
      process.exit(1);
    }

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

      if (postUrls.length === 0) {
        console.log('⚠️ No post URLs configured. Nothing to share.');
        await context.close();
        process.exit(0);
      }

      // Load target groups to share to
      let groups = [];
      if (fs.existsSync(groupsPath)) {
        groups = JSON.parse(fs.readFileSync(groupsPath, 'utf8'));
      }
      // Filter groups that this profile has joined
      const targetGroups = groups.filter(g => g.status === 'member' || g.status === 'approved');

      if (targetGroups.length === 0) {
        console.log('⚠️ No joined groups found for sharing. Please run auto joiner first.');
        await context.close();
        process.exit(0);
      }

      console.log(`Sharing to ${targetGroups.length} groups...`);
      for (const group of targetGroups) {
        try {
          console.log(`Navigating to group: ${group.name} (${group.url})`);
          await page.goto(group.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await sleep(4000);

          // Click on the write post area
          // Facebook's write post selectors
          const writePostSelectors = [
            'span:has-text("Write something...")',
            'span:has-text("Create a public post...")',
            'div[role="button"]:has-text("Write something...")',
            'div[role="button"]:has-text("Create a public post...")'
          ];

          let postInputClicked = false;
          for (const sel of writePostSelectors) {
            try {
              const el = await page.locator(sel).first();
              if (await el.isVisible()) {
                await el.click();
                postInputClicked = true;
                break;
              }
            } catch (_) {}
          }

          if (!postInputClicked) {
            // Fallback click on page body or role=textbox
            console.log('⚠️ Primary write post button not found, trying fallback...');
            await page.click('div[role="textbox"]', { timeout: 5000 }).catch(() => {});
          }

          await sleep(3000);

          // Find the active post editor area
          const editor = page.locator('div[role="textbox"], div[contenteditable="true"]').first();
          if (await editor.isVisible()) {
            // Build post message
            const randomPostUrl = postUrls[Math.floor(Math.random() * postUrls.length)];
            const message = `${caption}\n\n${randomPostUrl}`;
            
            console.log(`Typing post details...`);
            await editor.fill(message);
            await sleep(4000);

            // Click Post Button
            const postBtn = page.locator('div[role="button"]:has-text("Post"), button:has-text("Post")').first();
            await postBtn.click();
            console.log('✅ Post submitted!');
            logActivity('share', profileName, `Shared post to group: ${group.name}`, 'success');
            await sleep(5000);
          } else {
            console.log('❌ Failed to find post text editor.');
            logActivity('share', profileName, `Failed to post in ${group.name} (no editor found)`, 'failed');
          }

        } catch (err) {
          console.log(`⚠️ Error sharing to group: ${err.message}`);
          logActivity('share', profileName, `Error in group ${group.name}: ${err.message}`, 'failed');
        }

        // Delay between posts
        const delay = 45000 + Math.random() * 30000; // 45s - 75s
        console.log(`Waiting ${Math.round(delay/1000)}s before next share...`);
        await sleep(delay);
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
      console.log(`Searching for groups with keyword: "${searchKeyword}"`);
      
      const searchUrl = `https://www.facebook.com/search/groups/?q=${encodeURIComponent(searchKeyword)}`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
      await sleep(5000);

      // Extract group links that can be joined
      const groupLinks = await page.$$eval('a[href*="/groups/"]', els => {
        const list = [];
        const seen = new Set();
        for (const el of els) {
          const href = el.href.split('?')[0].replace(/\/$/, '');
          if (href.includes('/groups/') && !href.endsWith('/groups') && !seen.has(href)) {
            seen.add(href);
            list.push({
              url: href,
              name: (el.innerText || '').trim() || 'Facebook Group'
            });
          }
        }
        return list;
      });

      console.log(`Found ${groupLinks.length} groups in search results.`);
      const targetList = groupLinks.slice(0, limit);
      
      let joinedCount = 0;
      for (const gp of targetList) {
        try {
          console.log(`Navigating to target group: ${gp.name} (${gp.url})`);
          await page.goto(gp.url, { waitUntil: 'domcontentloaded', timeout: 25000 });
          await sleep(4000);

          // Find Join button
          const joinBtn = page.locator('div[role="button"]:has-text("Join group"), button:has-text("Join Group")').first();
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
            await sleep(4000);
          } else {
            console.log('Already joined or Join button not found.');
          }
        } catch (err) {
          console.log(`⚠️ Error joining group: ${err.message}`);
        }

        // Delay between joins
        await sleep(15000 + Math.random() * 15000);
      }
      console.log(`🎉 Finished auto-join session. Joined ${joinedCount} groups.`);
    }

    await context.close();
    process.exit(0);

  } catch (err) {
    console.error(`❌ Process Error: ${err.message}`);
    logActivity(mode, profileName, `Process crashed: ${err.message}`, 'failed');
    if (context) await context.close();
    process.exit(1);
  }
})();
