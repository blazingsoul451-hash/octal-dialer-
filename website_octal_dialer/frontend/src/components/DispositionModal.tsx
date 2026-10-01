import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck, X, Clock, Building2, User, Phone, Mail,
  PhoneCall, Check
} from 'lucide-react';

export interface DispositionResult {
  success: boolean;
  message?: string;
  nextLeadId?: string | null;
  nextLead?: {
    id: string;
    name: string;
    phone: string;
    campaignId: string;
    status: string;
  } | null;
}

interface DispositionModalProps {
  isOpen: boolean;
  leadId: string;
  leadName: string;
  initialOutcome?: string;
  onClose: () => void;
  serverUrl: string;
  authToken?: string;
  onSaveSuccess: (result?: DispositionResult) => void;
  isLight?: boolean;
}

export const DispositionModal: React.FC<DispositionModalProps> = ({
  isOpen,
  leadId,
  leadName,
  initialOutcome = 'ANSWERED',
  onClose,
  serverUrl,
  authToken,
  onSaveSuccess,
  isLight
}) => {
  const [outcome, setOutcome] = useState(initialOutcome);
  const [notes, setNotes] = useState('');
  const [contactName, setContactName] = useState(leadName);
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [pipelineStatus, setPipelineStatus] = useState('INTERESTED');

  // Quick Task & Timer configuration
  const [createTask, setCreateTask] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskMinutes, setTaskMinutes] = useState(30);
  const [taskPriority, setTaskPriority] = useState<'normal' | 'high' | 'urgent'>('high');

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(90);
  const timeLeftRef = useRef(90);
  const isInteracting = useRef(false);
  const interactionTimerRef = useRef<any>(null);
  const userEditedTaskTitleRef = useRef(false);

  const isSavingRef = useRef(false);
  const autoSaveTimerRef = useRef<any>(null);

  // Helper: mark user as interacting, auto-reset after 2s of inactivity
  const markInteracting = () => {
    isInteracting.current = true;
    if (interactionTimerRef.current) clearTimeout(interactionTimerRef.current);
    interactionTimerRef.current = setTimeout(() => {
      isInteracting.current = false;
    }, 2000);
  };

  // Fetch current lead data to pre-populate details
  useEffect(() => {
    if (!isOpen || !leadId) return;
    let isMounted = true;
    setContactName(leadName);
    setOutcome(initialOutcome || 'ANSWERED');
    setNotes('');
    setTimeLeft(90);
    timeLeftRef.current = 90;
    isInteracting.current = false;
    userEditedTaskTitleRef.current = false;
    if (interactionTimerRef.current) {
      clearTimeout(interactionTimerRef.current);
      interactionTimerRef.current = null;
    }
    setSaveError(null);
    setCreateTask(false);
    setTaskTitle('');
    setTaskMinutes(30);
    setTaskPriority('high');

    (async () => {
      try {
        const res = await fetch(`${serverUrl}/api/crm/leads/${leadId}`, {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {}
        });
        if (res.ok) {
          const data = await res.json();
          if (data.lead && isMounted) {
            if (data.lead.name) setContactName(data.lead.name);
            if (data.lead.phone) setPhone(data.lead.phone);
            if (data.lead.email) setEmail(data.lead.email);
            if (data.lead.crmCompanyName || data.lead.companyName) {
              setCompanyName(data.lead.crmCompanyName || data.lead.companyName);
            }
            if (data.lead.status) setPipelineStatus(data.lead.status);
          }
        }
      } catch {}
    })();

    return () => { isMounted = false; };
  }, [isOpen, leadId, leadName, initialOutcome, serverUrl, authToken]);

  // Update default task title when lead/company changes (unless user explicitly edited it)
  useEffect(() => {
    if (!userEditedTaskTitleRef.current) {
      const subject = companyName ? `${contactName} (${companyName})` : contactName;
      setTaskTitle(`Follow up with ${subject}`);
    }
  }, [contactName, companyName]);

  const handleClose = () => {
    if (autoSaveTimerRef.current) {
      clearInterval(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    if (interactionTimerRef.current) {
      clearTimeout(interactionTimerRef.current);
      interactionTimerRef.current = null;
    }
    isInteracting.current = false;
    userEditedTaskTitleRef.current = false;
    onClose();
  };

  const handleAutoSave = async () => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    setSaving(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const finalNotes = notes.trim()
        ? `${notes.trim()} [Auto-saved (Timeout)]`
        : '[Auto-saved (Timeout)]';

      const autoSavePayload: any = {
        leadId,
        outcome: outcome || 'ANSWERED',
        notes: finalNotes,
        leadName: contactName.trim(),
        companyName: companyName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        pipelineStatus
      };

      if (createTask && taskTitle.trim()) {
        const dueAt = new Date(Date.now() + taskMinutes * 60 * 1000).toISOString();
        autoSavePayload.task = {
          title: taskTitle.trim(),
          priority: taskPriority,
          dueAt,
          taskType: 'call',
          description: notes.trim() || undefined
        };
      }

      const res = await fetch(`${serverUrl}/api/logs/update`, {
        method: 'POST',
        headers,
        body: JSON.stringify(autoSavePayload)
      });

      if (!res.ok) throw new Error('Disposition was not saved.');
      const data: DispositionResult = await res.json();
      if (!data.success) throw new Error('Disposition was not acknowledged.');
      onSaveSuccess(data);
      handleClose();
    } catch (err) {
      console.error('Error auto-saving disposition:', err);
      setSaveError('Auto-save failed. Your entries are preserved; please retry.');
    } finally {
      setSaving(false);
      isSavingRef.current = false;
    }
  };

  useEffect(() => {
    if (!isOpen) {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      return;
    }

    autoSaveTimerRef.current = setInterval(() => {
      // Do not auto-save if the user is actively typing a note or editing a task
      if (isInteracting.current) return;

      if (timeLeftRef.current <= 1) {
        if (autoSaveTimerRef.current) {
          clearInterval(autoSaveTimerRef.current);
          autoSaveTimerRef.current = null;
        }
        timeLeftRef.current = 0;
        setTimeLeft(0);
        handleAutoSave();
      } else {
        timeLeftRef.current -= 1;
        setTimeLeft(timeLeftRef.current);
      }
    }, 1000);

    return () => {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [isOpen, outcome, notes, contactName, companyName, email, phone, pipelineStatus, createTask, taskTitle, taskMinutes, taskPriority]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    if (autoSaveTimerRef.current) {
      clearInterval(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    setSaving(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const payload: any = {
        leadId,
        outcome,
        notes: notes.trim(),
        leadName: contactName.trim(),
        companyName: companyName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        pipelineStatus
      };

      if (createTask && taskTitle.trim()) {
        const dueAt = new Date(Date.now() + taskMinutes * 60 * 1000).toISOString();
        payload.task = {
          title: taskTitle.trim(),
          priority: taskPriority,
          dueAt,
          taskType: 'call',
          description: notes.trim() || undefined
        };
      }

      const res = await fetch(`${serverUrl}/api/logs/update`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data: DispositionResult = await res.json();
        if (!data.success) throw new Error('Disposition was not acknowledged.');
        onSaveSuccess(data);
        handleClose();
      } else {
        throw new Error('Disposition was not saved.');
      }
    } catch (err: any) {
      console.error('Error saving disposition:', err);
      setSaveError(err.message || 'Save failed. Your notes are still here; please retry.');
    } finally {
      setSaving(false);
      isSavingRef.current = false;
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) handleClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 text-left backdrop-blur-md bg-black/80 select-none overflow-y-auto"
    >
      <div className={`border p-5 rounded-2xl max-w-lg w-full space-y-4 shadow-2xl transition-colors my-auto ${
        isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#0b0b0e] border-[#222226] text-white'
      }`}>
        {saveError && <p role="alert" className="text-xs text-red-500 font-bold bg-red-500/10 p-2 rounded-lg">{saveError}</p>}

        {/* Modal Top Header */}
        <div className="flex items-center justify-between gap-2 border-b border-zinc-800/60 pb-3">
          <div className="flex items-center gap-2 text-amber-500 font-display font-black text-sm">
            <ShieldCheck className="w-5 h-5 shrink-0" />
            <span>Call Disposition & Quick CRM Sync</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border shrink-0 flex items-center gap-1 ${
              timeLeft <= 15
                ? 'bg-red-500/15 text-red-400 border-red-500/30 animate-pulse'
                : isLight
                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
            }`}>
              <Clock className="w-3 h-3" />
              <span>{timeLeft}s auto-save</span>
            </span>
            <button
              onClick={handleClose}
              disabled={saving}
              className={`p-1 rounded-lg border transition cursor-pointer ${
                isLight ? 'border-slate-200 hover:bg-slate-100 text-slate-500' : 'border-[#27272a] hover:bg-[#18181b] text-zinc-400 hover:text-white'
              }`}
              title="Close (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 1. Call Outcome Selector */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-mono text-zinc-400 uppercase font-black tracking-wider flex items-center gap-1">
            <PhoneCall className="w-3 h-3 text-amber-500" />
            <span>Call Outcome (Result)</span>
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 font-mono text-[11px]">
            {[
              { id: 'ANSWERED', label: 'Answered', color: 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10' },
              { id: 'INTERESTED', label: 'Interested', color: 'border-amber-500/50 text-amber-300 bg-amber-500/15' },
              { id: 'CALLBACK_REQUESTED', label: 'Callback', color: 'border-blue-500/40 text-blue-400 bg-blue-500/10' },
              { id: 'NOT_INTERESTED', label: 'Not Interested', color: 'border-zinc-700 text-zinc-400 bg-zinc-800/40' },
              { id: 'NO_ANSWER', label: 'No Answer', color: 'border-zinc-700 text-zinc-400 bg-zinc-800/40' },
              { id: 'BUSY', label: 'Busy', color: 'border-zinc-700 text-zinc-400 bg-zinc-800/40' },
              { id: 'WRONG_NUMBER', label: 'Wrong No.', color: 'border-red-500/30 text-red-400 bg-red-500/10' },
              { id: 'FAILED', label: 'Failed', color: 'border-red-500/30 text-red-400 bg-red-500/10' },
            ].map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => setOutcome(item.id)}
                className={`py-1.5 px-2 rounded-xl border text-center font-bold transition cursor-pointer truncate ${
                  outcome === item.id
                    ? `${item.color} ring-1 ring-amber-500 font-black`
                    : 'border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* 2. Quick Lead Information Sync */}
        <div className="p-3 rounded-xl bg-[#121216]/80 border border-[#1f1f24] space-y-2.5">
          <span className="text-[10px] font-mono text-amber-400 uppercase font-black tracking-wider flex items-center gap-1.5">
            <User className="w-3 h-3 text-amber-500" />
            <span>Lead & Company Details</span>
          </span>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[9px] font-mono text-zinc-400 uppercase font-bold">Contact Name</label>
              <input
                type="text"
                value={contactName}
                onChange={(e) => { markInteracting(); setContactName(e.target.value); }}
                placeholder="Full Name"
                className="w-full px-2.5 py-1.5 bg-[#18181c] border border-[#27272a] rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="text-[9px] font-mono text-zinc-400 uppercase font-bold flex items-center gap-1">
                <Building2 className="w-2.5 h-2.5 text-amber-500" />
                <span>Company Name</span>
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => { markInteracting(); setCompanyName(e.target.value); }}
                placeholder="e.g. Acme Logistics"
                className="w-full px-2.5 py-1.5 bg-[#18181c] border border-[#27272a] rounded-lg text-xs text-white focus:outline-none focus:border-amber-500 placeholder-zinc-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[9px] font-mono text-zinc-400 uppercase font-bold flex items-center gap-1">
                <Phone className="w-2.5 h-2.5 text-zinc-400" />
                <span>Phone</span>
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => { markInteracting(); setPhone(e.target.value); }}
                placeholder="Phone number"
                className="w-full px-2.5 py-1.5 bg-[#18181c] border border-[#27272a] rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="text-[9px] font-mono text-zinc-400 uppercase font-bold flex items-center gap-1">
                <Mail className="w-2.5 h-2.5 text-zinc-400" />
                <span>Email</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => { markInteracting(); setEmail(e.target.value); }}
                placeholder="client@domain.com"
                className="w-full px-2.5 py-1.5 bg-[#18181c] border border-[#27272a] rounded-lg text-xs text-white focus:outline-none focus:border-amber-500 placeholder-zinc-600"
              />
            </div>
          </div>

          {/* Pipeline Stage Pills */}
          <div>
            <label className="text-[9px] font-mono text-zinc-400 uppercase font-bold mb-1 block">Pipeline Stage</label>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[10px] font-mono">
              {[
                { id: 'HOT', label: '🔥 Hot Lead' },
                { id: 'INTERESTED', label: '👍 Interested' },
                { id: 'CALLBACK', label: '📞 Callback' },
                { id: 'QUALIFIED', label: '🎯 Qualified' },
                { id: 'NOT_INTERESTED', label: '❌ Lost / Not Int.' }
              ].map(st => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setPipelineStatus(st.id)}
                  className={`px-2 py-1 rounded-lg border font-bold shrink-0 transition ${
                    pipelineStatus === st.id
                      ? 'bg-amber-500 text-black border-amber-400 font-black'
                      : 'bg-[#18181c] border-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 3. Call Review & Notes */}
        <div className="space-y-1">
          <label className="text-[10px] font-mono text-zinc-400 uppercase font-bold">Call Review / Notes</label>
          <textarea
            value={notes}
            onChange={(e) => {
              markInteracting();
              setNotes(e.target.value);
            }}
            placeholder="Type call summary, client feedback, or review..."
            rows={2}
            className={`w-full border focus:border-amber-500 rounded-xl p-2.5 text-xs font-mono focus:outline-none transition ${
              isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-[#121215] border-[#27272a] text-white'
            }`}
          />
        </div>

        {/* 4. Quick Task with Timer ("Octal Accounts" Timer Feature) */}
        <div className="p-3 rounded-xl bg-gradient-to-br from-amber-500/5 to-transparent border border-amber-500/20 space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={createTask}
                onChange={(e) => {
                  markInteracting();
                  setCreateTask(e.target.checked);
                }}
                className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-amber-500 focus:ring-amber-500 cursor-pointer"
              />
              <span className="text-xs font-mono font-black text-amber-400 uppercase tracking-wide flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>Create Task with Countdown Timer</span>
              </span>
            </label>
            {createTask && (
              <span className="text-[10px] font-mono text-red-400 font-bold bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full">
                Turns RED on expiry
              </span>
            )}
          </div>

          {createTask && (
            <div className="space-y-2 pt-1 animate-fade-in text-xs">
              <input
                type="text"
                value={taskTitle}
                onChange={(e) => {
                  userEditedTaskTitleRef.current = true;
                  markInteracting();
                  setTaskTitle(e.target.value);
                }}
                placeholder="Task title (e.g. Call back with quote)"
                className="w-full px-2.5 py-1.5 bg-[#18181c] border border-[#27272a] rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
              />

              <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono font-bold">
                <span className="text-zinc-400 mr-1">Timer Preset:</span>
                {[
                  { label: '15m', mins: 15 },
                  { label: '30m', mins: 30 },
                  { label: '1h', mins: 60 },
                  { label: '2h', mins: 120 },
                  { label: 'Tomorrow', mins: 1440 }
                ].map(p => (
                  <button
                    key={p.mins}
                    type="button"
                    onClick={() => setTaskMinutes(p.mins)}
                    className={`px-2 py-0.5 rounded-lg border transition ${
                      taskMinutes === p.mins
                        ? 'bg-amber-500 text-black border-amber-400 font-black shadow-sm'
                        : 'bg-[#18181c] border-zinc-800 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}

                <span className="ml-auto flex items-center gap-1">
                  <span className="text-zinc-400">Priority:</span>
                  {(['normal', 'high', 'urgent'] as const).map(pr => (
                    <button
                      key={pr}
                      type="button"
                      onClick={() => setTaskPriority(pr)}
                      className={`px-2 py-0.5 rounded-lg border uppercase ${
                        taskPriority === pr
                          ? pr === 'urgent' ? 'bg-red-500 text-white border-red-400 font-bold' : 'bg-amber-500 text-black border-amber-400 font-bold'
                          : 'bg-[#18181c] border-zinc-800 text-zinc-500'
                      }`}
                    >
                      {pr}
                    </button>
                  ))}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Action Buttons */}
        <div className="flex gap-2 pt-2 font-mono">
          <button
            onClick={handleClose}
            disabled={saving}
            className={`flex-1 py-2.5 text-xs rounded-xl border transition cursor-pointer disabled:opacity-50 ${
              isLight ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700' : 'bg-[#18181b] border-[#27272a] text-zinc-400 hover:text-white'
            }`}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-[2] py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-black text-xs uppercase tracking-wider rounded-xl transition cursor-pointer shadow-lg shadow-amber-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4" />
            <span>{saving ? 'Syncing CRM...' : 'Save & Next Lead'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
