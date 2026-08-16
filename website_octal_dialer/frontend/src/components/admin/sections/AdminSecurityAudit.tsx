import React, { useState } from 'react';
import {
  Shield, FileText, Lock, Key, AlertCircle, RefreshCw, CheckCircle2, ShieldAlert
} from 'lucide-react';
import { AdminAuditLogs } from './AdminAuditLogs';

interface AdminSecurityAuditProps {
  isLight?: boolean;
  serverUrl: string;
  authToken: string;
}

type SecurityTab = 'audit' | 'auth' | 'events';

export const AdminSecurityAudit: React.FC<AdminSecurityAuditProps> = ({
  isLight,
  serverUrl,
  authToken
}) => {
  const [activeSubTab, setActiveSubTab] = useState<SecurityTab>('audit');

  return (
    <div className="space-y-6 text-left font-sans">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-black font-display tracking-tight">Security & Compliance Audit</h2>
          <p className="text-xs text-slate-400 font-medium mt-0.5">
            Immutable forensic security logs, authentication event stream, and RBAC mutation tracking.
          </p>
        </div>
      </div>

      {/* ── Sub Navigation ── */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        {[
          { id: 'audit' as SecurityTab, label: 'Audit Logs', icon: FileText },
          { id: 'auth' as SecurityTab, label: 'Authentication Events', icon: Lock },
          { id: 'events' as SecurityTab, label: 'Security Guardrails', icon: Shield }
        ].map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer transition ${
                activeSubTab === tab.id
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

      {/* ── TAB 1: AUDIT LOGS ── */}
      {activeSubTab === 'audit' && (
        <AdminAuditLogs
          isLight={isLight}
          serverUrl={serverUrl}
          authToken={authToken}
        />
      )}

      {/* ── TAB 2: AUTH EVENTS ── */}
      {activeSubTab === 'auth' && (
        <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/90 space-y-4 font-mono text-xs">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-2">
            Authentication Invariants & Threat Mitigation
          </h3>
          <p className="text-slate-400 leading-relaxed">
            All user sessions utilize cryptographically signed JSON Web Tokens (JWT) with scrypt-hashed password storage.
            Failed login attempts trigger automated IP rate limiting and brute-force throttling.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-850 space-y-1">
              <div className="text-[10px] uppercase text-emerald-400 font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> CSRF & State Nonce
              </div>
              <div className="text-xs text-slate-300">Cryptographically verified OAuth 2.0 PKCE states</div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-850 space-y-1">
              <div className="text-[10px] uppercase text-emerald-400 font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Zero Secret Exposure
              </div>
              <div className="text-xs text-slate-300">JWT secret keys & password hashes never leave backend</div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 3: SECURITY EVENTS ── */}
      {activeSubTab === 'events' && (
        <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/90 space-y-4 font-mono text-xs">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-2">
            Platform Owner Security & Immutability
          </h3>
          <div className="space-y-3 text-slate-300">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-purple-400" />
              <span>Platform Superuser account cannot be self-deleted or demoted.</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-purple-400" />
              <span>Tenant Administrators cannot elevate themselves or standard users to Platform Superuser.</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-purple-400" />
              <span>Multi-tenant data isolation strictly enforced by database foreign keys and session claims.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
