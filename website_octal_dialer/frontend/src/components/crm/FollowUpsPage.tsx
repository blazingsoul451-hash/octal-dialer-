import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar, Clock, CheckCircle2, XCircle, Search, Filter, RefreshCw,
  AlertCircle, PhoneCall, User, ArrowRight, Check, X, Plus
} from 'lucide-react';
import { LeadProfileDrawer } from './LeadProfileDrawer';

interface FollowUp {
  id: string;
  leadId: string;
  leadName: string;
  leadPhone: string;
  campaignId?: string;
  campaignName?: string;
  tenantId: string;
  userId?: string;
  assignedAgent?: string;
  scheduledAt: string;
  status: 'pending' | 'completed' | 'cancelled' | 'rescheduled';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

interface FollowUpsPageProps {
  isLight?: boolean;
  serverUrl: string;
  authToken: string;
  onDialLead?: (phone: string, leadId: string, leadName: string) => void;
}

export const FollowUpsPage: React.FC<FollowUpsPageProps> = ({
  isLight,
  serverUrl,
  authToken,
  onDialLead
}) => {
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<'all' | 'today' | 'upcoming' | 'overdue' | 'completed'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  const fetchFollowUps = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/api/crm/follow-ups`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setFollowUps(data.followUps || []);
      } else {
        const errJson = await res.json();
        setError(errJson.error || 'Failed to fetch scheduled follow-ups');
      }
    } catch (err: any) {
      setError(err.message || 'Connection error while fetching follow-ups');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFollowUps();
  }, [serverUrl, authToken]);

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      const res = await fetch(`${serverUrl}/api/crm/follow-ups/${id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        fetchFollowUps();
      }
    } catch {
      // Ignored
    }
  };

  // Filter follow-ups by tab and search
  const filteredFollowUps = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfToday = startOfToday + 24 * 60 * 60 * 1000;

    return followUps.filter(fu => {
      const schedTime = new Date(fu.scheduledAt).getTime();
      const isPending = fu.status === 'pending';

      // Tab filtering
      if (filterTab === 'today') {
        if (!isPending || schedTime < startOfToday || schedTime >= endOfToday) return false;
      } else if (filterTab === 'upcoming') {
        if (!isPending || schedTime < endOfToday) return false;
      } else if (filterTab === 'overdue') {
        if (!isPending || schedTime >= now.getTime()) return false;
      } else if (filterTab === 'completed') {
        if (fu.status !== 'completed') return false;
      }

      // Search query filtering
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = (fu.leadName || '').toLowerCase().includes(q);
        const matchPhone = (fu.leadPhone || '').includes(q);
        const matchNotes = (fu.notes || '').toLowerCase().includes(q);
        if (!matchName && !matchPhone && !matchNotes) return false;
      }

      return true;
    });
  }, [followUps, filterTab, searchQuery]);

  return (
    <div className="space-y-6 select-none text-left">
      {/* ── Page Header Card ── */}
      <div className={`p-6 border rounded-2xl shadow-2xl transition-colors ${
        isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#09090b] border-[#18181b] text-white'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center font-bold text-purple-400 shadow-sm">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h1 className={`text-xl font-black font-display tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                CRM Follow-Ups & Callbacks
              </h1>
              <p className="text-xs mt-1 text-zinc-400 font-medium">
                Track and execute scheduled customer callbacks, overdue leads, and appointment reminders.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={fetchFollowUps}
              disabled={loading}
              className={`p-2.5 rounded-xl border transition cursor-pointer ${
                isLight ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700' : 'bg-[#18181b] hover:bg-[#27272a] border-[#27272a] text-zinc-300'
              }`}
              title="Refresh follow-ups"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-500' : ''}`} />
            </button>
          </div>
        </div>

        {/* ── Tab Filter Chips ── */}
        <div className={`flex flex-wrap items-center gap-2 pt-6 border-t mt-6 select-none ${isLight ? 'border-slate-200' : 'border-[#18181b]'}`}>
          {[
            { id: 'all', label: `All Follow-Ups (${followUps.length})` },
            { id: 'today', label: 'Due Today' },
            { id: 'upcoming', label: 'Upcoming' },
            { id: 'overdue', label: 'Overdue Callbacks' },
            { id: 'completed', label: 'Completed' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilterTab(tab.id as any)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold font-mono transition-all cursor-pointer border ${
                filterTab === tab.id
                  ? 'bg-amber-500 text-black border-amber-500 shadow-sm font-black'
                  : isLight
                    ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                    : 'bg-[#18181b] hover:bg-[#27272a] border-[#27272a] text-zinc-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-3.5 border text-xs rounded-2xl flex items-start gap-2.5 shadow-sm bg-red-500/10 border-red-500/30 text-red-400">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500" />
        <input
          type="text"
          placeholder="Filter by contact name, phone, or notes..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className={`w-full pl-9 pr-3 py-2 text-xs rounded-xl border font-mono transition-colors outline-none focus:border-amber-500 ${
            isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#121215] border-[#27272a] text-white'
          }`}
        />
      </div>

      {/* Follow-Ups Table */}
      {loading && followUps.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-xs font-mono text-zinc-500">
          Loading scheduled callbacks...
        </div>
      ) : filteredFollowUps.length === 0 ? (
        <div className="h-40 border border-dashed rounded-2xl flex flex-col items-center justify-center text-center p-6 text-zinc-500 text-xs font-mono border-[#27272a]">
          No follow-up callbacks found matching current filters.
        </div>
      ) : (
        <div className={`overflow-x-auto rounded-2xl border ${isLight ? 'border-slate-200' : 'border-[#18181b]'}`}>
          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead>
              <tr className={`border-b text-[10px] uppercase tracking-wider ${
                isLight ? 'bg-slate-50 text-slate-600 border-slate-200' : 'bg-[#121215] text-zinc-400 border-[#18181b]'
              }`}>
                <th className="p-3.5">Contact Lead</th>
                <th className="p-3.5">Campaign Pipeline</th>
                <th className="p-3.5">Scheduled Date & Time</th>
                <th className="p-3.5">Notes / Agenda</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isLight ? 'divide-slate-200 text-slate-800' : 'divide-[#18181b] text-zinc-300'}`}>
              {filteredFollowUps.map(fu => {
                const schedDate = new Date(fu.scheduledAt);
                const isOverdue = fu.status === 'pending' && schedDate.getTime() < Date.now();

                return (
                  <tr key={fu.id} className={`${isLight ? 'hover:bg-slate-50' : 'hover:bg-[#121215]/60'} transition`}>
                    <td className="p-3.5">
                      <button
                        onClick={() => setSelectedLeadId(fu.leadId)}
                        className={`text-left font-bold hover:text-amber-500 hover:underline cursor-pointer block ${isLight ? 'text-slate-900' : 'text-white'}`}
                      >
                        {fu.leadName || 'Unnamed Contact'}
                      </button>
                      <span className={`text-[11px] font-bold ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>{fu.leadPhone}</span>
                    </td>
                    <td className={`p-3.5 ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>{fu.campaignName || 'General'}</td>
                    <td className="p-3.5">
                      <div className="flex items-center gap-1.5">
                        <Clock className={`w-3.5 h-3.5 ${isLight ? 'text-slate-400' : 'text-zinc-500'}`} />
                        <span className={`font-bold ${isOverdue ? 'text-red-500' : isLight ? 'text-slate-800' : 'text-zinc-200'}`}>
                          {schedDate.toLocaleDateString()} {schedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      {isOverdue && (
                        <span className="text-[9px] text-red-500 font-bold block mt-0.5 uppercase">
                          ● Overdue
                        </span>
                      )}
                    </td>
                    <td className={`p-3.5 max-w-xs truncate ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>{fu.notes || '—'}</td>
                    <td className="p-3.5">
                      <span className={`px-2.5 py-0.5 rounded-full border text-[9px] font-bold uppercase ${
                        fu.status === 'completed'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : isOverdue
                            ? 'bg-red-500/10 text-red-400 border-red-500/30'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                      }`}>
                        {fu.status}
                      </span>
                    </td>
                    <td className="p-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {onDialLead && fu.leadPhone && (
                          <button
                            onClick={() => onDialLead(fu.leadPhone, fu.leadId, fu.leadName)}
                            className="p-1.5 rounded-xl border border-[#27272a] text-emerald-400 hover:bg-emerald-500/10 transition cursor-pointer"
                            title="Dial Contact Now"
                          >
                            <PhoneCall className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {fu.status === 'pending' && (
                          <button
                            onClick={() => handleUpdateStatus(fu.id, 'completed')}
                            className="p-1.5 rounded-xl border border-[#27272a] text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition cursor-pointer"
                            title="Mark as Completed"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Lead Profile Drawer ── */}
      <LeadProfileDrawer
        isLight={isLight}
        leadId={selectedLeadId}
        isOpen={Boolean(selectedLeadId)}
        onClose={() => setSelectedLeadId(null)}
        serverUrl={serverUrl}
        authToken={authToken}
        onDialLead={onDialLead}
      />
    </div>
  );
};
