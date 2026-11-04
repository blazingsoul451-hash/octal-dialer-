---
trigger: all
description: "Anti-hallucination, zero-unverified-git, and strict local vault (.reference-ui) dependency guard."
---

# Anti-Hallucination & Local Vault Dependency Guard

## 1. Zero External Git Clones During Execution
- **Strict Prohibition:** NEVER run `git clone` with an unverified or hallucinated GitHub URL during design or coding tasks.
- **The Local Vault Is Law:** All reference UI code MUST be read from `.reference-ui/` on local disk using `read_file` or `antigravity-brain-fs`.
- If a component or animation pattern is needed, inspect the existing local vault:
  * `.reference-ui/magicui` (animated beams, bento grids, marquees, particle vortices)
  * `.reference-ui/motion-primitives` (magnetic buttons, spotlight cards, morphing dialogs)
  * `.reference-ui/react-bits` (WebGL aurora, acoustics, creative text effects)
  * `.reference-ui/cult-ui` (command docks, hardware frames, walkthroughs)
  * `.reference-ui/shadcn-ui` (Radix/Base primitives, tables, forms)
  * `.reference-ui/tailark` (conversion heroes, pricing matrices, comparisons)
  * `.reference-ui/lenis` (smooth scrolling physics)
  * `.reference-ui/tremor` (high-density KPI metrics & charts)

## 2. No Invented NPM Packages or Phantom Imports
- **Check package.json First:** Before importing any third-party library, verify that it is explicitly declared in `website_octal_dialer/frontend/package.json`.
- **Approved Frontend Stack:** `react`, `react-dom`, `lucide-react`, `socket.io-client`, `qrcode.react`, `xlsx`.
- **Adding Dependencies:** Never install unverified npm packages. Adding a dependency requires user permission.
- If an agent is tempted to import an external component library (e.g., `import { MagicCard } from 'some-random-library'`), it MUST copy the raw TypeScript/Tailwind implementation directly from `.reference-ui/` or write native Tailwind + Framer Motion primitives.

## 3. Official Registries & MCPs Only
- When pulling new components, use official verified MCPs and CLIs:
  * Official shadcn CLI v4: `npx shadcn@latest add ...`
  * Official shadcn MCP: searches verified manifests from `@shadcn`, Magic UI, and React Bits.
  * Never pull from random GitHub gists, obscure forks, or low-grade public templates.

## 4. Deterministic Native Fallback
- If a component or animation cannot be found in `.reference-ui/` or installed via verified registries, fall back to pure React 19 + Tailwind CSS + Lucide icons.
- Native Tailwind with CSS keyframes or standard Framer Motion (`framer-motion`) is always preferred over guessing an external dependency.
