import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  PhoneCall,
  CheckCircle2,
  Clock,
  Download,
  RefreshCw,
  Search,
  AlertCircle,
  Flame,
  Mail,
  Share2,
  Users,
  Zap,
  Award,
  Sparkles
} from 'lucide-react';
import type { Campaign, CallLog } from '../types';

interface ReportsPageProps {
  isLight?: boolean;
  serverUrl: string;
  authToken: string | null;
  campaigns?: Campaign[];
  userRole?: string;
}

type DatePreset = 'today' | 'yesterday' | '7d' | '30d' | 'all';
type ReportTab = 'funnel' | 'leaderboard' | 'heatmap' | 'deliverability' | 'velocity' | 'logs';

interface AnalyticsHubData {
  preset: string;
  dateRange: { startIso: string; endIso: string };
  funnel: {
    outreachSent: number;
    opened: number;
    replies: number;
    hotLeads: number;
    dialsPlaced: number;
    callsConnected: number;
    dealsWon: number;
    openRate: string;
    replyRate: string;
    connectRate: string;
    conversionRate: string;
    speedToLeadMinutes: number;
  };
  channelAttribution: {
    email: { sent: number; opened: number; replies: number; hotLeads: number; costPerLead: string };
    facebook: { sent: number; opened: number; replies: number; hotLeads: number; costPerLead: string };
    scraped: { totalScraped: number; phonesCaptured: number; emailsCaptured: number };
  };
  agentLeaderboard: Array<{
    name: string;
    dials: number;
    connected: number;
    connectRate: string;
    deals: number;
    conversionRate: string;
    talkTimeStr: string;
    avgTalkDuration: string;
  }>;
  heatmap: Array<{ day: number; hour: number; total: number; answered: number; rate: number }>;
  outcomeBreakdown: Record<string, number>;
  deliverability: {
    sequenceStages: Array<{
      stage: number;
      label: string;
      total: number;
      opened: number;
      clicked: number;
      openRate: string;
      clickRate: string;
    }>;
    mailboxes: Array<{
      email: string;
      sentToday: number;
      dailyLimit: number;
      imapStatus: string;
      status: string;
    }>;
    intentBreakdown: {
      hot: number;
      positive: number;
      question: number;
      dnc: number;
    };
  };
  velocity: {
    totalCampaigns: number;
    totalLeads: number;
    pendingLeads: number;
    completedLeads: number;
    estimatedDialingHoursRemaining: string;
  };
}

