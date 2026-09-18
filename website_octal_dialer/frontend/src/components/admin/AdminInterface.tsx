import React, { useState } from 'react';
import { Shield, ArrowLeft, BarChart3, Users, Settings, FileText, TrendingUp, Lock, Activity, Mail, Key } from 'lucide-react';
import { AdminDashboard } from './sections/AdminDashboard';
import { AdminUsers } from './sections/AdminUsers';
import { AdminSystemSettings } from './sections/AdminSystemSettings';
import { AdminAuditLogs } from './sections/AdminAuditLogs';
import { AdminReports } from './sections/AdminReports';
import { AdminRoles } from './sections/AdminRoles';
import { AdminSystemHealth } from './sections/AdminSystemHealth';
import { AdminEmailTemplates } from './sections/AdminEmailTemplates';
import { AdminAPIKeys } from './sections/AdminAPIKeys';

interface AdminInterfaceProps {
  isLight: boolean;
  serverUrl: string;
  authToken: string;
  currentUser: string;
  onExitAdmin: () => void;
}

type AdminSection = 'dashboard' | 'users' | 'settings' | 'audit-logs' | 'reports' | 'roles' | 'health' | 'email-templates' | 'api-keys';

export const AdminInterface: React.FC<AdminInterfaceProps> = ({
  isLight,
  serverUrl,
  authToken,
  currentUser,
  onExitAdmin
}) => {
  const [activeSection, setActiveSection] = useState<AdminSection>('dashboard');

  const sidebarItems = [
    { id: 'dashboard' as AdminSection, label: 'Dashboard', icon: BarChart3 },
    { id: 'users' as AdminSection, label: 'User Management', icon: Users },
    { id: 'settings' as AdminSection, label: 'System Settings', icon: Settings },
    { id: 'audit-logs' as AdminSection, label: 'Audit Logs', icon: FileText },
    { id: 'reports' as AdminSection, label: 'Reports', icon: TrendingUp },
    { id: 'roles' as AdminSection, label: 'Roles & Permissions', icon: Lock },
    { id: 'health' as AdminSection, label: 'System Health', icon: Activity },
    { id: 'email-templates' as AdminSection, label: 'Email Templates', icon: Mail },
    { id: 'api-keys' as AdminSection, label: 'API Keys', icon: Key }
  ];

  const renderSection = () => {
    const props = { isLight, serverUrl, authToken };

    switch (activeSection) {
      case 'dashboard':
        return <AdminDashboard {...props} />;
      case 'users':
        return <AdminUsers {...props} />;
      case 'settings':
        return <AdminSystemSettings {...props} />;
      case 'audit-logs':
        return <AdminAuditLogs {...props} />;
      case 'reports':
        return <AdminReports {...props} />;
      case 'roles':
        return <AdminRoles {...props} />;
      case 'health':
        return <AdminSystemHealth {...props} />;
      case 'email-templates':
        return <AdminEmailTemplates {...props} />;
      case 'api-keys':
        return <AdminAPIKeys {...props} />;
      default:
        return null;
    }
  };

  return (
    <div className={`flex h-screen select-none ${isLight ? 'bg-slate-50' : 'bg-black'}`}>
      {/* Sidebar */}
      <div className={`w-64 ${isLight ? 'bg-slate-100 border-r border-slate-200' : 'bg-[#09090b] border-r border-[#18181b]'} flex flex-col`}>
        {/* Header */}
        <div className={`p-4 border-b ${isLight ? 'border-slate-200' : 'border-[#18181b]'}`}>
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="w-8 h-8 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-center font-bold text-amber-400">
              <Shield className="w-4 h-4" />
            </div>
            <h1 className={`text-base font-black font-display tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>Platform Admin</h1>
          </div>
          <p className="text-[11px] font-mono text-zinc-400">Logged in as <span className="text-white font-bold">{currentUser}</span></p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1 font-mono text-xs">
          {sidebarItems.map(item => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all cursor-pointer ${
                  isActive
                    ? 'bg-amber-500 text-black font-bold shadow-sm'
                    : isLight
                    ? 'text-slate-600 hover:bg-slate-200'
                    : 'text-zinc-400 hover:text-white hover:bg-[#121215]'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-black' : 'text-zinc-400'}`} />
                <span className="font-bold">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Exit Button */}
        <div className={`p-3 border-t ${isLight ? 'border-slate-200' : 'border-[#18181b]'}`}>
          <button
            onClick={onExitAdmin}
            className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl font-mono text-xs font-bold transition-all bg-[#18181b] hover:bg-[#27272a] text-zinc-300 border border-[#27272a] cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Main App</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden bg-black">
        {/* Top Bar */}
        <div className={`h-16 border-b ${isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'} flex items-center px-6`}>
          <div className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
            <Shield className="w-4 h-4 text-amber-500" />
            <span>Platform Admin Control / {sidebarItems.find(s => s.id === activeSection)?.label}</span>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 bg-black">
          {renderSection()}
        </div>
      </div>
    </div>
  );
};
