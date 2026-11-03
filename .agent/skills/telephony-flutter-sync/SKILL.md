---
name: telephony-flutter-sync
description: Cross-platform telephony contract between the Web Dialer (ConnectionPanel / Dialer Console), Backend (server.ts Socket.IO & REST), Android GSM Dialer APK (application_octal_dialer), and Desktop Agent (desktop_octal_agent). Use whenever modifying QR pairing, device heartbeats, call queue state, DTMF, or call logs.
---

# Telephony & Flutter Cross-Platform Sync Protocol

Octal Dialer bridges browser actions to live carrier GSM calls on Android (`application_octal_dialer`) and `desktop_octal_agent`. Changing a JSON key or Socket event name on the web backend without updating Dart models breaks live calling.

## 1. Protected Handshake & Telemetry Contracts
Never rename or drop fields in these flows without updating all three targets (`website_octal_dialer/backend`, `website_octal_dialer/frontend`, `application_octal_dialer`):
1. **QR Device Pairing:** Web generates pairing token/QR SVG -> Android scans QR -> authenticates socket/REST session -> binds device to `tenantId` + `userId`.
2. **Device Heartbeat & Status Pill:** Heartbeat payload drives the header `[data-testid="phone-status"]` pill (`Phone Online` / `Phone Offline`).
3. **Outbound Dial & Queue Dispatch:** Web Dialer / `dialer:hot_lead_queued` -> dispatches phone number + `leadId` + `tenantId` to paired Android device -> Android initiates carrier GSM call -> reports call state transitions (`ringing`, `active`, `ended`, duration, outcome) back to backend.

## 2. Mandatory Verification When Touching Telephony
Whenever any telephony route, socket event, or Dart file is modified, run:
```bash
npm test                                                           # Backend call flow + outcomes
npm --prefix website_octal_dialer/backend run test:e2e
cd application_octal_dialer && flutter analyze                     # Must output: No issues found!
cd desktop_octal_agent && flutter analyze                          # Must output: No issues found!
```
