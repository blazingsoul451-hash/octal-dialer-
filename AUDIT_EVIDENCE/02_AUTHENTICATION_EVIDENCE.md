# 02_AUTHENTICATION_EVIDENCE.md — Authentication & Identity Architecture

**Timestamp:** 2026-08-16T11:14:00+05:00  
**Inspection Target:** `authManager.ts`, `server.ts`, `App.tsx`

---

## 1. JWT Creation & Verification Architecture

### JWT Payload
```json
{
  "sub": "user_4a6680f5ed2fdc81",
  "username": "alice",
  "role": "user",
  "tenantId": "tenant_b6a3f3994fb0cc67"
}
```
- **Signing Key:** Loaded dynamically from `process.env.JWT_SECRET` (falls back to a secure constant in dev).
- **Algorithm:** `HS256` via `jsonwebtoken`.
- **Expiration:** 7 days (`7d`).
- **Verification:** `validateToken(token: string)` parses the payload, validates signature, and extracts `{ id: payload.sub, username, role, tenantId }`.

---

## 2. Google OAuth Intent Behavior Breakdown

### Existing Google account + Sign In
- **Expected:** Returns valid JWT and user object with existing `tenantId`.
- **Actual:** Returns `{ success: true, token, user, isNewUser: false }`.
- **Evidence:** `website_octal_dialer/backend/src/authManager.ts:210-230`.
- **Test:** `test_google_signin_vs_signup_separation.js` (Test C) & `test_auto_dialer_multi_tenant_e2e.js` (Test 1.5).

### Unknown Google account + Sign In
- **Expected:** Rejection with `GOOGLE_ACCOUNT_NOT_FOUND` (HTTP 400 or error code). No account created.
- **Actual:** Throws error with `err.code = 'GOOGLE_ACCOUNT_NOT_FOUND'`, server responds with 400.
- **Evidence:** `website_octal_dialer/backend/src/authManager.ts:230-236`.
- **Test:** `test_google_signin_vs_signup_separation.js` (Test A) & `test_auto_dialer_multi_tenant_e2e.js` (Test 1.1).

### Unknown Google account + Sign Up
- **Expected:** Creates new user with role `user`, generates dedicated tenant ID `tenant_<hex8>`, provisions starter subscription, and assigns default module permissions.
- **Actual:** Executes database transaction inserting into `tenants`, `users`, `subscriptions`, and `user_permissions`.
- **Evidence:** `website_octal_dialer/backend/src/authManager.ts:240-275`.
- **Test:** `test_google_signin_vs_signup_separation.js` (Test B) & `test_auto_dialer_multi_tenant_e2e.js` (Test 1.2).

### Google account tenant assignment
- **Expected:** Every independent Google signup receives its own unique tenant.
- **Actual:** `tenantId = 'tenant_' + crypto.randomBytes(8).toString('hex')`. No fallback to `tenant_default`.
- **Evidence:** `website_octal_dialer/backend/src/authManager.ts:245`.
- **Test:** `test_auto_dialer_multi_tenant_e2e.js` (Tests 1.3–1.4).

---

## 3. Permissions Endpoint (`/auth/permissions`)

- **Route:** `GET /auth/permissions` and `GET /api/auth/permissions`.
- **Middleware:** `requireAuth` (validates JWT).
- **Behavior:**
  - Platform Admin / Admin: Returns all business modules enabled (`true`).
  - Regular User: Queries `user_permissions` table for `userId` and `tenantId`.
- **Frontend Consumption:** `App.tsx` calls `/auth/permissions` upon successful login/verification and stores permissions in state.

---

## 4. Logout & Account Switching State Cleanup

- **Implementation:** `App.tsx:handleLogout`.
- **State Purged:**
  - `localStorage.removeItem('octal_auth_token')`
  - `localStorage.removeItem('octal_auth_user')`
  - `localStorage.removeItem('octal_session_id')`
  - `setAuthToken(null)`
  - `setAuthUser(null)`
  - `setUserRole('user')`
  - `setUserPermissions({})`
  - `setCampaigns([])`
  - `setDispOpen(false)`
  - `setSelectedCampaignId(null)`
  - `setActiveTab('dashboard')`
- **Result:** Switching between Google Account A and Google Account B leaves no cached campaign or lead state from Account A.
