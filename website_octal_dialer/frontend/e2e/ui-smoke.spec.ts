import { test, expect, Page, TestInfo } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface Viewport {
  name: string;
  width: number;
  height: number;
  sidebarExpanded?: boolean;
}

const VIEWPORTS: Viewport[] = [
  { name: 'mobile 375x812', width: 375, height: 812 },
  { name: 'tablet 768x1024 (sidebar expanded)', width: 768, height: 1024, sidebarExpanded: true },
  { name: 'tablet 768x1024 (sidebar collapsed)', width: 768, height: 1024, sidebarExpanded: false },
  { name: 'laptop 1024x768', width: 1024, height: 768 },
  { name: 'desktop 1440x900', width: 1440, height: 900 },
];

const ALLOWED_4XX = [/\/api\/auth\/verify/, /\/api\/health/];

interface Harness {
  failures: string[];
  assertClean: () => void;
}

function attachFailureListeners(page: Page): Harness {
  const failures: string[] = [];

  page.on('pageerror', (err) => failures.push(`pageerror: ${err.message}`));

  page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() === 'error') {
      if (/favicon|\[vite\]|ERR_CONNECTION_REFUSED|Failed to fetch/i.test(text)) return;
      failures.push(`console.error: ${text}`);
      return;
    }
    if (
      msg.type() === 'warning' &&
      /\b(unique "key"|Each child in a list|validateDOMNesting|Invalid DOM property|received `true` for a non-boolean)\b/i.test(text)
    ) {
      failures.push(`react-warning: ${text}`);
    }
  });

  page.on('response', (res) => {
    const url = res.url();
    if (!url.includes('/api/')) return;
    if (res.status() < 400) return;
    if (res.status() === 401 && ALLOWED_4XX.some((re) => re.test(url))) return;
    failures.push(`HTTP ${res.status()} ${url}`);
  });

  page.on('requestfailed', (req) => {
    const f = req.failure();
    if (f && (/net::ERR_ABORTED/.test(f.errorText) || /net::ERR_CONNECTION_REFUSED/.test(f.errorText))) return;
    failures.push(`requestfailed: ${req.url()} (${f?.errorText})`);
  });

  return {
    failures,
    assertClean: () =>
      expect(failures, `runtime failures:\n${failures.join('\n')}`).toEqual([]),
  };
}

async function assertNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const result = await page.evaluate(() => {
    const offenders = Array.from(document.querySelectorAll<HTMLElement>('*'))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return false;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') return false;
        let p: HTMLElement | null = el.parentElement;
        while (p) {
          const pcs = getComputedStyle(p);
          if (pcs.overflowX === 'auto' || pcs.overflowX === 'scroll') return false;
          p = p.parentElement;
        }
        return r.right > window.innerWidth + 1;
      })
      .slice(0, 8)
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        cls: String(el.className || '').slice(0, 120),
        right: Math.round(el.getBoundingClientRect().right),
      }));

    return {
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      offenders,
    };
  });

  expect(
    result.scrollWidth,
    `${label}: page scrolls horizontally (${result.scrollWidth} > ${result.innerWidth}). Offenders: ${JSON.stringify(result.offenders, null, 2)}`
  ).toBeLessThanOrEqual(result.innerWidth);
}

async function assertNoHeaderCollisions(page: Page, label: string): Promise<void> {
  const collisions = await page.evaluate(() => {
    const selectors = [
      '[data-testid="breadcrumb"]',
      '[data-testid="phone-status"]',
      '[data-testid="tenant-selector"]',
      'header button',
      'header a',
      'header > div > span',
    ];

    const nodes = Array.from(
      new Set(selectors.flatMap((s) => Array.from(document.querySelectorAll<HTMLElement>(s))))
    ).filter((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 4 && r.height > 4 && cs.visibility !== 'hidden' && cs.display !== 'none';
    });

    const overlaps = (a: DOMRect, b: DOMRect) =>
      !(a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1);

    const hits: { a: string; b: string }[] = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (nodes[i].contains(nodes[j]) || nodes[j].contains(nodes[i])) continue;
        if (overlaps(nodes[i].getBoundingClientRect(), nodes[j].getBoundingClientRect())) {
          hits.push({
            a: (nodes[i].textContent || nodes[i].tagName).trim().slice(0, 40),
            b: (nodes[j].textContent || nodes[j].tagName).trim().slice(0, 40),
          });
        }
      }
    }
    return hits;
  });

  expect(collisions, `${label}: header elements overlap: ${JSON.stringify(collisions)}`).toEqual([]);
}

