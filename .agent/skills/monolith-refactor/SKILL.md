---
name: monolith-refactor
description: Safe playbook for decomposing the oversized files in Octal Dialer — SuperAdminPortal.tsx (4679), UsersAndRolesView.tsx (2930), CRMWorkspacePage.tsx (2506), App.tsx (2467), CRMModals.tsx (2062) and backend server.ts (13251) — into focused subcomponents and Express routers without breaking isLight theming, prop drilling, Socket.IO state or TypeScript types. Use this whenever a task would add lines to any file already over 600 lines, when asked to split or refactor a large component or server.ts, or when route-level code-splitting is needed to shrink the Vite bundle.
---

# Monolith Refactor Playbook

Past ~1,000 lines an agent cannot hold a file in view and starts editing by
pattern match. That is how the 768px breadcrumb collision and the `/api/dnc`
route drift happened. **Extraction is a correctness measure here, not cosmetics.**

## Legacy Monolith Exemption & Scope
- **Exemption:** Existing monoliths (`server.ts`, `App.tsx`, `CRMWorkspacePage.tsx`, etc.) are grandfathered in.
- **Do NOT Refactor Unprompted:** NEVER attempt to decompose or refactor these files during bug fixes or routine feature work.
- **Only When Explicitly Requested:** Use this playbook ONLY when the user explicitly commands: *"Extract or refactor this specific section/router"*.
- **New Feature Domain Rule:** When adding a brand-new major feature domain, write a new module (<600 lines) and import/mount it, leaving existing inline code untouched.

## Current offenders

| File | Lines | Target shape |
|---|---|---|
| `backend/src/server.ts` | 13,251 | domain routers in `src/*Routes.ts` |
| `frontend/.../SuperAdminPortal.tsx` | 4,679 | `admin/sections/Admin*.tsx` |
| `backend/src/databaseManager.ts` | 3,585 | `src/db/<domain>Repo.ts` |
| `frontend/.../settings/UsersAndRolesView.tsx` | 2,930 | `settings/users/*` |
| `frontend/.../crm/CRMWorkspacePage.tsx` | 2,506 | `crm/workspace/*` tab panels |
| `frontend/src/App.tsx` | 2,467 | shell only; views lazy-loaded |
| `backend/src/authManager.ts` | 2,153 | split token / password / permission |
| `frontend/.../crm/CRMModals.tsx` | 2,062 | one modal per file under `crm/modals/` |

## Non-negotiable: behaviour must not change

This is a **pure move**. No renames of props, no "while I'm here" improvements,
no signature changes, no reformatting of untouched lines. A reviewer must be
able to diff and see only relocation. If you want to improve something, do it in
a separate step after the move is verified.

---

## A. Frontend component extraction

### 1. Map before cutting
List the top-level JSX blocks and which state each reads. A block is extractable
when it reads few state values and sets few. If it touches ten `useState`s, you
are looking at the wrong seam — find a narrower one.

### 2. Preserve the `isLight` contract
`isLight` is threaded as a **prop** through 48 files from `App.tsx:815`. There is
no context provider, no `dark:` strategy. Every extracted component must:

```tsx
interface Props {
  isLight?: boolean;      // ALWAYS present, optional with a default
  // ...the exact state/handlers it needs, nothing more
}
export const Thing: React.FC<Props> = ({ isLight = false, ... }) => { ... };
```

Never introduce a theme context "to avoid drilling" — that forks the theming
system and is explicitly forbidden.

### 3. Lift state up, pass handlers down
Keep `useState` in the parent; pass values + setters. Do not duplicate state in
the child and sync it — that creates two sources of truth. Only move a
`useState` into the child when **nothing** outside reads it.

### 4. One socket
Socket.IO lives in `hooks/useSocket.ts`. Extracted components receive socket
data as props or call the existing hook. **Never** instantiate a second client —
duplicate listeners double-handle `dialer:hot_lead_queued` and corrupt queue
state.

### 5. Types go to `types/`
Interfaces shared by parent and child move to `types/index.ts` (or `crm.ts`) and
are imported by both. Do not re-declare a shape in two files.

### 6. Verify after every extraction
```bash
npm --prefix website_octal_dialer/frontend exec tsc -- --noEmit
```
Then run `.agent/skills/ui-browser-verify` on the affected screen at all four
viewports. A pure move that passes typecheck can still break layout.

