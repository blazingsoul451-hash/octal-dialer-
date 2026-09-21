import React, { useState, useEffect } from 'react';
import {
  Building2, Users, User, CreditCard,
  ChevronRight, ChevronLeft, CheckCircle2, AlertCircle,
  RefreshCw, X, Lock, ShieldCheck, Eye, EyeOff,
  Globe, Mail, Phone, MapPin, ArrowUpRight,
  ShieldAlert, Check
} from 'lucide-react';
import { UsersAndRolesView } from './UsersAndRolesView';
import {
  type StructuralRole,
  tryNormalizeStructuralRole,
  getRoleDisplayName,
  isCompanyOwner as checkCompanyOwner
} from '../../utils/roleUtils';

interface CompanySettingsProps {
  isLight?: boolean;
  serverUrl: string;
  authToken: string;
  currentUser: string;
  currentUserRole?: StructuralRole | string;
  customerType?: 'COMPANY' | 'PERSONAL';
  userPermissions?: Record<string, boolean>;
  onNavigateTab?: (tab: string) => void;
}

interface CompanyProfileData {
  id?: string;
  name: string;
  country: string;
  timezone?: string;
  phone?: string;
  ownerEmail?: string;
  website?: string;
  address?: string;
  logoUrl?: string | null;
  tier?: string;
  maxAgents?: number;
  status?: string;
}

interface UserAccountData {
  id?: string;
  username: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  role: string;
  avatarUrl?: string;
}

