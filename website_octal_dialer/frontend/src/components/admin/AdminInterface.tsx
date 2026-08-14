import React, { useState } from 'react';
import { ArrowLeft, BarChart3, Users, Settings, FileText, TrendingUp, Lock, Activity, Mail, Key } from 'lucide-react';
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
    <div className={`flex h-screen ${isLight ? 'bg-slate-50' : 'bg-slate-950'}`}>
      {/* Sidebar */}
      <div className={`w-64 ${isLight ? 'bg-slate-100 border-r border-slate-200' : 'bg-slate-900 border-r border-slate-800'} flex flex-col`}>
        {/* Header */}
        <div className={`p-4 border-b ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold">🛡️</span>
            </div>
            <h1 className={`text-lg font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>Admin Panel</h1>
          </div>
          <p className={`text-xs ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Logged in as {currentUser}</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {sidebarItems.map(item => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-purple-500/20 text-purple-600 dark:text-purple-400'
                    : isLight
                    ? 'text-slate-600 hover:bg-slate-200'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="text-sm font-medium">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Exit Button */}
        <div className={`p-3 border-t ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
          <button
            onClick={onExitAdmin}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
              isLight
                ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-700'
                : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400'
            }`}
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">Back to Main App</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <div className={`h-16 border-b ${isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'} flex items-center px-6`}>
          <div className={`text-sm font-medium ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
            Admin Panel
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto">
          {renderSection()}
        </div>
      </div>
    </div>
  );
};
