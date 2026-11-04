import React, { useState, useEffect, useRef, useId } from 'react';
import {
  Zap, ShieldCheck, Activity, Radio, PhoneCall, PhoneOff,
  Signal, Delete, Volume2, Sliders, Layers, CheckCircle2,
} from 'lucide-react';

export interface FamilyStyleShowcaseProps {
  isLight?: boolean;
  className?: string;
}

const SimContactChip = ({ isLight }: { isLight?: boolean }) => {
  const gradId = useId();
  return (
    <svg viewBox="0 0 96 96" className="w-12 h-12 shrink-0 drop-shadow-md">
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fef08a" /><stop offset="30%" stopColor="#f59e0b" />
          <stop offset="70%" stopColor="#d97706" /><stop offset="100%" stopColor="#78350f" />
        </linearGradient>
      </defs>
      <polygon points="6,6 74,6 90,22 90,90 6,90" fill={isLight ? '#f1f5f9' : '#1e1e24'} stroke={isLight ? '#cbd5e1' : '#27272a'} strokeWidth="2" />
      <g fill={`url(#${gradId})`} stroke="#451a03" strokeWidth="1" strokeLinejoin="round">
        <path d="M 16 16 L 44 16 L 44 38 L 16 38 Z" rx="2" /><path d="M 52 16 L 76 16 L 80 20 L 80 38 L 52 38 Z" rx="2" />
        <path d="M 16 44 L 38 44 L 38 52 L 16 52 Z" rx="2" /><ellipse cx="48" cy="48" rx="8" ry="8" /><path d="M 58 44 L 80 44 L 80 52 L 58 52 Z" rx="2" />
        <path d="M 16 58 L 44 58 L 44 80 L 16 80 Z" rx="2" /><path d="M 52 58 L 80 58 L 80 80 L 52 80 Z" rx="2" />
      </g>
    </svg>
  );
};

