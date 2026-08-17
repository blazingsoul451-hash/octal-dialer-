# OCTAL DIALER — CALL FLOW & OUTCOMES STABILIZATION REPORT

**Date**: August 17, 2026  
**Status**: COMPLETE & VERIFIED  

---

## 1. Root Cause of False "ANSWERED" Results

### The Flawed Assumptions:
1. **Native `OFFHOOK` treated as answered**: In GSM Android telephony, `CALL_STATE_OFFHOOK` fires the moment the phone radio goes off-hook to initiate the cellular dial before the remote party ever answers.
2. **Arbitrary duration threshold**: The frontend previously classified any call with `duration > 3` as `ANSWERED`. When a carrier IVR played an error message (*"You do not have sufficient balance to make this call"* or *"The number you have dialed is unreachable"*) for 4–5 seconds before hanging up, the system falsely stamped the call as `ANSWERED`.

### The Resolution:
- `OFFHOOK` alone is treated strictly as `CONNECTING_RADIO` / `DIALING`, not human answer.
- Calls terminated under 6 seconds or dropped by carrier are classified as `FAILED` (or `NO_ANSWER`), never `ANSWERED`.
- The Disposition Modal provides accurate human-validated outcome selections: `ANSWERED`, `NO_ANSWER`, `BUSY`, `FAILED (Carrier Error / Insufficient Balance)`, `INTERESTED`, `NOT_INTERESTED`, `CALLBACK_REQUESTED`, `WRONG_NUMBER`.

---

## 2. Authoritative Call State Machine

```
   [ IDLE ]
      │
      ▼  (phone:dial command)
   [ CALLING / RINGING ]  ◄─── [ Ring Timeout: 35s ] (terminates as NO_ANSWER if expired)
      │
      ├───────────────────────────────┐
      ▼ (Agent speaks / >5s talk)     ▼ (Carrier drop / Insufficient Balance / <5s)
   [ ACTIVE / TALKING ]            [ TERMINAL FAILURE ]
      │                               │ (Outcome: FAILED / NO_ANSWER / BUSY)
      ▼ (Hangup)                      ▼
   [ POST-CALL DISPOSITION ] ◄────────┘
      │
      ▼ (Save Disposition / Backend returns nextLeadId)
   [ INTER-CALL DELAY COOLDOWN ] ◄─── [ Next-Call Delay: 0s–10s ]
      │ (Countdown: 3... 2... 1...)
      ▼
   [ DIAL NEXT LEAD ] (Exact nextLeadId from backend)
```

---

## 3. Terminal Outcome Behavior

| Outcome State | Trigger Condition | Auto-Dial Next Step |
| :--- | :--- | :--- |
| `ANSWERED` | Agent connected and spoke with contact (>5s) | Opens disposition modal $\rightarrow$ Save $\rightarrow$ Next-Call Delay $\rightarrow$ Next Lead |
| `NO_ANSWER` | Call rang until Ring Timeout (35s) without pickup | Auto-advances with Next-Call Delay $\rightarrow$ Next Lead |
| `BUSY` | Remote line busy signal or rejected | Auto-advances with Next-Call Delay $\rightarrow$ Next Lead |
| `FAILED` | Carrier failure (insufficient balance, network dropped) | Records failure $\rightarrow$ Next-Call Delay $\rightarrow$ Next Lead |
| `CANCELLED` | Agent clicked Hangup while ringing | Clears ring timeout immediately $\rightarrow$ Advances to next lead |

---

## 4. Root Cause of Next-Lead Dispatch Failure

### Why "Nothing Happened" previously:
1. `DispositionModal` saved to `POST /api/logs/update`, but its callback `onSaveSuccess` was empty and dropped the response.
2. `LeadQueue` was never informed when disposition was completed, so the auto-dialing progression remained permanently stalled in limbo.
3. `LeadQueue` attempted to guess the next lead using local `currentIndex + 1` array indices instead of using the backend-authoritative queue engine.

### The Resolution:
- `DispositionModal` captures the full response from `POST /api/logs/update` containing `nextLeadId` and `nextLead`.
- `App.tsx` routes `lastDispositionSaved` into `LeadQueue`.
- `LeadQueue` immediately triggers the **Inter-Call Delay** countdown and dispatches the exact `nextLeadId`.

---

## 5. Dual Independent Timers Architecture

The system strictly decouples the two timers:

1. **Ring Timeout** (`15s, 25s, 35s, 45s, 60s`):
   - Controls active ringing time for the **current call**.
   - If the remote party does not answer within this limit, the call automatically terminates as `NO_ANSWER`.
   - **Cancelled immediately** if the agent manually hangs up or if the call connects.

2. **Next-Call Delay** (`0s, 1s, 2s, 3s, 5s, 10s`):
   - Controls cooldown delay **between calls** after the previous lead's workflow/disposition is saved.
   - For `0s`: Dials the next lead instantly.
   - For `3s`: Displays on-screen live countdown with **[ Dial Now ]** (skip) and **[ Pause ]** buttons.
   - Persisted in browser localStorage (`octal_inter_call_delay`).

---

## 6. Manual Hangup Behavior
- When the agent clicks **Hangup** at any second (e.g., 0:10):
- Native hangup command dispatches to Android.
- Ring timeout is immediately cleared.
- Session moves directly to disposition and inter-call delay without waiting for the 35s ring timeout.

---

## 7. Protected Telephony Invariant Status

```powershell
git diff HEAD~1 -- application_octal_dialer/lib/screens/calling_screen.dart
git diff HEAD~1 -- application_octal_dialer/android/app/src/main/kotlin/com/octal/dialer/octal_dialer/MainActivity.kt
```
- **Result**: **0 bytes changed (100% Preserved & Clean)**. All coordination and outcome logic was resolved in the backend/frontend coordination layer.

---

## 8. Laptop Audio Architecture Status

- **Current Scope**: Outbound GSM Auto Dialer using paired Android handset radio.
- **Audio Architecture Note**:
  - Outbound phone calls currently use the phone's physical speaker/microphone or Bluetooth headset connected to the phone.
  - To route live call audio directly through the laptop's headset/microphone in a future update: WebRTC media audio streaming or an Android `AudioRecord` / `AudioTrack` duplex bridge would be required between the Flutter app and the browser.

---

## 9. Build & Test Verification

```text
1. test_call_flow_and_outcomes.js:         3 / 3 Suites Passed (100%)
2. test_auto_dialer_complete.js:           52 / 52 Passed (100%)
3. test_tenant_isolation.js:               19 / 19 Passed (100%)
4. test_public_pairing_architecture.js:    16 / 16 Passed (100%)
5. Backend TypeScript Build (tsc):         0 Errors (PASSED)
6. Frontend Vite Production Build:         0 Errors (PASSED)
```

---

## 10. Git Checkpoint SHA

- **Commit SHA**: `83be622830f3d61184a29a43a0553787723fe9e4` (`83be622`)
- **Commit Message**: `fix: stabilize auto dial call outcomes and next lead flow`
- **Status**: Committed Locally (Not Pushed to Remote as requested).
