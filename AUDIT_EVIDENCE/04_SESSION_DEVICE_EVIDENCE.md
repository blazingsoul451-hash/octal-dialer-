# 04_SESSION_DEVICE_EVIDENCE.md — Session & Device Security Evidence

**Timestamp:** 2026-08-16T11:14:00+05:00  
**Inspection Target:** `sessionManager.ts`, `server.ts`

---

## 1. Direct Answers to Core Review Questions

### Q1: Can Tenant B reclaim Tenant A's orphaned session?
- **Answer:** **NO.**
- **Evidence:** `sessionManager.ts:100-125` explicitly checks:
  ```ts
  if (tenantId && s.tenantId && s.tenantId !== tenantId) {
    console.warn(`[Session] Cross-tenant reclaim rejected...`);
    // Fall through to create fresh session
  }
  ```
  And for orphaned recovery:
  ```ts
  const orphaned = Array.from(sessions.values()).find(
    s => !s.laptopSocketId && s.tenantId === tenantId && (!userId || !s.userId || s.userId === userId)
  );
  ```
- **Test:** `test_auto_dialer_complete.js` (Session Suite: "Cross-tenant session reclaim is rejected") $\rightarrow$ **PASS**.

---

### Q2: Can User B control User A's laptop session?
- **Answer:** **NO.**
- **Evidence:** `server.ts:1875-1890` verifies that the requesting user owns the session and device (`device.userId === user.id`).

---

### Q3: Can an unauthorized laptop connect a device?
- **Answer:** **NO.**
- **Evidence:** `server.ts:1875` enforces:
  ```ts
  if (session.laptopSocketId !== socket.id) {
    socket.emit('device:error', { error: 'Unauthorized: Emitting socket is not the owner of this session.' });
    return;
  }
  ```

---

### Q4: Can an unauthorized laptop disconnect a device?
- **Answer:** **NO.**
- **Evidence:** `server.ts:1960` checks:
  ```ts
  if (session.laptopSocketId !== socket.id) {
    console.warn(`[Socket] Rejected laptop:disconnect-device from unauthorized socket ${socket.id}`);
    return;
  }
  ```

---

### Q5: Can an unauthorized phone control a session?
- **Answer:** **NO.**
- **Evidence:** `call:picked-up` and `call:ended` handlers (`server.ts:2340-2370`) verify that `socket.id === session.phoneSocketId` (or matches verified `session.phoneDeviceId`). Unpaired / rogue sockets are rejected.
- **Test:** `test_auto_dialer_multi_tenant_e2e.js` (Section 5: "Rogue socket cannot trigger call:picked-up on Session A") $\rightarrow$ **PASS**.

---

### Q6: Can a stale socket remove a newer socket?
- **Answer:** **NO.**
- **Evidence:** `server.ts:2355` in the `disconnect` event verifies:
  ```ts
  if (authenticatedPhoneSockets.get(devId)?.socketId === socket.id) {
    authenticatedPhoneSockets.delete(devId);
    updateDeviceStatus(devId, 'OFFLINE');
  }
  ```
  If a newer socket has already connected under `devId`, the stale socket's disconnect event is safely ignored.

---

### Q7: Can duplicate phone connections create ambiguous ownership?
- **Answer:** **NO.**
- **Evidence:** `pairAuthenticatedDevice` and `pairPhone` replace previous session phone bindings cleanly and notify previous sockets via `bridge:unpaired` before assigning the new active socket ID.
