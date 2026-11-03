---
name: parallel-audit
description: Orchestrates a 3-agent parallel engineering audit using Antigravity's run_workflow tool. Use when asked for a full project audit, pre-deployment check, or comprehensive verification instead of taking manual screenshots.
---

# Parallel Engineering Audit (`run_workflow`)

When auditing Octal Dialer, never spawn subagents just to capture screenshots. Run a 3-track parallel verification workflow followed by a synthesis gate:

## Phase 1 — Parallel Verification Tracks (`parallel`)

### Track 1: Frontend Geometry, Playwright & Token Auditor
1. Run `npm --prefix website_octal_dialer/frontend exec tsc -- --noEmit`.
2. Run `npm --prefix website_octal_dialer/frontend run test:e2e:ui` (verifies `375`, `768` pinned, `768` collapsed, `1024`, `1440` dark + light, header collisions, horizontal overflow, and dynamic `/api/` route drift).
3. Grep `website_octal_dialer/frontend/src` for forbidden `scrollIntoView(` calls and check `git diff` for any modified file exceeding 600 lines.

### Track 2: Backend Tenant Isolation, Catch-Block & Security Auditor
1. Run `npm --prefix website_octal_dialer/backend exec tsc -- --noEmit`.
2. Grep modified files in `website_octal_dialer/backend/src` for empty catch blocks (`catch\s*(\([^)]*\))?\s*\{\s*\}`) and SQL queries missing `"tenantId"`.
3. Run `test:security`, `test:hardening`, and `test:web-hardening`.

### Track 3: Migrations, E2E & Bundle Budget Auditor
1. Check `website_octal_dialer/backend/src/migrations` for non-ASCII bytes (`LC_ALL=C grep -n '[^ -~]'`).
2. Run `npm --prefix website_octal_dialer/backend run test:migrations`.
3. Run `npm --prefix website_octal_dialer/frontend run build` and verify the main JS chunk is under 800 kB.

## Phase 2 — Synthesis Gate (`phase`)
Aggregate outputs from Tracks 1–3 into the mandatory Evidence Table defined in `.agent/skills/release-verification/SKILL.md`. Any failure blocks completion.
