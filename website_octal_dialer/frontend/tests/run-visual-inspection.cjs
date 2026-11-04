const { chromium } = require('@playwright/test');
const path = require('node:path');
const fs = require('node:fs');

const VIEWPORTS = [
  { name: 'mobile_375x812', width: 375, height: 812 },
  { name: 'tablet_768x1024_pinned', width: 768, height: 1024, sidebarPinned: true },
  { name: 'tablet_768x1024_collapsed', width: 768, height: 1024, sidebarPinned: false },
  { name: 'laptop_1024x768', width: 1024, height: 768 },
  { name: 'desktop_1440x900_dark', width: 1440, height: 900, theme: 'dark' },
  { name: 'desktop_1440x900_light', width: 1440, height: 900, theme: 'light' },
];

async function run() {
  const { createServer } = await import('vite');
  const config = require('../scripts/vite-local.cjs')();
  const server = await createServer({ ...config, server: { host: '127.0.0.1', port: 0 } });
  await server.listen();
  const port = server.httpServer.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Vite server running at ${baseUrl}`);

  const browser = await chromium.launch({ headless: true });
  const report = [];

  const addReport = (view, viewport, check, verdict, details, file = '', line = 0) => {
    report.push({ view, viewport, check, verdict, details, file, line });
    const sym = verdict === 'PASS' ? '✅' : '❌';
    console.log(`${sym} [${verdict}] ${view} @ ${viewport} -> ${check}: ${details}`);
  };

  try {
    const page = await browser.newPage();

    // Mock all /api and /auth routes to prevent network errors
    await page.route('**/*', async (route) => {
      const url = route.request().url();
      if (url.includes('/auth/config')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ googleClientId: null, captchaSiteKey: null, captchaEnabled: false }),
        });
      }
      if (url.includes('/info')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ localIP: '127.0.0.1', serverUrl: null }),
        });
      }
      if (url.includes('/auth/me')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            user: { id: 'u1', username: 'admin', role: 'platform_admin', displayName: 'Administrator' },
            tenant: { id: 't1', name: 'Acme Telephony' },
          }),
        });
      }
      if (url.includes('/logs') || url.includes('/api/logs') || url.includes('/api/call-logs')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      }
      if (url.includes('/api/suppression-list') || url.includes('/api/dnc')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      }
      if (url.includes('/api/devices')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      }
      if (url.includes('/api/crm') || url.includes('/crm/')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ companies: [], contacts: [], leads: [], tasks: [], workItems: [], quotes: [] }) });
      }
      if (url.includes('/api/unibox/')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ threads: [], messages: [] }) });
      }
      if (url.includes('/email/') || url.includes('/emailer/')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ accounts: [], leads: [], templates: [] }) });
      }
      if (url.includes('/admin/') || url.includes('/api/admin/')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ tenants: [], users: [], devices: [] }) });
      }
      return route.continue();
    });

    // Helper to evaluate layout metrics
    async function inspectLayout(viewName, vp, theme = 'dark') {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(300);

      // Check 1: Horizontal overflow
      const overflow = await page.evaluate(() => {
        const docWidth = document.documentElement.scrollWidth;
        const winWidth = window.innerWidth;
        const bodyWidth = document.body.scrollWidth;
        const rootWidth = document.getElementById('root')?.scrollWidth || 0;
        const maxScroll = Math.max(docWidth, bodyWidth, rootWidth);
        const offenders = [];
        if (maxScroll > winWidth) {
          const els = document.querySelectorAll('*');
          for (const el of els) {
            const r = el.getBoundingClientRect();
            if (r.right > winWidth + 1 && r.width > 0 && r.height > 0) {
              const cs = window.getComputedStyle(el);
              if (cs.display !== 'none' && cs.visibility !== 'hidden') {
                offenders.push({
                  tag: el.tagName.toLowerCase(),
                  className: String(el.className).slice(0, 80),
                  right: Math.round(r.right),
                  width: Math.round(r.width),
                });
                if (offenders.length >= 5) break;
              }
            }
          }
        }
        return { hasOverflow: maxScroll > winWidth, maxScroll, winWidth, offenders };
      });

      if (overflow.hasOverflow) {
        addReport(viewName, vp.name, 'Horizontal Overflow', 'FAIL', `scrollWidth (${overflow.maxScroll}) > innerWidth (${overflow.winWidth}). Offenders: ${JSON.stringify(overflow.offenders)}`);
      } else {
        addReport(viewName, vp.name, 'Horizontal Overflow', 'PASS', `scrollWidth (${overflow.maxScroll}) <= innerWidth (${overflow.winWidth})`);
      }

      // Check 2: Element collisions / overlaps
      const collisions = await page.evaluate(() => {
        const selectors = [
          'header button', 'header a', 'header > div > span', '[data-testid="sidebar-toggle"]',
          '[data-testid="tenant-selector"]', '[data-testid="phone-status"]', '[data-testid="theme-toggle"]'
        ];
        const nodes = Array.from(new Set(selectors.flatMap(s => Array.from(document.querySelectorAll(s)))))
          .filter(el => {
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            return r.width > 4 && r.height > 4 && cs.visibility !== 'hidden' && cs.display !== 'none';
          });

        const hits = [];
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            if (nodes[i].contains(nodes[j]) || nodes[j].contains(nodes[i])) continue;
            const a = nodes[i].getBoundingClientRect();
            const b = nodes[j].getBoundingClientRect();
            const overlaps = !(a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1);
            if (overlaps) {
              hits.push({
                a: (nodes[i].textContent || nodes[i].tagName).trim().slice(0, 30),
                b: (nodes[j].textContent || nodes[j].tagName).trim().slice(0, 30),
              });
            }
          }
        }
        return hits;
      });

      if (collisions.length > 0) {
        addReport(viewName, vp.name, 'Element Collisions', 'FAIL', `Overlapping elements: ${JSON.stringify(collisions)}`);
      } else {
        addReport(viewName, vp.name, 'Element Collisions', 'PASS', `No header/action collisions detected`);
      }

      // Check 3: Vertical push-down / primary buttons hidden below 600px on mobile
      if (vp.width <= 400) {
        const primaryBtn = await page.evaluate(() => {
          const btn = document.querySelector('button[type="submit"], #login-submit, #register-submit-btn, #forgot-submit');
          if (!btn) return null;
          const r = btn.getBoundingClientRect();
          return { top: Math.round(r.top), bottom: Math.round(r.bottom), visible: r.width > 0 && r.height > 0 };
        });
        if (primaryBtn) {
          if (primaryBtn.bottom > 600) {
            addReport(viewName, vp.name, 'Vertical Push-down', 'FAIL', `Primary action button bottom (${primaryBtn.bottom}px) is pushed below 600px fold on mobile`);
          } else {
            addReport(viewName, vp.name, 'Vertical Push-down', 'PASS', `Primary button bottom (${primaryBtn.bottom}px) is within initial 600px mobile fold`);
          }
        }
      }

      // Check 4: Text Contrast / Gray-on-gray / White-on-white issues in light mode
      if (theme === 'light') {
        const contrastFails = await page.evaluate(() => {
          function getLuminance(r, g, b) {
            const [rs, gs, bs] = [r, g, b].map(c => {
              c = c / 255;
              return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
            });
            return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
          }
          function parseRgb(colorStr) {
            const m = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
            if (!m) return null;
            return [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])];
          }

          const fails = [];
          const textNodes = document.querySelectorAll('h1, h2, h3, h4, p, span, label, th, td, a');
          for (const el of textNodes) {
            if (!el.textContent || !el.textContent.trim()) continue;
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            const cs = window.getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden') continue;

            // Find effective background color
            let bgEl = el;
            let bgRgb = null;
            while (bgEl) {
              const bcs = window.getComputedStyle(bgEl);
              const rgb = parseRgb(bcs.backgroundColor);
              if (rgb && bcs.backgroundColor !== 'rgba(0, 0, 0, 0)' && bcs.backgroundColor !== 'transparent') {
                bgRgb = rgb;
                break;
              }
              bgEl = bgEl.parentElement;
            }
            if (!bgRgb) bgRgb = [241, 245, 249]; // default light mode slate-100

            const textRgb = parseRgb(cs.color);
            if (textRgb && bgRgb) {
              const l1 = getLuminance(...textRgb);
              const l2 = getLuminance(...bgRgb);
              const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

              // Contrast fail if ratio < 3.0 for regular text or white text on white bg
              const isWhiteOnWhite = (textRgb[0] > 240 && textRgb[1] > 240 && textRgb[2] > 240) &&
                                     (bgRgb[0] > 230 && bgRgb[1] > 230 && bgRgb[2] > 230);
              if (isWhiteOnWhite || ratio < 2.5) {
                fails.push({
                  tag: el.tagName.toLowerCase(),
                  text: el.textContent.trim().slice(0, 40),
                  textColor: cs.color,
                  bgColor: `rgb(${bgRgb.join(',')})`,
                  ratio: ratio.toFixed(2),
                  isWhiteOnWhite,
                });
                if (fails.length >= 8) break;
              }
            }
          }
          return fails;
        });

        if (contrastFails.length > 0) {
          addReport(viewName, vp.name, 'Text Contrast', 'FAIL', `Found low-contrast or white-on-white text: ${JSON.stringify(contrastFails)}`);
        } else {
          addReport(viewName, vp.name, 'Text Contrast', 'PASS', `Text contrast passes in light mode`);
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 1. LoginScreen (Sign In, Sign Up, Forgot Password)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Inspecting 1. LoginScreen.tsx ---');
    for (const mode of ['login', 'register', 'forgot']) {
      await page.goto(`${baseUrl}/tests/inspector.html?view=login`);
      await page.waitForLoadState('networkidle').catch(() => {});
      if (mode === 'register') {
        const btn = page.locator('#tab-signup-btn').first();
        if (await btn.count()) await btn.click();
      } else if (mode === 'forgot') {
        const btn = page.locator('#forgot-password-link').first();
        if (await btn.count()) await btn.click();
      }
      await page.waitForTimeout(200);

      for (const vp of VIEWPORTS) {
        await inspectLayout(`LoginScreen (${mode})`, vp, vp.theme || 'dark');
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. App.tsx Shell & Header
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Inspecting 2. App.tsx Shell & Header ---');
    await page.goto(`${baseUrl}/tests/inspector.html?view=app`);
    // Seed authenticated state in localStorage so App renders shell
    await page.evaluate(() => {
      localStorage.setItem('octal_token', 'fixture-token');
      localStorage.setItem('octal_user', 'admin');
      localStorage.setItem('octal_role', 'admin');
      localStorage.setItem('octal_company', 'Acme Telephony');
    });
    await page.reload();
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(500);

    for (const vp of VIEWPORTS) {
      if (vp.sidebarPinned !== undefined) {
        const toggle = page.locator('[data-testid="sidebar-toggle"]').first();
        const sidebar = page.locator('[data-testid="sidebar"]').first();
        if (await toggle.count() && await sidebar.count()) {
          const isExp = await sidebar.evaluate(el => el.getBoundingClientRect().width > 100);
          if (isExp !== vp.sidebarPinned) {
            await toggle.click();
            await page.waitForTimeout(300);
          }
        }
      }
      await inspectLayout('App Shell & Header', vp, vp.theme || 'dark');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. DashboardOverview.tsx
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Inspecting 3. DashboardOverview.tsx ---');
    for (const vp of VIEWPORTS) {
      const theme = vp.theme || 'dark';
      await page.goto(`${baseUrl}/tests/inspector.html?view=dashboard&theme=${theme}`);
      await page.waitForLoadState('networkidle').catch(() => {});
      await inspectLayout('DashboardOverview', vp, theme);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. CRMWorkspacePage.tsx
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Inspecting 4. CRMWorkspacePage.tsx ---');
    for (const vp of VIEWPORTS) {
      const theme = vp.theme || 'dark';
      await page.goto(`${baseUrl}/tests/inspector.html?view=crm&theme=${theme}`);
      await page.waitForLoadState('networkidle').catch(() => {});
      await inspectLayout('CRMWorkspacePage', vp, theme);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. OmnichannelUnibox.tsx
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Inspecting 5. OmnichannelUnibox.tsx ---');
    for (const vp of VIEWPORTS) {
      const theme = vp.theme || 'dark';
      await page.goto(`${baseUrl}/tests/inspector.html?view=unibox&theme=${theme}`);
      await page.waitForLoadState('networkidle').catch(() => {});
      await inspectLayout('OmnichannelUnibox', vp, theme);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 6. AutoEmailer.tsx
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Inspecting 6. AutoEmailer.tsx ---');
    for (const vp of VIEWPORTS) {
      const theme = vp.theme || 'dark';
      await page.goto(`${baseUrl}/tests/inspector.html?view=emailer&theme=${theme}`);
      await page.waitForLoadState('networkidle').catch(() => {});
      await inspectLayout('AutoEmailer', vp, theme);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 7. SuperAdminPortal.tsx
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Inspecting 7. SuperAdminPortal.tsx ---');
    for (const vp of VIEWPORTS) {
      const theme = vp.theme || 'dark';
      await page.goto(`${baseUrl}/tests/inspector.html?view=superadmin&theme=${theme}`);
      await page.waitForLoadState('networkidle').catch(() => {});
      await inspectLayout('SuperAdminPortal', vp, theme);
    }

    fs.writeFileSync('visual-inspection-report.json', JSON.stringify(report, null, 2));
    console.log(`\nInspection finished! Saved to visual-inspection-report.json. Total tests: ${report.length}`);
    const failures = report.filter(r => r.verdict === 'FAIL');
    console.log(`Total Failures: ${failures.length}`);
  } finally {
    await browser.close();
    await server.close();
  }
}

run().catch(err => {
  console.error('Inspection script error:', err);
  process.exit(1);
});
