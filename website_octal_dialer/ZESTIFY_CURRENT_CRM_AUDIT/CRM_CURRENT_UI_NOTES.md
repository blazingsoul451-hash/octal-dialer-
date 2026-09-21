# ZESTIFY CURRENT CRM — UI & ARCHITECTURAL AUDIT NOTES

**Audit Date**: September 21, 2026  
**Auditor**: Antigravity Assistant  
**Target Application**: `http://localhost:5173` (Desktop Viewport: 1440 × 900)  
**Context**: Visual, structural, and role-scoped baseline snapshot of the existing Zestify CRM to guide the upcoming Deals / Sales Pipeline integration.

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
  8. `Quotes`
  9. `Performance`
  10. `Activity`

---

## 2. Deep Dive by Functional Section

### 2.1 CRM Overview (`01_company_owner/001-004`)
- **Metric Cards (Top Grid)**:
  - Total Accounts (Active, Churned, At-Risk)
  - Contacts Indexed (Primary, Billing, Technical)
  - Canonical Leads (Enriched, Converted)
  - Open Action Items (Urgent, Due Today, Overdue)
  - Pipeline Deliverables (Active Client Work)
  - Total Won Revenue & Active Quotes (Live currency aggregation)
- **Time Window Filtering**:
  - Filter pills: `Today`, `30 Days`, `All Time`. Toggling filters immediately re-aggregates call counts, completed deliverables, won quote totals, and conversion rates.
- **Two-Column Operational Dashboard**:
  - Left column: Urgent Tasks & Scheduled Meetings feed with direct "Complete" / "Reschedule" action buttons.
  - Right column: High-Priority Client Work Items & Recent CRM Activity timeline.

### 2.2 Companies & Account Profiles (`04_company_profiles/006-013`)
- **Company Table View**:
  - Displays company name, domain, industry, account tier (Enterprise, Mid-Market, SMB), lifecycle status (Lead, Prospect, Customer, Churned), active contract value, and assigned account manager.
  - Action column provides an `Open ->` drawer button and `Edit` modal trigger.
- **Company Profile Slide-Over Drawer (`CompanyProfileDrawer.tsx`)**:
  - Fixed right-side slide-over panel (max-width `2xl` / 672px) with backdrop blur.
  - Header displays account name, status badge, payment health badge (`paid`, `overdue`, `pending_verification`), and a quick "New Task" button.
  - Internal Tabs:
    - **Overview**: Core corporate profile, tax IDs, website, billing address, account owner.
    - **Contacts**: List of affiliated executives and decision makers with direct one-click dial (`PhoneCall`) and email triggers.
    - **Leads**: Linked cold or inbound leads associated with this company account.
    - **Tasks**: Scoped tasks and meetings specific to this account with status pills and quick completion triggers.
    - **Activity (Timeline)**: Unified chronological notes and audit log with an inline note creation form (categorized by General, Call, Meeting, Requirement, Payment, Support).

### 2.3 Contacts & Contact Profiles (`05_contact_profiles/015-017`)
- **Contact Table View**:
  - Columns: Name, Affiliated Company (clickable badge), Email, Direct Phone, Role/Job Title, Assigned Agent, Actions.
  - Inline action: `Dial <phone>` directly initiates outbound softphone dialer sequence.
- **Contact Profile Slide-Over Drawer (`ContactProfileDrawer.tsx`)**:
  - Features a quick-action bar with direct phone dialer, email composer, new task trigger, and a **"Quote"** button that directly opens the Quote Builder pre-populated with this contact and their company.
  - Sub-Tabs:
    - **Overview**: Direct contact info, communication preferences, LinkedIn/social links.
    - **Tasks & Meetings**: Dedicated count of pending deliverables and meetings.
    - **Quotes**: Quotes generated for this specific stakeholder.
    - **Activity**: Historical notes and call logs.

### 2.4 Canonical Leads (`06_lead_profiles/019-025`)
- **Lead Repository Table**:
  - Displays leads ingested from dialer campaigns, manual entry, or API webhook integrations.
  - Status indicators: `New`, `Contacted`, `Qualified`, `Converted`, `Unqualified`.
- **Lead Profile Drawer (`LeadProfileDrawer.tsx`)**:
  - Full-featured vertical drawer.
  - Header: Lead business name, contact name, direct dial trigger.
  - Two-way relational linkage: badges link to associated Company and Contact profiles with forward and backward navigation.
  - Timeline includes call recording logs (duration, outcome: `ANSWERED`, `BUSY`, `NO_ANSWER`), scheduled follow-up dates, and quote requests.

### 2.5 Tasks & Meetings (`07_tasks_meetings/026-034`)
- **Tasks Subtab**:
  - Segmented into priority groups (Urgent, High, Medium, Low) and status tabs (All, Pending, Completed, Overdue, Cancelled).
  - Modals:
    - `CreateTaskModal`: Title, description, due date/time, priority, assigned agent, linked company, contact, or lead.
    - `CloseTaskModal`: Captures task completion notes and optional next-step follow-up.
    - `RescheduleTaskModal`: Date picker with reason for postponement.
    - `CancelTaskModal`: Cancellation reason audit capture.
- **Meetings Subtab**:
  - Card-based agenda layout and grid view.
  - Badges distinguish `Online Meeting` (video icon) from `In-Person` (calendar check icon).
  - Outcome modal records meeting minutes, attendees, and agreed deliverables.