export const FamilyStyleShowcase: React.FC<FamilyStyleShowcaseProps> = ({ isLight = false, className = '' }) => {
  const [dockProgress, setDockProgress] = useState(0.85);
  const [isAutoCycling, setIsAutoCycling] = useState(false);
  const [activeSim, setActiveSim] = useState<1 | 2>(1);
  const [dialedNumber, setDialedNumber] = useState('+1 (415) 892-0419');
  const [isCallActive, setIsCallActive] = useState(true);
  const [callTimer, setCallTimer] = useState(84);
  const [callsPerDay, setCallsPerDay] = useState(1200);
  const [keypadFlash, setKeypadFlash] = useState<string | null>(null);
  const [voltageSurge, setVoltageSurge] = useState(false);
  const [audioWaveActive, setAudioWaveActive] = useState(true);
  const stageRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!isCallActive) return;
    const interval = setInterval(() => setCallTimer((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [isCallActive]);

  useEffect(() => {
    if (!isAutoCycling) return;
    let forward = true;
    const interval = setInterval(() => {
      setDockProgress((prev) => {
        if (prev >= 1) forward = false;
        if (prev <= 0.15) forward = true;
        return forward ? Math.min(1, prev + 0.05) : Math.max(0.15, prev - 0.05);
      });
    }, 180);
    return () => clearInterval(interval);
  }, [isAutoCycling]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    setTilt({ x: ((e.clientX - rect.left) / rect.width - 0.5) * 10, y: -((e.clientY - rect.top) / rect.height - 0.5) * 10 });
  };

  const handleKeyPress = (digit: string) => {
    setKeypadFlash(digit);
    setDialedNumber((prev) => (prev.length < 18 ? prev + digit : prev));
    setTimeout(() => setKeypadFlash(null), 180);
  };

  const handleSimSwitch = (sim: 1 | 2) => {
    if (activeSim === sim) return;
    setActiveSim(sim);
    setVoltageSurge(true);
    setTimeout(() => setVoltageSurge(false), 400);
  };

  const voipCostPerMonth = Math.round(callsPerDay * 22 * 0.032);
  const annualSavings = voipCostPerMonth * 12;
  const formatTimer = (sec: number) =>
    `${Math.floor(sec / 60).toString().padStart(2, '0')}:${(sec % 60).toString().padStart(2, '0')}`;

  const p = dockProgress;
  const cardScale = 0.88 + 0.12 * p;

  return (
    <section
      className={`relative w-full overflow-x-clip py-16 sm:py-24 px-4 sm:px-6 lg:px-8 select-none transition-colors duration-300 ${
        isLight ? 'bg-slate-100 text-slate-900' : 'bg-[#09090b] text-white'
      } ${className}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setTilt({ x: 0, y: 0 })}
    >
      <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.035] mix-blend-overlay">
        <filter id="octalShowcaseNoise"><feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="3" stitchTiles="stitch" /></filter>
        <rect width="100%" height="100%" filter="url(#octalShowcaseNoise)" />
      </svg>
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[650px] h-[360px] bg-gradient-to-tr from-amber-500/20 via-yellow-500/10 to-transparent blur-[140px] rounded-full pointer-events-none" />
      <div className="absolute top-1/3 left-1/6 w-[420px] h-[420px] bg-cyan-500/10 blur-[150px] rounded-full pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/6 w-[450px] h-[380px] bg-emerald-500/10 blur-[140px] rounded-full pointer-events-none" />
      {voltageSurge && <div className="absolute inset-0 bg-gradient-to-b from-amber-400/10 via-cyan-400/5 to-transparent pointer-events-none animate-pulse transition-opacity duration-300" />}

      <div className="relative max-w-7xl mx-auto flex flex-col items-center">
        {/* Top Header Badge */}
        <div className={`inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-widest border mb-6 transition-all shadow-sm ${
          isLight ? 'bg-white/80 border-amber-500/30 text-amber-700 shadow-amber-500/5' : 'bg-[#121215]/90 border-amber-500/40 text-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.15)]'
        }`}>
          <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400 animate-bounce" />
          <span>OCTAL DIALER // CELLULAR TELEPHONY ENGINE v2.4</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping ml-1" />
        </div>

        {/* Hero Title */}
        <h2 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-center max-w-4xl leading-[1.08] mb-4">
          Dual-SIM Cellular Outreach.{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-amber-200 to-amber-500 drop-shadow-sm">
            Magnetic Cloud Synchronization at $0/min.
          </span>
        </h2>
        <p className={`text-sm sm:text-base text-center max-w-2xl mb-8 font-medium ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>
          Pair your Android device running <span className="font-mono text-amber-400">application_octal_dialer</span> to the Octal CRM Workspace. Physical carrier SIMs dock directly into your browser via high-frequency Socket.IO telemetry.
        </p>

        {/* Interactive Magnetic Docking Controller Bar */}
        <div className={`w-full max-w-2xl p-3.5 rounded-2xl border backdrop-blur-xl mb-12 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl transition-all ${
          isLight ? 'bg-white/90 border-slate-200 shadow-slate-200/50' : 'bg-[#121215]/80 border-[#18181b] shadow-[0_12px_40px_rgba(0,0,0,0.6)]'
        }`}>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20"><Layers className="w-4 h-4" /></div>
            <div>
              <div className="text-[11px] font-mono uppercase font-bold tracking-wider flex items-center gap-1.5">
                <span>Hardware Docking</span><span className="text-amber-400 font-mono">{(p * 100).toFixed(0)}%</span>
              </div>
              <div className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
                {p > 0.8 ? '⚡ Octal Gateway Synced (18ms)' : 'Dispersed 3D Matrix'}
              </div>
            </div>
          </div>

          <div className="flex-1 w-full sm:mx-4 flex items-center gap-2">
            <input
              type="range" min="0" max="1" step="0.01" value={dockProgress}
              onChange={(e) => { setDockProgress(parseFloat(e.target.value)); if (isAutoCycling) setIsAutoCycling(false); }}
              className="w-full accent-amber-500 h-1.5 bg-zinc-700 rounded-lg cursor-pointer"
            />
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setDockProgress(0.1)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-mono uppercase transition-all ${
                p <= 0.25 ? 'bg-amber-500 text-black font-bold' : isLight ? 'bg-slate-200 text-slate-700 hover:bg-slate-300' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
            >Spread</button>
            <button
              onClick={() => setDockProgress(1)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-mono uppercase transition-all ${
                p >= 0.85 ? 'bg-amber-500 text-black font-bold shadow-[0_0_12px_rgba(245,158,11,0.4)]' : isLight ? 'bg-slate-200 text-slate-700 hover:bg-slate-300' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
            >⚡ Docked</button>
            <button
              onClick={() => setIsAutoCycling(!isAutoCycling)}
              className={`p-1.5 rounded-lg border transition-all ${
                isAutoCycling ? 'bg-amber-500/20 border-amber-500 text-amber-400' : isLight ? 'border-slate-300 text-slate-500 hover:bg-slate-200' : 'border-zinc-800 text-zinc-400 hover:bg-zinc-800'
              }`}
              title="Auto-Cycle Orbit"
            ><Activity className={`w-3.5 h-3.5 ${isAutoCycling ? 'animate-spin' : ''}`} /></button>
          </div>
        </div>

        {/* 3D STAGE: Floating Cards + Central Device */}
        <div ref={stageRef} style={{ perspective: 1200 }} className="relative w-full max-w-5xl min-h-[580px] sm:min-h-[640px] flex items-center justify-center mb-16 py-8">
          <div
            style={{ transform: `rotateX(${tilt.y}deg) rotateY(${tilt.x}deg)`, transition: 'transform 0.15s ease-out', transformStyle: 'preserve-3d' }}
            className="relative w-full h-full flex items-center justify-center"
          >
            {/* SVG Connecting High-Voltage Beams */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-10 transition-opacity duration-500" style={{ opacity: Math.max(0, (p - 0.25) * 1.33) }}>
              <defs>
                <linearGradient id="beamAmber" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.8" /><stop offset="50%" stopColor="#38bdf8" stopOpacity="1" /><stop offset="100%" stopColor="#f59e0b" stopOpacity="0.8" />
                </linearGradient>
              </defs>
              <line x1="28%" y1="22%" x2="50%" y2="42%" stroke="url(#beamAmber)" strokeWidth={p > 0.8 ? '2.5' : '1.5'} strokeDasharray="6 6" className="animate-[pulse_1.5s_infinite]" />
              <line x1="72%" y1="22%" x2="50%" y2="42%" stroke="url(#beamAmber)" strokeWidth={p > 0.8 ? '2.5' : '1.5'} strokeDasharray="6 6" className="animate-[pulse_1.8s_infinite]" />
              <line x1="28%" y1="78%" x2="50%" y2="58%" stroke="url(#beamAmber)" strokeWidth={p > 0.8 ? '2.5' : '1.5'} strokeDasharray="6 6" className="animate-[pulse_1.6s_infinite]" />
              <line x1="72%" y1="78%" x2="50%" y2="58%" stroke="url(#beamAmber)" strokeWidth={p > 0.8 ? '2.5' : '1.5'} strokeDasharray="6 6" className="animate-[pulse_2s_infinite]" />
            </svg>

            {/* CARD A: Physical SIM 1 — T-Mobile 5G Ultra */}
            <div
              onClick={() => handleSimSwitch(1)}
              style={{
                transform: `translate3d(${(-240 * (1 - p)).toFixed(1)}px, ${(-150 * (1 - p)).toFixed(1)}px, ${(40 * p).toFixed(1)}px) rotateZ(${(-8 * (1 - p)).toFixed(1)}deg) scale(${cardScale})`,
                transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
              className={`absolute top-4 left-2 sm:left-12 z-20 w-64 sm:w-72 p-4 rounded-2xl border backdrop-blur-2xl cursor-pointer shadow-xl transition-all ${
                activeSim === 1
                  ? isLight ? 'bg-white border-amber-500 shadow-amber-500/20 ring-2 ring-amber-400/30' : 'bg-[#121215]/95 border-amber-500/80 shadow-[0_0_30px_rgba(245,158,11,0.25)] ring-1 ring-amber-400/40'
                  : isLight ? 'bg-white/80 border-slate-200' : 'bg-[#121215]/75 border-white/10'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <SimContactChip isLight={isLight} />
                <div className="text-right">
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase bg-amber-500/20 text-amber-400 border border-amber-500/40">SIM 1 · ACTIVE</span>
                  <div className="flex items-center gap-1 justify-end text-[10px] text-emerald-400 mt-1 font-mono font-bold"><Signal className="w-3 h-3" /><span>5G UC (FULL)</span></div>
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs font-bold font-mono tracking-tight flex items-center justify-between">
                  <span>T-Mobile Business</span><span className="text-[10px] text-zinc-400 font-normal">89014-10328</span>
                </div>
                <div className={`text-[10px] flex justify-between ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>
                  <span>Octal Attestation</span><span className="text-emerald-400 font-bold">STIR/SHAKEN A</span>
                </div>
                <div className="w-full bg-zinc-800/50 h-1.5 rounded-full overflow-hidden mt-1.5">
                  <div className="bg-gradient-to-r from-amber-400 to-emerald-400 h-full w-[96%]" />
                </div>
              </div>
            </div>

            {/* CARD B: Physical SIM 2 — Verizon Business Hot-Spare */}
            <div
              onClick={() => handleSimSwitch(2)}
              style={{
                transform: `translate3d(${(240 * (1 - p)).toFixed(1)}px, ${(-150 * (1 - p)).toFixed(1)}px, ${(40 * p).toFixed(1)}px) rotateZ(${(8 * (1 - p)).toFixed(1)}deg) scale(${cardScale})`,
                transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
              className={`absolute top-4 right-2 sm:right-12 z-20 w-64 sm:w-72 p-4 rounded-2xl border backdrop-blur-2xl cursor-pointer shadow-xl transition-all ${
                activeSim === 2
                  ? isLight ? 'bg-white border-amber-500 shadow-amber-500/20 ring-2 ring-amber-400/30' : 'bg-[#121215]/95 border-amber-500/80 shadow-[0_0_30px_rgba(245,158,11,0.25)] ring-1 ring-amber-400/40'
                  : isLight ? 'bg-white/80 border-slate-200' : 'bg-[#121215]/75 border-white/10'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <SimContactChip isLight={isLight} />
                <div className="text-right">
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase border ${
                    activeSim === 2 ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                  }`}>{activeSim === 2 ? 'SIM 2 · ACTIVE' : 'HOT-SPARE'}</span>
                  <div className="flex items-center gap-1 justify-end text-[10px] text-cyan-400 mt-1 font-mono font-bold"><Radio className="w-3 h-3" /><span>VERIZON UW</span></div>
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs font-bold font-mono tracking-tight flex items-center justify-between">
                  <span>Verizon Business Core</span><span className="text-emerald-400 font-bold text-[10px]">99.8% Clean</span>
                </div>
                <div className={`text-[10px] flex justify-between ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>
                  <span>SIM Round-Robin</span><span className="text-amber-400 font-mono">14 calls left</span>
                </div>
                <div className="w-full bg-zinc-800/50 h-1.5 rounded-full overflow-hidden mt-1.5">
                  <div className="bg-gradient-to-r from-cyan-400 to-amber-400 h-full w-[99.8%]" />
                </div>
              </div>
            </div>

            {/* CARD C: Live Acoustic Voice Waveform */}
            <div
              onClick={() => setAudioWaveActive(!audioWaveActive)}
              style={{
                transform: `translate3d(${(-240 * (1 - p)).toFixed(1)}px, ${(160 * (1 - p)).toFixed(1)}px, ${(40 * p).toFixed(1)}px) rotateZ(${(6 * (1 - p)).toFixed(1)}deg) scale(${cardScale})`,
                transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
              className={`absolute bottom-4 left-2 sm:left-12 z-20 w-64 sm:w-72 p-4 rounded-2xl border backdrop-blur-2xl cursor-pointer shadow-xl transition-all ${
                isLight ? 'bg-white/85 border-slate-200' : 'bg-[#121215]/80 border-white/10'
              }`}
            >
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><Volume2 className="w-3.5 h-3.5" /></div>
                  <span className="text-xs font-bold uppercase font-mono tracking-wider">Acoustic HD Bus</span>
                </div>
                <span className="text-[10px] font-mono text-emerald-400 font-bold">-14.2 dB</span>
              </div>
              <div className="h-10 flex items-end gap-1 px-1 bg-black/40 rounded-xl p-1.5 border border-white/5 mb-2">
                {[45, 78, 92, 60, 85, 40, 95, 70, 82, 50, 88, 65, 75, 90, 55, 70].map((h, i) => (
                  <div
                    key={i}
                    style={{
                      height: audioWaveActive ? `${Math.max(15, (h + Math.sin(i * 1.5 + callTimer) * 20))}%` : '15%',
                      transition: 'height 0.15s ease',
                    }}
                    className={`flex-1 rounded-sm ${i % 3 === 0 ? 'bg-amber-400' : i % 2 === 0 ? 'bg-cyan-400' : 'bg-emerald-400'}`}
                  />
                ))}
              </div>
              <div className={`text-[9px] font-mono flex justify-between ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>
                <span>Octal AMR-WB 23.85 kHz</span><span className="text-amber-400">⚡ Zero Audio Jitter</span>
              </div>
            </div>

            {/* CARD D: Anti-Ban Jitter & Carrier Defense */}
            <div
              style={{
                transform: `translate3d(${(240 * (1 - p)).toFixed(1)}px, ${(160 * (1 - p)).toFixed(1)}px, ${(40 * p).toFixed(1)}px) rotateZ(${(-6 * (1 - p)).toFixed(1)}deg) scale(${cardScale})`,
                transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
              className={`absolute bottom-4 right-2 sm:right-12 z-20 w-64 sm:w-72 p-4 rounded-2xl border backdrop-blur-2xl shadow-xl transition-all ${
                isLight ? 'bg-white/85 border-slate-200' : 'bg-[#121215]/80 border-white/10'
              }`}
            >
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20"><ShieldCheck className="w-3.5 h-3.5" /></div>
                  <span className="text-xs font-bold uppercase font-mono tracking-wider">Octal Anti-Ban</span>
                </div>
                <span className="px-1.5 py-0.5 rounded text-[8px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">SHIELD ARMED</span>
              </div>
              <div className="space-y-1.5 text-[10px] font-mono">
                <div className="flex justify-between"><span className={isLight ? 'text-slate-500' : 'text-zinc-400'}>Stochastic Jitter</span><span className="text-amber-400 font-bold">22s ± 6s humanized</span></div>
                <div className="flex justify-between"><span className={isLight ? 'text-slate-500' : 'text-zinc-400'}>Short-Call Guard</span><span className="text-emerald-400 font-bold">2.1% (Safe &lt; 15%)</span></div>
                <div className="flex justify-between"><span className={isLight ? 'text-slate-500' : 'text-zinc-400'}>Outbox Daemon</span><span className="text-cyan-400 font-bold">SQLite Non-VoLTE Sync</span></div>
              </div>
            </div>

            {/* CENTRAL DEVICE: Octal Dialer Android Handset & CRM Lead Nexus */}
            <div
              style={{ transform: `scale(${0.96 + 0.04 * p})`, transition: 'all 0.3s ease-out' }}
              className={`relative z-30 w-[310px] sm:w-[340px] rounded-[36px] p-2.5 sm:p-3 border shadow-2xl transition-all ${
                isLight ? 'bg-slate-200/90 border-slate-300 shadow-slate-300/60' : 'bg-[#121215] border-[#27272a] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)]'
              }`}
            >
              <div className="absolute inset-x-8 top-0 h-[1px] bg-gradient-to-r from-transparent via-amber-400/50 to-transparent" />
              <div className={`relative rounded-[28px] overflow-hidden p-4 border transition-colors ${
                isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#09090b] border-[#18181b] text-white'
              }`}>
                {/* Dynamic Island */}
                <div className="flex justify-center mb-3">
                  <div className="w-28 h-5 rounded-full bg-black/90 flex items-center justify-between px-3 border border-white/10">
                    <div className="w-2 h-2 rounded-full bg-zinc-800" />
                    <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" /><span className="text-[8px] font-mono text-zinc-300">OCTAL</span></div>
                  </div>
                </div>

                {/* Status Bar */}
                <div className="flex items-center justify-between text-[10px] font-mono px-1 mb-4 opacity-75">
                  <span>9:41</span>
                  <div className="flex items-center gap-2"><Signal className="w-3 h-3 text-emerald-400" /><span>5G</span><span className="text-[9px] font-bold">98%</span></div>
                </div>

                {/* Octal CRM Lead Card */}
                <div className={`p-3 rounded-xl border mb-3 transition-all ${
                  isLight ? 'bg-amber-500/5 border-amber-500/20' : 'bg-amber-500/10 border-amber-500/30 shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)]'
                }`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] font-mono uppercase font-bold text-amber-400 flex items-center gap-1">
                      <Zap className="w-3 h-3 fill-amber-400" />{isCallActive ? 'OCTAL CELLULAR UPLINK' : 'STANDBY READY'}
                    </span>
                    <span className="text-xs font-mono font-bold text-emerald-400">{formatTimer(callTimer)}</span>
                  </div>
                  <div className="text-sm font-bold tracking-tight">Sarah Jenkins</div>
                  <div className={`text-[10px] ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>VP Growth · Apex Logistics ($48.5k ARR)</div>
                </div>

                {/* Dual-SIM Active Switcher Bar */}
                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-black/30 border border-white/5 mb-3">
                  <button
                    onClick={() => handleSimSwitch(1)}
                    className={`py-1.5 rounded-lg text-[10px] font-mono uppercase font-bold transition-all ${
                      activeSim === 1 ? 'bg-amber-500 text-black shadow-md' : isLight ? 'text-slate-600 hover:text-slate-900' : 'text-zinc-400 hover:text-white'
                    }`}
                  >SIM 1 (T-Mo)</button>
                  <button
                    onClick={() => handleSimSwitch(2)}
                    className={`py-1.5 rounded-lg text-[10px] font-mono uppercase font-bold transition-all ${
                      activeSim === 2 ? 'bg-amber-500 text-black shadow-md' : isLight ? 'text-slate-600 hover:text-slate-900' : 'text-zinc-400 hover:text-white'
                    }`}
                  >SIM 2 (VZW)</button>
                </div>

                {/* Dialed Number Display */}
                <div className={`flex items-center justify-between p-2 rounded-xl border mb-3 font-mono text-xs font-bold ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#121215] border-[#18181b]'
                }`}>
                  <span className="truncate">{dialedNumber || 'Enter digits...'}</span>
                  {dialedNumber && (
                    <button onClick={() => setDialedNumber((prev) => prev.slice(0, -1))} className="p-1 rounded text-zinc-400 hover:text-red-400 transition-colors">
                      <Delete className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Tactile Keypad */}
                <div className="grid grid-cols-3 gap-1.5 mb-3">
                  {[
                    ['1', ''], ['2', 'ABC'], ['3', 'DEF'],
                    ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'],
                    ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'],
                    ['*', ''], ['0', '+'], ['#', ''],
                  ].map(([digit, sub]) => (
                    <button
                      key={digit}
                      onClick={() => handleKeyPress(digit)}
                      className={`h-10 rounded-xl border flex flex-col items-center justify-center transition-all cursor-pointer ${
                        keypadFlash === digit
                          ? 'bg-amber-400 text-black border-amber-300 scale-95 shadow-[0_0_15px_rgba(245,158,11,0.6)]'
                          : isLight ? 'bg-white hover:bg-slate-100 border-slate-200 text-slate-800 active:scale-95' : 'bg-[#121215] hover:bg-[#18181b] border-[#18181b] text-white active:scale-95'
                      }`}
                    >
                      <span className="text-xs font-bold leading-none">{digit}</span>
                      {sub && <span className="text-[7px] text-zinc-400 font-mono leading-none mt-0.5">{sub}</span>}
                    </button>
                  ))}
                </div>

                {/* Call Control Action Bar */}
                <button
                  onClick={() => { setIsCallActive(!isCallActive); if (!isCallActive) setCallTimer(0); }}
                  className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-mono font-bold uppercase transition-all shadow-md ${
                    isCallActive ? 'bg-red-500 hover:bg-red-400 text-white' : 'bg-emerald-500 hover:bg-emerald-400 text-black'
                  }`}
                >
                  {isCallActive ? (<><PhoneOff className="w-3.5 h-3.5" /><span>Hang Up</span></>) : (<><PhoneCall className="w-3.5 h-3.5" /><span>Dial Lead</span></>)}
                </button>
              </div>

              {/* Hardware Sync Footer Badge */}
              <div className="mt-2.5 text-center">
                <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[9px] font-mono tracking-widest uppercase bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  ⚡ OCTAL GATEWAY // 18MS CARRIER SYNC
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* INTERACTIVE COST DISRUPTION & ROI ENGINE */}
        <div className={`w-full max-w-4xl p-6 sm:p-8 rounded-[28px] border backdrop-blur-2xl shadow-2xl transition-all ${
          isLight ? 'bg-white/90 border-slate-200 shadow-slate-200/60' : 'bg-[#121215]/85 border-[#18181b] shadow-[0_20px_50px_rgba(0,0,0,0.7)]'
        }`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-inherit">
            <div>
              <div className="inline-flex items-center gap-2 text-xs font-mono uppercase font-bold text-amber-400 mb-1">
                <Sliders className="w-4 h-4" /><span>Octal Telephony Cost Disruption Engine</span>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold tracking-tight">Standard VoIP / Twilio ($0.032/min) vs. Octal Dual-SIM ($0/min)</h3>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-400">Total Annual Savings</span>
              <div className="text-2xl sm:text-3xl font-black font-mono text-amber-400 tabular-nums">+${annualSavings.toLocaleString()}</div>
            </div>
          </div>

          <div className="space-y-3 mb-6">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className={isLight ? 'text-slate-600' : 'text-zinc-400'}>Outbound Calls Per Day</span>
              <span className="font-bold text-amber-400 text-sm">{callsPerDay.toLocaleString()} calls / day</span>
            </div>
            <input
              type="range" min="100" max="10000" step="100" value={callsPerDay}
              onChange={(e) => setCallsPerDay(parseInt(e.target.value, 10))}
              className="w-full accent-amber-500 h-2 bg-zinc-700 rounded-lg cursor-pointer"
            />
            <div className="flex justify-between text-[10px] font-mono text-zinc-500">
              <span>100 calls/day (Solo Rep)</span><span>5,000 calls/day (Growth Team)</span><span>10,000+ calls/day (Enterprise Floor)</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className={`p-4 rounded-2xl border transition-all ${isLight ? 'bg-red-500/5 border-red-500/20' : 'bg-red-500/10 border-red-500/30'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase font-mono text-red-400">Standard VoIP / Twilio SIP</span>
                <span className="text-xs font-mono font-bold text-red-400">${voipCostPerMonth.toLocaleString()}/mo</span>
              </div>
              <ul className={`text-xs space-y-1.5 ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>
                <li className="flex items-center gap-2"><span className="text-red-400">✕</span><span>$0.014/min + $1.15/DID phone number surcharges</span></li>
                <li className="flex items-center gap-2"><span className="text-red-400">✕</span><span>Carrier &quot;Spam Likely&quot; algorithmic flags after 40 calls</span></li>
                <li className="flex items-center gap-2"><span className="text-red-400">✕</span><span>No physical SIM encryption or cellular roaming</span></li>
              </ul>
            </div>

            <div className={`p-4 rounded-2xl border transition-all ${isLight ? 'bg-amber-500/10 border-amber-500/30' : 'bg-amber-500/10 border-amber-500/40'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase font-mono text-amber-400 flex items-center gap-1"><Zap className="w-3.5 h-3.5 fill-amber-400" />Octal Dual-SIM GSM</span>
                <span className="text-xs font-mono font-bold text-emerald-400">$0.00/min Unlimited</span>
              </div>
              <ul className={`text-xs space-y-1.5 ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" /><span>Unlimited commercial carrier plans (T-Mo / Verizon)</span></li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" /><span>Real cellular hardware handshake (0% VoIP spam flag)</span></li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" /><span>Dual-SIM round-robin slot swapping &amp; stochastic jitter</span></li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default FamilyStyleShowcase;
