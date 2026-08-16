# 08_FRONTEND_EVIDENCE.md — Frontend Queue & Disposition Evidence

**Timestamp:** 2026-08-16T11:14:00+05:00  
**Inspection Target:** `App.tsx`, `LeadQueue.tsx`, `DispositionModal.tsx`, `useSocket.ts`

---

## 1. Queue Management & Stable Lead Matching

### Array Index Independence
- In `LeadQueue.tsx:185-240`, `lastCallFinished` is processed using:
  ```ts
  const targetLead = lastCallFinished.leadId 
    ? leads.find(l => l.id === lastCallFinished.leadId) 
    : leads[currentIndex];
  ```
- Filtering or re-sorting the leads table while a call is in flight does **not** corrupt the completed call record.

### Double-Processing Guard
- `LeadQueue.tsx` maintains `processedCallRef` (`${targetLead.id}_${reason}_${duration}_${commandId}`) to ensure each call completion event triggers disposition and state transitions exactly once.

---

## 2. Disposition Modal Flow

1. **Answered Calls (`duration > 3s`):**
   - `LeadQueue.tsx` invokes `triggerDisposition(targetLead.id, targetLead.name)`.
   - `DispositionModal` opens, prompting the user for call outcome and remarks.
   - On save, `DispositionModal` sends an authenticated `POST /api/logs/update` with `Authorization: Bearer ${authToken}`.
   - On success, `onSaveSuccess` callback is invoked, triggering lead refresh and queue advancement.

2. **Unanswered Calls (`duration <= 3s` / `NO ANSWER`):**
   - Automatically marked as `NO ANSWER`.
   - After a 2-second delay, queue advances to the next `PENDING` lead and triggers the next auto-dial if autopilot is enabled.

---

## 3. Error Recovery & Optimistic State Reconciliation

- In `useSocket.ts:105-115`, socket error events (`device:error`, `error`, `dial:blocked`) immediately reset `callState` to `'IDLE'`.
- This ensures an unpair or rejection never leaves the web UI stuck in a perpetual `'CALLING'` or `'ACTIVE'` state.
