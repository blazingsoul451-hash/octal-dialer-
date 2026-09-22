# GPT CODE REVIEW MANIFEST — ZESTIFY PLATFORM AUTHORITY & TENANT ISOLATION

**Repository:** Zestify / Octal Dialer Monorepo  
**Target Branch:** `feature/saas-structure-v2`  
**Review Target:** Complete separation of Platform Admin (`platform_admin`) from Customer Companies / Tenancies (`admin`, `team_lead`, `agent` / `user`).  
**Audit Status:** Code-Level Forensic Audit Complete & Verified (92/92 Automated Tests Passing).

---

## 1. Summary of Architectural Guarantee

In Zestify, **Platform Admin** and **Customer Tenants** belong to fundamentally distinct planes:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   PLATFORM PLANE (External Authority)                  │
│  Role: platform_admin, master_admin, super_admin                       │
│  tenantId: NULL (Detached from customer workspaces)                    │
│  Capabilities: Controls workspaces, sets module ceilings, adjusts     │
│                seat quotas, suspends tenants, support impersonation.  │
│  Restrictions: NOT a company owner, NOT a team member, does NOT        │
│                consume seats, CANNOT be assigned leads/tasks.          │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │ Sets ceilings & quotas
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                 CUSTOMER WORKSPACE PLANE (Tenant Scoped)               │
│  Roles:                                                                │
│    - admin (Company Owner): Controls people inside own tenant          │
│    - team_lead: Manages led teams and member pipelines                 │
│    - agent / user: Executes dialer campaigns & CRM workflows           │
│  tenantId: Valid UUID (Strictly scoped)                                │
│  Capabilities: Allocates roles (team_lead, agent) and modules strictly │
│                within ceilings set by Platform Admin.                  │
│  Restrictions: CANNOT access platform console, CANNOT create/edit     │
│                platform admins, CANNOT bypass seat quotas.             │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. File-by-File Review Manifest

### File 1: `website_octal_dialer/backend/src/db/migrations/018_platform_authority_isolation.sql` [NEW]
- **Purpose:** Forward-only migration to cleanse database state and structurally isolate platform admins.
- **Key Changes:**
  - Updates `users` table to set `tenantId = NULL` for all users with role in `('platform_admin', 'master_admin', 'super_admin')`.
  - Purges platform admins from `team_members`.
  - Sets `assignedTo = NULL` on any leads accidentally assigned to platform admins.
  - Sets `assignedUserId = NULL` on any CRM tasks accidentally assigned to platform admins.
- **Architectural Rationale:** Ensures platform accounts never reside inside customer workspaces at the data storage layer.

---

### File 2: `website_octal_dialer/backend/src/authManager.ts` [MODIFIED]
- **Key Changes:**
  1. Exported canonical role verification helpers:
     - `isPlatformRole(role: string): boolean`: checks `['platform_admin', 'master_admin', 'super_admin']`.
     - `isPlatformAdmin(user: any): boolean`: checks caller role using `isPlatformRole`.
     - `isCompanyOwner(userOrRole: any): boolean`: returns `true` strictly for `'admin'`.
     - `isTeamLead(userOrRole: any): boolean`: returns `true` for `'team_lead'`.
     - `isTenantMember(userOrRole: any): boolean`: returns `true` for `'agent'` or `'user'`.
     - `SQL_EXCLUDE_PLATFORM_ROLES`: standardized SQL filter `"LOWER(role) NOT IN ('platform_admin', 'master_admin', 'super_admin')"`.
  2. Updated `ensureDefaultAdmin()`:
     - Detaches existing platform admins (`tenantId = NULL`).
     - Provisions new default platform admin with `tenantId: NULL`.
  3. Updated `login()`:
     - Allows platform admins to log in with `tenantId: null`.
     - Strictly requires `tenantId` for all customer users.
  4. Updated `validateToken()`:
     - Bypasses tenant suspension checks for detached platform admins (`tenantId: null`).
     - Strictly enforces tenant suspension checks for customer users.
  5. Updated `updateUserRole()`:
     - Rejects any attempt to modify or demote platform admins.
     - Restricts customer owners to assigning `'team_lead'` or `'user'`.
  6. Updated `getTenantId(req)`:
     - Allows platform admins to target a workspace via `x-tenant-id` header or `?tenantId=` query param for inspection.
     - Strictly blocks customer users from targeting any workspace other than their own JWT `tenantId`.

---

### File 3: `website_octal_dialer/backend/src/databaseManager.ts` [MODIFIED]
- **Key Changes:**
  1. Updated `getTenantSeatUsage()`:
     - Query explicitly filters out all platform roles using `LOWER(role) NOT IN ('platform_admin', 'master_admin', 'super_admin')`.
     - Platform administrators never consume customer seats.
  2. Updated `assertTenantRecords()`:
     - When validating user IDs for customer team assignment, requires `LOWER(role) NOT IN ('platform_admin', 'master_admin', 'super_admin')`.
     - Platform administrators can never be added to customer teams.
  3. Hardened `canDispositionLead()`:
     - Added authoritative guard: `if (lead.assignedTo && lead.assignedTo !== userId) return false;`.
     - Prevents former callers from modifying or dispositioning a lead that has been reassigned to another agent.
  4. Fixed `getTenantModuleEntitlements()`:
     - Uses `ALL_CANONICAL_MODULES.find(m => m.id === canonical)` rather than `CANONICAL_MODULES.find(...)` so scraper module aliases (`google_scraper`, `facebook_scraper`) properly reflect platform entitlement ceilings.
  5. Updated `getGlobalCustomerUsers()`, `getPlatformObservabilityMetrics()`, `getTenantAccessMatrix()`, `getWorkspaceOverviewStats()`, and `getTenantDetail()` to exclude all platform roles from customer counts.

