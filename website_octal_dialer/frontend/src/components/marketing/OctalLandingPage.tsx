import React, { useState } from 'react';
import {
  Zap,
  ShieldCheck,
  Activity,
  Radio,
  Signal,
  CheckCircle2,
  ArrowRight,
  ChevronDown,
  X,
  Sparkles,
  Lock,
  Globe,
  Clock,
  Smartphone,
  Server,
  AlertTriangle
} from 'lucide-react';
import { FamilyStyleShowcase } from './FamilyStyleShowcase';
import { LoginScreen } from '../LoginScreen';
import { type AuthIdentity } from '../../utils/roleUtils';

export interface OctalLandingPageProps {
  serverUrl: string;
  onLoginSuccess: (token: string, identity: AuthIdentity) => void;
  isLight?: boolean;
}

export const OctalLandingPage: React.FC<OctalLandingPageProps> = ({
  serverUrl,
  onLoginSuccess,
  isLight = false,
}) => {
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('annual');
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 80, behavior: 'smooth' });
    }
  };

  const FAQS = [
    {
      q: 'Do I need physical SIM cards, or can I use eSIMs?',
      a: 'Octal Dialer supports both physical nano-SIM cards and digital eSIM profiles. With our Android companion APK (application_octal_dialer), your device can auto-rotate between SIM 1 and SIM 2 every 50 calls, ensuring zero carrier rate-limiting.'
    },
    {
      q: 'How does Octal Dialer achieve $0/minute calling?',
      a: 'Traditional VoIP providers (Twilio, Plivo) charge $0.015 to $0.045 per minute plus regulatory pass-through fees. Octal Dialer routes calls directly through your existing carrier unlimited talk/text plans on physical Android hardware. Zero per-minute charges.'
    },
    {
      q: 'How does the Anti-Ban Jitter Engine protect my numbers from Spam flags?',
      a: 'VoIP dialers trigger carrier STIR/SHAKEN alarms because calls initiate at mechanical, robotic intervals. Octal injects stochastic 22s ± 6s human jitter, alternates SIM antennas, and maintains a sub-3% short-call ratio to keep your numbers 99.8% clean.'
    },
    {
      q: 'What happens if a non-VoLTE data drop occurs during a call?',
      a: 'On legacy or CDMA cellular networks where simultaneous voice and data drop, Octal’s embedded SQLite call outbox queues all call disposition tags locally. The moment voice disconnects, all call records sync back to Octal CRM via Socket.IO instantly.'
    },
    {
      q: 'Can I integrate Octal Dialer with my existing CRM and outreach tools?',
      a: 'Yes. Octal Dialer includes native two-way WebSockets, automated Google Maps and Facebook scrapers, Omnichannel Unibox for SMS and WhatsApp handoffs, and REST webhooks for HubSpot, Salesforce, and Zapier.'
    }
  ];

  return (
    <div className={`min-h-screen overflow-x-clip font-sans transition-colors duration-300 ${
      isLight ? 'bg-slate-50 text-slate-900' : 'bg-[#09090b] text-white'
    }`}>
      {/* ── Fixed Specular Glass Navbar ── */}
      <nav className={`fixed top-0 inset-x-0 z-40 backdrop-blur-xl border-b transition-colors ${
        isLight ? 'bg-white/85 border-slate-200 shadow-sm' : 'bg-[#09090b]/85 border-[#18181b]'
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Brand Logo */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-300 p-0.5 shadow-md shadow-amber-500/20 flex items-center justify-center">
              <div className="w-full h-full bg-[#121215] rounded-[10px] flex items-center justify-center">
                <Zap className="w-5 h-5 text-amber-400 fill-amber-400" />
              </div>
            </div>
            <div>
              <span className="font-bold text-base tracking-tight font-display">
                Octal <span className="bg-gradient-to-r from-amber-400 to-amber-500 bg-clip-text text-transparent">Dialer</span>
              </span>
              <span className="hidden sm:inline-block ml-2 text-[9px] font-mono tracking-wider uppercase px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                Cellular GSM v2.4
              </span>
            </div>
          </div>

          {/* Nav Links */}
          <div className="hidden md:flex items-center gap-6 text-xs font-semibold uppercase tracking-wider">
            <button type="button" onClick={() => scrollTo('features')} className="text-zinc-400 hover:text-amber-400 transition-colors">Features</button>
            <button type="button" onClick={() => scrollTo('hardware-sandbox')} className="text-zinc-400 hover:text-amber-400 transition-colors">3D Sandbox</button>
            <button type="button" onClick={() => scrollTo('comparison')} className="text-zinc-400 hover:text-amber-400 transition-colors">VoIP vs Cellular</button>
            <button type="button" onClick={() => scrollTo('pricing')} className="text-zinc-400 hover:text-amber-400 transition-colors">Pricing</button>
            <button type="button" onClick={() => scrollTo('faq')} className="text-zinc-400 hover:text-amber-400 transition-colors">FAQ</button>
          </div>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowLoginModal(true)}
              className={`px-4 py-2 rounded-xl text-xs font-bold uppercase font-mono tracking-wider transition-all cursor-pointer ${
                isLight ? 'bg-slate-200 hover:bg-slate-300 text-slate-800' : 'bg-[#18181b] hover:bg-[#27272a] text-zinc-300 hover:text-white border border-[#27272a]'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setShowLoginModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold font-mono text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30 transition-all cursor-pointer active:scale-95"
            >
              <span>Deploy Fleet</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </nav>

      {/* ── Hero Section ── */}
      <section className="relative pt-32 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto flex flex-col items-center text-center">
        {/* Glow Spheres */}
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-gradient-to-tr from-amber-500/20 via-amber-400/10 to-transparent blur-[140px] rounded-full pointer-events-none" />
        <div className="absolute top-40 right-10 w-[300px] h-[300px] bg-cyan-500/10 blur-[130px] rounded-full pointer-events-none" />

        {/* Kicker Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-widest border border-amber-500/40 bg-amber-500/10 text-amber-400 mb-6 shadow-[0_0_20px_rgba(245,158,11,0.15)]">
          <Zap className="w-3.5 h-3.5 animate-pulse text-amber-400" />
          <span>ZESTIFY CELLULAR ENGINE v2.4 // 100,000V TELEPHONY</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping ml-1" />
        </div>

        {/* Main Headline */}
        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-tight leading-[1.05] max-w-5xl mb-6">
          Outbound Calling at <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500">$0/Minute.</span>
          <br />
          <span className={isLight ? 'text-slate-800' : 'text-zinc-200'}>
            Dual-SIM Cellular Hardware Docked to Your Browser.
          </span>
        </h1>

        {/* Subtitle */}
        <p className={`text-base sm:text-lg max-w-3xl mb-10 leading-relaxed font-medium ${
          isLight ? 'text-slate-600' : 'text-zinc-400'
        }`}>
          Stop burning thousands of dollars on Twilio per-minute tolls and carrier spam flags. Octal Dialer synchronizes your own Android Dual-SIM phones directly with your sales CRM via real-time WebSockets.
        </p>

        {/* Hero CTAs */}
        <div className="flex flex-col sm:flex-row items-center gap-4 mb-16">
          <button
            type="button"
            onClick={() => setShowLoginModal(true)}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold font-mono text-xs uppercase tracking-wider shadow-xl shadow-amber-500/25 transition-all cursor-pointer active:scale-95"
          >
            <span>Start 14-Day Cellular Trial</span>
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => scrollTo('hardware-sandbox')}
            className={`w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-xs font-bold font-mono uppercase tracking-wider border transition-all cursor-pointer ${
              isLight ? 'bg-white border-slate-300 text-slate-800 hover:bg-slate-100' : 'bg-[#121215] border-[#27272a] text-zinc-300 hover:text-white hover:border-amber-500/40'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Explore 3D Hardware Sandbox</span>
          </button>
        </div>

        {/* Carrier Logos Strip */}
        <div className="w-full max-w-4xl pt-4 pb-2 border-t border-b border-[#18181b] flex flex-wrap items-center justify-center gap-8 sm:gap-12 opacity-80">
          <div className="flex items-center gap-2 text-xs font-mono font-bold tracking-wider text-zinc-400">
            <Radio className="w-4 h-4 text-amber-400" /> T-MOBILE 5G UC
          </div>
          <div className="flex items-center gap-2 text-xs font-mono font-bold tracking-wider text-zinc-400">
            <Signal className="w-4 h-4 text-cyan-400" /> VERIZON ULTRA
          </div>
          <div className="flex items-center gap-2 text-xs font-mono font-bold tracking-wider text-zinc-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" /> STIR/SHAKEN A-GRADE
          </div>
          <div className="flex items-center gap-2 text-xs font-mono font-bold tracking-wider text-zinc-400">
            <Lock className="w-4 h-4 text-amber-400" /> TCPA 100% COMPLIANT
          </div>
        </div>
      </section>

      {/* ── 3D Interactive Hardware Assembly Sandbox (Family.co Style) ── */}
      <section id="hardware-sandbox" className="relative">
        <FamilyStyleShowcase isLight={isLight} />
      </section>

      {/* ── High-Contrast Comparison Section (VoIP vs. Octal) ── */}
      <section id="comparison" className="py-24 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <span className="text-[10px] font-mono uppercase font-bold tracking-widest text-amber-400 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20">
            THE ARCHITECTURAL SHIFT
          </span>
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight mt-3 mb-4">
            Legacy VoIP vs. Octal Dual-SIM GSM
          </h2>
          <p className="text-zinc-400 text-sm max-w-2xl mx-auto">
            Why high-velocity outbound teams are abandoning Twilio and cloud PBX brokers in favor of physical cellular pools.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* The Old Way: Twilio / Cloud VoIP */}
          <div className={`p-6 sm:p-8 rounded-2xl border ${
            isLight ? 'bg-red-50/40 border-red-200' : 'bg-red-950/10 border-red-500/20'
          }`}>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-xl bg-red-500/20 text-red-400"><AlertTriangle className="w-5 h-5" /></div>
              <div>
                <h3 className="font-bold text-base text-red-400">The Old Way (Cloud VoIP & Twilio)</h3>
                <p className="text-xs text-zinc-400">Virtual trunks & per-minute metered toll gates</p>
              </div>
            </div>
            <ul className="space-y-4 text-xs">
              <li className="flex items-start gap-3 text-zinc-300">
                <span className="text-red-400 font-bold">✕</span>
                <span><strong>$0.015 – $0.045 / minute:</strong> Toll costs surge as your outbound team scales up.</span>
              </li>
              <li className="flex items-start gap-3 text-zinc-300">
                <span className="text-red-400 font-bold">✕</span>
                <span><strong>78% Spam Likely Flags:</strong> Virtual VoIP DID ranges are instantly recognized and suppressed by carriers.</span>
              </li>
              <li className="flex items-start gap-3 text-zinc-300">
                <span className="text-red-400 font-bold">✕</span>
                <span><strong>Robotic Calling Cadence:</strong> Fixed-delay autodialers trigger STIR/SHAKEN automated blocks.</span>
              </li>
              <li className="flex items-start gap-3 text-zinc-300">
                <span className="text-red-400 font-bold">✕</span>
                <span><strong>Zero Hardware Ownership:</strong> You pay rent every month for numbers you never truly control.</span>
              </li>
            </ul>
          </div>

          {/* The New Way: Octal Dual-SIM Cellular */}
          <div className={`p-6 sm:p-8 rounded-2xl border shadow-xl ${
            isLight ? 'bg-emerald-50/50 border-emerald-300 shadow-emerald-500/5' : 'bg-[#121215] border-amber-500/40 shadow-[0_0_40px_rgba(245,158,11,0.1)]'
          }`}>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400"><Zap className="w-5 h-5" /></div>
              <div>
                <h3 className="font-bold text-base text-amber-400">The Octal Way (Dual-SIM GSM Hardware)</h3>
                <p className="text-xs text-zinc-400">Real mobile antennas with unlimited carrier minutes</p>
              </div>
            </div>
            <ul className="space-y-4 text-xs">
              <li className="flex items-start gap-3 text-zinc-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span><strong>$0.00 / minute Unlimited:</strong> Route 100,000+ monthly calls over your carrier SIM plans.</span>
              </li>
              <li className="flex items-start gap-3 text-zinc-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span><strong>Under 2% Flag Rate:</strong> Genuine cellular mobile IMEIs and mobile numbers register as genuine person-to-person calls.</span>
              </li>
              <li className="flex items-start gap-3 text-zinc-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span><strong>Anti-Ban Stochastic Jitter:</strong> 22s ± 6s human cadence with SIM slot round-robin prevents carrier throttling.</span>
              </li>
              <li className="flex items-start gap-3 text-zinc-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span><strong>100% Physical Control:</strong> Your SIMs, your hardware, your unblockable outreach pipeline.</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ── 6-Cell Bento Grid: Core Platform Architecture ── */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <span className="text-[10px] font-mono uppercase font-bold tracking-widest text-amber-400 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20">
            SYSTEM ARCHITECTURE
          </span>
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight mt-3 mb-4">
            Engineered for High-Frequency Outreach
          </h2>
          <p className="text-zinc-400 text-sm max-w-2xl mx-auto">
            Six architectural subsystems working in concert across web sockets, cellular radios, and local outboxes.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Bento Cell 1 */}
          <div className="p-6 rounded-2xl border border-[#18181b] bg-[#121215] flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mb-4">
                <Smartphone className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base mb-2">Dual-SIM Antenna Switcher</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Automated round-robin switching between SIM 1 and SIM 2 after every 50 calls. Balances carrier load and maintains cold-calling health.
              </p>
            </div>
            <div className="mt-6 text-[10px] font-mono text-amber-400 uppercase tracking-widest flex items-center gap-1.5">
              <span>● T-Mo / VZW Round-Robin</span>
            </div>
          </div>

          {/* Bento Cell 2 */}
          <div className="p-6 rounded-2xl border border-[#18181b] bg-[#121215] flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center mb-4">
                <Activity className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base mb-2">Anti-Ban Stochastic Jitter</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Stochastic micro-delays (22s ± 6s) mirror human dialing rhythms. Eliminates short-call spikes and bypasses automated carrier spam filters.
              </p>
            </div>
            <div className="mt-6 text-[10px] font-mono text-cyan-400 uppercase tracking-widest flex items-center gap-1.5">
              <span>● Algorithmic Throttle Guard</span>
            </div>
          </div>

          {/* Bento Cell 3 */}
          <div className="p-6 rounded-2xl border border-[#18181b] bg-[#121215] flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mb-4">
                <Server className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base mb-2">Offline SQLite Outbox</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Non-VoLTE cellular data drops never lose call state. Call logs and dispositions queue locally and sync automatically upon radio reconnection.
              </p>
            </div>
            <div className="mt-6 text-[10px] font-mono text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
              <span>● Zero Dropped Records</span>
            </div>
          </div>

          {/* Bento Cell 4 */}
          <div className="p-6 rounded-2xl border border-[#18181b] bg-[#121215] flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center mb-4">
                <Clock className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base mb-2">TCPA Timezone Guard</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Automatic phone prefix area-code validation guarantees agents only dial contacts within legal 8:00 AM – 8:00 PM recipient local hours.
              </p>
            </div>
            <div className="mt-6 text-[10px] font-mono text-purple-400 uppercase tracking-widest flex items-center gap-1.5">
              <span>● 100% Legal Safe Harbor</span>
            </div>
          </div>

          {/* Bento Cell 5 */}
          <div className="p-6 rounded-2xl border border-[#18181b] bg-[#121215] flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 flex items-center justify-center mb-4">
                <Radio className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base mb-2">Bi-Directional Socket Sync</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Under 120ms latency handshake between Web CRM and Android hardware. Real-time call logs, recordings, and disposition triggers update in unison.
              </p>
            </div>
            <div className="mt-6 text-[10px] font-mono text-yellow-400 uppercase tracking-widest flex items-center gap-1.5">
              <span>● Sub-120ms WebSockets</span>
            </div>
          </div>

          {/* Bento Cell 6 */}
          <div className="p-6 rounded-2xl border border-[#18181b] bg-[#121215] flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mb-4">
                <Globe className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base mb-2">Omnichannel Unibox Handoff</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Transition from cellular phone calls to instant WhatsApp messages, SMS follow-ups, and auto-cold emails directly from one unified interface.
              </p>
            </div>
            <div className="mt-6 text-[10px] font-mono text-rose-400 uppercase tracking-widest flex items-center gap-1.5">
              <span>● Unified Lead Intelligence</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Transparent Tiered Pricing ── */}
      <section id="pricing" className="py-24 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <span className="text-[10px] font-mono uppercase font-bold tracking-widest text-amber-400 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20">
            TRANSPARENT VALUE
          </span>
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight mt-3 mb-4">
            Predictable Plans. Unlimited Minutes.
          </h2>
          <p className="text-zinc-400 text-sm max-w-xl mx-auto mb-8">
            No surprise overage bills. No per-minute markups. Every plan includes unlimited $0/min cellular dialing.
          </p>

          {/* Monthly / Annual Toggle */}
          <div className="inline-flex items-center p-1 rounded-xl bg-[#121215] border border-[#18181b]">
            <button
              type="button"
              onClick={() => setBillingCycle('monthly')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                billingCycle === 'monthly' ? 'bg-amber-500 text-black' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Monthly Billing
            </button>
            <button
              type="button"
              onClick={() => setBillingCycle('annual')}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                billingCycle === 'annual' ? 'bg-amber-500 text-black' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <span>Annual Billing</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-black/20 text-black font-mono">SAVE 20%</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Starter Plan */}
          <div className="p-6 rounded-2xl border border-[#18181b] bg-[#121215] flex flex-col justify-between">
            <div>
              <h3 className="font-bold text-lg mb-1">Starter Fleet</h3>
              <p className="text-xs text-zinc-400 mb-6">For solo founders & boutique outbound teams</p>
              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-4xl font-extrabold font-mono">${billingCycle === 'annual' ? '79' : '99'}</span>
                <span className="text-xs text-zinc-500">/ month</span>
              </div>
              <ul className="space-y-3 text-xs text-zinc-300">
                <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-amber-400" /> Up to 2 Android SIM devices</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-amber-400" /> Unlimited $0/min cellular calls</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-amber-400" /> 5,000 active lead queue capacity</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-amber-400" /> Web CRM & Call Dispositions</li>
              </ul>
            </div>
            <button
              type="button"
              onClick={() => setShowLoginModal(true)}
              className="mt-8 w-full py-2.5 rounded-xl border border-[#27272a] bg-[#18181b] hover:border-amber-500/40 text-xs font-bold font-mono uppercase tracking-wider text-white transition-all cursor-pointer"
            >
              Start Free Trial
            </button>
          </div>

          {/* Growth Plan (Highlighted) */}
          <div className="p-6 rounded-2xl border-2 border-amber-500/60 bg-[#141419] flex flex-col justify-between relative shadow-[0_0_40px_rgba(245,158,11,0.15)]">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-amber-500 text-black font-mono text-[9px] font-bold uppercase tracking-widest">
              MOST POPULAR
            </div>
            <div>
              <h3 className="font-bold text-lg mb-1">Growth Fleet</h3>
              <p className="text-xs text-zinc-400 mb-6">For scaling sales agencies & SDR squads</p>
              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-4xl font-extrabold font-mono text-amber-400">${billingCycle === 'annual' ? '199' : '249'}</span>
                <span className="text-xs text-zinc-500">/ month</span>
              </div>
              <ul className="space-y-3 text-xs text-zinc-200">
                <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-amber-400" /> Up to 8 Android SIM devices</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-amber-400" /> Unlimited $0/min cellular calls</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-amber-400" /> Unlimited lead queue & CRM storage</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-amber-400" /> Anti-Ban Stochastic Jitter Engine</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-amber-400" /> Dual-SIM Round-Robin Automation</li>
              </ul>
            </div>
            <button
              type="button"
              onClick={() => setShowLoginModal(true)}
              className="mt-8 w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold font-mono uppercase tracking-wider transition-all cursor-pointer shadow-lg shadow-amber-500/20 active:scale-95"
            >
              Deploy Growth Fleet
            </button>
          </div>

          {/* Enterprise Plan */}
          <div className="p-6 rounded-2xl border border-[#18181b] bg-[#121215] flex flex-col justify-between">
            <div>
              <h3 className="font-bold text-lg mb-1">Enterprise Scale</h3>
              <p className="text-xs text-zinc-400 mb-6">For large call centers & telecom enterprises</p>
              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-4xl font-extrabold font-mono">${billingCycle === 'annual' ? '399' : '499'}</span>
                <span className="text-xs text-zinc-500">/ month</span>
              </div>
              <ul className="space-y-3 text-xs text-zinc-300">
                <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-amber-400" /> Unlimited Android SIM devices</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-amber-400" /> Dedicated Socket.IO Gateway Cluster</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-amber-400" /> Omnichannel Unibox (WhatsApp + SMS)</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-amber-400" /> Multi-Tenant RLS & Platform Hierarchy</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-amber-400" /> 24/7 SLA & Dedicated Telephony Engineer</li>
              </ul>
            </div>
            <button
              type="button"
              onClick={() => setShowLoginModal(true)}
              className="mt-8 w-full py-2.5 rounded-xl border border-[#27272a] bg-[#18181b] hover:border-amber-500/40 text-xs font-bold font-mono uppercase tracking-wider text-white transition-all cursor-pointer"
            >
              Contact Enterprise
            </button>
          </div>
        </div>
      </section>

      {/* ── Technical FAQ Accordion ── */}
      <section id="faq" className="py-20 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <span className="text-[10px] font-mono uppercase font-bold tracking-widest text-amber-400 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20">
            TECHNICAL CLARITY
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mt-3 mb-3">
            Frequently Asked Questions
          </h2>
          <p className="text-zinc-400 text-xs max-w-md mx-auto">
            Everything you need to know about pairing hardware, carrier anti-ban algorithms, and compliance.
          </p>
        </div>

        <div className="space-y-3">
          {FAQS.map((faq, idx) => {
            const isOpen = openFaq === idx;
            return (
              <div
                key={faq.q}
                className="border border-[#18181b] bg-[#121215] rounded-xl overflow-hidden transition-all"
              >
                <button
                  type="button"
                  onClick={() => setOpenFaq(isOpen ? null : idx)}
                  className="w-full p-4 text-left flex items-center justify-between text-xs sm:text-sm font-bold text-zinc-200 hover:text-white transition-colors cursor-pointer"
                >
                  <span>{faq.q}</span>
                  <ChevronDown className={`w-4 h-4 text-amber-400 transition-transform duration-200 shrink-0 ml-3 ${
                    isOpen ? 'rotate-180' : ''
                  }`} />
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 text-xs text-zinc-400 leading-relaxed border-t border-[#18181b]/60 pt-3">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── High-Converting Final Sticky CTA ── */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto text-center relative">
        <div className="p-8 sm:p-12 rounded-3xl border border-amber-500/40 bg-gradient-to-b from-[#141419] to-[#09090b] shadow-[0_0_60px_rgba(245,158,11,0.15)] relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 blur-[90px] rounded-full pointer-events-none" />
          <h2 className="text-3xl sm:text-5xl font-black tracking-tight mb-4">
            Stop Paying VoIP Tolls.
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-amber-200">
              Switch to Real Dual-SIM Cellular Today.
            </span>
          </h2>
          <p className="text-zinc-400 text-xs sm:text-sm max-w-xl mx-auto mb-8">
            Deploy your first Android device in under 90 seconds with instant QR code pairing. Unlimited talk, zero carrier bans.
          </p>
          <button
            type="button"
            onClick={() => setShowLoginModal(true)}
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-mono font-bold text-xs uppercase tracking-wider shadow-xl shadow-amber-500/25 transition-all cursor-pointer active:scale-95"
          >
            <span>Deploy Your Cellular Fleet Now</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-[#18181b] py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6 text-xs text-zinc-500">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400 fill-amber-400" />
          <span className="font-bold text-zinc-300">Octal Dialer</span>
          <span>by Zestify Technologies · All Rights Reserved</span>
        </div>
        <div className="flex items-center gap-4 text-[10px] font-mono">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            GATEWAY ONLINE // 18MS LATENCY
          </span>
          <button type="button" onClick={() => setShowLoginModal(true)} className="hover:text-amber-400 transition-colors">Sign In</button>
        </div>
      </footer>

      {/* ── Sign In Modal Overlay ── */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="relative w-full max-w-md">
            <button
              type="button"
              onClick={() => setShowLoginModal(false)}
              className="absolute -top-3 -right-3 z-50 w-8 h-8 rounded-full bg-[#18181b] border border-[#27272a] text-zinc-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer shadow-xl"
            >
              <X className="w-4 h-4" />
            </button>
            <LoginScreen
              serverUrl={serverUrl}
              onLogin={(token, identity) => {
                setShowLoginModal(false);
                onLoginSuccess(token, identity);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default OctalLandingPage;
