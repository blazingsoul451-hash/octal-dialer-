import React, { useState } from 'react';
import {
  Shield, FileText, Lock, CheckCircle2
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
      <div className={`flex items-center gap-2 border-b pb-3 ${isLight ? 'border-slate-200' : 'border-[#18181b]'}`}>
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
                  : isLight ? 'bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200 hover:bg-slate-200' : 'bg-[#18181b] text-slate-400 hover:text-white border border-[#18181b]'
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
        <div className={`p-5 rounded-2xl border space-y-4 font-mono text-xs ${
          isLight ? 'bg-white border-slate-200 text-slate-900 shadow-sm' : 'border-[#18181b] bg-[#09090b] text-white'
        }`}>
          <h3 className={`text-xs font-bold uppercase tracking-wider border-b pb-2 ${isLight ? 'text-slate-700 border-slate-200' : 'text-slate-400 border-[#18181b]'}`}>
            Authentication Invariants & Threat Mitigation
          </h3>
          <p className={`leading-relaxed ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
            All user sessions utilize cryptographically signed JSON Web Tokens (JWT) with scrypt-hashed password storage.
            Failed login attempts trigger automated IP rate limiting and brute-force throttling.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className={`p-4 rounded-xl border space-y-1 ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#121215] border-[#27272a]'}`}>
              <div className="text-[10px] uppercase text-emerald-500 font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> CSRF & State Nonce
              </div>
              <div className={`text-xs ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Cryptographically verified OAuth 2.0 PKCE states</div>
            </div>

            <div className={`p-4 rounded-xl border space-y-1 ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#121215] border-[#27272a]'}`}>
              <div className="text-[10px] uppercase text-emerald-500 font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Zero Secret Exposure
              </div>
              <div className={`text-xs ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>JWT secret keys & password hashes never leave backend</div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 3: SECURITY EVENTS ── */}
      {activeSubTab === 'events' && (
        <div className={`p-5 rounded-2xl border space-y-4 font-mono text-xs ${
          isLight ? 'bg-white border-slate-200 text-slate-900 shadow-sm' : 'border-[#18181b] bg-[#09090b] text-white'
        }`}>
          <h3 className={`text-xs font-bold uppercase tracking-wider border-b pb-2 ${isLight ? 'text-slate-700 border-slate-200' : 'text-slate-400 border-[#18181b]'}`}>
            Platform Owner Security & Immutability
          </h3>
          <div className={`space-y-3 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-purple-500" />
              <span>Platform Superuser account cannot be self-deleted or demoted.</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-purple-500" />
              <span>Tenant Administrators cannot elevate themselves or standard users to Platform Superuser.</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-purple-500" />
              <span>Multi-tenant data isolation strictly enforced by database foreign keys and session claims.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
