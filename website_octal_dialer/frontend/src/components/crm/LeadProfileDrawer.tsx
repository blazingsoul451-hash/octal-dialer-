import React, { useState, useEffect } from 'react';
import {
  X, User, Phone, Mail, Building, MapPin, Calendar, Clock,
  CheckCircle2, AlertCircle, Plus, PhoneCall, ShieldAlert, FileText, Send, Activity, Tag, Sparkles
} from 'lucide-react';

interface LeadProfileDrawerProps {
  isLight?: boolean;
  leadId: string | null;
  isOpen: boolean;
  onClose: () => void;
  serverUrl: string;
  authToken: string;
  onDialLead?: (phone: string, leadId: string, leadName: string) => void;
}

interface LeadProfileData {
  lead: {
    id: string;
    name?: string;
    businessName?: string;
    phone?: string;
    email?: string;
    address?: string;
    website?: string;
    source?: string;
    status?: string;
    campaignName?: string;
    campaignId?: string;
    createdAt?: string;
  };
  activities: Array<{
    id: string;
    eventType: string;
    description: string;
    username?: string;
    createdAt: string;
  }>;
  callLogs: Array<{
    id: string;
    outcome: string;
    duration: number;
    timestamp: string;
  }>;
  followUps: Array<{
    id: string;
    scheduledAt: string;
    status: string;
    notes?: string;
    assignedAgent?: string;
  }>;
}

