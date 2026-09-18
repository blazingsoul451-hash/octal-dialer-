import React, { useState, useEffect, useMemo } from 'react';
import {
  Users, Building2, Calendar, Clock, PhoneCall,
  Search, ArrowRight, AlertCircle,
  Activity, Layers, RefreshCw, Tag, Phone, MapPin, Eye
} from 'lucide-react';
import { LeadProfileDrawer } from './LeadProfileDrawer';
import { FollowUpsPage } from './FollowUpsPage';
import type { Campaign } from '../../types';

interface CRMWorkspacePageProps {
  isLight?: boolean;
  serverUrl: string;
  authToken: string;
  campaigns: Campaign[];
  initialSubTab?: 'overview' | 'leads' | 'companies' | 'follow-ups' | 'activity';
  onDialLead?: (phone: string, leadId: string, leadName: string) => void;
  onNavigateTab?: (tab: string) => void;
}

export const CRMWorkspacePage: React.FC<CRMWorkspacePageProps> = ({
  isLight,
  serverUrl,
  authToken,
  campaigns,
  initialSubTab = 'overview',
  onDialLead,
  onNavigateTab: _onNavigateTab
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'leads' | 'companies' | 'follow-ups' | 'activity'>(initialSubTab);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // CRM Data State
  const [leads, setLeads] = useState<any[]>([]);
  const [followUps, setFollowUps] = useState<any[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [campaignFilter, setCampaignFilter] = useState('');

  // Fetch CRM overview data
  const fetchCRMData = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch leads
      const leadsRes = await fetch(`${serverUrl}/api/scraped-leads?limit=200`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (leadsRes.ok) {
        const json = await leadsRes.json();
        setLeads(json.leads || []);
      }

      // 2. Fetch follow-ups
      const fuRes = await fetch(`${serverUrl}/api/crm/follow-ups`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (fuRes.ok) {
        const json = await fuRes.json();
        setFollowUps(json.followUps || []);
      }
    } catch (err: any) {
      setError(err.message || 'Error fetching CRM workspace data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCRMData();
  }, [serverUrl, authToken]);

  useEffect(() => {
    if (initialSubTab) {
      setActiveSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  // Derived metrics
  const totalLeads = leads.length;
  const openFollowUps = followUps.filter(f => f.status === 'pending');
  const now = Date.now();
  const startOfToday = new Date(new Date().setHours(0, 0, 0, 0)).getTime();
  const endOfToday = startOfToday + 86400000;
  
  const dueTodayFollowUps = openFollowUps.filter(f => {
    const t = new Date(f.scheduledAt).getTime();
    return t >= startOfToday && t < endOfToday;
  });

  const overdueFollowUps = openFollowUps.filter(f => {
    return new Date(f.scheduledAt).getTime() < now;
  });

  // Extract unique companies from leads
  const companies = useMemo(() => {
    const map = new Map<string, any>();
    leads.forEach(l => {
      const compName = l.businessName || l.company || (l.name ? `${l.name} Organization` : 'Independent Client');
      if (!map.has(compName)) {
        map.set(compName, {
          name: compName,
          contactsCount: 1,
          phone: l.phone || '—',
          website: l.website,
          address: l.address,
          leads: [l]
        });
      } else {
        const item = map.get(compName);
        item.contactsCount++;
        item.leads.push(l);
      }
    });
    return Array.from(map.values());
  }, [leads]);

  // Filtered leads
  const filteredLeads = useMemo(() => {
    return leads.filter(l => {
      if (campaignFilter && l.campaignId !== campaignFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = (l.name || l.businessName || '').toLowerCase().includes(q);
        const matchPhone = (l.phone || '').includes(q);
        const matchEmail = (l.email || '').toLowerCase().includes(q);
        if (!matchName && !matchPhone && !matchEmail) return false;
      }
      return true;
    });
  }, [leads, campaignFilter, searchQuery]);

  return (
    <div className="space-y-6 text-left select-none">
      {/* ── CRM Master Header Card ── */}
      <div className={`p-6 border rounded-2xl shadow-2xl transition-colors ${
        isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#09090b] border-[#18181b] text-white'
      }`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center font-bold text-amber-400 shadow-sm">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className={`text-xl font-black font-display tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  CRM & Customer Intelligence Workspace
                </h1>
                <span className="px-2.5 py-0.5 rounded-full border text-[10px] font-bold font-mono uppercase bg-amber-500/10 text-amber-400 border-amber-500/30">
                  Relationship Command
                </span>
              </div>
              <p className="text-xs mt-1 text-zinc-400 font-medium">
                Central business workspace for contact profiles, pipeline progression, scheduled callbacks, and account history.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start lg:self-auto">
            <button
              onClick={fetchCRMData}
              disabled={loading}
              className={`p-2.5 rounded-xl border transition cursor-pointer ${
                isLight ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700' : 'bg-[#18181b] hover:bg-[#27272a] border-[#27272a] text-zinc-300'
              }`}
              title="Refresh CRM Records"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-500' : ''}`} />
            </button>
          </div>
        </div>

        {/* ── Internal Sub-Navigation Tabs ── */}
        <div className={`flex flex-wrap items-center gap-2 pt-6 border-t mt-6 select-none ${isLight ? 'border-slate-200' : 'border-[#18181b]'}`}>
          {[
            { id: 'overview', label: 'CRM Overview', icon: Activity },
            { id: 'leads', label: `Contacts & Leads (${totalLeads})`, icon: Users },
            { id: 'companies', label: `Companies (${companies.length})`, icon: Building2 },
            { id: 'follow-ups', label: `Follow-Ups & Callbacks (${openFollowUps.length})`, icon: Calendar },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id as any)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold font-mono transition-all cursor-pointer border flex items-center gap-2 ${
                  isActive
                    ? 'bg-amber-500 text-black border-amber-500 shadow-sm font-black'
                    : isLight
                      ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                      : 'bg-[#18181b] hover:bg-[#27272a] border-[#27272a] text-zinc-300'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-black' : 'text-zinc-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="p-3.5 border text-xs rounded-2xl flex items-start gap-2.5 shadow-sm bg-red-500/10 border-red-500/30 text-red-400">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* ── Sub-Tab Content Rendering ── */}
      {activeSubTab === 'overview' && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono text-xs">
            <div className={`p-5 border rounded-2xl shadow-xl ${
              isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
            }`}>
              <div className="flex items-center justify-between text-zinc-400 text-[10px] font-black uppercase tracking-wider">
                <span>Total CRM Contacts</span>
                <Users className="w-4 h-4 text-amber-500" />
              </div>
              <div className={`text-2xl font-black mt-3 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                {totalLeads.toLocaleString()}
              </div>
              <p className="text-[10px] text-zinc-500 mt-1">{companies.length} distinct organizations</p>
            </div>

            <div className={`p-5 border rounded-2xl shadow-xl ${
              isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
            }`}>
              <div className="flex items-center justify-between text-zinc-400 text-[10px] font-black uppercase tracking-wider">
                <span>Open Follow-Ups</span>
                <Calendar className="w-4 h-4 text-purple-400" />
              </div>
              <div className={`text-2xl font-black mt-3 ${isLight ? 'text-slate-900' : 'text-purple-400'}`}>
                {openFollowUps.length}
              </div>
              <p className="text-[10px] text-zinc-500 mt-1">{dueTodayFollowUps.length} scheduled due today</p>
            </div>

            <div className={`p-5 border rounded-2xl shadow-xl ${
              isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
            }`}>
              <div className="flex items-center justify-between text-zinc-400 text-[10px] font-black uppercase tracking-wider">
                <span>Overdue Callbacks</span>
                <Clock className="w-4 h-4 text-red-400" />
              </div>
              <div className={`text-2xl font-black mt-3 ${overdueFollowUps.length > 0 ? 'text-red-400' : isLight ? 'text-slate-900' : 'text-zinc-400'}`}>
                {overdueFollowUps.length}
              </div>
              <p className="text-[10px] text-zinc-500 mt-1">Requires immediate agent action</p>
            </div>

            <div className={`p-5 border rounded-2xl shadow-xl ${
              isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
            }`}>
              <div className="flex items-center justify-between text-zinc-400 text-[10px] font-black uppercase tracking-wider">
                <span>Active Campaigns</span>
                <Layers className="w-4 h-4 text-blue-400" />
              </div>
              <div className={`text-2xl font-black mt-3 ${isLight ? 'text-slate-900' : 'text-blue-400'}`}>
                {campaigns.length}
              </div>
              <p className="text-[10px] text-zinc-500 mt-1">Outbound dialing pipelines</p>
            </div>
          </div>

          {/* Today's Operational Work & Recent Contacts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Today's Callbacks */}
            <div className={`p-6 border rounded-2xl shadow-2xl space-y-4 ${
              isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
            }`}>
              <div className={`flex items-center justify-between pb-3 border-b ${isLight ? 'border-slate-200' : 'border-[#18181b]'}`}>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-500" />
                  <h3 className={`text-xs font-mono font-black uppercase tracking-wider ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    Today's Priority Callbacks ({dueTodayFollowUps.length})
                  </h3>
                </div>
                <button
                  onClick={() => setActiveSubTab('follow-ups')}
                  className="text-xs font-mono text-amber-500 hover:text-amber-400 font-bold flex items-center gap-1 cursor-pointer"
                >
                  <span>View All</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {dueTodayFollowUps.length === 0 ? (
                <div className={`h-32 border border-dashed rounded-2xl flex flex-col items-center justify-center text-center p-4 text-xs font-mono ${
                  isLight ? 'border-slate-300 text-slate-500' : 'border-[#27272a] text-zinc-500'
                }`}>
                  No callbacks scheduled for today. You are all caught up!
                </div>
              ) : (
                <div className="space-y-2 font-mono text-xs">
                  {dueTodayFollowUps.slice(0, 5).map(fu => (
                    <div key={fu.id} className={`p-3.5 border rounded-xl flex items-center justify-between ${
                      isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#121215] border-[#27272a]'
                    }`}>
                      <div>
                        <button
                          onClick={() => setSelectedLeadId(fu.leadId)}
                          className="font-bold text-amber-500 hover:underline text-left block"
                        >
                          {fu.leadName || 'Contact'}
                        </button>
                        <p className={`text-[11px] mt-0.5 ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>{fu.leadPhone} • {fu.notes || 'General callback'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {onDialLead && fu.leadPhone && (
                          <button
                            onClick={() => onDialLead(fu.leadPhone, fu.leadId, fu.leadName)}
                            className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/20 cursor-pointer"
                            title="Dial Contact"
                          >
                            <PhoneCall className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Contacts */}
            <div className={`p-6 border rounded-2xl shadow-2xl space-y-4 ${
              isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
            }`}>
              <div className={`flex items-center justify-between pb-3 border-b ${isLight ? 'border-slate-200' : 'border-[#18181b]'}`}>
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-500" />
                  <h3 className={`text-xs font-mono font-black uppercase tracking-wider ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    Recent Customer Contacts
                  </h3>
                </div>
                <button
                  onClick={() => setActiveSubTab('leads')}
                  className="text-xs font-mono text-amber-500 hover:text-amber-400 font-bold flex items-center gap-1 cursor-pointer"
                >
                  <span>Explore Leads</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {leads.length === 0 ? (
                <div className={`h-32 border border-dashed rounded-2xl flex flex-col items-center justify-center text-center p-4 text-xs font-mono ${
                  isLight ? 'border-slate-300 text-slate-500' : 'border-[#27272a] text-zinc-500'
                }`}>
                  No contacts found in CRM. Import leads or run scrapers to populate.
                </div>
              ) : (
                <div className="space-y-2 font-mono text-xs">
                  {leads.slice(0, 5).map(l => (
                    <div key={l.id} className={`p-3.5 border rounded-xl flex items-center justify-between ${
                      isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#121215] border-[#27272a]'
                    }`}>
                      <div>
                        <button
                          onClick={() => setSelectedLeadId(l.id)}
                          className={`font-bold hover:text-amber-500 hover:underline text-left block ${isLight ? 'text-slate-900' : 'text-white'}`}
                        >
                          {l.businessName || l.name || 'Unnamed Lead'}
                        </button>
                        <p className={`text-[11px] mt-0.5 ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>{l.phone || 'No phone'} • {l.source || 'Manual'}</p>
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-full border text-[9px] font-bold uppercase ${
                        isLight ? 'bg-slate-100 text-slate-700 border-slate-200' : 'bg-[#18181b] text-zinc-400 border-[#27272a]'
                      }`}>
                        {l.status || 'NEW'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Sub-Tab: Leads & Contacts Explorer ── */}
      {activeSubTab === 'leads' && (
        <div className={`p-6 border rounded-2xl shadow-2xl space-y-4 ${
          isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
        }`}>
          <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b ${isLight ? 'border-slate-200' : 'border-[#18181b]'}`}>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-amber-500" />
              <h3 className={`text-xs font-mono font-black uppercase tracking-wider ${isLight ? 'text-slate-900' : 'text-white'}`}>
                CRM Contacts Directory ({filteredLeads.length})
              </h3>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative max-w-xs w-full">
                <Search className={`w-3.5 h-3.5 absolute left-3 top-2.5 ${isLight ? 'text-slate-400' : 'text-zinc-500'}`} />
                <input
                  type="text"
                  placeholder="Search contact, company, phone..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className={`w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border font-mono outline-none focus:border-amber-500 transition ${
                    isLight ? 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400' : 'bg-[#121215] border-[#27272a] text-white placeholder-zinc-500'
                  }`}
                />
              </div>

              {campaigns.length > 0 && (
                <select
                  value={campaignFilter}
                  onChange={e => setCampaignFilter(e.target.value)}
                  className={`text-xs rounded-xl border px-3.5 py-2 font-mono font-bold outline-none cursor-pointer ${
                    isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-[#121215] border-[#27272a] text-white'
                  }`}
                >
                  <option value="">All Campaigns</option>
                  {campaigns.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {filteredLeads.length === 0 ? (
            <div className={`h-32 border border-dashed rounded-2xl flex flex-col items-center justify-center text-center p-6 text-xs font-mono ${
              isLight ? 'border-slate-300 text-slate-500' : 'border-[#27272a] text-zinc-500'
            }`}>
              No contacts matching the search criteria.
            </div>
          ) : (
            <div className={`overflow-x-auto rounded-2xl border ${isLight ? 'border-slate-200' : 'border-[#18181b]'}`}>
              <table className="w-full text-left border-collapse text-xs font-mono">
                <thead>
                  <tr className={`border-b text-[10px] uppercase tracking-wider ${
                    isLight ? 'bg-slate-50 text-slate-600 border-slate-200' : 'bg-[#121215] text-zinc-400 border-[#18181b]'
                  }`}>
                    <th className="p-3.5">Contact / Organization</th>
                    <th className="p-3.5">Phone</th>
                    <th className="p-3.5">Email</th>
                    <th className="p-3.5">Source</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isLight ? 'divide-slate-200 text-slate-800' : 'divide-[#18181b] text-zinc-300'}`}>
                  {filteredLeads.map(l => (
                    <tr key={l.id} className={`${isLight ? 'hover:bg-slate-50' : 'hover:bg-[#121215]/60'} transition`}>
                      <td className="p-3.5 font-bold">
                        <button
                          onClick={() => setSelectedLeadId(l.id)}
                          className={`hover:text-amber-500 cursor-pointer text-left block transition ${isLight ? 'text-slate-900' : 'text-white'}`}
                        >
                          {l.businessName || l.name || 'Unnamed Contact'}
                        </button>
                      </td>
                      <td className={`p-3.5 font-bold ${isLight ? 'text-slate-800' : 'text-zinc-300'}`}>{l.phone || '—'}</td>
                      <td className={`p-3.5 truncate max-w-xs ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>{l.email || '—'}</td>
                      <td className="p-3.5">
                        <span className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>{l.source || 'Manual'}</span>
                      </td>
                      <td className="p-3.5">
                        <span className={`px-2.5 py-0.5 rounded-full border text-[9px] font-bold uppercase ${
                          isLight ? 'bg-slate-100 text-slate-700 border-slate-200' : 'bg-[#18181b] text-zinc-400 border-[#27272a]'
                        }`}>
                          {l.status || 'NEW'}
                        </span>
                      </td>
                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {onDialLead && l.phone && (
                            <button
                              onClick={() => onDialLead(l.phone, l.id, l.businessName || l.name || 'Lead')}
                              className="p-1.5 rounded-xl border border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10 cursor-pointer"
                              title="Direct Dial"
                            >
                              <PhoneCall className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => setSelectedLeadId(l.id)}
                            className={`p-1.5 rounded-xl border cursor-pointer ${
                              isLight ? 'border-slate-200 text-slate-600 hover:bg-slate-100' : 'border-[#27272a] text-zinc-400 hover:text-white hover:bg-[#18181b]'
                            }`}
                            title="View Intelligence Profile"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Sub-Tab: Companies Directory ── */}
      {activeSubTab === 'companies' && (
        <div className={`p-6 border rounded-2xl shadow-2xl space-y-4 ${
          isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
        }`}>
          <div className={`flex items-center justify-between pb-3 border-b ${isLight ? 'border-slate-200' : 'border-[#18181b]'}`}>
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-amber-500" />
              <h3 className={`text-xs font-mono font-black uppercase tracking-wider ${isLight ? 'text-slate-900' : 'text-white'}`}>
                Corporate Organizations & Accounts ({companies.length})
              </h3>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 font-mono text-xs">
            {companies.map((comp, idx) => (
              <div key={idx} className={`p-4 border rounded-2xl space-y-2 ${
                isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#121215] border-[#27272a]'
              }`}>
                <div className="flex items-start justify-between">
                  <h4 className={`font-bold truncate ${isLight ? 'text-slate-900' : 'text-white'}`}>{comp.name}</h4>
                  <span className="px-2.5 py-0.5 rounded-full border text-[9px] font-bold uppercase bg-amber-500/10 text-amber-500 dark:text-amber-400 border-amber-500/30 shrink-0">
                    {comp.contactsCount} contact{comp.contactsCount > 1 ? 's' : ''}
                  </span>
                </div>
                <div className={`text-[11px] space-y-1 pt-1 ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>
                  <div className="flex items-center gap-1.5">
                    <Phone className={`w-3 h-3 ${isLight ? 'text-slate-400' : 'text-zinc-500'}`} />
                    <span>{comp.phone}</span>
                  </div>
                  {comp.website && (
                    <div className="flex items-center gap-1.5 truncate">
                      <Tag className={`w-3 h-3 ${isLight ? 'text-slate-400' : 'text-zinc-500'}`} />
                      <span className="text-blue-500 truncate">{comp.website}</span>
                    </div>
                  )}
                  {comp.address && (
                    <div className="flex items-center gap-1.5 truncate">
                      <MapPin className={`w-3 h-3 ${isLight ? 'text-slate-400' : 'text-zinc-500'}`} />
                      <span className="truncate">{comp.address}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Sub-Tab: Follow-Ups & Callbacks ── */}
      {activeSubTab === 'follow-ups' && (
        <FollowUpsPage
          isLight={isLight}
          serverUrl={serverUrl}
          authToken={authToken}
          onDialLead={onDialLead}
        />
      )}

      {/* ── Lead Profile Intelligence Drawer ── */}
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
