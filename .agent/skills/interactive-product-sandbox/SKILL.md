---
name: interactive-product-sandbox
description: Architecture for zero-auth interactive product sandboxes, clickable micro-apps (dialer keypad, latency meter, SIM switcher, ROI slider), and tactile micro-feedback.
---

# Interactive Product Sandbox

Static screenshots and canned videos do not convert high-intent technical buyers. Modern SaaS products (Linear, Raycast, Supabase, Stripe) convert by placing a real, clickable, deterministic micro-app right inside the hero or bento grid.

---

## 1. The "Show, Don't Screenshot" Principle

| Static Screenshot Failures | Interactive Sandbox Advantages |
|---|---|
| Looks dated immediately upon UI change | Stays dynamically styled with live Tailwind tokens |
| Passive viewer experience (high bounce rate) | Active engagement ("tactile play" builds trust) |
| Blurry on high-DPI Retina screens | Crisp, vector-rendered DOM components |
| Requires auth / backend to test | Zero-auth client-side state machine |

---

## 2. Interactive Cellular Dialer Keypad Micro-App

Here is the production blueprint for an embedded, interactive dialer simulator for the hero section:

```tsx
import React, { useState } from 'react';
import { Phone, Delete, Volume2, ShieldCheck } from 'lucide-react';

export const InteractiveDialerSandbox = ({ isLight }: { isLight?: boolean }) => {
  const [number, setNumber] = useState('+1 (555) 019-');
  const [activeSim, setActiveSim] = useState<'SIM 1 (Verizon)' | 'SIM 2 (AT&T)'>('SIM 1 (Verizon)');
  const [callState, setCallState] = useState<'idle' | 'calling' | 'connected'>('idle');

  const handleDigit = (digit: string) => {
    if (number.length < 17) setNumber((prev) => prev + digit);
  };

  const handleBackspace = () => {
    setNumber((prev) => prev.slice(0, -1));
  };

  const startSimulatedCall = () => {
    setCallState('calling');
    setTimeout(() => setCallState('connected'), 1200);
  };

  const hangUp = () => setCallState('idle');

  return (
    <div
      className={`w-full max-w-sm mx-auto rounded-3xl p-6 border shadow-2xl transition-all ${
        isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#121215] border-[#18181b] border-t-white/15 text-white'
      }`}
    >
      {/* SIM Selector Header */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#18181b]">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[10px] font-mono uppercase text-zinc-400">{activeSim}</span>
        </div>
        <button
          type="button"
          onClick={() => setActiveSim((s) => (s.includes('SIM 1') ? 'SIM 2 (AT&T)' : 'SIM 1 (Verizon)'))}
          className="text-[10px] font-mono text-amber-400 hover:underline cursor-pointer"
        >
          SWITCH SIM
        </button>
      </div>

      {/* Screen Display */}
      <div className={`p-4 rounded-xl mb-4 text-center border ${isLight ? 'bg-slate-100 border-slate-200' : 'bg-[#09090b] border-[#18181b]'}`}>
        <div className="text-xl font-mono tabular-nums font-bold tracking-wider mb-1 min-h-[28px]">{number}</div>
        <div className="flex items-center justify-center gap-1.5 text-[11px] font-mono text-zinc-400">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>CARRIER TCPA GUARD ACTIVE</span>
        </div>
      </div>

      {/* 3x4 Keypad */}
      <div className="grid grid-cols-3 gap-2.5 mb-5">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => handleDigit(k)}
            className={`h-11 rounded-xl font-mono text-sm font-bold flex items-center justify-center transition-all active:scale-95 cursor-pointer ${
              isLight
                ? 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                : 'bg-[#18181b] hover:bg-[#27272a] hover:text-amber-400 text-zinc-200'
            }`}
          >
            {k}
          </button>
        ))}
      </div>

      {/* Call / Action Controls */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleBackspace}
          className="p-3 rounded-xl bg-zinc-800/40 text-zinc-400 hover:text-white cursor-pointer"
        >
          <Delete className="w-4 h-4" />
        </button>

        {callState === 'idle' ? (
          <button
            type="button"
            onClick={startSimulatedCall}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl font-mono text-xs uppercase tracking-wider transition-all cursor-pointer shadow-lg shadow-amber-500/20"
          >
            <Phone className="w-4 h-4" />
            <span>DISPATCH GSM CALL</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={hangUp}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-red-500 hover:bg-red-400 text-white font-bold rounded-xl font-mono text-xs uppercase tracking-wider transition-all cursor-pointer"
          >
            <Phone className="w-4 h-4 rotate-[135deg]" />
            <span>{callState === 'calling' ? 'RINGING...' : 'END 00:04'}</span>
          </button>
        )}
      </div>
    </div>
  );
};
```

---

## 3. Interactive ROI & Capacity Calculator

Embed directly in landing pages to let prospects calculate cellular savings vs VoIP carriers:

```tsx
export const RoiCalculatorSandbox = ({ isLight }: { isLight?: boolean }) => {
  const [agents, setAgents] = useState(12);
  const voipMonthly = agents * 149;
  const octalMonthly = agents * 49 + 120; // GSM SIM flat
  const savings = voipMonthly - octalMonthly;

  return (
    <div className={`p-6 rounded-2xl border ${isLight ? 'bg-white border-slate-200' : 'bg-[#121215] border-[#18181b]'}`}>
      <div className="flex justify-between items-center mb-4">
        <span className="text-xs font-mono uppercase text-zinc-400">Team Size: {agents} Outbound Reps</span>
        <span className="text-sm font-mono font-bold text-amber-400 tabular-nums">Save ${savings.toLocaleString()}/mo</span>
      </div>
      <input
        type="range"
        min={1}
        max={100}
        value={agents}
        onChange={(e) => setAgents(Number(e.target.value))}
        className="w-full accent-amber-500 cursor-pointer mb-4"
      />
      <div className="grid grid-cols-2 gap-4 text-center font-mono">
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
          <div className="text-[10px] text-zinc-400">Traditional VoIP</div>
          <div className="text-lg font-bold text-red-400 tabular-nums">${voipMonthly.toLocaleString()}/mo</div>
        </div>
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <div className="text-[10px] text-zinc-400">Octal Cellular Pool</div>
          <div className="text-lg font-bold text-emerald-400 tabular-nums">${octalMonthly.toLocaleString()}/mo</div>
        </div>
      </div>
    </div>
  );
};
```

---

## 4. Sandbox Polish Checklist

- [ ] Zero backend dependencies: State works seamlessly offline or without auth.
- [ ] Tactile feedback: Buttons feature `active:scale-95` and snappy hover transitions.
- [ ] Numeric stability: All reactive values use `tabular-nums`.
- [ ] Realistic data: Use believable phone numbers, latencies, and business metrics.
