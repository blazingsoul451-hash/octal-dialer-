# MODULE_AND_ACCOUNT_IDENTITY_DIAGNOSIS.md
**Octal Dialer — Deep Root-Cause Investigation Report**

---

## 1. Executive Summary

| Issue | Root Cause Classification | Primary Location | Impact |
| :--- | :--- | :--- | :--- |
| **Missing Sidebar Modules** | **BACKEND RESPONSE SHAPE MISMATCH / FRONTEND PERMISSION PARSING BUG** | `website_octal_dialer/frontend/src/App.tsx:264-265` | All non-admin users lose 100% of sidebar modules upon login. |
| **Account Name Reversion** | **USERNAME / DISPLAY NAME CONFLATION & MISSING `displayName` COLUMN** | `website_octal_dialer/backend/src/authManager.ts:240-243` & `App.tsx:175, 526` | Google names are truncated into lowercase unique `username` slugs; UI has no dedicated display name. |
| **Mobile Login Tenant Bug** | **`userId` SUBSTITUTED FOR `tenantId`** | `website_octal_dialer/backend/src/server.ts:728-730` | Mobile app dials into a segregated fake tenant and cannot see organization leads/campaigns. |

---

## 2. Investigation Part 1: Root Cause of Missing Modules

### 2.1 Backend Response Shape vs Frontend Consumption

#### Backend (`website_octal_dialer/backend/src/server.ts:657-683`):
```typescript
app.get(['/auth/permissions', '/api/auth/permissions'], requireAuth, (req, res) => {
  const user = (req as any).user;
  // ...
  const perms = getUserPermissions(user.id, user.tenantId);
  res.json({
    success: true,
    permissions: perms,
    userRole: user.role
  });
});
```
**Actual JSON returned over the wire:**
```json
{
  "success": true,
  "permissions": {
    "octalDialer": true,
    "campaigns": true,
    "leads": true,
    "reports": true,
    "googleScraper": true,
    "autoEmailer": true,
    "facebookScraper": true,
    "facebookPoster": true
  },
  "userRole": "user"
}
```

#### Frontend (`website_octal_dialer/frontend/src/App.tsx:258-267`):
```typescript
// Fetch module permissions
const permRes = await fetch(`${lanServerUrl}/auth/permissions`, {
  headers: { 'Authorization': `Bearer ${authToken}` }
});

if (permRes.ok) {
  const permissions = await permRes.json();
  setUserPermissions(permissions); // ❌ BUG: Sets state to the ENTIRE wrapper object!
}
```

### 2.2 Why Modules Disappear
In React state, `userPermissions` becomes:
`{ success: true, permissions: { octalDialer: true, ... }, userRole: "user" }`

When the JSX evaluates sidebar visibility:
* `userPermissions.octalDialer` $\rightarrow$ `undefined` (falsy)
* `userPermissions.campaigns` $\rightarrow$ `undefined` (falsy)
* `userPermissions.leads` $\rightarrow$ `undefined` (falsy)
* `userPermissions.reports` $\rightarrow$ `undefined` (falsy)
* `userPermissions.googleScraper` $\rightarrow$ `undefined` (falsy)
* `userPermissions.autoEmailer` $\rightarrow$ `undefined` (falsy)
* `userPermissions.facebookScraper` $\rightarrow$ `undefined` (falsy)
* `userPermissions.facebookPoster` $\rightarrow$ `undefined` (falsy)
* `userPermissions.crm` $\rightarrow$ `undefined` (falsy)

### 2.3 Why `platform_admin` Did Not Notice It
In `App.tsx:245-256`, if `user.role === 'platform_admin'`, `App.tsx` executed a hardcoded client-side bypass:
```typescript
if (data.user.role === 'platform_admin') {
  setUserPermissions({
    octalDialer: true,
    googleScraper: true,
    autoEmailer: true,
    facebookScraper: true,
    facebookPoster: true,
    campaigns: true,
    leads: true,
    crm: true,
    reports: true
  });
}
```
Thus, `platform_admin` accounts never executed lines 258-267. But whenever a normal user, newly signed-up Google user, or agent logged in, they hit the broken `/auth/permissions` parser, resulting in an **empty sidebar**.

