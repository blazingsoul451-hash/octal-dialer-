# OCTAL / ZESTIFY — CRM IMPLEMENTATION PLAN (PHASE 1)

This implementation plan defines the architectural design, database schema, backend API endpoints, and frontend components to build **Phase 1 of the Core CRM** inside Zestify, honoring the behavioral workflows discovered in the reference audit (`OCTAL_CRM_AUDIT/`) while maintaining Zestify's obsidian/gold design system and strict 4-layer authorization hierarchy.

---

## User Review Required

> [!IMPORTANT]
> **Canonical Lead System Preservation**:
> We are **NOT** creating a duplicate lead database. The existing `leads` table connects directly to the Dialer, Scrapers, and Campaigns. We are adding non-breaking additive fields (`crmCompanyId`, `contactId`, `requirement`, `country`) to bind leads directly into the new CRM Company and Contact hierarchy.

> [!IMPORTANT]
> **Customer Tenant vs. CRM Client Company**:
> * `tenants`: The customer subscribing to our SaaS platform (e.g. `ABC Sales Ltd`).
> * `crm_companies`: External client/account companies managed *by* that tenant (e.g. `Tesla`, `Bright Tax`, `Local Shop Ltd`).
> All CRM tables are strictly tenant-scoped (`tenantId NOT NULL`).

> [!NOTE]
> **Zero Telephony Engine Disruption**:
> `application_octal_dialer/**`, `LeadQueue.tsx`, `Keypad`, `sessionManager`, Telecom routing, call outcomes, Scrapers, and Stripe execution remain completely frozen and untouched.

---

## Proposed Changes

### 1. Database Layer (Additive Schema & In-Memory Mock)

#### [NEW] [007_crm_core_schema.sql](file:///C:/Users/ice/Desktop/OCTAL_DIALER_PROJECT/website_octal_dialer/backend/src/db/migrations/007_crm_core_schema.sql)
#### [MODIFY] [schema.sql](file:///C:/Users/ice/Desktop/OCTAL_DIALER_PROJECT/website_octal_dialer/backend/src/db/schema.sql)
#### [MODIFY] [databaseManager.ts](file:///C:/Users/ice/Desktop/OCTAL_DIALER_PROJECT/website_octal_dialer/backend/src/databaseManager.ts)
#### [MODIFY] [pool.ts](file:///C:/Users/ice/Desktop/OCTAL_DIALER_PROJECT/website_octal_dialer/backend/src/db/pool.ts)

* **`crm_companies` Table**:
  * `id TEXT PRIMARY KEY`
  * `tenantId TEXT NOT NULL`
  * `name TEXT NOT NULL`
  * `industry TEXT`
  * `country TEXT`
  * `phone TEXT`
  * `email TEXT`
  * `website TEXT`
  * `address TEXT`
  * `status TEXT NOT NULL DEFAULT 'Active'` (`Active`, `Inactive`)
  * `paymentStatus TEXT NOT NULL DEFAULT 'Trial'` (`Trial`, `Paid`, `Invoice`, `Leaver`, `Licence Shifted`)
  * `assignedUserId TEXT`
  * `assignedTeamId TEXT`
  * `metadata TEXT`
  * `createdAt TEXT NOT NULL`
  * `updatedAt TEXT NOT NULL`
* **`crm_contacts` Table**:
  * `id TEXT PRIMARY KEY`
  * `tenantId TEXT NOT NULL`
  * `crmCompanyId TEXT` (Foreign link to `crm_companies.id`)
  * `name TEXT NOT NULL`
  * `email TEXT`
  * `phone TEXT`
  * `roleTitle TEXT`
  * `notes TEXT`
  * `assignedUserId TEXT`
  * `createdAt TEXT NOT NULL`
  * `updatedAt TEXT NOT NULL`
* **Additive Columns on `leads`**:
  * `crmCompanyId TEXT`
  * `contactId TEXT`
  * `requirement TEXT`
  * `country TEXT`
* **`crm_tasks` Table**:
  * `id TEXT PRIMARY KEY`
  * `tenantId TEXT NOT NULL`
  * `title TEXT NOT NULL`
  * `description TEXT`
  * `taskType TEXT NOT NULL DEFAULT 'call'` (`call`, `email`, `online_meeting`, `meeting`, `sms`, `whatsapp`, `payment`, `follow_up`, `general`)
  * `status TEXT NOT NULL DEFAULT 'open'` (`open`, `completed`, `rescheduled`, `cancelled`)
  * `priority TEXT NOT NULL DEFAULT 'medium'` (`low`, `medium`, `high`, `urgent`)
  * `dueAt TEXT NOT NULL`
  * `completedAt TEXT`
  * `crmCompanyId TEXT`
  * `contactId TEXT`
  * `leadId TEXT`
  * `assignedUserId TEXT`
  * `assignedTeamId TEXT`
  * `outcome TEXT`
  * `outcomeRemarks TEXT`
  * `cancellationReason TEXT`
  * `createdByUserId TEXT NOT NULL`
  * `createdAt TEXT NOT NULL`
  * `updatedAt TEXT NOT NULL`
