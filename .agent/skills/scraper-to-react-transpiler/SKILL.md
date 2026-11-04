---
name: scraper-to-react-transpiler
description: Protocol for transpiling scraped HTML, CSS, DOM snapshots, and Firecrawl markdown into modular, production-ready React 19 + Tailwind CSS components aligned with Octal Dialer tokens and isLight theming.
---

# Scraper-to-React Transpiler

This skill details the extraction, normalization, and conversion pipeline when turning scraped websites, external design systems, or Firecrawl output into idiomatic React 19 and Tailwind CSS.

---

## 1. Five-Stage Transpilation Pipeline

```
[Raw Scrape / HTML / Markdown]
         ↓  Stage 1: DOM & Layout Geometry Extraction (CSS Grid / Flex / Clamp)
[Structural Tree]
         ↓  Stage 2: Design Token & Palette Normalization (#09090b, #121215, #18181b, isLight)
[Tokenized AST]
         ↓  Stage 3: Atomic Section Decomposition (Hero, Sandbox, Bento, Proof, Pricing, FAQ)
[Modular React Components]
         ↓  Stage 4: Keyframe & CSS Transition to Framer Motion
[Interactive Production View]
```

---

## 2. Geometry & Layout Extraction Rules

1. **Inline Style Stripping**: Never carry over inline `style="width: 1240px; margin-left: 32px;"`. Convert all fixed widths to responsive Tailwind containers:
   - `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8` for full-width sections.
   - `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-6` for multi-column structures.
2. **CSS Grid Area Normalization**:
   - Replace legacy `grid-template-areas` with explicit responsive column spans:
   - Large card: `lg:col-span-8 md:col-span-12 col-span-1`
   - Narrow sidebar/metric card: `lg:col-span-4 md:col-span-6 col-span-1`
3. **Fluid Typography & Spacing Conversion**:
   - Replace scraped `calc(1rem + 2vw)` with Tailwind v4 fluid clamp or utility tokens:
   - `text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight`
   - Spacing: `py-16 sm:py-24 lg:py-32` for top-level sections.

---

## 3. Strict Token Normalization Table

Scraped values must be mapped to project tokens immediately:

| Scraped Pattern | Project Dark Token | Project Light Branch (`isLight`) |
|---|---|---|
| Background `#000`, `#111`, `#0a0a0a` | `bg-[#09090b]` | `bg-slate-50` or `bg-white` |
| Card / Dropdown `#1a1a1a`, `#222` | `bg-[#121215]` | `bg-white border-slate-200` |
| Border `#333`, `#2a2a2a`, `#444` | `border-[#18181b]` (hover `#27272a`) | `border-slate-200 hover:border-slate-300` |
| Primary Accent (blue, purple, etc.) | `bg-amber-500 hover:bg-amber-400 text-black` | `bg-amber-500 hover:bg-amber-400 text-black` |
| Primary Heading `#fff`, `#f5f5f5` | `text-white font-bold` | `text-slate-900 font-bold` |
| Subdued Text `#888`, `#999`, `#aaa` | `text-zinc-400` | `text-slate-600` |
| Monospace / Metric Counters | `font-mono tabular-nums text-zinc-300` | `font-mono tabular-nums text-slate-700` |

---

## 4. Atomic Decomposition Pattern

Decompose scraped layouts into single-responsibility components under 600 lines:

```tsx
// Example decomposition architecture
export interface LandingPageProps {
  isLight?: boolean;
}

export function ModernLandingPage({ isLight = false }: LandingPageProps) {
  return (
    <div className={`min-h-screen transition-colors duration-200 ${isLight ? 'bg-slate-50 text-slate-900' : 'bg-[#09090b] text-white'}`}>
      <HeroSection isLight={isLight} />
      <LogoMarqueeSection isLight={isLight} />
      <ProductSandboxSection isLight={isLight} />
      <BentoFeatureGrid isLight={isLight} />
      <MetricsComparisonSection isLight={isLight} />
      <PricingMatrixSection isLight={isLight} />
      <TechnicalFaqSection isLight={isLight} />
      <FooterSection isLight={isLight} />
    </div>
  );
}
```

---

## 5. CSS Animation to Framer Motion Translation

Replace raw CSS keyframes (`@keyframes float { ... }`) with hardware-accelerated spring animations:

```tsx
// Scraped CSS @keyframes float -> Framer Motion
import { motion } from 'framer-motion';

export const MotionPill = ({ label, isLight }: { label: string; isLight?: boolean }) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ type: 'spring', stiffness: 260, damping: 25 }}
    className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono font-medium border ${
      isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-[#121215] border-[#18181b] text-zinc-300'
    }`}
  >
    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
    {label}
  </motion.div>
);
```

---

## 6. Verification Checklist

- [ ] All external URLs pass through `safeExternalHref()` from `utils/safeUrl.ts`.
- [ ] No inline raw hex styles (`style={{ background: '#123' }}`).
- [ ] Every component takes `isLight?: boolean` and provides both visual paths.
- [ ] Responsive test across `375px`, `768px`, `1024px`, and `1440px`.
- [ ] No unhandled exceptions or empty `catch {}` blocks.