---

## 3. Investigation Part 2: Root Cause of Account Name Reversion

### 3.1 Trace of Account Identity & Display Name
1. **Database Schema (`users` table):**
   * Columns: `id`, `username`, `email`, `passwordHash`, `role`, `tenantId`, `googleId`, `authProvider`, `emailVerified`, `needsProfileSetup`, `createdAt`, `updatedAt`.
   * **Crucial Finding:** There is **NO `displayName` column** in the database.
2. **Google Sign Up (`authManager.ts:239-243`):**
   * Takes `profile.name` (e.g. `"Blazing Soul"`).
   * Strips spaces and special characters: `cleanBase = "blazingsoul"`.
   * Forces `username` to lowercase ASCII slug `"blazingsoul"`.
3. **Google Sign In (`authManager.ts:174-218`):**
   * Looks up user by `googleId` or `email`.
   * Returns stored `user.username` (e.g. `"blazingsoul"`).
4. **App Header (`App.tsx:526`):**
   * `title={`Logged in as ${authUser}`}`
   * `Hello {authUser}` (Renders `"Hello blazingsoul"`).
5. **Account Switching / LocalStorage (`App.tsx:147-156`):**
   * On logout: `localStorage.removeItem('octal_auth_user')` and `setAuthUser(null)`.
   * On Google login redirect (`App.tsx:175`): `urlParams.get('username')` reads `result.user.username` from the backend callback URL.
   * On `/auth/verify` (`App.tsx:207`): `setAuthUser(data.user.username)`.

### 3.2 Root Cause of Name Reversion / Confusion
* **Username vs Display Name Conflation:** The system treats the unique login handle (`username`) as the user's human display name.
* **Server Boot Hardcoded Overwrite (`authManager.ts:727-731`):**
  ```typescript
  const primaryOwner = db.prepare(`SELECT * FROM users WHERE username = 'mohsin1' OR email = 'blazingsoul451@gmail.com'`).get();
  if (primaryOwner) {
    db.prepare(`UPDATE users SET role = 'platform_admin' WHERE id = ?`).run(primaryOwner.id);
    db.prepare(`UPDATE users SET role = 'user' WHERE role = 'platform_admin' AND id != ?`).run(primaryOwner.id);
  }
  ```
  If a user logs in with `blazingsoul451@gmail.com`, this account was created with username `blazingsoul`. If another Google account logs in, it receives its own generated slug (e.g. `user_xxxx`). When switching between accounts, the UI faithfully reflects the DB `username` of the active token, but because `username` is an ASCII slug rather than a full human display name, it appears as an unexpected or "reverted" handle.

---

## 4. Investigation Part 3: Mobile Login Tenant Bug

### 4.1 Defect in `/api/mobile/login` (`server.ts:728-730`)
```typescript
// POST /api/mobile/login (Line 728-730)
const tenantId = authResult.user.id; // ❌ DEFECT: Uses user.id as tenantId!
const tenantSessions = (Array.from(getSessions().values()) as Session[]).filter(s => s.tenantId === tenantId);
const activeSession = tenantSessions.length > 0 ? tenantSessions[0] : reclaimOrCreateSession('laptop_mobile_host', tenantId); // ❌ DEFECT: Parameter order mismatch!
```

### 4.2 Downstream Consequences
1. `authResult.user.id` is the user's `userId` (e.g. `user_043d0a3a6e0c5ee0`), **NOT** their `tenantId` (e.g. `tenant_bd4867172fc38e27`).
2. When the phone pairs via `/api/mobile/login`, it is assigned to a non-existent, fake tenant matching its `userId`.
3. The phone cannot find the laptop's session (because the laptop is in `tenant_bd4867...`).
4. `reclaimOrCreateSession(laptopSocketId, previousSessionId?, tenantId?)` received `tenantId` as the 2nd parameter (`previousSessionId`), corrupting session reclamation.

---

## 5. Investigation Part 4: Sidebar Module Permission Matrix

