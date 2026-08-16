# 03_TENANT_ISOLATION_EVIDENCE.md — Multi-Tenant Data Isolation Evidence

**Timestamp:** 2026-08-16T11:14:00+05:00  
**Inspection Target:** REST Endpoints in `server.ts`, Queries in `databaseManager.ts` & `safetyController.ts`

---

## 1. REST Endpoint Authorization Audit

| Endpoint | Authentication | Trusted Tenant Source | Database Query Filter | Cross-Tenant Attack Test | Actual Test Result |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET /campaigns` | `requireAuth` | `req.user.tenantId` | `SELECT * FROM campaigns WHERE tenantId = @tenantId` | Tenant A queries campaigns; Tenant B campaigns are omitted. | ✅ PASSED (`test_auto_dialer_multi_tenant_e2e.js`) |
| `GET /campaigns/:id/leads` | `requireAuth` | `req.user.tenantId` | `SELECT * FROM leads WHERE campaignId = @id AND tenantId = @tenantId` | Tenant A requests Tenant B campaign leads; returns empty array. | ✅ PASSED (`test_auto_dialer_multi_tenant_e2e.js`) |
| `DELETE /api/leads/:id` | `requireAuth` | `req.user.tenantId` | `DELETE FROM leads WHERE id = @id AND tenantId = @tenantId` | Tenant A attempts to delete Tenant B lead; returns 404 / 0 rows affected. | ✅ PASSED (`test_auto_dialer_multi_tenant_e2e.js`) |
| `DELETE /campaigns/:id/leads` | `requireAuth` | `req.user.tenantId` | `DELETE FROM leads WHERE campaignId = @id AND tenantId = @tenantId` | Tenant A attempts to clear Tenant B campaign leads; returns 0 count. | ✅ PASSED (`test_tenant_isolation.js`) |
| `POST /api/leads/purge-fake` | `requireAuth` | `req.user.tenantId` | `DELETE FROM leads WHERE tenantId = @tenantId AND ...` | Only Tenant A sample leads purged. | ✅ PASSED |
| `GET /logs` | `requireAuth` | `req.user.tenantId` | `SELECT * FROM call_logs WHERE tenantId = @tenantId` | Tenant A receives 0 logs from Tenant B. | ✅ PASSED (`test_tenant_isolation.js`) |
| `POST /api/logs/update` | `requireAuth` | `req.user.tenantId` | `UPDATE leads ... WHERE id = @leadId AND tenantId = @tenantId` | Tenant A cannot update Tenant B lead disposition. | ✅ PASSED (`test_auto_dialer_multi_tenant_e2e.js`) |
| `GET /api/devices` | `requireAuth` | `req.user.tenantId` | `SELECT * FROM devices WHERE tenantId = @tenantId` | Tenant A sees only own registered devices. | ✅ PASSED (`test_tenant_isolation.js`) |
| `POST /api/scraper-files/import` | `requireAuth` | `req.user.tenantId` | `createCampaign(name, file, leads, tenantId)` | Newly created campaign assigned to authenticated tenantId. | ✅ PASSED |

---

## 2. Client-Supplied Parameter Neutralization

- **Vulnerability Check:** Does the backend trust client-supplied `tenantId` in request bodies or query params?
- **Finding:** **NO.** All REST handlers pull `tenantId` directly from `(req as any).user.tenantId` (the cryptographically verified JWT payload).
- **Evidence:** `server.ts:1005, 1010, 1040, 1070, 1080, 1115`.
- **Test Evidence:** `test_tenant_isolation.js` (Test 15: "Client spoofed tenantId parameter is safely neutralized by trusted req.user.tenantId") $\rightarrow$ **PASS**.

---

## 3. Suppression / DNC Scoping

- **Schema:** `suppression_list` table contains `tenantId` column.
- **Lookup Query:**
  ```sql
  SELECT id FROM suppression_list WHERE phone = @phone AND (tenantId = @tenantId OR tenantId = 'tenant_default')
  ```
- **Result:** Phone numbers suppressed in Tenant A are checked for Tenant A calls; Tenant B lookups check Tenant B's suppression list without cross-tenant leakage.
