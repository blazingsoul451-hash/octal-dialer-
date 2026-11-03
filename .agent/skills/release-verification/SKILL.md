---
name: release-verification
description: The mandatory verification gate for Octal Dialer. Use this before deploying to production (140.245.215.156 / zestify7.online), before git push, before syncing the Desktop or Google Drive export folders, and before telling the user that work is done, complete, verified, perfect, or production-ready. Requires verbatim terminal output from both typechecks, all five backend suites, the call-flow suite and the Vite build with chunk inspection. Screenshots, code review and "I checked it" do not satisfy this gate.
---

# Release Verification Gate

This project has previously been declared "100% complete, rigorously audited,
fully perfected" while containing a hardcoded credential backdoor, plaintext
mailbox passwords, a cross-tenant path traversal, a column nothing read, and a
migration that aborted startup. Every one of those survived review and
84 screenshots.

**The lesson: a claim of completion is only as good as the output pasted beneath
it.** No exceptions, no "it's a small change".

## Rule

> Never use the words *done, complete, verified, perfect, production-ready,
> fully tested* without the evidence table below filled from commands you
> actually ran in this session, with their real output.

If you did not run a command, write `NOT RUN` and why. Never infer a result.
Never reuse output from an earlier turn after further edits.

---

## The gate — run all of these

### 1. Typechecks (both must be clean)
```bash
npm --prefix website_octal_dialer/backend exec tsc -- --noEmit
npm --prefix website_octal_dialer/frontend exec tsc -- --noEmit
```
Expected: no output, exit 0. Any error = gate failed.

### 2. Backend suites (all five)
```bash
npm --prefix website_octal_dialer/backend run test:security       # expect 24
npm --prefix website_octal_dialer/backend run test:hardening      # expect 22
npm --prefix website_octal_dialer/backend run test:web-hardening  # expect 20
npm --prefix website_octal_dialer/backend run test:migrations     # expect 35, real PostgreSQL
npm --prefix website_octal_dialer/backend run test:e2e            # boots PG + API, 9 suites
```

Notes:
- `test:migrations` spins up an embedded PostgreSQL and applies
  `schema.sql` + every migration. **This is the only thing that catches a
  migration that would brick startup.** Mandatory after any DB change.
- `test:e2e` boots a real server and runs the integration suites that cover
  platform/tenant authority isolation, production portal isolation, per-role
  permissions, the onboarding lifecycle and CRM. Takes several minutes; the
  server needs up to ~5 min to come up under `tsx`. Do not shorten the timeout
  to make it "pass".

### 3. Behavioural suites
```bash
npm test                                                   # call flow + outcomes
node scripts/test_emailer_and_facebook_poster.cjs          # expect 11
```

### 4. Frontend build + chunk inspection
```bash
npm --prefix website_octal_dialer/frontend run build
```
Read the chunk table, do not skim it. Record the main chunk size.
Budget: **main chunk < 800 kB** (currently ~1,667 kB — over, see
`.agent/skills/monolith-refactor` §C). A build that grows the main chunk
without justification fails the gate.

### 5. UI changes
If anything in `frontend/src` changed, run `.agent/skills/ui-browser-verify`
in full and include its viewport table. A passing `tsc` says nothing about
layout.

### 6. Mobile / desktop clients
If `application_octal_dialer` or `desktop_octal_agent` changed:
```bash
cd application_octal_dialer && flutter analyze
cd desktop_octal_agent     && flutter analyze
```
Expected: `No issues found!`. The desktop agent once shipped unable to compile
because nothing ran this.

---

## Evidence table — paste this, filled

```
Check                                  Result
backend tsc --noEmit                   clean
frontend tsc --noEmit                  clean
test:security                          24 groups passed
test:hardening                         22 passed
test:web-hardening                     20 passed
test:migrations (real PostgreSQL)      35 passed
test:e2e                               N/9 suites passed
npm test (call flow)                   100%
emailer + facebook poster              11/11
vite build                             main chunk ___ kB  (budget < 800)
flutter analyze (android / desktop)    No issues found / N/A
ui-browser-verify                      see viewport table / N/A
```

---

## Pre-deployment checklist (production only)

Beyond the gate, before touching `140.245.215.156` / `zestify7.online`:

- [ ] `SECRETS_KEY` set in the production env (startup fails without it)
- [ ] `TRUST_PROXY=1` set — otherwise every client shares one rate-limit
      bucket behind nginx and 20 failed logins lock out the whole platform
- [ ] `BOOTSTRAP_ADMIN_PASSWORD` / `BOOTSTRAP_OWNER_PASSWORD` set, and **not**
      the historical literals (`AdminPassword123!`, `OwnerPassword1234!` are
      compromised — they are in git history and in the export folders)
- [ ] Migrations reviewed as ASCII-only, de-dup before UNIQUE, orphan cleanup
      before FK, and `test:migrations` green
- [ ] `git status` clean; work committed on `feature/saas-structure-v2`
- [ ] Health check after deploy: `curl -i https://zestify7.online/api/health`
      → `HTTP 200`
- [ ] PM2 shows `octal-backend` `online` with no restart loop

## Export-folder sync

Syncing to `C:\Users\ice\Desktop\Octal_Dialer_Code_For_Gemini` or
`G:\My Drive\Octal_Dialer_Code` **publishes the source**. Before syncing:

- [ ] No credential literals in the tree (`grep -rniE "password\s*===?\s*['\"]"`)
- [ ] No tokens in `.git/config` remote URLs
- [ ] `.env` is not included

Google Drive is an external service; treat a sync as distribution.

---

## Reporting failures

If a check fails, report it plainly with the output. Do not:
- re-run with a shorter timeout until it passes
- skip a suite and omit it from the table
- describe a failure as "a known issue" without a line reference
- claim partial success as success

A red gate with an honest table is a good outcome. A green claim with no output
is worthless — that is exactly how this codebase accumulated the defects in
`AGENTS.md` §6.
