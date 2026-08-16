# 06_DIAL_AUTHORIZATION_EVIDENCE.md — Dial Pipeline & Socket Authorization Evidence

**Timestamp:** 2026-08-16T11:14:00+05:00  
**Inspection Target:** `server.ts:2230-2385`, `safetyController.ts:110-210`

---

## 1. Dial Pipeline Execution Order

Every call command initiated via `dial:lead` executes through this strict, sequential authorization pipeline:

```text
1. Receive 'dial:lead' event from WebSocket
   ↓
2. Validate Session Existence (getSessionById)
   ↳ Fail: emit error 'INVALID_SESSION'
   ↓
3. Validate Laptop Socket Ownership (session.laptopSocketId === socket.id)
   ↳ Fail: emit error 'UNAUTHORIZED_LAPTOP'
   ↓
4. Validate Phone Connection (session.phoneSocketId)
   ↳ Fail: emit error 'NO_PHONE'
   ↓
5. Validate Phone Socket Reachability (io.sockets.sockets.get(phoneSocketId))
   ↳ Fail: emit error 'PHONE_UNREACHABLE'
   ↓
6. Validate Phone Call Permissions (session.phoneStatus !== 'PERMISSION_REQUIRED')
   ↳ Fail: emit error 'PERMISSION_REQUIRED'
   ↓
7. Safety Controller Gate (checkCallAllowed)
   ├── Scoped Emergency Stop Check (isEmergencyStopped(tenantId, campaignId))
   ├── Campaign Ownership & Rate Limit Check (checkRateLimit(campaignId, tenantId))
   ├── DNC Suppression Check (isSuppressed(phone, tenantId))
   ├── Lead Status Verification (status !== 'CALLING', status !== 'COMPLETED')
   ├── Command Idempotency Check (findActiveCommand)
   └── Atomic Lead Reservation (reserveLead(leadId, sessionId, tenantId))
   ↳ Fail: emit 'dial:blocked' with reason and message
   ↓
8. Issue Command ID (cmd_<hex9>, 5-minute TTL)
   ↓
9. Direct Socket Dispatch to phoneSocket only
   ↓
10. Acknowledge Laptop (emit 'dial:dispatched')
```

---

## 2. Auto Dialer Socket.IO Events Security Audit

| Socket Event | Emitter | Expected Identity | Verification Check | Failure Behavior |
| :--- | :--- | :--- | :--- | :--- |
| `dial:lead` | Laptop | Laptop Socket Owner | `session.laptopSocketId === socket.id` | Blocked; error `'UNAUTHORIZED_LAPTOP'` emitted. |
| `dial:hangup` | Laptop | Laptop Socket Owner | `session.laptopSocketId === socket.id` | Blocked; ignored with warning. |
| `call:picked-up` | Phone | Verified Paired Phone | `session.phoneSocketId === socket.id` | Blocked; session status remains unchanged. |
| `call:ended` | Phone | Verified Paired Phone | `session.phoneSocketId === socket.id` | Blocked; call log / lead status update rejected. |
| `campaign:emergency_stop` | Laptop | Authenticated Tenant Session | Scoped to `session.tenantId` | Only halts calls in requester's tenant. |
| `campaign:clear_emergency_stop` | Laptop | Authenticated Tenant Session | Scoped to `socket.data.tenantId` | Only clears stop in requester's tenant. |
