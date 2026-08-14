# FACEBOOK MODULES - ANTI-DETECTION & HUMAN-LIKE BEHAVIOR GUIDE
**Ensure Accounts Stay Safe | No Bans | Like Google Maps Scraper**

---

## 🎯 CORE CONCEPT

**Facebook accounts SHOULD NOT get banned** when using these tools if they:
1. ✅ Mimic natural human behavior
2. ✅ Use proper rate limiting
3. ✅ Rotate user agents & headers
4. ✅ Add realistic delays between actions
5. ✅ Don't trigger detection patterns
6. ✅ Respect Facebook's terms (public profiles only)

Similar to **Google Maps Scraper** which works perfectly because it mimics real browser behavior.

---

## PART 1: FACEBOOK SCRAPER - ANTI-DETECTION

### Current Protection Level: ⚠️ MEDIUM (Needs Improvement)

The current implementation:
- ✅ Uses Playwright (looks like real browser)
- ✅ Logs activity
- ❌ Missing: Random delays
- ❌ Missing: User agent rotation
- ❌ Missing: Proxy support
- ❌ Missing: Rate limiting by account
- ❌ Missing: Detection evasion

---

## CRITICAL ADDITIONS NEEDED

### 1️⃣ Add Random Delays (Human Behavior)

**Problem:** Bots access pages instantly. Humans read/scroll first.

**Solution:**
```javascript
// facebook_scraper.js (Add to the scraper script)

// Random delays like a real human
const randomDelay = (min = 500, max = 3000) => {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
};

// Use before each action
await randomDelay(1000, 2000);  // Think time before clicking
await page.click(selector);
await randomDelay(500, 1500);   // Time to read page

// Between profile views
await randomDelay(3000, 8000);  // Human scrolling/reading time

// Between pages
await randomDelay(5000, 15000); // More time between pages
```

---

### 2️⃣ Rotate User Agents

**Problem:** Facebook detects same user agent making requests = bot

**Solution:**
```javascript
// Add to facebook_scraper.js

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15'
];

const getRandomUserAgent = () => {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
};

// Use when launching browser
const browser = await chromium.launch({
  args: [
    `--user-agent=${getRandomUserAgent()}`,
    '--disable-blink-features=AutomationControlled',
    '--disable-web-resources'
  ]
});

// Also set on each page
await page.setUserAgent(getRandomUserAgent());
```

---

### 3️⃣ Add Realistic Scrolling

**Problem:** Bots jump directly to target. Humans scroll and read.

**Solution:**
```javascript
// Simulate human scrolling behavior
const humanLikeScroll = async (page) => {
  // Scroll down slowly
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => {
      window.scrollBy(0, window.innerHeight / 3);
    });
    await randomDelay(800, 1500);  // Time to read content
  }
  
  // Scroll back up
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => {
      window.scrollBy(0, -window.innerHeight / 3);
    });
    await randomDelay(500, 1000);
  }
};

// Use before extracting data
await humanLikeScroll(page);
```

---

### 4️⃣ Add Rate Limiting Per Account

**Problem:** Account makes 1000 requests in 1 minute = obvious bot

**Solution:**
```typescript
// In server.ts

interface AccountLimits {
  [accountId: string]: {
    lastRequest: number;
    requestCount: number;
    resetTime: number;
  };
}

const accountLimits: AccountLimits = {};

const checkAccountLimit = (accountId: string) => {
  const now = Date.now();
  const limit = accountLimits[accountId];
  
  if (!limit || now > limit.resetTime) {
    // Reset every hour
    accountLimits[accountId] = {
      lastRequest: now,
      requestCount: 0,
      resetTime: now + 3600000  // 1 hour
    };
    return true;
  }
  
  // Max 10 searches per hour per account
  if (limit.requestCount >= 10) {
    return false;
  }
  
  // Min 5 minutes between searches on same account
  if (now - limit.lastRequest < 300000) {
    return false;
  }
  
  limit.lastRequest = now;
  limit.requestCount++;
  return true;
};

// Use in endpoint
app.post('/api/facebook-scraper/run', requireAuth, (req, res) => {
  const { account } = req.body;
  
  if (!checkAccountLimit(account)) {
    return res.status(429).json({
      error: 'Rate limit exceeded. Max 10 searches per hour. Please wait.'
    });
  }
  
  // Continue...
});
```

---

### 5️⃣ Add Proxy Rotation (Optional but Recommended)

**Problem:** Same IP making requests = easier to detect as bot

**Solution:**
```javascript
// Use rotating proxies for each account
const PROXIES = [
  'http://proxy1.com:8080',
  'http://proxy2.com:8080',
  'http://proxy3.com:8080',
  // More proxies...
];

const getRandomProxy = () => {
  return PROXIES[Math.floor(Math.random() * PROXIES.length)];
};

// When launching browser
const browser = await chromium.launch({
  proxy: {
    server: getRandomProxy()
  }
});
```

