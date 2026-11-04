---
name: motion-and-svg-choreography
description: Spring physics parameters, 60fps compositor rules, animated SVG data beams, staggered scroll reveals, and prefers-reduced-motion choreography for web interfaces.
---

# Motion and SVG Choreography

Smooth, natural motion gives web products an organic, tactile feel. Jerky ease curves and un-optimized layout recalculations ruin performance. This skill establishes the motion parameters, SVG signal beam architectures, and hardware-accelerated choreography for high-craft applications.

---

## 1. Canonical Spring Physics Configurations

Use these calibrated spring configurations across all animations instead of linear/ease timings:

```typescript
export const MOTION_SPRINGS = {
  // Snappy micro-interactions: tooltips, buttons, small chips
  snappy: { type: 'spring', stiffness: 400, damping: 30 },

  // Standard UI transitions: card entries, drawer slide-ins, modal pops
  standard: { type: 'spring', stiffness: 260, damping: 25 },

  // Gentle float / background element movement
  gentle: { type: 'spring', stiffness: 120, damping: 20 },

  // Bouncy accent feedback: success checkmarks, badge pops
  bouncy: { type: 'spring', stiffness: 350, damping: 15 },
} as const;
```

---

## 2. The 60 FPS Compositor Rule

To maintain uninterrupted 60–120 FPS on mobile and low-power hardware:
- **ONLY animate `transform` (`x`, `y`, `scale`, `rotate`) and `opacity`**.
- **NEVER animate layout properties**: `width`, `height`, `margin`, `padding`, `top`, `left`, `right`, `bottom`. Animating layout triggers browser reflows and frame drops.
- Use `will-change: transform` sparingly on active animating elements.

---

## 3. Animated SVG Signal Beams (Live Data Flow)

For telephony pipelines, WebSockets, or live data ingestion, animated SVG paths with dynamic dash offsets visualize flow across nodes:

```tsx
import React from 'react';

interface SignalBeamProps {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  color?: string;
}

export const SignalBeam = ({ startX, startY, endX, endY, color = '#f59e0b' }: SignalBeamProps) => {
  // Cubic bezier curve path
  const midX = (startX + endX) / 2;
  const pathData = `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;

  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
      <defs>
        <linearGradient id="beamGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={color} stopOpacity="0" />
          <stop offset="50%" stopColor={color} stopOpacity="1" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Static track */}
      <path d={pathData} fill="none" stroke="#27272a" strokeWidth="1.5" strokeDasharray="4 4" />

      {/* Animated signal pulse */}
      <path
        d={pathData}
        fill="none"
        stroke="url(#beamGradient)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="40 200"
        className="animate-signal-flow"
      />
    </svg>
  );
};
```

CSS keyframe for smooth hardware flow:
```css
@keyframes signalFlow {
  from { stroke-dashoffset: 240; }
  to { stroke-dashoffset: 0; }
}
.animate-signal-flow {
  animation: signalFlow 2s linear infinite;
}
```

---

## 4. Staggered Scroll Reveals

Wrap bento items or card grids in staggered viewport containers:

```tsx
import { motion } from 'framer-motion';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 260, damping: 25 },
  },
};

export const StaggeredGrid = ({ children }: { children: React.ReactNode }) => (
  <motion.div
    variants={containerVariants}
    initial="hidden"
    whileInView="visible"
    viewport={{ once: true, margin: '-50px' }}
    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
  >
    {React.Children.map(children, (child) => (
      <motion.div variants={itemVariants}>{child}</motion.div>
    ))}
  </motion.div>
);
```

---

## 5. Accessibility & `prefers-reduced-motion`

Always respect user accessibility settings to prevent motion sickness:

```tsx
import { useReducedMotion } from 'framer-motion';

export const AccessibleMotionCard = ({ children }: { children: React.ReactNode }) => {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={shouldReduceMotion ? { duration: 0.1 } : { type: 'spring', stiffness: 260, damping: 25 }}
    >
      {children}
    </motion.div>
  );
};
```
