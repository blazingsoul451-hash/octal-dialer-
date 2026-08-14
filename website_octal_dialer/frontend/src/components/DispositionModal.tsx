import React, { useState } from 'react';
import { ShieldCheck, MessageSquare } from 'lucide-react';

interface DispositionModalProps {
  isOpen: boolean;
  leadId: string;
  leadName: string;
  onClose: () => void;
  serverUrl: string;
  onSaveSuccess: () => void;
  isLight?: boolean;
}

export const DispositionModal: React.FC<DispositionModalProps> = ({
  isOpen,
  leadId,
  leadName,
  onClose,
  serverUrl,
  onSaveSuccess,
  isLight
}) => {
  const [outcome, setOutcome] = useState('ANSWERED');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${serverUrl}/api/logs/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, outcome, notes })
      });
      if (res.ok) {
        onSaveSuccess();
        onClose();
      }
    } catch (err) {
      console.error('Error saving disposition:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 text-left backdrop-blur-sm ${
      isLight ? 'bg-slate-900/40' : 'bg-slate-950/80'
    }`}>
      <div className={`border p-6 rounded-2xl max-w-sm w-full space-y-4 shadow-2xl transition-colors ${
        isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#0f172a] border-slate-800 text-white'
      }`}>
        <div className="flex items-center gap-2 text-amber-500 font-display font-bold">
          <ShieldCheck className="w-5 h-5" />
          <span>Save Call Disposition</span>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-slate-500">Log final calling outcome for lead:</p>
          <p className={`text-sm font-bold uppercase ${isLight ? 'text-slate-900' : 'text-white'}`}>{leadName}</p>
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-slate-500 uppercase font-bold">Call Outcome</label>
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              className={`w-full border focus:border-amber-500 rounded-xl px-3 py-2 text-xs focus:outline-none transition ${
                isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-850 text-white'
              }`}
            >
              <option value="ANSWERED">Answered / Completed</option>
              <option value="INTERESTED">Interested Lead</option>
              <option value="NOT_INTERESTED">Not Interested</option>
              <option value="NO_ANSWER">No Answer / Missed</option>
              <option value="BUSY">Line Busy</option>
              <option value="WRONG_NUMBER">Wrong Number</option>
              <option value="CALLBACK_REQUESTED">Callback Requested</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-mono text-slate-500 uppercase font-bold">Disposition Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add optional notes..."
              rows={3}
              className={`w-full border focus:border-amber-500 rounded-xl p-3 text-xs focus:outline-none transition ${
                isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-850 text-white'
              }`}
            />
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            onClick={onClose}
            className={`flex-1 py-2 text-xs font-mono rounded-xl border transition cursor-pointer ${
              isLight ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700' : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs font-mono uppercase tracking-wider rounded-xl transition cursor-pointer shadow-lg shadow-amber-500/20"
          >
            {saving ? 'Saving...' : 'Save Log'}
          </button>
        </div>
      </div>
    </div>
  );
};
