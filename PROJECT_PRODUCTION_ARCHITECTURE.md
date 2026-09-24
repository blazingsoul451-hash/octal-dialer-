# ZESTIFY — PRODUCTION SYSTEM ARCHITECTURE SPECIFICATION
**Version:** 2.0.0-PROD  
**Domain:** `zestify7.online`  
**Status:** AUDITED & PRODUCTION-READY  

---

## 1. Executive Architectural Topology

Zestify is an enterprise-grade multi-tenant B2B Sales Engagement and Telephony Platform. The platform provides a unified software plane divided into two completely partitioned operational environments:
1. **Platform Owner / Super Admin Control Plane** (`https://admin.zestify7.online` or `/admin`)
2. **Customer Tenant Workspace Plane** (`https://app.zestify7.online` or `https://zestify7.online`)

```
                                  [ INTERNET CLIENTS ]
                                            │
                     ┌──────────────────────┴──────────────────────┐
                     ▼                                             ▼
          [ admin.zestify7.online ]                     [ app.zestify7.online ]
          (Platform Admin Portal)                       (Customer Tenant Workspace)
                     │                                             │
      Token: octal_platform_auth_token              Token: octal_customer_auth_token
                     │                                             │
                     └──────────────────────┬──────────────────────┘
                                            ▼
                           [ NGINX REVERSE PROXY / CLOUDFLARE ]
                                            │
                        ┌───────────────────┴───────────────────┐
                        ▼                                       ▼
             [ Zestify Express Core ]               [ Lead Gen Z Microservice ]
                  (Port: 5000)                             (Port: 5001)
                        │                                       │
                        ├───────────────────────────────────────┘
                        ▼  (Strictly Scoped / Fail-Closed)
            [ PostgreSQL 18.4 Engine ]
                   (Port: 54330)
```

---

## 2. Platform Plane vs Customer Tenant Isolation

### 2.1 Identity & Authority Matrix
| Role | Tenancy (`tenantId`) | Portal Authority | Seat Consumption | Impersonation Target | Wildcard Scope |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`platform_admin` / `master_admin`** | **`NULL`** (Strictly Enforced) | Full Platform Owner API (`/api/super-admin/*`) | 0 (Never consumes customer seats) | Originator only | Cross-platform administrative |
| **`admin` (Company Owner)** | **`UUID / Tenant ID`** | Customer Workspace Only | Consumes 1 Organization Seat | Target of support impersonation | Tenant-scoped wildcard (`*`), bounded by Company Module Ceiling |
| **`team_lead`** | **`UUID / Tenant ID`** | Customer Workspace Only | Consumes 1 Organization Seat | Unprivileged target | Assigned team scope & modules |
| **`user` / `agent` (Worker)** | **`UUID / Tenant ID`** | Customer Workspace Only | Consumes 1 Organization Seat | Unprivileged target | Individual assignment & calling |

### 2.2 Strict Invariants
1. **Zero Tenant Null Leakage**: Platform Administrators must NEVER have a `tenantId`. Any attempt to assign a platform administrator to a customer workspace, team, seat, or campaign is blocked fail-closed with HTTP 400/403.
2. **Customer Containment**: Customers (Company Owner, Team Lead, Worker) are strictly barred from `/api/super-admin/*`. Any request by a non-platform user returns HTTP 403 Forbidden.
3. **Session Token Isolation**:
   - Platform tokens are stored under `octal_platform_auth_token` and `octal_platform_auth_user`.
   - Customer tokens are stored under `octal_customer_auth_token` and `octal_customer_auth_user`.
   - Customer login and Platform login never overwrite each other in browser storage.

---

## 3. Company Module Ceiling & Permission Engine

### 3.1 Mathematical Authorization Formula
Access to any feature or endpoint is calculated strictly server-side as:
$$\text{Effective Permission} = \text{Company Entitlements} \cap \text{Employee Assignments}$$

### 3.2 Canonical Module Catalog
1. `crm` — CRM Workspace, Contacts, Companies, Opportunities, Deals, Quotes.
2. `campaigns` — Dialing Campaigns, Branch Queues, Pipelines.
3. `leads` — Leads Database, Explorers, CSV/Manual Imports.
4. `octalDialer` (`dialer`) — GSM Android Auto-dialer, Telephony, WebSockets.
5. `reports` (`analytics`) — Performance Analytics, Call Logs, CSV Exports.
6. `autoEmailer` (`auto_emailer`) — Cold Email Sequences & SMTP Dispatch.
7. `facebookPoster` (`facebook_poster`) — Scheduled Facebook Community Posts.
8. `googleScraper` (`google_scraper`) — Google Maps Lead Extraction (Scraper).
9. `facebookScraper` (`facebook_scraper`) — Facebook Group Member Scraper.

