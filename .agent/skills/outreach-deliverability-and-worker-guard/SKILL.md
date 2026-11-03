---
name: outreach-deliverability-and-worker-guard
description: Production outreach architecture: Cold Email campaign dispatching, Omnichannel Unibox IMAP IDLE stability, Facebook Autoposter resilience, atomic token refresh mutexes via SELECT FOR UPDATE, dedicated tracking domain isolation off zestify7.online, and Playwright browser context management.
---

# Outreach Deliverability & Background Worker Guard

The outreach engine in Octal Dialer / Zestify orchestrates three concurrent pipelines:
1. **Outbound Cold Email Campaigns** (high-throughput dispatch via SMTP/OAuth2).
2. **Omnichannel Unibox** (persistent real-time IMAP IDLE connections listening for lead replies).
3. **Facebook Autoposter & Group Scraper** (automated headless Playwright browser workflows).

A failure in worker concurrency or domain isolation can poison root domain reputation (`zestify7.online`), cause OAuth2 token revocation storms, or crash the Node.js event loop.

---

## 1. Worker Process Isolation & Event Loop Health

### The Single-Thread Bottleneck Risk
Node.js runs on a single event loop. If heavy background jobs (such as parsing large MIME attachments, scraping Google Maps, or executing synchronous cryptographic loops) share the primary Express process, the Socket.IO event loop is starved.
- **Consequence**: Mobile dialer socket heartbeats (`device:heartbeat`) drop, phone status toggles to `Phone Offline`, and active calls disconnect.

### Architectural Process Boundaries
```
┌────────────────────────────────────────────────────────┐
│             CORE API & SOCKET.IO SERVER                │
│  - Port 5000 / PM2 Instance Cluster                    │
│  - Real-time mobile phone sockets                      │
│  - Web Dialer WebSockets & UI REST API                 │
│  - ZERO long-running or CPU-blocking loops             │
└──────────────────────────┬─────────────────────────────┘
                           │ Redis Pub/Sub / DB Queue
         ┌─────────────────┴─────────────────┐
         ▼                                   ▼
┌─────────────────────────┐       ┌───────────────────────┐
│   EMAIL / IMAP WORKER   │       │ PLAYWRIGHT WORKER POOL│
│ - IMAP IDLE listeners   │       │ - Facebook Autoposter │
│ - Cold campaign batches │       │ - Google Maps Scraper │
│ - Token refresh mutexes │       │ - Ephemeral contexts  │
└─────────────────────────┘       └───────────────────────┘
```

**Worker Rules**:
1. Never run `setInterval` loops with synchronous file reads or cryptographic scrypt generation inside `server.ts`.
2. All batch mail processing must yield to the event loop every 10 messages using `await new Promise(setImmediate)`.
3. Background workers report progress asynchronously through Redis / Database state tables.

---

## 2. Atomic OAuth2 Token Refresh Mutex (`secretVault.ts`)

### The Thundering Herd Race Condition
Mailbox accounts (Google Workspace, Microsoft 365, Yahoo) use OAuth2 `refreshToken` flows. Access tokens expire every 3,600 seconds.
- **The Problem**: Both the **Cold Email Campaign Dispatcher** and the **Unibox IMAP IDLE Listener** operate on the same email account. When an access token expires:
  1. IMAP IDLE detects authentication error -> calls `refreshAccessToken()`.
  2. Campaign Dispatcher attempts to send an email -> calls `refreshAccessToken()`.
  3. Both exchange the `refreshToken` with Google/Microsoft simultaneously.
  4. Google's OAuth2 server issues a new token pair and **revokes the previous refresh token**.
  5. The slower worker receives `invalid_grant`, unauthorizing the mailbox and crashing both sync and outbound campaigns.

### The Solution: Transactional DB Row-Locking (`SELECT FOR UPDATE`)
All token refreshes MUST be serialized using PostgreSQL's row-level lock:

