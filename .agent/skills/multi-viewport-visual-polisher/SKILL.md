---
name: multi-viewport-visual-polisher
description: Mandatory 5-viewport verification protocol (375px, 768px pinned/unpinned, 1024px, 1440px), zero horizontal overflow rules, 44px touch target ergonomics, and responsive drawer navigation.
---

# Multi-Viewport Visual Polisher

Flawless visual execution requires strict multi-device testing. Breakpoints often hide subtle regressions: text collisions at 768px tablet widths, accidental horizontal scrolling from unmasked ambient glows, or unclickable 24px touch targets on mobile. This skill enforces bulletproof responsive physics.

---

## 1. The Mandatory 5-Viewport Matrix

Every page, layout alteration, or new component must be verified across five critical physical states:

| Viewport | Target Device | Critical Verification Focus |
|---|---|---|
| **375px** | iPhone SE / Mobile | Single column stack, hamburger drawer, zero horizontal overflow, 44px tap targets |
| **768px (Pinned)** | iPad (Sidebar Expanded) | Content width is only ~520px. Ensure tables scroll horizontally, cards don't collide |
| **768px (Rail)** | iPad (Sidebar 56px Rail) | Content width is ~712px. Ensure breadcrumbs do not overlap status pills |
| **1024px** | iPad Pro / Small Laptop | 2-to-3 column bento grids, sticky subtab headers visible |
| **1440px** | Desktop / 4K Monitor | Centered container (`max-w-7xl`), radial ambient lights clipped within canvas |

---

## 2. Zero Horizontal Overflow Rule (`document.documentElement.scrollWidth === innerWidth`)

The page body (`<html>` and `<body>`) must **never** scroll horizontally. Any horizontal scroll on mobile instantly breaks iOS gesture navigation (swipe to go back).

### Common Culprits & Fixes
1. **Unconstrained Radial Glows**:
   ```tsx
   // ❌ Anti-pattern: 800px width spills outside screen on mobile
   <div className="absolute w-[800px] h-[800px] -right-40" />

   // ✅ Production-grade: Wrapped in overflow-x-clip
   <div className="relative w-full overflow-x-clip">
     <div className="absolute w-[800px] h-[800px] -right-40 pointer-events-none select-none blur-3xl opacity-20" />
   </div>
   ```
2. **Infinite Marquees**:
   Always apply `overflow-hidden` or `overflow-x-clip` on the marquee container.
3. **Wide Data Tables**:
   Always enclose tables inside `<div className="w-full overflow-x-auto">`.

---

## 3. Touch Target Ergonomics: 44px Minimum

On touch devices (viewport width `< 1024px`), interactive elements with targets smaller than 44x44px result in missed taps and frustration.

```tsx
// ❌ Anti-pattern: 24px icon with no padding on mobile
<button onClick={onClose}><X className="w-4 h-4" /></button>

// ✅ Production-grade: 44x44px tactile bounding box
<button
  type="button"
  onClick={onClose}
  className="min-w-[44px] min-h-[44px] p-2.5 rounded-xl flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800/50 active:scale-95 transition-all cursor-pointer"
  aria-label="Close modal"
>
  <X className="w-4 h-4" />
</button>
```

---

## 4. Responsive Mobile Drawer Navigation Blueprint

Desktop navigation links must seamlessly transform into an accessible slide-in overlay drawer on mobile:

```tsx
import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';

export const ResponsiveHeader = ({ isLight }: { isLight?: boolean }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className={`sticky top-0 z-50 w-full border-b ${isLight ? 'bg-white/90 border-slate-200' : 'bg-[#09090b]/90 border-[#18181b]'} backdrop-blur`}>
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <a href="/" className="font-mono font-bold text-sm tracking-wider uppercase">OCTAL DIALER</a>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-6 text-xs font-mono uppercase text-zinc-400">
          <a href="#features" className="hover:text-amber-400 transition-colors">Architecture</a>
          <a href="#sandbox" className="hover:text-amber-400 transition-colors">Sandbox</a>
          <a href="#pricing" className="hover:text-amber-400 transition-colors">Pricing</a>
        </nav>

        {/* Mobile Hamburger Trigger (44x44px minimum) */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="md:hidden min-w-[44px] min-h-[44px] flex items-center justify-center p-2 rounded-xl text-zinc-300"
          aria-label="Toggle Navigation Menu"
        >
          {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile Slide-down Drawer */}
      {isOpen && (
        <div className={`md:hidden border-b px-6 py-6 flex flex-col gap-4 font-mono text-sm ${isLight ? 'bg-white border-slate-200' : 'bg-[#121215] border-[#18181b]'}`}>
          <a href="#features" onClick={() => setIsOpen(false)} className="py-2 text-zinc-300 hover:text-amber-400">Architecture</a>
          <a href="#sandbox" onClick={() => setIsOpen(false)} className="py-2 text-zinc-300 hover:text-amber-400">Sandbox</a>
          <a href="#pricing" onClick={() => setIsOpen(false)} className="py-2 text-zinc-300 hover:text-amber-400">Pricing</a>
          <a href="/login" className="py-3 px-4 rounded-xl bg-amber-500 text-black text-center font-bold uppercase text-xs">
            Launch Console
          </a>
        </div>
      )}
    </header>
  );
};
```

---

## 5. Viewport Verification Checklist

- [ ] Tested at `375px` in browser DevTools: no horizontal scrollbar visible.
- [ ] Tested at `768px` with sidebar expanded: cards wrap cleanly without clipping.
- [ ] No `element.scrollIntoView()` calls; all scrolling is container-scoped.
- [ ] Breadcrumbs hide cleanly (`hidden lg:flex`) on small screens to prevent collisions.
- [ ] Buttons and interactive chips meet 44x44px touch boundary.
