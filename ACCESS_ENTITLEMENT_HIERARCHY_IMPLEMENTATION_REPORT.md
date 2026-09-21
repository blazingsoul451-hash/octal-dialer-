# OCTAL / ZESTIFY — ACCESS CONTROL UI & ENTITLEMENT HIERARCHY REPAIR REPORT

**Date**: 2026-09-21  
**Repository**: `OCTAL_DIALER_PROJECT`  
**Branch**: `feature/saas-structure-v2`  
**Scope**: Access Control UI, Entitlement Ceiling Enforcement, and Privilege Isolation  

---

## 1. Executive Summary

We have completed the architectural overhaul and user interface repair for **Access Control & Entitlement Hierarchy** across the OCTAL / Zestify SaaS platform.

Previously, module access was treated as a flat collection of checkboxes at the individual user level, allowing user-level settings to bypass platform tier contracts and directly grant capabilities to company owners and agents regardless of subscription licensing.

This repair establishes an authoritative, inherited governance model:
$$\text{Effective Access} = \text{Platform Entitlements Ceiling} \cap \text{Company Enabled Modules} \cap \text{Team Scope Restrictions} \cap \text{User Assignment}$$

### Key Guarantees Enforced:
1. **Platform Owner Authority**: Platform administrators dynamically define the maximum module ceiling for each customer tenant organization (`tenant_module_entitlements`).
2. **Company Owner Account Protection**: The Company Owner (`admin` / root account) displays company-enabled modules as read-only with zero editable checkboxes (*"Managed by Zestify Platform"*). Owner accounts cannot be downgraded, stripped of modules, or demoted through self-service APIs.
3. **Subordinate Tier Restriction**: Lower layers (Teams, Members, Agents) can only restrict access granted from above. No lower tier can grant any module that the parent layer does not allow.
4. **Escalation Blocking (403 Forbidden)**: Any direct API attempt to enable a module outside the company's platform ceiling is blocked with `403 Forbidden` and audited.
5. **Clear UI Inheritance Breakdown**:
   - **Users & Roles View**: Member Edit modal displays explicit sections (Account Profile, Organization & Role, Module Access with Company Ceiling banner, lock badges on unentitled modules, and live Effective Access indicators).
   - **Users Table**: Displays `Assigned: X / Y Available` (e.g. `3 / 7 modules`) instead of misleading flat counts.
   - **User Detail Drawer**: Renders the complete 4-stage inheritance table (Module $\rightarrow$ Company Ceiling $\rightarrow$ User Assignment $\rightarrow$ Effective Access).
   - **SuperAdmin Portal**: Tenant drawer features live **Platform Entitlement Ceiling** toggles for all 9 canonical modules and a live **Access Matrix Modal** inspecting organizational permissions.
6. **Platform Admin Isolation**: Platform admins (`platform_admin`, `master_admin`) are strictly excluded from customer user lists, organization counts, and customer audit trails.
7. **Module Internals Frozen**: Telephony, Flutter/Android, GSM call state machines, LeadQueue, and scraper engines remain 100% frozen.

---

## 2. Canonical Module Catalog

All module keys across legacy camelCase and modern snake_case schemas are canonicalized through `normalizeModuleKey()`:

| Canonical Key | Label | Alias Keys Handled | Description |
|---|---|---|---|
| `crm` | CRM Workspace | `crm` | Contacts, customer intelligence, pipelines |
| `campaigns` | Campaigns | `campaigns` | Pipeline queues and dialing batches |
| `dialer` | OCTAL Dialer | `octalDialer` | GSM auto-dialer & telephony engine |
| `leads` | Leads Database | `leads` | Lead explorer and imports |
| `reports` | Reports & Analytics | `analytics` | Performance metrics & CSV call logs |
| `google_scraper` | Google Scraper | `googleScraper` | Google Maps B2B lead extractor |
| `auto_emailer` | Auto Emailer | `autoEmailer` | Cold email sequences & SMTP |
| `facebook_scraper` | Facebook Scraper | `facebookScraper` | Group member lead extractor |
| `facebook_poster` | FB Auto Poster | `facebookPoster` | Automated scheduled Facebook posters |

---

## 3. Database Schema & Migration

Added migration `backend/src/db/migrations/014_access_entitlements_hierarchy.sql` and incorporated into `backend/src/db/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS tenant_module_entitlements (
  id VARCHAR(64) PRIMARY KEY,
  "tenantId" VARCHAR(64) NOT NULL,
  "moduleKey" VARCHAR(64) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedBy" VARCHAR(64),
  CONSTRAINT uq_tenant_module UNIQUE ("tenantId", "moduleKey"),
  CONSTRAINT fk_entitlement_tenant FOREIGN KEY ("tenantId") REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tenant_module_entitlements ON tenant_module_entitlements("tenantId", "moduleKey");
```

---

## 4. Backend Endpoints & Enforcement

1. `GET /api/super-admin/tenants/:id/entitlements`: Returns authoritative tenant entitlement map.
2. `PUT /api/super-admin/tenants/:id/entitlements`: Updates company module ceiling and emits `platform:tenant-updated`.
3. `GET /api/super-admin/tenants/:id/access-matrix`: Returns live matrix of all tenant users with assigned vs effective modules.
4. `GET /api/company/entitlements`: Read-only endpoint for Company Owners to inspect their company's licensed ceiling.
5. `POST /api/admin/users`: Validates all assigned modules against the company entitlement ceiling. Rejects unentitled modules with `403 Forbidden`.
6. `PUT /api/admin/users/:id`: Prevents escalation attempts. Prevents editing Platform Admin accounts from customer context.
7. `POST /api/admin/permissions`: Blocks direct permission grants for modules not entitled in the company ceiling.
8. `GET /api/admin/users`: Excludes platform admins from customer view, and decorates users with `effectiveModules` and `companyCeiling`.

---

## 5. Verification & Test Results

All regression test suites completed with 100% success:

1. **`test_access_hierarchy.cjs`**: **12 / 12 PASS**
   - Platform admin login & tenant provisioning.
   - Baseline canonical entitlements inspection.
   - Lowering platform ceiling (disabling `auto_emailer` & `google_scraper`).
   - Blocking member escalation on user creation (`403 Forbidden`).
   - Creating legitimate member within platform ceiling.
   - Blocking member escalation on user update PUT (`403 Forbidden`).
   - Blocking member escalation on direct permission POST (`403 Forbidden`).
   - Platform admin exclusion from customer user list.
   - Access matrix verification for Platform Owner.
   - Dynamic platform ceiling elevation & subsequent permission granting.
2. **`test_platform_sync.cjs`**: **12 / 12 PASS**
3. **`test_saas_structure_v2.cjs`**: **45 / 45 PASS**
4. **`test:security`**: **24 / 24 PASS**
5. **Frontend Build (`tsc -b && vite build`)**: **Clean build, 0 errors**.
6. **Backend Build (`tsc`)**: **Clean build, 0 errors**.