### 2.6 Quotes & Pricing Rules (`08_quotes/039-042`)
- **Quotes Subtab**:
  - Columns: Quote Number (`QTE-XXXX`), Client Company / Contact, Package Tier & Seat Count, Billing Cycle (Monthly, Quarterly, Annual), Discount Percentage, Net Total, Status (`DRAFT`, `SENT`, `ACCEPTED`, `REJECTED`).
- **Quote Builder & Pricing Calculator (`QuoteBuilderModal.tsx`)**:
  - Real-time price calculation engine based on selected software tier (`Starter`, `Professional`, `Enterprise`), seat multiplier, telephony add-on modules, and billing cycle discounts.
- **Owner Pricing Rules (`PricingRulesModal.tsx`)**:
  - Exclusive to Company Owner / Admin.
  - Allows configuration of base seat rates, cycle discount minimums, and strict **Role Discount Ceilings** (e.g., Team Leads cannot exceed 20% discount; Sales Members cannot exceed 10%).
  - Error state `076_pricing_ceiling_exceeded.png` demonstrates strict enforcement if a user attempts to apply a discount exceeding their role threshold.

### 2.7 Client Work Deliverables (`09_client_work/035-038`)
- **Deliverables Tracker**:
  - Purpose: Tracks post-sale implementation, custom carrier integration, trunk verification, hardware provisioning, or SLA onboarding.
  - Pipeline Status Filters: `ALL`, `TODO`, `IN_PROGRESS`, `PENDING`, `SHORTLISTED`, `COMPLETED`, `REJECTED`.
  - Quick action status dropdowns allow moving deliverables across execution phases without opening modal.

### 2.8 Performance & Leaderboards (`10_performance/043-044`)
- **Metrics Dashboard**:
  - Aggregate metrics across calls dialed, answer rates, completed tasks, meetings conducted, deliverables closed, and total revenue won.
- **Agent Performance Breakdown Table**:
  - Displays leaderboard comparing team members on: Leads Assigned, Calls Made, Tasks Done, Meetings Held, Work Done, and Won Revenue generated.

### 2.9 Activity Feed (`11_activity/045`)
- Full audit log of all events across the organization: account creation, status changes, notes added, quotes sent, and task closures with timestamps and author identity.

---

## 3. Role-Based Scoping Observations (`02_team_lead` vs `03_member`)

| Feature Area | Company Owner (`01`) | Team Lead (`02`) | Sales Member (`03`) |
| :--- | :--- | :--- | :--- |
| **Data Scope** | Entire organization (all companies, leads, tasks) | Team-wide scoped items and direct reports | Strictly assigned accounts, leads, tasks |
| **Pricing Rules** | Can edit base rates & discount ceilings (`Configure Base Pricing` visible) | Read-only; cannot view or edit base pricing rules | Read-only; cannot view or edit base pricing rules |
| **Discount Ceiling** | Up to 100% | Enforced ceiling (e.g., max 20%) | Enforced ceiling (e.g., max 10%) |
| **Leaderboard View** | Company-wide team leaderboard | Team-level performance breakdown | Personal performance metrics only |
| **Work Deliverables** | Assign any agent across company | Assign agents within own team | View assigned deliverables only |

---

## 4. Architectural Analysis for Deals / Sales Pipeline Integration

### 4.1 Identified Strengths in Current Foundation
1. **Clean Relational Identifiers**: Companies, Contacts, and Canonical Leads have clean, consistent foreign key relationships across Tasks, Notes, and Quotes.
2. **Unified Slide-Over Drawer Pattern**: Users are already accustomed to clicking rows to inspect detailed drawers (`CompanyProfileDrawer`, `ContactProfileDrawer`, `LeadProfileDrawer`).
3. **Existing Commercial Primitives**: Quotes already compute total amounts, terms, products, and statuses (`DRAFT`, `SENT`, `ACCEPTED`, `REJECTED`). A Deal entity naturally bridges a Lead/Company to a Quote and subsequent Client Work.

### 4.2 UI/UX Bottlenecks & Clutter Warnings
1. **High Subtab Density**:
   - The horizontal navigation rail currently has **10 subtabs**.
   - On screens smaller than 1440px (e.g., laptops at 1280px or 1366px), 10 subtabs cause horizontal scroll or line-wrapping.
   - Simply adding an 11th tab (`Deals`) without reorganization will increase visual clutter.
   - *Recommendation*: Group subtabs into logical clusters or replace the flat rail with a structured sub-navigation (e.g., *Workspace* [Overview, Companies, Contacts, Leads], *Sales* [Deals / Pipeline, Quotes], *Execution* [Tasks, Meetings, Client Work], *Analytics* [Performance, Activity]).
2. **Internal Developer Jargon**:
   - The tab label `Canonical Leads` exposes internal architecture vocabulary to end-users. Should be simplified to `Leads` or `Sales Leads`.
   - The header displays `Phase 2 Full` and `ROLE: ADMIN` hardcoded chips that should be converted to production badge components.
3. **Where Deals Should Naturally Live**:
   - **Between Leads and Quotes**: Deals should represent qualified sales opportunities.
   - In **Company Profile Drawer** and **Contact Profile Drawer**, a `Deals` subtab should be added alongside `Tasks` and `Quotes`.
   - A Kanban Pipeline Board view (similar to the filterable state bar in `Client Work`) is the ideal UI representation for Deals (`Discovery` -> `Qualified` -> `Proposal / Quote Sent` -> `Negotiation` -> `Closed Won` / `Closed Lost`).
