import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText, Search, Filter, RefreshCw, AlertCircle, Eye, ChevronLeft, ChevronRight,
  Shield, Clock, User, Activity, CheckCircle2, Lock
} from 'lucide-react';

interface AuditLogEntry {
  id: string;
  userId?: string;
  username: string;
  action: string;
  targetType?: string;
  targetId?: string;
  details?: string;
  ipAddress?: string;
  userAgent?: string;
  timestamp: string;
  tenantId?: string;
}

interface AdminAuditLogsProps {
  isLight?: boolean;
  serverUrl: string;
  authToken: string;
}

export const AdminAuditLogs: React.FC<AdminAuditLogsProps> = ({
  isLight,
  serverUrl,
  authToken
}) => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);
  const pageSize = 20;

  const fetchAuditLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: pageSize.toString()
      });
      if (searchQuery) params.append('username', searchQuery);
      if (actionFilter !== 'ALL') params.append('action', actionFilter);

      // Try platform admin endpoint first, fall back to tenant admin endpoint
      let res = await fetch(`${serverUrl}/admin/audit-logs?${params}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      if (res.status === 403) {
        res = await fetch(`${serverUrl}/api/audit-logs?${params}`, {
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
      }

      if (res.ok) {
        const data = await res.json();
        if (data.logs && Array.isArray(data.logs)) {
          setLogs(data.logs);
          setTotalPages(data.pagination?.totalPages || 1);
          setTotalCount(data.pagination?.total || data.logs.length);
        } else if (Array.isArray(data)) {
          setLogs(data);
          setTotalPages(Math.ceil(data.length / pageSize) || 1);
          setTotalCount(data.length);
        }
      } else {
        const errData = await res.json();
        setError(errData.error || 'Failed to fetch audit logs');
      }
    } catch (err: any) {
      setError(err.message || 'Connection error while fetching audit logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs();
  }, [serverUrl, authToken, page, actionFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchAuditLogs();
  };

  const getActionBadge = (action: string) => {
    const act = (action || '').toUpperCase();
    if (act.includes('LOGIN') || act.includes('AUTH')) {
      return isLight ? 'bg-blue-100 text-blue-800 border-blue-300' : 'bg-blue-950/40 text-blue-400 border-blue-800';
    }
    if (act.includes('CREATE') || act.includes('ADD')) {
      return isLight ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-emerald-950/40 text-emerald-400 border-emerald-800';
    }
    if (act.includes('DELETE') || act.includes('REVOKE') || act.includes('SUSPEND') || act.includes('EMERGENCY')) {
      return isLight ? 'bg-red-100 text-red-800 border-red-300' : 'bg-red-950/40 text-red-400 border-red-800';
    }
    if (act.includes('UPDATE') || act.includes('ROLE') || act.includes('SETTINGS') || act.includes('PLAN')) {
      return isLight ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-amber-950/40 text-amber-400 border-amber-800';
    }
    return isLight ? 'bg-slate-100 text-slate-700 border-slate-300' : 'bg-slate-900 text-slate-400 border-slate-800';
  };

  // Safe details formatter that redacts secrets and tokens
  const formatDetails = (rawDetails?: string) => {
    if (!rawDetails) return '—';
    try {
      const parsed = typeof rawDetails === 'string' ? JSON.parse(rawDetails) : rawDetails;
      // Redact sensitive keys
      const sensitiveKeys = ['password', 'passwordHash', 'token', 'secret', 'apiKey', 'signature', 'jwt'];
      const sanitizeObj = (obj: any): any => {
        if (typeof obj !== 'object' || obj === null) return obj;
        const copy: Record<string, any> = {};
        for (const [k, v] of Object.entries(obj)) {
          if (sensitiveKeys.some(sk => k.toLowerCase().includes(sk.toLowerCase()))) {
            copy[k] = '••••••••••••••••';
          } else if (typeof v === 'object') {
            copy[k] = sanitizeObj(v);
          } else {
            copy[k] = v;
          }
        }
        return copy;
      };
      return JSON.stringify(sanitizeObj(parsed), null, 2);
    } catch {
      return rawDetails;
    }
  };

  return (
    <div className="space-y-6 text-left">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className={`text-xl font-black font-display tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
            Security & Operational Audit Logs
          </h2>
          <p className={`text-xs mt-1 font-medium ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
            Immutable compliance record of user authentication, security mutations, export events, and role updates.
          </p>
        </div>

        <button
          onClick={fetchAuditLogs}
          disabled={loading}
          className={`p-2 rounded-xl border transition-all cursor-pointer self-start sm:self-auto ${
            isLight ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700' : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300'
          }`}
          title="Refresh audit logs"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-500' : ''}`} />
        </button>
      </div>

      {error && (
        <div className={`p-3.5 border text-xs rounded-xl flex items-start gap-2.5 shadow-sm ${
          isLight ? 'bg-red-50 border-red-200 text-red-700' : 'bg-red-950/30 border-red-900/50 text-red-400'
        }`}>
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Filter Bar */}
      <form onSubmit={handleSearchSubmit} className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search by actor username..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className={`w-full pl-9 pr-3 py-2 text-xs rounded-xl border font-mono transition-colors outline-none ${
              isLight ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-amber-500' : 'bg-slate-900 border-slate-800 text-white focus:border-amber-500/50'
            }`}
          />
        </div>

        <div className="flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5 text-slate-500" />
          <select
            value={actionFilter}
            onChange={e => { setActionFilter(e.target.value); setPage(1); }}
            className={`text-xs rounded-xl border px-3 py-2 font-mono outline-none cursor-pointer ${
              isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-800 text-slate-200'
            }`}
          >
            <option value="ALL">All Event Actions</option>
            <option value="user_login">User Login</option>
            <option value="user_create">User Create</option>
            <option value="user_delete">User Delete</option>
            <option value="role_update">Role Update</option>
            <option value="permission_toggle">Permission Toggle</option>
            <option value="lead_export">Lead Export</option>
            <option value="plan_change">Plan Change</option>
            <option value="api_key_create">API Key Create</option>
            <option value="api_key_revoke">API Key Revoke</option>
            <option value="emergency_stop">Emergency Stop</option>
          </select>
        </div>

        <button
          type="submit"
          className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl transition cursor-pointer"
        >
          Search
        </button>
      </form>

      {/* Audit Log Table */}
      {loading && logs.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-xs font-mono text-slate-500">
          Loading audit trail...
        </div>
      ) : logs.length === 0 ? (
        <div className="h-40 border border-dashed rounded-2xl flex flex-col items-center justify-center text-center p-6 text-slate-500 text-xs font-mono border-slate-800">
          No audit events found matching query filters
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-800/90">
          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead>
              <tr className={`border-b text-[9px] uppercase tracking-wider ${
                isLight ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-slate-900 text-slate-400 border-slate-800'
              }`}>
                <th className="p-3">Timestamp</th>
                <th className="p-3">Actor (User)</th>
                <th className="p-3">Action</th>
                <th className="p-3">Target / Entity</th>
                <th className="p-3">Origin IP</th>
                <th className="p-3 text-right">Details</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isLight ? 'divide-slate-200 text-slate-800' : 'divide-slate-900 text-slate-300'}`}>
              {logs.map((log) => {
                const d = new Date(log.timestamp);
                const formattedDate = !isNaN(d.getTime())
                  ? `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                  : log.timestamp;

                return (
                  <tr key={log.id} className={isLight ? 'hover:bg-slate-50' : 'hover:bg-slate-900/40'}>
                    <td className="p-3 text-[10px] text-slate-500">{formattedDate}</td>
                    <td className={`p-3 font-bold font-body ${isLight ? 'text-slate-900' : 'text-white'}`}>
                      {log.username || 'system'}
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded border text-[9px] font-bold uppercase ${getActionBadge(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="p-3 text-slate-400">
                      {log.targetType ? `${log.targetType} ${log.targetId ? `(${log.targetId.slice(0, 8)}...)` : ''}` : '—'}
                    </td>
                    <td className="p-3 text-[10px] text-slate-500">
                      {log.ipAddress || '127.0.0.1'}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition cursor-pointer"
                        title="View event payload details"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </td>
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
          <span>Showing page {page} of {totalPages} ({totalCount} total entries)</span>
          <div className="flex items-center gap-1.5">
            <button
              disabled={page === 1 || loading}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="px-3 py-1 rounded-lg border border-slate-800 disabled:opacity-40 hover:bg-slate-800 cursor-pointer flex items-center gap-1"
            >
              <ChevronLeft className="w-3 h-3" />
              <span>Prev</span>
            </button>
            <span className="px-2 font-bold text-white">{page}</span>
            <button
              disabled={page === totalPages || loading}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              className="px-3 py-1 rounded-lg border border-slate-800 disabled:opacity-40 hover:bg-slate-800 cursor-pointer flex items-center gap-1"
            >
              <span>Next</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* ── Modal: Event Details Drawer ── */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className={`w-full max-w-lg border rounded-2xl p-6 shadow-2xl space-y-4 ${
            isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
          }`}>
            <div className="flex items-center justify-between border-b pb-3 border-slate-800">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-amber-500" />
                <h3 className="text-base font-bold font-display">Audit Event Details</h3>
              </div>
              <button onClick={() => setSelectedLog(null)} className="text-slate-400 hover:text-white text-lg cursor-pointer">×</button>
            </div>

            <div className="space-y-3 font-mono text-xs max-h-[60vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2.5 rounded-xl border border-slate-800 bg-slate-900/40">
                  <span className="text-[9px] text-slate-500 block uppercase">Event ID</span>
                  <span className="font-bold text-slate-200">{selectedLog.id}</span>
                </div>
                <div className="p-2.5 rounded-xl border border-slate-800 bg-slate-900/40">
                  <span className="text-[9px] text-slate-500 block uppercase">Actor</span>
                  <span className="font-bold text-amber-400">{selectedLog.username}</span>
                </div>
                <div className="p-2.5 rounded-xl border border-slate-800 bg-slate-900/40">
                  <span className="text-[9px] text-slate-500 block uppercase">Action Type</span>
                  <span className="font-bold text-slate-200">{selectedLog.action}</span>
                </div>
                <div className="p-2.5 rounded-xl border border-slate-800 bg-slate-900/40">
                  <span className="text-[9px] text-slate-500 block uppercase">IP Address</span>
                  <span className="font-bold text-slate-200">{selectedLog.ipAddress || '127.0.0.1'}</span>
                </div>
              </div>

              {selectedLog.userAgent && (
                <div className="p-2.5 rounded-xl border border-slate-800 bg-slate-900/40 text-[10px]">
                  <span className="text-[9px] text-slate-500 block uppercase">Client User Agent</span>
                  <span className="text-slate-400 break-all">{selectedLog.userAgent}</span>
                </div>
              )}

              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Structured Payload (Sanitized)</span>
                <pre className="p-3 rounded-xl border border-slate-800 bg-slate-900 text-amber-300 text-[11px] overflow-x-auto whitespace-pre-wrap">
                  {formatDetails(selectedLog.details)}
                </pre>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-white font-mono text-xs rounded-xl transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
