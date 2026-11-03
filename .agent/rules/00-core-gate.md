---
trigger: always_on
description: "Core verification gate, evidence requirements, and known defect blacklist for Octal Dialer."
---

# Octal Dialer — Core Engineering & Verification Gate

## 1. No Unverified Completion Claims
Never describe work as "complete", "perfect", "verified", "100% done", or "production-ready" without running and pasting the verbatim output of the verification suites in `.agent/skills/release-verification/SKILL.md`:
- `npm --prefix website_octal_dialer/backend exec tsc -- --noEmit`
- `npm --prefix website_octal_dialer/frontend exec tsc -- --noEmit`
- `npm --prefix website_octal_dialer/backend run test:security` (24 groups)
- `npm --prefix website_octal_dialer/backend run test:hardening` (22 checks)
- `npm --prefix website_octal_dialer/backend run test:web-hardening` (20 checks)
- `npm --prefix website_octal_dialer/backend run test:migrations` (35 checks, real PG)
- `npm --prefix website_octal_dialer/backend run test:e2e` (9 suites)
- `npm --prefix website_octal_dialer/frontend run test:e2e:ui` (Playwright 5-viewport battery)

Screenshots are NOT verification. "I reviewed the code" is NOT verification. If a suite was not run, explicitly state `NOT RUN` and why.

## 2. File Size Cap & Legacy Monolith Exemption
1. **New Files Only:** The <600-line file limit applies ONLY to newly created files. Every new file must stay under 600 lines.
2. **Grandfathered Monoliths:** Existing legacy large files (`server.ts`, `App.tsx`, `databaseManager.ts`, `authManager.ts`, `SuperAdminPortal.tsx`, `UsersAndRolesView.tsx`, `CRMWorkspacePage.tsx`, `CRMModals.tsx`) are permanently grandfathered in.
3. **Never Refactor Unprompted:** NEVER attempt to split, decompose, or reorganize `server.ts`, `App.tsx`, or `CRMWorkspacePage.tsx` during a bug fix or routine feature task unless the user explicitly instructs: "Extract/refactor this specific module".
4. **New Feature Pattern:** When building a brand-new major feature domain, create a new modular file/router and import or mount it into `server.ts` / `App.tsx`, but leave existing inline code and working handlers untouched.

## 3. Known Defect Blacklist (Never Reintroduce)
1. **Hardcoded Auth Backdoors:** Never hardcode fallback passwords (`AdminPassword123!`, `OwnerPassword1234!`) or bypass hash checks in `authManager.ts`.
2. **Route & Payload Drift:** Never expose a backend route under one name (`/api/suppression-list`) while the frontend fetches another (`/api/dnc`), or return `{ items: [] }` when the UI calls `.map()` on a raw array.
3. **768px Tablet Header Collision:** Never let `WORKSPACE / ...` breadcrumbs collide with the `Phone Offline` pill or tenant selector at `768px` when the sidebar is expanded/pinned.
4. **Window Scroll Drift:** Never call `element.scrollIntoView()` in chat/log panes (`OmnichannelUnibox.tsx`); always scroll the container ref (`containerRef.current.scrollTo(...)`).
5. **Silent Catch Blocks:** Never write an empty `catch {}` block anywhere in frontend or backend code.
6. **Non-ASCII Migrations:** Never put Unicode box-drawing characters or smart quotes in SQL migrations (breaks `WIN1252` clusters).
