# OCTAL / ZESTIFY CRM — REFERENCE AUDIT GAP ANALYSIS

**Document Date**: September 21, 2026  
**Reference Source**: `OCTAL_CRM_AUDIT/` (Extracted from `octal_crm.zip`, 49 screenshots, `manifest.csv`, `navigation-map.md`, `workflow-notes.md`)  
**Target Application**: Zestify / Octal Dialer Platform  
**Design System**: Zestify Obsidian Dark / Gold Accent Theme  
**Authorization Model**: 4-Layer Inherited Scope (Platform Owner → Company Tenant → Team Lead → Member Agent)  

---

## 1. Executive Summary

A comprehensive visual and workflow inspection was conducted across all 11 modules and 52 actions from the previous Octal Accounts CRM reference audit. 

The reference CRM provided critical behavioral workflows:
1. **Multi-layer relationship model**: CRM Companies (Clients) → Contacts → Leads / Opportunities → Tasks / Follow-ups → Unified Activity History.
2. **Disciplined Task Lifecycle**: Distinct actions for **Close Task** (with outcome categorization and optional next-action creation), **Reschedule Meeting** (with date-time picker, action type, and agent reassignment), and **Cancel Meeting** (with mandatory cancellation reasoning).
3. **Information Architecture**: A unified workspace with date filtering, pipeline status switching, and rich detail views without page-reloading clutter.

### Key Architectural Distinctions:
* **Customer Tenants vs. CRM Client Companies**:
  * **Zestify Tenant**: A subscriber organization using our SaaS (e.g. `tenant_default`, `ABC Sales Ltd`).
  * **CRM Client Company (`crm_companies`)**: An external business/client being managed or prospected *by* that tenant (e.g., `Tesla`, `Bright Tax`, `Local Shop Ltd`).
* **Lead System Preservation**:
  * We **MUST NOT** create an isolated second lead database. The existing canonical `leads` table connects directly to the Dialer, Scrapers, and Campaigns. It will be seamlessly extended to link with `crm_companies` and `crm_contacts`.
* **Zero Engine Disruption**:
  * Telephony, Android APK, Dialer Keypad, `LeadQueue`, Scrapers, and Stripe execution remain completely intact.

---

## 2. Comprehensive Feature Gap Analysis Table

| Reference Feature | Current Zestify State | Status | Reuse Existing? | Backend Change? | Frontend Change? | Priority |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **CRM Dashboard & KPIs** | Basic counters (leads, follow-ups, campaigns). No date-range filter presets. | `PARTIAL` | **YES** — Extend `CRMWorkspacePage.tsx` | Yes — date-range query in `/api/crm/overview` | Yes — Date picker presets (Today, Yesterday, 7D, 30D, This Month) | **HIGH (Phase 1)** |
| **Companies / Clients Table** | Dynamically extracted string names from leads; no persistent company record or metadata. | `MISSING` | **NO** — Create `crm_companies` table | Yes — Table `crm_companies` + CRUD endpoints | Yes — Companies subtab, table, filters, Add/Edit modal | **HIGH (Phase 1)** |
| **Company Detail View** | No drawer or detail view for client companies. | `MISSING` | **NO** — Build new Company Drawer | Yes — `GET /api/crm/companies/:id` (with linked contacts, leads, tasks, notes) | Yes — Company detail drawer with tabs | **HIGH (Phase 1)** |
| **Contacts Directory** | Contacts only exist as raw phone/name records on leads. | `MISSING` | **NO** — Create `crm_contacts` table | Yes — Table `crm_contacts` + CRUD endpoints | Yes — Contacts subtab, live search, Add Contact modal | **HIGH (Phase 1)** |
| **Canonical Leads Integration** | Working `leads` table connected to campaigns and dialer. | `EXISTS` | **YES** — Strictly preserve canonical `leads` | Yes (Additive) — Add `crmCompanyId`, `contactId`, `requirement` to `leads` | Yes — Enhanced CRM Leads table & filters | **HIGH (Phase 1)** |
| **Lead Detail as Central Record** | Basic `LeadProfileDrawer` with simple notes and call logs. | `PARTIAL` | **YES** — Upgrade `LeadProfileDrawer` | Yes — Enrich `/api/crm/leads/:id/profile` with company, contact, tasks | Yes — Sections: Overview, Contact, Company, Activity, Tasks, Calls, Notes | **HIGH (Phase 1)** |
| **CRM Task Management** | Only simple `crm_follow_ups` for callback timestamps. | `MISSING` | **BRIDGE** — Create `crm_tasks` & bridge existing follow-ups | Yes — Table `crm_tasks` with task types, priorities, status | Yes — Tasks subtab, type filter, status filter, Create Task modal | **HIGH (Phase 1)** |
| **Task Close Workflow** | Status toggle only. No outcome remarks or next-action workflow. | `MISSING` | **NO** — Implement reference workflow | Yes — `POST /api/crm/tasks/:id/close` (outcome, remarks, nextTask) | Yes — Close Task modal with outcome remarks & optional next task | **HIGH (Phase 1)** |
| **Task Reschedule Workflow** | Date edit only. No action re-typing or audit trail. | `MISSING` | **NO** — Implement reference workflow | Yes — `POST /api/crm/tasks/:id/reschedule` | Yes — Reschedule Task modal with date/time, action type, user | **HIGH (Phase 1)** |
| **Task Cancel Workflow** | No cancellation reason capture. | `MISSING` | **NO** — Implement reference workflow | Yes — `POST /api/crm/tasks/:id/cancel` (reason, notes) | Yes — Cancel Task modal with required reason | **HIGH (Phase 1)** |
| **Unified Activity & Notes** | `lead_activities` only stores lead-specific logs; notes are embedded as event types. | `PARTIAL` | **YES** — Create `crm_notes` & unified timeline query | Yes — Table `crm_notes` (entityType, entityId, category, body) | Yes — Reusable Activity Timeline & Notes component across records | **HIGH (Phase 1)** |
| **Role & Scope Authorization** | Platform Owner / Company Owner / Lead / Agent permissions exist in system. | `EXISTS` | **YES** — Re-use `requireAuth` & team scoping checks | Yes — Enforce tenant isolation & team lead scoping on all CRM routes | Yes — Scoped views based on `userRole` | **HIGH (Phase 1)** |
| **Meetings Subview** | Meetings are treated as a task action type. | `PARTIAL` | **YES** — Filter `crm_tasks` by action type | Handled by `crm_tasks` in Phase 1; dedicated calendar endpoint in Phase 2 | Phase 1 via Tasks filter; Phase 2 dedicated Meetings tab | **MEDIUM (Phase 2)** |
| **Client Work Tracking** | None exists. | `MISSING` | **NO** — Requires `crm_work_items` table | Phase 2 table and endpoints | Phase 2 Client Work subtab | **LOW (Phase 2)** |
| **Staff Performance** | Telephony daily campaign stats exist; CRM agent task metrics missing. | `PARTIAL` | **YES** — Combine telephony with CRM tasks | Phase 2 aggregation endpoint | Phase 2 Performance tab | **LOW (Phase 2)** |
| **Global CRM Search** | Isolated table searches exist. | `PARTIAL` | **YES** — Consolidate search | Phase 2 multi-entity search endpoint | CRM-scoped search in Phase 1; global in Phase 2 | **MEDIUM (Phase 2)** |
| **Subscription Price Calculator** | SaaS billing handled via `BillingPage.tsx` & Stripe. | `PLATFORM-ONLY` | **YES** — Keep existing Zestify billing | No change | No change — Calculator is not a customer CRM feature | **NOT REQUIRED** |
| **Theme / RTL Configurator** | Zestify has polished dark theme and light/dark toggle. | `NOT REQUIRED` | **YES** — Keep existing Zestify theme | No change | No change — Do not clone old Bootstrap configurator | **NOT REQUIRED** |

