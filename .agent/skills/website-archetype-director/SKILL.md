---
name: website-archetype-director
description: Taxonomy and design direction for 8 world-class website archetypes. Provides surface, border, typography, and lighting token matrices plus component mappings to magicui, motion-primitives, react-bits, and cult-ui.
---

# Website Archetype Director

This skill guides the architectural and visual classification for modern web applications and landing pages. Use this director when framing a new web project, redesigning an interface, or transpiling a competitive design into production-grade React 19 + Tailwind CSS.

---

## 1. The 8 World-Class Website Archetypes

| Archetype | Reference Benchmark | Defining Trait | Best Fit For |
|---|---|---|---|
| **1. Dark OLED Precision** | Linear, Resend, Raycast | Monochromatic `#09090b` ground, 1px `#18181b` grid, subtle specular top highlights, micro-typography | Developer tools, productivity apps, keyboard-first SaaS |
| **2. Live Signal & Voice Pipeline** | Bland AI, Retell AI, Vapi | Pulsing audio waveforms, active pipeline streams, glowing signal beams, real-time latency badges | AI voice agents, telephony, real-time WebSockets, streaming platforms |
| **3. Modular Bento & Interactive CRM** | Attio, Clay, Close | Modular card matrices, interactive micro-canvases, fluid drag/filter previews, rich metadata chips | Modern CRMs, database tools, modular SaaS dashboards |
| **4. High-Frequency Blueprint & Telemetry** | Vercel, Railway, Trigger.dev | Swiss 12-col architectural crosshairs (`+`), mono data tables, live log terminals, status matrices | Cloud infrastructure, CI/CD, queue orchestrators, dev APIs |
| **5. Kinetic Hardware & Scrollytelling** | Apple, Nothing Tech, Teenage Eng. | Canvas/3D scroll scrub, explosive exploded views, hardware macro photography, crisp tactile buttons | Cellular hardware, IoT devices, bespoke consumer tech, physical dialers |
| **6. Atmospheric Mesh & Enterprise Trust** | Stripe, Mercury, Ramp | Slow-moving radial gradients, glassmorphism cards, enterprise trust seals, high-contrast currency counters | Fintech, payments, multi-tenant banking, enterprise compliance |
| **7. Editorial Craft & High-Contrast Serif** | Anthropic, Instrument, The Verge | Display serifs (Instrument Serif), warm parchment or deep ink, literary editorial rhythm, oversized pull-quotes | Frontier AI research, creative studios, essayistic publications |
| **8. Neo-Brutalist High-Craft** | PostHog, Gumroad, Figma Config | Thick 2px hard borders, sharp corners (`rounded-none` or `rounded-lg`), bold primary blocks, quirky isometric glyphs | Open-source analytics, creator economy platforms, dev tools with attitude |

---

## 2. Token & Lighting Specification Matrix

| Archetype | Canvas Ground | Card / Panel | Canonical Border | Accent Glow / Beams | Typography Pairing |
|---|---|---|---|---|---|
| **Dark OLED Precision** | `#09090b` | `#121215` | `#18181b` (hover `#27272a`) | `amber-500` / `white/10` specular | Geist / Inter + JetBrains Mono |
| **Live Signal & Voice** | `#08090d` | `#0f121a` | `#1c2333` | `cyan-400` / `amber-400` beams | Plus Jakarta Sans + JetBrains Mono |
| **Modular Bento & CRM** | `#0a0a0c` | `#131318` | `#1e1e24` | `amber-500` / `violet-500` | Inter / Geist + Tabular Nums |
| **Blueprint & Telemetry** | `#050505` | `#0d0d0d` | `#1a1a1a` + crosshairs | `emerald-400` / `amber-500` | JetBrains Mono + Geist Sans |
| **Kinetic Scrollytelling** | `#000000` | `#0d0d0f` | `#222228` specular | `white` rim lights + lens flare | SF Pro / Inter Display |
| **Atmospheric Mesh** | `#090a10` | `#111422`/80 (glass) | `white/10` | Multicolored conic mesh (`indigo-violet`) | Plus Jakarta Sans + Inter |
| **Editorial Craft** | `#0c0a09` | `#171412` | `#292524` | Warm incandescent `amber-200/20` | Instrument Serif + Geist |
| **Neo-Brutalist Craft** | `#09090b` | `#18181b` | `#3f3f46` (2px hard) | High-saturation `amber-400` / `yellow-400` | Space Grotesk + JetBrains Mono |

---

## 3. Reference Mapping to Component Libraries (`.reference-ui/`)

When generating interfaces, adapt corresponding patterns from the high-craft UI component ecosystem:

```
Pattern / Feature               magicui                     motion-primitives          react-bits              cult-ui
─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Audio / Signal Beams            AnimatedBeam, Ripple        AudioWaveformPreview       FluidAudioGlow          SignalPipe
Bento Grid Matrix               BentoGrid, BentoCard        TiltCard, DraggableGrid    BentoTiltItem           BentoMatrix
Mouse-Follow Spotlight          Spotlight, BorderBeam       SpotlightCard              SpotlightCursor         GlowBorderCard
Telemetry & Log Terminal        Terminal, TypingAnimation   SmoothScrollStream         LogStreamTerminal       CodeBlockExpand
Hero Background Lights          Particles, Meteors, Globe   ParticleBackground         GradientNoiseMesh       MeshGradientHero
Typography Reveal               BlurIn, WordRotate, Sparkle TextMorph, CounterSpring   SplitTextReveal         DecryptedText
Sticky Scrollytelling           ScrollProgress, Dock        ScrollLinkedFrame          ParallaxScrollEngine    StickyCanvasSection
```

---

## 4. Dual-Theme Policy: The `isLight` Thread

Every archetype must implement the system-wide dual-theme contract (`isLight` prop):

```tsx
// Canonical Dark vs Light Token Resolver
const getSurfaceClasses = (isLight: boolean) => ({
  ground: isLight ? 'bg-slate-50 text-slate-900' : 'bg-[#09090b] text-white',
  panel: isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-[#121215] border-[#18181b] text-zinc-100',
  border: isLight ? 'border-slate-200 hover:border-slate-300' : 'border-[#18181b] hover:border-[#27272a]',
  subtleText: isLight ? 'text-slate-500' : 'text-zinc-400',
  accent: 'bg-amber-500 text-black hover:bg-amber-400',
});
```

---

## 5. Archetype Selection Recipe

1. **Cellular Telephony / High-Speed Outreach**: Default to **Dark OLED Precision** hybridized with **Live Signal & Voice Pipeline** (pulsing SIM line status + audio waveform cards).
2. **Contact & Lead Intelligence**: Leverage **Modular Bento & Interactive CRM** (draggable contact pills, live stage meters).
3. **Infrastructure & Call Routing**: Leverage **High-Frequency Blueprint & Telemetry** (crosshair 1px borders, mono latency counters, tabular numbers).
