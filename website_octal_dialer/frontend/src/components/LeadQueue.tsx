import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, SkipForward, AlertTriangle, ShieldCheck, PhoneCall, ListRestart, Trash2 } from 'lucide-react';
import type { Campaign, Lead } from '../types';

interface LeadQueueProps {
  phoneConnected: boolean;
  campaigns: Campaign[];
  serverUrl: string;
  authToken: string;
  dialLead: (phone: string, name: string, timeout?: number, leadId?: string, campaignId?: string) => void;
  hangupCall: () => void;
  emergencyStop: () => void;
  clearEmergencyStop: () => void;
  callState: 'IDLE' | 'CALLING' | 'ACTIVE';
  lastCallFinished: { reason: string; duration: number } | null;
  lastBlockedReason: { reason: string; message: string } | null;
  triggerDisposition: (leadId: string, leadName: string) => void;
  isLight?: boolean;
  socket?: any;
  latencyMs?: number | null;
  phoneDeviceName?: string | null;
}

export const LeadQueue: React.FC<LeadQueueProps> = ({
  phoneConnected,
  campaigns,
  serverUrl,
  authToken,
  dialLead,
  hangupCall,
  emergencyStop,
  clearEmergencyStop,
  callState,
  lastCallFinished,
  lastBlockedReason,
  triggerDisposition,
  isLight,
  socket,
  latencyMs,
  phoneDeviceName,
}) => {
  const [selectedCampId, setSelectedCampId] = useState<string>('');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  
  // Call ticker state — only ticks after call is picked up (ACTIVE)
  const [callDuration, setCallDuration] = useState(0);
  const tickerRef = useRef<any>(null);
  // Ring/dial timeout — auto-hangup if no pickup within ringing period
  const ringTimeoutRef = useRef<any>(null);
  const [autoDialTimeout, setAutoDialTimeout] = useState(35); // seconds before auto-hangup if no answer
  const [isAutoDialing, setIsAutoDialing] = useState(false); // tracks if campaign auto-pilot is ON

  // Fetch leads of campaign
  const fetchLeads = async (campId: string) => {
    try {
      const res = await fetch(`${serverUrl}/campaigns/${campId}/leads`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setLeads(data);
        // Find the first pending lead index
        const firstPending = data.findIndex((l: Lead) => l.status === 'PENDING');
        setCurrentIndex(firstPending !== -1 ? firstPending : 0);
        setLogs([`[System] Loaded ${data.length} leads. Ready to dial.`]);
      }
    } catch (err) {
      console.error('Error fetching leads:', err);
    }
  };

  const handleClearAllLeads = async () => {
    if (!selectedCampId) return;
    if (!window.confirm('Are you sure you want to delete ALL leads in this queue?')) return;
    try {
      const res = await fetch(`${serverUrl}/campaigns/${selectedCampId}/leads`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        setLeads([]);
        setCurrentIndex(0);
        setLogs(prev => [...prev, `[Queue] Cleared all leads in campaign.`]);
      }
    } catch (err) {
      console.error('Error clearing campaign leads:', err);
    }
  };

  const handleDeleteLead = async (leadId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`${serverUrl}/api/leads/${leadId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        setLeads(prev => prev.filter(l => l.id !== leadId));
        setLogs(prev => [...prev, `[Queue] Lead deleted.`]);
      }
    } catch (err) {
      console.error('Error deleting lead:', err);
    }
  };

  const handlePurgeFakeLeads = async () => {
    try {
      const res = await fetch(`${serverUrl}/api/leads/purge-fake`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok && selectedCampId) {
        fetchLeads(selectedCampId);
      }
    } catch (err) {
      console.error('Error purging fake leads:', err);
    }
  };

  useEffect(() => {
    if (selectedCampId) {
      fetchLeads(selectedCampId);
    } else {
      setLeads([]);
      setCurrentIndex(0);
    }
  }, [selectedCampId]);

  // Auto-select first campaign when campaigns array populates if none selected
  useEffect(() => {
    if (campaigns.length > 0 && !selectedCampId) {
      setSelectedCampId(campaigns[0].id);
    }
  }, [campaigns]);

  // Real-time: re-fetch leads when backend broadcasts leads:updated
  useEffect(() => {
    if (!socket) return;
    const handler = () => {
      if (selectedCampId) {
        fetchLeads(selectedCampId);
      }
    };
    socket.on('leads:updated', handler);
    return () => { socket.off('leads:updated', handler); };
  }, [socket, selectedCampId]);

  // Call duration ticker — only starts AFTER call is picked up (ACTIVE state)
  useEffect(() => {
    if (callState === 'ACTIVE') {
      // Call was picked up — start the connected timer
      setCallDuration(0);
      tickerRef.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
      // Clear any ring timeout since call was answered
      if (ringTimeoutRef.current) {
        clearTimeout(ringTimeoutRef.current);
        ringTimeoutRef.current = null;
      }
    } else if (callState === 'CALLING') {
      // Phone is ringing/dialing — start ring timeout
      setCallDuration(0);
      if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = setTimeout(() => {
        // Auto-hangup if no answer within timeout
        setLogs(prev => [...prev, `[Auto Dialer] No answer after ${autoDialTimeout}s — hanging up...`]);
        hangupCall();
      }, autoDialTimeout * 1000);
    } else if (callState === 'IDLE') {
      if (tickerRef.current) clearInterval(tickerRef.current);
      tickerRef.current = null;
      if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = null;
    }
    return () => {
      if (tickerRef.current) clearInterval(tickerRef.current);
    };
  }, [callState]);

  // Handle post-call routing trigger & 5-second auto-dial progression
  useEffect(() => {
    if (lastCallFinished && leads[currentIndex]) {
      const currentLead = leads[currentIndex];
      const wasAnswered = lastCallFinished.duration > 3; // answered = connected for >3s

      setLogs(prev => [
        ...prev,
        `[Call Outcome] ${currentLead.name}: ${lastCallFinished.reason} | Duration: ${lastCallFinished.duration}s | ${wasAnswered ? 'ANSWERED' : 'NOT ANSWERED'}`
      ]);

      // Mark lead completed locally first
      setLeads(prev => prev.map((l, idx) => 
        idx === currentIndex 
          ? { ...l, status: 'COMPLETED', outcome: wasAnswered ? lastCallFinished.reason : 'NO ANSWER', duration: lastCallFinished.duration }
          : l
      ));

      // Open disposition modal ONLY if the call was answered (connected for >3s)
      // For unanswered calls — skip remarks and auto-dial next immediately
      if (wasAnswered) {
        triggerDisposition(currentLead.id, currentLead.name);
        setLogs(prev => [...prev, `[Dialer] Call answered — waiting for remarks before dialing next lead...`]);
        // Don't auto-advance — user must submit remarks then we advance
        // The disposition modal close/save should trigger next dial if isAutoDialing
      } else {
        // Not answered — auto-advance after 2 seconds
        setLogs(prev => [...prev, `[Auto Dialer] Not answered — advancing to next lead in 2s...`]);
        const timerId = setTimeout(() => {
          setLeads(currentLeads => {
            const nextPendingIdx = currentLeads.findIndex(
              (l, idx) => idx > currentIndex && l.status === 'PENDING'
            );
            if (nextPendingIdx !== -1) {
              setCurrentIndex(nextPendingIdx);
              const nextLead = currentLeads[nextPendingIdx];
              setLogs(prev => [...prev, `[Auto Dialer] Dialing: ${nextLead.name} (${nextLead.phone})`]);
              if (phoneConnected && selectedCampId && isAutoDialing) {
                // FIX: correct argument order — dialLead(phone, name, timeout, leadId, campaignId)
                dialLead(nextLead.phone, nextLead.name, autoDialTimeout, nextLead.id, selectedCampId);
              }
            } else {
              setLogs(prev => [...prev, `[Auto Dialer] ✅ Campaign complete — no more pending leads.`]);
              setIsAutoDialing(false);
            }
            return currentLeads;
          });
        }, 2000);
        return () => clearTimeout(timerId);
      }
    }
  }, [lastCallFinished, currentIndex, phoneConnected, selectedCampId, isAutoDialing, autoDialTimeout, dialLead]);

  // Handle Safety Controller block feedback
  useEffect(() => {
    if (lastBlockedReason) {
      setLogs(prev => [
        ...prev,
        `[SafetyController] ⛔ BLOCKED: ${lastBlockedReason.message}`
      ]);
    }
  }, [lastBlockedReason]);

  const activeLead = leads[currentIndex] || null;

  const handleDial = () => {
    if (!phoneConnected) {
      setLogs(prev => [...prev, '[Error] No paired phone. Connect phone first.']);
      return;
    }
    if (!activeLead) {
      setLogs(prev => [...prev, '[Queue] No active lead selected.']);
      return;
    }

    setLogs(prev => [
      ...prev,
      `[SafetyController] Checking call for: ${activeLead.name} (${activeLead.phone})...`
    ]);

    // Correct arg order: dialLead(phone, name, timeout, leadId, campaignId)
    dialLead(activeLead.phone, activeLead.name, autoDialTimeout, activeLead.id, activeLead.campaignId || selectedCampId);
  };

  // Start auto-dialing campaign — dials first pending lead and enables auto-advance
  const handleStartAutoDial = () => {
    if (!phoneConnected) {
      setLogs(prev => [...prev, '[Error] No paired phone. Connect phone first.']);
      return;
    }
    const nextPendingIdx = leads.findIndex(l => l.status === 'PENDING');
    if (nextPendingIdx === -1) {
      setLogs(prev => [...prev, '[Auto Dialer] No pending leads to dial.']);
      return;
    }
    setIsAutoDialing(true);
    setCurrentIndex(nextPendingIdx);
    const lead = leads[nextPendingIdx];
    setLogs(prev => [...prev, `[Auto Dialer] 🚀 Campaign started! Dialing: ${lead.name} (${lead.phone})`]);
    dialLead(lead.phone, lead.name, autoDialTimeout, lead.id, lead.campaignId || selectedCampId);
  };

  // Called by DispositionModal after user saves remarks — then advances to next lead
  const handleAfterDisposition = () => {
    if (!isAutoDialing) return;
    setLeads(currentLeads => {
      const nextPendingIdx = currentLeads.findIndex(
        (l, idx) => idx > currentIndex && l.status === 'PENDING'
      );
      if (nextPendingIdx !== -1) {
        setCurrentIndex(nextPendingIdx);
        const nextLead = currentLeads[nextPendingIdx];
        setLogs(prev => [...prev, `[Auto Dialer] Remarks saved. Dialing next: ${nextLead.name} (${nextLead.phone})`]);
        setTimeout(() => {
          if (phoneConnected) {
            dialLead(nextLead.phone, nextLead.name, autoDialTimeout, nextLead.id, selectedCampId);
          }
        }, 1500);
      } else {
        setLogs(prev => [...prev, `[Auto Dialer] ✅ Campaign complete!`]);
        setIsAutoDialing(false);
      }
      return currentLeads;
    });
  };

  const handleHangup = () => {
    setLogs(prev => [...prev, '[Dialer] Hanging up current call...']);
    hangupCall();
  };

  const handleNext = () => {
    if (currentIndex < leads.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setLogs(prev => [...prev, `[Queue] Moved to next lead: ${leads[currentIndex + 1].name}`]);
    } else {
      setLogs(prev => [...prev, '[Queue] Reached the end of the dialer list.']);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      setLogs(prev => [...prev, `[Queue] Moved to previous lead: ${leads[currentIndex - 1].name}`]);
    }
  };

  const [showConsole, setShowConsole] = useState(false);
  const [manualPhone, setManualPhone] = useState('');

  const handleManualDial = () => {
    if (!phoneConnected) {
      setLogs(prev => [...prev, '[Error] No paired phone. Connect phone first.']);
      return;
    }
    if (!manualPhone.trim()) {
      setLogs(prev => [...prev, '[Error] Please enter a phone number to dial.']);
      return;
    }
    setLogs(prev => [
      ...prev,
      `[Quick Dial] Initiating manual call to: ${manualPhone}...`
    ]);
    dialLead(manualPhone, 'Manual Dial', 35);
  };

  // Compute REAL campaign metrics
  const totalLeadsCount = leads.length;
  const callsMadeCount = leads.filter(l => l.status !== 'PENDING').length;
  const connectedCount = leads.filter(l => l.status === 'COMPLETED').length;
  const remainingCount = leads.filter(l => l.status === 'PENDING').length;

  const getStatusBadge = () => {
    if (callState === 'CALLING') return { label: `◉ Ringing... (${autoDialTimeout}s timeout)`, color: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/40 animate-pulse font-bold' };
    if (callState === 'ACTIVE') return { label: `● CONNECTED — ${formatTimer(callDuration)}`, color: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/40 emerald-glow font-bold' };
    if (phoneConnected && isAutoDialing) return { label: '● Auto-Dialing Campaign ON', color: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30 font-bold animate-pulse' };
    if (phoneConnected) return { label: '● Ready to dial', color: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30 font-bold' };
    return { label: '● Phone Offline', color: isLight ? 'bg-slate-100 text-slate-700 border-slate-300 font-bold' : 'bg-slate-900 text-slate-400 border-slate-800' };
  };

  const currentBadge = getStatusBadge();

  return (
    <div className="space-y-6 text-left select-none">
      
      {/* Top Title & Subtitle */}
      <div className={`p-6 border rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors ${
        isLight ? 'bg-white border-slate-200/90 shadow-slate-200/50' : 'bg-[#0f172a]/95 border-slate-800/90 shadow-xl'
      }`}>
        <div>
          <h2 className={`text-2xl font-black font-display tracking-tight ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
            Auto Dialer Workspace
          </h2>
          <p className={`text-xs mt-1 ${isLight ? 'text-slate-600 font-medium' : 'text-slate-400'}`}>
            Manage campaigns, monitor lead pipelines, and automatically connect calls through your paired GSM handset.
          </p>
        </div>

        {/* Quick Emergency Stop Button */}
        <div className="flex items-center gap-2">
          <button
            onClick={emergencyStop}
            className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/40 font-mono text-xs font-black rounded-xl transition cursor-pointer flex items-center gap-2 shadow-sm"
            title="Trigger instant Emergency Stop on all active calls"
          >
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <span>Emergency Stop</span>
          </button>
        </div>
      </div>

      {/* ACTIVE CAMPAIGN CONTROL & REAL STATS CARDS */}
      <div className={`p-6 border rounded-2xl space-y-5 transition-colors ${
        isLight ? 'bg-white border-slate-200/90 shadow-slate-200/50' : 'bg-[#0f172a]/95 border-slate-800/90 shadow-xl'
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-[10px] font-mono font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest block">
              ACTIVE CAMPAIGN
            </span>
            <h3 className={`text-sm font-extrabold ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
              Select Dialing Pipeline
            </h3>
          </div>

          <div className="flex flex-wrap flex-1 md:ml-4 items-center gap-3">
            <select
              value={selectedCampId}
              onChange={(e) => setSelectedCampId(e.target.value)}
              className={`flex-1 min-w-[200px] border focus:border-amber-500 rounded-xl px-4 py-2.5 text-xs font-mono font-bold focus:outline-none transition cursor-pointer ${
                isLight ? 'bg-slate-50 border-slate-300 text-slate-900 shadow-sm' : 'bg-slate-950 border-slate-800 text-white'
              }`}
            >
              <option value="">-- Select Calling Campaign --</option>
              {campaigns.map(c => <option key={c.id} value={c.id}>{c.name} ({c.leadCount} leads)</option>)}
            </select>

            {/* Ring Timeout selector */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className={`text-[10px] font-mono font-bold uppercase ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Ring Timeout:
              </span>
              <select
                value={autoDialTimeout}
                onChange={(e) => setAutoDialTimeout(Number(e.target.value))}
                className={`border focus:border-amber-500 rounded-xl px-2.5 py-2 text-xs font-mono font-bold focus:outline-none transition cursor-pointer ${
                  isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                }`}
                title="Max seconds to ring phone before marking NO ANSWER and hanging up"
              >
                <option value={15}>15s</option>
                <option value={25}>25s</option>
                <option value={35}>35s (Default)</option>
                <option value={45}>45s</option>
                <option value={60}>60s</option>
              </select>
            </div>

            {/* Start / Stop Campaign Button */}
            {selectedCampId && (
              isAutoDialing ? (
                <button
                  onClick={() => setIsAutoDialing(false)}
                  className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white font-black text-xs font-mono uppercase tracking-wider rounded-xl transition cursor-pointer shadow-md flex items-center gap-2"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Pause Campaign</span>
                </button>
              ) : (
                <button
                  onClick={handleStartAutoDial}
                  disabled={!phoneConnected}
                  className={`px-5 py-2.5 font-black text-xs font-mono uppercase tracking-wider rounded-xl transition cursor-pointer shadow-md flex items-center gap-2 ${
                    !phoneConnected
                      ? (isLight ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-slate-850 text-slate-600 cursor-not-allowed')
                      : 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 shadow-emerald-500/20'
                  }`}
                  title={phoneConnected ? "Start Auto-Dialer Pilot" : "Connect Phone to Start Campaign"}
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Start Auto-Dial Campaign</span>
                </button>
              )
            )}
          </div>
        </div>

        {/* Real Campaign Statistics Grid */}
        {selectedCampId && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <div className={`p-3.5 rounded-xl border space-y-1 ${
              isLight ? 'bg-slate-50 border-slate-200 shadow-sm' : 'bg-slate-950/60 border-slate-850'
            }`}>
              <span className={`text-[9px] font-mono font-bold uppercase ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>TOTAL LEADS</span>
              <p className={`text-xl font-black font-display ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>{totalLeadsCount}</p>
            </div>
            <div className={`p-3.5 rounded-xl border space-y-1 ${
              isLight ? 'bg-amber-500/10 border-amber-300 shadow-sm' : 'bg-slate-950/60 border-slate-850'
            }`}>
              <span className="text-[9px] font-mono font-bold text-amber-700 dark:text-amber-400 uppercase">CALLS MADE</span>
              <p className="text-xl font-black font-display text-amber-700 dark:text-amber-400">{callsMadeCount}</p>
            </div>
            <div className={`p-3.5 rounded-xl border space-y-1 ${
              isLight ? 'bg-emerald-50 border-emerald-200 shadow-sm' : 'bg-slate-950/60 border-slate-850'
            }`}>
              <span className="text-[9px] font-mono font-bold text-emerald-700 dark:text-emerald-400 uppercase">CONNECTED</span>
              <p className="text-xl font-black font-display text-emerald-700 dark:text-emerald-400">{connectedCount}</p>
            </div>
            <div className={`p-3.5 rounded-xl border space-y-1 ${
              isLight ? 'bg-blue-50 border-blue-200 shadow-sm' : 'bg-slate-950/60 border-slate-850'
            }`}>
              <span className="text-[9px] font-mono font-bold text-blue-700 dark:text-blue-400 uppercase">REMAINING</span>
              <p className="text-xl font-black font-display text-blue-700 dark:text-blue-400">{remainingCount}</p>
            </div>
          </div>
        )}
      </div>

      {/* DUAL WORKSPACE: LEAD QUEUE LIST & CENTERPIECE CALL CARD */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: Queue Lead List */}
        <div className={`lg:col-span-5 border rounded-2xl p-5 shadow-xl flex flex-col h-[600px] transition-colors ${
          isLight ? 'bg-white border-slate-200/90 shadow-slate-200/50' : 'bg-[#0f172a]/95 border-slate-800/90'
        }`}>
          <div className={`flex justify-between items-center pb-3 border-b ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-mono font-extrabold uppercase tracking-wider ${
                isLight ? 'text-slate-700' : 'text-slate-400'
              }`}>
                Lead Queue ({leads.length})
              </span>
              <button
                onClick={handlePurgeFakeLeads}
                className="text-[9px] font-mono font-bold text-amber-500 hover:text-amber-400 hover:underline cursor-pointer"
                title="Remove sample/fake leads from queue"
              >
                Clear Fake Leads
              </button>
              {leads.length > 0 && (
                <button
                  onClick={handleClearAllLeads}
                  className="text-[9px] font-mono font-bold text-red-500 hover:text-red-400 hover:underline cursor-pointer flex items-center gap-0.5"
                  title="Delete all leads in current campaign"
                >
                  <Trash2 className="w-3 h-3" />
                  Clear All
                </button>
              )}
            </div>
            <span className={`text-[10px] font-mono font-bold ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
              Active: {currentIndex + 1} / {leads.length || 0}
            </span>
          </div>

          {/* Lead scroll list */}
          <div className="flex-1 overflow-y-auto mt-3 space-y-2 pr-1 custom-scrollbar">
            {leads.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
                <PhoneCall className={`w-10 h-10 stroke-1 ${isLight ? 'text-slate-400' : 'text-slate-600'}`} />
                <div className="space-y-1">
                  <p className={`text-xs font-extrabold ${isLight ? 'text-slate-900' : 'text-slate-300'}`}>No Campaign Selected</p>
                  <p className={`text-[10px] font-mono max-w-[200px] ${isLight ? 'text-slate-600 font-medium' : 'text-slate-400'}`}>
                    Choose a campaign from the selector above to load your calling list.
                  </p>
                </div>
              </div>
            ) : (
              leads.map((lead, idx) => (
                <div
                  key={lead.id}
                  onClick={() => {
                    if (callState === 'IDLE') {
                      setCurrentIndex(idx);
                      setLogs(prev => [...prev, `[Queue] Selected lead: ${lead.name}`]);
                    }
                  }}
                  className={`w-full p-3 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer group ${
                    idx === currentIndex
                      ? isLight 
                        ? 'bg-amber-500/20 border-amber-500 text-slate-950 font-black border-l-4' 
                        : 'bg-amber-500/10 border-amber-500/70 text-white font-bold border-l-4 border-l-amber-500'
                      : isLight
                        ? 'bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-900 font-bold'
                        : 'bg-slate-950/60 border-slate-850 hover:border-slate-750 text-slate-300'
                  }`}
                >
                  <div className="min-w-0 pr-2 flex-1">
                    <p className={`text-xs font-bold truncate ${isLight ? 'text-slate-900' : 'text-white'}`}>{lead.name}</p>
                    <p className={`text-[10px] font-mono mt-0.5 ${isLight ? 'text-slate-600 font-semibold' : 'text-slate-400'}`}>{lead.phone}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[9px] font-mono font-extrabold tracking-wider px-2 py-0.5 rounded border uppercase ${
                      lead.status === 'COMPLETED'
                        ? isLight ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : lead.status === 'CALLING'
                        ? isLight ? 'bg-amber-50 border-amber-300 text-amber-800' : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                        : isLight ? 'bg-slate-200 border-slate-300 text-slate-700' : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}>
                      {lead.status === 'COMPLETED' ? lead.outcome || 'DONE' : lead.status}
                    </span>

                    {/* Tiny Trash/Bin Delete Icon */}
                    <button
                      onClick={(e) => handleDeleteLead(lead.id, e)}
                      disabled={callState !== 'IDLE'}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-500/10 transition cursor-pointer"
                      title="Delete lead permanently"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Centerpiece Interactive Call Panel */}
        <div className="lg:col-span-7 space-y-6">

          {/* Quick Manual Dial Bar */}
          <div className={`p-4 border rounded-2xl shadow-sm flex flex-col sm:flex-row sm:items-center gap-3 transition-colors ${
            isLight ? 'bg-white border-slate-200/90' : 'bg-[#0f172a]/95 border-slate-800/90'
          }`}>
            <span className={`text-[10px] font-mono font-black uppercase tracking-widest min-w-[80px] ${
              isLight ? 'text-slate-600' : 'text-slate-400'
            }`}>
              QUICK DIAL
            </span>
            <input
              type="tel"
              placeholder="+1 (555) 000-0000"
              value={manualPhone}
              onChange={(e) => setManualPhone(e.target.value)}
              className={`flex-1 border focus:border-amber-500 rounded-xl px-4 py-2.5 text-xs font-mono font-bold focus:outline-none transition ${
                isLight ? 'bg-slate-50 border-slate-300 text-slate-900 shadow-sm' : 'bg-slate-950 border-slate-800 text-white'
              }`}
            />
            <button
              onClick={handleManualDial}
              disabled={callState !== 'IDLE' || !manualPhone.trim() || !phoneConnected}
              className={`px-6 py-2.5 font-black text-xs font-mono uppercase tracking-widest rounded-xl transition flex items-center justify-center gap-2 shadow-lg ${
                callState !== 'IDLE' || !manualPhone.trim() || !phoneConnected
                  ? (isLight ? 'bg-slate-200 text-slate-500 border border-slate-300 cursor-not-allowed' : 'bg-slate-850 text-slate-600 border border-slate-800 cursor-not-allowed')
                  : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-amber-500/20 amber-glow cursor-pointer'
              }`}
            >
              <PhoneCall className="w-4 h-4 fill-slate-950" />
              <span>Dial</span>
            </button>
          </div>
          
          {/* Main Caller Card */}
          <div className={`border rounded-2xl p-6 shadow-2xl flex flex-col justify-between h-[360px] relative overflow-hidden transition-colors ${
            isLight ? 'bg-white border-slate-200/90 shadow-slate-200/50' : 'bg-[#0f172a]/95 border-slate-800/90'
          }`}>
            
            {/* Header Status Bar */}
            <div className={`flex justify-between items-center pb-4 border-b ${isLight ? 'border-slate-200' : 'border-slate-800/60'}`}>
              <span className={`text-[10px] font-mono font-extrabold uppercase tracking-widest ${
                isLight ? 'text-slate-700' : 'text-slate-400'
              }`}>
                CURRENT LEAD INTERFACE
              </span>
              <span className={`px-3 py-1 text-[10px] font-mono font-extrabold uppercase tracking-wider border rounded-full ${currentBadge.color}`}>
                {currentBadge.label}
              </span>
            </div>

            {activeLead ? (
              <div className="space-y-4 my-auto text-center">
                {/* Large Contact Avatar */}
                <div className={`w-16 h-16 rounded-2xl font-display font-black text-2xl flex items-center justify-center mx-auto shadow-lg border ${
                  isLight
                    ? 'bg-amber-500/15 border-amber-300 text-amber-900 shadow-amber-500/10'
                    : 'bg-gradient-to-br from-amber-400/20 to-amber-600/10 border-amber-500/30 text-amber-400 shadow-amber-500/10'
                }`}>
                  {activeLead.name.charAt(0).toUpperCase()}
                </div>

                <div className="space-y-1">
                  <h2 className={`text-2xl font-black font-display uppercase tracking-wider ${
                    isLight ? 'text-slate-900' : 'text-slate-100'
                  }`}>{activeLead.name}</h2>
                  <p className="text-sm font-mono text-amber-600 dark:text-amber-400 font-extrabold tracking-widest">{activeLead.phone}</p>
                </div>

                {/* Call Duration Ticker */}
                {callState === 'ACTIVE' && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-600 dark:text-emerald-400 block font-bold">
                      CONNECTED DURATION
                    </span>
                    <span className="text-4xl font-mono font-black text-emerald-600 dark:text-emerald-400 tracking-widest">
                      {formatTimer(callDuration)}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center my-auto space-y-3 py-8">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto border ${
                  isLight ? 'bg-slate-100 border-slate-200 text-slate-500' : 'bg-slate-950 border-slate-850 text-slate-600'
                }`}>
                  <PhoneCall className="w-7 h-7 stroke-1" />
                </div>
                <div className="space-y-1">
                  <p className={`text-sm font-black ${isLight ? 'text-slate-900' : 'text-slate-300'}`}>No Lead Loaded</p>
                  <p className={`text-xs font-mono ${isLight ? 'text-slate-600 font-semibold' : 'text-slate-400'}`}>
                    Select a campaign to begin dialing your pipeline.
                  </p>
                </div>
              </div>
            )}

            {/* Powerful Call Controls Bar */}
            <div className={`flex items-center gap-3 border-t pt-4 ${isLight ? 'border-slate-200' : 'border-slate-800/60'}`}>
              <button
                onClick={handlePrev}
                disabled={callState !== 'IDLE' || currentIndex === 0}
                className={`px-4 py-3 border disabled:opacity-40 text-xs font-mono font-bold rounded-xl transition cursor-pointer ${
                  isLight ? 'bg-slate-100 border-slate-300 text-slate-800 hover:bg-slate-200' : 'bg-slate-950 border-slate-850 hover:border-slate-700 text-slate-300 hover:text-white'
                }`}
              >
                Previous
              </button>

              {callState === 'IDLE' ? (
                <button
                  onClick={handleDial}
                  disabled={!activeLead || !phoneConnected}
                  className={`flex-1 py-3 font-black text-xs font-mono uppercase tracking-widest rounded-xl transition flex items-center justify-center gap-2 shadow-lg ${
                    !activeLead || !phoneConnected
                      ? (isLight ? 'bg-slate-200 text-slate-500 border border-slate-300 cursor-not-allowed' : 'bg-slate-850 text-slate-600 border border-slate-800 cursor-not-allowed')
                      : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-amber-500/20 amber-glow cursor-pointer'
                  }`}
                >
                  <Play className="w-4 h-4 fill-slate-950" />
                  <span>DIAL LEAD</span>
                </button>
              ) : (
                <button
                  onClick={handleHangup}
                  className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white font-black text-xs font-mono uppercase tracking-widest rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 cursor-pointer"
                >
                  <Square className="w-4 h-4 fill-white" />
                  <span>HANG UP CALL</span>
                </button>
              )}

              <button
                onClick={handleNext}
                disabled={callState !== 'IDLE' || currentIndex >= leads.length - 1}
                className={`px-4 py-3 border disabled:opacity-40 text-xs font-mono font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
                  isLight ? 'bg-slate-100 border-slate-300 text-slate-800 hover:bg-slate-200' : 'bg-slate-950 border-slate-850 hover:border-slate-700 text-slate-300 hover:text-white'
                }`}
              >
                <span>Skip</span>
                <SkipForward className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Redesigned Bluetooth Bridge Console */}
          <div className={`border rounded-2xl p-5 shadow-xl space-y-3 transition-colors ${
            isLight ? 'bg-white border-slate-200/90 shadow-slate-200/50' : 'bg-[#0f172a]/95 border-slate-800/90'
          }`}>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${phoneConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`} />
                <span className={`text-xs font-black uppercase tracking-wider ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                  PHONE CONNECTION LOGS
                </span>
              </div>
              
              {phoneConnected && (
                <div className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-500 self-start sm:self-auto">
                  DEVICE: {phoneDeviceName || 'Connected'} | LATENCY: {latencyMs !== null ? `${latencyMs}ms` : 'measuring...'}
                </div>
              )}

              <button
                onClick={() => setShowConsole(!showConsole)}
                className="text-[10px] font-mono font-bold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
              >
                {showConsole ? 'Hide Technical Console' : 'View Technical RFCOMM Console'}
              </button>
            </div>

            {showConsole && (
              <div className={`w-full h-40 p-4 rounded-xl border font-mono text-[10px] text-emerald-400 overflow-y-auto space-y-1 custom-scrollbar ${
                isLight ? 'bg-slate-900 border-slate-800' : 'bg-slate-950 border-slate-850'
              }`}>
                {logs.length === 0 ? (
                  <div className="text-slate-500">Console listening for RFCOMM handshake...</div>
                ) : (
                  logs.map((log, i) => <div key={i} className="leading-relaxed">{log}</div>)
                )}
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
};