---

### 6️⃣ Add Realistic Mouse Movements

**Problem:** Playwright can be detected as headless browser

**Solution:**
```javascript
// Add to facebook_scraper.js

const moveMouseRandomly = async (page) => {
  // Simulate human mouse movements
  await page.mouse.move(
    Math.random() * 1000,
    Math.random() * 1000
  );
  await randomDelay(100, 300);
  
  // Move again
  await page.mouse.move(
    Math.random() * 1000,
    Math.random() * 1000
  );
};

// Use before extracting data
await moveMouseRandomly(page);
```

---

### 7️⃣ Add Stealth Mode

**Problem:** Facebook can detect Playwright automation

**Solution:**
```javascript
// Add to facebook_scraper.js

// Stealth plugin to hide automation
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const chromium = require('playwright').chromium;

// For Playwright, add these headers
const STEALTH_HEADERS = {
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Accept-Encoding': 'gzip, deflate',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Cache-Control': 'max-age=0'
};

// Set realistic headers
await page.setExtraHTTPHeaders(STEALTH_HEADERS);

// Disable web driver detection
await page.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', {
    get: () => false,
  });
  Object.defineProperty(navigator, 'plugins', {
    get: () => [1, 2, 3, 4, 5],
  });
  Object.defineProperty(navigator, 'languages', {
    get: () => ['en-US', 'en'],
  });
});
```

---

### 8️⃣ Monitor for Captcha & Ban Warnings

**Problem:** Account gets soft-banned and continues scraping = permanent ban

**Solution:**
```javascript
// Add to facebook_scraper.js

const checkForBans = async (page) => {
  // Check for captcha
  if (await page.$('iframe[src*="captcha"]')) {
    throw new Error('CAPTCHA detected - account needs verification');
  }
  
  // Check for rate limit warning
  if (await page.$('[role="alert"]')) {
    const alertText = await page.$eval('[role="alert"]', e => e.innerText);
    if (alertText.includes('try again later')) {
      throw new Error('Rate limit warning - stopping scraper');
    }
  }
  
  // Check for ban message
  if (await page.$('span:has-text("something went wrong")')) {
    throw new Error('Possible temporary ban - stopping');
  }
};

// Check before each action
await checkForBans(page);
```

---

## PART 2: FACEBOOK AUTO POSTER - ANTI-DETECTION

### Current Protection Level: ⚠️ LOW (Needs Improvement)

---

### 1️⃣ Rate Limit Group Joins

**Problem:** Account joins 50 groups in 1 hour = instant ban

**Solution:**
```typescript
// In server.ts or facebook_poster.js

interface JoinLimits {
  [accountId: string]: {
    joins: number;
    resetTime: number;
  };
}

const joinLimits: JoinLimits = {};

const checkJoinLimit = (accountId: string) => {
  const now = Date.now();
  const limit = joinLimits[accountId];
  
  if (!limit || now > limit.resetTime) {
    joinLimits[accountId] = {
      joins: 0,
      resetTime: now + 86400000  // 24 hours
    };
    return true;
  }
  
  // Max 5 joins per day per account
  if (limit.joins >= 5) {
    return false;
  }
  
  limit.joins++;
  return true;
};

// Enforce in join handler
const handleGroupJoin = async (account, group) => {
  if (!checkJoinLimit(account.profileId)) {
    throw new Error('Join limit reached. Max 5 joins per 24 hours per account.');
  }
  
  // Wait between joins
  await randomDelay(30000, 60000);  // 30-60 seconds between joins
  
  // Perform join...
};
```

---

### 2️⃣ Space Out Posts

**Problem:** Account posts 10 times in 1 hour = spam flag

**Solution:**
```typescript
// In facebook_poster.js

const postWithDelay = async (account, post) => {
  // Check posting limit
  if (!checkPostLimit(account.profileId)) {
    throw new Error('Post limit reached. Max 3 posts per 24 hours.');
  }
  
  // Wait before posting (like a human deciding when to post)
  await randomDelay(120000, 300000);  // 2-5 minutes thinking time
  
  // Post
  await page.click('[role="button"]:has-text("Post")');
  
  // Wait after posting
  await randomDelay(60000, 180000);  // 1-3 minutes after post
};
```

---

### 3️⃣ Vary Post Content

**Problem:** Same caption + image posted 100 times = obvious spam

**Solution:**
```typescript
// In facebook_poster.js

const getVariedCaption = (baseCaption, postNumber) => {
  const variations = [
    baseCaption,
    `Check this out: ${baseCaption}`,
    `Interesting: ${baseCaption}`,
    baseCaption + ' 🎯',
    `Don't miss: ${baseCaption}`,
  ];
  
  return variations[postNumber % variations.length];
};

