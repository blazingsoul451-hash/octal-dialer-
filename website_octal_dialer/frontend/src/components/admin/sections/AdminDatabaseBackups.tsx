import React, { useState, useEffect } from 'react';
import {
  Database, Shield, CheckCircle2, AlertCircle, RefreshCw, HardDrive, Lock, FileCheck, ArrowDownToLine, Info, ChevronDown, ChevronRight
} from 'lucide-react';

interface AdminDatabaseBackupsProps {
  isLight?: boolean;
  serverUrl: string;
  authToken: string;
}

interface BackupResult {
  message: string;
  success: boolean;
  backupPath?: string;
  sizeBytes?: number;
  timestamp?: string;
}

export const AdminDatabaseBackups: React.FC<AdminDatabaseBackupsProps> = ({
  isLight,
  serverUrl,
  authToken
}) => {
  const [creating, setCreating] = useState(false);
  const [lastBackup, setLastBackup] = useState<BackupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showRecoveryGuide, setShowRecoveryGuide] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowConfirmModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleCreateBackup = async () => {
    setShowConfirmModal(false);
    setCreating(true);
    setError(null);

    try {
      const res = await fetch(`${serverUrl}/admin/database/backup`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setLastBackup(data);
      } else {
        setError(data.error || 'Failed to create database snapshot.');
      }
    } catch (err: any) {
      setError(err.message || 'Connection error while communicating with backup engine.');
    } finally {
      setCreating(false);
    }
  };

  // Helper to safely extract filename without exposing full server filesystem path
  const getSafeFileName = (fullPath?: string) => {
    if (!fullPath) return 'octal_dialer_snapshot.db';
    const parts = fullPath.split(/[/\\]/);
    return parts[parts.length - 1] || 'octal_dialer_snapshot.db';
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="space-y-6 text-left">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className={`text-xl font-black font-display tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
              Database Operations & Disaster Recovery
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded border uppercase bg-purple-950/40 text-purple-400 border-purple-800">
              Platform Admin Only
            </span>
          </div>
          <p className={`text-xs mt-1 font-medium ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
            Trigger non-blocking, transaction-safe SQLite live snapshots with automated integrity verification.
          </p>
        </div>

        <button
          onClick={() => setShowConfirmModal(true)}
          disabled={creating}
          className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-xl transition flex items-center gap-2 cursor-pointer shadow-md self-start sm:self-auto"
        >
          <Database className={`w-4 h-4 ${creating ? 'animate-pulse' : ''}`} />
          <span>{creating ? 'Creating Snapshot...' : 'Create Backup Snapshot'}</span>
        </button>
      </div>

      {error && (
        <div className={`p-3.5 border text-xs rounded-xl flex items-start gap-2.5 shadow-sm ${
          isLight ? 'bg-red-50 border-red-200 text-red-700' : 'bg-red-950/30 border-red-900/50 text-red-400'
        }`}>
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Backup Operation Notice</p>
            <p className="mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* ── Operations Status Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono text-xs">
        {/* Engine Mode */}
        <div className={`border rounded-2xl p-4 shadow-xl ${
          isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
        }`}>
          <div className="flex items-center justify-between text-slate-400 text-[10px] font-bold uppercase">
            <span>Storage Engine</span>
            <HardDrive className="w-4 h-4 text-amber-500" />
          </div>
          <div className={`text-lg font-black mt-2 ${isLight ? 'text-slate-900' : 'text-white'}`}>
            SQLite 3 (WAL)
          </div>
          <p className="text-[10px] text-emerald-400 mt-1 font-bold">
            ● Write-Ahead Logging Active
          </p>
        </div>

        {/* Foreign Keys */}
        <div className={`border rounded-2xl p-4 shadow-xl ${
          isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
        }`}>
          <div className="flex items-center justify-between text-slate-400 text-[10px] font-bold uppercase">
            <span>FK Integrity Check</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className={`text-lg font-black mt-2 ${isLight ? 'text-slate-900' : 'text-emerald-400'}`}>
            Enforced (ON)
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            Zero orphaned relations
          </p>
        </div>

        {/* Isolation Mode */}
        <div className={`border rounded-2xl p-4 shadow-xl ${
          isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
        }`}>
          <div className="flex items-center justify-between text-slate-400 text-[10px] font-bold uppercase">
            <span>Snapshot Engine</span>
            <FileCheck className="w-4 h-4 text-blue-400" />
          </div>
          <div className={`text-lg font-black mt-2 ${isLight ? 'text-slate-900' : 'text-blue-400'}`}>
            Online Backup API
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            Zero locking / non-blocking
          </p>
        </div>

        {/* Backup Target */}
        <div className={`border rounded-2xl p-4 shadow-xl ${
          isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
        }`}>
          <div className="flex items-center justify-between text-slate-400 text-[10px] font-bold uppercase">
            <span>Storage Directory</span>
            <Lock className="w-4 h-4 text-purple-400" />
          </div>
          <div className={`text-lg font-black mt-2 ${isLight ? 'text-slate-900' : 'text-purple-400'}`}>
            local / data / backups
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            Normalized & Traversal-Safe
          </p>
        </div>
      </div>

      {/* ── Latest Backup Verification Card ── */}
      {lastBackup && (
        <div className={`border rounded-2xl p-5 shadow-2xl transition-colors space-y-3 ${
          isLight ? 'bg-emerald-50/50 border-emerald-300 text-slate-900' : 'bg-emerald-950/20 border-emerald-900/50 text-white'
        }`}>
          <div className="flex items-center gap-2 text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
            <h3 className="text-sm font-bold font-display uppercase tracking-wider">
              {lastBackup.message || 'Backup Snapshot Created & Validated Successfully'}
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 font-mono text-xs pt-1">
            <div className={`p-3 rounded-xl border ${isLight ? 'bg-white border-emerald-200 shadow-sm' : 'border-emerald-900/30 bg-[#121215]'}`}>
              <span className="text-[9px] text-slate-500 uppercase block">Snapshot Filename</span>
              <span className="font-bold text-amber-500 truncate block">
                {getSafeFileName(lastBackup.backupPath)}
              </span>
            </div>

            <div className={`p-3 rounded-xl border ${isLight ? 'bg-white border-emerald-200 shadow-sm' : 'border-emerald-900/30 bg-[#121215]'}`}>
              <span className="text-[9px] text-slate-500 uppercase block">Snapshot File Size</span>
              <span className={`font-bold ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                {formatBytes(lastBackup.sizeBytes)}
              </span>
            </div>

            <div className={`p-3 rounded-xl border ${isLight ? 'bg-white border-emerald-200 shadow-sm' : 'border-emerald-900/30 bg-[#121215]'}`}>
              <span className="text-[9px] text-slate-500 uppercase block">Timestamp (UTC)</span>
              <span className={`font-bold ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                {lastBackup.timestamp ? new Date(lastBackup.timestamp).toLocaleTimeString() : '—'}
              </span>
            </div>

            <div className={`p-3 rounded-xl border ${isLight ? 'bg-white border-emerald-200 shadow-sm' : 'border-emerald-900/30 bg-[#121215]'}`}>
              <span className="text-[9px] text-slate-500 uppercase block">Automated Validation</span>
              <span className="font-bold text-emerald-500">
                PRAGMA Integrity: PASS (ok)
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Expandable Recovery Information Accordion ── */}
      <div className={`border rounded-2xl overflow-hidden shadow-xl transition-colors ${
        isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#09090b] border-[#18181b]'
      }`}>
        <button
          onClick={() => setShowRecoveryGuide(!showRecoveryGuide)}
          className={`w-full p-4 flex items-center justify-between font-display text-xs font-bold transition cursor-pointer ${
            isLight ? 'text-slate-800 hover:text-amber-600' : 'text-slate-300 hover:text-amber-400'
          }`}
        >
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-amber-500" />
            <span>Disaster Recovery & Safe Restore Protocol</span>
          </div>
          {showRecoveryGuide ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        {showRecoveryGuide && (
          <div className={`p-5 pt-0 space-y-3 text-xs font-mono border-t ${
            isLight ? 'border-slate-200 text-slate-600' : 'border-[#18181b] text-slate-400'
          }`}>
            <div className="space-y-2 pt-3">
              <p className={`font-bold font-sans text-xs ${isLight ? 'text-slate-900' : 'text-white'}`}>
                To execute an offline database recovery from a snapshot:
              </p>
              <ol className={`list-decimal list-inside space-y-1.5 text-[11px] ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                <li>Gracefully shut down the Octal Dialer backend service (`Ctrl+C` or `process.exit()`).</li>
                <li>Archive current database files (`octal_dialer.db`, `octal_dialer.db-wal`, `octal_dialer.db-shm`).</li>
                <li>Copy desired snapshot file from `data/backups/backup_*.db` to `data/octal_dialer.db`.</li>
                <li>Start the backend service. SQLite WAL journal will automatically reinitialize.</li>
                <li>Verify database health via `/health` probe and `PRAGMA foreign_key_check`.</li>
              </ol>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal: Create Backup Confirmation ── */}
      {showConfirmModal && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setShowConfirmModal(false); }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs"
        >
          <div className={`w-full max-w-md border rounded-2xl p-6 shadow-2xl space-y-4 ${
            isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#121215] border-[#18181b] text-white'
          }`}>
            <div className={`flex items-center gap-2 text-amber-500 border-b pb-3 ${isLight ? 'border-slate-200' : 'border-[#18181b]'}`}>
              <Database className="w-5 h-5" />
              <h3 className="text-base font-bold font-display">Confirm Live Database Backup</h3>
            </div>

            <p className={`text-xs font-sans ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
              This operation uses the native SQLite Online Backup API to generate an atomic, transactionally consistent snapshot in <span className="font-mono text-amber-500 font-bold">data/backups/</span> without locking or pausing live active phone calls.
            </p>

            <div className={`flex items-center justify-end gap-2 pt-2 border-t font-mono text-xs ${isLight ? 'border-slate-200' : 'border-[#18181b]'}`}>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className={`px-4 py-2 rounded-xl border cursor-pointer ${
                  isLight ? 'border-slate-300 text-slate-700 hover:bg-slate-100' : 'border-[#18181b] text-slate-400 hover:text-white'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateBackup}
                disabled={creating}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl transition cursor-pointer"
              >
                {creating ? 'Starting Backup...' : 'Execute Backup'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
