import React, { useState, useEffect, useCallback } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  PhoneCall, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  PhoneMissed, 
  Voicemail, 
  Layers, 
  Smartphone, 
  Play, 
  Upload, 
  ShieldAlert, 
  ArrowUpRight, 
  RefreshCw, 
  Activity,
  Users
} from 'lucide-react';
import type { Campaign, CallLog } from '../types';

interface DashboardOverviewProps {
  isLight?: boolean;
  serverUrl: string;
  authToken?: string;
  authUser?: string | null;
  phoneConnected: boolean;
  phoneDeviceName?: string | null;
  campaigns: Campaign[];
  onNavigateTab: (tab: 'dialer' | 'upload' | 'scraper' | 'dnc' | 'pair' | 'history') => void;
  onSelectCampaign: (campId: string) => void;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  isLight,
  serverUrl,
  authToken,
  authUser,
  phoneConnected,
  phoneDeviceName,
  campaigns,
  onNavigateTab,
  onSelectCampaign,
}) => {
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [devicesCount, setDevicesCount] = useState(0);
  const [dncCount, setDncCount] = useState(0);
  const [hoveredSlice, setHoveredSlice] = useState<{ label: string; value: number; color: string; percentage: number } | null>(null);

  const fetchDashboardStats = useCallback(async () => {
    setLoading(true);
    try {
      const reqHeaders: Record<string, string> = {};
      if (authToken) reqHeaders['Authorization'] = `Bearer ${authToken}`;

      // Fetch logs
      const logsRes = await fetch(`${serverUrl}/logs`, { headers: reqHeaders });
      if (logsRes.ok) {
        const data = await logsRes.json();
        setLogs(Array.isArray(data) ? data : []);
      }

      // Fetch DNC count
      const dncRes = await fetch(`${serverUrl}/api/suppression-list`, { headers: reqHeaders });
      if (dncRes.ok) {
        const dncData = await dncRes.json();
        setDncCount(Array.isArray(dncData) ? dncData.length : 0);
      }

      // Fetch Devices count
      const devRes = await fetch(`${serverUrl}/api/devices`, { headers: reqHeaders });
      if (devRes.ok) {
        const devData = await devRes.json();
        setDevicesCount(Array.isArray(devData) ? devData.length : 0);
      }
    } catch (err) {
      console.error('Error fetching dashboard stats:', err);
    } finally {
      setLoading(false);
    }
  }, [serverUrl, authToken]);

  useEffect(() => {
    fetchDashboardStats();
  }, [fetchDashboardStats]);

  // Defensive array checks to guarantee zero render crashes
  const safeLogs = Array.isArray(logs) ? logs : [];
  const safeCampaigns = Array.isArray(campaigns) ? campaigns : [];

  // Aggregate metrics
  const totalCalls = safeLogs.length;
  const answeredCalls = safeLogs.filter(l => (l?.outcome || '').toUpperCase() === 'ANSWERED').length;
  const missedCalls = safeLogs.filter(l => (l?.outcome || '').toUpperCase() === 'NO_ANSWER').length;
  const voicemailCalls = safeLogs.filter(l => (l?.outcome || '').toUpperCase() === 'VOICEMAIL').length;
  const busyCalls = safeLogs.filter(l => (l?.outcome || '').toUpperCase() === 'BUSY' || (l?.outcome || '').toUpperCase() === 'REJECTED').length;

  const totalDurationSecs = safeLogs.reduce((acc, l) => acc + (l?.duration || 0), 0);
  const successRate = totalCalls > 0 ? ((answeredCalls / totalCalls) * 100).toFixed(1) : '0.0';

  const totalLeadsInCampaigns = safeCampaigns.reduce((acc, c) => acc + (c?.leadCount || 0), 0);

  const formatDuration = (secs: number) => {
    const hrs = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    if (mins > 0) return `${mins}m ${s}s`;
    return `${s}s`;
  };

  const formatTimeAgo = (iso: string) => {
    try {
      const dt = new Date(iso);
      const diffMins = Math.floor((Date.now() - dt.getTime()) / (1000 * 60));
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      return dt.toLocaleDateString();
    } catch {
      return iso;
    }
  };

  return (
    <div className="space-y-5 text-left select-none relative overflow-visible">
      
      {/* Octal Dialer User Greeting Header (Sticky below header card) */}
      <div className={`sticky top-[68px] z-30 flex flex-col space-y-2 pb-1 pt-2 backdrop-blur-md transition-all ${
        isLight ? 'bg-slate-100 text-slate-900' : 'bg-slate-950 text-white'
      }`}>
        <h1 className="text-2xl tracking-tight">
          <span className={`font-medium ${isLight ? 'text-slate-850' : 'text-slate-400'}`}>Hello </span>
          <span className={`font-black ${isLight ? 'text-slate-950' : 'text-white'}`}>{authUser || 'User'}</span>
        </h1>

        {/* Dashboard Sub-Tabs */}
        <div className={`flex items-center gap-6 border-b text-sm font-semibold pt-1 ${
          isLight ? 'border-slate-300' : 'border-slate-800'
        }`}>
          <button className={`pb-2.5 border-b-2 font-black cursor-pointer ${
            isLight ? 'border-amber-600 text-amber-800' : 'border-amber-500 text-amber-400'
          }`}>
            Business Overview
          </button>
          <button className={`pb-2.5 cursor-pointer font-bold ${
            isLight ? 'text-slate-800 hover:text-slate-950' : 'text-slate-400 hover:text-slate-200'
          }`}>
            What's New <span className="text-red-600 font-extrabold">?</span>
          </button>
        </div>
      </div>
      
      {/* Top Banner & Quick Controls */}
      <div className={`p-4 border rounded-2xl shadow-xl relative overflow-hidden transition-colors ${
        isLight ? 'bg-gradient-to-r from-amber-500/10 via-white to-amber-500/5 border-amber-300 shadow-slate-200/80' : 'bg-gradient-to-r from-[#090d16] via-[#1e293b]/20 to-[#090d16] border-slate-800'
      }`}>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`text-[9px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded border ${
                isLight ? 'bg-amber-500/20 text-amber-950 border-amber-400 font-black' : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
              }`}>
                EXECUTIVE DIALER CONSOLE
              </span>
              <span className={`text-[11px] font-bold ${isLight ? 'text-slate-800' : 'text-slate-400'}`}>● Live Operational Overview</span>
            </div>
            <h1 className={`text-xl font-black font-display tracking-tight ${isLight ? 'text-slate-950' : 'text-white'}`}>
              Telecom Analytics & System Dashboard
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={fetchDashboardStats}
              title="Refresh Dashboard Data"
              className={`p-2 border rounded-xl transition cursor-pointer ${
                isLight ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100' : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-500' : ''}`} />
            </button>
            <button
              onClick={() => onNavigateTab('dialer')}
              className="px-3 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs font-mono uppercase tracking-wider rounded-xl shadow-md transition flex items-center gap-1.5 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Launch Dialer
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Total Campaigns & Pipeline */}
        <div className={`p-5 border rounded-2xl shadow-lg transition-all ${
          isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#090d16] border-slate-800'
        }`}>
          <div className="flex justify-between items-start">
            <span className={`text-[10px] font-mono font-bold uppercase tracking-wider ${isLight ? 'text-slate-700' : 'text-slate-400'}`}>Active Campaigns</span>
            <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-500">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className={`text-2xl font-black font-mono ${isLight ? 'text-slate-950' : 'text-white'}`}>{campaigns.length}</span>
            <span className={`text-xs ml-2 font-bold ${isLight ? 'text-slate-700' : 'text-slate-400'}`}>Pipelines</span>
          </div>
          <div className={`mt-2 text-[11px] font-mono flex items-center gap-1 ${isLight ? 'text-amber-800 font-extrabold' : 'text-amber-400'}`}>
            <Users className="w-3.5 h-3.5" />
            <span>{totalLeadsInCampaigns.toLocaleString()} Total Leads Loaded</span>
          </div>
        </div>

        {/* Total Calls Made */}
        <div className={`p-5 border rounded-2xl shadow-lg transition-all ${
          isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#090d16] border-slate-800'
        }`}>
          <div className="flex justify-between items-start">
            <span className={`text-[10px] font-mono font-bold uppercase tracking-wider ${isLight ? 'text-slate-700' : 'text-slate-400'}`}>Total Calls Processed</span>
            <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-500">
              <PhoneCall className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className={`text-2xl font-black font-mono ${isLight ? 'text-slate-950' : 'text-white'}`}>{totalCalls}</span>
            <span className={`text-xs ml-2 font-bold ${isLight ? 'text-slate-700' : 'text-slate-400'}`}>Calls</span>
          </div>
          <div className={`mt-2 text-[11px] font-mono flex items-center gap-1 ${isLight ? 'text-emerald-800 font-extrabold' : 'text-emerald-400'}`}>
            <Clock className="w-3.5 h-3.5" />
            <span>{formatDuration(totalDurationSecs)} Total Talk Time</span>
          </div>
        </div>

        {/* Call Success Rate */}
        <div className={`p-5 border rounded-2xl shadow-lg transition-all ${
          isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#090d16] border-slate-800'
        }`}>
          <div className="flex justify-between items-start">
            <span className={`text-[10px] font-mono font-bold uppercase tracking-wider ${isLight ? 'text-slate-700' : 'text-slate-400'}`}>Answer Success Rate</span>
            <div className="p-2 bg-blue-500/10 border border-blue-500/30 rounded-xl text-blue-500">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className={`text-2xl font-black font-mono ${isLight ? 'text-slate-950' : 'text-white'}`}>{successRate}%</span>
            <span className={`text-xs ml-2 font-bold ${isLight ? 'text-slate-700' : 'text-slate-400'}`}>Connected</span>
          </div>
          <div className={`mt-2 text-[11px] font-mono flex items-center gap-1 ${isLight ? 'text-blue-800 font-extrabold' : 'text-blue-400'}`}>
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{answeredCalls} Answered / {totalCalls} Total</span>
          </div>
        </div>

        {/* Bluetooth Handset Status */}
        <div className={`p-5 border rounded-2xl shadow-lg transition-all ${
          isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#090d16] border-slate-800'
        }`}>
          <div className="flex justify-between items-start">
            <span className={`text-[10px] font-mono font-bold uppercase tracking-wider ${isLight ? 'text-slate-700' : 'text-slate-400'}`}>GSM Handset Status</span>
            <div className={`p-2 border rounded-xl ${
              phoneConnected ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500' : 'bg-red-500/10 border-red-500/30 text-red-500'
            }`}>
              <Smartphone className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className={`text-sm font-black font-mono capitalize ${
              phoneConnected 
                ? isLight ? 'text-emerald-700 font-black' : 'text-emerald-400' 
                : 'text-red-600 font-black'
            }`}>
              {phoneConnected ? (phoneDeviceName || 'Handset Connected') : 'Offline / Unpaired'}
            </span>
          </div>
          <div className={`mt-2 text-[11px] font-mono flex items-center gap-1 ${isLight ? 'text-slate-700' : 'text-slate-400'}`}>
            <Activity className="w-3.5 h-3.5" />
            <span>{devicesCount} Registered Device(s)</span>
          </div>
        </div>

      </div>

      {/* Main Split Layout: Performance Breakdown + Recent Call Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left (7 cols): Call Outcome Breakdown & Active Campaigns Table */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* outcome breakdown replacement card */}
          <div className={`p-5 border rounded-2xl shadow-xl space-y-5 ${
            isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#090d16] border-slate-800'
          }`}>
            {/* Header */}
            <div className="pb-3 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <h3 className={`text-sm font-bold uppercase tracking-wider ${isLight ? 'text-slate-900' : 'text-white'}`}>
                Call Disposition Summary
              </h3>
              <span className="text-[10px] font-mono text-slate-500 font-bold uppercase">{totalCalls} Recorded Calls</span>
            </div>

            {/* Donut Chart & Legend Block */}
            <div className="flex flex-col sm:flex-row items-center justify-around gap-6 py-2">
              {/* Left Column: Donut Chart */}
              <div className="relative w-56 h-56 flex items-center justify-center shrink-0">
                <svg width="210" height="210" viewBox="0 0 120 120" className="transform -rotate-90">
                  {(() => {
                    const total = answeredCalls + missedCalls + voicemailCalls + busyCalls;
                    const hasData = total > 0;
                    const chartData = hasData
                      ? [
                          { label: 'Answered', value: answeredCalls, color: '#10B981' },
                          { label: 'No Answer', value: missedCalls, color: '#64748B' },
                          { label: 'Voicemail', value: voicemailCalls, color: '#F59E0B' },
                          { label: 'Busy / Decline', value: busyCalls, color: '#EF4444' }
                        ]
                      : [{ label: 'Pending', value: 1, color: isLight ? '#E2E8F0' : '#1E293B' }];

                    const r = 45;
                    const C = 2 * Math.PI * r; // ~282.74
                    let currentOffset = 0;

                    return chartData.map((item, idx) => {
                      const percentage = hasData ? (item.value / total) * 100 : 100;
                      const strokeLength = (percentage / 100) * C;
                      const strokeOffset = C - strokeLength + currentOffset;
                      currentOffset -= strokeLength;
                      const isHovered = hoveredSlice?.label === item.label;

                      return (
                        <circle
                          key={item.label + idx}
                          cx="60"
                          cy="60"
                          r={r}
                          fill="transparent"
                          stroke={item.color}
                          strokeWidth={isHovered ? 14 : 10}
                          strokeDasharray={`${strokeLength} ${C - strokeLength}`}
                          strokeDashoffset={strokeOffset}
                          onMouseEnter={() => {
                            if (hasData) {
                              setHoveredSlice({
                                label: item.label,
                                value: item.value,
                                color: item.color,
                                percentage
                              });
                            }
                          }}
                          onMouseLeave={() => setHoveredSlice(null)}
                          className="transition-all duration-300 ease-out cursor-pointer"
                        />
                      );
                    });
                  })()}
                </svg>
                {/* Center Label */}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
                  {hoveredSlice ? (
                    <>
                      <span 
                        className="text-2xl font-black font-mono leading-none transition-all duration-200"
                        style={{ color: hoveredSlice.color }}
                      >
                        {hoveredSlice.percentage.toFixed(1)}%
                      </span>
                      <span 
                        className="text-[10px] font-extrabold uppercase tracking-wider mt-1.5 transition-all duration-200 break-words max-w-[90px]"
                        style={{ color: hoveredSlice.color }}
                      >
                        {hoveredSlice.label}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className={`text-2xl font-black font-mono leading-none ${isLight ? 'text-slate-900' : 'text-white'}`}>
                        {totalCalls > 0 ? `${successRate}%` : '0.0%'}
                      </span>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">
                        Success
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Right Column: Colored Legend */}
              <div className="space-y-2 text-xs font-mono font-bold select-none min-w-[120px]">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />
                  <span className={isLight ? 'text-slate-700' : 'text-slate-300'}>Answered</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-slate-500 inline-block" />
                  <span className={isLight ? 'text-slate-700' : 'text-slate-300'}>No Answer</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-amber-500 inline-block" />
                  <span className={isLight ? 'text-slate-700' : 'text-slate-300'}>Voicemail</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
                  <span className={isLight ? 'text-slate-700' : 'text-slate-300'}>Busy / Decline</span>
                </div>
              </div>
            </div>

            {/* Bottom Table Breakdown */}
            <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="flex justify-between items-center text-sm font-bold pb-1">
                <span className={isLight ? 'text-slate-700' : 'text-slate-300'}>Total Calls Processed</span>
                <span className={`font-mono text-base ${isLight ? 'text-slate-950' : 'text-white'}`}>{totalCalls.toLocaleString()} Calls</span>
              </div>
              <div className="w-full overflow-x-auto">
                <table className="w-full text-xs font-mono text-left select-none">
                  <thead>
                    <tr className={`border-b font-bold ${isLight ? 'border-slate-300 text-slate-500' : 'border-slate-800 text-slate-400'}`}>
                      <th className="pb-1.5 font-bold uppercase tracking-wider">Call Disposition</th>
                      <th className="pb-1.5 text-right font-bold uppercase tracking-wider">Count</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isLight ? 'divide-slate-200 text-slate-800' : 'divide-slate-800/60 text-slate-300'}`}>
                    <tr>
                      <td className="py-2 flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                        <span>Answered</span>
                      </td>
                      <td className="py-2 text-right font-bold font-mono">{answeredCalls}</td>
                    </tr>
                    <tr>
                      <td className="py-2 flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-slate-500 inline-block" />
                        <span>No Answer</span>
                      </td>
                      <td className="py-2 text-right font-bold font-mono">{missedCalls}</td>
                    </tr>
                    <tr>
                      <td className="py-2 flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                        <span>Voicemail</span>
                      </td>
                      <td className="py-2 text-right font-bold font-mono">{voicemailCalls}</td>
                    </tr>
                    <tr>
                      <td className="py-2 flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
                        <span>Busy / Decline</span>
                      </td>
                      <td className="py-2 text-right font-bold font-mono">{busyCalls}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Active Campaigns List */}
          <div className={`p-5 border rounded-2xl shadow-xl space-y-4 ${
            isLight ? 'bg-white border-slate-200' : 'bg-[#090d16] border-slate-800'
          }`}>
            <div className="flex justify-between items-center pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-500" />
                <h3 className={`text-sm font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  Campaign Pipelines ({safeCampaigns.length})
                </h3>
              </div>
              <button
                onClick={() => onNavigateTab('upload')}
                className="text-xs text-amber-600 dark:text-amber-400 hover:underline font-bold flex items-center gap-1 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                + Import New Sheet
              </button>
            </div>

            {safeCampaigns.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-xs font-mono">
                No active campaigns imported yet. Upload a CSV/XLSX sheet to begin.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className={`border-b font-mono text-[9px] uppercase ${
                      isLight ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-slate-900 text-slate-400 border-slate-850'
                    }`}>
                      <th className="p-3">Campaign Name</th>
                      <th className="p-3">Leads Count</th>
                      <th className="p-3">Source File</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${
                    isLight ? 'divide-slate-200 text-slate-800' : 'divide-slate-900 text-slate-300'
                  }`}>
                    {safeCampaigns.map((c, cIdx) => (
                      <tr key={c?.id || cIdx} className={`hover:bg-amber-500/5 transition ${isLight ? 'hover:bg-amber-500/10' : ''}`}>
                        <td className="p-3 font-bold">{c?.name || 'Unnamed Campaign'}</td>
                        <td className="p-3 font-mono font-bold text-amber-600 dark:text-amber-400">{c?.leadCount || 0} leads</td>
                        <td className="p-3 font-mono text-[11px] text-slate-500 truncate max-w-[150px]">{c?.fileName || 'Manual Import'}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                            ACTIVE
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => {
                              if (c?.id) onSelectCampaign(c.id);
                              onNavigateTab('dialer');
                            }}
                            className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[10px] font-mono rounded-lg transition inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Play className="w-3 h-3 fill-current" />
                            Dial Pipeline
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>

        {/* Right (5 cols): Recent Activity Feed + Quick Actions */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Quick Tools Launch Card */}
          <div className={`p-5 border rounded-2xl shadow-xl space-y-3 ${
            isLight ? 'bg-amber-50/60 border-amber-200' : 'bg-amber-950/20 border-amber-900/40'
          }`}>
            <h3 className="text-xs font-mono font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-amber-500" />
              Quick Operations
            </h3>
            
            <div className="grid grid-cols-2 gap-2 text-xs font-mono font-bold">
              <button
                onClick={() => onNavigateTab('upload')}
                className={`p-3 border rounded-xl text-left transition flex flex-col gap-1 cursor-pointer ${
                  isLight ? 'bg-white border-slate-200 hover:border-amber-400 text-slate-900' : 'bg-slate-900 border-slate-800 hover:border-amber-500 text-white'
                }`}
              >
                <Upload className="w-4 h-4 text-amber-500" />
                <span>Upload Sheet</span>
              </button>

              <button
                onClick={() => onNavigateTab('scraper')}
                className={`p-3 border rounded-xl text-left transition flex flex-col gap-1 cursor-pointer ${
                  isLight ? 'bg-white border-slate-200 hover:border-amber-400 text-slate-900' : 'bg-slate-900 border-slate-800 hover:border-amber-500 text-white'
                }`}
              >
                <Layers className="w-4 h-4 text-amber-500" />
                <span>Google Scraper</span>
              </button>

              <button
                onClick={() => onNavigateTab('dnc')}
                className={`p-3 border rounded-xl text-left transition flex flex-col gap-1 cursor-pointer ${
                  isLight ? 'bg-white border-slate-200 hover:border-amber-400 text-slate-900' : 'bg-slate-900 border-slate-800 hover:border-amber-500 text-white'
                }`}
              >
                <ShieldAlert className="w-4 h-4 text-amber-500" />
                <span>DNC List ({dncCount})</span>
              </button>

              <button
                onClick={() => onNavigateTab('pair')}
                className={`p-3 border rounded-xl text-left transition flex flex-col gap-1 cursor-pointer ${
                  isLight ? 'bg-white border-slate-200 hover:border-amber-400 text-slate-900' : 'bg-slate-900 border-slate-800 hover:border-amber-500 text-white'
                }`}
              >
                <Smartphone className="w-4 h-4 text-amber-500" />
                <span>Pair Bluetooth</span>
              </button>
            </div>
          </div>

          {/* Recent Call Stream */}
          <div className={`p-5 border rounded-2xl shadow-xl space-y-4 ${
            isLight ? 'bg-white border-slate-200' : 'bg-[#090d16] border-slate-800'
          }`}>
            <div className="flex justify-between items-center pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500" />
                <h3 className={`text-sm font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  Recent Call Activity
                </h3>
              </div>
              <button
                onClick={() => onNavigateTab('history')}
                className="text-xs text-amber-600 dark:text-amber-400 hover:underline font-bold flex items-center gap-1 cursor-pointer"
              >
                View Logs
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {safeLogs.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-xs font-mono">
                No call logs available yet. Make your first call via auto dialer.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
                {safeLogs.slice(0, 10).map((log, lIdx) => {
                  const outcome = (log?.outcome || 'UNKNOWN').toUpperCase();
                  const isAnswered = outcome === 'ANSWERED';
                  const isVoicemail = outcome === 'VOICEMAIL';
                  const isBusy = outcome === 'BUSY' || outcome === 'REJECTED';

                  return (
                    <div
                      key={log?.id || lIdx}
                      className={`p-3 border rounded-xl flex items-center justify-between text-xs transition ${
                        isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/80 border-slate-850'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                          isAnswered
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
                            : isVoicemail
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-500'
                            : isBusy
                            ? 'bg-red-500/10 border-red-500/30 text-red-500'
                            : 'bg-slate-800 border-slate-700 text-slate-400'
                        }`}>
                          {isAnswered ? <CheckCircle2 className="w-4 h-4" /> : isVoicemail ? <Voicemail className="w-4 h-4" /> : <PhoneMissed className="w-4 h-4" />}
                        </div>

                        <div className="min-w-0">
                          <p className={`font-bold truncate ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                            {log?.leadName || 'Unknown Lead'}
                          </p>
                          <p className="text-[10px] font-mono text-slate-500 truncate">{log?.leadPhone || 'No Phone'}</p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold border block mb-0.5 ${
                          isAnswered
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
                            : isVoicemail
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-500'
                            : 'bg-slate-800 border-slate-700 text-slate-400'
                        }`}>
                          {outcome.replace('_', ' ')}
                        </span>
                        <span className="text-[9px] font-mono text-slate-500">{formatTimeAgo(log?.timestamp || '')}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

      </div>

    </div>
  );
};