export const CompanySettings: React.FC<CompanySettingsProps> = ({
  isLight = false,
  serverUrl,
  authToken,
  currentUser,
  currentUserRole = 'admin'
}) => {
  const normalizedRole = tryNormalizeStructuralRole(currentUserRole) || 'user';
  const isCompanyOwner = checkCompanyOwner(normalizedRole);

  // Subviews: 'overview' | 'company-profile' | 'users-roles' | 'account' | 'billing'
  const [subView, setSubView] = useState<'overview' | 'company-profile' | 'users-roles' | 'account' | 'billing'>(
    isCompanyOwner ? 'overview' : 'account'
  );

  // Loading & notification states
  const [loading, setLoading] = useState<boolean>(true);
  const [savingProfile, setSavingProfile] = useState<boolean>(false);
  const [savingAccount, setSavingAccount] = useState<boolean>(false);
  const [changingPassword, setChangingPassword] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showBillingModal, setShowBillingModal] = useState<boolean>(false);

  // Company Profile state
  const [companyProfile, setCompanyProfile] = useState<CompanyProfileData>({
    name: '',
    country: 'United States',
    timezone: 'America/New_York',
    phone: '',
    ownerEmail: '',
    website: '',
    address: '',
    logoUrl: null,
    tier: 'Enterprise',
    maxAgents: 50,
    status: 'active'
  });

  // User Account state
  const [userAccount, setUserAccount] = useState<UserAccountData>({
    username: currentUser,
    displayName: currentUser,
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    role: normalizedRole,
    avatarUrl: ''
  });

  // Password change state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Quick stats for overview cards
  const [stats, setStats] = useState({
    usersCount: 0,
    teamLeadsCount: 0,
    teamsCount: 0
  });

  const notify = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3500);
  };

  // ─── Fetch All Settings Data ────────────────────────────────────────────────
  const fetchData = async () => {
    if (!authToken) return;
    setLoading(true);
    setError(null);
    try {
      const headers = { Authorization: `Bearer ${authToken}` };

      // 1. Fetch Company Profile
      if (isCompanyOwner) {
        try {
          const res = await fetch(`${serverUrl}/api/admin/company/profile`, { headers });
          if (res.ok) {
            const data = await res.json();
            if (data.profile) {
              setCompanyProfile({
                name: data.profile.name || 'My Company',
                country: data.profile.country || 'United States',
                timezone: data.profile.timezone || 'America/New_York',
                phone: data.profile.phone || '',
                ownerEmail: data.profile.ownerEmail || '',
                website: data.profile.website || '',
                address: data.profile.address || '',
                logoUrl: data.profile.logoUrl || null,
                tier: data.profile.tier || 'Enterprise',
                maxAgents: data.profile.maxAgents || 50,
                status: data.profile.status || 'active'
              });
            }
          }
        } catch (e) {
          console.warn('[CompanySettings] Profile fetch failed, falling back to /auth/me:', e);
        }

        // 2. Fetch Users & Teams Count
        try {
          const [uRes, tRes] = await Promise.all([
            fetch(`${serverUrl}/api/admin/users`, { headers }),
            fetch(`${serverUrl}/api/admin/teams`, { headers })
          ]);
          if (uRes.ok) {
            const uData = await uRes.json();
            if (Array.isArray(uData)) {
              setStats(prev => ({
                ...prev,
                usersCount: uData.length,
                teamLeadsCount: uData.filter((u: any) => u.role === 'team_lead').length
              }));
            }
          }
          if (tRes.ok) {
            const tData = await tRes.json();
            if (Array.isArray(tData)) {
              setStats(prev => ({ ...prev, teamsCount: tData.length }));
            }
          }
        } catch (e) {
          console.warn('[CompanySettings] Stats fetch notice:', e);
        }
      }

      // 3. Fetch User Account Profile
      try {
        const accRes = await fetch(`${serverUrl}/api/user/profile`, { headers });
        if (accRes.ok) {
          const accData = await accRes.json();
          setUserAccount({
            username: accData.username || currentUser,
            displayName: accData.displayName || currentUser,
            firstName: accData.firstName || '',
            lastName: accData.lastName || '',
            email: accData.email || '',
            phone: accData.phone || '',
            role: accData.role || normalizedRole,
            avatarUrl: accData.avatarUrl || ''
          });
        }
      } catch (e) {
        console.warn('[CompanySettings] User account fetch notice:', e);
      }
    } catch (err: any) {
      console.error('[CompanySettings] Load error:', err);
      setError(err.message || 'Failed to load settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [serverUrl, authToken, currentUserRole]);

  // ─── Save Company Profile ───────────────────────────────────────────────────
  const handleSaveCompanyProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authToken) return;
    setSavingProfile(true);
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/api/admin/company/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({
          name: companyProfile.name,
          country: companyProfile.country,
          timezone: companyProfile.timezone,
          phone: companyProfile.phone,
          ownerEmail: companyProfile.ownerEmail,
          website: companyProfile.website,
          address: companyProfile.address,
          logoUrl: companyProfile.logoUrl
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update company profile');
      notify('Company profile saved successfully.');
    } catch (err: any) {
      setError(err.message || 'Failed to save company profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  // ─── Save User Account ──────────────────────────────────────────────────────
  const handleSaveUserAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authToken) return;
    setSavingAccount(true);
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/api/user/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({
          firstName: userAccount.firstName,
          lastName: userAccount.lastName,
          phone: userAccount.phone,
          avatarUrl: userAccount.avatarUrl
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update profile');
      notify('Account profile updated successfully.');
    } catch (err: any) {
      setError(err.message || 'Failed to save account profile.');
    } finally {
      setSavingAccount(false);
    }
  };

  // ─── Change Password ────────────────────────────────────────────────────────
  const hasCapital = /[A-Z]/.test(newPassword);
  const hasNumeric = /[0-9]/.test(newPassword);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword);
  const hasMinLength = newPassword.length >= 8;
  const isPasswordValid = hasCapital && hasNumeric && hasSpecial && hasMinLength;

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPassword) {
      setError('Current password is required.');
      return;
    }
    if (!isPasswordValid) {
      setError('Please satisfy all password complexity rules.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    setChangingPassword(true);
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/api/user/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({ oldPassword, newPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to change password');
      notify('Password changed successfully.');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setError(err.message || 'Failed to change password.');
    } finally {
      setChangingPassword(false);
    }
  };

  // ─── Sign Out All Other Devices ─────────────────────────────────────────────
  const handleRevokeDevices = async () => {
    if (!window.confirm('Are you sure you want to sign out and remove all other active devices?')) return;
    try {
      const res = await fetch(`${serverUrl}/api/user/revoke-devices`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` }
      });
      if (res.ok) {
        notify('All other devices have been signed out.');
      } else {
        const d = await res.json();
        setError(d.error || 'Failed to sign out devices.');
      }
    } catch (err: any) {
      setError(err.message || 'Error revoking device sessions.');
    }
  };

  // ─── Render Sub-Views ───────────────────────────────────────────────────────

  // 1. Users & Roles View (Preserved 100% Intact)
  if (subView === 'users-roles' && isCompanyOwner) {
    return (
      <UsersAndRolesView
        isLight={isLight}
        serverUrl={serverUrl}
        authToken={authToken}
        currentUser={currentUser}
        currentUserRole={typeof currentUserRole === 'string' ? currentUserRole : undefined}
        onBack={() => {
          setSubView('overview');
          fetchData();
        }}
      />
    );
  }

  // Navigation tabs helper
  const availableTabs = isCompanyOwner
    ? [
        { id: 'overview', label: 'Overview' },
        { id: 'company-profile', label: 'Company Profile' },
        { id: 'users-roles', label: 'Users & Roles' },
        { id: 'account', label: 'Account' },
        { id: 'billing', label: 'Billing' }
      ]
    : [{ id: 'account', label: 'Account' }];

  return (
    <div className={`space-y-6 text-left select-none transition-colors duration-200 ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
      {/* ── Top Settings Header & Navigation Bar ── */}
      <div className={`border rounded-2xl p-5 shadow-2xl transition-colors ${
        isLight ? 'bg-white border-slate-200 shadow-slate-200/50' : 'bg-[#0B0E14] border-slate-800 shadow-black/60'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-black font-display tracking-tight text-white">
                Settings
              </h1>
              <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 uppercase">
                {getRoleDisplayName(normalizedRole)}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {isCompanyOwner
                ? 'Manage your company, users, account and subscription.'
                : 'Manage your personal account profile, credentials, and security preferences.'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {subView !== 'overview' && isCompanyOwner && (
              <button
                onClick={() => setSubView('overview')}
                className="px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 border border-slate-700/60 transition-all cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>All Settings</span>
              </button>
            )}
            <button
              onClick={fetchData}
              disabled={loading}
              className="p-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-700/60 transition-all cursor-pointer disabled:opacity-50"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* Top Tab Bar Pills */}
        {isCompanyOwner && (
          <div className="flex flex-wrap items-center gap-1.5 pt-4 mt-4 border-t border-slate-800/80">
            {availableTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setSubView(tab.id as any)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                  subView === tab.id
                    ? 'bg-amber-500 text-black font-bold shadow-md shadow-amber-500/20'
                    : 'bg-slate-800/40 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800'
                }`}
              >
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Alerts ── */}
      {error && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {success && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{success}</span>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 0. SETTINGS OVERVIEW LANDING PAGE (CLEAN 4-SECTION GRID)            */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {subView === 'overview' && isCompanyOwner && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 animate-fadeIn">
          {/* Card 1: Company Profile */}
          <div
            id="card-company-profile"
            onClick={() => setSubView('company-profile')}
            className="p-6 rounded-2xl bg-[#0B0E14] border border-slate-800 hover:border-amber-500/50 transition-all cursor-pointer group shadow-xl flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 group-hover:scale-105 transition-transform">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white group-hover:text-amber-400 transition-colors font-display">
                      Company Profile
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Business information and workspace identity.
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-amber-400 group-hover:translate-x-1 transition-all" />
              </div>

              <div className="mt-5 p-3.5 rounded-xl bg-[#10141D] border border-slate-800 space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Company:</span>
                  <span className="font-semibold text-white truncate max-w-[200px]">
                    {companyProfile.name || 'Set company name'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Country:</span>
                  <span className="text-slate-300">{companyProfile.country || 'United States'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Contact:</span>
                  <span className="text-slate-300 font-mono text-[11px] truncate max-w-[200px]">
                    {companyProfile.ownerEmail || userAccount.email || 'Not configured'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs font-semibold text-amber-400 pt-4 border-t border-slate-800/80 mt-4">
              <span>Edit Company Profile</span>
              <ChevronRight className="w-4 h-4" />
            </div>
          </div>

          {/* Card 2: Users & Roles */}
          <div
            id="card-users-roles"
            onClick={() => setSubView('users-roles')}
            className="p-6 rounded-2xl bg-[#0B0E14] border border-slate-800 hover:border-amber-500/50 transition-all cursor-pointer group shadow-xl flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 group-hover:scale-105 transition-transform">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white group-hover:text-amber-400 transition-colors font-display">
                      Users & Roles
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Manage employees, teams, roles and module access.
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-amber-400 group-hover:translate-x-1 transition-all" />
              </div>

              <div className="grid grid-cols-3 gap-2 mt-5 text-center">
                <div className="p-3 rounded-xl bg-[#10141D] border border-slate-800">
                  <div className="text-xl font-black text-white font-display">{stats.usersCount}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">Employees</div>
                </div>
                <div className="p-3 rounded-xl bg-[#10141D] border border-slate-800">
                  <div className="text-xl font-black text-purple-400 font-display">{stats.teamLeadsCount}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">Team Leads</div>
                </div>
                <div className="p-3 rounded-xl bg-[#10141D] border border-slate-800">
                  <div className="text-xl font-black text-amber-400 font-display">{stats.teamsCount}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">Teams</div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs font-semibold text-amber-400 pt-4 border-t border-slate-800/80 mt-4">
              <span>Manage People & Permissions</span>
              <ChevronRight className="w-4 h-4" />
            </div>
          </div>

          {/* Card 3: Account */}
          <div
            id="card-account"
            onClick={() => setSubView('account')}
            className="p-6 rounded-2xl bg-[#0B0E14] border border-slate-800 hover:border-amber-500/50 transition-all cursor-pointer group shadow-xl flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 group-hover:scale-105 transition-transform">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white group-hover:text-amber-400 transition-colors font-display">
                      Account
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Your profile and login settings.
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-amber-400 group-hover:translate-x-1 transition-all" />
              </div>

              <div className="mt-5 p-3.5 rounded-xl bg-[#10141D] border border-slate-800 space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Logged in as:</span>
                  <span className="font-semibold text-white capitalize">{userAccount.displayName || currentUser}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Email:</span>
                  <span className="text-slate-300 font-mono text-[11px]">{userAccount.email || 'user@company.com'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Security:</span>
                  <span className="text-emerald-400 font-medium flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" /> Password Protected
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs font-semibold text-amber-400 pt-4 border-t border-slate-800/80 mt-4">
              <span>Profile & Password</span>
              <ChevronRight className="w-4 h-4" />
            </div>
          </div>

          {/* Card 4: Billing */}
          <div
            id="card-billing"
            onClick={() => setSubView('billing')}
            className="p-6 rounded-2xl bg-[#0B0E14] border border-slate-800 hover:border-amber-500/50 transition-all cursor-pointer group shadow-xl flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 group-hover:scale-105 transition-transform">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white group-hover:text-amber-400 transition-colors font-display">
                      Billing
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Plan, seats and subscription information.
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-amber-400 group-hover:translate-x-1 transition-all" />
              </div>

              <div className="mt-5 p-3.5 rounded-xl bg-[#10141D] border border-slate-800 space-y-2.5 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Current Plan:</span>
                  <span className="font-bold text-amber-400">{companyProfile.tier || 'Enterprise'} Plan</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Seats Used:</span>
                  <span className="font-mono text-white">
                    {stats.usersCount} of {companyProfile.maxAgents || 50} seats
                  </span>
                </div>
                {/* Progress bar */}
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-emerald-400 rounded-full"
                    style={{ width: `${Math.min(100, Math.max(5, (stats.usersCount / (companyProfile.maxAgents || 50)) * 100))}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs font-semibold text-amber-400 pt-4 border-t border-slate-800/80 mt-4">
              <span>View Subscription & Seats</span>
              <ChevronRight className="w-4 h-4" />
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 1. COMPANY PROFILE VIEW                                             */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {subView === 'company-profile' && isCompanyOwner && (
        <div className="space-y-6 animate-fadeIn">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white font-display">Company Profile</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Update your business details, branding, and workspace contact information.
              </p>
            </div>
            <button
              onClick={() => setSubView('overview')}
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back to Overview</span>
            </button>
          </div>

          <form onSubmit={handleSaveCompanyProfile} className="space-y-5">
            {/* General Info Card */}
            <div className="p-6 rounded-2xl bg-[#0B0E14] border border-slate-800 space-y-4 shadow-xl">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Building2 className="w-4 h-4 text-amber-400" />
                <span>General Information</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Company Name <span className="text-amber-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={companyProfile.name}
                    onChange={(e) => setCompanyProfile({ ...companyProfile, name: e.target.value })}
                    placeholder="e.g. Acme Corporation"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#10141D] border border-slate-800 text-white text-xs focus:border-amber-500 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Business Email
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      value={companyProfile.ownerEmail || ''}
                      onChange={(e) => setCompanyProfile({ ...companyProfile, ownerEmail: e.target.value })}
                      placeholder="contact@company.com"
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-[#10141D] border border-slate-800 text-white text-xs focus:border-amber-500 outline-none transition-all"
                    />
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Phone Number
                  </label>
                  <div className="relative">
                    <input
                      type="tel"
                      value={companyProfile.phone || ''}
                      onChange={(e) => setCompanyProfile({ ...companyProfile, phone: e.target.value })}
                      placeholder="+1 (555) 000-0000"
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-[#10141D] border border-slate-800 text-white text-xs focus:border-amber-500 outline-none transition-all"
                    />
                    <Phone className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Website URL
                  </label>
                  <div className="relative">
                    <input
                      type="url"
                      value={companyProfile.website || ''}
                      onChange={(e) => setCompanyProfile({ ...companyProfile, website: e.target.value })}
                      placeholder="https://company.com"
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-[#10141D] border border-slate-800 text-white text-xs focus:border-amber-500 outline-none transition-all"
                    />
                    <Globe className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  </div>
                </div>
              </div>
            </div>

            {/* Regional & Localization */}
            <div className="p-6 rounded-2xl bg-[#0B0E14] border border-slate-800 space-y-4 shadow-xl">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Globe className="w-4 h-4 text-blue-400" />
                <span>Regional & Localization</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Country
                  </label>
                  <select
                    value={companyProfile.country || 'United States'}
                    onChange={(e) => setCompanyProfile({ ...companyProfile, country: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#10141D] border border-slate-800 text-white text-xs focus:border-amber-500 outline-none transition-all"
                  >
                    <option value="United States">United States</option>
                    <option value="United Kingdom">United Kingdom</option>
                    <option value="Canada">Canada</option>
                    <option value="Australia">Australia</option>
                    <option value="India">India</option>
                    <option value="Germany">Germany</option>
                    <option value="France">France</option>
                    <option value="Singapore">Singapore</option>
                    <option value="United Arab Emirates">United Arab Emirates</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Timezone
                  </label>
                  <select
                    value={companyProfile.timezone || 'America/New_York'}
                    onChange={(e) => setCompanyProfile({ ...companyProfile, timezone: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#10141D] border border-slate-800 text-white text-xs focus:border-amber-500 outline-none transition-all font-mono"
                  >
                    <option value="America/New_York">Eastern Time (US & Canada) - EST/EDT</option>
                    <option value="America/Chicago">Central Time (US & Canada) - CST/CDT</option>
                    <option value="America/Denver">Mountain Time (US & Canada) - MST/MDT</option>
                    <option value="America/Los_Angeles">Pacific Time (US & Canada) - PST/PDT</option>
                    <option value="Europe/London">London / Dublin - GMT/BST</option>
                    <option value="Europe/Paris">Central European Time - CET/CEST</option>
                    <option value="Asia/Dubai">Gulf Standard Time - GST</option>
                    <option value="Asia/Kolkata">India Standard Time - IST</option>
                    <option value="Asia/Singapore">Singapore Time - SGT</option>
                    <option value="Australia/Sydney">Australian Eastern Time - AEST</option>
                    <option value="UTC">Coordinated Universal Time (UTC)</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Address / Business Location (Optional)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={companyProfile.address || ''}
                      onChange={(e) => setCompanyProfile({ ...companyProfile, address: e.target.value })}
                      placeholder="Street address, city, state, postal code"
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-[#10141D] border border-slate-800 text-white text-xs focus:border-amber-500 outline-none transition-all"
                    />
                    <MapPin className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  </div>
                </div>
              </div>
            </div>

            {/* Submit Action */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setSubView('overview')}
                className="px-4 py-2.5 rounded-xl border border-slate-800 text-slate-400 hover:text-white text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingProfile}
                className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs shadow-lg shadow-amber-500/20 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2"
              >
                {savingProfile ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span>{savingProfile ? 'Saving...' : 'Save Company Profile'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 2. ACCOUNT SETTINGS VIEW                                            */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {subView === 'account' && (
        <div className="space-y-6 animate-fadeIn">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white font-display">Account Settings</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Manage your personal profile, credentials, and active login sessions.
              </p>
            </div>
            {isCompanyOwner && (
              <button
                onClick={() => setSubView('overview')}
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Back to Overview</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Personal Details Form */}
            <form onSubmit={handleSaveUserAccount} className="p-6 rounded-2xl bg-[#0B0E14] border border-slate-800 space-y-4 shadow-xl">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <User className="w-4 h-4 text-emerald-400" />
                <span>Personal Information</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">First Name</label>
                  <input
                    type="text"
                    value={userAccount.firstName || ''}
                    onChange={(e) => setUserAccount({ ...userAccount, firstName: e.target.value })}
                    placeholder="First name"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#10141D] border border-slate-800 text-white text-xs focus:border-amber-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Last Name</label>
                  <input
                    type="text"
                    value={userAccount.lastName || ''}
                    onChange={(e) => setUserAccount({ ...userAccount, lastName: e.target.value })}
                    placeholder="Last name"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#10141D] border border-slate-800 text-white text-xs focus:border-amber-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Username</label>
                  <input
                    type="text"
                    disabled
                    value={userAccount.username}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-slate-400 text-xs font-mono cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Role</label>
                  <div className="px-3.5 py-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-amber-400 text-xs font-semibold">
                    {getRoleDisplayName(normalizedRole)}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Email Address</label>
                  <input
                    type="email"
                    disabled
                    value={userAccount.email || 'user@company.com'}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-slate-400 text-xs font-mono cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Phone Number</label>
                  <input
                    type="tel"
                    value={userAccount.phone || ''}
                    onChange={(e) => setUserAccount({ ...userAccount, phone: e.target.value })}
                    placeholder="+1 (555) 000-0000"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#10141D] border border-slate-800 text-white text-xs focus:border-amber-500 outline-none"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={savingAccount}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs shadow-md transition-all cursor-pointer disabled:opacity-50"
                >
                  {savingAccount ? 'Saving...' : 'Save Account'}
                </button>
              </div>
            </form>

            {/* Password & Security Form */}
            <div className="space-y-6">
              <form onSubmit={handleChangePassword} className="p-6 rounded-2xl bg-[#0B0E14] border border-slate-800 space-y-4 shadow-xl">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Lock className="w-4 h-4 text-amber-400" />
                  <span>Change Password</span>
                </h3>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Current Password</label>
                  <div className="relative">
                    <input
                      type={showOldPassword ? 'text' : 'password'}
                      required
                      value={oldPassword}
                      onChange={(e) => setOldPassword(e.target.value)}
                      placeholder="Enter current password"
                      className="w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-[#10141D] border border-slate-800 text-white text-xs focus:border-amber-500 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowOldPassword(!showOldPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                    >
                      {showOldPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">New Password</label>
                    <div className="relative">
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="At least 8 characters"
                        className="w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-[#10141D] border border-slate-800 text-white text-xs focus:border-amber-500 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                      >
                        {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">Confirm Password</label>
                    <input
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter password"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#10141D] border border-slate-800 text-white text-xs focus:border-amber-500 outline-none"
                    />
                  </div>
                </div>

                {/* Password Rules Checklist */}
                {newPassword && (
                  <div className="p-3 rounded-xl bg-[#10141D] border border-slate-800/80 space-y-1.5 text-[11px]">
                    <div className={`flex items-center gap-1.5 ${hasMinLength ? 'text-emerald-400' : 'text-slate-500'}`}>
                      <Check className="w-3.5 h-3.5" /> 8+ Characters
                    </div>
                    <div className={`flex items-center gap-1.5 ${hasCapital ? 'text-emerald-400' : 'text-slate-500'}`}>
                      <Check className="w-3.5 h-3.5" /> At least one capital letter
                    </div>
                    <div className={`flex items-center gap-1.5 ${hasNumeric ? 'text-emerald-400' : 'text-slate-500'}`}>
                      <Check className="w-3.5 h-3.5" /> At least one number
                    </div>
                    <div className={`flex items-center gap-1.5 ${hasSpecial ? 'text-emerald-400' : 'text-slate-500'}`}>
                      <Check className="w-3.5 h-3.5" /> At least one special character
                    </div>
                  </div>
                )}

                <div className="pt-1 flex justify-end">
                  <button
                    type="submit"
                    disabled={changingPassword || !isPasswordValid}
                    className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs border border-slate-700 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {changingPassword ? 'Updating...' : 'Update Password'}
                  </button>
                </div>
              </form>

              {/* Session Security Card */}
              <div className="p-5 rounded-2xl bg-[#0B0E14] border border-slate-800 flex items-center justify-between shadow-xl">
                <div>
                  <h4 className="text-xs font-bold text-white flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-rose-400" />
                    <span>Active Sessions & Security</span>
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Sign out of any other computers, phones or browsers.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRevokeDevices}
                  className="px-3.5 py-1.5 rounded-xl border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-xs font-semibold cursor-pointer transition-all"
                >
                  Sign Out Other Devices
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 3. BILLING & PLANS VIEW (CLEAN CUSTOMER-FACING)                     */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {subView === 'billing' && isCompanyOwner && (
        <div className="space-y-6 animate-fadeIn">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white font-display">Billing & Subscription</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Overview of your workspace subscription, active plan tier, and assigned seats.
              </p>
            </div>
            <button
              onClick={() => setSubView('overview')}
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back to Overview</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Current Plan Summary Card */}
            <div className="p-6 rounded-2xl bg-[#0B0E14] border border-slate-800 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Plan Status</span>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                  Active
                </span>
              </div>
              <div>
                <div className="text-2xl font-black text-white font-display">
                  {companyProfile.tier || 'Enterprise'} Plan
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Full dialer and marketing automation workspace.
                </p>
              </div>
              <div className="pt-3 border-t border-slate-800/80 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Billing Cycle:</span>
                  <span className="font-semibold text-white">Monthly Subscription</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Renewal Date:</span>
                  <span className="font-semibold text-white">1st of next month</span>
                </div>
              </div>
            </div>

            {/* Seat Allocation Card */}
            <div className="p-6 rounded-2xl bg-[#0B0E14] border border-slate-800 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Seat Usage</span>
                <span className="text-xs font-mono font-bold text-amber-400">
                  {stats.usersCount} / {companyProfile.maxAgents || 50}
                </span>
              </div>
              <div>
                <div className="text-2xl font-black text-white font-display">
                  {stats.usersCount} Seats used
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {(companyProfile.maxAgents || 50) - stats.usersCount} available seats for new team members.
                </p>
              </div>
              {/* Progress bar */}
              <div className="space-y-1.5 pt-1">
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-emerald-400 rounded-full"
                    style={{ width: `${Math.min(100, Math.max(5, (stats.usersCount / (companyProfile.maxAgents || 50)) * 100))}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Payment Method Card */}
            <div className="p-6 rounded-2xl bg-[#0B0E14] border border-slate-800 shadow-xl space-y-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Payment Method</span>
                  <CreditCard className="w-4 h-4 text-purple-400" />
                </div>
                <div className="mt-3 text-lg font-bold text-white flex items-center gap-2 font-display">
                  <span>Visa ending in •••• 4242</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Card on file for recurring monthly subscription.
                </p>
              </div>
              <button
                onClick={() => setShowBillingModal(true)}
                className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold border border-slate-700 transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>Manage Billing</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Subscription Plans Comparison */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-white">Available Workspace Plans</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Starter */}
              <div className="p-5 rounded-2xl bg-[#0B0E14] border border-slate-800 space-y-3 shadow-lg">
                <div className="text-sm font-bold text-white">Starter</div>
                <div className="text-2xl font-black text-white font-display">$49 <span className="text-xs text-slate-400 font-normal">/ month</span></div>
                <p className="text-xs text-slate-400">Up to 10 user seats, GSM auto-dialer and core CRM pipeline.</p>
                <button
                  onClick={() => setShowBillingModal(true)}
                  className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  Downgrade Plan
                </button>
              </div>

              {/* Professional */}
              <div className="p-5 rounded-2xl bg-[#0B0E14] border border-slate-800 space-y-3 shadow-lg">
                <div className="text-sm font-bold text-white">Professional</div>
                <div className="text-2xl font-black text-white font-display">$99 <span className="text-xs text-slate-400 font-normal">/ month</span></div>
                <p className="text-xs text-slate-400">Up to 25 user seats, multi-campaign queues, auto-dialing and analytics.</p>
                <button
                  onClick={() => setShowBillingModal(true)}
                  className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  Change Plan
                </button>
              </div>

              {/* Enterprise (Active) */}
              <div className="p-5 rounded-2xl bg-[#0B0E14] border-2 border-amber-500/50 space-y-3 shadow-xl relative">
                <span className="absolute -top-2.5 right-4 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-black uppercase">
                  Current Plan
                </span>
                <div className="text-sm font-bold text-white">Enterprise</div>
                <div className="text-2xl font-black text-white font-display">$199 <span className="text-xs text-slate-400 font-normal">/ month</span></div>
                <p className="text-xs text-slate-400">Up to 50 user seats, custom team hierarchies, Auto Emailer and Facebook tools.</p>
                <div className="w-full py-2 rounded-xl bg-amber-500/10 text-amber-400 text-center text-xs font-bold border border-amber-500/30">
                  Active Subscription
                </div>
              </div>
            </div>
          </div>

          {/* Manage Billing Modal */}
          {showBillingModal && (
            <div
              onClick={(e) => { if (e.target === e.currentTarget) setShowBillingModal(false); }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn cursor-pointer"
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md p-6 rounded-2xl bg-[#0B0E14] border border-slate-800 shadow-2xl text-left cursor-default space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-amber-400" />
                    <h3 className="text-base font-bold text-white font-display">Manage Subscription</h3>
                  </div>
                  <button onClick={() => setShowBillingModal(false)} className="text-slate-400 hover:text-white cursor-pointer">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Your workspace is currently active on the <strong className="text-white font-semibold">Enterprise Plan</strong> with 50 user seats.
                </p>
                <div className="p-3.5 rounded-xl bg-[#10141D] border border-slate-800 text-xs text-slate-400 space-y-1.5">
                  <div className="flex justify-between">
                    <span>Payment method:</span>
                    <span className="text-white font-mono">Visa •••• 4242</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Next invoice:</span>
                    <span className="text-white font-mono">$199.00 on 1st of month</span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500">
                  To update your payment card, request custom invoicing, or adjust seat capacity, please contact your account representative or billing support.
                </p>
                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => setShowBillingModal(false)}
                    className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold cursor-pointer"
                  >
                    Close
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