export const LeadProfileDrawer: React.FC<LeadProfileDrawerProps> = ({
  isLight,
  leadId,
  isOpen,
  onClose,
  serverUrl,
  authToken,
  onDialLead
}) => {
  const [data, setData] = useState<LeadProfileData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Quick note form
  const [newNote, setNewNote] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);

  // Schedule follow up modal in drawer
  const [showFollowUpForm, setShowFollowUpForm] = useState(false);
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpNotes, setFollowUpNotes] = useState('');
  const [submittingFollowUp, setSubmittingFollowUp] = useState(false);

  const fetchProfile = async () => {
    if (!leadId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/api/crm/leads/${leadId}/profile`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        const errJson = await res.json();
        setError(errJson.error || 'Failed to load lead profile');
      }
    } catch (err: any) {
      setError(err.message || 'Connection error while loading lead profile');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && leadId) {
      fetchProfile();
    } else {
      setData(null);
    }
  }, [isOpen, leadId]);

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim() || !leadId) return;
    setSubmittingNote(true);
    try {
      const res = await fetch(`${serverUrl}/api/crm/leads/${leadId}/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ note: newNote.trim() })
      });
      if (res.ok) {
        setNewNote('');
        fetchProfile();
      }
    } catch {
      // Ignored
    } finally {
      setSubmittingNote(false);
    }
  };

  const handleScheduleFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!followUpDate || !leadId || !data) return;
    setSubmittingFollowUp(true);
    try {
      const res = await fetch(`${serverUrl}/api/crm/follow-ups`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          leadId,
          leadName: data.lead.name || data.lead.businessName || 'Lead',
          leadPhone: data.lead.phone || '',
          campaignId: data.lead.campaignId,
          campaignName: data.lead.campaignName,
          scheduledAt: new Date(followUpDate).toISOString(),
          notes: followUpNotes
        })
      });
      if (res.ok) {
        setShowFollowUpForm(false);
        setFollowUpDate('');
        setFollowUpNotes('');
        fetchProfile();
      }
    } catch {
      // Ignored
    } finally {
      setSubmittingFollowUp(false);
    }
  };

  if (!isOpen) return null;

  const leadName = data?.lead.name || data?.lead.businessName || 'Lead Profile';
  const phone = data?.lead.phone || '—';

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/80 backdrop-blur-md flex justify-end transition-opacity select-none">
      <div className={`w-full max-w-xl h-full shadow-2xl flex flex-col border-l transition-transform transform duration-300 ${
        isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#09090b] border-[#18181b] text-white'
      }`}>
        {/* Drawer Header */}
        <div className={`p-5 border-b flex items-center justify-between ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#121215] border-[#18181b]'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center font-bold text-amber-400 shadow-sm">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className={`text-base font-black font-display tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                {leadName}
              </h2>
              <p className="text-xs font-mono text-zinc-400 flex items-center gap-1.5 mt-0.5">
                <span className="font-bold text-zinc-300">{phone}</span>
                {data?.lead.status && (
                  <span className="px-2 py-0.5 rounded-full border text-[9px] font-bold uppercase bg-amber-500/10 text-amber-400 border-amber-500/30">
                    {data.lead.status}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onDialLead && data?.lead.phone && (
              <button
                onClick={() => onDialLead(data.lead.phone!, data.lead.id, leadName)}
                className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <PhoneCall className="w-3.5 h-3.5" />
                <span>Dial Now</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-xl border border-[#27272a] text-zinc-400 hover:text-white hover:bg-[#18181b] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Drawer Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 text-left">
          {loading && !data ? (
            <div className="h-64 flex items-center justify-center text-xs font-mono text-zinc-500">
              Loading lead intelligence timeline...
            </div>
          ) : error ? (
            <div className="p-4 border border-red-500/30 bg-red-500/10 text-red-400 rounded-2xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : data ? (
            <>
              {/* Contact Information Grid */}
              <div className={`p-4 border rounded-2xl space-y-3 ${
                isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#121215] border-[#27272a]'
              }`}>
                <h3 className="text-xs font-mono font-black uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5" />
                  <span>Lead Contact Card</span>
                </h3>

                <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                  <div>
                    <span className={`text-[10px] block uppercase font-bold ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>Phone Number</span>
                    <span className={`font-bold ${isLight ? 'text-slate-900' : 'text-zinc-200'}`}>{data.lead.phone || '—'}</span>
                  </div>
                  <div>
                    <span className={`text-[10px] block uppercase font-bold ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>Email Address</span>
                    <span className={`font-bold truncate block ${isLight ? 'text-slate-900' : 'text-zinc-200'}`}>{data.lead.email || '—'}</span>
                  </div>
                  <div>
                    <span className={`text-[10px] block uppercase font-bold ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>Organization / Company</span>
                    <span className={`font-bold truncate block ${isLight ? 'text-slate-900' : 'text-white'}`}>{data.lead.businessName || '—'}</span>
                  </div>
                  <div>
                    <span className={`text-[10px] block uppercase font-bold ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>Location / Address</span>
                    <span className={`font-bold truncate block ${isLight ? 'text-slate-800' : 'text-zinc-300'}`}>{data.lead.address || '—'}</span>
                  </div>
                  <div>
                    <span className={`text-[10px] block uppercase font-bold ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>Lead Source</span>
                    <span className="font-bold text-amber-500">{data.lead.source || 'Manual Import'}</span>
                  </div>
                  <div>
                    <span className={`text-[10px] block uppercase font-bold ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>Campaign Pipeline</span>
                    <span className={`font-bold truncate block ${isLight ? 'text-slate-900' : 'text-zinc-200'}`}>{data.lead.campaignName || 'General'}</span>
                  </div>
                </div>
              </div>

              {/* Follow-Up Quick Actions */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-mono font-black uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Scheduled Follow-Ups ({data.followUps.length})</span>
                  </h3>
                  <button
                    onClick={() => setShowFollowUpForm(!showFollowUpForm)}
                    className="text-xs text-amber-500 hover:text-amber-400 font-bold font-mono flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Schedule Callback</span>
                  </button>
                </div>

                {showFollowUpForm && (
                  <form onSubmit={handleScheduleFollowUp} className={`p-4 border rounded-2xl space-y-3 ${
                    isLight ? 'bg-white border-slate-200' : 'bg-[#121215] border-[#27272a]'
                  }`}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-xs">
                      <div>
                        <label className={`block text-[10px] uppercase font-bold mb-1 ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>Callback Date & Time</label>
                        <input
                          type="datetime-local"
                          required
                          value={followUpDate}
                          onChange={e => setFollowUpDate(e.target.value)}
                          className={`w-full px-3.5 py-2 rounded-xl border outline-none font-bold ${
                            isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-[#09090b] border-[#27272a] text-white'
                          }`}
                        />
                      </div>
                      <div>
                        <label className={`block text-[10px] uppercase font-bold mb-1 ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>Callback Notes</label>
                        <input
                          type="text"
                          placeholder="e.g. Call regarding enterprise quote"
                          value={followUpNotes}
                          onChange={e => setFollowUpNotes(e.target.value)}
                          className={`w-full px-3.5 py-2 rounded-xl border outline-none font-bold ${
                            isLight ? 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400' : 'bg-[#09090b] border-[#27272a] text-white'
                          }`}
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-1 font-mono text-xs">
                      <button
                        type="button"
                        onClick={() => setShowFollowUpForm(false)}
                        className={`px-3.5 py-2 rounded-xl border cursor-pointer ${
                          isLight ? 'border-slate-300 text-slate-700 hover:bg-slate-100' : 'border-[#27272a] text-zinc-400 hover:text-white'
                        }`}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={submittingFollowUp}
                        className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl transition cursor-pointer shadow-sm"
                      >
                        {submittingFollowUp ? 'Scheduling...' : 'Save Follow-Up'}
                      </button>
                    </div>
                  </form>
                )}

                {data.followUps.length > 0 && (
                  <div className="space-y-2">
                    {data.followUps.map(fu => (
                      <div key={fu.id} className={`p-3.5 border rounded-xl flex items-center justify-between text-xs font-mono ${
                        isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#121215] border-[#27272a]'
                      }`}>
                        <div>
                          <p className={`font-bold ${isLight ? 'text-slate-900' : 'text-zinc-200'}`}>{new Date(fu.scheduledAt).toLocaleString()}</p>
                          {fu.notes && <p className={`text-[11px] mt-0.5 ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>{fu.notes}</p>}
                        </div>
                        <span className={`px-2.5 py-0.5 rounded-full border text-[9px] font-bold uppercase ${
                          fu.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' : 'bg-amber-500/10 text-amber-500 border-amber-500/30'
                        }`}>
                          {fu.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Log Note Form */}
              <form onSubmit={handleAddNote} className="space-y-2">
                <label className={`block text-xs font-mono font-bold uppercase tracking-wider ${isLight ? 'text-slate-700' : 'text-zinc-400'}`}>
                  Add Interaction Note
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Enter activity note, call notes, or follow-up reason..."
                    value={newNote}
                    onChange={e => setNewNote(e.target.value)}
                    className={`flex-1 px-3.5 py-2.5 rounded-xl border text-xs font-mono outline-none focus:border-amber-500 ${
                      isLight ? 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400' : 'bg-[#121215] border-[#27272a] text-white placeholder:text-zinc-600'
                    }`}
                  />
                  <button
                    type="submit"
                    disabled={submittingNote || !newNote.trim()}
                    className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold text-xs font-mono rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-sm shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Log</span>
                  </button>
                </div>
              </form>

              {/* Activity Timeline Stream */}
              <div className="space-y-3 pt-2">
                <h3 className={`text-xs font-mono font-black uppercase tracking-wider flex items-center gap-1.5 ${isLight ? 'text-slate-700' : 'text-zinc-400'}`}>
                  <Activity className="w-3.5 h-3.5 text-amber-500" />
                  <span>Lead Activity History & Audit Trail</span>
                </h3>

                {data.activities.length === 0 ? (
                  <div className={`p-6 border border-dashed rounded-2xl text-center text-xs font-mono ${
                    isLight ? 'border-slate-300 text-slate-500' : 'border-[#27272a] text-zinc-500'
                  }`}>
                    No custom interactions logged yet. Add a note or make a call to start timeline.
                  </div>
                ) : (
                  <div className={`relative pl-6 space-y-4 border-l ml-3 ${isLight ? 'border-slate-200' : 'border-[#18181b]'}`}>
                    {data.activities.map(act => (
                      <div key={act.id} className="relative">
                        <div className={`absolute -left-[31px] top-1 w-2.5 h-2.5 rounded-full bg-amber-500 ring-4 ${isLight ? 'ring-slate-100' : 'ring-[#09090b]'}`} />
                        <div className={`p-3.5 border rounded-xl text-xs space-y-1 ${
                          isLight ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-[#121215] border-[#27272a] text-zinc-300'
                        }`}>
                          <div className={`flex items-center justify-between text-[10px] font-mono ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
                            <span className="font-bold text-amber-500 uppercase">{act.eventType.replace('_', ' ')}</span>
                            <span>{new Date(act.createdAt).toLocaleString()}</span>
                          </div>
                          <p className={`font-sans text-xs ${isLight ? 'text-slate-900' : 'text-white'}`}>{act.description}</p>
                          {act.username && (
                            <p className={`text-[9px] font-mono ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>By operator: {act.username}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