async function assertLayoutAt(page: Page, vp: Viewport, isAuthenticated = false): Promise<void> {
  await page.setViewportSize({ width: vp.width, height: vp.height });

  if (isAuthenticated && vp.sidebarExpanded !== undefined) {
    const sidebar = page.locator('[data-testid="sidebar"]').first();
    const toggle = page.locator('[data-testid="sidebar-toggle"]').first();
    await expect(sidebar, 'Missing data-testid="sidebar" in App.tsx').toBeVisible();
    await expect(toggle, 'Missing data-testid="sidebar-toggle" in App.tsx').toBeVisible();

    const currentlyExpanded = await sidebar.evaluate((el) => el.getBoundingClientRect().width > 100);
    if (currentlyExpanded !== vp.sidebarExpanded) {
      await toggle.click();
      await page.waitForTimeout(350);
    }

    const finalWidth = await sidebar.evaluate((el) => el.getBoundingClientRect().width);
    if (vp.sidebarExpanded) {
      expect(finalWidth, `${vp.name}: expected sidebar to be expanded (>120px)`).toBeGreaterThan(120);
    } else {
      expect(finalWidth, `${vp.name}: expected sidebar to be collapsed (<100px)`).toBeLessThan(100);
    }
  }

  await page.waitForTimeout(350);
  await assertNoHorizontalOverflow(page, vp.name);
  await assertNoHeaderCollisions(page, vp.name);
}

function extractFrontendApiPaths(dir: string, found = new Set<string>()): string[] {
  if (!fs.existsSync(dir)) return [...found];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      extractFrontendApiPaths(full, found);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      const content = fs.readFileSync(full, 'utf8');
      const matches = content.matchAll(/['"`](\/api\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*)['"`]/g);
      for (const m of matches) {
        if (!m[1].includes('$')) found.add(m[1]);
      }
    }
  }
  return [...found];
}

const OWNER_EMAIL = process.env.E2E_OWNER_EMAIL || 'owner@octal.local';
const OWNER_PASSWORD = process.env.E2E_OWNER_PASSWORD || '';
const ADMIN_USER = process.env.E2E_ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || '';
const API_BASE = process.env.E2E_API_URL || 'http://localhost:5000';

async function apiReachable(page: Page): Promise<boolean> {
  try {
    const res = await page.request.get(`${API_BASE}/api/health`, { timeout: 4000 });
    return res.ok();
  } catch {
    return false;
  }
}

async function login(page: Page, user: string, password: string): Promise<boolean> {
  await page.goto('/');
  const userField = page
    .locator('input[type="email"], input[name="username"], input[placeholder*="mail" i]')
    .first();
  await expect(userField).toBeVisible();
  await userField.fill(user);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('button[type="submit"]').first().click();

  await page.waitForURL((u) => !/login/i.test(u.toString()), { timeout: 20_000 }).catch(() => {});
  return !(await page.locator('input[type="password"]').first().isVisible().catch(() => false));
}

test.describe('1. responsive layout (login screen)', () => {
  for (const vp of VIEWPORTS) {
    test(`login screen has no overflow or collisions @ ${vp.name}`, async ({ page }) => {
      const h = attachFailureListeners(page);
      await page.goto('/');
      await page.waitForLoadState('networkidle').catch(() => {});
      await assertLayoutAt(page, vp, false);
      h.assertClean();
    });
  }
});

