# ZESTIFY CURRENT CRM — UI & ARCHITECTURAL AUDIT NOTES (V2)

**Audit Date**: September 21, 2026  
**Auditor**: Antigravity Assistant  
**Target Application**: `http://localhost:5173` (Desktop Viewport: 1440 × 900)  
**State**: Reverted Stable CRM Baseline (Frozen — No Modifications)

---

## 1. Executive Summary & Layout Architecture

The Zestify CRM operates as a high-density, dark-themed command center integrated into the Octal Dialer platform. It is loaded under the primary top-level **CRM Workspace** navigation item.

### Visual Shell Structure
- **Global Header**: Shows the platform branding (`OCTAL DIALER / Zestify`), live connection status badges (Phone, Server, Agent), and user profile controls.
- **CRM Workspace Header**:
  - Title: `CRM & Customer Intelligence`
  - Subtitle: `Unified workspace for accounts, contacts, canonical leads, lifecycle tasks, client deliverables & custom quote generation.`
  - Badges: `Phase 2 Full` (amber outline), `ROLE: ADMIN` / `ROLE: OWNER` (role indicator).
  - Quick Search Bar: Global live debounce search across Companies, Contacts, and Leads with direct jump dropdown.
  - Action Controls: Quick-action creation buttons and theme toggles.
- **Horizontal Sub-Navigation Rail**:
  The CRM currently features **10 horizontal subtabs**:
  1. `CRM Overview`
  2. `Companies`
  3. `Contacts`
  4. `Canonical Leads`
  5. `Tasks`
  6. `Meetings`
  7. `Client Work`
  8. `Quotes` (labeled `Quotes & Pricing`)
  9. `Performance`
  10. `Activity` (labeled `Unified Activity`)

---

## 2. Visual / UX Review Findings

### 2.1 Navigation & Density
- **Crowded Navigation**: The sub-navigation rail currently contains 10 tabs. On viewports below 1440px (e.g., 1280px or 1366px laptops), the tab rail experiences horizontal scroll or text-wrapping. Adding an 11th un-grouped tab will worsen this issue.
- **Exposed Developer Terminology**:
  - **`Canonical Leads`**: Exposes backend data pipeline terminology. For end-users and sales reps, this should simply be labeled `Leads` or `Sales Leads`.
  - **`Phase 2 Full`**: Internal development milestone badge rendered adjacent to the main CRM heading.
  - **`ROLE: ADMIN`**: Hardcoded developer string displayed in the header badge rather than a dynamic role display component.
- **Terminology Inconsistencies**:
  - In subtab rail: tab is labeled `Canonical Leads`, but in table headers it is called `Lead Name / Business`.
  - Subtab is labeled `Client Work`, but internal status filter tabs use deliverable pipeline stages (`TODO`, `IN_PROGRESS`, `SHORTLISTED`, `COMPLETED`).

### 2.2 Profile Drawers vs Dedicated Pages
- **Company Profile**: Built as a fixed slide-over drawer (`CompanyProfileDrawer.tsx`). Contains tabs for `Overview`, `Contacts`, `Leads`, `Tasks`, and `Activity (Timeline)`. Company meetings and deliverables are managed through dedicated top-level subtabs.
- **Contact Profile**: Built as a fixed slide-over drawer (`ContactProfileDrawer.tsx`). Features direct softphone dialer, email composer, and subtabs for `Overview`, `Tasks & Meetings`, `Quotes`, and `Activity`.
- **Lead Profile**: Built as a comprehensive vertical slide-over drawer (`LeadProfileDrawer.tsx`). Contains direct dial triggers, bidirectional company/contact relational cards, task backlog, meeting schedule, quote proposals, notes timeline, and call history logs.

### 2.3 Modals & Interaction Flows
- **Meetings UI**:
  - Main view is a card grid.
  - Clicking "Edit" on a meeting card opens the generic `EditTaskModal` (as meetings are a subtype of tasks in the schema).
  - Clicking "Close / Notes" on a meeting card triggers `CloseTaskModal` rather than a dedicated Meeting Minutes or Outcome composer.
