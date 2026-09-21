# Zestify SaaS — Customer Signup, Onboarding & Workspace Lifecycle Report

**Project**: Zestify SaaS (OCTAL Dialer + CRM + Email Manager + Facebook Auto Poster)  
**Date**: September 22, 2026  
**Environment**: Local Development (`http://localhost:5173`, Backend: `http://127.0.0.1:5000`)  
**Status**: All Automated Lifecycle Tests Passing (8/8) | All 13 Visual Audit Screenshots Verified (100%)  

---

## 1. Executive Summary

This report documents the architectural separation, backend APIs, frontend wizards, database migrations, and end-to-end verification for **Zestify SaaS**:

1. **Strict Architectural Separation**:
   - **Identity**: Clean user authentication (Google OAuth & Email/Password) independent of tenant affiliation.
   - **Workspace / Tenant**: Multi-tenant isolation supporting `COMPANY` (multi-user, teams, seat-limited) and `PERSONAL` (solo) workspaces.
   - **Membership & Role**: Explicit role hierarchy (`super_admin` > Company Owner `admin` > `team_lead` > `user`) with non-elevated invitation token acceptance.
   - **Subscription & Entitlements**: Plan tiers (Starter, Pro, Enterprise) driving hard seat limits (`maxSeats`), team provisioning, and feature gating.