| Module Name | UI Tab Key | Permission Key | Backend Source (`getUserPermissions`) | Role Override | Visibility Condition in `App.tsx` |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Dashboard** | `'dashboard'` | *(None)* | Public Core | None | Always visible |
| **CRM Workspace** | `'crm'` | `crm` | `user_permissions.moduleId = 'crm'` | `platform_admin`, `admin` | `userRole === 'platform_admin' \|\| userRole === 'admin' \|\| userPermissions.crm` |
| **Campaigns** | `'campaigns'` | `campaigns` | `user_permissions.moduleId = 'campaigns'` | `platform_admin`, `admin` | `userRole === 'platform_admin' \|\| userRole === 'admin' \|\| userPermissions.campaigns` |
| **Leads Database** | `'leads'` | `leads` | `user_permissions.moduleId = 'leads'` | `platform_admin`, `admin` | `userRole === 'platform_admin' \|\| userRole === 'admin' \|\| userPermissions.leads` |
| **Reports & Analytics** | `'reports'` | `reports` | `user_permissions.moduleId = 'reports'` | `platform_admin`, `admin` | `userRole === 'platform_admin' \|\| userRole === 'admin' \|\| userPermissions.reports` |
| **Platform Admin** | `'admin'` | *(None)* | Role-Gated | `platform_admin` ONLY | `userRole === 'platform_admin'` |
| **Billing & Plans** | `'billing'` | *(None)* | Role-Gated | `platform_admin` ONLY | `userRole === 'platform_admin'` |
| **Auto Dialer** | `'dialer'`, `'pair'`, etc. | `octalDialer` | `user_permissions.moduleId = 'octalDialer'` | `platform_admin`, `admin` | `userRole === 'platform_admin' \|\| userRole === 'admin' \|\| userPermissions.octalDialer` |
| **Google Scraper** | `'scraper'` | `googleScraper` | `user_permissions.moduleId = 'googleScraper'` | `platform_admin`, `admin` | `userRole === 'platform_admin' \|\| userRole === 'admin' \|\| userPermissions.googleScraper` |
| **Auto Emailer** | `'emailer'` | `autoEmailer` | `user_permissions.moduleId = 'autoEmailer'` | `platform_admin`, `admin` | `userRole === 'platform_admin' \|\| userRole === 'admin' \|\| userPermissions.autoEmailer` |
| **Facebook Scraper**| `'fb-scraper'` | `facebookScraper` | `user_permissions.moduleId = 'facebookScraper'` | `platform_admin`, `admin` | `userRole === 'platform_admin' \|\| userRole === 'admin' \|\| userPermissions.facebookScraper` |
| **Facebook Poster** | `'fb-poster'` | `facebookPoster` | `user_permissions.moduleId = 'facebookPoster'` | `platform_admin`, `admin` | `userRole === 'platform_admin' \|\| userRole === 'admin' \|\| userPermissions.facebookPoster` |

*All 8 module keys in `user_permissions` table exactly match frontend permission keys.*

---

## 6. Recommended Minimal Fixes (DO NOT APPLY YET)

### Fix A: Frontend Permission Parsing (`website_octal_dialer/frontend/src/App.tsx:264-266`)
```typescript
// Replace:
if (permRes.ok) {
  const data = await permRes.json();
  setUserPermissions(data.permissions || data);
}
```

### Fix B: Mobile Login Tenant & Session Signature (`website_octal_dialer/backend/src/server.ts:728-730`)
```typescript
// Replace:
const tenantId = authResult.user.tenantId || 'tenant_default';
const tenantSessions = (Array.from(getSessions().values()) as Session[]).filter(s => s.tenantId === tenantId);
const activeSession = tenantSessions.length > 0 ? tenantSessions[0] : reclaimOrCreateSession('laptop_mobile_host', undefined, tenantId);
```

### Fix C: Dedicated `displayName` Column in Users Schema
Add `displayName TEXT` to `users` table so human names (e.g. `"Mohsin Babar"`, `"Blazing Soul"`) are stored separately from system username slugs (`"blazingsoul"`).

---

## 7. Modification Status Confirmation

**CURRENT PROJECT SOURCE CODE WAS NOT MODIFIED.**
* Clean working tree maintained.
* No commits or resets executed.
