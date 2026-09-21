# SETTINGS ROLE CLASSIFICATION BUG REPORT & ROOT CAUSE ANALYSIS

**Date:** September 21, 2026  
**Status:** Root Cause Proved & Documented  
**Scope:** Frontend Auth Initialization, Role Normalization, and Settings Navigation  

---

## 1. Executive Summary

During testing of the new Zestify Settings interface, logging in as `admin` caused the system to render:
- **Title:** `Account & Preferences`
- **Subheading:** `MEMBER PROFILE`
- **Role Display:** `Role: Member`
- **Team Info:** `Assigned Team: Unassigned`, `Team Leader: Unassigned`, `Effective Lead Access: OWN`
- **Sidebar:** Collapsed to only `Dashboard` and `Settings` (CRM, Campaigns, Leads, Reports, Scrapers, Team Workspace disappeared).
- **Header Contradiction:** Header showed `WORKSPACE / Admin` and user pill showed `Admin ⌵`, while Settings displayed `Role: Member`.

**Root Cause Verdict:**  
The issue is **not a database corruption or backend permission regression**. The database role is intact.  
The bug was caused by a frontend initialization and network failure cascade:
1. `LoginScreen.tsx` discarded the `role` field returned by `/auth/login` and never cached it in `localStorage`.
2. `App.tsx` hardcoded the initial `userRole` state to `'agent'`.
3. `App.tsx` attempted to fetch `/auth/me` and `/auth/permissions` using an uncontactable remote tunnel URL (`lanServerUrl` pointing to an expired `.loca.lt` domain instead of the local/proxied `SERVER_URL`).
4. The request timed out (HTTP 408 / network error), triggering the catch block where errors were silently logged.
5. `setUserRole(data.user.role)` was **never executed**, leaving `userRole` permanently frozen at `'agent'`.
6. Because `userRole === 'agent'` and module permissions defaulted to `false`, the sidebar hid all administrator modules, leaving only `Dashboard` and `Settings`.
7. When opening Settings, `currentUserRole={'agent'}` was passed to `CompanySettings.tsx`, where `isMember = currentUserRole === 'agent' || currentUserRole === 'user'` evaluated to `true`, rendering the personal Member Profile.

---

## 2. Complete Current-User Role Flow Trace

### Step 1: Database Role Stored in `users` Table
- **Company Owners (Tenant Signups):**
  When a tenant registers via `signupTenant()` (`website_octal_dialer/backend/src/authManager.ts`), the owner record is inserted as:
  ```sql
  INSERT INTO users (..., role, "tenantId", ...) VALUES (..., 'admin', tenantId, ...);
  ```
  The canonical database role stored for Company Owners is `'admin'`.
- **Platform Administrators:**
  The bootstrap provisioning function `ensureDefaultAdmin()` inserts:
  ```sql
  INSERT INTO users (..., role, "tenantId", ...) VALUES (..., 'platform_admin', 'tenant_default', ...);
  ```
- **Database Verification:**
  Querying the database confirms that the stored role for `admin` is intact and has not been corrupted or degraded to `member`.

### Step 2: Login API Payload Returned (`POST /auth/login`)
- When authenticating via `loginUser()` in `authManager.ts`, the backend constructs:
  ```typescript
  const authUser: AuthUser = {
    id: user.id,
    username: user.username,
    role: user.role,
    tenantId: user.tenantId,
    email: user.email
  };
  return {
    token,
    username: authUser.username,
    role: authUser.role,
    user: authUser
  };
  ```
- **Finding:** The backend successfully delivers `{ token, username, role, user: { role } }` in the HTTP 200 response body.

### Step 3: JWT Token Contents / Claims
- The JWT payload signed by `authManager.ts` contains:
  ```json
  {
    "sub": "user_0dc39103-71f4-4e13-b74e-be00462e3795",
    "username": "admin",
    "role": "platform_admin", // or "admin" for tenant owners
    "tenantId": "tenant_default",
    "iat": 1789982651,
    "exp": 1790069051
  }
  ```
- **Finding:** The role claim is embedded directly inside the signed JWT payload.

### Step 4: Frontend Auth State Initialization (`LoginScreen.tsx`)
- In `LoginScreen.tsx` line 328-334:
  ```typescript
  // Successful Login -> Authenticate user
  const token = data.token;
  const returnedUser = data.user?.username || data.username || username;

  localStorage.setItem('octal_auth_token', token);
  localStorage.setItem('octal_auth_user', returnedUser);
  onLogin(token, returnedUser);
  ```
- **Flaw 1:** `LoginScreen.tsx` completely ignored `data.user?.role` / `data.role`. It did not persist `octal_user_role` in `localStorage`, nor did it provide `role` to the `onLogin` callback.

