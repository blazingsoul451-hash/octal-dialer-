---
name: anti-hallucination-and-dependency-guard
description: Anti-hallucination protocol preventing phantom npm packages, fake GitHub repos, and low-grade boilerplate by enforcing local vault (.reference-ui) inspection and native Tailwind fallbacks.
---

# Anti-Hallucination & Dependency Guard

Large Language Models frequently hallucinate GitHub URLs, fabricate npm package names (`@fancy-ui/glowing-card`), or default to outdated 2018-era boilerplate when uncertain. This skill enforces strict local-first verification protocols to ensure 100% genuine, tier-1 production code.

---

## 1. The Three Hard Laws

```
Law 1: The Local Vault Is Absolute (.reference-ui/)
       Agents may only inspect, read, and extract source code from local directories
       present in .reference-ui/. Never execute ad-hoc 'git clone' for unverified URLs.

Law 2: Zero Phantom Imports
       Every imported symbol must either exist in package.json or be a local project file.
       Never write 'import { X } from "invented-package"'.

Law 3: Fail-Safe to Native Primitives
       If a requested animation or component is not in .reference-ui/ or package.json,
       build it using pure React 19 + Tailwind CSS + Lucide icons.
```

---

## 2. Verification Protocol Before Writing Code

Before writing any component that uses an external animation, UI block, or icon:

### Step 1: Check `package.json`
Inspect `website_octal_dialer/frontend/package.json` to verify installed packages:
```bash
# Approved frontend dependencies
react, react-dom, lucide-react, socket.io-client, qrcode.react, xlsx
```
If a package is not in `dependencies`, **do not import it**. 

### Step 2: Search the Local Reference Vault (`.reference-ui/`)
Inspect `.reference-ui/` to locate the exact verified source file:

```powershell
# Search for a specific component in the local vault:
Get-ChildItem -Path .reference-ui -Recurse -Filter "*spotlight*"
Get-ChildItem -Path .reference-ui -Recurse -Filter "*animated-beam*"
Get-ChildItem -Path .reference-ui -Recurse -Filter "*bento*"
```

| Desired Effect | Target Local Directory | Verified File Pattern |
|---|---|---|
| **Glowing Beams / SVG Data Pipelines** | `.reference-ui/magicui` | `components/magicui/animated-beam.tsx` |
| **Bento Grid Layouts** | `.reference-ui/magicui` | `components/magicui/bento-grid.tsx` |
| **Spotlight Hover Cards** | `.reference-ui/motion-primitives` | `components/motion-primitives/spotlight.tsx` |
| **Morphing Dialogs / Modals** | `.reference-ui/motion-primitives` | `components/motion-primitives/morphing-dialog.tsx` |
| **WebGL Aurora / Liquid Waves** | `.reference-ui/react-bits` | `Animations/Aurora/Aurora.tsx` |
| **Tactile Command Docks** | `.reference-ui/cult-ui` | `components/cult/dock.tsx` |
| **Accessible Primitives** | `.reference-ui/shadcn-ui` | `apps/www/registry/new-york/ui/*.tsx` |
| **Conversion Hero & Pricing** | `.reference-ui/tailark` | `blocks/hero/*.tsx`, `blocks/pricing/*.tsx` |

### Step 3: Copy & Adapt Locally (Inlining Pattern)
Instead of installing heavy external packages that break the bundle budget (< 800 kB), copy the single needed component file into the project's own UI directory (`src/components/marketing/` or `src/components/ui/`), and adapt it to project tokens:
1. Map surfaces to `#09090b` and `#121215`.
2. Map borders to `#18181b` and `#27272a`.
3. Add the mandatory `isLight?: boolean` branch.
4. Replace third-party icon libraries with `lucide-react`.

---

## 3. Hallucination vs. Verified Reality

| Hallucinated AI Pattern (BANNED) | Verified Anti-Hallucination Standard |
|---|---|
| `import { GlowingBorder } from 'react-glowing-borders'` *(fake package)* | Copy pure CSS/SVG implementation from `.reference-ui/magicui` or use native Tailwind `border-t-white/15` + radial gradient. |
| `git clone https://github.com/cool-dev/awesome-saas-template.git` *(unverified)* | Read proven architecture from `.reference-ui/dub` or `.reference-ui/tailark`. |
| `import { Icon } from '@heroicons/react/solid'` *(violates single-icon rule)* | `import { Check } from 'lucide-react'` |
| `import { AnimatedBeam } from '@magicui/react'` *(phantom npm package)* | Copy `animated-beam.tsx` directly from `.reference-ui/magicui` into `src/components/ui/animated-beam.tsx`. |

---

## 4. Verification Check Before Claiming Complete
Always run the typecheck to prove zero phantom imports exist:
```bash
npm --prefix website_octal_dialer/frontend exec tsc -- --noEmit
```
If `tsc` reports `Cannot find module 'xyz'`, immediately eliminate the phantom import and replace it with a local implementation from `.reference-ui/` or native Tailwind.
