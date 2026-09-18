import React, { useState, useEffect } from 'react';
import { RefreshCw, AlertCircle, Download } from 'lucide-react';
import type { CallLog as CallLogType } from '../types';

interface CallLogProps {
  serverUrl: string;
  authToken?: string | null;
  isLight?: boolean;
}

export const CallLog: React.FC<CallLogProps> = ({ serverUrl, authToken, isLight }) => {
  const [logs, setLogs] = useState<CallLogType[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const headers: Record<string, string> = {};
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      const res = await fetch(`${serverUrl}/logs`, { headers });
      if (!res.ok) throw new Error('Failed to load call log history.');
      const data = await res.json();
      // sort logs by timestamp descending
      data.sort((a: CallLogType, b: CallLogType) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      setLogs(data);
    } catch (err: any) {
      setError(err.message || 'Error communicating with backend.');
    } finally {
      setLoading(false);
    }
  };

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const headers: Record<string, string> = {};
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      const res = await fetch(`${serverUrl}/api/logs/export`, { headers });
      if (!res.ok) throw new Error('Failed to export call logs');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `octal_dialer_call_logs_${new Date().toISOString().slice(0, 10)}.csv`;
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

  useEffect(() => {
    fetchLogs();
  }, [serverUrl, authToken]);

  const getOutcomeBadge = (outcome: string) => {
    const norm = (outcome || '').toUpperCase();
    if (norm === 'CONNECTED' || norm === 'ANSWERED' || norm === 'SUCCESS' || norm === 'INTERESTED') {
      return isLight ? 'bg-emerald-50 border-emerald-300 text-emerald-700 font-bold' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 font-bold';
    }
    if (norm === 'NO_ANSWER') return isLight ? 'bg-red-50 border-red-300 text-red-700 font-bold' : 'bg-zinc-800 border-zinc-700 text-zinc-400 font-bold';
    if (norm === 'BUSY' || norm === 'REJECTED') return isLight ? 'bg-amber-50 border-amber-300 text-amber-700 font-bold' : 'bg-red-500/10 border-red-500/30 text-red-400 font-bold';
    return isLight ? 'bg-slate-100 border-slate-300 text-slate-600 font-bold' : 'bg-[#18181b] border-[#27272a] text-zinc-400 font-bold';
  };

  const formatDate = (isoStr: string) => {
    const d = new Date(isoStr);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  return (
    <div className={`border rounded-2xl p-6 shadow-2xl space-y-6 text-left select-none transition-colors ${
      isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#09090b] border-[#18181b] text-white'
    }`}>
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b gap-3 ${
        isLight ? 'border-slate-200' : 'border-[#18181b]'
      }`}>
        <div>
          <h2 className={`text-xl font-black font-display tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
            Call Logs & Historical Reporting
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Audit real-time call durations, disposition metrics, and GSM hardware execution logs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCsv}
            disabled={exporting || logs.length === 0}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold text-xs rounded-xl transition flex items-center gap-2 cursor-pointer shadow-sm"
          >
            <Download className={`w-3.5 h-3.5 ${exporting ? 'animate-bounce' : ''}`} />
            <span>{exporting ? 'Exporting...' : 'Export CSV'}</span>
          </button>
          <button
            onClick={fetchLogs}
            disabled={loading}
            className={`p-2.5 rounded-xl border transition cursor-pointer ${
              isLight ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700' : 'bg-[#18181b] hover:bg-[#27272a] border-[#27272a] text-zinc-400 hover:text-white'
            }`}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-500' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 border text-xs rounded-2xl flex items-start gap-2 shadow-sm bg-red-500/10 border-red-500/30 text-red-400">
          <AlertCircle className="w-4.5 h-4.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && logs.length === 0 ? (
        <div className={`h-48 flex items-center justify-center text-xs font-mono ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
          Loading history files...
        </div>
      ) : logs.length === 0 ? (
        <div className={`h-48 border border-dashed rounded-2xl flex flex-col items-center justify-center text-center p-6 text-xs font-mono ${
          isLight ? 'border-slate-300 text-slate-500' : 'border-[#27272a] text-zinc-500'
        }`}>
          No calls placed in this session yet
        </div>
      ) : (
        <div className={`overflow-x-auto rounded-2xl border ${isLight ? 'border-slate-200' : 'border-[#18181b]'}`}>
          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead>
              <tr className={`border-b text-[10px] uppercase tracking-wider ${
                isLight ? 'bg-slate-50 border-slate-200 text-slate-600' : 'bg-[#121215] border-[#18181b] text-zinc-400'
              }`}>
                <th className="p-3.5">Time</th>
                <th className="p-3.5">Recipient Name</th>
                <th className="p-3.5">Phone Line</th>
                <th className="p-3.5">Campaign Group</th>
                <th className="p-3.5">Signal Outcome</th>
                <th className="p-3.5 text-right">Talk Duration</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${
              isLight ? 'divide-slate-200 text-slate-800' : 'divide-[#18181b] text-zinc-300'
            }`}>
              {logs.map((log) => (
                <tr key={log.id} className={`${isLight ? 'hover:bg-slate-50' : 'hover:bg-[#121215]/60'} transition`}>
                  <td className={`p-3.5 text-[11px] ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>{formatDate(log.timestamp)}</td>
                  <td className={`p-3.5 font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{log.leadName}</td>
                  <td className={`p-3.5 text-[11px] font-bold ${isLight ? 'text-slate-700' : 'text-zinc-400'}`}>{log.leadPhone}</td>
                  <td className={`p-3.5 ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>{log.campaignName}</td>
                  <td className="p-3.5">
                    <span className={`text-[9px] font-bold px-2.5 py-0.5 border rounded-full uppercase ${getOutcomeBadge(log.outcome)}`}>
                      {log.outcome}
                    </span>
                  </td>
                  <td className={`p-3.5 text-right font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{log.duration}s</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