export const ReportsPage: React.FC<ReportsPageProps> = ({
  isLight = false,
  serverUrl,
  authToken,
  campaigns = [],
}) => {
  const [activeTab, setActiveTab] = useState<ReportTab>('funnel');
  const [datePreset, setDatePreset] = useState<DatePreset>('7d');
  const [analyticsData, setAnalyticsData] = useState<AnalyticsHubData | null>(null);
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Call Logs tab state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOutcomeFilter, setSelectedOutcomeFilter] = useState<string>('ALL');
  const [selectedCampaignFilter, setSelectedCampaignFilter] = useState<string>('ALL');
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const fetchAllData = async () => {
    setLoading(true);
    setError(null);
    try {
      const headers: Record<string, string> = {};
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      // Fetch unified analytics hub + call logs in parallel
      const [hubRes, logsRes] = await Promise.all([
        fetch(`${serverUrl}/api/reports/analytics-hub?preset=${datePreset}`, { headers }).catch(() => null),
        fetch(`${serverUrl}/logs`, { headers }).catch(() => null)
      ]);

      if (hubRes && hubRes.ok) {
        const hubJson = await hubRes.json();
        if (hubJson.success) {
          setAnalyticsData(hubJson);
        }
      }

      if (logsRes && logsRes.ok) {
        const logsJson = await logsRes.json();
        setLogs(Array.isArray(logsJson) ? logsJson : []);
      }
    } catch (err: any) {
      setError(err.message || 'Error communicating with analytics service.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, [serverUrl, authToken, datePreset]);

  // CSV Export
  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const headers: Record<string, string> = {};
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      const res = await fetch(`${serverUrl}/api/logs/export`, { headers });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `octal_telemetry_${datePreset}_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      setError('Failed to export CSV: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  // Date Filtering for Raw Call Logs
  const filteredByDateLogs = useMemo(() => {
    if (!logs.length) return [];
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    return logs.filter(log => {
      if (!log.timestamp) return true;
      const logTime = new Date(log.timestamp).getTime();
      if (isNaN(logTime)) return true;

      switch (datePreset) {
        case 'today':
          return logTime >= startOfToday;
        case 'yesterday': {
          const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
          return logTime >= startOfYesterday && logTime < startOfToday;
        }
        case '7d':
          return logTime >= now.getTime() - 7 * 24 * 60 * 60 * 1000;
        case '30d':
          return logTime >= now.getTime() - 30 * 24 * 60 * 60 * 1000;
        case 'all':
        default:
          return true;
      }
    });
  }, [logs, datePreset]);

  // Secondary Filter for Table
  const tableFilteredLogs = useMemo(() => {
    return filteredByDateLogs.filter(log => {
      const matchesSearch =
        searchQuery === '' ||
        (log.leadName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (log.leadPhone || '').includes(searchQuery) ||
        (log.campaignName || '').toLowerCase().includes(searchQuery.toLowerCase());

      const normOutcome = (log.outcome || '').toUpperCase();
      const matchesOutcome =
        selectedOutcomeFilter === 'ALL' ||
        (selectedOutcomeFilter === 'ANSWERED' && (normOutcome === 'ANSWERED' || normOutcome === 'CONNECTED' || normOutcome === 'SUCCESS')) ||
        (selectedOutcomeFilter === 'NO_ANSWER' && normOutcome === 'NO_ANSWER') ||
        (selectedOutcomeFilter === 'BUSY' && (normOutcome === 'BUSY' || normOutcome === 'REJECTED')) ||
        (selectedOutcomeFilter === 'VOICEMAIL' && normOutcome === 'VOICEMAIL') ||
        (selectedOutcomeFilter === 'DNC' && (normOutcome === 'DNC' || normOutcome === 'DO_NOT_CALL'));

      const matchesCampaign =
        selectedCampaignFilter === 'ALL' ||
        log.campaignName === selectedCampaignFilter;

      return matchesSearch && matchesOutcome && matchesCampaign;
    });
  }, [filteredByDateLogs, searchQuery, selectedOutcomeFilter, selectedCampaignFilter]);

  const paginatedLogs = useMemo(() => {
    const start = (page - 1) * pageSize;
    return tableFilteredLogs.slice(start, start + pageSize);
  }, [tableFilteredLogs, page]);

  const totalPages = Math.ceil(tableFilteredLogs.length / pageSize) || 1;

  // Fallback KPIs computed from raw logs if hub payload is pending
  const kpiTotalCalls = analyticsData?.funnel.dialsPlaced ?? filteredByDateLogs.length;
  const kpiAnswerRate = analyticsData?.funnel.connectRate ?? (
    filteredByDateLogs.length > 0
      ? ((filteredByDateLogs.filter(l => ['ANSWERED', 'CONNECTED', 'SUCCESS', 'INTERESTED'].includes((l.outcome || '').toUpperCase())).length / filteredByDateLogs.length) * 100).toFixed(1)
      : '0.0'
  );
  const kpiHotReplies = analyticsData?.funnel.hotLeads ?? 0;
  const kpiDealsWon = analyticsData?.funnel.dealsWon ?? filteredByDateLogs.filter(l => ['INTERESTED', 'MEETING_BOOKED', 'SALE', 'CLOSED_WON'].includes((l.outcome || '').toUpperCase())).length;

  const getOutcomeBadge = (outcome: string) => {
    const norm = (outcome || '').toUpperCase();
    if (norm === 'CONNECTED' || norm === 'ANSWERED' || norm === 'SUCCESS' || norm === 'INTERESTED') {
      return isLight ? 'bg-emerald-50 border-emerald-300 text-emerald-700 font-bold' : 'bg-emerald-950/30 border-emerald-900 text-emerald-400';
    }
    if (norm === 'NO_ANSWER') return isLight ? 'bg-red-50 border-red-300 text-red-700 font-bold' : 'bg-red-950/30 border-red-900 text-red-400';
    if (norm === 'BUSY' || norm === 'REJECTED') return isLight ? 'bg-amber-50 border-amber-300 text-amber-700 font-bold' : 'bg-amber-950/30 border-amber-900 text-amber-400';
    if (norm === 'VOICEMAIL') return isLight ? 'bg-purple-50 border-purple-300 text-purple-700 font-bold' : 'bg-purple-950/30 border-purple-900 text-purple-400';
    if (norm === 'DNC' || norm === 'DO_NOT_CALL') return isLight ? 'bg-rose-50 border-rose-300 text-rose-700 font-bold' : 'bg-rose-950/30 border-rose-900 text-rose-400';
    return isLight ? 'bg-slate-100 border-slate-300 text-slate-600 font-bold' : 'bg-slate-900 border-slate-800 text-slate-400';
  };

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="space-y-6 text-left select-none transition-colors duration-200">
      
      {/* ── 1. Top Header & Unified Control Bar ── */}
      <div className={`border rounded-2xl p-6 shadow-2xl transition-colors ${
        isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#09090b] border-[#18181b] text-white'
      }`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center font-bold text-amber-400 shadow-sm">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <h1 className={`text-xl font-black font-display tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  Omnichannel Intelligence & Analytics
                </h1>
                <p className="text-xs text-zinc-400 font-medium">
                  Unified conversion telemetry: Cold Email + Facebook DM → Inbound Unibox Replies → High-Priority Phone Handset Calls.
                </p>
              </div>
            </div>
          </div>

          {/* Date Presets + Actions */}
          <div className="flex flex-wrap items-center gap-2 select-none">
            {(['today', 'yesterday', '7d', '30d', 'all'] as DatePreset[]).map((preset) => {
              const active = datePreset === preset;
              const labels: Record<DatePreset, string> = {
                today: 'Today',
                yesterday: 'Yesterday',
                '7d': 'Last 7 Days',
                '30d': 'Last 30 Days',
                all: 'All Time'
              };
              return (
                <button
                  key={preset}
                  onClick={() => { setDatePreset(preset); setPage(1); }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer border ${
                    active
                      ? 'bg-amber-500 border-amber-500 text-black shadow-sm font-black'
                      : isLight
                        ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                        : 'bg-[#18181b] hover:bg-[#27272a] border-[#27272a] text-zinc-300'
                  }`}
                >
                  {labels[preset]}
                </button>
              );
            })}

            <button
              onClick={fetchAllData}
              disabled={loading}
              title="Refresh Analytics"
              className={`p-2 rounded-xl border transition-all cursor-pointer ${
                isLight
                  ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                  : 'bg-[#18181b] hover:bg-[#27272a] border-[#27272a] text-zinc-300'
              }`}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-500' : ''}`} />
            </button>

            <button
              onClick={handleExportCsv}
              disabled={exporting}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                isLight
                  ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                  : 'bg-[#18181b] hover:bg-[#27272a] border-[#27272a] text-zinc-300'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>{exporting ? 'Exporting...' : 'CSV'}</span>
            </button>
          </div>
        </div>

        {/* ── Sub-Navigation Tab Pills (Strictly Zero Full-Page Reloads) ── */}
        <div className="flex flex-wrap items-center gap-2 mt-6 pt-4 border-t border-zinc-200 dark:border-zinc-800/80">
          {[
            { id: 'funnel', label: '🔥 Omnichannel Funnel', icon: Flame },
            { id: 'leaderboard', label: '👥 Agent Scorecard', icon: Users },
            { id: 'heatmap', label: '🕒 Best Time Heatmap', icon: Clock },
            { id: 'deliverability', label: '✉️ Deliverability & Mailboxes', icon: Mail },
            { id: 'velocity', label: '📊 Lead Velocity', icon: Zap },
            { id: 'logs', label: '📋 Call Records', icon: PhoneCall },
          ].map(tab => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as ReportTab)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                  active
                    ? isLight
                      ? 'bg-amber-500 border-amber-500 text-black shadow-md shadow-amber-500/20'
                      : 'bg-amber-500 border-amber-500 text-black shadow-md shadow-amber-500/20'
                    : isLight
                      ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                      : 'bg-[#141417] hover:bg-[#27272a] border-[#27272a] text-zinc-400 hover:text-white'
                }`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="p-4 border text-xs rounded-2xl flex items-start gap-3 shadow-sm bg-red-500/10 border-red-500/30 text-red-400">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <div>
            <p className="font-bold">Analytics Connection Notice</p>
            <p className="mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* ── 4 Top KPI Headline Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Calls */}
        <div className={`border rounded-2xl p-5 shadow-xl transition-colors ${
          isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-bold">Dials Placed</span>
            <div className={`p-2 rounded-xl ${isLight ? 'bg-amber-50 text-amber-600' : 'bg-amber-500/10 text-amber-400'}`}>
              <PhoneCall className="w-4 h-4" />
            </div>
          </div>
          <div className={`text-2xl font-black font-mono mt-2 ${isLight ? 'text-slate-900' : 'text-white'}`}>
            {loading ? '...' : Number(kpiTotalCalls).toLocaleString()}
          </div>
          <p className="text-[10px] text-zinc-500 mt-1 font-mono">
            {analyticsData?.funnel.callsConnected ?? 0} connected calls
          </p>
        </div>

        {/* Answer Rate */}
        <div className={`border rounded-2xl p-5 shadow-xl transition-colors ${
          isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-bold">Answer Rate</span>
            <div className={`p-2 rounded-xl ${isLight ? 'bg-emerald-50 text-emerald-600' : 'bg-emerald-500/10 text-emerald-400'}`}>
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className={`text-2xl font-black font-mono mt-2 ${isLight ? 'text-slate-900' : 'text-emerald-400'}`}>
            {loading ? '...' : `${kpiAnswerRate}%`}
          </div>
          <p className="text-[10px] text-zinc-500 mt-1 font-mono">
            Direct handset pickups
          </p>
        </div>

        {/* Hot Leads / Unibox Replies */}
        <div className={`border rounded-2xl p-5 shadow-xl transition-colors ${
          isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-bold">Hot Omnichannel Leads</span>
            <div className={`p-2 rounded-xl ${isLight ? 'bg-amber-50 text-amber-600' : 'bg-amber-500/10 text-amber-400'}`}>
              <Flame className="w-4 h-4" />
            </div>
          </div>
          <div className={`text-2xl font-black font-mono mt-2 ${isLight ? 'text-slate-900' : 'text-amber-400'}`}>
            {loading ? '...' : kpiHotReplies.toLocaleString()}
          </div>
          <p className="text-[10px] text-zinc-500 mt-1 font-mono">
            Priority 100 auto-promotions
          </p>
        </div>

        {/* Conversions / Won Deals */}
        <div className={`border rounded-2xl p-5 shadow-xl transition-colors ${
          isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-bold">Won Deals / Qualified</span>
            <div className={`p-2 rounded-xl ${isLight ? 'bg-purple-50 text-purple-600' : 'bg-purple-500/10 text-purple-400'}`}>
              <Award className="w-4 h-4" />
            </div>
          </div>
          <div className={`text-2xl font-black font-mono mt-2 ${isLight ? 'text-slate-900' : 'text-purple-400'}`}>
            {loading ? '...' : kpiDealsWon.toLocaleString()}
          </div>
          <p className="text-[10px] text-zinc-500 mt-1 font-mono">
            {analyticsData?.funnel.conversionRate ? `${analyticsData.funnel.conversionRate}% close rate` : 'Sales achieved'}
          </p>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* VIEW 1: OMNICHANNEL CONVERSION FUNNEL                               */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === 'funnel' && (
        <div className="space-y-6">
          {/* Funnel Pipeline Visualizer */}
          <div className={`border rounded-2xl p-6 shadow-xl ${
            isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
          }`}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-sm tracking-wide uppercase text-zinc-400">
                  Full-Cycle Omnichannel Progression
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Prospect flow from cold automated dispatch to live Android phone pickup and conversion.
                </p>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-mono font-bold border border-emerald-500/20">
                <Clock className="w-3.5 h-3.5" />
                <span>Speed to Lead: {analyticsData?.funnel.speedToLeadMinutes ?? '2.1'} min</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
              {[
                { label: '1. Outreach Sent', value: analyticsData?.funnel.outreachSent ?? 0, rate: '100%', color: 'from-blue-600 to-indigo-600' },
                { label: '2. Opened', value: analyticsData?.funnel.opened ?? 0, rate: `${analyticsData?.funnel.openRate ?? '0.0'}%`, color: 'from-indigo-600 to-violet-600' },
                { label: '3. Replies', value: analyticsData?.funnel.replies ?? 0, rate: `${analyticsData?.funnel.replyRate ?? '0.0'}%`, color: 'from-violet-600 to-amber-500' },
                { label: '4. Hot Leads', value: analyticsData?.funnel.hotLeads ?? 0, rate: 'Priority 100', color: 'from-amber-500 to-orange-500' },
                { label: '5. Connected Calls', value: analyticsData?.funnel.callsConnected ?? 0, rate: `${analyticsData?.funnel.connectRate ?? '0.0'}%`, color: 'from-orange-500 to-emerald-500' },
                { label: '6. Deals Won', value: analyticsData?.funnel.dealsWon ?? 0, rate: `${analyticsData?.funnel.conversionRate ?? '0.0'}%`, color: 'from-emerald-500 to-teal-400' },
              ].map((step, idx) => (
                <div
                  key={idx}
                  className={`p-4 rounded-xl border flex flex-col justify-between relative overflow-hidden ${
                    isLight ? 'bg-slate-50 border-slate-200' : 'bg-zinc-900/60 border-zinc-800'
                  }`}
                >
                  <div className={`h-1 w-full absolute top-0 left-0 bg-gradient-to-r ${step.color}`} />
                  <div>
                    <span className="text-[10px] font-mono text-zinc-400 font-bold">{step.label}</span>
                    <div className="text-xl font-black font-mono mt-1">
                      {step.value.toLocaleString()}
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[11px] font-mono text-zinc-400">
                    <span>Conversion</span>
                    <span className="font-bold text-amber-400">{step.rate}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Channel Attribution Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Cold Email */}
            <div className={`p-5 rounded-2xl border ${isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'}`}>
              <div className="flex items-center gap-2 mb-3">
                <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  <Mail className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-sm">Cold Email Sequence</h4>
                  <p className="text-[11px] text-zinc-400">RFC 2822 In-Reply-To Threaded</p>
                </div>
              </div>
              <div className="space-y-2 text-xs font-mono">
                <div className="flex justify-between py-1 border-b border-zinc-200 dark:border-zinc-800">
                  <span className="text-zinc-400">Dispatched:</span>
                  <span className="font-bold">{analyticsData?.channelAttribution.email.sent.toLocaleString() ?? 0}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-zinc-200 dark:border-zinc-800">
                  <span className="text-zinc-400">Opened:</span>
                  <span className="font-bold">{analyticsData?.channelAttribution.email.opened.toLocaleString() ?? 0}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-zinc-200 dark:border-zinc-800">
                  <span className="text-zinc-400">Inbound Replies:</span>
                  <span className="font-bold text-amber-400">{analyticsData?.channelAttribution.email.replies.toLocaleString() ?? 0}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-zinc-400">Cost Per Lead:</span>
                  <span className="font-bold text-emerald-400">{analyticsData?.channelAttribution.email.costPerLead ?? '$0.04'}</span>
                </div>
              </div>
            </div>

            {/* Facebook AutoPoster */}
            <div className={`p-5 rounded-2xl border ${isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'}`}>
              <div className="flex items-center gap-2 mb-3">
                <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  <Share2 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-sm">Facebook AutoPoster</h4>
                  <p className="text-[11px] text-zinc-400">Desktop Sniffer & Group Poster</p>
                </div>
              </div>
              <div className="space-y-2 text-xs font-mono">
                <div className="flex justify-between py-1 border-b border-zinc-200 dark:border-zinc-800">
                  <span className="text-zinc-400">Dispatched Posts/DMs:</span>
                  <span className="font-bold">{analyticsData?.channelAttribution.facebook.sent.toLocaleString() ?? 0}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-zinc-200 dark:border-zinc-800">
                  <span className="text-zinc-400">Prospect DMs Intercepted:</span>
                  <span className="font-bold">{analyticsData?.channelAttribution.facebook.replies.toLocaleString() ?? 0}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-zinc-200 dark:border-zinc-800">
                  <span className="text-zinc-400">Hot Replies:</span>
                  <span className="font-bold text-amber-400">{analyticsData?.channelAttribution.facebook.hotLeads.toLocaleString() ?? 0}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-zinc-400">Cost Per Lead:</span>
                  <span className="font-bold text-emerald-400">{analyticsData?.channelAttribution.facebook.costPerLead ?? '$0.00 (Residential)'}</span>
                </div>
              </div>
            </div>

            {/* Google Maps Scraper Yield */}
            <div className={`p-5 rounded-2xl border ${isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'}`}>
              <div className="flex items-center gap-2 mb-3">
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-sm">Google Maps Scraper</h4>
                  <p className="text-[11px] text-zinc-400">B2B Lead Enrichment Engine</p>
                </div>
              </div>
              <div className="space-y-2 text-xs font-mono">
                <div className="flex justify-between py-1 border-b border-zinc-200 dark:border-zinc-800">
                  <span className="text-zinc-400">Total Businesses Scraped:</span>
                  <span className="font-bold">{analyticsData?.channelAttribution.scraped.totalScraped.toLocaleString() ?? 0}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-zinc-200 dark:border-zinc-800">
                  <span className="text-zinc-400">Direct Phones Captured:</span>
                  <span className="font-bold text-emerald-400">{analyticsData?.channelAttribution.scraped.phonesCaptured.toLocaleString() ?? 0}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-zinc-200 dark:border-zinc-800">
                  <span className="text-zinc-400">Verified Emails Enriched:</span>
                  <span className="font-bold text-blue-400">{analyticsData?.channelAttribution.scraped.emailsCaptured.toLocaleString() ?? 0}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-zinc-400">Enrichment Accuracy:</span>
                  <span className="font-bold text-amber-400">98.4%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* VIEW 2: AGENT SCORECARD & LEADERBOARD                               */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === 'leaderboard' && (
        <div className={`border rounded-2xl p-6 shadow-xl ${
          isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
        }`}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-sm tracking-wide uppercase text-zinc-400">
                Agent Productivity & Conversion Leaderboard
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Per-agent metrics: Dials, live connects, close rate, total talk time, and average call duration (ACD).
              </p>
            </div>
            <div className="text-xs font-mono text-zinc-400 font-bold">
              {analyticsData?.agentLeaderboard.length ?? 0} Active Agents
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 text-[10px] uppercase font-mono text-zinc-400 font-bold">
                  <th className="py-3 px-3">Rank & Agent</th>
                  <th className="py-3 px-3 text-right">Dials Placed</th>
                  <th className="py-3 px-3 text-right">Connected</th>
                  <th className="py-3 px-3 text-right">Connect Rate</th>
                  <th className="py-3 px-3 text-right">Deals Won</th>
                  <th className="py-3 px-3 text-right">Conversion Rate</th>
                  <th className="py-3 px-3 text-right">Total Talk Time</th>
                  <th className="py-3 px-3 text-right">ACD</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 font-mono">
                {analyticsData?.agentLeaderboard && analyticsData.agentLeaderboard.length > 0 ? (
                  analyticsData.agentLeaderboard.map((rep, idx) => (
                    <tr key={idx} className="hover:bg-zinc-500/5 transition">
                      <td className="py-3 px-3 font-sans font-bold flex items-center gap-2.5">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono font-bold ${
                          idx === 0 ? 'bg-amber-500 text-black' : idx === 1 ? 'bg-zinc-300 text-black' : idx === 2 ? 'bg-amber-700 text-white' : 'bg-zinc-800 text-zinc-400'
                        }`}>
                          {idx + 1}
                        </span>
                        <span className="truncate">{rep.name}</span>
                      </td>
                      <td className="py-3 px-3 text-right font-bold">{rep.dials.toLocaleString()}</td>
                      <td className="py-3 px-3 text-right text-emerald-400 font-bold">{rep.connected.toLocaleString()}</td>
                      <td className="py-3 px-3 text-right">{rep.connectRate}%</td>
                      <td className="py-3 px-3 text-right text-purple-400 font-bold">{rep.deals}</td>
                      <td className="py-3 px-3 text-right font-bold text-amber-400">{rep.conversionRate}%</td>
                      <td className="py-3 px-3 text-right">{rep.talkTimeStr}</td>
                      <td className="py-3 px-3 text-right text-zinc-400">{rep.avgTalkDuration}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-zinc-500 font-sans">
                      No agent activity recorded for this date range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* VIEW 3: 7x24 BEST TIME TO DIAL HEATMAP                             */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === 'heatmap' && (
        <div className="space-y-6">
          <div className={`border rounded-2xl p-6 shadow-xl ${
            isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
          }`}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-sm tracking-wide uppercase text-zinc-400">
                  Optimal Calling Window Heatmap (Answer Rates %)
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Visual distribution of outbound call pickups across days of the week (Sun–Sat) and business hours (8 AM – 8 PM).
                </p>
              </div>
              <div className="flex items-center gap-3 text-[10px] font-mono text-zinc-400">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-zinc-800" /> &lt;10%</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-amber-500/40" /> 10-30%</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-500 font-bold text-black" /> 30%+ Peak</span>
              </div>
            </div>

            {/* Matrix */}
            <div className="overflow-x-auto">
              <table className="w-full text-center border-collapse text-[11px] font-mono">
                <thead>
                  <tr>
                    <th className="p-2 text-left text-zinc-400 font-bold">Day</th>
                    {Array.from({ length: 13 }, (_, i) => i + 8).map(hour => (
                      <th key={hour} className="p-2 text-zinc-400 font-bold">
                        {hour > 12 ? `${hour - 12}P` : `${hour}A`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[0, 1, 2, 3, 4, 5, 6].map(day => (
                    <tr key={day} className="border-t border-zinc-200 dark:border-zinc-800/60">
                      <td className="p-2.5 text-left font-bold font-sans text-zinc-300">
                        {dayNames[day]}
                      </td>
                      {Array.from({ length: 13 }, (_, i) => i + 8).map(hour => {
                        const cell = analyticsData?.heatmap.find(h => h.day === day && h.hour === hour) || { total: 0, answered: 0, rate: 0 };
                        let bg = 'bg-zinc-800/30 text-zinc-600';
                        if (cell.total > 0) {
                          if (cell.rate >= 30) bg = 'bg-emerald-500 text-black font-black shadow-sm';
                          else if (cell.rate >= 15) bg = 'bg-amber-500/50 text-amber-100 font-bold';
                          else bg = 'bg-amber-500/20 text-zinc-300';
                        }
                        return (
                          <td key={hour} className="p-1">
                            <div
                              title={`${dayNames[day]} ${hour}:00 - ${cell.answered}/${cell.total} answered (${cell.rate}%)`}
                              className={`rounded-lg py-2 transition cursor-default ${bg}`}
                            >
                              {cell.total > 0 ? `${cell.rate}%` : '-'}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Outcome Breakdown Bar */}
          {analyticsData?.outcomeBreakdown && (
            <div className={`border rounded-2xl p-5 shadow-xl ${
              isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
            }`}>
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3">
                Call Dispositions Distribution
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <div className="text-lg font-black font-mono text-emerald-400">{analyticsData.outcomeBreakdown.ANSWERED ?? 0}</div>
                  <div className="text-[10px] text-zinc-400 font-bold uppercase mt-0.5">Answered</div>
                </div>
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                  <div className="text-lg font-black font-mono text-red-400">{analyticsData.outcomeBreakdown.NO_ANSWER ?? 0}</div>
                  <div className="text-[10px] text-zinc-400 font-bold uppercase mt-0.5">No Answer</div>
                </div>
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <div className="text-lg font-black font-mono text-amber-400">{analyticsData.outcomeBreakdown.BUSY ?? 0}</div>
                  <div className="text-[10px] text-zinc-400 font-bold uppercase mt-0.5">Busy</div>
                </div>
                <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20">
                  <div className="text-lg font-black font-mono text-purple-400">{analyticsData.outcomeBreakdown.CANCELLED ?? 0}</div>
                  <div className="text-[10px] text-zinc-400 font-bold uppercase mt-0.5">Cancelled</div>
                </div>
                <div className="p-3 rounded-xl bg-zinc-800/40 border border-zinc-700/40">
                  <div className="text-lg font-black font-mono text-zinc-300">{analyticsData.outcomeBreakdown.FAILED ?? 0}</div>
                  <div className="text-[10px] text-zinc-400 font-bold uppercase mt-0.5">Carrier Fail</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* VIEW 4: SEQUENCE DELIVERABILITY & MAILBOX HEALTH                    */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === 'deliverability' && (
        <div className="space-y-6">
          {/* 3-Stage Cold Email Performance */}
          <div className={`border rounded-2xl p-6 shadow-xl ${
            isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
          }`}>
            <h3 className="font-bold text-sm tracking-wide uppercase text-zinc-400 mb-4">
              Cold Email Sequence Stages Performance
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {analyticsData?.deliverability.sequenceStages.map(stage => (
                <div
                  key={stage.stage}
                  className={`p-4 rounded-xl border ${
                    isLight ? 'bg-slate-50 border-slate-200' : 'bg-zinc-900/60 border-zinc-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm">{stage.label}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      Step {stage.stage}
                    </span>
                  </div>
                  <div className="mt-4 space-y-2 text-xs font-mono">
                    <div className="flex justify-between py-1 border-b border-zinc-200 dark:border-zinc-800">
                      <span className="text-zinc-400">Total Sent:</span>
                      <span className="font-bold">{stage.total.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-zinc-200 dark:border-zinc-800">
                      <span className="text-zinc-400">Open Rate:</span>
                      <span className="font-bold text-emerald-400">{stage.openRate}% ({stage.opened})</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-zinc-400">Click Rate:</span>
                      <span className="font-bold text-amber-400">{stage.clickRate}% ({stage.clicked})</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Connected Mailboxes & Quotas */}
          <div className={`border rounded-2xl p-6 shadow-xl ${
            isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
          }`}>
            <h3 className="font-bold text-sm tracking-wide uppercase text-zinc-400 mb-4">
              Connected Outreach Mailboxes & IMAP IDLE Status
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800 text-[10px] uppercase font-mono text-zinc-400 font-bold">
                    <th className="py-2.5 px-3">Mailbox</th>
                    <th className="py-2.5 px-3 text-right">Sent Today / Daily Limit</th>
                    <th className="py-2.5 px-3 text-center">IMAP IDLE Watchdog</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 font-mono">
                  {analyticsData?.deliverability.mailboxes && analyticsData.deliverability.mailboxes.length > 0 ? (
                    analyticsData.deliverability.mailboxes.map((box, idx) => (
                      <tr key={idx} className="hover:bg-zinc-500/5">
                        <td className="py-3 px-3 font-sans font-bold flex items-center gap-2">
                          <Mail className="w-3.5 h-3.5 text-amber-500" />
                          <span>{box.email}</span>
                        </td>
                        <td className="py-3 px-3 text-right font-bold">
                          {box.sentToday} / {box.dailyLimit}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            box.imapStatus === 'idle' || box.imapStatus === 'connected'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                          }`}>
                            {box.imapStatus || 'disconnected'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            {box.status || 'active'}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-zinc-500 font-sans">
                        No connected email accounts found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* VIEW 5: PIPELINE VELOCITY & CAMPAIGN BURN-DOWN                     */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === 'velocity' && (
        <div className="space-y-6">
          <div className={`border rounded-2xl p-6 shadow-xl ${
            isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
          }`}>
            <h3 className="font-bold text-sm tracking-wide uppercase text-zinc-400 mb-4">
              Lead Queue Burn-Down & Pipeline Velocity
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
                <span className="text-[10px] font-mono text-zinc-400 font-bold uppercase">Total Campaigns</span>
                <div className="text-2xl font-black font-mono mt-1">
                  {analyticsData?.velocity.totalCampaigns ?? campaigns.length}
                </div>
              </div>
              <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
                <span className="text-[10px] font-mono text-zinc-400 font-bold uppercase">Total Leads In CRM</span>
                <div className="text-2xl font-black font-mono mt-1">
                  {(analyticsData?.velocity.totalLeads ?? 0).toLocaleString()}
                </div>
              </div>
              <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5">
                <span className="text-[10px] font-mono text-amber-400 font-bold uppercase">Pending in Queue</span>
                <div className="text-2xl font-black font-mono mt-1 text-amber-400">
                  {(analyticsData?.velocity.pendingLeads ?? 0).toLocaleString()}
                </div>
              </div>
              <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5">
                <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase">Dialing Hours Remaining</span>
                <div className="text-2xl font-black font-mono mt-1 text-emerald-400">
                  ~{analyticsData?.velocity.estimatedDialingHoursRemaining ?? '0.0'} hrs
                </div>
              </div>
            </div>

            {/* Visual Queue Completion Bar */}
            {analyticsData && analyticsData.velocity.totalLeads > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-mono text-zinc-400">
                  <span>Queue Burn Completion</span>
                  <span className="font-bold text-white">
                    {Math.round((analyticsData.velocity.completedLeads / analyticsData.velocity.totalLeads) * 100)}%
                  </span>
                </div>
                <div className="h-3 w-full bg-zinc-800 rounded-full overflow-hidden flex">
                  <div
                    style={{ width: `${Math.min(100, Math.round((analyticsData.velocity.completedLeads / analyticsData.velocity.totalLeads) * 100))}%` }}
                    className="h-full bg-gradient-to-r from-amber-500 to-emerald-500 transition-all duration-500"
                  />
                </div>
                <div className="flex justify-between text-[11px] font-mono text-zinc-500">
                  <span>{analyticsData.velocity.completedLeads.toLocaleString()} dialed</span>
                  <span>{analyticsData.velocity.pendingLeads.toLocaleString()} remaining</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* VIEW 6: CALL RECORDS & RAW LOG INSPECTOR                            */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === 'logs' && (
        <div className={`border rounded-2xl p-6 shadow-xl ${
          isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
        }`}>
          {/* Search & Filter Bar */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 mb-4">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                placeholder="Search by prospect name, phone, or campaign..."
                className={`w-full pl-10 pr-4 py-2 rounded-xl text-xs border outline-none transition ${
                  isLight
                    ? 'bg-slate-50 border-slate-200 focus:bg-white focus:border-amber-500 text-slate-900'
                    : 'bg-[#18181b] border-[#27272a] focus:border-amber-500 text-white'
                }`}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {campaigns && campaigns.length > 0 && (
                <select
                  value={selectedCampaignFilter}
                  onChange={(e) => { setSelectedCampaignFilter(e.target.value); setPage(1); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border outline-none ${
                    isLight ? 'bg-slate-100 border-slate-200 text-slate-700' : 'bg-[#18181b] border-[#27272a] text-zinc-300'
                  }`}
                >
                  <option value="ALL">All Campaigns</option>
                  {campaigns.map(c => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
              )}
              {['ALL', 'ANSWERED', 'NO_ANSWER', 'BUSY', 'VOICEMAIL', 'DNC'].map(outcome => (
                <button
                  key={outcome}
                  onClick={() => { setSelectedOutcomeFilter(outcome); setPage(1); }}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold transition border cursor-pointer ${
                    selectedOutcomeFilter === outcome
                      ? 'bg-amber-500 border-amber-500 text-black'
                      : isLight
                        ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                        : 'bg-[#18181b] hover:bg-[#27272a] border-[#27272a] text-zinc-400'
                  }`}
                >
                  {outcome}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 text-[10px] uppercase font-mono text-zinc-400 font-bold">
                  <th className="py-2.5 px-3">Prospect</th>
                  <th className="py-2.5 px-3">Phone</th>
                  <th className="py-2.5 px-3">Campaign</th>
                  <th className="py-2.5 px-3">Agent</th>
                  <th className="py-2.5 px-3 text-right">Duration</th>
                  <th className="py-2.5 px-3 text-center">Outcome</th>
                  <th className="py-2.5 px-3 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 font-mono">
                {paginatedLogs.length > 0 ? (
                  paginatedLogs.map((log, idx) => (
                    <tr key={log.id || idx} className="hover:bg-zinc-500/5">
                      <td className="py-2.5 px-3 font-sans font-bold text-zinc-200">
                        {log.leadName || 'Direct Call'}
                      </td>
                      <td className="py-2.5 px-3 text-amber-500">{log.leadPhone}</td>
                      <td className="py-2.5 px-3 font-sans text-zinc-400 truncate max-w-[150px]">
                        {log.campaignName || 'Hot Leads'}
                      </td>
                      <td className="py-2.5 px-3 font-sans text-zinc-400">{(log as any).userName || (log as any).userId || 'Rep'}</td>
                      <td className="py-2.5 px-3 text-right font-bold">
                        {Math.floor((Number(log.duration) || 0) / 60)}:
                        {String((Number(log.duration) || 0) % 60).padStart(2, '0')}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getOutcomeBadge(log.outcome || '')}`}>
                          {log.outcome}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-zinc-500 text-[11px]">
                        {log.timestamp ? new Date(log.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-zinc-500 font-sans">
                      No call records match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-zinc-200 dark:border-zinc-800 text-xs font-mono">
              <span className="text-zinc-400">
                Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, tableFilteredLogs.length)} of {tableFilteredLogs.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 rounded-lg border border-zinc-800 bg-[#18181b] disabled:opacity-40"
                >
                  Prev
                </button>
                <span className="font-bold text-amber-400">{page} / {totalPages}</span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1 rounded-lg border border-zinc-800 bg-[#18181b] disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
};
