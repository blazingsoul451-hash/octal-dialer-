---
trigger: glob
globs: "website_octal_dialer/frontend/**, src/**/*.tsx, src/**/*.ts"
description: "Frontend design tokens, component inventory, responsive layout physics, and bundle budget."
---

# Octal Dialer — Frontend UI & Design System Rules

## 1. Pinned Design Tokens (Never Invent New Values)
- **Dark Surfaces:** Page bg `#09090b` | Card bg `#121215` | Border `#18181b` | Hover `#27272a`
- **Primary Accent:** `amber-500` (primary action) | `amber-400` (hover)
- **Typography Colors:** `white` (headings) | `zinc-400` (secondary) | `zinc-500` (muted)
- **Semantic Status:** `emerald-400` (ok/online) | `red-400` (error/offline) | `amber-400` (warning/pending)
- **Border Radius:** `rounded-xl` (inputs, buttons, pills) | `rounded-2xl` (cards, panels, modals)
- **Icons:** `lucide-react` ONLY (`w-4 h-4` standard inline, `w-3.5 h-3.5` dense tables/pills)
- **Status Pills:** `px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase`
- **Table Headers:** `text-[10px] font-bold uppercase bg-[#121215] border-b border-[#18181b]`
- **Form Labels:** `text-[10px] uppercase font-bold tracking-wider`
- **Light Mode Contract:** Thread the existing `isLight?: boolean` prop from `App.tsx`. Never introduce a second theme context or `dark:` classes. Never render low-contrast `slate-400` text on `slate-100` backgrounds.

## 2. Component Inventory (Reuse First, Never Duplicate)
Before creating any component, inspect `src/components/`:
- **Shell & Auth:** `App.tsx`, `LoginScreen.tsx`, `ErrorBoundary.tsx`, `ConnectionPanel.tsx`
- **CRM & Pipeline:** `crm/CRMWorkspacePage.tsx`, `crm/CRMModals.tsx` (put new modals under `crm/modals/`), `crm/CompanyProfileDrawer.tsx`, `LeadQueue.tsx`, `CallLog.tsx`, `DncPanel.tsx`, `ImportPanel.tsx`
- **Outreach & Messaging:** `OmnichannelUnibox.tsx`, `AutoEmailer.tsx`, `FacebookAutoPoster.tsx`
- **Scrapers & Analytics:** `ScraperFilesPanel.tsx`, `ReportsPage.tsx`
- **Admin & Settings:** `settings/UsersAndRolesView.tsx`, `SuperAdminPortal.tsx`
- **Socket Hook:** `hooks/useSocket.ts` (single Socket.IO client instance—never instantiate a second socket).

## 3. Responsive Physics & Mandatory Viewports
- Every UI change MUST be verified via `.agent/skills/ui-browser-verify/SKILL.md` across:
  1. `375x812` (Mobile)
  2. `768x1024` with sidebar **EXPANDED/PINNED**
  3. `768x1024` with sidebar **COLLAPSED**
  4. `1024x768` (Laptop)
  5. `1440x900` (Desktop — both Dark and Light mode)
- **Scroll Containment:** Page body (`document.documentElement.scrollWidth`) must never exceed `window.innerWidth`. Wide tables, kanban boards, and logs must sit inside an `overflow-x-auto` wrapper. Auto-scrolling feeds must use `containerRef.current.scrollTo()`, never `scrollIntoView()`.
- **Test Hooks:** Preserve `data-testid` attributes on `sidebar`, `sidebar-toggle`, `breadcrumb`, `phone-status`, `tenant-selector`, `theme-toggle`, and `thread-card`.

## 4. Bundle Budget (Under 800 kB)
Main Vite chunk must stay under 800 kB. Lazy-load heavy route views (`SuperAdminPortal`, `CRMWorkspacePage`, `ReportsPage`, `AutoEmailer`, `FacebookAutoPoster`) via `React.lazy` and `Suspense`. Use `.agent/skills/ui-component-blueprints/SKILL.md` and the `shadcn-reference-repo` / `dub-saas-ui-repo` MCPs when constructing new UI primitives.
