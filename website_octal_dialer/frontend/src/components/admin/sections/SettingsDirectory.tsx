import React from 'react';
import {
  Building2, Users, PhoneCall, Send, ShieldCheck, Settings as SettingsIcon, ChevronRight
} from 'lucide-react';

interface SettingsDirectoryProps {
  isLight?: boolean;
  onNavigate: (section: 'users' | 'roles' | 'permissions' | 'teams' | 'organization' | 'calling' | 'campaigns' | 'security' | 'system') => void;
}

export const SettingsDirectory: React.FC<SettingsDirectoryProps> = ({
  isLight,
  onNavigate
}) => {
  return (
    <div className="space-y-6 select-none animate-fadeIn">
      {/* ── Header ── */}
      <div>
        <h1 className={`text-2xl font-black font-display tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
          Settings
        </h1>
        <p className={`text-xs mt-1 font-medium ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>
          Manage your organization settings
        </p>
      </div>

      {/* ── 6 Categorized Directory Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        
        {/* 1. Organization */}
        <div className={`p-6 rounded-2xl border shadow-sm transition-all ${
          isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
        }`}>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500">
              <Building2 className="w-5 h-5" />
            </div>
            <h2 className={`text-base font-black font-display ${isLight ? 'text-slate-900' : 'text-white'}`}>
              Organization
            </h2>
          </div>
          <ul className="space-y-2 text-sm font-medium">
            <li>
              <button
                onClick={() => onNavigate('organization')}
                className={`w-full text-left py-1 px-2 rounded-lg transition-colors cursor-pointer flex items-center justify-between ${
                  isLight ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-900' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
                }`}
              >
                <span>Company Profile</span>
                <ChevronRight className="w-4 h-4 opacity-40" />
              </button>
            </li>
            <li>
              <button
                onClick={() => onNavigate('organization')}
                className={`w-full text-left py-1 px-2 rounded-lg transition-colors cursor-pointer flex items-center justify-between ${
                  isLight ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-900' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
                }`}
              >
                <span>Business Settings</span>
                <ChevronRight className="w-4 h-4 opacity-40" />
              </button>
            </li>
            <li>
              <button
                onClick={() => onNavigate('organization')}
                className={`w-full text-left py-1 px-2 rounded-lg transition-colors cursor-pointer flex items-center justify-between ${
                  isLight ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-900' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
                }`}
              >
                <span>Locations</span>
                <ChevronRight className="w-4 h-4 opacity-40" />
              </button>
            </li>
            <li>
              <button
                onClick={() => onNavigate('organization')}
                className={`w-full text-left py-1 px-2 rounded-lg transition-colors cursor-pointer flex items-center justify-between ${
                  isLight ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-900' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
                }`}
              >
                <span>Subscription & Billing</span>
                <ChevronRight className="w-4 h-4 opacity-40" />
              </button>
            </li>
          </ul>
        </div>

        {/* 2. Users & Access (Featured) */}
        <div className={`p-6 rounded-2xl border shadow-sm transition-all ${
          isLight ? 'bg-white border-amber-500/30 ring-1 ring-amber-500/20' : 'bg-[#09090b] border-amber-500/30 ring-1 ring-amber-500/20'
        }`}>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
              <Users className="w-5 h-5" />
            </div>
            <h2 className={`text-base font-black font-display ${isLight ? 'text-slate-900' : 'text-white'}`}>
              Users & Access
            </h2>
          </div>
          <ul className="space-y-2 text-sm font-medium">
            <li>
              <button
                onClick={() => onNavigate('users')}
                className="w-full text-left py-2 px-3 rounded-xl transition-all cursor-pointer flex items-center justify-between bg-amber-500/15 text-amber-900 dark:text-amber-400 font-bold border border-amber-500/30 shadow-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span>Users</span>
                </div>
                <ChevronRight className="w-4 h-4 text-amber-500" />
              </button>
            </li>
            <li>
              <button
                onClick={() => onNavigate('roles')}
                className={`w-full text-left py-1 px-2 rounded-lg transition-colors cursor-pointer flex items-center justify-between ${
                  isLight ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-900' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
                }`}
              >
                <span>Roles</span>
                <ChevronRight className="w-4 h-4 opacity-40" />
              </button>
            </li>
            <li>
              <button
                onClick={() => onNavigate('permissions')}
                className={`w-full text-left py-1 px-2 rounded-lg transition-colors cursor-pointer flex items-center justify-between ${
                  isLight ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-900' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
                }`}
              >
                <span>Permissions</span>
                <ChevronRight className="w-4 h-4 opacity-40" />
              </button>
            </li>
            <li>
              <button
                onClick={() => onNavigate('teams')}
                className={`w-full text-left py-1 px-2 rounded-lg transition-colors cursor-pointer flex items-center justify-between ${
                  isLight ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-900' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
                }`}
              >
                <span>Teams & Scoping</span>
                <ChevronRight className="w-4 h-4 opacity-40" />
              </button>
            </li>
          </ul>
        </div>

        {/* 3. Calling */}
        <div className={`p-6 rounded-2xl border shadow-sm transition-all ${
          isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
        }`}>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500">
              <PhoneCall className="w-5 h-5" />
            </div>
            <h2 className={`text-base font-black font-display ${isLight ? 'text-slate-900' : 'text-white'}`}>
              Calling
            </h2>
          </div>
          <ul className="space-y-2 text-sm font-medium">
            <li>
              <button
                onClick={() => onNavigate('calling')}
                className={`w-full text-left py-1 px-2 rounded-lg transition-colors cursor-pointer flex items-center justify-between ${
                  isLight ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-900' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
                }`}
              >
                <span>Devices</span>
                <ChevronRight className="w-4 h-4 opacity-40" />
              </button>
            </li>
            <li>
              <button
                onClick={() => onNavigate('calling')}
                className={`w-full text-left py-1 px-2 rounded-lg transition-colors cursor-pointer flex items-center justify-between ${
                  isLight ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-900' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
                }`}
              >
                <span>SIM / Phone Settings</span>
                <ChevronRight className="w-4 h-4 opacity-40" />
              </button>
            </li>
            <li>
              <button
                onClick={() => onNavigate('calling')}
                className={`w-full text-left py-1 px-2 rounded-lg transition-colors cursor-pointer flex items-center justify-between ${
                  isLight ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-900' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
                }`}
              >
                <span>Dialing Rules</span>
                <ChevronRight className="w-4 h-4 opacity-40" />
              </button>
            </li>
            <li>
              <button
                onClick={() => onNavigate('calling')}
                className={`w-full text-left py-1 px-2 rounded-lg transition-colors cursor-pointer flex items-center justify-between ${
                  isLight ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-900' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
                }`}
              >
                <span>Call Settings</span>
                <ChevronRight className="w-4 h-4 opacity-40" />
              </button>
            </li>
          </ul>
        </div>

        {/* 4. Campaigns & CRM */}
        <div className={`p-6 rounded-2xl border shadow-sm transition-all ${
          isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
        }`}>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Send className="w-5 h-5" />
            </div>
            <h2 className={`text-base font-black font-display ${isLight ? 'text-slate-900' : 'text-white'}`}>
              Campaigns & CRM
            </h2>
          </div>
          <ul className="space-y-2 text-sm font-medium">
            <li>
              <button
                onClick={() => onNavigate('campaigns')}
                className={`w-full text-left py-1 px-2 rounded-lg transition-colors cursor-pointer flex items-center justify-between ${
                  isLight ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-900' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
                }`}
              >
                <span>Campaign Defaults</span>
                <ChevronRight className="w-4 h-4 opacity-40" />
              </button>
            </li>
            <li>
              <button
                onClick={() => onNavigate('campaigns')}
                className={`w-full text-left py-1 px-2 rounded-lg transition-colors cursor-pointer flex items-center justify-between ${
                  isLight ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-900' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
                }`}
              >
                <span>Dispositions</span>
                <ChevronRight className="w-4 h-4 opacity-40" />
              </button>
            </li>
            <li>
              <button
                onClick={() => onNavigate('campaigns')}
                className={`w-full text-left py-1 px-2 rounded-lg transition-colors cursor-pointer flex items-center justify-between ${
                  isLight ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-900' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
                }`}
              >
                <span>Lead Settings</span>
                <ChevronRight className="w-4 h-4 opacity-40" />
              </button>
            </li>
            <li>
              <button
                onClick={() => onNavigate('campaigns')}
                className={`w-full text-left py-1 px-2 rounded-lg transition-colors cursor-pointer flex items-center justify-between ${
                  isLight ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-900' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
                }`}
              >
                <span>Follow-ups</span>
                <ChevronRight className="w-4 h-4 opacity-40" />
              </button>
            </li>
          </ul>
        </div>

        {/* 5. Security & Compliance */}
        <div className={`p-6 rounded-2xl border shadow-sm transition-all ${
          isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
        }`}>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h2 className={`text-base font-black font-display ${isLight ? 'text-slate-900' : 'text-white'}`}>
              Security & Compliance
            </h2>
          </div>
          <ul className="space-y-2 text-sm font-medium">
            <li>
              <button
                onClick={() => onNavigate('security')}
                className={`w-full text-left py-1 px-2 rounded-lg transition-colors cursor-pointer flex items-center justify-between ${
                  isLight ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-900' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
                }`}
              >
                <span>DNC / Blacklist</span>
                <ChevronRight className="w-4 h-4 opacity-40" />
              </button>
            </li>
            <li>
              <button
                onClick={() => onNavigate('security')}
                className={`w-full text-left py-1 px-2 rounded-lg transition-colors cursor-pointer flex items-center justify-between ${
                  isLight ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-900' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
                }`}
              >
                <span>IP Restrictions</span>
                <ChevronRight className="w-4 h-4 opacity-40" />
              </button>
            </li>
            <li>
              <button
                onClick={() => onNavigate('security')}
                className={`w-full text-left py-1 px-2 rounded-lg transition-colors cursor-pointer flex items-center justify-between ${
                  isLight ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-900' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
                }`}
              >
                <span>Audit Logs</span>
                <ChevronRight className="w-4 h-4 opacity-40" />
              </button>
            </li>
            <li>
              <button
                onClick={() => onNavigate('security')}
                className={`w-full text-left py-1 px-2 rounded-lg transition-colors cursor-pointer flex items-center justify-between ${
                  isLight ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-900' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
                }`}
              >
                <span>Data Export</span>
                <ChevronRight className="w-4 h-4 opacity-40" />
              </button>
            </li>
          </ul>
        </div>

        {/* 6. System */}
        <div className={`p-6 rounded-2xl border shadow-sm transition-all ${
          isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
        }`}>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <SettingsIcon className="w-5 h-5" />
            </div>
            <h2 className={`text-base font-black font-display ${isLight ? 'text-slate-900' : 'text-white'}`}>
              System
            </h2>
          </div>
          <ul className="space-y-2 text-sm font-medium">
            <li>
              <button
                onClick={() => onNavigate('system')}
                className={`w-full text-left py-1 px-2 rounded-lg transition-colors cursor-pointer flex items-center justify-between ${
                  isLight ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-900' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
                }`}
              >
                <span>General Settings</span>
                <ChevronRight className="w-4 h-4 opacity-40" />
              </button>
            </li>
            <li>
              <button
                onClick={() => onNavigate('system')}
                className={`w-full text-left py-1 px-2 rounded-lg transition-colors cursor-pointer flex items-center justify-between ${
                  isLight ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-900' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
                }`}
              >
                <span>Integrations</span>
                <ChevronRight className="w-4 h-4 opacity-40" />
              </button>
            </li>
            <li>
              <button
                onClick={() => onNavigate('system')}
                className={`w-full text-left py-1 px-2 rounded-lg transition-colors cursor-pointer flex items-center justify-between ${
                  isLight ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-900' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
                }`}
              >
                <span>Notifications</span>
                <ChevronRight className="w-4 h-4 opacity-40" />
              </button>
            </li>
            <li>
              <button
                onClick={() => onNavigate('system')}
                className={`w-full text-left py-1 px-2 rounded-lg transition-colors cursor-pointer flex items-center justify-between ${
                  isLight ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-900' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
                }`}
              >
                <span>Appearance</span>
                <ChevronRight className="w-4 h-4 opacity-40" />
              </button>
            </li>
          </ul>
        </div>

      </div>
    </div>
  );
};
