import React, { useState, useEffect } from 'react';
import {
  AlertCircle, RefreshCw, Shield
} from 'lucide-react';

interface AdminModuleControlProps {
  isLight?: boolean;
  serverUrl: string;
  authToken: string;
}

export const AdminModuleControl: React.FC<AdminModuleControlProps> = ({
  isLight,
  serverUrl,
  authToken
}) => {
  const [modules, setModules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchModules = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/admin/modules`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        const json = await res.json();
        setModules(json.modules || []);
      } else {
        const err = await res.json();
        setError(err.error || 'Failed to fetch global modules');
      }
    } catch (err: any) {
      setError(err.message || 'Connection error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchModules();
  }, [serverUrl, authToken]);

  const handleToggleModule = async (moduleId: string, currentEnabled: number) => {
    setUpdatingId(moduleId);
    const newEnabled = currentEnabled === 1 ? 0 : 1;
    try {
      const res = await fetch(`${serverUrl}/admin/modules/${moduleId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ enabled: newEnabled })
      });
      if (res.ok) {
        setModules(prev => prev.map(m => m.id === moduleId ? { ...m, enabled: newEnabled } : m));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-6 text-left font-sans">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-black font-display tracking-tight">Platform Module Control</h2>
          <p className="text-xs text-slate-400 font-medium mt-0.5">
            Global master switches for all 9 business modules across the Octal Dialer ecosystem.
          </p>
        </div>
        <button
          onClick={fetchModules}
          disabled={loading}
          className={`px-3 py-1.5 rounded-xl border text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer transition ${
            isLight ? 'border-slate-300 bg-white hover:bg-slate-50 text-slate-700' : 'border-[#18181b] bg-[#18181b] hover:bg-[#27272a] text-slate-300'
          }`}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      <div className={`p-4 rounded-xl text-xs font-mono flex items-center gap-2 ${
        isLight ? 'bg-purple-50 border border-purple-200 text-purple-800' : 'bg-purple-950/20 border border-purple-800/40 text-purple-300'
      }`}>
        <Shield className="w-4 h-4 text-purple-500 shrink-0" />
        <span>
          <strong>Hierarchy Note:</strong> Global Module State controls platform availability. A module must be globally enabled here before tenants and users can access it.
        </span>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs text-rose-500 bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl font-mono">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ── Modules Grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {modules.map(mod => {
          const isEnabled = mod.enabled === 1 || mod.enabled === true;
          const isUpdating = updatingId === mod.id;
          return (
            <div
              key={mod.id}
              className={`p-5 rounded-2xl border transition-all ${
                isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#09090b] border-[#18181b]'
              } flex flex-col justify-between space-y-4`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <h3 className={`text-sm font-bold font-mono ${isLight ? 'text-slate-900' : 'text-white'}`}>{mod.name}</h3>
                  <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase border ${
                    isEnabled
                      ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800'
                      : 'bg-red-950/40 text-red-400 border-red-800'
                  }`}>
                    {isEnabled ? 'GLOBAL: ACTIVE' : 'GLOBAL: DISABLED'}
                  </span>
                </div>
                <p className={`text-xs font-mono mt-2 leading-relaxed ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                  {mod.description}
                </p>
              </div>

              <div className={`pt-3 border-t flex items-center justify-between ${isLight ? 'border-slate-100' : 'border-[#18181b]'}`}>
                <span className="text-[10px] font-mono text-slate-500">ID: {mod.id}</span>
                <button
                  onClick={() => handleToggleModule(mod.id, isEnabled ? 1 : 0)}
                  disabled={isUpdating}
                  className={`px-3 py-1 rounded-xl text-xs font-mono font-bold border cursor-pointer transition ${
                    isEnabled
                      ? 'bg-red-950/40 hover:bg-red-900/60 border-red-800 text-red-400'
                      : 'bg-emerald-950/40 hover:bg-emerald-900/60 border-emerald-800 text-emerald-400'
                  }`}
                >
                  {isUpdating ? 'Updating...' : isEnabled ? 'Disable Globally' : 'Enable Globally'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