* **`crm_notes` Table**:
  * `id TEXT PRIMARY KEY`
  * `tenantId TEXT NOT NULL`
  * `entityType TEXT NOT NULL` (`lead`, `contact`, `crm_company`, `task`)
  * `entityId TEXT NOT NULL`
  * `category TEXT NOT NULL DEFAULT 'general'` (`general`, `sales`, `support`, `meeting`, `call`, `billing`, `follow_up`)
  * `body TEXT NOT NULL`
  * `createdByUserId TEXT NOT NULL`
  * `createdByName TEXT NOT NULL DEFAULT ''`
  * `createdAt TEXT NOT NULL`

---

### 2. Backend API Services & Endpoints

#### [MODIFY] [server.ts](file:///C:/Users/ice/Desktop/OCTAL_DIALER_PROJECT/website_octal_dialer/backend/src/server.ts)

* **CRM Overview & Date Range Filtering**:
  * `GET /api/crm/overview`: Supports `?range=today|yesterday|7d|30d|this_month|last_month|custom&startDate=...&endDate=...`. Returns aggregated counters for Companies, Meetings, Overdue Tasks, Total Leads, Open Follow-Ups, and Today's Priority Callbacks with strict role scoping.
* **CRM Companies CRUD**:
  * `GET /api/crm/companies`: Filter by `status`, `paymentStatus`, `country`, `assignedUserId`, `search`.
  * `POST /api/crm/companies`: Create new client company.
  * `GET /api/crm/companies/:id`: Full company profile including linked contacts, leads, tasks, and notes timeline.
  * `PUT /api/crm/companies/:id`: Update company metadata.
  * `DELETE /api/crm/companies/:id`: Soft delete or archive company.
* **CRM Contacts CRUD**:
  * `GET /api/crm/contacts`: Filter by `crmCompanyId`, `search`, `assignedUserId`.
  * `POST /api/crm/contacts`: Create new contact linked to optional company.
  * `PUT /api/crm/contacts/:id`: Update contact.
  * `DELETE /api/crm/contacts/:id`: Delete contact.
* **Canonical Leads Enrichment**:
  * `GET /api/crm/leads`: Enriched leads list returning linked company and contact metadata.
  * `POST /api/crm/leads`: Add new canonical lead directly from CRM with company, contact, and requirement linking.
  * `GET /api/crm/leads/:id/profile`: Enhanced to return company, contact, tasks, call history, and unified activity timeline.
* **CRM Tasks & Lifecycle Workflows**:
  * `GET /api/crm/tasks`: Filter by `status`, `taskType`, `assignedUserId`, `dueRange`, `search`.
  * `POST /api/crm/tasks`: Create new CRM task with type, priority, due date, entity link, and assignment.
  * `POST /api/crm/tasks/:id/close`: Reference **Close Task** workflow — records outcome, outcome remarks, updates status to `completed`, optionally creates a chained follow-up task with reassignment, and writes to activity timeline.
  * `POST /api/crm/tasks/:id/reschedule`: Reference **Reschedule Meeting** workflow — updates `dueAt`, `taskType`, `assignedUserId`, remarks, and records rescheduling audit event.
  * `POST /api/crm/tasks/:id/cancel`: Reference **Cancel Meeting** workflow — requires cancellation reason, marks status `cancelled`, and writes to activity timeline.
* **Cross-Entity Notes & Unified Timeline**:
  * `GET /api/crm/notes`: Fetch notes for entity (`entityType` + `entityId`).
  * `POST /api/crm/notes`: Add note to any entity.
  * `GET /api/crm/timeline`: Unified activity feed aggregating `lead_activities`, `crm_notes`, `call_logs`, and task lifecycle events.

---

### 3. Frontend Components & UI

