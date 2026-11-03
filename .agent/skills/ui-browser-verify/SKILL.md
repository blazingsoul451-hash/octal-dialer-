---
name: ui-browser-verify
description: Mandatory protocol for verifying any UI, layout, styling or responsive change in the Octal Dialer frontend by driving a real browser via the Playwright MCP. Use this whenever you add or edit a React component, change Tailwind classes, alter layout or scrolling, touch App.tsx shell/sidebar/breadcrumbs, or are about to claim that a UI change "works", "is responsive", or "is verified". Also use when a user reports a visual bug, overlap, clipping, scroll drift, or a 404 from the UI. Screenshots alone are NOT verification.
---

# UI Browser Verification Protocol

A screenshot proves something rendered. It does not prove no element overlaps,
that the page does not scroll horizontally, or that no request 404'd.
HOWEVER: **Math without eyes is also dangerous.** Relying exclusively on
`scrollWidth <= innerWidth` fails to catch vertical ergonomics (e.g. login form
pushed 500px below the fold on mobile). **Measure AND inspect visually.**

Every UI verification MUST confirm:
1. **Vertical Ergonomics (Mobile):** On standard mobile viewports (375x812), primary inputs and submit buttons must render **above the fold** (within the first 600px of vertical viewport height), requiring zero downward scroll to begin interaction.
2. **Visual Screenshot Capture:** Must physically take a screenshot at 375px and inspect element bounding boxes.
3. **Zero Horizontal Scroll:** `scrollWidth <= innerWidth`.
4. **Zero Header Collision:** Fixed headers must use `flex-nowrap overflow-hidden` and leave >= 80px buffer on mobile screens.

## 0 — Prerequisites

Dev server must be up. Prefer the Playwright MCP; fall back to a local
Playwright script if the MCP is unavailable.

```bash
npm --prefix website_octal_dialer/frontend run dev   # http://localhost:5173
npm --prefix website_octal_dialer/backend run dev    # http://localhost:3000
```

If the backend is not running, API assertions are meaningless — say so rather
than reporting a pass.

## 1 — Attach failure listeners BEFORE navigating

Nothing below counts unless these are attached first. A change is **FAILED** if
any fires.

```js
const failures = [];
page.on('pageerror', e => failures.push(`pageerror: ${e.message}`));
page.on('console', m => {
  if (m.type() === 'error') failures.push(`console.error: ${m.text()}`);
  // React key/prop warnings arrive as warnings — treat as failures too
  if (m.type() === 'warning' && /\b(key|prop|validateDOMNesting|Each child)\b/i.test(m.text()))
    failures.push(`react-warning: ${m.text()}`);
});
page.on('response', r => {
  if (r.status() >= 400 && r.url().includes('/api/'))
    failures.push(`HTTP ${r.status()} ${r.url()}`);   // catches the /api/dnc 404 class
});
page.on('requestfailed', r => failures.push(`requestfailed: ${r.url()}`));
```

Expected 401s on an unauthenticated page are the only allowed `>=400`. Assert
them explicitly by URL; never blanket-ignore 4xx.

## 2 — The four viewports, and the fifth case

```js
const VIEWPORTS = [
  { name: 'mobile',  width: 375,  height: 812  },
  { name: 'tablet',  width: 768,  height: 1024 },  // run TWICE: sidebar pinned + collapsed
  { name: 'laptop',  width: 1024, height: 768  },
  { name: 'desktop', width: 1440, height: 900  },
];
```

**768px with the sidebar pinned/expanded is mandatory and has broken twice.**
Toggle the sidebar and re-measure — do not assume one 768 pass covers both.

## 3 — Assertion A: zero horizontal page overflow

```js
const overflow = await page.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  innerWidth: window.innerWidth,
  offenders: [...document.querySelectorAll('*')]
    .filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.right > window.innerWidth + 1;
    })
    .slice(0, 10)
    .map(el => ({
      tag: el.tagName.toLowerCase(),
      cls: (el.className || '').toString().slice(0, 120),
      right: Math.round(el.getBoundingClientRect().right),
    })),
}));
// FAIL if overflow.scrollWidth > overflow.innerWidth
```