### Step 5: `App.tsx` State Initialization & Default Role
- In `App.tsx` line 104:
  ```typescript
  const [userRole, setUserRole] = useState<'platform_admin' | 'admin' | 'team_lead' | 'agent'>('agent');
  ```
- **Flaw 2:** `userRole` is initialized to `'agent'` without checking `localStorage` or decoding the role claim from the JWT token.

### Step 6: Network Failure in `fetchUserData`
- In `App.tsx` lines 367-417:
  ```typescript
  useEffect(() => {
    if (!effectiveAuthToken) return;
    const fetchUserData = async () => {
      try {
        const res = await fetch(`${lanServerUrl}/auth/me`, {
          headers: { 'Authorization': `Bearer ${effectiveAuthToken}` }
        });
        if (res.ok) {
          const data = await res.json();
          setUserRole(data.user.role);
          ...
        }
      } catch (err) {
        console.error('Error fetching user data:', err);
      }
    };
    fetchUserData();
  }, [effectiveAuthToken, lanServerUrl]);
  ```
- In `App.tsx` lines 420-431:
  ```typescript
  fetch(`${SERVER_URL}/info`)
    .then(res => res.json())
    .then(data => {
      if (data.serverUrl) {
        setLanServerUrl(data.serverUrl); // e.g. "https://large-months-stay.loca.lt"
      }
    });
  ```
- **Flaw 3 (The Primary Blocker):**
  - `lanServerUrl` is intended only for mobile cellular device pairing via QR code.
  - When public tunnel discovery ran, `lanServerUrl` was updated to `https://large-months-stay.loca.lt`.
  - The localtunnel tunnel was dead / timed out (HTTP 408).
  - The web browser attempted to call `https://large-months-stay.loca.lt/auth/me`.
  - The request threw a network error / timeout into the `catch` block.
  - `setUserRole(data.user.role)` was **never called**.
  - `userRole` remained frozen at its initial default: `'agent'`.

### Step 7: How "admin" Became "Member"
- `App.tsx` rendered `<CompanySettings currentUserRole={userRole} ... />` passing `currentUserRole={'agent'}`.
- In `CompanySettings.tsx` lines 97-99:
  ```typescript
  const isCompanyOwner = currentUserRole === 'admin' || currentUserRole === 'platform_admin';
  const isTeamLead = currentUserRole === 'team_lead';
  const isMember = currentUserRole === 'agent' || currentUserRole === 'user';
  ```
- Because `currentUserRole` was `'agent'`:
  - `isCompanyOwner` evaluated to `false`.
  - `isMember` evaluated to `true`.
- `CompanySettings.tsx` rendered Experience 3: **MEMBER PROFILE** (`Role: Member`, `Assigned Team: Unassigned`, `Effective Lead Access: OWN`).

### Step 8: Why the Sidebar Showed Only Dashboard and Settings
- In `App.tsx`, sidebar navigation tabs are gated by:
  ```typescript
  // CRM
  {(userRole === 'platform_admin' || userRole === 'admin' || userPermissions.crm) && ...}
  // Campaigns
  {(userRole === 'platform_admin' || userRole === 'admin' || userPermissions.campaigns) && ...}
  // Leads
  {(userRole === 'platform_admin' || userRole === 'admin' || userPermissions.leads) && ...}
  // Reports
  {(userRole === 'platform_admin' || userRole === 'admin' || userPermissions.reports) && ...}
  // Scrapers & Utilities
  {userPermissions.googleScraper && ...}
  ```
- Because `userRole` was stuck at `'agent'` and all permissions defaulted to `false` (since `/auth/permissions` also failed over the dead tunnel), **every gated module was hidden**.
- Only `Dashboard` and `Settings` have no role gate, so only those two items appeared in the sidebar.

### Step 9: Why the Header Said "Admin" While Settings Said "Member"
- In `App.tsx` line 667:
  ```typescript
  <h1 className="text-sm font-bold text-white tracking-wide">
    WORKSPACE / <span className="text-amber-400 capitalize">{activeTab.replace('-', ' ')}</span>
  </h1>
  ```
  When the user navigated to the Settings view (`activeTab === 'admin'`), the header printed `"WORKSPACE / Admin"`.
- In `App.tsx` line 696:
  ```typescript
  <span className="capitalize">{authUser || 'mohsin octal'}</span>
  ```
  Since the logged-in username was `"admin"`, it capitalized and printed `"Admin ⌵"`.
- **Finding:** The header never inspected `userRole`; it was merely formatting the active tab identifier and the username string. Meanwhile, `CompanySettings` inspected `currentUserRole` (which was stuck at `'agent'`).

