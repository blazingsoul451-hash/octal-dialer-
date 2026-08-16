# 05_LEAD_LOCKING_EVIDENCE.md — Lead Locking & Failure Recovery Evidence

**Timestamp:** 2026-08-16T11:14:00+05:00  
**Inspection Target:** `databaseManager.ts`, `safetyController.ts`, `server.ts`

---

## 1. Lead State Lifecycle Implementation

### Complete State Machine
```text
QUEUED (PENDING)
   │
   ▼ (dial:lead authorization passes)
RESERVED (CALLING, lockedBy = sessionId, lockedAt = now)
   │
   ▼ (Socket emit phone:dial)
DISPATCHED
   │
   ▼ (Phone reports call:picked-up)
CALLING / ACTIVE
   │
   ▼ (Phone reports call:ended + disposition saved)
COMPLETED
```

---

## 2. Failure Paths & Recovery Evidence

### 1. Authorization Failure (No Lock Acquired)
- **Mechanism:** In `server.ts:2230-2260`, session existence, laptop socket ownership, phone online status, and phone permissions are checked **before** invoking `checkCallAllowed` and `reserveLead`.
- **Database Result:** Lead remains `PENDING` with `lockedBy = NULL`.

### 2. Failed Phone Dispatch (Immediate Release)
- **Mechanism:** In `server.ts:2270`, if `phoneSocket.emit('phone:dial', ...)` throws, the catch block immediately calls `releaseLeadLock(leadId, sessionId)`.
- **Database Result:** Lead status is restored to `PENDING`, `lockedBy = NULL`.

### 3. Call Timeout / No Answer
- **Mechanism:** Frontend ring timer or backend `COMMAND_TTL_MINUTES` expires. Phone reports `NO ANSWER` on `call:ended`.
- **Database Result:** `releaseLeadLock(leadId, sessionId)` is invoked; status is updated to `COMPLETED` with outcome `'NO ANSWER'`.

### 4. Laptop / Phone Socket Disconnect
- **Mechanism:** In `server.ts:2370`, the socket `disconnect` event triggers `unlockLeadsForSession(session.id)`.
- **SQL Executed:**
  ```sql
  UPDATE leads 
  SET lockedBy = NULL, lockedAt = NULL, status = CASE WHEN status = 'CALLING' THEN 'PENDING' ELSE status END 
  WHERE lockedBy = @sessionId AND status != 'COMPLETED'
  ```
- **Database Result:** All in-flight leads locked by the disconnected session are immediately released back to `PENDING`.

### 5. Server Restart / Expired Leases Recovery
- **Mechanism:** `releaseExpiredLeases()` runs on server startup and every 60 seconds (`databaseManager.ts:1120`).
- **SQL Executed:**
  ```sql
  UPDATE leads 
  SET lockedBy = NULL, lockedAt = NULL, status = CASE WHEN status = 'CALLING' THEN 'PENDING' ELSE status END 
  WHERE lockedAt < @cutoff AND status != 'COMPLETED' AND lockedBy IS NOT NULL
  ```
- **Database Result:** Any orphaned locks older than `LEASE_TTL_MINUTES` (2 minutes) are automatically reclaimed.
