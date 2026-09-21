# Pre-Change Comprehensive Audit: Google Scraper & Facebook Scraper References

**Audit Date**: 2026-09-21  
**Project**: OCTAL / Zestify Local Product Split  
**Objective**: Audit all references to `Google Scraper` (`google_scraper`, `googleScraper`) and `Facebook Scraper` (`facebook_scraper`, `facebookScraper`) across the codebase before making any modifications, verifying safety, engine dependencies, and decoupling actions.

---

## 1. Architectural Guidelines & Safety Invariants

1. **Working Scraper Engines Preserved**:
   - Google Maps scraper engine (`backend/src/scraper/`, `ScraperFilesPanel.tsx`, background Puppeteer workers) and Facebook Scraper engine (`FacebookScraper.tsx`, background scripts) remain 100% intact in source code.
   - They will serve as the foundation for the upcoming standalone Lead Generation product.
2. **Facebook Auto Poster Preserved**:
   - `facebook_poster` / `facebookPoster` (`FacebookAutoPoster.tsx`, schedule workers) is a core posting automation product, NOT a scraper. It remains 100% untouched and active in Zestify Core.
3. **Email Manager Preserved**:
   - `auto_emailer` / `autoEmailer` remains an active core Zestify pillar.
4. **Zero Destructive Migrations**:
   - No SQL drops, no deletion of historical `scraped_leads`, `scraper_jobs`, or legacy entitlement records.
5. **Backwards Tolerance**:
   - Backend APIs and database loaders must gracefully handle historical database rows containing `google_scraper` or `facebook_scraper` without crashing or throwing errors.

---

## 2. Reference Audit Table