### 3.3 Server-Side Ceiling Enforcement
- In `authManager.ts`, both `requirePermission()` and `requireModule()` query `getTenantModuleEntitlements(user.tenantId)`.
- If a module is disabled (`false`) for the tenant, **Company Owner's wildcard (`*`) CANNOT bypass it**.
- The endpoint immediately terminates with `HTTP 403 Forbidden: Module '<module>' is disabled for your organization.`
- When Platform Admin activates the module in `tenant_module_entitlements`, access is unlocked immediately.

---

## 4. Single Canonical Impersonation System

Platform Administrators can securely troubleshoot customer accounts using single-step audited support impersonation:
1. **Initiation**: Platform Admin calls `POST /api/super-admin/impersonate/:tenantId` with a mandatory support reason.
2. **Role Downgrade Safety**: If target user possesses administrative or platform privileges, the token role is automatically down-scoped strictly to `admin` (Company Owner), preventing privilege escalation.
3. **Audit Trail**: An immutable record (`IMPERSONATION_STARTED`) is persisted into `audit_logs_admin` with timestamp, actor, target tenant, target user, and audit reason.
4. **Transport & Storage**:
   - The generated JWT token is transported via URL hash fragment (`#impersonateToken=...&impersonateTenant=...`), never via query string.
   - The frontend consumes the hash and immediately clears the URL with `window.history.replaceState`.
   - The token is placed **strictly in `sessionStorage` (`octal_impersonate_token`)**, leaving `octal_platform_auth_token` in `localStorage` untouched.
5. **Termination**: Exiting the impersonated session calls `POST /api/super-admin/impersonate/exit`, writes `IMPERSONATION_ENDED` to `audit_logs_admin`, removes `sessionStorage` tokens, and cleanly restores the platform administrator session.

---

## 5. Lead Gen Z Integration Boundary

Lead Gen Z operates as an independent discovery engine with a hardened, fail-closed delivery interface:
- **Endpoint**: `POST /api/integrations/leadgen/import` on Zestify API core.
- **Authentication**: Requires `Authorization: Bearer <token>`. Unauthenticated requests return `HTTP 401`.
- **Tenant Binding**: Caller must be a member of the target workspace. Any cross-tenant lead injection returns `HTTP 403 Forbidden`.
- **Truthful Delivery**:
  - Simulated delivery fallbacks have been eliminated.
  - If the core Zestify API is unreachable or returns non-200, the operation fails with HTTP 502/500.
  - Leads are marked `sentToZestify: true` **only upon verified 200 OK receipt** from Zestify.

---

## 6. Telephony & Calling Architecture (Frozen Core)

The GSM calling infrastructure remains 100% frozen, preserving stability:
- **Mobile Pairing**: Phone scans dynamic QR code encoding authenticated pairing token; pairing is validated against `session.tenantId`.
- **Calling Lifecycle**: WebSocket events (`call:make`, `call:picked-up`, `call:ended`) orchestrated via Android Telecom Framework.
- **Answer Detection**: Verified telecom states (`OFFHOOK`, `CONNECTED`) drive call timers. Duration heuristics and fake simulated answers are prohibited.
- **Lead Queue & Progress**: Driven exclusively by `lastDispositionSaved` signals; disposition progression is idempotent.

---

## 7. Production Subdomain & DNS Configuration

| Hostname | Purpose | Target / Route | Token Key |
| :--- | :--- | :--- | :--- |
| `zestify7.online` | Main Website & Customer App | Reverse Proxy -> Frontend Port 5174 | `octal_customer_auth_token` |
| `app.zestify7.online` | Dedicated Customer Workspace | Reverse Proxy -> Frontend Port 5174 | `octal_customer_auth_token` |
| `admin.zestify7.online` | Platform Super Admin Portal | Reverse Proxy -> Frontend Port 5174 | `octal_platform_auth_token` |
| `api.zestify7.online` | REST API & WebSocket Signaling | Reverse Proxy -> Backend Port 5000 | `Authorization: Bearer <jwt>` |