If an offender is a table/kanban/log, the fix is wrapping it in
`overflow-x-auto` — **not** shrinking text or forcing `w-full`.

## 4 — Assertion B: no bounding-box collisions in the header

The regression that recurs. Measure real geometry, not appearance.

```js
const collisions = await page.evaluate(() => {
  const sel = [
    '[data-testid="breadcrumb"]',
    '[data-testid="phone-status"]',
    '[data-testid="tenant-selector"]',
    'header button', 'header a', 'header span',
  ];
  const nodes = sel.flatMap(s => [...document.querySelectorAll(s)])
    .filter(el => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 4 && r.height > 4 && cs.visibility !== 'hidden' && cs.display !== 'none';
    });

  const overlap = (a, b) =>
    !(a.right <= b.left + 1 || b.right <= a.left + 1 ||
      a.bottom <= b.top + 1 || b.bottom <= a.top + 1);

  const hits = [];
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++) {
      if (nodes[i].contains(nodes[j]) || nodes[j].contains(nodes[i])) continue;
      const a = nodes[i].getBoundingClientRect(), b = nodes[j].getBoundingClientRect();
      if (overlap(a, b)) hits.push({
        a: nodes[i].textContent.trim().slice(0, 30),
        b: nodes[j].textContent.trim().slice(0, 30),
      });
    }
  return hits;
});
// FAIL if collisions.length > 0
```

Skip ancestor/descendant pairs — nesting is not collision. If the header lacks
`data-testid` hooks, add them; they are cheap and make this assertion reliable.

## 5 — Assertion C: container-scoped scrolling, not window scrolling

For any auto-scrolling list (Unibox messages, bot terminals, log feeds):

```js
const before = await page.evaluate(() => window.scrollY);
// trigger the action that appends content / selects a thread
const after = await page.evaluate(() => window.scrollY);
// FAIL if before !== after  → scrollIntoView() is scrolling the window
```

The fix is always `containerRef.current.scrollTo({ top: … })`, never
`element.scrollIntoView()`.

## 6 — Assertion D: fixed chrome stays put

```js
const headerTop = await page.evaluate(() =>
  document.querySelector('header')?.getBoundingClientRect().top);
// after scrolling the inner container, re-read: must be unchanged
```

## 7 — Assertion E: the change is actually visible

Confirm the element you added exists, is in the viewport, and has non-zero size
at every viewport. A component that renders at 1440 and collapses to 0px at 375
is a failure, not a pass.

```js
const box = await page.locator('[data-testid="your-new-thing"]').boundingBox();
// FAIL if !box || box.width < 1 || box.height < 1
```

## 8 — Light mode

Every component takes `isLight`. Toggle the theme and repeat §3–§7 at 1440 and
375 minimum. Check text is not `slate-400` on `slate-100` (unreadable) — sample
computed colours if the contrast looks marginal.

## 9 — Report format

Never say "verified" without this table filled from real runs:

```
Viewport              Overflow  Collisions  console.error  HTTP>=400  Visible
375x812                  PASS      PASS         PASS         PASS      PASS
768x1024 (pinned)        PASS      PASS         PASS         PASS      PASS
768x1024 (collapsed)     PASS      PASS         PASS         PASS      PASS
1024x768                 PASS      PASS         PASS         PASS      PASS
1440x900                 PASS      PASS         PASS         PASS      PASS
1440x900 light           PASS      PASS         PASS         PASS      PASS
```

Any FAIL → fix and re-run the whole table. Do not report partial passes as
success, and do not explain away a failure without changing code.

## 10 — Regression suite

Durable cases belong in `website_octal_dialer/frontend/e2e/ui-smoke.spec.ts`,
which already encodes the five critical flows and the responsive helper:

```bash
npm --prefix website_octal_dialer/frontend run test:e2e:ui
```

When you fix a visual bug, add an assertion there so it cannot return.