| # | Reference Key | File | Purpose | Safe to Remove from Core? | Engine Dependency? | Action |
|---|---|---|---|:---:|:---:|---|
| 1 | `google_scraper`, `facebook_scraper` | `backend/src/databaseManager.ts` | Defined in `CANONICAL_MODULES` array (lines 2231, 2233). Sets default baseline for tenant module entitlements. | **YES** | None | Decouple from core `CANONICAL_MODULES` (reduces active core catalog from 9 to 7). Retain in `ALL_CANONICAL_MODULES` for backwards-compatible key normalization. |
| 2 | `googleScraper`, `facebookScraper` | `backend/src/databaseManager.ts` | Included in `ALL_BUSINESS_MODULES` array (lines 833, 835). Used for validating user permission keys. | **YES** | None | Move to `LEGACY_BUSINESS_MODULES`. Core becomes 7 modules: `crm`, `campaigns`, `octalDialer`, `leads`, `reports`, `autoEmailer`, `facebookPoster`. |
| 3 | `googleScraper`, `facebookScraper` | `backend/src/entitlementManager.ts` | Default feature flags in `standardPlans` (`plan_starter`, `plan_pro`, `plan_enterprise`, `plan_legacy`) and trial fallback (lines 69, 71, 87, 89, 105, 107, 181, 183, 222, 224). | **YES** | None | Set to `false` or omit from standard plan features. New customer signups and plan subscriptions will no longer receive scraper feature flags. |
| 4 | `googleScraper`, `facebookScraper` | `backend/src/authManager.ts` | Default permission assignment loop in Google OAuth signup (`authManager.ts` line 268) and email verification signup (line 524). | **YES** | None | Remove `googleScraper` and `facebookScraper` from default signup permission loops. New users receive strictly core modules. |
| 5 | `googleScraper`, `facebookScraper` | `backend/src/authManager.ts` | Initial tenant admin onboarding permission loop (line 1488). | **YES** | None | Update to the 7 core modules. |
| 6 | `googleScraper`, `facebookScraper` | `backend/src/server.ts` | Permission extraction check in `GET /api/me/permissions` (line 755). | **YES** | None | Derived from `ALL_BUSINESS_MODULES`. Tolerates legacy keys if present in DB without exposing them as core UI tabs. |
| 7 | `googleScraper`, `facebookScraper` | `frontend/src/App.tsx` | Left navigation sidebar accordion menus (lines 1080-1145 for Google Scraper; lines 1215-1279 for Facebook Scraper). | **YES** | View Only | Remove accordion groups from sidebar. Users will see only the 4 core pillars + supporting modules. |
| 8 | `activeTab === 'scraper' \| 'fb-scraper'` | `frontend/src/App.tsx` | View rendering in main area (lines 1677-1695, lines 1734-1751). | **YES** | Engine preserved | If accessed via legacy route, render clean notice indicating scrapers have moved to the separate Lead Generation product, with button to CRM. Keep component imports to preserve test invariants. |
| 9 | `googleScraper`, `facebookScraper` | `frontend/src/components/settings/UsersAndRolesView.tsx` | Defined in `AVAILABLE_MODULES` (lines 78, 80). Used for module permission checkboxes across Users, Team Leads, Teams, and Access Matrix. | **YES** | None | Remove from `AVAILABLE_MODULES`. Module totals calculate cleanly as `X / 7 modules` instead of `X / 9 modules`. |
| 10 | `Google Scraper` | `frontend/src/components/settings/CompanySettings.tsx` | Displayed in active company modules card (line 652). | **YES** | None | Remove `Google Scraper` entry from active module display. |
| 11 | `google_scraper`, `facebook_scraper` | `frontend/src/components/SuperAdminPortal.tsx` | Platform Console `CANONICAL_MODULES` list (lines 89, 91). Used in tenant entitlement toggles and access matrix. | **YES** | None | Remove from platform console's standard customer module catalog so new tenants display 7 active core modules. |
| 12 | `Google Maps Scraper` | `frontend/src/components/SuperAdminPortal.tsx` | Jobs tab background automation worker card (lines 1062-1071). | **YES** | None | Replace card with "Call Dispatcher & Queue Engine". |
| 13 | `googleScraper`, `facebookScraper` | `frontend/src/components/admin/sections/AdminUsers.tsx` | Admin user creation and edit module checkboxes (lines 36, 38). | **YES** | None | Remove from `MODULES` array. |
| 14 | `Google & Facebook Scrapers` | `frontend/src/components/admin/sections/AdminCommercial.tsx` | Feature checklist in plan catalog display (line 188). | **YES** | Marketing text | Replace copy with "Email Manager & FB Auto Poster". |
| 15 | `Scraped Leads` & `Google Scraper` | `frontend/src/components/BillingPage.tsx` | Plan feature descriptions (lines 461, 465). | **YES** | Marketing text | Update copy to "Canonical Leads" and "CRM & OCTAL Dialer" / "CRM + Dialer + Email Manager + FB Poster". |
| 16 | `Google Scraper` | `frontend/src/components/DashboardOverview.tsx` | Quick action card button navigating to `scraper` (line 562). | **YES** | Nav | Replace with "CRM Workspace" quick action navigating to `crm`. |
| 17 | `test_access_hierarchy.cjs` | `backend/tests/test_access_hierarchy.cjs` | Integration tests verifying platform ceiling controls (lines 84, 96, 101, 105). | **N/A** | Test only | Verified that legacy mapping supports existing tests. |
| 18 | `014_access_entitlements_hierarchy.sql` | `backend/src/db/migrations/` | Historical migration that seeded initial module rows. | **NO (Keep)** | Historical Migration | Preserve untouched. Existing migrations must not be rewritten. |
| 19 | Scraper backend engine files | `backend/src/scraper/**`, `googleScraper.ts`, `facebookScraper.ts` | Scraper engines, Puppeteer scripts, CSV exporters. | **NO (Keep)** | Core Scraper Logic | Keep 100% untouched. Will form the backend engine for the separate Lead Generation product. |

---

## 3. Summary of Safety & Invariant Status

- **Scraper Engine Code Deleted?**: **NO** — All engines remain intact.
- **Legacy Scraper Data Deleted?**: **NO** — Tables, jobs, and historical data remain in database.
- **Dialer Telephony Touched?**: **NO** — `application_octal_dialer/**`, `LeadQueue`, `Keypad`, `sessionManager`, Asterisk/SIP remain completely frozen.
- **Facebook Auto Poster Touched?**: **NO** — `facebook_poster` / `facebookPoster` preserved in core Zestify.
- **Email Manager Touched?**: **NO** — `auto_emailer` / `autoEmailer` preserved in core Zestify.
- **CRM Touched?**: **NO** — CRM Phase 1 and Phase 2 implementations preserved in core Zestify.
- **Deployment Status**: **LOCAL ONLY** — Zero remote deployment.
