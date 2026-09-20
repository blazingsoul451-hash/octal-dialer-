import React, { useState, useEffect } from 'react';
import {
  Shield, Users, Target, Layers, CreditCard,
  Lock, Activity, Settings, RefreshCw, ChevronRight, CheckCircle2,
  AlertCircle, Building2, User, Sliders, Smartphone,
  Check, X
} from 'lucide-react';
import { UsersAndRolesView } from './UsersAndRolesView';

interface CompanySettingsProps {
  isLight?: boolean;
  serverUrl: string;
  authToken: string;
  currentUser: string;
  currentUserRole?: 'platform_admin' | 'admin' | 'team_lead' | 'agent' | 'user';
  customerType?: 'COMPANY' | 'PERSONAL';
  userPermissions?: Record<string, boolean>;
  onNavigateTab?: (tab: string) => void;
}

interface TenantData {
  id: string;
  name: string;
  customerType?: 'COMPANY' | 'PERSONAL';
  maxTeamVisibility?: 'OWN' | 'TEAM_READ' | 'TEAM_COLLABORATE';
  plan?: string;
  status?: string;
}

interface ProfileData {
  id: string;
  username: string;
  displayName: string;
  email: string;
  phone: string;
  role: string;
  status: string;
  accountNo: string;
}

interface DeviceItem {
  id: string;
  name: string;
  osType?: string | null;
  status: string;
  lastSeenAt?: string | null;
  createdAt: string;
}

interface AuditItem {
  id: string;
  action: string;
  actor: string;
  details?: string;
  ip?: string;
  timestamp: string;
}

