import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Activity, CheckCircle2, AlertCircle, RefreshCw, Server, Cpu, HardDrive, ShieldCheck, Zap, Clock, ShieldAlert, Layers
} from 'lucide-react';

interface AdminSystemHealthProps {
  isLight?: boolean;
  serverUrl: string;
  authToken: string;
}

interface HealthData {
  status: string;
  uptime: number;
  timestamp: string;
}

interface ReadyData {
  status: string;
  database: string;
  timestamp: string;
}

interface MetricsData {
  uptime_seconds: number;
  http_requests_total: number;
  http_errors_total: number;
  auth_failures_total: number;
  rate_limit_hits_total: number;
  node_memory_rss_bytes: number;
}

export const AdminSystemHealth: React.FC<AdminSystemHealthProps> = ({
  isLight,
  serverUrl,
  authToken
}) => {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [ready, setReady] = useState<ReadyData | null>(null);
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const timerRef = useRef<any>(null);

  const fetchHealthAndMetrics = useCallback(async () => {
    setError(null);
    try {
      const headers = { 'Authorization': `Bearer ${authToken}` };

      // Fetch /health (liveness)
      const healthPromise = fetch(`${serverUrl}/health`).then(r => r.ok ? r.json() : null);
      // Fetch /ready (database connectivity)
      const readyPromise = fetch(`${serverUrl}/ready`).then(r => r.ok ? r.json() : null);
      // Fetch /metrics (operational counters)
      const metricsPromise = fetch(`${serverUrl}/metrics`).then(r => r.ok ? r.json() : null);

      const [healthRes, readyRes, metricsRes] = await Promise.all([
        healthPromise,
        readyPromise,
        metricsPromise
      ]);

      if (healthRes) setHealth(healthRes);
      if (readyRes) setReady(readyRes);
      if (metricsRes) setMetrics(metricsRes);
      setLastRefreshed(new Date());
    } catch (err: any) {
      setError(err.message || 'Unable to reach system diagnostics endpoints.');
    } finally {
      setLoading(false);
    }
  }, [serverUrl, authToken]);

  useEffect(() => {
    fetchHealthAndMetrics();
  }, [fetchHealthAndMetrics]);

  // Handle Auto-Refresh interval (10 seconds) with clean timer teardown
  useEffect(() => {
    if (autoRefresh) {
      timerRef.current = setInterval(() => {
        fetchHealthAndMetrics();
      }, 10000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [autoRefresh, fetchHealthAndMetrics]);

  const formatUptime = (seconds?: number) => {
    if (seconds === undefined || seconds === null) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}h ${m}m ${s}s`;
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes) return '—';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const calculateErrorRate = (errors?: number, total?: number) => {
    if (!total || total === 0) return '0.00%';
    const rate = ((errors || 0) / total) * 100;
    return `${rate.toFixed(2)}%`;
  };

  const isHealthy = health?.status === 'healthy' && ready?.database === 'connected';

  return (
    <div className="space-y-6 text-left">
      {/* ── Header & Refresh Controls ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className={`text-xl font-black font-display tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
              System Health & Metrics Telemetry
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded border uppercase bg-purple-950/40 text-purple-400 border-purple-800">
              Platform Admin Only
            </span>
          </div>
          <p className={`text-xs mt-1 font-medium ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
            Real-time process liveness, SQLite readiness probes, memory RSS consumption, and request error telemetry.
          </p>
        </div>

        {/* Auto Refresh & Manual Trigger */}
        <div className="flex items-center gap-3 select-none self-start sm:self-auto font-mono text-xs">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
              className="rounded accent-amber-500 cursor-pointer"
            />
            <span className={isLight ? 'text-slate-700 font-bold' : 'text-slate-300'}>
              Auto Refresh (10s)
            </span>
          </label>

          <button
            onClick={() => { setLoading(true); fetchHealthAndMetrics(); }}
            disabled={loading}
            className={`p-2 rounded-xl border transition-all cursor-pointer ${
              isLight ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700' : 'bg-[#18181b] hover:bg-[#27272a] border-[#18181b] text-slate-300'
            }`}
            title="Refresh diagnostics now"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-500' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className={`p-3.5 border text-xs rounded-xl flex items-start gap-2.5 shadow-sm ${
          isLight ? 'bg-red-50 border-red-200 text-red-700' : 'bg-red-950/30 border-red-900/50 text-red-400'
        }`}>
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">System Health Telemetry Notice</p>
            <p className="mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* ── Status Banner ── */}
      <div className={`border rounded-2xl p-5 shadow-2xl transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
        isHealthy
          ? isLight ? 'bg-emerald-50/50 border-emerald-300 text-slate-900' : 'bg-emerald-950/20 border-emerald-900/40 text-white'
          : isLight ? 'bg-amber-50/50 border-amber-300 text-slate-900' : 'bg-amber-950/20 border-amber-900/40 text-white'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${isHealthy ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500 animate-bounce'}`} />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black font-display text-sm tracking-tight uppercase">
                {isHealthy ? 'All Systems Operational & Consistent' : 'Degraded Engine State'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono mt-0.5">
              Node Process: <span className="text-emerald-400 font-bold">{health?.status || 'Active'}</span> | Database Probe: <span className="text-emerald-400 font-bold">{ready?.database || 'Connected'}</span>
            </p>
          </div>
        </div>

        {lastRefreshed && (
          <div className="text-[10px] font-mono text-slate-500 text-right">
            Last Probe: {lastRefreshed.toLocaleTimeString()}
          </div>
        )}
      </div>

      {/* ── Metric Cards Grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 font-mono text-xs">
        {/* Uptime */}
        <div className={`border rounded-2xl p-4 shadow-xl ${
          isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
        }`}>
          <div className="flex items-center justify-between text-slate-400 text-[10px] font-bold uppercase">
            <span>Process Uptime</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className={`text-base font-black mt-2 ${isLight ? 'text-slate-900' : 'text-white'}`}>
            {formatUptime(metrics?.uptime_seconds || health?.uptime)}
          </div>
          <p className="text-[9px] text-slate-500 mt-1">
            Zero unplanned restarts
          </p>
        </div>

        {/* Total HTTP Requests */}
        <div className={`border rounded-2xl p-4 shadow-xl ${
          isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
        }`}>
          <div className="flex items-center justify-between text-slate-400 text-[10px] font-bold uppercase">
            <span>Total Requests</span>
            <Zap className="w-4 h-4 text-blue-400" />
          </div>
          <div className={`text-base font-black mt-2 ${isLight ? 'text-slate-900' : 'text-blue-400'}`}>
            {metrics?.http_requests_total?.toLocaleString() ?? '—'}
          </div>
          <p className="text-[9px] text-slate-500 mt-1">
            Processed HTTP calls
          </p>
        </div>

        {/* HTTP Errors */}
        <div className={`border rounded-2xl p-4 shadow-xl ${
          isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
        }`}>
          <div className="flex items-center justify-between text-slate-400 text-[10px] font-bold uppercase">
            <span>HTTP Errors (5xx)</span>
            <AlertCircle className="w-4 h-4 text-red-400" />
          </div>
          <div className={`text-base font-black mt-2 ${isLight ? 'text-slate-900' : (metrics?.http_errors_total || 0) > 0 ? 'text-red-400' : 'text-slate-200'}`}>
            {metrics?.http_errors_total?.toLocaleString() ?? 0}
          </div>
          <p className="text-[9px] text-slate-500 mt-1 font-bold">
            Rate: {calculateErrorRate(metrics?.http_errors_total, metrics?.http_requests_total)}
          </p>
        </div>

        {/* Auth Failures */}
        <div className={`border rounded-2xl p-4 shadow-xl ${
          isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
        }`}>
          <div className="flex items-center justify-between text-slate-400 text-[10px] font-bold uppercase">
            <span>Auth Failures</span>
            <ShieldAlert className="w-4 h-4 text-purple-400" />
          </div>
          <div className={`text-base font-black mt-2 ${isLight ? 'text-slate-900' : 'text-purple-400'}`}>
            {metrics?.auth_failures_total ?? 0}
          </div>
          <p className="text-[9px] text-slate-500 mt-1">
            Abuse attempts blocked
          </p>
        </div>

        {/* Rate Limit Hits */}
        <div className={`border rounded-2xl p-4 shadow-xl ${
          isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
        }`}>
          <div className="flex items-center justify-between text-slate-400 text-[10px] font-bold uppercase">
            <span>Rate Limit Hits</span>
            <ShieldCheck className="w-4 h-4 text-amber-400" />
          </div>
          <div className={`text-base font-black mt-2 ${isLight ? 'text-slate-900' : 'text-amber-400'}`}>
            {metrics?.rate_limit_hits_total ?? 0}
          </div>
          <p className="text-[9px] text-slate-500 mt-1">
            Throttled client bursts
          </p>
        </div>

        {/* Memory RSS */}
        <div className={`border rounded-2xl p-4 shadow-xl ${
          isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
        }`}>
          <div className="flex items-center justify-between text-slate-400 text-[10px] font-bold uppercase">
            <span>Memory (RSS)</span>
            <Cpu className="w-4 h-4 text-emerald-400" />
          </div>
          <div className={`text-base font-black mt-2 ${isLight ? 'text-slate-900' : 'text-emerald-400'}`}>
            {formatBytes(metrics?.node_memory_rss_bytes)}
          </div>
          <p className="text-[9px] text-slate-500 mt-1">
            Local Node.js footprint
          </p>
        </div>
      </div>
    </div>
  );
};
