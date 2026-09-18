import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, MessageSquare, X, Clock } from 'lucide-react';

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
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(60);

  const outcomeRef = useRef(outcome);
  const notesRef = useRef(notes);
  const isSavingRef = useRef(false);
  const autoSaveTimerRef = useRef<any>(null);

  useEffect(() => {
    outcomeRef.current = outcome;
  }, [outcome]);

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  const handleClose = () => {
    if (autoSaveTimerRef.current) {
      clearInterval(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    onClose();
  };

  const handleAutoSave = async () => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    setSaving(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      const finalNotes = notesRef.current.trim() 
        ? `${notesRef.current.trim()} [Auto-saved (Timeout)]` 
        : '[Auto-saved (Timeout)]';
      const res = await fetch(`${serverUrl}/api/logs/update`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          leadId,
          outcome: outcomeRef.current || 'ANSWERED',
          notes: finalNotes
        })
      });
      if (!res.ok) throw new Error('Disposition was not saved. Please retry.');
      const data: DispositionResult = await res.json();
      if (!data.success) throw new Error('Disposition was not acknowledged. Please retry.');
      onSaveSuccess(data);
      handleClose();
    } catch (err) {
      console.error('Error auto-saving disposition:', err);
      setSaveError('Auto-save failed. Your notes are still here; please retry.');
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

    setSaveError(null);
    setOutcome(initialOutcome || 'ANSWERED');
    setNotes('');
    setTimeLeft(60);
    isSavingRef.current = false;

    autoSaveTimerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          if (autoSaveTimerRef.current) {
            clearInterval(autoSaveTimerRef.current);
            autoSaveTimerRef.current = null;
          }
          handleAutoSave();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [isOpen, initialOutcome, leadId]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

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
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      const res = await fetch(`${serverUrl}/api/logs/update`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ leadId, outcome, notes })
      });
      if (res.ok) {
        const data: DispositionResult = await res.json();
        if (!data.success) throw new Error('Disposition was not acknowledged.');
        onSaveSuccess(data);
        handleClose();
      } else {
        throw new Error('Disposition was not saved.');
      }
    } catch (err) {
      console.error('Error saving disposition:', err);
      setSaveError('Save failed. Your notes are still here; please retry.');
    } finally {
      setSaving(false);
      isSavingRef.current = false;
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) {
          handleClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 text-left backdrop-blur-md bg-black/80 select-none"
    >
      <div className={`border p-6 rounded-2xl max-w-sm w-full space-y-4 shadow-2xl transition-colors ${
        isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#09090b] border-[#18181b] text-white'
      }`}>
        {saveError && <p role="alert" className="text-sm text-red-500">{saveError}</p>}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-amber-500 font-display font-bold">
            <ShieldCheck className="w-5 h-5 shrink-0" />
            <span>Save Call Disposition</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border shrink-0 flex items-center gap-1 ${
              timeLeft <= 10 
                ? 'bg-red-500/15 text-red-400 border-red-500/30 animate-pulse' 
                : isLight
                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
            }`}>
              <Clock className="w-3 h-3" />
              <span>{timeLeft}s</span>
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
        <div className="space-y-1">
          <p className="text-xs text-zinc-400 font-mono">Log final calling outcome for lead:</p>
          <p className={`text-sm font-bold uppercase ${isLight ? 'text-slate-900' : 'text-white'}`}>{leadName}</p>
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-zinc-400 uppercase font-bold">Call Outcome</label>
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              className={`w-full border focus:border-amber-500 rounded-xl px-3.5 py-2 text-xs font-mono font-bold focus:outline-none transition cursor-pointer ${
                isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-[#121215] border-[#27272a] text-white'
              }`}
            >
              <option value="ANSWERED">Answered & Spoke</option>
              <option value="INTERESTED">Interested Lead</option>
              <option value="NOT_INTERESTED">Not Interested</option>
              <option value="NO_ANSWER">No Answer / Missed</option>
              <option value="BUSY">Line Busy / Dropped</option>
              <option value="FAILED">Carrier Failed (Insufficient Balance / Unreachable)</option>
              <option value="CALLBACK_REQUESTED">Callback Requested</option>
              <option value="WRONG_NUMBER">Wrong Number</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-mono text-zinc-400 uppercase font-bold">Disposition Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add optional notes..."
              rows={3}
              className={`w-full border focus:border-amber-500 rounded-xl p-3 text-xs font-mono focus:outline-none transition ${
                isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-[#121215] border-[#27272a] text-white'
              }`}
            />
          </div>
        </div>

        <div className="flex gap-2 pt-2 font-mono">
          <button
            onClick={handleClose}
            disabled={saving}
            className={`flex-1 py-2 text-xs rounded-xl border transition cursor-pointer disabled:opacity-50 ${
              isLight ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700' : 'bg-[#18181b] border-[#27272a] text-zinc-400 hover:text-white'
            }`}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs uppercase tracking-wider rounded-xl transition cursor-pointer shadow-sm disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {saving ? 'Saving...' : 'Save Log'}
          </button>
        </div>
      </div>
    </div>
  );
};
