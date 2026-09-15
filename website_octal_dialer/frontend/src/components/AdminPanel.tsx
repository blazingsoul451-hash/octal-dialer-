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
  const allNavItems = [
    { id: 'overview' as AdminTab, label: 'Overview', icon: LayoutDashboard, platformOnly: false },
    { id: 'businesses' as AdminTab, label: 'Businesses', icon: Building2, platformOnly: true },
    { id: 'users' as AdminTab, label: 'Users', icon: Users, platformOnly: false },
    { id: 'commercial' as AdminTab, label: 'Commercial', icon: CreditCard, platformOnly: true },
    { id: 'security' as AdminTab, label: 'Security & Audit', icon: Lock, platformOnly: false },
    { id: 'operations' as AdminTab, label: 'Operations', icon: Activity, platformOnly: true },
    { id: 'modules' as AdminTab, label: 'Module Control', icon: Sliders, platformOnly: true },
    { id: 'settings' as AdminTab, label: isPlatformAdmin ? 'Platform Settings' : 'Dialing Settings', icon: Settings, platformOnly: false },
    { id: 'keys' as AdminTab, label: 'Integrations / API', icon: Key, platformOnly: false },
  ];

  const navItems = allNavItems.filter(item => !item.platformOnly || isPlatformAdmin);

  return (
    <div className="space-y-6 text-left select-none transition-colors duration-200">
      {/* ── Enterprise Control Center Header Card ── */}
      <div className={`border rounded-2xl p-4 sm:p-5 shadow-2xl transition-colors ${
        isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#09090b] border-[#18181b] text-white'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center font-bold text-purple-400 shadow-sm">
              <Shield className="w-4.5 h-4.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className={`text-lg font-black font-display tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  {isPlatformAdmin ? 'Enterprise Control Center' : 'Organization Administration'}
                </h1>
                <span className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full border uppercase ${
                  isPlatformAdmin
                    ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                }`}>
                  {isPlatformAdmin ? 'Platform Supreme Authority' : 'Tenant Administrator'}
                </span>
              </div>
              <p className={`text-xs mt-0.5 font-medium ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>
                Centralized platform administration for business tenants, user lifecycle, commercial subscriptions, engine operations, and forensic auditing.
              </p>
            </div>
          </div>

          <div className={`text-right text-xs font-mono self-start sm:self-auto ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>
            <span>Operator: </span>
            <span className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{currentUser}</span>
          </div>
        </div>

        {/* ── Sub-navigation Tab Bar ── */}
        <div className={`flex flex-wrap items-center gap-1.5 pt-4 border-t mt-4 select-none ${isLight ? 'border-slate-200' : 'border-[#18181b]'}`}>
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
                className={`px-3 py-1.5 rounded-xl text-xs font-bold font-mono transition-all flex items-center gap-1.5 cursor-pointer border shrink-0 ${
                  active
                    ? 'bg-amber-500 text-black border-amber-500 shadow-sm font-black'
                    : isLight
                      ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                      : 'bg-[#18181b] hover:bg-[#27272a] border-[#27272a] text-zinc-300'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${active ? 'text-black' : 'text-zinc-400'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Main Tab Content Container ── */}
      <div className={`border rounded-2xl p-6 shadow-2xl transition-colors ${
        isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#09090b] border-[#18181b] text-white'
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
