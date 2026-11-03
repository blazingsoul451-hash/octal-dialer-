---
name: api-socket-contract
description: Full-stack API route parity, JSON response normalization, and Socket.IO room/cleanup contract. Use whenever adding or editing an Express endpoint, a frontend fetch/axios call, or any Socket.IO event handler.
---

# API & Socket.IO Full-Stack Contract

## 1. Zero Route Drift
Before writing any `fetch('/api/...')` in `frontend/src`, grep `backend/src` to verify the exact path and HTTP verb exist and are mounted:
```bash
grep -rn "/api/your-path" website_octal_dialer/backend/src
```
If aliasing a route (such as `/api/dnc` and `/api/suppression-list`), mount both paths on the same Express handler across GET, POST, POST /import, and DELETE /:id.

## 2. Defensive Array & Payload Normalization
Frontend components must never crash with `data.map is not a function` if an endpoint wraps arrays in `{ items, data, rows }` or returns an error object:

```tsx
const raw = await res.json();
const list = Array.isArray(raw)
  ? raw
  : Array.isArray(raw?.items)
  ? raw.items
  : Array.isArray(raw?.data)
  ? raw.data
  : [];
```

## 3. Socket.IO Single-Instance & Cleanup Contract
Frontend: Never call `io(...)` inside a feature component. Always consume the shared socket from `src/hooks/useSocket.ts`.

Mandatory Listener Cleanup: Every `socket.on(event, handler)` inside a `useEffect` MUST return `() => { socket.off(event, handler); }` with the exact same handler reference so hot reloads and tab switches never duplicate queued leads (`dialer:hot_lead_queued`) or double-append Unibox messages.

Backend Room Isolation: Every backend emit (`dialer:*`, `unibox:*`, `device:heartbeat`, `scraper:progress`) must target the authenticated tenant room (`io.to(`tenant:${tenantId}`).emit(...)`), never `io.emit(...)`.
