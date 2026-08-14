import React, { useState, useEffect } from 'react';
import { History, RefreshCw, AlertCircle, Download } from 'lucide-react';
import type { CallLog as CallLogType } from '../types';

interface CallLogProps {
  serverUrl: string;
  isLight?: boolean;
}

export const CallLog: React.FC<CallLogProps> = ({ serverUrl, isLight }) => {
  const [logs, setLogs] = useState<CallLogType[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/logs`);
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

  useEffect(() => {
    fetchLogs();
  }, [serverUrl]);

  const getOutcomeBadge = (outcome: string) => {
    const norm = (outcome || '').toUpperCase();
    if (norm === 'CONNECTED' || norm === 'ANSWERED' || norm === 'SUCCESS' || norm === 'INTERESTED') {
      return isLight ? 'bg-emerald-50 border-emerald-300 text-emerald-700 font-bold' : 'bg-emerald-950/30 border-emerald-900 text-emerald-400';
    }
    if (norm === 'NO_ANSWER') return isLight ? 'bg-red-50 border-red-300 text-red-700 font-bold' : 'bg-red-950/30 border-red-900 text-red-400';
    if (norm === 'BUSY') return isLight ? 'bg-amber-50 border-amber-300 text-amber-700 font-bold' : 'bg-amber-955/30 border-amber-900 text-amber-400';
    return isLight ? 'bg-slate-100 border-slate-300 text-slate-600 font-bold' : 'bg-slate-900 border-slate-800 text-slate-400';
  };

  const formatDate = (isoStr: string) => {
    const d = new Date(isoStr);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  return (
    <div className={`border rounded-2xl p-6 shadow-2xl space-y-6 text-left transition-colors ${
      isLight ? 'bg-white border-slate-200/90 shadow-slate-200/50 text-slate-900' : 'bg-[#0f172a]/95 border-slate-800/90 text-white'
    }`}>
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b gap-3 ${
        isLight ? 'border-slate-200' : 'border-slate-800/80'
      }`}>
        <div>
          <h2 className={`text-xl font-black font-display tracking-tight ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
            Call Logs & Historical Reporting
          </h2>
          <p className={`text-xs mt-1 ${isLight ? 'text-slate-600 font-semibold' : 'text-slate-400'}`}>
            Audit real-time call durations, disposition metrics, and GSM hardware execution logs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`${serverUrl}/logs/export`}
            download
            className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-md"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </a>
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="p-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-400 hover:text-white rounded-xl transition cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className={`p-3 border text-xs rounded-xl flex items-start gap-2 ${
          isLight ? 'bg-red-50 border-red-200 text-red-700' : 'bg-red-950/20 border-red-900/30 text-red-400'
        }`}>
          <AlertCircle className="w-4.5 h-4.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && logs.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-xs font-mono text-slate-500">
          Loading history files...
        </div>
      ) : logs.length === 0 ? (
        <div className={`h-48 border border-dashed rounded-xl flex flex-col items-center justify-center text-center p-6 text-slate-500 text-xs font-mono ${
          isLight ? 'border-slate-300 bg-slate-50/50' : 'border-slate-850'
        }`}>
          No calls placed in this session yet
        </div>
      ) : (
        <div className={`overflow-x-auto rounded-xl border ${
          isLight ? 'border-slate-200 bg-white' : 'border-slate-855 bg-slate-950'
        }`}>
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className={`border-b font-mono text-[9px] uppercase ${
                isLight ? 'bg-slate-100 border-slate-200 text-slate-600' : 'bg-slate-900 border-slate-850 text-slate-400'
              }`}>
                <th className="p-3">Time</th>
                <th className="p-3">Recipient Name</th>
                <th className="p-3">Phone Line</th>
                <th className="p-3">Campaign Group</th>
                <th className="p-3">Bluetooth Signal Outcome</th>
                <th className="p-3">Talk Duration</th>
              </tr>
            </thead>
            <tbody className={`divide-y font-mono ${
              isLight ? 'divide-slate-200 text-slate-800' : 'divide-slate-900 text-slate-350'
            }`}>
              {logs.map((log) => (
                <tr key={log.id} className={isLight ? 'hover:bg-slate-50' : 'hover:bg-slate-900/40 transition'}>
                  <td className="p-3 text-[10px] text-slate-500">{formatDate(log.timestamp)}</td>
                  <td className={`p-3 font-body font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{log.leadName}</td>
                  <td className="p-3 text-[10px] text-slate-500">{log.leadPhone}</td>
                  <td className="p-3 font-body text-slate-500">{log.campaignName}</td>
                  <td className="p-3">
                    <span className={`text-[8px] font-bold px-2 py-0.5 border rounded uppercase ${getOutcomeBadge(log.outcome)}`}>
                      {log.outcome}
                    </span>
                  </td>
                  <td className="p-3 font-bold">{log.duration}s</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