---

## 3. Detailed Architectural Mapping

### 3.1 Domain Entity Relationships
```text
Zestify Tenant (SaaS Customer Organization)
  │
  ├── crm_companies (Client/Account/Prospect Businesses)
  │     ├── crm_contacts (Individual People at Client Companies)
  │     └── leads (Canonical Opportunities / Dialer Targets)
  │           │
  │           ├── crm_tasks (Calls, Meetings, WhatsApp, Follow-ups)
  │           ├── crm_notes (Categorized Interaction Notes)
  │           └── call_logs (Telephony History - Existing)
```

### 3.2 Tenant Isolation & Role Scope Guarantees
* **Every CRM query carries `tenantId = $req.user.tenantId`**.
* **Company Owner**: Full access across all companies, contacts, leads, and tasks within the tenant.
* **Team Lead**: Full access to records assigned to self or members of their led teams.
* **Member / Agent**: Scoped to records assigned directly to them (or shared in tenant pool when permitted).
* **Platform Owner**: Aggregated platform observability only. Tenant CRM inspection requires explicit Support Impersonation.

---

## 4. Phased Implementation Roadmap

### Phase 1: Core Release-Critical CRM (Immediate Scope)
1. **Database Additive Migrations**:
   - `crm_companies`
   - `crm_contacts`
   - `crm_tasks`
   - `crm_notes`
   - Additive foreign keys on `leads` (`crmCompanyId`, `contactId`, `requirement`)
2. **Backend API Routes**:
   - `/api/crm/overview` (KPIs + date filtering)
   - `/api/crm/companies` (CRUD + drawer profile)
   - `/api/crm/contacts` (CRUD + company linking)
   - `/api/crm/leads` (Canonical leads enriched with CRM relationships)
   - `/api/crm/tasks` (CRUD + Close / Reschedule / Cancel actions)
   - `/api/crm/notes` (Cross-entity notes)
   - `/api/crm/timeline` (Unified activity stream)
3. **Frontend UI Integration in `CRMWorkspacePage.tsx`**:
   - Subtabs:
     - `Overview`: Date-range selector, KPIs (Companies, Meetings, Overdue Tasks, Total Leads), Priority Callbacks.
     - `Companies`: Full company table, search, filters, "Add Company" modal, Company Detail Drawer.
     - `Contacts`: Contacts table, search, "Add Contact" modal, Contact Detail Drawer.
     - `Leads`: Canonical leads table with enriched company/contact badges and deep `LeadProfileDrawer`.
     - `Tasks`: Tasks list with action badges, filters, "Create Task" modal, Close Task modal, Reschedule modal, Cancel modal.
4. **Design System Adherence**:
   - 100% Zestify Obsidian Black (`#09090b`), gold/amber accents (`#f59e0b`), monospace metric badges, glass card borders (`#18181b`), and clean responsive layouts.

### Phase 2: Advanced Extensions (Post Phase 1)
1. Dedicated Meetings Calendar View.
2. Client Work Tracking (`crm_work_items`).
3. Agent Performance Dashboard.
4. Global cross-entity header search.
