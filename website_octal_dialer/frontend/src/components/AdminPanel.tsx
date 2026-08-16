import React, { useState } from 'react';
import {
  Shield, Building2, Users, CreditCard, Lock, Activity, Settings, Key, LayoutDashboard, Sliders
} from 'lucide-react';
import { AdminOverview } from './admin/sections/AdminOverview';
import { AdminBusinesses } from './admin/sections/AdminBusinesses';
import { AdminUsers } from './admin/sections/AdminUsers';
import { AdminCommercial } from './admin/sections/AdminCommercial';
import { AdminSecurityAudit } from './admin/sections/AdminSecurityAudit';
import { AdminOperations } from './admin/sections/AdminOperations';
import { AdminModuleControl } from './admin/sections/AdminModuleControl';
import { AdminSystemSettings } from './admin/sections/AdminSystemSettings';
import { AdminAPIKeys } from './admin/sections/AdminAPIKeys';

interface AdminPanelProps {
  isLight?: boolean;
  serverUrl: string;
  authToken: string;
  currentUser: string;
  currentUserRole?: 'platform_admin' | 'admin' | 'agent';
}

type AdminTab = 'overview' | 'businesses' | 'users' | 'commercial' | 'security' | 'operations' | 'modules' | 'settings' | 'keys';

export const AdminPanel: React.FC<AdminPanelProps> = ({
  isLight,
  serverUrl,
  authToken,
  currentUser,
  currentUserRole = 'admin'
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null);

  const isPlatformAdmin = currentUserRole === 'platform_admin';

  // Master Navigation Items
  const navItems = [
    { id: 'overview' as AdminTab, label: 'Overview', icon: LayoutDashboard },
    { id: 'businesses' as AdminTab, label: 'Businesses', icon: Building2 },
    { id: 'users' as AdminTab, label: 'Users', icon: Users },
    { id: 'commercial' as AdminTab, label: 'Commercial', icon: CreditCard },
    { id: 'security' as AdminTab, label: 'Security & Audit', icon: Lock },
    { id: 'operations' as AdminTab, label: 'Operations', icon: Activity },
    { id: 'modules' as AdminTab, label: 'Module Control', icon: Sliders },
    { id: 'settings' as AdminTab, label: 'Platform Settings', icon: Settings },
    { id: 'keys' as AdminTab, label: 'Integrations / API', icon: Key },
  ];

  return (
    <div className="space-y-6 text-left transition-colors duration-200">
      {/* ── Enterprise Control Center Header Card ── */}
      <div className={`border rounded-2xl p-6 shadow-2xl transition-colors ${
        isLight ? 'bg-white border-slate-200/90 shadow-slate-200/50 text-slate-900' : 'bg-[#0f172a]/95 border-slate-800/90 text-white'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center shadow-lg text-white font-bold">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className={`text-2xl font-black font-display tracking-tight ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                  Enterprise Control Center
                </h1>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${
                  isPlatformAdmin
                    ? isLight ? 'bg-purple-100 text-purple-800 border-purple-300' : 'bg-purple-950/40 text-purple-400 border-purple-800'
                    : isLight ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-amber-950/40 text-amber-400 border-amber-800'
                }`}>
                  {isPlatformAdmin ? 'Platform Supreme Authority' : 'Tenant Administrator'}
                </span>
              </div>
              <p className={`text-xs mt-1 font-medium ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                Centralized platform administration for business tenants, user lifecycle, commercial subscriptions, engine operations, and forensic auditing.
              </p>
            </div>
          </div>

          <div className="text-right text-xs font-mono text-slate-500 self-start sm:self-auto">
            <span>Operator: </span>
            <span className={`font-bold ${isLight ? 'text-slate-800' : 'text-slate-300'}`}>{currentUser}</span>
          </div>
        </div>

        {/* ── Sub-navigation Tab Bar ── */}
        <div className="flex flex-wrap items-center gap-2 pt-6 border-t border-slate-800/80 mt-6 select-none">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  if (item.id !== 'businesses') {
                    setSelectedBusinessId(null);
                  }
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold font-mono transition-all flex items-center gap-2 cursor-pointer border ${
                  active
                    ? isLight
                      ? 'bg-purple-600 text-white border-purple-700 shadow-md shadow-purple-600/20'
                      : 'bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-600/30'
                    : isLight
                      ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                      : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${active ? 'text-white' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Main Tab Content Container ── */}
      <div className={`border rounded-2xl p-6 shadow-2xl transition-colors ${
        isLight ? 'bg-white border-slate-200/90 shadow-slate-200/50 text-slate-900' : 'bg-[#0f172a]/95 border-slate-800/90 text-white'
      }`}>
        {activeTab === 'overview' && (
          <AdminOverview
            isLight={isLight}
            serverUrl={serverUrl}
            authToken={authToken}
            onNavigateToTab={(tab) => setActiveTab(tab as AdminTab)}
            onSelectBusiness={(bId) => {
              setSelectedBusinessId(bId);
              setActiveTab('businesses');
            }}
          />
        )}

        {activeTab === 'businesses' && (
          <AdminBusinesses
            isLight={isLight}
            serverUrl={serverUrl}
            authToken={authToken}
            initialBusinessId={selectedBusinessId}
          />
        )}

        {activeTab === 'users' && (
          <AdminUsers
            isLight={isLight}
            serverUrl={serverUrl}
            authToken={authToken}
            currentUser={currentUser}
            currentUserRole={currentUserRole}
          />
        )}

        {activeTab === 'commercial' && (
          <AdminCommercial
            isLight={isLight}
            serverUrl={serverUrl}
            authToken={authToken}
          />
        )}

        {activeTab === 'security' && (
          <AdminSecurityAudit
            isLight={isLight}
            serverUrl={serverUrl}
            authToken={authToken}
          />
        )}

        {activeTab === 'operations' && (
          <AdminOperations
            isLight={isLight}
            serverUrl={serverUrl}
            authToken={authToken}
          />
        )}

        {activeTab === 'modules' && (
          <AdminModuleControl
            isLight={isLight}
            serverUrl={serverUrl}
            authToken={authToken}
          />
        )}

        {activeTab === 'settings' && (
          <AdminSystemSettings
            isLight={isLight}
            serverUrl={serverUrl}
            authToken={authToken}
          />
        )}

        {activeTab === 'keys' && (
          <AdminAPIKeys
            isLight={isLight}
            serverUrl={serverUrl}
            authToken={authToken}
          />
        )}
      </div>
    </div>
  );
};
