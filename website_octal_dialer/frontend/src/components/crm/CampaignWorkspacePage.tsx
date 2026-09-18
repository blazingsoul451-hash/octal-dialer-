import React, { useState, useEffect, useMemo } from 'react';
import {
  Layers, Play, Upload, PhoneCall, CheckCircle2,
  Search, BarChart3, AlertCircle, Users
} from 'lucide-react';
import { LeadProfileDrawer } from './LeadProfileDrawer';
import type { Campaign } from '../../types';

interface CampaignWorkspacePageProps {
  isLight?: boolean;
  serverUrl: string;
  authToken: string;
  campaigns: Campaign[];
  onSelectCampaignForDialer: (campaignId: string) => void;
  onNavigateTab: (tab: string) => void;
}

interface CampaignStats {
  totalLeads: number;
  completedLeads: number;
  pendingLeads: number;
  callingLeads: number;
  answeredLeads: number;
  noAnswerLeads: number;
  voicemailLeads: number;
  answerRate: string;
}

export const CampaignWorkspacePage: React.FC<CampaignWorkspacePageProps> = ({
  isLight,
  serverUrl,
  authToken,
  campaigns,
  onSelectCampaignForDialer,
  onNavigateTab
}) => {
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>(campaigns[0]?.id || '');
  const [campaignStats, setCampaignStats] = useState<CampaignStats | null>(null);
  const [campaignLeads, setCampaignLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [searchLeadQuery, setSearchLeadQuery] = useState('');

  // Synchronize initial campaign selection
  useEffect(() => {
    if (!selectedCampaignId && campaigns.length > 0) {
      setSelectedCampaignId(campaigns[0].id);
    }
  }, [campaigns, selectedCampaignId]);

  const fetchCampaignData = async () => {
    if (!selectedCampaignId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/api/crm/campaigns/${selectedCampaignId}/workspace`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCampaignStats(data.stats);
        setCampaignLeads(data.leads || []);
      } else {
        const errJson = await res.json();
        setError(errJson.error || 'Failed to load campaign data');
      }
    } catch (err: any) {
      setError(err.message || 'Connection error while loading campaign');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedCampaignId) {
      fetchCampaignData();
    }
  }, [selectedCampaignId, serverUrl, authToken]);

  const activeCampaign = campaigns.find(c => c.id === selectedCampaignId) || campaigns[0];

  const filteredLeads = useMemo(() => {
    if (!searchLeadQuery.trim()) return campaignLeads;
    const q = searchLeadQuery.toLowerCase();
    return campaignLeads.filter(l =>
      (l.name || '').toLowerCase().includes(q) ||
      (l.phone || '').includes(q) ||
      (l.status || '').toLowerCase().includes(q)
    );
  }, [campaignLeads, searchLeadQuery]);

  const contacted = campaignStats?.completedLeads || 0;
  const total = campaignStats?.totalLeads || activeCampaign?.leadCount || 1;
  const progressPct = Math.min(100, Math.round((contacted / (total || 1)) * 100));

  return (
    <div className="space-y-6 text-left select-none">
      {/* ── Header Card ── */}
      <div className={`p-6 border rounded-2xl shadow-2xl transition-colors ${
        isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#09090b] border-[#18181b] text-white'
      }`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center font-bold text-amber-400 shadow-sm">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className={`text-xl font-black font-display tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  Campaign Workspace & Intelligence
                </h1>
                <span className="px-2.5 py-0.5 rounded-full border text-[9px] font-mono font-bold uppercase bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                  Active Pipeline
                </span>
              </div>
              <p className="text-xs mt-1 text-zinc-400 font-medium">
                Operational command for dialing queues, lead stage progression, and conversion telemetry.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {campaigns.length > 1 && (
              <select
                value={selectedCampaignId}
                onChange={e => setSelectedCampaignId(e.target.value)}
                className={`text-xs rounded-xl border px-3.5 py-2 font-mono font-bold outline-none cursor-pointer ${
                  isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-[#121215] border-[#27272a] text-white'
                }`}
              >
                {campaigns.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.leadCount} leads)
                  </option>
                ))}
              </select>
            )}

            <button
              onClick={() => {
                if (activeCampaign?.id) onSelectCampaignForDialer(activeCampaign.id);
                onNavigateTab('dialer');
              }}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs font-mono uppercase tracking-wider rounded-xl shadow-sm transition flex items-center gap-2 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Launch Dialer</span>
            </button>

            <button
              onClick={() => onNavigateTab('upload')}
              className={`px-3.5 py-2 border rounded-xl font-mono text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                isLight ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-800' : 'bg-[#18181b] hover:bg-[#27272a] border-[#27272a] text-zinc-200'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Import Leads</span>
            </button>
          </div>
        </div>

        {/* ── Progress Bar ── */}
        <div className={`pt-6 border-t mt-6 space-y-2.5 ${isLight ? 'border-slate-200' : 'border-[#18181b]'}`}>
          <div className="flex justify-between text-xs font-mono">
            <span className="text-zinc-400 font-bold">Campaign Dialing Progress:</span>
            <span className="font-bold text-amber-400">
              {contacted.toLocaleString()} / {total.toLocaleString()} leads contacted ({progressPct}%)
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-[#121215] border border-[#27272a] overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-500 to-emerald-500 transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3.5 border text-xs font-mono rounded-2xl flex items-start gap-2.5 shadow-sm bg-red-500/10 border-red-500/30 text-red-400">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* ── KPI Cards Grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono text-xs">
        <div className={`p-5 border rounded-2xl shadow-xl ${
          isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
        }`}>
          <div className="flex items-center justify-between text-zinc-400 text-[10px] font-black uppercase tracking-wider">
            <span>Total Pipeline Leads</span>
            <Users className="w-4 h-4 text-amber-500" />
          </div>
          <div className={`text-2xl font-black mt-3 ${isLight ? 'text-slate-900' : 'text-white'}`}>
            {total.toLocaleString()}
          </div>
          <p className="text-[10px] text-zinc-500 mt-1">Source: {activeCampaign?.fileName || 'Manual'}</p>
        </div>

        <div className={`p-5 border rounded-2xl shadow-xl ${
          isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
        }`}>
          <div className="flex items-center justify-between text-zinc-400 text-[10px] font-black uppercase tracking-wider">
            <span>Contacted / Processed</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className={`text-2xl font-black mt-3 ${isLight ? 'text-slate-900' : 'text-emerald-400'}`}>
            {contacted.toLocaleString()}
          </div>
          <p className="text-[10px] text-zinc-500 mt-1">{total - contacted} leads pending in queue</p>
        </div>

        <div className={`p-5 border rounded-2xl shadow-xl ${
          isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
        }`}>
          <div className="flex items-center justify-between text-zinc-400 text-[10px] font-black uppercase tracking-wider">
            <span>Answered Calls</span>
            <PhoneCall className="w-4 h-4 text-blue-400" />
          </div>
          <div className={`text-2xl font-black mt-3 ${isLight ? 'text-slate-900' : 'text-blue-400'}`}>
            {campaignStats?.answeredLeads ?? 0}
          </div>
          <p className="text-[10px] text-zinc-500 mt-1">Live voice connects</p>
        </div>

        <div className={`p-5 border rounded-2xl shadow-xl ${
          isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
        }`}>
          <div className="flex items-center justify-between text-zinc-400 text-[10px] font-black uppercase tracking-wider">
            <span>Answer Connect Rate</span>
            <BarChart3 className="w-4 h-4 text-purple-400" />
          </div>
          <div className={`text-2xl font-black mt-3 ${isLight ? 'text-slate-900' : 'text-purple-400'}`}>
            {campaignStats?.answerRate ?? '0.0'}%
          </div>
          <p className="text-[10px] text-zinc-500 mt-1">Connect efficiency</p>
        </div>
      </div>

      {/* ── Campaign Leads Table ── */}
      <div className={`p-6 border rounded-2xl shadow-2xl space-y-4 ${
        isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
      }`}>
        <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b ${isLight ? 'border-slate-200' : 'border-[#18181b]'}`}>
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-amber-500" />
            <h3 className={`text-xs font-mono font-black uppercase tracking-wider ${isLight ? 'text-slate-900' : 'text-white'}`}>
              Pipeline Leads ({filteredLeads.length})
            </h3>
          </div>

          <div className="relative max-w-xs w-full">
            <Search className={`w-3.5 h-3.5 absolute left-3 top-2.5 ${isLight ? 'text-slate-400' : 'text-zinc-500'}`} />
            <input
              type="text"
              placeholder="Search leads in campaign..."
              value={searchLeadQuery}
              onChange={e => setSearchLeadQuery(e.target.value)}
              className={`w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border font-mono outline-none focus:border-amber-500 transition ${
                isLight ? 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400' : 'bg-[#121215] border-[#27272a] text-white placeholder:text-zinc-600'
              }`}
            />
          </div>
        </div>

        {loading && campaignLeads.length === 0 ? (
          <div className={`h-40 flex items-center justify-center text-xs font-mono ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
            Loading campaign pipeline leads...
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className={`h-32 border border-dashed rounded-2xl flex flex-col items-center justify-center text-center p-6 text-xs font-mono ${
            isLight ? 'border-slate-300 text-slate-500' : 'border-[#27272a] text-zinc-500'
          }`}>
            No leads found for this campaign. Click "Import Leads" to load records.
          </div>
        ) : (
          <div className={`overflow-x-auto rounded-2xl border ${isLight ? 'border-slate-200' : 'border-[#18181b]'}`}>
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className={`border-b text-[10px] uppercase tracking-wider ${
                  isLight ? 'bg-slate-50 text-slate-600 border-slate-200' : 'bg-[#121215] text-zinc-400 border-[#18181b]'
                }`}>
                  <th className="p-3.5">Lead Contact</th>
                  <th className="p-3.5">Phone</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5">Outcome</th>
                  <th className="p-3.5 text-right">Profile</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isLight ? 'divide-slate-200 text-slate-800' : 'divide-[#18181b] text-zinc-300'}`}>
                {filteredLeads.map(l => (
                  <tr key={l.id} className={`${isLight ? 'hover:bg-slate-50' : 'hover:bg-[#121215]/60'} transition`}>
                    <td className="p-3.5 font-bold">
                      <button
                        onClick={() => setSelectedLeadId(l.id)}
                        className={`cursor-pointer font-bold text-left transition hover:text-amber-500 ${isLight ? 'text-slate-900' : 'text-white'}`}
                      >
                        {l.name || 'Unnamed Contact'}
                      </button>
                    </td>
                    <td className={`p-3.5 font-bold ${isLight ? 'text-slate-800' : 'text-zinc-300'}`}>{l.phone || '—'}</td>
                    <td className="p-3.5">
                      <span className={`px-2.5 py-0.5 rounded-full border text-[9px] font-bold uppercase ${
                        l.status === 'COMPLETED'
                          ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                          : l.status === 'CALLING'
                            ? 'bg-blue-500/10 text-blue-500 border-blue-500/30 animate-pulse'
                            : isLight
                            ? 'bg-slate-100 text-slate-700 border-slate-200'
                            : 'bg-[#18181b] text-zinc-400 border-[#27272a]'
                      }`}>
                        {l.status || 'PENDING'}
                      </span>
                    </td>
                    <td className={`p-3.5 ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>{l.outcome || '—'}</td>
                    <td className="p-3.5 text-right">
                      <button
                        onClick={() => setSelectedLeadId(l.id)}
                        className={`px-3 py-1 rounded-xl border transition cursor-pointer text-[10px] font-bold ${
                          isLight ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700' : 'border-[#27272a] text-zinc-300 hover:text-white hover:bg-[#18181b]'
                        }`}
                      >
                        View Intelligence
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Lead Profile Drawer ── */}
      <LeadProfileDrawer
        isLight={isLight}
        leadId={selectedLeadId}
        isOpen={Boolean(selectedLeadId)}
        onClose={() => setSelectedLeadId(null)}
        serverUrl={serverUrl}
        authToken={authToken}
      />
    </div>
  );
};
