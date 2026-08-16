# 07_CALL_STATE_EVIDENCE.md — Authoritative Call State & Stable Identity Evidence

**Timestamp:** 2026-08-16T11:14:00+05:00  
**Inspection Target:** `server.ts`, `LeadQueue.tsx`, `useSocket.ts`

---

## 1. Stable Identity Invariants

Call identity in Octal Dialer does **NOT** depend on array indexing (`currentIndex`) or client-side positional guessing.

Every call command and lifecycle event tracks the following authoritative tuple:
1. `tenantId` — Authoritative multi-tenant isolation root
2. `userId` — Identity of the agent initiating the session
3. `sessionId` — Ephemeral connection pair (`sess_<id>`)
4. `campaignId` — Owning campaign container
5. `leadId` — Unique persistent lead record (`lead_camp_<id>_<index>_<rand>`)
6. `commandId` — Idempotent in-flight dispatch token (`cmd_<id>`)
7. `deviceUid` / `deviceId` — Authenticated mobile hardware identifier

---

## 2. End-to-End Call State Flow

```text
Web Frontend (App / LeadQueue)
   │  Emits dial:lead with { leadId, campaignId, phone, name }
   ▼
Backend Server (server.ts & safetyController.ts)
   │  Issues commandId (cmd_<id>), reserves leadId in SQLite
   │  Emits phone:dial { leadId, phone, name, commandId } directly to phone socket
   ▼
Flutter Client (ConnectedScreen / CallingScreen)
   │  Receives phone:dial with leadId and commandId
   │  Invokes MethodChannel 'startGsmCall'
   ▼
Android Native (MainActivity.kt)
   │  Executes Intent.ACTION_CALL (TelecomManager / GSM)
   │  PhoneStateListener detects OFFHOOK / CALL_STATE_RINGING
   ▼
Call Concluded (GSM hangup detected / user taps end call)
   │  Flutter captures call duration and reason
   │  Emits call:ended with { sessionId, leadId, commandId, duration, reason }
   ▼
Backend Server (server.ts)
   │  Verifies phone socket ownership
   │  Expires commandId
   │  Releases lead lock & updates lead status to COMPLETED
   │  Emits call:finished { reason, duration, leadId, commandId } to laptop room
   ▼
Web Frontend (LeadQueue.tsx & DispositionModal.tsx)
   │  Matches call:finished by leadId (targetLead = leads.find(l => l.id === leadId))
   │  Opens DispositionModal for answered calls (duration > 3s)
   │  Advances to next PENDING lead on disposition save or timeout
```