```typescript
// website_octal_dialer/backend/src/services/secretVault.ts (Token Refresh Mutex)

export async function refreshAccountTokenWithLock(
  accountId: string, 
  refreshFn: (refreshToken: string) => Promise<{ accessToken: string; newRefreshToken?: string; expiresIn: number }>
): Promise<string> {
  return await db.withTransaction(async (client) => {
    // 1. Acquire exclusive lock on the email_accounts row
    const res = await client.query(`
      SELECT id, "accessToken", "refreshToken", "tokenExpiresAt"
      FROM email_accounts
      WHERE id = $1
      FOR UPDATE
    `, [accountId]);

    if (res.rows.length === 0) throw new Error(`Account ${accountId} not found`);
    const account = res.rows[0];

    const now = Date.now();
    const tokenExpiresAt = new Date(account.tokenExpiresAt).getTime();

    // 2. Double-Checked Locking: Did another concurrent worker already refresh it while we waited for the lock?
    if (tokenExpiresAt > now + 60 * 1000) {
      // Token is valid for more than 1 minute; return freshly refreshed token
      return decryptSecret(account.accessToken);
    }

    // 3. We hold the lock and token is genuinely expired; execute OAuth exchange
    const plainRefreshToken = decryptSecret(account.refreshToken);
    const refreshed = await refreshFn(plainRefreshToken);

    const encryptedAccessToken = encryptSecret(refreshed.accessToken);
    const encryptedRefreshToken = refreshed.newRefreshToken 
      ? encryptSecret(refreshed.newRefreshToken) 
      : account.refreshToken;

    const newExpiry = new Date(now + refreshed.expiresIn * 1000).toISOString();

    // 4. Update row inside the active lock
    await client.query(`
      UPDATE email_accounts
      SET "accessToken" = $1,
          "refreshToken" = $2,
          "tokenExpiresAt" = $3,
          "updatedAt" = NOW()
      WHERE id = $4
    `, [encryptedAccessToken, encryptedRefreshToken, newExpiry, accountId]);

    return refreshed.accessToken;
  });
}
```

---

## 3. Dedicated Tracking Domain Isolation

### The Root Domain Catastrophe
Cold outbound email inherently triggers spam complaints and ISP filtering. If open-tracking pixels (`<img src="...">`) or click-redirect links (`https://.../api/email/track/click/...`) utilize the primary SaaS domain (`zestify7.online`):
- **Spamhaus / Barracuda / Google Postmaster** will blacklist `zestify7.online`.
- Production transactional emails (user password resets, invoices, verification codes) will be dropped by recipient spam filters.
- Web browsers will display red "Deceptive site ahead" malware warnings on the root application URL.

### Dedicated Custom Tracking Domain Architecture
1. **Strict Domain Separation**:
   - Primary App Domain: `zestify7.online` (NO cold marketing tracking links).
   - Dedicated Tracking Domains: Configured via mandatory `process.env.TRACKING_BASE_URL` or tenant-specific custom subdomains (e.g., customer CNAME). Never hardcode placeholder or third-party example tracking domains as real configuration.
2. **Mandatory `TRACKING_BASE_URL` & Local-Dev Fallback**:
   - **Production Requirement**: In production, `process.env.TRACKING_BASE_URL` is mandatory and must resolve to an owned, dedicated tracking domain. Server bootstrap must validate that `process.env.TRACKING_BASE_URL` is set; startup must warn/fail in production if it is missing or pointing to the root application domain.
   - **Safe Local-Dev Fallback**: For development and testing (`NODE_ENV !== 'production'`), fall back safely to `http://localhost:5000`.