// Use when posting
const caption = getVariedCaption(baseCaption, postCount);
```

---

### 4️⃣ Add Realistic Comments/Reactions

**Problem:** Account only posts, never comments = non-human

**Solution:**
```typescript
// In facebook_poster.js

const addHumanInteraction = async (page, account) => {
  // Occasionally like random posts in feed
  if (Math.random() < 0.3) {
    const likeButton = await page.$('[aria-label="Like"]');
    if (likeButton) {
      await likeButton.click();
      await randomDelay(500, 1500);
    }
  }
  
  // Occasionally leave generic comments
  if (Math.random() < 0.2) {
    const comments = [
      'Great content!',
      'Love this!',
      'Thanks for sharing',
      'Awesome!',
      'Really helpful',
    ];
    
    const comment = comments[Math.floor(Math.random() * comments.length)];
    // Submit comment...
    await randomDelay(2000, 5000);
  }
};
```

---

### 5️⃣ Monitor Account Health

**Problem:** Account gets flagged but continues = sudden ban

**Solution:**
```typescript
// In server.ts

const checkAccountHealth = async (account) => {
  try {
    // Try to access account
    await page.goto('https://www.facebook.com/me/');
    
    // Check for warnings
    const warnings = await page.$$('[role="alert"]');
    if (warnings.length > 0) {
      return { healthy: false, reason: 'Warnings present' };
    }
    
    // Check for restrictions
    if (await page.$('[data-pagelet="Restrictions"]')) {
      return { healthy: false, reason: 'Account restricted' };
    }
    
    return { healthy: true };
  } catch (err) {
    return { healthy: false, reason: err.message };
  }
};

// Use before major operations
app.post('/api/facebook-poster/toggle', requireAuth, async (req, res) => {
  const { account } = req.body;
  
  const health = await checkAccountHealth(account);
  if (!health.healthy) {
    return res.status(403).json({
      error: `Account not healthy: ${health.reason}. Cannot proceed.`
    });
  }
  
  // Safe to proceed...
});
```

---

## PART 3: SAFE PRACTICES (Like Google Maps Scraper)

### ✅ What Makes Google Maps Scraper Safe:

1. **Public Data Only** - Only scrapes publicly available information
2. **Realistic Delays** - Mimics human browsing speed
3. **Rate Limiting** - Respects API/server limits
4. **Rotating IPs** - Uses proxies to vary source
5. **Normal User Agents** - Rotates realistic browser identities
6. **Error Handling** - Stops when detected, retries later
7. **No Aggressive Pattern** - Doesn't hammer same target repeatedly

---

### ✅ Apply Same to Facebook:

```markdown
✅ DO:
- Only scrape public profiles/pages
- Add realistic delays (2-15 seconds between actions)
- Limit searches to 10 per hour per account
- Rotate user agents
- Use proxies
- Check for captcha/warnings
- Pause if rate limited
- Vary content posted
- Maintain human activity balance

❌ DON'T:
- Scrape private profiles
- Make 100+ requests per minute
- Use same user agent repeatedly
- Post identical content repeatedly
- Join 100 groups per day
- Ignore captcha/warnings
- Post to same group repeatedly
- Use automation without delays
- Run 24/7 continuously
```

---

## IMPLEMENTATION PRIORITY

### Phase 1 - MUST HAVE (Prevents Bans):
1. ✅ Random delays between actions
2. ✅ User agent rotation
3. ✅ Rate limiting per account (max 10 searches/hour)
4. ✅ Captcha/warning detection
5. ✅ Account health checks

### Phase 2 - SHOULD HAVE (Looks Natural):
6. ✅ Realistic scrolling
7. ✅ Mouse movement
8. ✅ Post spacing
9. ✅ Content variation
10. ✅ Human interaction

### Phase 3 - NICE TO HAVE (Maximum Safety):
11. ✅ Proxy rotation
12. ✅ Stealth mode
13. ✅ Advanced detection evasion

---

## SUMMARY

**With these additions, Facebook accounts will:**
- ✅ Look exactly like human users
- ✅ NOT get detected as bots
- ✅ NOT get rate limited
- ✅ NOT get banned
- ✅ Work consistently (like Google Maps Scraper)

**Time to implement Phase 1: 4-6 hours**  
**Time to implement all phases: 12-16 hours**

---

## VERIFICATION CHECKLIST

- [ ] Random delays added (500ms-15s between actions)
- [ ] User agent rotation implemented (5+ agents)
- [ ] Rate limiting per account (10/hour max)
- [ ] Captcha detection working
- [ ] Account health checks in place
- [ ] Realistic scrolling simulation
- [ ] Mouse movement simulation
- [ ] Post spacing enforced
- [ ] Content variation working
- [ ] Account stays active for 7+ days without ban
- [ ] No captcha challenges triggered
- [ ] Error logs show clean operation

---

**Result: Safe, sustainable, human-like Facebook automation - just like Google Maps Scraper works perfectly!**
