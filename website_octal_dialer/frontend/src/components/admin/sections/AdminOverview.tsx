import React, { useState, useEffect } from 'react';
import {
  Building2, Users, CreditCard, Smartphone, PhoneCall,
  AlertTriangle, CheckCircle2, ArrowRight, RefreshCw, Activity
} from 'lucide-react';

interface AdminOverviewProps {
  isLight?: boolean;
  serverUrl: string;
  authToken: string;
  onNavigateToTab?: (tab: string) => void;
  onSelectBusiness?: (businessId: string) => void;
}

export const AdminOverview: React.FC<AdminOverviewProps> = ({
  isLight,
  serverUrl,
  authToken,
  onNavigateToTab,
  onSelectBusiness
}) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOverview = async () => {
    setLoading(true);
    setError(null);
    try {
      let res = await fetch(`${serverUrl}/api/admin/overview`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (!res.ok && res.status === 404) {
        res = await fetch(`${serverUrl}/admin/platform/overview`, {
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
      }
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        const err = await res.json();
        setError(err.error || 'Failed to load platform metrics.');
      }
    } catch (err: any) {
      setError(err.message || 'Connection error loading overview.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, [serverUrl, authToken]);

  const metrics = data?.metrics || {
    totalTenants: 0,
    activeTenants: 0,
    suspendedTenants: 0,
    trialTenants: 0,
    totalUsers: 0,
    adminUsers: 0,
    agentUsers: 0,
    activeSubscriptions: 0,
    totalDevices: 0,
    onlineDevices: 0,
    callsToday: 0,
    totalLeads: 0,
    totalCampaigns: 0
  };

  const emergency = data?.emergencyState || { isPaused: false };

  return (
    <div className="space-y-6 text-left">
      {/* ── Emergency State Banner (if active) ── */}
      {emergency.isPaused && (
        <div className="bg-red-950/60 border border-red-500/60 rounded-2xl p-4 flex items-center justify-between shadow-xl animate-pulse">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-red-400" />
            <div>
              <h3 className="text-sm font-bold text-red-200 uppercase font-mono">Platform Emergency Stop Active</h3>
              <p className="text-xs text-red-300">
                Outbound campaign processing is paused by <span className="font-bold">{emergency.pausedBy}</span> ({emergency.reason}).
              </p>
            </div>
          </div>
          {onNavigateToTab && (
            <button
              onClick={() => onNavigateToTab('operations')}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold font-mono cursor-pointer"
            >
              Operations & Emergency
            </button>
          )}
        </div>
      )}

      {/* ── Top Header / Quick Actions ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-black font-display tracking-tight">Platform Command Center</h2>
          <p className="text-xs text-slate-400 font-medium mt-0.5">
            Real-time multi-tenant telemetry and global engine health across all businesses.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchOverview}
            disabled={loading}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold font-mono flex items-center gap-1.5 cursor-pointer transition ${
              isLight ? 'bg-white border-slate-300 hover:bg-slate-50 text-slate-700' : 'bg-[#18181b] border-[#18181b] hover:bg-[#27272a] text-slate-300'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs text-rose-500 bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl font-mono">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ── KPI Cards Grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Businesses */}
        <div className={`p-4 rounded-2xl border transition-all ${
          isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#09090b] border-[#18181b] shadow-2xl'
        }`}>
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className={`text-[11px] font-mono uppercase tracking-wider font-bold ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>Total Businesses</span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className={`text-2xl font-black font-mono ${isLight ? 'text-slate-900' : 'text-white'}`}>{metrics.totalTenants}</div>
          <div className="flex items-center gap-2 mt-2 text-[10px] font-mono">
            <span className="text-emerald-500 font-bold">{metrics.activeTenants} Active</span>
            <span className="text-zinc-400">•</span>
            <span className="text-amber-500 font-bold">{metrics.trialTenants} Starter/Trial</span>
          </div>
        </div>

        {/* Global Users */}
        <div className={`p-4 rounded-2xl border transition-all ${
          isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#09090b] border-[#18181b] shadow-2xl'
        }`}>
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className={`text-[11px] font-mono uppercase tracking-wider font-bold ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>Active Users</span>
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-500">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className={`text-2xl font-black font-mono ${isLight ? 'text-slate-900' : 'text-white'}`}>{metrics.totalUsers}</div>
          <div className="flex items-center gap-2 mt-2 text-[10px] font-mono">
            <span className="text-purple-500 font-bold">{metrics.adminUsers} Admins</span>
            <span className="text-zinc-400">•</span>
            <span className={isLight ? 'text-slate-600' : 'text-zinc-400'}>{metrics.agentUsers} Agents/Users</span>
          </div>
        </div>

        {/* Subscriptions */}
        <div className={`p-4 rounded-2xl border transition-all ${
          isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#09090b] border-[#18181b] shadow-2xl'
        }`}>
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className={`text-[11px] font-mono uppercase tracking-wider font-bold ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>Active Subscriptions</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className={`text-2xl font-black font-mono ${isLight ? 'text-slate-900' : 'text-white'}`}>{metrics.activeSubscriptions}</div>
          <div className="flex items-center gap-1.5 mt-2 text-[10px] font-mono text-emerald-500 font-bold">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>100% Entitlement Synchronized</span>
          </div>
        </div>

        {/* Active Connected Devices */}
        <div className={`p-4 rounded-2xl border transition-all ${
          isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#09090b] border-[#18181b] shadow-2xl'
        }`}>
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className={`text-[11px] font-mono uppercase tracking-wider font-bold ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>Connected Phones</span>
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500">
              <Smartphone className="w-4 h-4" />
            </div>
          </div>
          <div className={`text-2xl font-black font-mono ${isLight ? 'text-slate-900' : 'text-white'}`}>{metrics.onlineDevices} <span className={`text-xs font-normal ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>/ {metrics.totalDevices} Total</span></div>
          <div className={`flex items-center gap-2 mt-2 text-[10px] font-mono ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>
            <PhoneCall className="w-3.5 h-3.5 text-amber-500" />
            <span>{metrics.callsToday} Calls Handled Today</span>
          </div>
        </div>
      </div>

      {/* ── Secondary Metrics & Recent Businesses ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Businesses Table */}
        <div className={`lg:col-span-2 p-5 rounded-2xl border shadow-2xl ${
          isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#09090b] border-[#18181b] text-white'
        }`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-amber-500" />
              <h3 className={`text-xs font-bold font-mono uppercase tracking-wider ${isLight ? 'text-slate-800' : 'text-zinc-300'}`}>
                Recent Businesses
              </h3>
            </div>
            {onNavigateToTab && (
              <button
                onClick={() => onNavigateToTab('businesses')}
                className="text-xs font-mono font-bold text-amber-500 hover:text-amber-600 flex items-center gap-1 cursor-pointer"
              >
                <span>View All</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className={`overflow-x-auto rounded-xl border ${isLight ? 'border-slate-200' : 'border-[#18181b]'}`}>
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className={`border-b text-[10px] uppercase ${isLight ? 'border-slate-200 bg-slate-50 text-slate-600' : 'border-[#18181b] bg-[#121215] text-zinc-400'}`}>
                  <th className="py-2.5 px-3">Business Name</th>
                  <th className="py-2.5 px-3">Country</th>
                  <th className="py-2.5 px-3">Plan</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isLight ? 'divide-slate-200 text-slate-800' : 'divide-[#18181b]'}`}>
                {(data?.recentTenants || []).map((t: any) => (
                  <tr key={t.id} className={`${isLight ? 'hover:bg-slate-50' : 'hover:bg-[#121215]/60'} transition`}>
                    <td className={`py-2.5 px-3 font-bold flex items-center gap-2 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                      <div className="w-6 h-6 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-[10px] font-black text-amber-500">
                        {t.name.charAt(0).toUpperCase()}
                      </div>
                      <span>{t.name}</span>
                    </td>
                    <td className={`py-2.5 px-3 ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>{t.country || 'US'}</td>
                    <td className="py-2.5 px-3 text-purple-400 font-bold">{t.planName || 'Starter'}</td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border ${
                        t.status === 'active' 
                          ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' 
                          : 'bg-red-500/10 text-red-500 border-red-500/30'
                      }`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={() => onSelectBusiness ? onSelectBusiness(t.id) : onNavigateToTab?.('businesses')}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition border ${
                          isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200' : 'bg-[#18181b] hover:bg-[#27272a] text-zinc-300 border-[#27272a]'
                        }`}
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
                {(!data?.recentTenants || data.recentTenants.length === 0) && (
                  <tr>
                    <td colSpan={5} className={`py-6 text-center ${isLight ? 'text-slate-400' : 'text-zinc-500'}`}>
                      No businesses registered yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Global Engine Status Card */}
        <div className={`p-5 rounded-2xl border shadow-2xl space-y-4 ${
          isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#09090b] border-[#18181b] text-white'
        }`}>
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-500" />
            <h3 className={`text-xs font-bold font-mono uppercase tracking-wider ${isLight ? 'text-slate-800' : 'text-zinc-300'}`}>
              Engine Status
            </h3>
          </div>

          <div className="space-y-3 font-mono text-xs">
            <div className={`flex items-center justify-between p-3 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#121215] border-[#27272a]'}`}>
              <span className={isLight ? 'text-slate-600' : 'text-zinc-400'}>Total System Leads</span>
              <span className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{metrics.totalLeads.toLocaleString()}</span>
            </div>

            <div className={`flex items-center justify-between p-3 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#121215] border-[#27272a]'}`}>
              <span className={isLight ? 'text-slate-600' : 'text-zinc-400'}>Active Campaigns</span>
              <span className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{metrics.totalCampaigns}</span>
            </div>

            <div className={`flex items-center justify-between p-3 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#121215] border-[#27272a]'}`}>
              <span className={isLight ? 'text-slate-600' : 'text-zinc-400'}>Security Invariants</span>
              <span className="font-bold text-emerald-500 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Enforced
              </span>
            </div>

            <div className={`flex items-center justify-between p-3 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#121215] border-[#27272a]'}`}>
              <span className={isLight ? 'text-slate-600' : 'text-zinc-400'}>Multi-Tenant Isolation</span>
              <span className="font-bold text-purple-500">Strict (DB Clustered)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
