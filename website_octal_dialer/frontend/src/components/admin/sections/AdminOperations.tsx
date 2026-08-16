import React, { useState, useEffect } from 'react';
import {
  Activity, Database, AlertTriangle, ShieldCheck, RefreshCw, HardDrive, Cpu,
  CheckCircle2, PlayCircle, PauseCircle, Download, FileText
} from 'lucide-react';
import { AdminSystemHealth } from './AdminSystemHealth';
import { AdminDatabaseBackups } from './AdminDatabaseBackups';

interface AdminOperationsProps {
  isLight?: boolean;
  serverUrl: string;
  authToken: string;
}

type OpTab = 'health' | 'database' | 'emergency';

export const AdminOperations: React.FC<AdminOperationsProps> = ({
  isLight,
  serverUrl,
  authToken
}) => {
  const [activeTab, setActiveTab] = useState<OpTab>('health');
  const [emergency, setEmergency] = useState<any>({ isPaused: false });
  const [loadingEmergency, setLoadingEmergency] = useState(false);
  const [pauseReason, setPauseReason] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const fetchEmergencyStatus = async () => {
    try {
      const res = await fetch(`${serverUrl}/admin/emergency/status`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        const json = await res.json();
        setEmergency(json);
      }
    } catch (_) {}
  };

  useEffect(() => {
    fetchEmergencyStatus();
  }, [serverUrl, authToken]);

  const handlePause = async () => {
    setLoadingEmergency(true);
    try {
      const res = await fetch(`${serverUrl}/admin/emergency/pause`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ reason: pauseReason || 'Manual Platform Admin Emergency Stop' })
      });
      if (res.ok) {
        const json = await res.json();
        setEmergency(json.emergencyState || { isPaused: true });
        setShowConfirmModal(false);
        setPauseReason('');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingEmergency(false);
    }
  };

  const handleResume = async () => {
    setLoadingEmergency(true);
    try {
      const res = await fetch(`${serverUrl}/admin/emergency/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        const json = await res.json();
        setEmergency(json.emergencyState || { isPaused: false });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingEmergency(false);
    }
  };

  return (
    <div className="space-y-6 text-left font-sans">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-black font-display tracking-tight">Platform Operations & Telemetry</h2>
          <p className="text-xs text-slate-400 font-medium mt-0.5">
            System diagnostics, hot SQLite database snapshots, and engine emergency safeguards.
          </p>
        </div>
      </div>

      {/* ── Sub Navigation ── */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        {[
          { id: 'health' as OpTab, label: 'System Health & Probes', icon: Activity },
          { id: 'database' as OpTab, label: 'Database & Backups', icon: Database },
          { id: 'emergency' as OpTab, label: 'Emergency Safeguards', icon: AlertTriangle }
        ].map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer transition ${
                activeTab === tab.id
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── TAB 1: SYSTEM HEALTH ── */}
      {activeTab === 'health' && (
        <AdminSystemHealth
          isLight={isLight}
          serverUrl={serverUrl}
          authToken={authToken}
        />
      )}

      {/* ── TAB 2: DATABASE BACKUPS ── */}
      {activeTab === 'database' && (
        <AdminDatabaseBackups
          isLight={isLight}
          serverUrl={serverUrl}
          authToken={authToken}
        />
      )}

      {/* ── TAB 3: EMERGENCY CONTROLS ── */}
      {activeTab === 'emergency' && (
        <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/90 space-y-6 font-mono text-xs">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              emergency.isPaused ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'
            }`}>
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white uppercase">Master Platform Emergency Controls</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Safely pause outbound campaign processing and scraper background jobs across the entire platform.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-950 border border-slate-850 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 uppercase font-bold">Platform State:</span>
              <span className={`px-2.5 py-1 rounded text-xs font-bold uppercase border ${
                emergency.isPaused
                  ? 'bg-red-950/50 text-red-400 border-red-800'
                  : 'bg-emerald-950/50 text-emerald-400 border-emerald-800'
              }`}>
                {emergency.isPaused ? '🛑 OUTBOUND PAUSED' : '🟢 NORMAL OPERATIONS'}
              </span>
            </div>

            {emergency.isPaused && (
              <div className="pt-2 border-t border-slate-850 text-slate-300 text-xs space-y-1">
                <div>Paused At: <strong className="text-white">{new Date(emergency.pausedAt).toLocaleString()}</strong></div>
                <div>Paused By: <strong className="text-white">{emergency.pausedBy}</strong></div>
                <div>Reason: <strong className="text-amber-400">{emergency.reason}</strong></div>
              </div>
            )}
          </div>

          <div className="pt-2 flex items-center gap-3">
            {emergency.isPaused ? (
              <button
                onClick={handleResume}
                disabled={loadingEmergency}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold flex items-center gap-2 cursor-pointer transition shadow-lg shadow-emerald-950/50"
              >
                <PlayCircle className="w-4 h-4" />
                <span>Resume Platform Operations</span>
              </button>
            ) : (
              <button
                onClick={() => setShowConfirmModal(true)}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold flex items-center gap-2 cursor-pointer transition shadow-lg shadow-red-950/50"
              >
                <PauseCircle className="w-4 h-4" />
                <span>Trigger Emergency Stop</span>
              </button>
            )}
          </div>

          {/* Confirmation Modal */}
          {showConfirmModal && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-red-500/50 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
                <div className="flex items-center gap-3 text-red-400">
                  <AlertTriangle className="w-6 h-6" />
                  <h3 className="text-base font-bold uppercase text-white">Confirm Emergency Stop</h3>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  This will temporarily freeze outbound queue dispatching and background scraper workers.
                  Active connected calls are not forcibly dropped to maintain telephony engine integrity.
                </p>
                <div>
                  <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">
                    Reason for Emergency Stop
                  </label>
                  <input
                    type="text"
                    value={pauseReason}
                    onChange={(e) => setPauseReason(e.target.value)}
                    placeholder="e.g. Upstream carrier maintenance"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
                  />
                </div>
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    onClick={() => setShowConfirmModal(false)}
                    className="px-3 py-1.5 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handlePause}
                    disabled={loadingEmergency}
                    className="px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl cursor-pointer"
                  >
                    Confirm Pause
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