test.describe('1b. responsive layout (authenticated dashboard)', () => {
  test.skip(!OWNER_PASSWORD, 'E2E_OWNER_PASSWORD not set');

  for (const vp of VIEWPORTS) {
    test(`dashboard shell has no overflow or collisions @ ${vp.name}`, async ({ page }) => {
      const h = attachFailureListeners(page);
      test.skip(!(await apiReachable(page)), 'backend not reachable');
      expect(await login(page, OWNER_EMAIL, OWNER_PASSWORD), 'owner login failed').toBe(true);

      await assertLayoutAt(page, vp, true);
      h.assertClean();
    });
  }
});

test('2. flow: login renders and transitions to dashboard', async ({ page }) => {
  const h = attachFailureListeners(page);
  await page.goto('/');
  await expect(page.locator('input[type="password"]').first()).toBeVisible();

  if (OWNER_PASSWORD && (await apiReachable(page))) {
    expect(await login(page, OWNER_EMAIL, OWNER_PASSWORD)).toBe(true);
    await expect(page.locator('header').first()).toBeVisible();
  }
  h.assertClean();
});

test('3. flow: create lead modal opens and fits mobile viewport', async ({ page }) => {
  const h = attachFailureListeners(page);
  test.skip(!OWNER_PASSWORD, 'E2E_OWNER_PASSWORD not set');
  test.skip(!(await apiReachable(page)), 'backend not reachable');
  expect(await login(page, OWNER_EMAIL, OWNER_PASSWORD)).toBe(true);

  const trigger = page.getByRole('button', { name: /add lead|new lead|create lead/i }).first();
  await expect(trigger, 'Add Lead button must be visible in CRM workspace').toBeVisible({ timeout: 10_000 });
  await trigger.click();

  const nameField = page.locator('input[placeholder*="name" i]').first();
  await expect(nameField).toBeVisible({ timeout: 10_000 });
  await nameField.fill('Playwright Probe');
  await expect(nameField).toHaveValue('Playwright Probe');

  await assertLayoutAt(page, VIEWPORTS[0], false);
  h.assertClean();
});

test('4. flow: dialer pairing panel renders QR and status', async ({ page }) => {
  const h = attachFailureListeners(page);
  test.skip(!OWNER_PASSWORD, 'E2E_OWNER_PASSWORD not set');
  test.skip(!(await apiReachable(page)), 'backend not reachable');
  expect(await login(page, OWNER_EMAIL, OWNER_PASSWORD)).toBe(true);

  const pill = page
    .locator('[data-testid="phone-status"]')
    .or(page.getByText(/phone (offline|online)|pair device/i))
    .first();
  await expect(pill, 'Phone status pill must be visible in header').toBeVisible({ timeout: 10_000 });
  await pill.click();

  const qr = page.locator('svg[height], canvas').first();
  await expect(qr, 'QR code SVG/Canvas must render inside pairing modal').toBeVisible({ timeout: 10_000 });
  h.assertClean();
});

test('5. flow: unibox opens thread with container-scoped scroll (zero window scroll drift)', async ({ page }) => {
  const h = attachFailureListeners(page);
  test.skip(!OWNER_PASSWORD, 'E2E_OWNER_PASSWORD not set');
  test.skip(!(await apiReachable(page)), 'backend not reachable');
  expect(await login(page, OWNER_EMAIL, OWNER_PASSWORD)).toBe(true);

  const nav = page.getByRole('button', { name: /unibox|omnichannel|inbox/i }).first();
  await expect(nav, 'Unibox navigation button must be visible').toBeVisible({ timeout: 10_000 });
  await nav.click();
  await page.waitForTimeout(600);

  const headerTopBefore = await page.locator('header').first().evaluate((el) => el.getBoundingClientRect().top);
  const windowScrollBefore = await page.evaluate(() => window.scrollY);

  const thread = page.locator('[data-testid="thread-card"]').first();
  if (await thread.count()) {
    await thread.click();
    await page.waitForTimeout(800);

    expect(await page.evaluate(() => window.scrollY), 'window scrolled on thread open').toBe(windowScrollBefore);
    expect(
      await page.locator('header').first().evaluate((el) => el.getBoundingClientRect().top),
      'header drifted after opening a thread'
    ).toBe(headerTopBefore);
  }

  await assertLayoutAt(page, VIEWPORTS[0], false);
  h.assertClean();
});

