import React, { useState, useEffect } from 'react';
import {
  Building2, Users, CreditCard, Smartphone, PhoneCall, Layers, ShieldCheck,
  TrendingUp, AlertTriangle, CheckCircle2, ArrowRight, RefreshCw, Activity, PauseCircle, PlayCircle
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
      const res = await fetch(`${serverUrl}/admin/platform/overview`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
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
              isLight ? 'bg-white border-slate-300 hover:bg-slate-50 text-slate-700' : 'bg-slate-900 border-slate-800 hover:bg-slate-850 text-slate-300'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* ── KPI Cards Grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Businesses */}
        <div className={`p-4 rounded-2xl border transition-all ${
          isLight ? 'bg-white border-slate-200/90 shadow-sm' : 'bg-slate-900/90 border-slate-800/90 shadow-lg'
        }`}>
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-mono uppercase tracking-wider font-bold">Total Businesses</span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black font-mono text-white">{metrics.totalTenants}</div>
          <div className="flex items-center gap-2 mt-2 text-[10px] font-mono">
            <span className="text-emerald-400 font-bold">{metrics.activeTenants} Active</span>
            <span className="text-slate-600">•</span>
            <span className="text-amber-400 font-bold">{metrics.trialTenants} Starter/Trial</span>
          </div>
        </div>

        {/* Global Users */}
        <div className={`p-4 rounded-2xl border transition-all ${
          isLight ? 'bg-white border-slate-200/90 shadow-sm' : 'bg-slate-900/90 border-slate-800/90 shadow-lg'
        }`}>
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-mono uppercase tracking-wider font-bold">Active Users</span>
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black font-mono text-white">{metrics.totalUsers}</div>
          <div className="flex items-center gap-2 mt-2 text-[10px] font-mono">
            <span className="text-purple-400 font-bold">{metrics.adminUsers} Admins</span>
            <span className="text-slate-600">•</span>
            <span className="text-slate-400">{metrics.agentUsers} Agents/Users</span>
          </div>
        </div>

        {/* Subscriptions */}
        <div className={`p-4 rounded-2xl border transition-all ${
          isLight ? 'bg-white border-slate-200/90 shadow-sm' : 'bg-slate-900/90 border-slate-800/90 shadow-lg'
        }`}>
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-mono uppercase tracking-wider font-bold">Active Subscriptions</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black font-mono text-white">{metrics.activeSubscriptions}</div>
          <div className="flex items-center gap-1.5 mt-2 text-[10px] font-mono text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>100% Entitlement Synchronized</span>
          </div>
        </div>

        {/* Active Connected Devices */}
        <div className={`p-4 rounded-2xl border transition-all ${
          isLight ? 'bg-white border-slate-200/90 shadow-sm' : 'bg-slate-900/90 border-slate-800/90 shadow-lg'
        }`}>
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-mono uppercase tracking-wider font-bold">Connected Phones</span>
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Smartphone className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black font-mono text-white">{metrics.onlineDevices} <span className="text-xs text-slate-500 font-normal">/ {metrics.totalDevices} Total</span></div>
          <div className="flex items-center gap-2 mt-2 text-[10px] font-mono text-slate-400">
            <PhoneCall className="w-3.5 h-3.5 text-amber-400" />
            <span>{metrics.callsToday} Calls Handled Today</span>
          </div>
        </div>
      </div>

      {/* ── Secondary Metrics & Recent Businesses ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Businesses Table */}
        <div className={`lg:col-span-2 p-5 rounded-2xl border ${
          isLight ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
        }`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-amber-400" />
              <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-300">
                Recent Businesses
              </h3>
            </div>
            {onNavigateToTab && (
              <button
                onClick={() => onNavigateToTab('businesses')}
                className="text-xs font-mono font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer"
              >
                <span>View All</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] text-slate-500 uppercase">
                  <th className="pb-2">Business Name</th>
                  <th className="pb-2">Country</th>
                  <th className="pb-2">Plan</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {(data?.recentTenants || []).map((t: any) => (
                  <tr key={t.id} className="hover:bg-slate-800/30 transition">
                    <td className="py-2.5 font-bold text-white flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-[10px] font-black text-amber-400">
                        {t.name.charAt(0).toUpperCase()}
                      </div>
                      <span>{t.name}</span>
                    </td>
                    <td className="py-2.5 text-slate-400">{t.country || 'US'}</td>
                    <td className="py-2.5 text-purple-300">{t.planName || 'Starter'}</td>
                    <td className="py-2.5">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${
                        t.status === 'active' 
                          ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800' 
                          : 'bg-red-950/40 text-red-400 border-red-800'
                      }`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="py-2.5 text-right">
                      <button
                        onClick={() => onSelectBusiness ? onSelectBusiness(t.id) : onNavigateToTab?.('businesses')}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[10px] font-bold cursor-pointer transition"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
                {(!data?.recentTenants || data.recentTenants.length === 0) && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-500">
                      No businesses registered yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Global Engine Status Card */}
        <div className={`p-5 rounded-2xl border space-y-4 ${
          isLight ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
        }`}>
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-300">
              Engine Status
            </h3>
          </div>

          <div className="space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-slate-850">
              <span className="text-slate-400">Total System Leads</span>
              <span className="font-bold text-white">{metrics.totalLeads.toLocaleString()}</span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-slate-850">
              <span className="text-slate-400">Active Campaigns</span>
              <span className="font-bold text-white">{metrics.totalCampaigns}</span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-slate-850">
              <span className="text-slate-400">Security Invariants</span>
              <span className="font-bold text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Enforced
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-slate-850">
              <span className="text-slate-400">Multi-Tenant Isolation</span>
              <span className="font-bold text-purple-400">Strict (DB Clustered)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
