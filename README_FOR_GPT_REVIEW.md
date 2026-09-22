# ZESTIFY — FORENSIC AUDIT CODE REVIEW GUIDE FOR GPT

**Mission:** Complete Platform Authority / Customer Role / Tenant Isolation Code Audit  
**Target Repository:** Zestify / Octal Dialer Monorepo  
**Target Branch:** `feature/saas-structure-v2`  
**Test Status:** 92/92 Automated Tests Passing (100% Pass Rate)

---

## 1. Core Architectural Tenet Under Review

**THE PLATFORM OWNER / PLATFORM ADMIN MUST BE COMPLETELY SEPARATE FROM CUSTOMER COMPANIES.**

A **Platform Admin** (`platform_admin`, `master_admin`, `super_admin`) is **NOT**:
- A Company Owner (`admin`)
- A Team Lead (`team_lead`)
- A Member / Agent (`user` / `agent`)
- A tenant employee or customer workspace user
- A seat-consuming customer user
- A CRM record owner
- A lead assignee
- A campaign participant

### Separation of Concerns:
- **Platform Admin**: Governs customer companies from the Platform Console (`/admin/platform/*`, `/admin/workspaces/*`, `/api/super-admin/*`). Sets company module ceilings, seat limits, suspends/reactivates workspaces, and performs audited support impersonations. Platform Admins exist outside all customer organizations (`tenantId = NULL`).
- **Company Owner (`admin`)**: Controls people inside their own company. Provisions team leads and agents, assigns team memberships, imports leads, and assigns modules **strictly within the seat and module ceilings set by the Platform Admin**. Company Owners cannot elevate anyone to platform roles, modify platform admins, bypass seat quotas, or access other customer workspaces.

---

## 2. Key Files to Inspect in this ZIP

### Core Backend Enforcement Files:
1. **`website_octal_dialer/backend/src/db/migrations/018_platform_authority_isolation.sql`**
   - Forward-only migration detaching all platform administrators (`tenantId = NULL`), purging platform roles from `team_members`, and clearing accidental lead/task assignments.
2. **`website_octal_dialer/backend/src/authManager.ts`**
   - Canonical role functions: `isPlatformRole()`, `isPlatformAdmin()`, `isCompanyOwner()`, `isTeamLead()`, `isTenantMember()`, `SQL_EXCLUDE_PLATFORM_ROLES`.
   - `ensureDefaultAdmin()` provisions platform admin with `tenantId: null` and auto-cleanses legacy records.
   - `login()` and `validateToken()` support detached platform admins while strictly enforcing tenant scoping for customer users.
   - `updateUserRole()` blocks touching platform owners and limits customer owners to `team_lead` or `user`.
   - `getTenantId()` supports platform workspace inspection while preventing customer tenant spoofing.
3. **`website_octal_dialer/backend/src/databaseManager.ts`**
   - `getTenantSeatUsage()`, `getTenantDetail()`, `getWorkspaceOverviewStats()`: use `SQL_EXCLUDE_PLATFORM_ROLES` so platform roles NEVER consume customer seats.
   - `assertTenantRecords()`: blocks platform roles from being added to customer teams.
   - `canDispositionLead()`: blocks former callers from modifying or dispositioning a lead reassigned to another agent (`if (lead.assignedTo && lead.assignedTo !== userId) return false;`).
   - `getTenantModuleEntitlements()`: searches `ALL_CANONICAL_MODULES` so scraper module aliases (`google_scraper`, `facebook_scraper`) properly reflect platform ceilings.
4. **`website_octal_dialer/backend/src/server.ts`**
   - `GET /api/admin/users`: strictly excludes platform roles from customer user directories.
   - `POST /api/admin/users`: rejects creating platform accounts (`403 Forbidden`) and enforces seat quotas.
   - `PUT /api/admin/users/:id`, `POST /api/admin/users/:id/password`, `DELETE /api/admin/users/:id`: reject mutating, promoting to, resetting password of, or deleting platform admins (`403 Forbidden`).
   - `PATCH /api/leads/:id`: rejects assigning customer leads to platform admins (`400 Bad Request`).
   - `POST /api/crm/tasks` & `PUT /api/crm/tasks/:id`: rejects assigning customer tasks to platform admins (`400 Bad Request`).

### Frontend Role Normalization:
5. **`website_octal_dialer/frontend/src/utils/roleUtils.ts`**
   - `isCompanyOwner(role)`: returns `true` strictly for `'admin'`.
   - `isPlatformOrCompanyOwner(role)`: exported for administrative oversight contexts.

### Automated Test Suites:
6. **`website_octal_dialer/backend/tests/test_platform_authority_isolation.cjs`**
   - 11 end-to-end regression tests verifying all isolation guarantees against running PostgreSQL and server.
7. **`website_octal_dialer/backend/tests/test_access_hierarchy.cjs`**
   - 12 tests verifying entitlement ceilings and escalation blocking.
8. **`website_octal_dialer/backend/tests/test_saas_structure_v2.cjs`**
   - 45 tests verifying role transition matrix, multi-team peer visibility, lead scoping, and real PostgreSQL 18.4 migration chain.
9. **`website_octal_dialer/backend/tests/security_regressions.cjs`**
   - 24 tests verifying session pairing, Google auth security, advisory locks, and path traversal protection.

### Comprehensive Audit Reports:
10. **`PLATFORM_CUSTOMER_AUTHORITY_FINAL_AUDIT.md`** — Complete forensic audit report.
11. **`GPT_CODE_REVIEW_MANIFEST.md`** — Detailed review manifest with diff explanations.

---

## 3. How to Run the Test Suites

From `website_octal_dialer/backend`:
```bash
# Platform authority & customer tenant isolation suite (11/11 PASS)
node tests/test_platform_authority_isolation.cjs

# Access entitlement hierarchy suite (12/12 PASS)
node tests/test_access_hierarchy.cjs

# SaaS Structure V2 suite with real PostgreSQL 18.4 (45/45 PASS)
node tests/test_saas_structure_v2.cjs

# Security regressions suite (24/24 PASS)
npm run test:security
```

---

## 4. Frozen Code Confirmation

The following engines were verified to be **100% frozen and untouched**:
- Telephony & Call Flow (`sessionManager.ts`)
- GSM Safety Controller (`safetyController.ts`)
- LeadQueue State Machine (`LeadQueue.tsx`)
- Flutter Android Dialer (`application_octal_dialer/`)
- Lead Gen Z Scraper Engine (`lead-gen-z/`)
- Stripe Billing Engine