---

### File 4: `website_octal_dialer/backend/src/server.ts` [MODIFIED]
- **Key Changes:**
  1. Imported canonical role helpers from `./authManager`.
  2. Updated `/auth/verify`: Platform Admins are never flagged with `needsOnboarding = true`.
  3. Updated `GET /api/admin/users`: strictly filters `LOWER(role) NOT IN ('platform_admin', 'master_admin', 'super_admin')`. Platform admins never appear in customer user directories.
  4. Updated `POST /api/admin/users`:
     - Rejects any attempt to create users with platform roles (`403 Forbidden`).
     - Enforces customer seat quota verification.
  5. Updated `PUT /api/admin/users/:id`:
     - Rejects modifying any user with a platform role (`403 Forbidden`).
     - Rejects promoting any customer user to a platform role (`403 Forbidden`).
  6. Updated `POST /api/admin/users/:id/password`:
     - Rejects resetting passwords for platform admins through customer API (`403 Forbidden`).
  7. Updated `DELETE /api/admin/users/:id`:
     - Rejects deleting platform admins through customer API (`403 Forbidden`).
  8. Updated `PATCH /api/leads/:id`:
     - Enforces that assigned users must belong to `tenantId` and CANNOT have a platform role. Returns `400 Bad Request`.
  9. Updated `POST /api/crm/tasks` and `PUT /api/crm/tasks/:id`:
     - Enforces that `assignedUserId` must belong to `tenantId` and CANNOT have a platform role. Returns `400 Bad Request`.
  10. Updated `PUT /api/super-admin/tenants/:id/seats`:
     - Excludes all platform roles when computing active seat usage.

---

### File 5: `website_octal_dialer/frontend/src/utils/roleUtils.ts` [MODIFIED]
- **Key Changes:**
  - `isCompanyOwner(role)` now returns `true` strictly for `'admin'`.
  - Added and exported `isPlatformOrCompanyOwner(role)` for administrative oversight contexts.
  - Prevents customer-level UI views from misidentifying Platform Admins as customer owners.

---

### File 6: `website_octal_dialer/backend/tests/test_platform_authority_isolation.cjs` [NEW]
- **Key Changes:**
  - Automated end-to-end regression suite covering all 11 core isolation rules.
  - Verifies:
    1. Platform Admin authenticates with `tenantId: null`.
    2. Customer tenant provisions with isolated Company Owner.
    3. Company Owner authenticates with proper `tenantId`.
    4. Platform Admin does NOT consume customer seats (seat count = 1 for owner).
    5. Customer user directory strictly excludes Platform Admin.
    6. Customer Owner cannot create `platform_admin`.
    7. Customer Owner cannot modify, reset password, or delete Platform Admin.
    8. Customer Owner cannot promote agent to `platform_admin`.
    9. Platform Admin cannot be assigned to customer leads.
    10. Platform Admin cannot be assigned to customer CRM tasks.
    11. Historical call disposition fallback safely blocks former callers from modifying reassigned leads.

---

### File 7: `website_octal_dialer/backend/tests/security_regressions.cjs` [MODIFIED]
- **Key Changes:**
  - Updated module loading mock to provide `./db/pool` and `./authManager` when loading `databaseManager.ts`.
  - All 24 security regression tests passing.

---

### File 8: `website_octal_dialer/backend/tests/test_saas_structure_v2.cjs` [MODIFIED]
- **Key Changes:**
  - Updated mock dependencies and code assertion patterns to support canonical role helpers.
  - All 45 SaaS Structure V2 tests passing (including real PostgreSQL 18.4 migration chain 012 -> 013 verification).

---

## 3. Verification Commands & Test Results

```bash
# 1. Platform Authority & Tenant Isolation Regression Suite
node tests/test_platform_authority_isolation.cjs
# Result: 11/11 tests PASS (100%)

# 2. Access Entitlement Hierarchy Regression Suite
node tests/test_access_hierarchy.cjs
# Result: 12/12 tests PASS (100%)

# 3. SaaS Structure V2 Suite (including Real PostgreSQL 18.4)
node tests/test_saas_structure_v2.cjs
# Result: 45/45 tests PASS (100%)

# 4. Security Regressions Suite
npm run test:security
# Result: 24/24 tests PASS (100%)

# 5. Full Backend & Frontend Compilations
npm run build (backend)   # Exit code 0
npm run build (frontend)  # Exit code 0
```

---

## 4. Frozen Code Confirmation

The following systems were audited and left completely untouched:
- `website_octal_dialer/backend/src/sessionManager.ts` (Call session state machine)
- `website_octal_dialer/backend/src/safetyController.ts` (GSM dialer safety controller)
- `website_octal_dialer/frontend/src/components/LeadQueue.tsx` (Single auto-dial state machine)
- `website_octal_dialer/frontend/src/components/ActiveCallModal.tsx` (Live call UI)
- `application_octal_dialer/` (Flutter Android dialer app)
- `lead-gen-z/` (Lead Gen Z scraper engine)
- Stripe billing engine