export const CompanySettings: React.FC<CompanySettingsProps> = ({
  isLight = false,
  serverUrl,
  authToken,
  currentUser,
  currentUserRole = 'admin',
  customerType = 'COMPANY',
  userPermissions = {},
  onNavigateTab
}) => {
  // Navigation subview within Settings: 'hub' (main 8-card/reduced cards) or 'users-roles'
  const [subView, setSubView] = useState<'hub' | 'users-roles'>('hub');

  // Tenant and User Data
  const [tenant, setTenant] = useState<TenantData | null>(null);
  const [_profile, setProfile] = useState<ProfileData | null>(null);
  const [usersCount, setUsersCount] = useState<number>(0);
  const [teamLeadsCount, setTeamLeadsCount] = useState<number>(0);
  const [teamsCount, setTeamsCount] = useState<number>(0);
  const [myTeams, setMyTeams] = useState<any[]>([]);
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Policy edit state
  const [selectedMaxVis, setSelectedMaxVis] = useState<'OWN' | 'TEAM_READ' | 'TEAM_COLLABORATE'>('TEAM_COLLABORATE');
  const [savingPolicy, setSavingPolicy] = useState<boolean>(false);

  // Password change state
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [changingPassword, setChangingPassword] = useState<boolean>(false);

  // Team Lead team visibility edit state
  const [savingTeamVis, setSavingTeamVis] = useState<string | null>(null);

  const isCompanyOwner = currentUserRole === 'admin' || currentUserRole === 'platform_admin';
  const isTeamLead = currentUserRole === 'team_lead';
  const isMember = currentUserRole === 'agent' || currentUserRole === 'user';
  const isPersonalMode = customerType === 'PERSONAL';

  const notify = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3500);
  };

  // ─── Fetch Data ───────────────────────────────────────────────────────────
  const fetchSettingsData = async () => {
    if (!authToken) return;
    setLoading(true);
    setError(null);
    try {
      // 1. Current user & tenant profile
      const meRes = await fetch(`${serverUrl}/auth/me`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      if (meRes.ok) {
        const meData = await meRes.json();
        if (meData.tenant) {
          setTenant(meData.tenant);
          setSelectedMaxVis(meData.tenant.maxTeamVisibility || 'TEAM_COLLABORATE');
        }
        if (meData.user) {
          setProfile(meData.user);
        }
      }

      // 2. Fetch data based on role
      if (isCompanyOwner && !isPersonalMode) {
        // Users count
        const uRes = await fetch(`${serverUrl}/api/admin/users`, {
          headers: { Authorization: `Bearer ${authToken}` }
        });
        if (uRes.ok) {
          const uData = await uRes.json();
          if (Array.isArray(uData)) {
            setUsersCount(uData.length);
            setTeamLeadsCount(uData.filter((u: any) => u.role === 'team_lead').length);
          }
        }

        // Teams count
        const tRes = await fetch(`${serverUrl}/api/admin/teams`, {
          headers: { Authorization: `Bearer ${authToken}` }
        });
        if (tRes.ok) {
          const tData = await tRes.json();
          if (Array.isArray(tData)) {
            setTeamsCount(tData.length);
          }
        }

        // Devices
        const devRes = await fetch(`${serverUrl}/api/devices`, {
          headers: { Authorization: `Bearer ${authToken}` }
        });
        if (devRes.ok) {
          const devData = await devRes.json();
          if (Array.isArray(devData)) {
            setDevices(devData);
          }
        }

        // Audit Logs
        const auditRes = await fetch(`${serverUrl}/api/audit-logs`, {
          headers: { Authorization: `Bearer ${authToken}` }
        });
        if (auditRes.ok) {
          const auditData = await auditRes.json();
          if (Array.isArray(auditData)) {
            setAuditLogs(auditData.slice(0, 5));
          }
        }
      } else if (isTeamLead && !isPersonalMode) {
        // Fetch teams led by this user
        const myTeamsRes = await fetch(`${serverUrl}/api/teams/my-teams`, {
          headers: { Authorization: `Bearer ${authToken}` }
        });
        if (myTeamsRes.ok) {
          const myTeamsData = await myTeamsRes.json();
          if (Array.isArray(myTeamsData)) {
            setMyTeams(myTeamsData);
          }
        }
      } else if (isMember) {
        // Fetch personal teams membership
        const myTeamsRes = await fetch(`${serverUrl}/api/teams/my-teams`, {
          headers: { Authorization: `Bearer ${authToken}` }
        });
        if (myTeamsRes.ok) {
          const myTeamsData = await myTeamsRes.json();
          if (Array.isArray(myTeamsData)) {
            setMyTeams(myTeamsData);
          }
        }
      }
    } catch (err: any) {
      console.error('[CompanySettings] Load error:', err);
      setError(err.message || 'Failed to load settings data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettingsData();
  }, [serverUrl, authToken, currentUserRole, customerType]);

  // ─── Company Owner Policy Update ──────────────────────────────────────────
  const handleUpdateCompanyPolicy = async (newPolicy: 'OWN' | 'TEAM_READ' | 'TEAM_COLLABORATE') => {
    setSavingPolicy(true);
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/api/admin/company/policy`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({ maxTeamVisibility: newPolicy })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update policy');

      setSelectedMaxVis(newPolicy);
      if (tenant) setTenant({ ...tenant, maxTeamVisibility: newPolicy });
      notify(`Company Maximum Lead Visibility set to ${newPolicy}`);
    } catch (err: any) {
      setError(err.message || 'Failed to update company policy');
    } finally {
      setSavingPolicy(false);
    }
  };

  // ─── Team Lead Visibility Update ──────────────────────────────────────────
  const handleUpdateTeamLeadPolicy = async (teamId: string, newVisibility: string) => {
    setSavingTeamVis(teamId);
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/api/teams/${teamId}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({ leadVisibility: newVisibility })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update team policy');

      notify(`Team visibility policy set to ${newVisibility}`);
      // Refresh teams
      const myTeamsRes = await fetch(`${serverUrl}/api/teams/my-teams`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      if (myTeamsRes.ok) {
        const d = await myTeamsRes.json();
        if (Array.isArray(d)) setMyTeams(d);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update team settings');
    } finally {
      setSavingTeamVis(null);
    }
  };

  // ─── Password Change ──────────────────────────────────────────────────────
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setChangingPassword(true);
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({ newPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to change password');

      notify('Password changed successfully.');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setError(err.message || 'Failed to update password');
    } finally {
      setChangingPassword(false);
    }
  };

  // If subView is 'users-roles', render the UsersAndRolesView component
  if (subView === 'users-roles') {
    return (
      <UsersAndRolesView
        isLight={isLight}
        serverUrl={serverUrl}
        authToken={authToken}
        currentUser={currentUser}
        currentUserRole={currentUserRole}
        onBack={() => {
          setSubView('hub');
          fetchSettingsData();
        }}
      />
    );
  }

  // ─── Render Subtitle by Role ───
  const getHeaderInfo = () => {
    if (isPersonalMode) {
      return {
        title: 'Personal Settings',
        badge: 'Personal Mode',
        subtitle: 'Manage your individual profile, preferences, and security.'
      };
    }
    if (isCompanyOwner) {
      return {
        title: 'Settings',
        badge: 'Company Control Center',
        subtitle: 'Manage your company, users, access and workspace.'
      };
    }
    if (isTeamLead) {
      return {
        title: 'Team Settings',
        badge: 'Team Lead Workspace',
        subtitle: 'Manage your team members, campaigns and collaboration policies.'
      };
    }
    return {
      title: 'Account & Preferences',
      badge: 'Member Profile',
      subtitle: 'Manage your personal profile and view your assigned workspace access.'
    };
  };

  const headerInfo = getHeaderInfo();

  return (
    <div className={`space-y-6 text-left select-none transition-colors duration-200 ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
      {/* ── Control Center Header ── */}
      <div className={`border rounded-2xl p-5 shadow-2xl transition-colors ${
        isLight ? 'bg-white border-slate-200 shadow-slate-200/50' : 'bg-[#0B0E14] border-slate-800 shadow-black/60'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center font-bold text-amber-400 shadow-sm">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black font-display tracking-tight text-white">
                  {headerInfo.title}
                </h1>
                <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 uppercase">
                  {headerInfo.badge}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {headerInfo.subtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-start sm:self-auto">
            <div className="text-right text-xs font-mono">
              <div className="text-slate-500 text-[10px] uppercase">Active User</div>
              <div className="font-bold text-white">{currentUser}</div>
            </div>
            <button
              onClick={fetchSettingsData}
              disabled={loading}
              className="p-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-700/60 transition-all cursor-pointer disabled:opacity-50"
              title="Refresh Settings"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-400' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Alerts ── */}
      {error && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {success && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{success}</span>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* EXPERIENCE 1: COMPANY OWNER (8 CONTROL-CENTER CARDS)                */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {isCompanyOwner && !isPersonalMode && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* Card 1: COMPANY */}
          <div className="p-5 rounded-2xl bg-[#0B0E14] border border-slate-800 space-y-3.5 shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono text-[12px]">
                    1. Company
                  </h3>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  {tenant?.customerType || 'COMPANY'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Company profile, workspace defaults, and organizational parameters.
              </p>

              <div className="mt-3.5 p-3 rounded-xl bg-[#10141D] border border-slate-800/80 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Company Name:</span>
                  <span className="font-semibold text-white">{tenant?.name || 'My Company'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Tenant ID:</span>
                  <span className="font-mono text-slate-300 text-[11px]">{tenant?.id || 'tenant_default'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Workspace Mode:</span>
                  <span className="text-amber-400 font-medium">Enterprise SaaS</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Branding & Logo:</span>
                  <span className="text-slate-500 italic text-[11px]">Not configured yet</span>
                </div>
              </div>
            </div>

            <div className="text-[11px] text-slate-500 font-mono pt-2 border-t border-slate-800/60">
              Workspace Profile Active
            </div>
          </div>

          {/* Card 2: USERS & ROLES (CLICK OPENS USERS & ROLES VIEW) */}
          <div
            onClick={() => setSubView('users-roles')}
            className="p-5 rounded-2xl bg-[#0B0E14] border border-slate-800 hover:border-amber-500/50 transition-all cursor-pointer group shadow-xl flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 group-hover:bg-amber-500/10 group-hover:text-amber-400 transition-colors">
                    <Users className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-bold text-white group-hover:text-amber-400 transition-colors uppercase tracking-wider font-mono text-[12px]">
                    2. Users & Roles
                  </h3>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all" />
              </div>
              <p className="text-xs text-slate-400 mt-2">
                All users, team leads, teams, role definitions, and full access review.
              </p>

              <div className="grid grid-cols-3 gap-2 mt-3.5 text-center">
                <div className="p-2.5 rounded-xl bg-[#10141D] border border-slate-800">
                  <div className="text-lg font-black text-white">{usersCount}</div>
                  <div className="text-[10px] text-slate-400">Users</div>
                </div>
                <div className="p-2.5 rounded-xl bg-[#10141D] border border-slate-800">
                  <div className="text-lg font-black text-purple-400">{teamLeadsCount}</div>
                  <div className="text-[10px] text-slate-400">Team Leads</div>
                </div>
                <div className="p-2.5 rounded-xl bg-[#10141D] border border-slate-800">
                  <div className="text-lg font-black text-amber-400">{teamsCount}</div>
                  <div className="text-[10px] text-slate-400">Teams</div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] font-bold text-amber-400 pt-3 border-t border-slate-800/60 mt-3">
              <span>Open Users & Roles Management</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Card 3: LEADS & CRM */}
          <div className="p-5 rounded-2xl bg-[#0B0E14] border border-slate-800 space-y-3.5 shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
                    <Layers className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono text-[12px]">
                    3. Leads & CRM
                  </h3>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-amber-400 border border-slate-700">
                  {selectedMaxVis}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Lead access rules, assignment boundaries, and Company Maximum visibility cap.
              </p>

              <div className="mt-3.5 p-3 rounded-xl bg-[#10141D] border border-slate-800/80 space-y-2">
                <div className="text-[11px] text-slate-400 font-semibold">Company Maximum Policy:</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['OWN', 'TEAM_READ', 'TEAM_COLLABORATE'] as const).map(vis => (
                    <button
                      key={vis}
                      onClick={() => handleUpdateCompanyPolicy(vis)}
                      disabled={savingPolicy}
                      className={`py-1.5 px-2 rounded-lg text-[10px] font-mono font-bold transition-all cursor-pointer ${
                        selectedMaxVis === vis
                          ? 'bg-amber-500 text-black shadow'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {vis}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-500 mt-1 leading-tight">
                  Lower levels can restrict access, but can never escalate past this company maximum.
                </p>
              </div>
            </div>

            <div className="text-[11px] text-slate-500 font-mono pt-2 border-t border-slate-800/60">
              Structural Governance Enforced
            </div>
          </div>

          {/* Card 4: CALLING & DEVICES */}
          <div className="p-5 rounded-2xl bg-[#0B0E14] border border-slate-800 space-y-3.5 shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono text-[12px]">
                    4. Calling & Devices
                  </h3>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  {devices.length} Registered
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Connected Android dialer devices, GSM telephony, and hardware pairing.
              </p>

              <div className="mt-3.5 space-y-2">
                {devices.length === 0 ? (
                  <div className="p-3 rounded-xl bg-[#10141D] border border-slate-800 text-center text-[11px] text-slate-500">
                    No mobile devices currently paired. Use the Dialer QR Pairing screen to connect your phone.
                  </div>
                ) : (
                  <div className="max-h-28 overflow-y-auto space-y-1.5 pr-1">
                    {devices.map(dev => (
                      <div key={dev.id} className="p-2 rounded-lg bg-[#10141D] border border-slate-800 flex items-center justify-between text-xs">
                        <div>
                          <div className="font-semibold text-white">{dev.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{dev.osType || 'Android'} · {dev.status}</div>
                        </div>
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {onNavigateTab && (
              <button
                onClick={() => onNavigateTab('pair')}
                className="w-full py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer transition-colors pt-2 border-t border-slate-800/60"
              >
                <span>Pair New Device</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Card 5: PRODUCTS & MODULES */}
          <div className="p-5 rounded-2xl bg-[#0B0E14] border border-slate-800 space-y-3.5 shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    <Sliders className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono text-[12px]">
                    5. Products & Modules
                  </h3>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  SaaS Suite
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Available modules active in your current company workspace.
              </p>

              <div className="mt-3.5 grid grid-cols-2 gap-2 text-xs">
                {[
                  { name: 'CRM Workspace', active: true },
                  { name: 'OCTAL Dialer', active: true },
                  { name: 'Campaigns', active: true },
                  { name: 'Leads Database', active: true },
                  { name: 'Reports & Stats', active: true },
                  { name: 'Cold Emailer', active: !!userPermissions.autoEmailer },
                  { name: 'Google Scraper', active: !!userPermissions.googleScraper },
                  { name: 'Facebook Poster', active: !!userPermissions.facebookPoster }
                ].map(m => (
                  <div key={m.name} className="p-2 rounded-lg bg-[#10141D] border border-slate-800 flex items-center justify-between">
                    <span className="text-[11px] text-slate-300 truncate">{m.name}</span>
                    {m.active ? <Check className="w-3 h-3 text-amber-400 shrink-0" /> : <span className="text-[9px] text-slate-500">Off</span>}
                  </div>
                ))}
              </div>
            </div>

            <div className="text-[11px] text-slate-500 font-mono pt-2 border-t border-slate-800/60">
              Enterprise Module Access
            </div>
          </div>

          {/* Card 6: BILLING */}
          <div className="p-5 rounded-2xl bg-[#0B0E14] border border-slate-800 space-y-3.5 shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <CreditCard className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono text-[12px]">
                    6. Billing & Plans
                  </h3>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  {tenant?.plan || 'Enterprise'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Subscription tier, seats allocation, and active commercial entitlements.
              </p>

              <div className="mt-3.5 p-3 rounded-xl bg-[#10141D] border border-slate-800/80 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Current Plan:</span>
                  <span className="font-bold text-white">{tenant?.plan || 'Enterprise Pro'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Assigned Seats:</span>
                  <span className="font-mono text-white">{usersCount} Active Seats</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Status:</span>
                  <span className="text-emerald-400 font-semibold">{tenant?.status || 'Active'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Next Renewal:</span>
                  <span className="text-slate-500 italic text-[11px]">Not configured yet</span>
                </div>
              </div>
            </div>

            <div className="text-[11px] text-slate-500 font-mono pt-2 border-t border-slate-800/60">
              Commercial Tier Active
            </div>
          </div>

          {/* Card 7: SECURITY */}
          <div className="p-5 rounded-2xl bg-[#0B0E14] border border-slate-800 space-y-3.5 shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
                    <Lock className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono text-[12px]">
                    7. Security & Policies
                  </h3>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  Protected
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Authentication boundaries, role-based containment, and session tokens.
              </p>

              <form onSubmit={handleChangePassword} className="mt-3.5 space-y-2">
                <div className="text-[11px] text-slate-400 font-semibold">Change Admin Password:</div>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="New Password (min 6 chars)"
                  className="w-full px-3 py-1.5 bg-[#10141D] border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500/50"
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Confirm New Password"
                  className="w-full px-3 py-1.5 bg-[#10141D] border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500/50"
                />
                <button
                  type="submit"
                  disabled={changingPassword || !newPassword}
                  className="w-full py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50 transition-colors"
                >
                  {changingPassword ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                  <span>Update Password</span>
                </button>
              </form>
            </div>

            <div className="text-[11px] text-slate-500 font-mono pt-2 border-t border-slate-800/60">
              JWT Bearer & RBAC Active
            </div>
          </div>

          {/* Card 8: AUDIT & ACTIVITY */}
          <div className="p-5 rounded-2xl bg-[#0B0E14] border border-slate-800 space-y-3.5 shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    <Activity className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono text-[12px]">
                    8. Audit & Activity
                  </h3>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  Forensic Log
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Recent administrative actions, policy adjustments, and operator logins.
              </p>

              <div className="mt-3.5 space-y-1.5">
                {auditLogs.length === 0 ? (
                  <div className="p-3 rounded-xl bg-[#10141D] border border-slate-800 text-center text-[11px] text-slate-500">
                    No recent administrative audit events recorded.
                  </div>
                ) : (
                  auditLogs.map(log => (
                    <div key={log.id} className="p-2 rounded-lg bg-[#10141D] border border-slate-800 text-xs">
                      <div className="flex items-center justify-between font-mono text-[10px] text-slate-400">
                        <span>{log.actor || 'System'}</span>
                        <span>{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className="text-white font-medium truncate mt-0.5">{log.action}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="text-[11px] text-slate-500 font-mono pt-2 border-t border-slate-800/60">
              Immutable Forensic Audit
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* EXPERIENCE 2: TEAM LEAD (REDUCED 3-CARD CONTROL CENTER)             */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {isTeamLead && !isPersonalMode && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Card 1: MY TEAM */}
          <div className="p-5 rounded-2xl bg-[#0B0E14] border border-slate-800 space-y-4 shadow-xl">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
                <Target className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono text-[12px]">
                  My Teams & Squads
                </h3>
                <p className="text-xs text-slate-400">Teams you actively supervise.</p>
              </div>
            </div>

            {myTeams.length === 0 ? (
              <div className="p-4 rounded-xl bg-[#10141D] border border-slate-800 text-center text-xs text-slate-500">
                You are not currently designated as the supervisor for any team. Contact your Company Owner.
              </div>
            ) : (
              <div className="space-y-3">
                {myTeams.map(t => (
                  <div key={t.id} className="p-3 rounded-xl bg-[#10141D] border border-slate-800 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white">{t.name}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-amber-400">
                        {t.memberCount || 0} Members
                      </span>
                    </div>
                    {t.description && <p className="text-[11px] text-slate-400">{t.description}</p>}
                    <div className="flex items-center justify-between text-[11px] pt-2 border-t border-slate-800/80">
                      <span className="text-slate-400">Assigned Campaigns:</span>
                      <span className="font-bold text-white">{t.campaignCount || 0}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Card 2: TEAM PERMISSIONS & VISIBILITY */}
          <div className="p-5 rounded-2xl bg-[#0B0E14] border border-slate-800 space-y-4 shadow-xl">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono text-[12px]">
                  Team Lead Permissions
                </h3>
                <p className="text-xs text-slate-400">Lead visibility policies for your squads.</p>
              </div>
            </div>

            {myTeams.length === 0 ? (
              <div className="p-4 rounded-xl bg-[#10141D] border border-slate-800 text-center text-xs text-slate-500">
                No teams to configure.
              </div>
            ) : (
              <div className="space-y-3">
                {myTeams.map(t => {
                  const currentVis = t.settings?.leadVisibility || 'OWN';
                  return (
                    <div key={t.id} className="p-3 rounded-xl bg-[#10141D] border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-white">{t.name}</span>
                        <span className="text-[10px] font-mono text-slate-400">
                          Max: {t.companyMaxVisibility || 'TEAM_COLLABORATE'}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1 pt-1">
                        {['OWN', 'TEAM_READ', 'TEAM_COLLABORATE'].map(vis => (
                          <button
                            key={vis}
                            onClick={() => handleUpdateTeamLeadPolicy(t.id, vis)}
                            disabled={savingTeamVis === t.id}
                            className={`py-1 px-1.5 rounded text-[10px] font-mono font-bold transition-all cursor-pointer ${
                              currentVis === vis
                                ? 'bg-amber-500 text-black'
                                : 'bg-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            {vis}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Card 3: MY ACCOUNT & SECURITY */}
          <div className="p-5 rounded-2xl bg-[#0B0E14] border border-slate-800 space-y-4 shadow-xl">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <User className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono text-[12px]">
                  My Account
                </h3>
                <p className="text-xs text-slate-400">Supervisor profile and password.</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#10141D] border border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Username:</span>
                <span className="font-bold text-white">{currentUser}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Role:</span>
                <span className="text-purple-400 font-semibold">Team Lead</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Scope:</span>
                <span className="text-slate-300 font-mono">Led Teams Only</span>
              </div>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-2 pt-2 border-t border-slate-800">
              <div className="text-[11px] text-slate-400 font-semibold">Change Password:</div>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="New Password (min 6 chars)"
                className="w-full px-3 py-1.5 bg-[#10141D] border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500/50"
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Confirm Password"
                className="w-full px-3 py-1.5 bg-[#10141D] border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500/50"
              />
              <button
                type="submit"
                disabled={changingPassword || !newPassword}
                className="w-full py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
              >
                {changingPassword ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                <span>Save Password</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* EXPERIENCE 3: MEMBER / AGENT (PERSONAL SETTINGS & READ-ONLY ACCESS) */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {isMember && !isPersonalMode && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Card 1: MY ACCOUNT */}
          <div className="p-5 rounded-2xl bg-[#0B0E14] border border-slate-800 space-y-4 shadow-xl">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <User className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono text-[12px]">
                  My Account
                </h3>
                <p className="text-xs text-slate-400">Personal details and authentication.</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#10141D] border border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Username:</span>
                <span className="font-bold text-white">{currentUser}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Role:</span>
                <span className="text-blue-400 font-semibold">Member</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Account Status:</span>
                <span className="text-emerald-400 font-semibold">Active</span>
              </div>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-2 pt-2 border-t border-slate-800">
              <div className="text-[11px] text-slate-400 font-semibold">Change Password:</div>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="New Password (min 6 chars)"
                className="w-full px-3 py-1.5 bg-[#10141D] border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500/50"
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Confirm Password"
                className="w-full px-3 py-1.5 bg-[#10141D] border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500/50"
              />
              <button
                type="submit"
                disabled={changingPassword || !newPassword}
                className="w-full py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
              >
                {changingPassword ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                <span>Save Password</span>
              </button>
            </form>
          </div>

          {/* Card 2: PREFERENCES */}
          <div className="p-5 rounded-2xl bg-[#0B0E14] border border-slate-800 space-y-4 shadow-xl">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Sliders className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono text-[12px]">
                  Preferences
                </h3>
                <p className="text-xs text-slate-400">Workspace display and personal defaults.</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#10141D] border border-slate-800 space-y-3 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Theme:</span>
                <span className="px-2.5 py-0.5 rounded bg-slate-800 text-amber-400 font-semibold text-[11px] border border-slate-700">
                  {isLight ? 'Light Mode' : 'Zestify Dark / Gold'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Sound Notifications:</span>
                <span className="text-emerald-400 font-medium">Enabled</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Dialer Keypad Vibrations:</span>
                <span className="text-slate-500 italic">Not configured yet</span>
              </div>
            </div>
          </div>

          {/* Card 3: MY ACCESS (READ-ONLY) */}
          <div className="p-5 rounded-2xl bg-[#0B0E14] border border-slate-800 space-y-4 shadow-xl">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Shield className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono text-[12px]">
                  My Access (Read-Only)
                </h3>
                <p className="text-xs text-slate-400">Assigned permissions and team boundaries.</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#10141D] border border-slate-800 space-y-2.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Role:</span>
                <span className="text-blue-400 font-semibold">Member</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Assigned Team:</span>
                <span className="text-white font-medium">{myTeams[0]?.name || 'Unassigned'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Team Leader:</span>
                <span className="text-white font-medium">{myTeams[0]?.leaderName || 'Unassigned'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Effective Lead Access:</span>
                <span className="font-mono text-emerald-400 font-bold">
                  {myTeams[0]?.effectiveVisibility || 'OWN'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* EXPERIENCE 4: PERSONAL MODE (HIDES ALL ORGANIZATIONAL MANAGEMENT)   */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {isPersonalMode && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Card 1: MY ACCOUNT */}
          <div className="p-5 rounded-2xl bg-[#0B0E14] border border-slate-800 space-y-4 shadow-xl">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <User className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono text-[12px]">
                  Account Profile
                </h3>
                <p className="text-xs text-slate-400">Individual user details and account status.</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#10141D] border border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Username:</span>
                <span className="font-bold text-white">{currentUser}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Mode:</span>
                <span className="text-amber-400 font-semibold">Personal Account</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Status:</span>
                <span className="text-emerald-400 font-semibold">Active</span>
              </div>
            </div>
          </div>

          {/* Card 2: SECURITY & PASSWORD */}
          <div className="p-5 rounded-2xl bg-[#0B0E14] border border-slate-800 space-y-4 shadow-xl">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <Lock className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono text-[12px]">
                  Security
                </h3>
                <p className="text-xs text-slate-400">Change your password.</p>
              </div>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-2">
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="New Password (min 6 chars)"
                className="w-full px-3 py-1.5 bg-[#10141D] border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500/50"
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Confirm Password"
                className="w-full px-3 py-1.5 bg-[#10141D] border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500/50"
              />
              <button
                type="submit"
                disabled={changingPassword || !newPassword}
                className="w-full py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
              >
                {changingPassword ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                <span>Save Password</span>
              </button>
            </form>
          </div>

          {/* Card 3: BILLING & MODULES */}
          <div className="p-5 rounded-2xl bg-[#0B0E14] border border-slate-800 space-y-4 shadow-xl">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <CreditCard className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono text-[12px]">
                  Personal Subscription
                </h3>
                <p className="text-xs text-slate-400">Plan details and module entitlements.</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#10141D] border border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Plan:</span>
                <span className="font-bold text-white">{tenant?.plan || 'Personal Pro'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Status:</span>
                <span className="text-emerald-400 font-semibold">{tenant?.status || 'Active'}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
