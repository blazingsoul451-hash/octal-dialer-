---
name: typography-and-swiss-grid-mastery
description: World-class typography rules, fluid clamp formulas, optical display tracking, tabular numbers discipline, and 12-column Swiss architectural grid layouts with corner crosshairs.
---

# Typography and Swiss Grid Mastery

Precision typography and structural grid geometry differentiate amateur sites from tier-1 engineering products. This skill defines font pairing stacks, fluid scaling formulas, optical tracking rules, and Swiss architectural grid layouts.

---

## 1. Font Pairing Matrix & Roles

| Role | Font Family | Tailwind Class | Usage Context |
|---|---|---|---|
| **Primary Sans** | Geist Sans / Inter | `font-sans` | Body copy, general UI labels, navigation links, modals |
| **Display Heading** | Plus Jakarta Sans / Geist Display | `font-sans font-extrabold tracking-[-0.035em]` | Hero title, section headers, bento card headlines |
| **Editorial Accent** | Instrument Serif / Newsreader | `font-serif italic font-normal` | Contrasting pull-words in headings (e.g., "Outreach at *cellular* scale") |
| **Telemetry & Code** | JetBrains Mono / Geist Mono | `font-mono tabular-nums` | Latency (ms), phone numbers, SIM slots, JSON payloads, financial figures |

---

## 2. Fluid Typography & Optical Tracking Rules

### Heading Display Metrics
Large headings require negative letter-spacing and tight line-height to maintain optical tension:
- **Hero Title (`H1`)**: `text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-[-0.04em] leading-[1.05] text-balance`
- **Section Heading (`H2`)**: `text-2xl sm:text-4xl font-bold tracking-[-0.03em] leading-[1.15] text-balance`
- **Card Title (`H3`)**: `text-lg sm:text-xl font-semibold tracking-[-0.02em] leading-snug`
- **Micro Label (`Kicker`)**: `text-[10px] font-mono font-bold tracking-widest uppercase`

### Fluid Clamp Formula
For clamp-based text scaling without sudden breakpoint jumps:
```css
/* Responsive Hero Title: scales smoothly from 36px at 375px viewport to 72px at 1440px */
font-size: clamp(2.25rem, 1.25rem + 3.3vw, 4.5rem);
```

In Tailwind classes:
```tsx
<h1 className="text-[clamp(2.25rem,1.25rem+3.3vw,4.5rem)] font-extrabold tracking-[-0.04em] leading-[1.05] text-balance">
  Autonomous Cellular Telephony <span className="font-serif italic font-normal text-amber-400">Re-engineered</span>.
</h1>
```

---

## 3. Numeric Discipline: `tabular-nums` Everywhere

In tables, counters, dashboards, and latency monitors, proportional digits cause distracting visual jitter when values update.
**Rule:** Every metric, price, timestamp, and dialer counter must use `tabular-nums` and `font-mono`.

```tsx
// Anti-pattern: Jittery number rendering
<span className="font-sans text-xl font-bold">$1,249 / mo</span>

// Production pattern: Stable tabular mono rendering
<span className="font-mono tabular-nums text-xl font-bold tracking-tight">
  $1,249<span className="text-sm font-sans font-normal text-zinc-400">/mo</span>
</span>
```

---

## 4. The 12-Column Swiss Grid & Crosshair (`+`) Borders

The Swiss Grid pattern provides a rigid, high-tech architectural structure with visible 1px borders and '+' crosshair alignment markers at intersections.

### Canonical Crosshair Blueprint
```tsx
interface SwissGridProps {
  children: React.ReactNode;
  isLight?: boolean;
}

export const SwissGridSection = ({ children, isLight }: SwissGridProps) => {
  const borderColor = isLight ? 'border-slate-200' : 'border-[#18181b]';
  const crosshairColor = isLight ? 'text-slate-400' : 'text-zinc-600';

  return (
    <div className={`relative border-y ${borderColor} py-16 sm:py-24`}>
      {/* Corner crosshair decorations */}
      <div className={`absolute -top-2.5 -left-2.5 font-mono text-xs select-none ${crosshairColor}`}>+</div>
      <div className={`absolute -top-2.5 -right-2.5 font-mono text-xs select-none ${crosshairColor}`}>+</div>
      <div className={`absolute -bottom-2.5 -left-2.5 font-mono text-xs select-none ${crosshairColor}`}>+</div>
      <div className={`absolute -bottom-2.5 -right-2.5 font-mono text-xs select-none ${crosshairColor}`}>+</div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 divide-y md:divide-y-0 md:divide-x ${borderColor}`}>
          {children}
        </div>
      </div>
    </div>
  );
};
```

---

## 5. Architectural Anti-Patterns Checklist

- ❌ **Loose tracking on large display headings**: Never use `tracking-normal` or `tracking-wide` on headings > 32px. It looks unpolished and disconnected.
- ❌ **Ragged multiline headlines**: Always include `text-balance` on `h1`, `h2`, and subtitles to eliminate orphan words.
- ❌ **Proportional digits in counters**: Never display dynamic counters without `tabular-nums`.
- ❌ **Broken 768px layout**: Always test the 12-column grid at `768px` (tablet) to ensure clean 2-column or 1-column collapse.