2. **Clean Authentication Flow**:
   - The initial public sign-in / sign-up screen contains **NO company name or workspace input**.
   - Public registration assigns a global identity and routes the user based on context:
     - **Existing Tenant Member**: Direct dashboard access.
     - **Pending Invitee**: One-click Invitation Acceptance Modal (auto-scoped to inviter's organization and assigned team).
     - **Brand New Customer**: 3-step Customer Onboarding Wizard (Company vs Just Me $\rightarrow$ Workspace Profile $\rightarrow$ Plan Selection $\rightarrow$ Tenant Provisioning as Owner).

3. **Enterprise Governance & Hard Enforcement**:
   - **Seat Capacity Hard Enforcement**: `activeSeats + pendingInvitations < maxSeats`. Blocks issuing invitations or accepting expired/re-allocated seats. Revoking pending invitations immediately releases seat quota.
   - **Final Owner Protection**: Prevents deletion or demotion of the last active Company Owner (`admin`), protecting workspaces from orphan states.
   - **Strict Core Product Boundary**: Workspaces are initialized strictly with CRM, OCTAL Dialer, Email Manager, and Facebook Auto Poster. Scraper modules are partitioned and excluded from new SaaS tenants.

---

## 2. Core Architecture: Four-Pillar Separation

```
+---------------------------------------------------------------------------------------+
| 1. IDENTITY LAYER                                                                     |
|    - Table: users                                                                     |
|    - Auth: Google OAuth / Email+Password (JWT Bearer tokens)                          |
|    - Independent of tenant; tracks 'needsOnboarding' flag                             |
+---------------------------------------------------------------------------------------+
                                           |
                                           v
+---------------------------------------------------------------------------------------+
| 2. TENANT / WORKSPACE LAYER                                                           |
|    - Table: tenants                                                                   |
|    - Types: 'COMPANY' (multi-seat, teams enabled) vs 'PERSONAL' (solo user)           |
|    - Capacity: maxSeats, activeSeats, pendingInvitations                              |
+---------------------------------------------------------------------------------------+
                                           |
                                           v
+---------------------------------------------------------------------------------------+
| 3. MEMBERSHIP & ROLE HIERARCHY                                                        |
|    - Table: users (role, tenantId), team_members (teamId, userId, roleInTeam)         |
|    - Table: workspace_invitations (email, role, teamId, token, status)                |
|    - Company Owner (admin) -> Team Lead (team_lead) -> Member (user)                  |
|    - Final Owner Protection: Cannot delete or demote final active owner               |
+---------------------------------------------------------------------------------------+
                                           |
                                           v
+---------------------------------------------------------------------------------------+
| 4. SUBSCRIPTION & PRODUCT BOUNDARY                                                    |
|    - Plans: Starter (5 seats), Pro (15 seats), Enterprise (50 seats)                   |
|    - Core SaaS Boundary: CRM + OCTAL Dialer + Email Manager + FB Auto Poster          |
|    - Excluded from New Workspaces: Scrapers (Google Maps, FB, Apollo, etc.)           |
+---------------------------------------------------------------------------------------+
```

---

## 3. Database Schema & Migrations

### Migration 017: Workspace Invitations Table
Path: `backend/src/db/migrations/017_workspace_invitations.sql`

```sql
CREATE TABLE IF NOT EXISTS workspace_invitations (
    id TEXT PRIMARY KEY,
    "tenantId" TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'team_lead', 'user')),
    "teamId" TEXT REFERENCES teams(id) ON DELETE SET NULL,
    "invitedBy" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED')),
    "expiresAt" TIMESTAMP NOT NULL,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workspace_invitations_tenant ON workspace_invitations("tenantId");
CREATE INDEX IF NOT EXISTS idx_workspace_invitations_email ON workspace_invitations(email);
CREATE INDEX IF NOT EXISTS idx_workspace_invitations_token ON workspace_invitations(token);
CREATE INDEX IF NOT EXISTS idx_workspace_invitations_status ON workspace_invitations(status);
```

### Team Members Table Schema
Path: `backend/src/db/schema.sql`
```sql
CREATE TABLE IF NOT EXISTS team_members (
    id TEXT PRIMARY KEY,
    "teamId" TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "tenantId" TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    "roleInTeam" TEXT NOT NULL DEFAULT 'member' CHECK ("roleInTeam" IN ('leader', 'member')),
    "joinedAt" TEXT NOT NULL,
    CONSTRAINT unique_user_per_team UNIQUE ("teamId", "userId")
);
```

---

## 4. REST API Endpoint Reference

| Method | Endpoint | Description | Security & Validation |
| :--- | :--- | :--- | :--- |
| `POST` | `/auth/register` | Public registration with email, password, name. | Checks for pending invite by email; sets `needsOnboarding: true` if uninvited. **No company name required.** |
| `POST` | `/api/onboarding/complete` | Provisions workspace, creates tenant record, assigns caller as Company Owner `admin`. | Requires valid JWT; updates user's `tenantId`, `role='admin'`, sets `needsOnboarding: false`. Issues elevated token. |
| `GET` | `/api/admin/invitations` | Lists invitations and returns dynamic `seatUsage` metrics. | Requires `admin` role. Returns `{ invitations, seatUsage: { maxSeats, activeSeats, pendingInvitations, availableSeats } }`. |
| `POST` | `/api/admin/invitations` | Generates team invitation; enforces seat capacity limit. | Hashes token (SHA-256) for DB storage, returns raw URL. Rejects with `400` if `activeSeats + pendingInvitations >= maxSeats`. |
| `DELETE` | `/api/admin/invitations/:id` | Revokes pending invitation. | Sets status to `REVOKED`; immediately releases seat quota. |
| `GET` | `/api/invitations/resolve` | Resolves invitation by raw token query or authenticated email. | Returns public invite details (`companyName`, `inviterName`, `role`, `teamName`, `status`). |
| `POST` | `/api/invitations/accept` | Accepts invitation, joins tenant, binds to team. | Validates expiration, verifies active seats available, assigns `team_lead` or `user` role (no self-elevation), inserts into `team_members` with `"joinedAt"`. |
| `DELETE` | `/api/admin/users/:id` | Deletes user from workspace. | **Final Owner Protection**: Queries count of active `admin`s in tenant; rejects deletion of the last owner with HTTP `400`. |
| `PUT` | `/api/admin/users/:id` | Updates user role. | **Final Owner Protection**: Prevents demoting the last `admin` if count == 1. |

---

## 5. Frontend Implementation Highlights

### 1. `LoginScreen.tsx` (Public Authentication)
- Clean, focused interface with Google OAuth at top and Email/Password fields.
- **Strictly zero company name fields** during registration.
- Subtitle dynamically guides the user: *"You'll set up your company or join your team in the next step."*

### 2. `CustomerOnboardingModal.tsx` (Customer Onboarding Wizard)
- **Step 1: Workspace Type**:
  - `For My Company`: Multi-user workspace with team collaboration, role hierarchy, and employee invitations.
  - `Just Me`: Solo personal workspace for independent dialer & CRM usage.
- **Step 2A: Company Workspace Setup**:
  - Company Name (required), Workspace Slug, Industry / Vertical selector.
- **Step 2B: Personal Workspace Setup**:
  - Workspace Name, Primary Use Case selector.
- **Step 3: Plan Selection**:
  - `Starter`: 5 Seats, Core CRM, Octal Dialer, Email Manager.
  - `Pro`: 15 Seats, Advanced Team Queues, Call Analytics.
  - `Enterprise`: 50 Seats, Dedicated Support, Unlimited Queues.
  - Transparent product boundary badge: *"Core Product: Zestify CRM, OCTAL Dialer, Email Manager, FB Auto Poster included."*
- Handles dynamic token swap: stores elevated token with active `tenantId` into `localStorage`.

### 3. `InvitationAcceptanceModal.tsx` (Employee Invitation Resolution)
- Renders upon login if user has a pending invitation.
- Presents invited company name, inviter's name, assigned role badge (`Team Lead` or `Team Member`), and assigned team.
- One-click accept joins the tenant without prompting for redundant company configuration.

### 4. `UsersAndRolesView.tsx` (Owner Team Governance)
- **Seat Capacity Banner**: Prominently shows seat usage meter (`Seats: 1 / 5 used (0 pending, 4 available)`).
- **Invitations Tab**: Displays pending invitations with role, recipient email, expiration date, and one-click `Revoke` button.
- **Invite User Modal**: Dropdowns for Role (`Team Lead` or `Member`) and Team selection with immediate validation against seat capacity.

---

## 6. End-to-End Automated Lifecycle Verification

Script: `website_octal_dialer/backend/tests/test_onboarding_lifecycle.cjs`  
Status: **100% PASSED (8/8 Stages)**

```
================================================================================
  ZESTIFY SAAS ONBOARDING & INVITATION LIFECYCLE E2E TEST
================================================================================

[STAGE 1] Testing Public Sign Up (No Company Name on First Auth)
  * Registering new user without company name: e2e_owner_1774377855018@zestify.io
  * Registration successful. User ID: d07925e0-b6f7-4144-8cb3-f54fb4a2ba43
  * PASS: Registration requires NO company name. needsOnboarding=true.

[STAGE 2] Testing Customer Onboarding Wizard (Company Provisioning)
  * Completing onboarding: Company='Zestify CRM Test Company', Plan='starter', maxSeats=5
  * Onboarding completed successfully.
  * Tenant ID: fd9a1491-fa7b-402b-a197-e83cb4dfd8f5
  * PASS: Tenant created, user elevated to Company Owner (admin), 5 seats allocated.

[STAGE 3] Testing Seat Capacity & Owner Deletion Rejection
  * Current seat usage: { maxSeats: 5, activeSeats: 1, pendingInvitations: 0, availableSeats: 4 }
  * Attempting to delete the ONLY company owner...
  * PASS: Successfully rejected deleting the final company owner (HTTP 400).

[STAGE 4] Provisioning Team within Workspace
  * Creating 'Inbound Sales Team A'...
  * Team created successfully. Team ID: 05886675-bb80-4cf8-a96c-dc68f9b93540

[STAGE 5] Testing Employee Invitations & Hard Seat Enforcement
  * Inviting Team Lead: e2e_lead_1774377855018@zestify.io (role: team_lead) -> OK
  * Inviting Member 1: e2e_mem1_1774377855018@zestify.io (role: user) -> OK
  * Inviting Member 2: e2e_mem2_1774377855018@zestify.io (role: user) -> OK
  * Inviting Member 3: e2e_mem3_1774377855018@zestify.io (role: user) -> OK
  * Seat usage check: active=1, pending=4, total=5 / max=5
  * Attempting 6th invitation (should be REJECTED)...
  * PASS: Hard seat enforcement blocked 6th invitation (HTTP 400).

[STAGE 6] Testing Team Lead Registration & Invitation Acceptance
  * Registering invitee: e2e_lead_1774377855018@zestify.io
  * Resolving invitation metadata...
  * Accepting invitation token...
  * Verifying Team Lead role and permissions: role=team_lead, teamId=05886675-bb80-4cf8-a96c-dc68f9b93540
  * PASS: Team lead accepted invitation and joined team without self-elevation.

[STAGE 7] Testing Team Member Registration & Invitation Acceptance
  * Registering invitee: e2e_mem1_1774377855018@zestify.io
  * Accepting invitation token...
  * Verifying Team Member role: role=user, teamId=05886675-bb80-4cf8-a96c-dc68f9b93540
  * PASS: Team member accepted invitation with user role.

[STAGE 8] Verifying Multi-Tier CRM Scoping & Visibility
  * Owner creates Lead 1 (assigned to Member 1)...
  * Team Lead creates Lead 2 (assigned to Team Lead)...
  * Verifying Owner visibility: 2 leads visible.
  * Verifying Team Lead visibility: 2 leads in Team A visible.
  * Verifying Team Member visibility: 1 assigned lead visible.
  * PASS: Multi-tier role scoping verified (admin > team_lead > user).

================================================================================
  ALL 8 LIFECYCLE STAGES PASSED SUCCESSFULLY!
================================================================================
```

---

## 7. Visual UI Audit Gallery (13 Verified Screenshots)

All audit screenshots were captured at **1440x900 resolution @ 2x Device Pixel Ratio** using automated browser instrumentation.

| # | Screenshot Filename | Viewport State & Verification Details |
| :-: | :--- | :--- |
| **01** | `01_signin.png` | Public sign-in view showing Google OAuth at top, email/password fields, and zero workspace fields. |
| **02** | `02_signup.png` | Public sign-up view with name, email, password; explicitly clean with no company name prompt. |
| **03** | `03_google_new_user_onboarding.png` | New user after authentication, immediately launching Step 1 of the Customer Onboarding Modal. |
| **04** | `04_workspace_type.png` | Step 1 selection showing "For My Company" vs "Just Me" with descriptive feature cards. |
| **05** | `05_company_setup.png` | Step 2A Company Workspace Setup: Company Name, Workspace Slug, and Industry vertical selection. |
| **06** | `06_personal_setup.png` | Step 2B Personal Workspace Setup: Solo workspace name and primary use case. |
| **07** | `07_plan_selection.png` | Step 3 Plan Selection: Starter (5 seats), Pro (15 seats), Enterprise (50 seats) with product boundary disclaimer. |
| **08** | `08_company_created.png` | Dashboard landing for the newly provisioned Company Owner with active tenant context. |
| **09** | `09_owner_users_roles.png` | Settings $\rightarrow$ Users & Roles displaying the live Seat Capacity Banner (`1 / 5 seats used`) and team table. |
| **10** | `10_invite_user.png` | Owner "Invite User" modal with email input, role selection (`team_lead` / `user`), and team picker. |
| **11** | `11_invitation_acceptance.png` | Invitee experience displaying the Invitation Acceptance Modal with company name, inviter, and role. |
| **12** | `12_teamlead_workspace.png` | Team Lead dashboard session showing team leads, campaigns, and team member queue management. |
| **13** | `13_member_workspace.png` | Team Member dashboard session showing personal queue, assigned leads, and Octal Dialer interface. |

### Audit Artifact Packages
- **Full Screenshot Directory**: `C:\Users\ice\Desktop\OCTAL_DIALER_PROJECT\website_octal_dialer\ZESTIFY_ONBOARDING_AUDIT`
- **Compressed Zip Archive**: `C:\Users\ice\Desktop\OCTAL_DIALER_PROJECT\website_octal_dialer\ZESTIFY_ONBOARDING_AUDIT.zip` (5.2 MB)

---

## 8. Summary of Compliance with User Requirements

1. **No Company Name on First Auth**: Complete. Both sign-in and sign-up are 100% agnostic of tenant metadata.
2. **Four-Pillar Separation**: Complete. Identity, Tenant, Membership/Role, and Subscription are cleanly decoupled in both database and runtime tokens.
3. **Seat Capacity Enforcement**: Complete. Validated both in unit API tests and visual UI meters.
4. **Final Owner Protection**: Complete. Rejects deletion or demotion of the last active owner.
5. **Core Product Boundary**: Complete. Scrapers are fully quarantined from new SaaS signups.
6. **Local Development Integrity**: Complete. Built, tested, and verified locally without touching VPS or production.
