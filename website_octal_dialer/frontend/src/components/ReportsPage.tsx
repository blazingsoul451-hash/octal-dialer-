import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  PhoneCall,
  CheckCircle2,
  Clock,
  Calendar,
  Download,
  RefreshCw,
  Search,
  Filter,
  BarChart2,
  PieChart,
  Layers,
  AlertCircle
} from 'lucide-react';
import type { Campaign, CallLog } from '../types';

interface ReportsPageProps {
  isLight?: boolean;
  serverUrl: string;
  authToken: string | null;
  campaigns?: Campaign[];
}

type DatePreset = 'today' | 'yesterday' | '7d' | '30d' | 'all';

export const ReportsPage: React.FC<ReportsPageProps> = ({
  isLight,
  serverUrl,
  authToken,
  campaigns = []
}) => {
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [datePreset, setDatePreset] = useState<DatePreset>('7d');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOutcomeFilter, setSelectedOutcomeFilter] = useState<string>('ALL');
  const [selectedCampaignFilter, setSelectedCampaignFilter] = useState<string>('ALL');
  const [exporting, setExporting] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const headers: Record<string, string> = {};
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      const res = await fetch(`${serverUrl}/logs`, { headers });
      if (!res.ok) {
        throw new Error(`Failed to load call logs (${res.status} ${res.statusText})`);
      }
      const data = await res.json();
      setLogs(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message || 'Error communicating with backend analytics service.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [serverUrl, authToken]);

  // Authenticated CSV Export
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
      a.download = `octal_dialer_analytics_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      alert('Failed to export CSV: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  // Date Filtering Logic
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

  // Aggregate KPI Metrics
  const kpiData = useMemo(() => {
    const total = filteredByDateLogs.length;
    const answered = filteredByDateLogs.filter(l => {
      const o = (l.outcome || '').toUpperCase();
      return o === 'ANSWERED' || o === 'CONNECTED' || o === 'SUCCESS' || o === 'INTERESTED';
    }).length;

    const noAnswer = filteredByDateLogs.filter(l => (l.outcome || '').toUpperCase() === 'NO_ANSWER').length;
    const busy = filteredByDateLogs.filter(l => {
      const o = (l.outcome || '').toUpperCase();
      return o === 'BUSY' || o === 'REJECTED';
    }).length;
    const voicemail = filteredByDateLogs.filter(l => (l.outcome || '').toUpperCase() === 'VOICEMAIL').length;
    const dnc = filteredByDateLogs.filter(l => {
      const o = (l.outcome || '').toUpperCase();
      return o === 'DNC' || o === 'DO_NOT_CALL';
    }).length;
    const other = total - (answered + noAnswer + busy + voicemail + dnc);

    const answerRate = total > 0 ? ((answered / total) * 100).toFixed(1) : '0.0';

    const totalSeconds = filteredByDateLogs.reduce((acc, l) => acc + (Number(l.duration) || 0), 0);
    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const talkTimeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m ${totalSeconds % 60}s`;

    const answeredDurations = filteredByDateLogs
      .filter(l => {
        const o = (l.outcome || '').toUpperCase();
        return o === 'ANSWERED' || o === 'CONNECTED' || o === 'SUCCESS';
      })
      .map(l => Number(l.duration) || 0);

    const avgSeconds = answeredDurations.length > 0
      ? Math.round(answeredDurations.reduce((a, b) => a + b, 0) / answeredDurations.length)
      : 0;

    const acdMins = Math.floor(avgSeconds / 60);
    const acdSecs = avgSeconds % 60;
    const acdStr = `${String(acdMins).padStart(2, '0')}:${String(acdSecs).padStart(2, '0')}`;

    return {
      total,
      answered,
      noAnswer,
      busy,
      voicemail,
      dnc,
      other,
      answerRate,
      talkTimeStr,
      totalSeconds,
      acdStr,
      avgSeconds
    };
  }, [filteredByDateLogs]);

  // Hourly Distribution Calculation (24 hours)
  const hourlyData = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      label: `${String(i).padStart(2, '0')}:00`,
      total: 0,
      answered: 0
    }));

    filteredByDateLogs.forEach(l => {
      if (!l.timestamp) return;
      const d = new Date(l.timestamp);
      if (isNaN(d.getTime())) return;
      const h = d.getHours();
      if (h >= 0 && h < 24) {
        hours[h].total++;
        const o = (l.outcome || '').toUpperCase();
        if (o === 'ANSWERED' || o === 'CONNECTED' || o === 'SUCCESS') {
          hours[h].answered++;
        }
      }
    });

    const maxTotal = Math.max(...hours.map(h => h.total), 1);
    return { hours, maxTotal };
  }, [filteredByDateLogs]);

  // Daily Trend Calculation (Last 7 / 14 / 30 buckets)
  const dailyData = useMemo(() => {
    const map = new Map<string, { date: string; label: string; total: number; answered: number }>();

    filteredByDateLogs.forEach(l => {
      if (!l.timestamp) return;
      const d = new Date(l.timestamp);
      if (isNaN(d.getTime())) return;
      const dateKey = d.toISOString().slice(0, 10);
      const label = `${d.getMonth() + 1}/${d.getDate()}`;
      if (!map.has(dateKey)) {
        map.set(dateKey, { date: dateKey, label, total: 0, answered: 0 });
      }
      const entry = map.get(dateKey)!;
      entry.total++;
      const o = (l.outcome || '').toUpperCase();
      if (o === 'ANSWERED' || o === 'CONNECTED' || o === 'SUCCESS') {
        entry.answered++;
      }
    });

    const sorted = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
    const maxDay = Math.max(...sorted.map(d => d.total), 1);
    return { days: sorted, maxDay };
  }, [filteredByDateLogs]);

  // Campaign Aggregates
  const campaignStats = useMemo(() => {
    const map = new Map<string, {
      name: string;
      totalLeads: number;
      callsMade: number;
      answered: number;
      durationSecs: number;
    }>();

    // Initialize with known campaigns
    campaigns.forEach(c => {
      map.set(c.name, {
        name: c.name,
        totalLeads: c.leadCount || 0,
        callsMade: 0,
        answered: 0,
        durationSecs: 0
      });
    });

    // Accumulate logs
    filteredByDateLogs.forEach(l => {
      const cName = l.campaignName || 'Unassigned Campaign';
      if (!map.has(cName)) {
        map.set(cName, {
          name: cName,
          totalLeads: 0,
          callsMade: 0,
          answered: 0,
          durationSecs: 0
        });
      }
      const entry = map.get(cName)!;
      entry.callsMade++;
      entry.durationSecs += Number(l.duration) || 0;
      const o = (l.outcome || '').toUpperCase();
      if (o === 'ANSWERED' || o === 'CONNECTED' || o === 'SUCCESS') {
        entry.answered++;
      }
    });

    return Array.from(map.values()).filter(c => c.callsMade > 0 || c.totalLeads > 0);
  }, [filteredByDateLogs, campaigns]);

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

  const paginatedLogs = useMemo(() => {
    const start = (page - 1) * pageSize;
    return tableFilteredLogs.slice(start, start + pageSize);
  }, [tableFilteredLogs, page]);

  const totalPages = Math.ceil(tableFilteredLogs.length / pageSize) || 1;

  return (
    <div className={`space-y-6 text-left transition-colors duration-200`}>
      {/* ── Header & Range Control Bar ── */}
      <div className={`border rounded-2xl p-6 shadow-2xl transition-colors ${
        isLight ? 'bg-white border-slate-200/90 shadow-slate-200/50 text-slate-900' : 'bg-[#0f172a]/95 border-slate-800/90 text-white'
      }`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-md">
                <TrendingUp className="w-5 h-5 text-slate-950" />
              </div>
              <h1 className={`text-2xl font-black font-display tracking-tight ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                Reports & Analytics
              </h1>
            </div>
            <p className={`text-xs mt-1.5 font-medium ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
              Real-time outbound campaign analytics, live answer rates, talk time metrics, and call outcome intelligence.
            </p>
          </div>

          {/* Date Range Presets */}
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
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                    active
                      ? isLight
                        ? 'bg-amber-500 border-amber-600 text-slate-950 shadow-md'
                        : 'bg-amber-500 border-amber-400 text-slate-950 shadow-md shadow-amber-500/20'
                      : isLight
                        ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                        : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300'
                  }`}
                >
                  {labels[preset]}
                </button>
              );
            })}

            <button
              onClick={fetchLogs}
              disabled={loading}
              title="Refresh Analytics"
              className={`p-2 rounded-xl border transition-all cursor-pointer ${
                isLight
                  ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                  : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300'
              }`}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-500' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className={`p-4 border text-xs rounded-2xl flex items-start gap-3 shadow-md ${
          isLight ? 'bg-red-50 border-red-200 text-red-700' : 'bg-red-950/30 border-red-900/50 text-red-400'
        }`}>
          <AlertCircle className="w-5 h-5 shrink-0" />
          <div>
            <p className="font-bold">Analytics Connection Notice</p>
            <p className="mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* ── 4 Top KPI Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Calls */}
        <div className={`border rounded-2xl p-5 shadow-xl transition-colors ${
          isLight ? 'bg-white border-slate-200 shadow-slate-200/50' : 'bg-[#0f172a]/95 border-slate-800'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold">Total Calls Placed</span>
            <div className={`p-2 rounded-xl ${isLight ? 'bg-amber-50 text-amber-600' : 'bg-amber-500/10 text-amber-400'}`}>
              <PhoneCall className="w-4 h-4" />
            </div>
          </div>
          <div className={`text-2xl font-black font-mono mt-2 ${isLight ? 'text-slate-900' : 'text-white'}`}>
            {loading ? '...' : kpiData.total.toLocaleString()}
          </div>
          <p className="text-[10px] text-slate-500 mt-1 font-mono">
            {kpiData.answered} connected ({kpiData.answerRate}%)
          </p>
        </div>

        {/* Answer Rate */}
        <div className={`border rounded-2xl p-5 shadow-xl transition-colors ${
          isLight ? 'bg-white border-slate-200 shadow-slate-200/50' : 'bg-[#0f172a]/95 border-slate-800'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold">Answer Rate</span>
            <div className={`p-2 rounded-xl ${isLight ? 'bg-emerald-50 text-emerald-600' : 'bg-emerald-500/10 text-emerald-400'}`}>
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className={`text-2xl font-black font-mono mt-2 ${isLight ? 'text-slate-900' : 'text-emerald-400'}`}>
            {loading ? '...' : `${kpiData.answerRate}%`}
          </div>
          <p className="text-[10px] text-slate-500 mt-1 font-mono">
            {kpiData.noAnswer} missed / {kpiData.busy} busy
          </p>
        </div>

        {/* Total Talk Time */}
        <div className={`border rounded-2xl p-5 shadow-xl transition-colors ${
          isLight ? 'bg-white border-slate-200 shadow-slate-200/50' : 'bg-[#0f172a]/95 border-slate-800'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold">Total Talk Time</span>
            <div className={`p-2 rounded-xl ${isLight ? 'bg-blue-50 text-blue-600' : 'bg-blue-500/10 text-blue-400'}`}>
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className={`text-2xl font-black font-mono mt-2 ${isLight ? 'text-slate-900' : 'text-white'}`}>
            {loading ? '...' : kpiData.talkTimeStr}
          </div>
          <p className="text-[10px] text-slate-500 mt-1 font-mono">
            {kpiData.totalSeconds} total call seconds
          </p>
        </div>

        {/* Average Call Duration */}
        <div className={`border rounded-2xl p-5 shadow-xl transition-colors ${
          isLight ? 'bg-white border-slate-200 shadow-slate-200/50' : 'bg-[#0f172a]/95 border-slate-800'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold">Avg Call Duration (ACD)</span>
            <div className={`p-2 rounded-xl ${isLight ? 'bg-purple-50 text-purple-600' : 'bg-purple-500/10 text-purple-400'}`}>
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className={`text-2xl font-black font-mono mt-2 ${isLight ? 'text-slate-900' : 'text-amber-400'}`}>
            {loading ? '...' : kpiData.acdStr}
          </div>
          <p className="text-[10px] text-slate-500 mt-1 font-mono">
            avg duration of answered calls
          </p>
        </div>
      </div>

      {/* ── Visual Charts Row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Chart 1: Daily Call Volume (2 cols) */}
        <div className={`lg:col-span-2 border rounded-2xl p-6 shadow-2xl transition-colors flex flex-col justify-between ${
          isLight ? 'bg-white border-slate-200/90 shadow-slate-200/50 text-slate-900' : 'bg-[#0f172a]/95 border-slate-800/90 text-white'
        }`}>
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-4">
              <div>
                <h3 className={`text-base font-bold font-display ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                  Call Volume & Answer Trends
                </h3>
                <p className="text-[10px] text-slate-500 font-mono">Daily breakdown of total attempts vs answered connections</p>
              </div>
              <div className="flex items-center gap-3 text-xs font-mono">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" />
                  <span className="text-[10px] text-slate-400 font-bold">Total Calls</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
                  <span className="text-[10px] text-slate-400 font-bold">Answered</span>
                </span>
              </div>
            </div>

            {dailyData.days.length === 0 ? (
              <div className="h-56 flex flex-col items-center justify-center text-slate-500 text-xs font-mono border border-dashed border-slate-800 rounded-xl">
                <span>No call activity recorded for selected date range</span>
              </div>
            ) : (
              <div className="h-56 flex items-end gap-2 pt-6 pb-2 px-2 overflow-x-auto">
                {dailyData.days.map((d) => {
                  const totalHeight = Math.max(8, (d.total / dailyData.maxDay) * 180);
                  const answeredHeight = Math.max(4, (d.answered / dailyData.maxDay) * 180);
                  return (
                    <div key={d.date} className="flex-1 min-w-[28px] flex flex-col items-center gap-1.5 group relative">
                      {/* Tooltip on hover */}
                      <div className="absolute -top-12 hidden group-hover:flex flex-col items-center bg-slate-900 border border-slate-700 text-white text-[9px] font-mono px-2 py-1 rounded shadow-xl whitespace-nowrap z-20 pointer-events-none">
                        <span className="font-bold text-amber-400">{d.date}</span>
                        <span>{d.total} calls ({d.answered} answered)</span>
                      </div>

                      {/* Bar Bars */}
                      <div className="w-full flex items-end justify-center gap-1 h-[180px]">
                        <div
                          style={{ height: `${totalHeight}px` }}
                          className="w-1/2 bg-amber-500/80 hover:bg-amber-400 rounded-t transition-all duration-300"
                          title={`Total: ${d.total}`}
                        />
                        <div
                          style={{ height: `${answeredHeight}px` }}
                          className="w-1/2 bg-emerald-500/80 hover:bg-emerald-400 rounded-t transition-all duration-300"
                          title={`Answered: ${d.answered}`}
                        />
                      </div>
                      <span className="text-[9px] font-mono text-slate-500 truncate w-full text-center">
                        {d.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Chart 2: Outcome Breakdown (1 col) */}
        <div className={`border rounded-2xl p-6 shadow-2xl transition-colors flex flex-col justify-between ${
          isLight ? 'bg-white border-slate-200/90 shadow-slate-200/50 text-slate-900' : 'bg-[#0f172a]/95 border-slate-800/90 text-white'
        }`}>
          <div>
            <div className="pb-3 border-b border-slate-800/80 mb-4">
              <h3 className={`text-base font-bold font-display ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                Call Outcome Distribution
              </h3>
              <p className="text-[10px] text-slate-500 font-mono">Percentage distribution across dispositions</p>
            </div>

            {kpiData.total === 0 ? (
              <div className="h-56 flex items-center justify-center text-slate-500 text-xs font-mono border border-dashed border-slate-800 rounded-xl">
                <span>No disposition data</span>
              </div>
            ) : (
              <div className="space-y-3 pt-2">
                {[
                  { label: 'Answered / Connected', count: kpiData.answered, color: 'bg-emerald-500', text: 'text-emerald-400' },
                  { label: 'No Answer / Missed', count: kpiData.noAnswer, color: 'bg-red-500', text: 'text-red-400' },
                  { label: 'Busy / Rejected', count: kpiData.busy, color: 'bg-amber-500', text: 'text-amber-400' },
                  { label: 'Voicemail', count: kpiData.voicemail, color: 'bg-purple-500', text: 'text-purple-400' },
                  { label: 'DNC / Suppression', count: kpiData.dnc, color: 'bg-rose-500', text: 'text-rose-400' },
                ].map((item) => {
                  const pct = kpiData.total > 0 ? ((item.count / kpiData.total) * 100).toFixed(1) : '0.0';
                  return (
                    <div key={item.label} className="space-y-1">
                      <div className="flex justify-between text-xs font-mono">
                        <span className={`font-semibold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>{item.label}</span>
                        <span className="text-slate-400 font-bold">{item.count} ({pct}%)</span>
                      </div>
                      <div className="w-full bg-slate-800/80 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full ${item.color} rounded-full transition-all duration-500`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Chart 3: Best Calling Hours (24 Hour Heatmap) ── */}
      <div className={`border rounded-2xl p-6 shadow-2xl transition-colors ${
        isLight ? 'bg-white border-slate-200/90 shadow-slate-200/50 text-slate-900' : 'bg-[#0f172a]/95 border-slate-800/90 text-white'
      }`}>
        <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-4">
          <div>
            <h3 className={`text-base font-bold font-display ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
              Best Calling Hours (Hourly Density Matrix)
            </h3>
            <p className="text-[10px] text-slate-500 font-mono">Hourly connect probability and peak calling density (00:00 - 23:00)</p>
          </div>
          <span className="text-[10px] font-mono text-slate-400">Timezone: Local System Time</span>
        </div>

        <div className="grid grid-cols-6 sm:grid-cols-12 lg:grid-cols-24 gap-1 pt-2">
          {hourlyData.hours.map(h => {
            const intensity = h.total > 0 ? h.total / hourlyData.maxTotal : 0;
            const bgClass =
              intensity > 0.75
                ? 'bg-amber-500 text-slate-950 font-bold'
                : intensity > 0.4
                ? 'bg-amber-500/60 text-slate-950 font-bold'
                : intensity > 0.1
                ? 'bg-amber-500/25 text-amber-300'
                : isLight
                ? 'bg-slate-100 text-slate-400'
                : 'bg-slate-900 text-slate-500';

            return (
              <div
                key={h.hour}
                className={`p-2 rounded-lg text-center flex flex-col justify-between h-20 transition-all ${bgClass}`}
                title={`Hour ${h.label}: ${h.total} calls (${h.answered} answered)`}
              >
                <span className="text-[8px] font-mono font-bold block">{h.hour}h</span>
                <span className="text-xs font-mono font-black block">{h.total}</span>
                <span className="text-[7px] font-mono block opacity-80">{h.answered} conn</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Campaign Performance Matrix ── */}
      <div className={`border rounded-2xl p-6 shadow-2xl transition-colors space-y-4 ${
        isLight ? 'bg-white border-slate-200/90 shadow-slate-200/50 text-slate-900' : 'bg-[#0f172a]/95 border-slate-800/90 text-white'
      }`}>
        <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
          <div>
            <h3 className={`text-base font-bold font-display ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
              Campaign Performance Comparison
            </h3>
            <p className="text-[10px] text-slate-500 font-mono">Detailed conversion metrics and contact efficiency per campaign</p>
          </div>
          <span className="text-xs font-mono text-amber-500 font-bold">{campaignStats.length} Campaign(s)</span>
        </div>

        {campaignStats.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-slate-500 text-xs font-mono border border-dashed border-slate-800 rounded-xl">
            <span>No active campaign data found in selected period</span>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-800/90">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className={`border-b text-[9px] uppercase tracking-wider ${
                  isLight ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-slate-900 text-slate-400 border-slate-800'
                }`}>
                  <th className="p-3">Campaign</th>
                  <th className="p-3 text-right">Leads Listed</th>
                  <th className="p-3 text-right">Calls Placed</th>
                  <th className="p-3 text-right">Answered</th>
                  <th className="p-3 text-right">Answer Rate</th>
                  <th className="p-3 text-right">Total Talk Time</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isLight ? 'divide-slate-200 text-slate-800' : 'divide-slate-900 text-slate-300'}`}>
                {campaignStats.map(c => {
                  const rate = c.callsMade > 0 ? ((c.answered / c.callsMade) * 100).toFixed(1) : '0.0';
                  const mins = Math.floor(c.durationSecs / 60);
                  const secs = c.durationSecs % 60;
                  return (
                    <tr key={c.name} className={isLight ? 'hover:bg-slate-50' : 'hover:bg-slate-900/40'}>
                      <td className={`p-3 font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{c.name}</td>
                      <td className="p-3 text-right">{c.totalLeads.toLocaleString()}</td>
                      <td className="p-3 text-right font-bold text-amber-500">{c.callsMade.toLocaleString()}</td>
                      <td className="p-3 text-right font-bold text-emerald-400">{c.answered.toLocaleString()}</td>
                      <td className="p-3 text-right font-bold">
                        <span className={`px-2 py-0.5 rounded border text-[9px] ${
                          Number(rate) >= 40
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        }`}>
                          {rate}%
                        </span>
                      </td>
                      <td className="p-3 text-right text-slate-400">{mins}m {secs}s</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Detailed Call Records & Filterable Log Table ── */}
      <div className={`border rounded-2xl p-6 shadow-2xl transition-colors space-y-4 ${
        isLight ? 'bg-white border-slate-200/90 shadow-slate-200/50 text-slate-900' : 'bg-[#0f172a]/95 border-slate-800/90 text-white'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b gap-3 border-slate-800/80">
          <div>
            <h3 className={`text-base font-bold font-display ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
              Detailed Call Records
            </h3>
            <p className="text-[10px] text-slate-500 font-mono">Searchable audit trail of GSM dialer connections</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCsv}
              disabled={exporting || tableFilteredLogs.length === 0}
              className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-md"
            >
              <Download className={`w-3.5 h-3.5 ${exporting ? 'animate-bounce' : ''}`} />
              <span>{exporting ? 'Exporting...' : 'Export Filtered CSV'}</span>
            </button>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Search Box */}
          <div className="flex-1 min-w-[200px] relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search recipient name, phone line, campaign..."
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
              className={`w-full pl-9 pr-3 py-2 text-xs rounded-xl border font-mono transition-colors outline-none ${
                isLight
                  ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-amber-500'
                  : 'bg-slate-900 border-slate-800 text-white focus:border-amber-500/50'
              }`}
            />
          </div>

          {/* Outcome Filter Dropdown */}
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={selectedOutcomeFilter}
              onChange={e => { setSelectedOutcomeFilter(e.target.value); setPage(1); }}
              className={`text-xs rounded-xl border px-3 py-2 font-mono outline-none cursor-pointer ${
                isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-800 text-slate-200'
              }`}
            >
              <option value="ALL">All Outcomes</option>
              <option value="ANSWERED">Answered / Connected</option>
              <option value="NO_ANSWER">No Answer</option>
              <option value="BUSY">Busy / Rejected</option>
              <option value="VOICEMAIL">Voicemail</option>
              <option value="DNC">DNC</option>
            </select>
          </div>

          {/* Campaign Filter Dropdown */}
          <select
            value={selectedCampaignFilter}
            onChange={e => { setSelectedCampaignFilter(e.target.value); setPage(1); }}
            className={`text-xs rounded-xl border px-3 py-2 font-mono outline-none cursor-pointer ${
              isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-800 text-slate-200'
            }`}
          >
            <option value="ALL">All Campaigns</option>
            {campaigns.map(c => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Table Content */}
        {paginatedLogs.length === 0 ? (
          <div className="h-40 flex flex-col items-center justify-center text-slate-500 text-xs font-mono border border-dashed border-slate-800 rounded-xl">
            <span>No matching call records found</span>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-800/90">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className={`border-b text-[9px] uppercase tracking-wider ${
                  isLight ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-slate-900 text-slate-400 border-slate-800'
                }`}>
                  <th className="p-3">Time</th>
                  <th className="p-3">Recipient Name</th>
                  <th className="p-3">Phone Line</th>
                  <th className="p-3">Campaign</th>
                  <th className="p-3">Outcome</th>
                  <th className="p-3 text-right">Talk Duration</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isLight ? 'divide-slate-200 text-slate-800' : 'divide-slate-900 text-slate-300'}`}>
                {paginatedLogs.map((log) => {
                  const d = new Date(log.timestamp);
                  const formattedDate = !isNaN(d.getTime())
                    ? `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    : log.timestamp;

                  return (
                    <tr key={log.id} className={isLight ? 'hover:bg-slate-50' : 'hover:bg-slate-900/40'}>
                      <td className="p-3 text-[10px] text-slate-500">{formattedDate}</td>
                      <td className={`p-3 font-body font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{log.leadName || 'Unknown Lead'}</td>
                      <td className="p-3 text-[10px] text-slate-400">{log.leadPhone}</td>
                      <td className="p-3 text-slate-400">{log.campaignName || '—'}</td>
                      <td className="p-3">
                        <span className={`text-[8px] font-bold px-2 py-0.5 border rounded uppercase ${getOutcomeBadge(log.outcome)}`}>
                          {log.outcome}
                        </span>
                      </td>
                      <td className="p-3 text-right font-bold text-amber-500">{log.duration}s</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-xs font-mono pt-2 text-slate-400">
            <span>Showing {((page - 1) * pageSize) + 1} - {Math.min(page * pageSize, tableFilteredLogs.length)} of {tableFilteredLogs.length}</span>
            <div className="flex items-center gap-1.5">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="px-3 py-1 rounded-lg border border-slate-800 disabled:opacity-40 hover:bg-slate-800 cursor-pointer"
              >
                Previous
              </button>
              <span className="px-2 font-bold text-white">{page} / {totalPages}</span>
              <button
                disabled={page === totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="px-3 py-1 rounded-lg border border-slate-800 disabled:opacity-40 hover:bg-slate-800 cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