- **Task Lifecycle**:
  - Has explicit non-destructive modals: `CreateTaskModal`, `CloseTaskModal`, `RescheduleTaskModal`, `CancelTaskModal`.
- **Quotes & Pricing Rules**:
  - `QuoteBuilderModal` has an interactive price calculation engine (seat count, tier multiplier, add-ons, billing cycle).
  - Strict role discount ceilings are enforced (`076_pricing_ceiling_exceeded.png`).
  - `PricingRulesModal` allows the Company Owner to configure base seat rates and discount ceilings.

---

## 3. Role-Based Scoping Observations

| Feature Area | Company Owner (`01`) | Team Lead (`02`) | Sales Member (`03`) |
| :--- | :--- | :--- | :--- |
| **Data Scope** | Full organization-wide view (all accounts, leads, tasks, quotes) | Team-scoped accounts, leads, and deliverables | Strictly assigned records only |
| **Pricing Rules** | `Configure Base Pricing` button visible & editable | Read-only; cannot view or edit base pricing rules | Read-only; cannot view or edit base pricing rules |
| **Discount Ceiling** | Up to 100% | Enforced team ceiling (max 20%) | Enforced member ceiling (max 10%) |
| **Leaderboards** | Company-wide team leaderboard | Team-level performance breakdown | Personal performance metrics only |
| **Work Items** | Can assign any agent in company | Can assign direct reports | View assigned deliverables only |

---

## 4. DEALS / PIPELINE READINESS

### 4.1 Current Tab Structure Analysis
The current subtab structure is a flat 10-item rail:
`Overview` | `Companies` | `Contacts` | `Canonical Leads` | `Tasks` | `Meetings` | `Client Work` | `Quotes & Pricing` | `Performance` | `Unified Activity`

### 4.2 Where Deals Logically Fit
- **Pipeline Stage Location**: Deals represent qualified commercial opportunities. In the customer acquisition funnel, Deals naturally live **between Leads and Quotes**:
  `Leads` ➔ **`Deals / Sales Pipeline`** ➔ `Quotes` ➔ `Client Work (Post-Sale)`
- **Navigation Placement**:
  - Adding an 11th flat subtab will cause header tab wrapping on standard 1366px/1440px displays.
  - *Recommended Grouping*:
    1. **Accounts & Leads**: `Overview`, `Companies`, `Contacts`, `Leads`
    2. **Sales Engine**: **`Deals / Pipeline`**, `Quotes & Pricing`
    3. **Operations**: `Tasks`, `Meetings`, `Client Work`
    4. **Reporting**: `Performance`, `Unified Activity`

### 4.3 Existing Entity Relationships & Deal Readiness
1. **Quotes Already Function Like Partial Deals**:
   - The current Quote entity tracks: `quoteNumber`, `companyId`, `contactId`, `packageTier`, `seats`, `billingCycle`, `totalAmount`, and status (`DRAFT`, `SENT`, `ACCEPTED`, `REJECTED`).
   - Introducing a **Deal** entity will provide the parent sales opportunity container that tracks stage progression (`Discovery`, `Qualification`, `Proposal Sent`, `Negotiation`, `Won / Lost`), with Quotes attached as commercial proposals under the Deal.
2. **Screens Deals Should Connect To**:
   - **Company Drawer**: Add a `Deals` tab to show open deals for that company.
   - **Contact Drawer**: Add a `Deals` tab showing opportunities where this contact is the primary buyer.
   - **Lead Drawer**: Add a one-click action: `Convert Lead to Deal & Company`.
   - **Quotes Tab**: Add a `Deal` association selector in the Quote Builder modal.
   - **Client Work**: When a Deal moves to `Closed Won`, automatically offer to spawn a `Client Work` onboarding deliverable.
3. **Ideal Layout for Deals Page**:
   - **Dual-View Switcher**: Kanban Pipeline Board (drag-and-drop stages) + Table List View with filtering by owner, close date, and deal value.
