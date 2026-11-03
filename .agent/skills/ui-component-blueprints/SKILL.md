---
name: ui-component-blueprints
description: Canonical React + Tailwind JSX blueprints for Octal Dialer. Use this skill BEFORE building any new UI view, card grid, subtab strip, 3-pane master-detail view, table, modal, or slide-in drawer so layouts never break at 768px or drift from the design system.
---

# Octal Dialer — UI Component Blueprints

Always build from these proven structural patterns rather than inventing ad-hoc layouts.

## 1. Responsive Card Grid (Anti-Crowding at 768px)
Used in `AutoEmailer.tsx` and dashboard metric rows. Never use fixed pixel widths or `grid-cols-3` at `md:` because a pinned sidebar at `768px` leaves only ~520px of content width.

```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
  {items.map((item) => (
    <div
      key={item.id}
      className={`p-4 rounded-2xl border transition-colors ${
        isLight
          ? 'bg-white border-zinc-200 hover:border-zinc-300 text-zinc-900'
          : 'bg-[#121215] border-[#18181b] hover:bg-[#27272a]/40 text-white'
      }`}
    >
      {/* Card content */}
    </div>
  ))}
</div>
```

## 2. Sticky 1-Tap Mobile/Tablet Pill Subtab Strip
Used in `AutoEmailer.tsx` and `FacebookAutoPoster.tsx` so mobile/tablet users switch subviews in one tap without opening the main drawer.

```tsx
<div className="sticky top-0 z-10 flex items-center gap-1.5 overflow-x-auto no-scrollbar py-2 px-1 border-b border-[#18181b] bg-[#09090b]/95 backdrop-blur">
  {TABS.map((tab) => {
    const active = activeSubTab === tab.id;
    return (
      <button
        key={tab.id}
        type="button"
        onClick={() => setActiveSubTab(tab.id)}
        className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
          active
            ? 'bg-amber-500 text-black'
            : isLight
            ? 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            : 'bg-[#121215] text-zinc-400 hover:bg-[#27272a] hover:text-white'
        }`}
      >
        {tab.label}
      </button>
    );
  })}
</div>
```

## 3. 3-Pane Master-Detail with Container-Scoped Scroll (OmnichannelUnibox Pattern)
Desktop (`lg:`): 3 panes side-by-side (Thread List | Message Stream | Prospect Intel).

Mobile/Tablet (`< lg`): Single active pane; selecting a thread hides the list and shows `<ArrowLeft>` ("Back to Threads") plus `<Info>` (Prospect Intel overlay).

Mandatory Scroll Rule: Always scroll the message container ref, never `scrollIntoView()`:

```tsx
const messagesContainerRef = useRef<HTMLDivElement | null>(null);

const scrollToBottom = useCallback(() => {
  const el = messagesContainerRef.current;
  if (!el) return;
  el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
}, []);
```

## 4. Contained Data Table Wrapper
Wide tables must scroll inside their own container so `document.documentElement.scrollWidth` never exceeds `window.innerWidth`:

```tsx
<div className="w-full overflow-x-auto rounded-2xl border border-[#18181b] bg-[#121215]">
  <table className="w-full min-w-[640px] text-left border-collapse">
    <thead>
      <tr className="text-[10px] font-bold uppercase text-zinc-400 bg-[#121215] border-b border-[#18181b]">
        <th className="py-3 px-4">Lead</th>
        <th className="py-3 px-4">Status</th>
      </tr>
    </thead>
    <tbody className="divide-y divide-[#18181b] text-xs">
      {/* Rows */}
    </tbody>
  </table>
</div>
```

## 5. Async Action Button (No Double-Submits or Silent Failures)
Every mutation button must disable while pending, show a `Loader2` spinner, and render errors inline:

```tsx
<button
  type="button"
  disabled={isSubmitting}
  onClick={handleSubmit}
  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-xs font-bold transition-colors"
>
  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
  <span>{isSubmitting ? 'Saving...' : 'Save Changes'}</span>
</button>
```