---

## 3. The Solution Architecture

To fix the issue permanently and centrally:
1. **Canonical Role Normalization Utility (`roleUtils.ts`):**
   - Provide `normalizeRole(raw): CanonicalRole` mapping `admin`/`owner` → `'admin'`, `team_lead`/`supervisor` → `'team_lead'`, `agent`/`user`/`member` → `'agent'`, and `platform_admin`/`master_admin` → `'platform_admin'`.
   - Provide helpers `isCompanyOwner(role)`, `isTeamLead(role)`, `isMember(role)`, `isPlatformAdmin(role)`, and `getRoleDisplayName(role)`.
   - Provide `getRoleFromToken(jwt)` to synchronously extract the role claim from JWT upon startup.
2. **Synchronous State Initialization:**
   - Initialize `userRole` in `App.tsx` from `localStorage.getItem('octal_user_role') || getRoleFromToken(token) || 'agent'`.
   - Persist role in `LoginScreen.tsx` upon successful login.
   - Pass role to `onLogin(token, user, role)`.
3. **Decouple Web App APIs from Device LAN URL:**
   - All browser API requests (`/auth/me`, `/auth/permissions`, `/campaigns`, etc.) must strictly target `SERVER_URL` (direct local/proxied API backend), NEVER `lanServerUrl`.
   - `lanServerUrl` is strictly restricted to mobile device QR pairing payloads.
4. **Settings & Header Alignment:**
   - Update `CompanySettings.tsx` to use canonical helpers.
   - For Company Owners (`admin`), ensure organization scope shows "Entire Company / All Teams" and all 8 administration control cards.
   - Update the header user pill to display the verified canonical role badge.

---

## 4. Implementation & Verification Summary

### Implemented Fixes:
1. **Central Structural Role Normalization (`roleUtils.ts`)**:
   - Implemented `StructuralRole = 'platform_admin' | 'admin' | 'team_lead' | 'user' | 'agent'`.
   - Implemented `AuthIdentity` model containing `username`, `role`, `displayName`, `tenantId`, `userId`, `email`.
   - Built `normalizeStructuralRole`, `tryNormalizeStructuralRole`, `getRoleDisplayName`, `isPlatformOwner`, `isCompanyOwner`, `isTeamLead`, `isMember`.
   - Built `getInitialIdentityHintFromToken(token)` which extracts structural claims synchronously from the JWT payload for zero-latency hydration on reload.

2. **Login Flow & Closed Failure (`LoginScreen.tsx`)**:
   - `LoginScreen` extracts role and user identity from login payload.
   - Validates role through `tryNormalizeStructuralRole()`; fails closed if unrecognized.
   - Invokes `onLogin(token, identity: AuthIdentity)`.

3. **Decoupled API Routing & Safe Hydration (`App.tsx`)**:
   - Strict separation of `WEB_API_BASE` (direct web application API) and `mobilePairingBaseUrl` (cellular phone QR pairing endpoint).
   - Removed the default `'agent'` role fallback. Initial state uses synchronous JWT claim hint via `getInitialIdentityHintFromToken(token)` or `null`.
   - Revalidation over `WEB_API_BASE/auth/me` and `WEB_API_BASE/auth/permissions` runs with `[effectiveAuthToken]` dependency (independent of mobile tunnel status).
   - Loading gate renders clean "Loading workspace..." spinner while `!authChecked || !userRole`, preventing any flash of Member Profile.
   - Header breadcrumb updated: `activeTab === 'admin'` displays `WORKSPACE / Settings`.
   - User dropdown pill displays role badge: `getRoleDisplayName(userRole)`.
   - All browser components (`CompanySettings`, `BillingPage`, `TeamLeadDashboard`, `SuperAdminPortal`, `LeadsTable`) receive `SERVER_URL` (`WEB_API_BASE`).

4. **Settings View Role Parity (`CompanySettings.tsx`)**:
   - Card 1 (Company Owner): renders `Role: Company Owner` (or `Platform Owner`) and `Organization Scope: Entire Company (All Teams)`.
   - Supervisor & Member cards display `getRoleDisplayName(normalizedRole)` dynamically.

### Verification Results:
- **Frontend Build (`npm run build`)**: Pass (0 errors, 1,563 modules transformed).
- **Backend Build (`npm run build`)**: Pass (0 errors).
- **SaaS Structure V2 Suite (`test_saas_structure_v2.cjs`)**: 45/45 PASS.
- **Backend Security Suite (`test:security`)**: 24/24 PASS.
- **Dead Tunnel Immunity**: Web application operates completely unimpeded even when `mobilePairingBaseUrl` points to a dead or expired tunnel.