### Order of operations (safe sequence)
1. Create the new file with the moved JSX + a props interface.
2. Import it in the parent and render it, **leaving the original block in place
   but commented out** — not deleted.
3. Typecheck. Browser-verify. Compare against the commented original.
4. Only then delete the commented block.
5. Commit this extraction alone, before starting the next one.

---

## B. `server.ts` → Express routers

Follow the three routers that already exist: `uniboxRoutes.ts`,
`facebookPosterRoutes.ts`, `analyticsRoutes.ts`.

```ts
// src/<domain>Routes.ts
import { Router, Request, Response } from 'express';
import dbAdapter from './db/dbAdapter';
import { getTenantId } from './authManager';

export const domainRouter = Router();
const db = dbAdapter;

domainRouter.get('/things', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);                 // ALWAYS
    const rows = await db.queryAll(
      'SELECT * FROM things WHERE "tenantId" = $1', [tenantId]   // ALWAYS
    );
    res.json(rows || []);
  } catch (err: any) {
    res.status(500).json({ error: err.message });      // never catch {}
  }
});
```

Mount with the guards intact:
```ts
app.use('/api', requireAuth, domainRouter);
```

### Rules when moving a route out of `server.ts`
- **Keep the URL byte-identical.** Route-path drift is the `/api/dnc` 404 class
  of bug. If the frontend calls `/api/dnc`, the router must still answer
  `/api/dnc` — alias if the internal name differs.
- Carry `requireAuth`, `requirePermission([...])` and `requireModule` across
  unchanged. Dropping a guard during a move is a privilege escalation.
- Keep `getTenantId(req)` and the `"tenantId"` filter in every query.
- Move the route **and** its helpers; do not leave a helper behind in
  `server.ts` and import it back — that keeps the monolith alive.
- Grep the frontend for the path before and after to prove nothing broke:
  ```bash
  grep -rn "'/api/things'" website_octal_dialer/frontend/src
  ```

### Verify
```bash
npm --prefix website_octal_dialer/backend exec tsc -- --noEmit
npm --prefix website_octal_dialer/backend run test:security
npm --prefix website_octal_dialer/backend run test:web-hardening
npm --prefix website_octal_dialer/backend run test:e2e     # proves routes still answer
```
`test:e2e` boots a real server and the integration suites hit real URLs — it is
the only thing that catches a moved route that no longer responds.

---

## C. Route-level code splitting (bundle target < 800 kB)

Build is currently **1,667 kB**. In `App.tsx`:

```tsx
const SuperAdminPortal   = React.lazy(() => import('./components/SuperAdminPortal'));
const CRMWorkspacePage   = React.lazy(() => import('./components/crm/CRMWorkspacePage'));
const ReportsPage        = React.lazy(() => import('./components/ReportsPage'));
const AutoEmailer        = React.lazy(() => import('./components/AutoEmailer'));
const FacebookAutoPoster = React.lazy(() => import('./components/FacebookAutoPoster'));

<Suspense fallback={<div className="p-8 text-zinc-400 text-xs font-mono">Loading…</div>}>
  {activeTab === 'crm' && <CRMWorkspacePage isLight={isLight} /* … */ />}
</Suspense>
```

- **Never lazy-load** `App.tsx`, `LoginScreen`, `ErrorBoundary`, or anything on
  the first paint path.
- A lazy component must be a `default` export. If it is currently a named export
  only, add a default alongside it — do not remove the named one.
- The fallback uses the design tokens, not a bare spinner.
- Confirm the split landed:
  ```bash
  npm --prefix website_octal_dialer/frontend run build
  ```
  Read the chunk table. Main chunk must drop. If it did not, the import is still
  being pulled in eagerly somewhere — grep for a static `import` of the same
  module.

---

## D. Stop conditions

Abandon the extraction and report back if:
- Typecheck errors exceed ~5 after a pure move — the seam is wrong, pick another.
- You need to change a prop name or signature to make it fit.
- The block reads more than ~6 pieces of parent state.
- A test that passed before the move now fails and the cause is not obvious
  within one attempt.

Leaving a monolith intact is better than leaving it half-cut.