3. **Click & Pixel URL Rewriting**:
   `rewriteLinksForTracking()` must resolve the base tracking URL from tenant settings or `process.env.TRACKING_BASE_URL`, never `config.serverUrl` or `zestify7.online`:
   ```typescript
   export function getTrackingBaseUrl(tenantCustomDomain?: string): string {
     if (tenantCustomDomain) {
       return `https://${tenantCustomDomain}`;
     }
     if (process.env.TRACKING_BASE_URL) {
       return process.env.TRACKING_BASE_URL.replace(/\/+$/, '');
     }
     if (process.env.NODE_ENV === 'production') {
       console.error('[FATAL CONFIG] process.env.TRACKING_BASE_URL is unset in production! Startup must fail to protect domain reputation.');
       throw new Error('process.env.TRACKING_BASE_URL is mandatory in production');
     }
     // Safe local-dev fallback
     return 'http://localhost:5000';
   }

   const trackingBase = getTrackingBaseUrl(tenantSettings.customTrackingDomain);
   ```
4. **Cryptographic HMAC Signing**:
   Every tracking link must carry an HMAC signature computed via `signTrackedUrl()` to ensure the redirect endpoint cannot be abused as an open redirector for phishing campaigns.
5. **Clean Email Compliance Headers**:
   Outbound cold emails must include:
   - `List-Unsubscribe: <${trackingBase}/email/unsubscribe?token=...>, <mailto:unsub@...>`
   - `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
   - Valid SPF, DKIM, and DMARC alignment against the sending mailbox.

---

## 4. Browser Automation & Facebook Autoposter Resilience (Playwright)

Headless browser automation via Playwright (`facebook_poster.js` / `facebook_scraper.js`) is prone to memory leaks, anti-bot flags, and zombie processes.

### Anti-Detection & Stealth Hygiene
1. **Persistent Browser Contexts with Stealth Masking**:
   ```javascript
   const context = await chromium.launchPersistentContext(profileDir, {
     headless: true,
     args: [
       '--disable-blink-features=AutomationControlled',
       '--no-sandbox',
       '--disable-infobars',
       '--disable-dev-shm-usage',
       '--window-size=1280,800'
     ],
     viewport: { width: 1280, height: 800 },
     userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
   });
   ```
2. **Humanized Typing & Keystroke Jitter**:
   Never use `page.fill(selector, text)` directly; it pastes text instantly and triggers behavioral bot detection. Use human typing simulation:
   ```javascript
   async function humanType(page, selector, text) {
     await page.click(selector);
     for (const char of text) {
       await page.keyboard.type(char, { delay: Math.floor(Math.random() * 75) + 35 });
     }
   }
   ```
3. **Group Posting Delays**: Enforce a mandatory randomized wait (e.g. 5–15 minutes) between posts in different groups.

### Orphan Chromium Process Cleanup Guard
When Playwright crashes, times out, or receives SIGINT/SIGTERM, headless Chromium instances can detach and become orphaned zombie processes consuming 400MB+ RAM each.

**Mandatory Worker Process Guardian**:
```javascript
// Clean orphaned chromium processes older than 30 minutes
function reapZombieBrowsers() {
  const isWindows = process.platform === 'win32';
  const command = isWindows 
    ? 'taskkill /F /IM chrome.exe /FI "STATUS eq RUNNING"' 
    : 'pkill -f "chrome.*--disable-blink-features=AutomationControlled"';
    
  // Run reap guard during worker bootstrap and scheduled cron
}

process.on('SIGTERM', async () => {
  console.log('[Worker Guard] SIGTERM received. Closing Playwright contexts...');
  if (globalBrowserContext) {
    await globalBrowserContext.close().catch(() => {});
  }
  process.exit(0);
});
```

---

## 5. Verification & Test Runbook

```bash
# 1. Execute emailer and Facebook poster behavioral suite
node scripts/test_emailer_and_facebook_poster.cjs
# Expected output: 11/11 tests passed!

# 2. Verify encryption and secret vault integrity
npm --prefix website_octal_dialer/backend test tests/secretVault.test.ts

# 3. Check for zombie browser processes on host (PowerShell)
Get-Process -Name chrome,msedge,chromium -ErrorAction SilentlyContinue | Select-Object Id, ProcessName, WorkingSet64
```
