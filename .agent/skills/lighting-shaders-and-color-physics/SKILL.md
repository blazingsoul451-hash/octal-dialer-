---
name: lighting-shaders-and-color-physics
description: Shaders, radial ambient spotlights, 1px specular top highlights, mouse-following card lights, SVG noise grain overlays, and dual-theme lighting physics for tier-1 web interfaces.
---

# Lighting Shaders and Color Physics

Flat `#000000` or `#121215` rectangles feel dull and uncrafted. Real high-end web interfaces (Linear, Apple, Vercel, Stripe) simulate realistic physical light: ambient spotlights, 1px specular bevels, micro-grain texture, and gradient edge reflections.

---

## 1. The 1px Specular Top Highlight

In physical objects, top edges catch overhead ambient light while bottom edges remain in shadow.
**Rule:** Apply a 1px top specular highlight (`border-t border-white/15` or `shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]`) to elevated dark cards.

```tsx
export const SpecularCard = ({ children, isLight }: { children: React.ReactNode; isLight?: boolean }) => (
  <div
    className={`relative rounded-2xl p-6 transition-all duration-200 ${
      isLight
        ? 'bg-white border border-slate-200 shadow-sm hover:shadow-md'
        : 'bg-[#121215] border border-[#18181b] border-t-white/15 shadow-[0_12px_24px_-10px_rgba(0,0,0,0.5)] hover:border-[#27272a]'
    }`}
  >
    {children}
  </div>
);
```

---

## 2. Ambient Hero Spotlights

Create depth in hero sections using centered radial conic gradients masked by opacity:

```tsx
export const HeroAmbientGlow = ({ isLight }: { isLight?: boolean }) => (
  <div className="absolute inset-0 pointer-events-none overflow-hidden select-none -z-10">
    <div
      className={`absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] blur-[120px] rounded-full opacity-30 transition-opacity ${
        isLight
          ? 'bg-gradient-to-b from-amber-200/50 via-slate-200/20 to-transparent'
          : 'bg-gradient-to-b from-amber-500/20 via-orange-500/5 to-transparent'
      }`}
    />
  </div>
);
```

---

## 3. Mouse-Following Spotlight Card

Cards that dynamically light up according to cursor position provide tangible tactile feedback:

```tsx
import React, { useState } from 'react';

export const InteractiveSpotlightCard = ({ children, isLight }: { children: React.ReactNode; isLight?: boolean }) => {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <div
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`relative overflow-hidden rounded-2xl border p-6 transition-colors ${
        isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#121215] border-[#18181b] text-white'
      }`}
    >
      {/* Dynamic Cursor Spotlight Layer */}
      <div
        className="pointer-events-none absolute -inset-px transition-opacity duration-300"
        style={{
          opacity: isHovered ? 1 : 0,
          background: isLight
            ? `radial-gradient(400px circle at ${pos.x}px ${pos.y}px, rgba(245,158,11,0.08), transparent 70%)`
            : `radial-gradient(450px circle at ${pos.x}px ${pos.y}px, rgba(245,158,11,0.12), transparent 70%)`,
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
};
```

---

## 4. SVG Noise Grain Overlay (Eliminating Color Banding)

Dark radial gradients often suffer from 8-bit monitor color banding (concentric rings). An ultra-subtle SVG noise layer dithers the gradient smoothly:

```tsx
export const NoiseGrainOverlay = () => (
  <svg className="pointer-events-none fixed inset-0 z-50 h-full w-full opacity-[0.025]" xmlns="http://www.w3.org/2000/svg">
    <filter id="noise">
      <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch" />
    </filter>
    <rect width="100%" height="100%" filter="url(#noise)" />
  </svg>
);
```

---

## 5. Dual-Theme Contrast Physics (`isLight` vs Dark OLED)

| Property | Dark Mode (`!isLight`) | Light Mode (`isLight`) |
|---|---|---|
| **Shadow Strategy** | Glow & Inset Highlights (`shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]`) | Diffuse Ambient Drop Shadows (`shadow-sm`, `shadow-md`) |
| **Border Contrast** | `#18181b` (subtle dark divider) | `border-slate-200` (crisp paper divider) |
| **Accent Saturation** | `text-amber-400` / `bg-amber-500` (high luminescence) | `text-amber-600` / `bg-amber-500 text-black` |
| **Hover Transitions** | Elevate background to `#27272a` | Elevate background to `bg-slate-50` or `border-slate-300` |
