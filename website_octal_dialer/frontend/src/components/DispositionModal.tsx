import React, { useState, useEffect } from 'react';
import { ShieldCheck, MessageSquare, X } from 'lucide-react';

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
  leadPhone?: string;
  campaignName?: string;
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
  leadPhone,
  campaignName,
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

  useEffect(() => {
    if (isOpen) {
      setOutcome(initialOutcome || 'ANSWERED');
      setNotes('');
    }
  }, [isOpen, initialOutcome]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSave = async () => {
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
        onSaveSuccess(data);
        onClose();
      }
    } catch (err) {
      console.error('Error saving disposition:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 text-left backdrop-blur-md bg-black/80 select-none"
    >
      <div className={`border p-6 rounded-2xl max-w-sm w-full space-y-4 shadow-2xl transition-colors ${
        isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#09090b] border-[#18181b] text-white'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-amber-500 font-display font-bold">
            <ShieldCheck className="w-5 h-5" />
            <span>Save Call Disposition</span>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className={`p-1 rounded-lg border transition cursor-pointer ${
              isLight ? 'border-slate-200 hover:bg-slate-100 text-slate-500' : 'border-[#27272a] hover:bg-[#18181b] text-zinc-400 hover:text-white'
            }`}
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-2 p-3.5 rounded-2xl bg-amber-500/5 border border-amber-500/20">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-zinc-400 font-mono uppercase tracking-wider">
              Lead Calling Summary
            </span>
            {campaignName && (
              <span className="text-[10px] font-mono text-amber-500/90 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20 truncate max-w-[170px]" title={campaignName}>
                📁 {campaignName}
              </span>
            )}
          </div>
          
          <div className="space-y-1">
            {leadPhone ? (
              <div className="text-base font-mono font-black text-amber-400 tracking-widest flex items-center gap-2">
                <span>📞</span>
                <span>{leadPhone}</span>
              </div>
            ) : null}
            {leadName && (
              <div className="text-[11px] font-mono text-zinc-400 flex items-center gap-1.5 pt-0.5">
                <span className="uppercase tracking-wider text-zinc-500 font-bold">Contact:</span>
                <span className={`font-semibold ${isLight ? 'text-slate-800' : 'text-zinc-200'}`}>{leadName}</span>
              </div>
            )}
          </div>
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
            onClick={onClose}
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