#### [MODIFY] [CRMWorkspacePage.tsx](file:///C:/Users/ice/Desktop/OCTAL_DIALER_PROJECT/website_octal_dialer/frontend/src/components/crm/CRMWorkspacePage.tsx)
#### [NEW] [CompanyProfileDrawer.tsx](file:///C:/Users/ice/Desktop/OCTAL_DIALER_PROJECT/website_octal_dialer/frontend/src/components/crm/CompanyProfileDrawer.tsx)
#### [MODIFY] [LeadProfileDrawer.tsx](file:///C:/Users/ice/Desktop/OCTAL_DIALER_PROJECT/website_octal_dialer/frontend/src/components/crm/LeadProfileDrawer.tsx)
#### [NEW] [CRMModals.tsx](file:///C:/Users/ice/Desktop/OCTAL_DIALER_PROJECT/website_octal_dialer/frontend/src/components/crm/CRMModals.tsx)
#### [NEW] [CRMActivityTimeline.tsx](file:///C:/Users/ice/Desktop/OCTAL_DIALER_PROJECT/website_octal_dialer/frontend/src/components/crm/CRMActivityTimeline.tsx)

* **`CRMWorkspacePage.tsx` Structure**:
  * **Header**: Workspace title, last sync time, refresh button, quick action buttons (`+ Add Lead`, `+ Add Company`, `+ Create Task`).
  * **Sub-Navigation Tabs**:
    1. `Overview`: Date Range Selector buttons (Today, Yesterday, Last 7 Days, Last 30 Days, This Month), KPI Cards (Companies, Meetings, Overdue Tasks, Active Leads), Priority Callbacks widget, Recent Activity feed.
    2. `Companies`: Searchable companies data table with Status filters (`Active`, `Inactive`, `All`), Payment Status filter, Country filter, and click-to-open `CompanyProfileDrawer`.
    3. `Contacts`: Searchable directory table with Name, Email, Phone, Company, Assigned To, and "Add Contact" modal.
    4. `Leads`: Canonical leads list with status pipeline (`All`, `Open`, `Closed`), assignment filter, and click-to-open `LeadProfileDrawer`.
    5. `Tasks`: Tasks data table with task type icons/badges (Call, Email, Meeting, WhatsApp, Payment, Follow-up), Priority badges, Status badges, and quick row action buttons for Close Task, Reschedule, and Cancel.
* **Modals & Drawers (`CRMModals.tsx`, `CompanyProfileDrawer.tsx`, `LeadProfileDrawer.tsx`)**:
  * **`CloseTaskModal`**: Outcome action selector, remarks textarea, optional next task creation with date and user assignment.
  * **`RescheduleTaskModal`**: New date/time picker, action type selector, user reassignment dropdown, remarks.
  * **`CancelTaskModal`**: Mandatory cancellation reason textarea and cancellation notes.
  * **`AddCompanyModal`**: Name, industry, country, phone, email, website, address, initial status.
  * **`AddContactModal`**: Name, email, phone, role title, company selector, notes.
  * **`AddLeadModal`**: Lead/company name, phone, email, address, source, campaign selector, initial requirement notes.
  * **`CompanyProfileDrawer`**: Company overview, linked contacts list, linked leads list, open tasks, and interactive notes timeline.
  * **`LeadProfileDrawer`**: Enriched central record showing Overview, Contact info, Linked Company, Tasks list, Call history, and Activity Timeline.

---

## Verification Plan

### Automated Tests
* Create automated test script `tests/test_crm_phase1.cjs`:
  1. Authenticate as Company Owner (`owner`):
     - Fetch CRM overview with date ranges (`today`, `7d`, `30d`).
     - Create a CRM Company (`Bright Tax Corp`).
     - Create a CRM Contact under that company (`John Doe`).
     - Create a Lead linked to that company & contact.
     - Create a Task linked to that lead/company (type: `online_meeting`).
     - Reschedule the task to tomorrow with remarks.
     - Close the task with outcome and verify chaining.
     - Create another task and Cancel it with reason.
     - Add cross-entity notes and verify unified timeline.
  2. Authenticate as Team Lead (`teamlead`):
     - Verify team-scoped visibility on companies, contacts, and tasks.
  3. Authenticate as Member / Agent (`agent1`):
     - Verify agent-scoped visibility (can only see assigned leads/tasks).
  4. Tenant Isolation Check:
     - Verify a user from another tenant cannot query or mutate records from `tenant_default`.
  5. Dialer Regression Check:
     - Verify `leads` table and dialer queue queries continue functioning seamlessly.

### Manual Verification
* Run dev server and inspect in browser:
  - Verify CRM subtabs render without layout breaks or console errors in Obsidian Dark theme.
  - Verify modals open and close cleanly with backdrop blur and escape key handling.
  - Verify dialing a lead directly from CRM redirects to Dialer keypad with preloaded numbers.