test('6. flow: superadmin tenant switcher', async ({ page }) => {
  const h = attachFailureListeners(page);
  test.skip(!ADMIN_PASSWORD, 'E2E_ADMIN_PASSWORD not set');
  test.skip(!(await apiReachable(page)), 'backend not reachable');
  expect(await login(page, ADMIN_USER, ADMIN_PASSWORD)).toBe(true);

  const selector = page
    .locator('[data-testid="tenant-selector"]')
    .or(page.getByRole('button', { name: /tenant|workspace/i }))
    .first();
  await expect(selector, 'SuperAdmin tenant selector must be visible').toBeVisible({ timeout: 10_000 });
  await selector.click();
  await page.waitForTimeout(500);

  await assertLayoutAt(page, VIEWPORTS[4], true);
  h.assertClean();
});

test('7. API route-drift guard: static /api/ paths in frontend/src resolve (no 404)', async ({ page }) => {
  test.skip(!(await apiReachable(page)), 'backend not reachable');

  const hardcoded = [
    '/api/health',
    '/api/dnc',
    '/api/suppression-list',
    '/api/leads',
    '/api/campaigns',
    '/api/call-logs',
    '/api/unibox/threads',
    '/api/facebook-poster/accounts',
    '/api/reports/analytics-hub',
  ];

  const scanned = extractFrontendApiPaths(path.resolve(__dirname, '../src'));
  const allPaths = Array.from(new Set([...hardcoded, ...scanned]));

  const drifted: string[] = [];
  for (const p of allPaths) {
    const getRes = await page.request.get(`${API_BASE}${p}`, {
      failOnStatusCode: false,
      timeout: 10_000,
    });
    if (getRes.status() === 404) {
      // Some endpoints are POST-only; probe POST before declaring a 404 route drift
      const postRes = await page.request.post(`${API_BASE}${p}`, {
        failOnStatusCode: false,
        timeout: 10_000,
      });
      if (postRes.status() === 404) {
        drifted.push(`${p} -> 404 (GET & POST)`);
      }
    }
  }

  expect(drifted, `Frontend calls /api routes that return 404 on backend:\n${drifted.join('\n')}`).toEqual([]);
});

test('8. light mode parity renders without overflow or collisions', async ({ page }) => {
  const h = attachFailureListeners(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});

  const toggle = page
    .locator('[data-testid="theme-toggle"]')
    .or(page.getByRole('button', { name: /theme|light|dark/i }))
    .first();

  if (OWNER_PASSWORD && (await apiReachable(page))) {
    expect(await login(page, OWNER_EMAIL, OWNER_PASSWORD)).toBe(true);
    await expect(toggle, 'Theme toggle must be visible on authenticated shell').toBeVisible();
    await toggle.click();
    await page.waitForTimeout(400);
    await assertLayoutAt(page, VIEWPORTS[4], true);
    await assertLayoutAt(page, VIEWPORTS[0], false);
  } else if (await toggle.count()) {
    await toggle.click();
    await page.waitForTimeout(400);
    await assertLayoutAt(page, VIEWPORTS[4], false);
    await assertLayoutAt(page, VIEWPORTS[0], false);
  }

  h.assertClean();
});

test.afterEach(async ({ page }, testInfo: TestInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    await testInfo.attach('viewport', {
      body: JSON.stringify(page.viewportSize()),
      contentType: 'application/json',
    });
  }
});
