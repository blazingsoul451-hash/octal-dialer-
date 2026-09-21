import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Users, UserCheck, Shield, ChevronLeft, Search,
  Plus, Edit, Trash2, CheckCircle2, AlertCircle,
  Eye, RefreshCw, Layers, Target, ChevronRight, Key,
  X, Check, Building2, UserPlus, Briefcase, Lock, ShieldCheck, Info
} from 'lucide-react';

interface UserItem {
  id: string;
  username: string;
  displayName?: string;
  email?: string;
  phone?: string;
  role: 'platform_admin' | 'admin' | 'team_lead' | 'agent' | 'user';
  status?: string;
  createdAt: string;
  roleId?: string;
  roleName?: string;
  permissions?: {
    id: string;
    userId: string;
    moduleId: string;
    enabled: number;
  }[];
}

interface TeamMember {
  id: string;
  teamId: string;
  userId: string;
  roleInTeam: string;
  username?: string;
  displayName?: string;
}

interface TeamItem {
  id: string;
  name: string;
  description?: string;
  leaderId?: string;
  leaderName?: string;
  status: string;
  memberCount?: number;
  campaignCount?: number;
  members?: TeamMember[];
  campaigns?: any[];
  settings?: {
    leadVisibility?: 'OWN' | 'TEAM_READ' | 'TEAM_COLLABORATE';
  };
  effectiveVisibility?: 'OWN' | 'TEAM_READ' | 'TEAM_COLLABORATE';
}

interface CustomRole {
  id: string;
  roleName: string;
  description?: string;
  permissions: string | string[];
  status: string;
  userCount?: number;
}

interface InvitationItem {
  id: string;
  email: string;
  role: string;
  teamId?: string;
  status: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';
  expiresAt: string;
  createdAt: string;
  acceptedAt?: string;
  teamName?: string;
  inviterName?: string;
}

interface SeatUsage {
  activeSeats: number;
  pendingInvitations: number;
  maxSeats: number;
  availableSeats: number;
}

interface UsersAndRolesViewProps {
  isLight?: boolean;
  serverUrl: string;
  authToken: string;
  currentUser: string;
  currentUserRole?: string;
  onBack?: () => void;
}

const AVAILABLE_MODULES = [
  { id: 'crm', label: 'CRM Workspace', icon: '👥', desc: 'Contacts & customer intelligence' },
  { id: 'campaigns', label: 'Campaigns', icon: '📂', desc: 'Campaign pipelines & dialing queues' },
  { id: 'octalDialer', label: 'OCTAL Dialer', icon: '📞', desc: 'GSM auto-dialer & telephony' },
  { id: 'leads', label: 'Leads Database', icon: '🗄️', desc: 'Contact explorer & imports' },
  { id: 'reports', label: 'Reports & Analytics', icon: '📊', desc: 'Call metrics & performance exports' },
  { id: 'autoEmailer', label: 'Auto Emailer', icon: '✉️', desc: 'Cold email sequences & SMTP' },
  { id: 'facebookPoster', label: 'FB Auto Poster', icon: '📤', desc: 'Scheduled Facebook postings' }
];

export const UsersAndRolesView: React.FC<UsersAndRolesViewProps> = ({
  isLight = false,
  serverUrl,
  authToken,
  currentUser: _currentUser,
  currentUserRole: _currentUserRole,
  onBack
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'team-leads' | 'teams' | 'invitations' | 'roles' | 'access-review'>('overview');

  // Core Data
  const [users, setUsers] = useState<UserItem[]>([]);
  const [teams, setTeams] = useState<TeamItem[]>([]);
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [invitations, setInvitations] = useState<InvitationItem[]>([]);
  const [seatUsage, setSeatUsage] = useState<SeatUsage | null>(null);
  const [tenantPolicy, setTenantPolicy] = useState<{ maxTeamVisibility?: string }>({ maxTeamVisibility: 'TEAM_COLLABORATE' });
  const [companyEntitlements, setCompanyEntitlements] = useState<Record<string, boolean>>({});
  const [companyModulesList, setCompanyModulesList] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Invite User Modal State
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'team_lead' | 'user'>('user');
  const [inviteTeamId, setInviteTeamId] = useState('');
  const [inviteModules, setInviteModules] = useState<Record<string, boolean>>({
    crm: true,
    campaigns: true,
    octalDialer: true,
    leads: true,
    reports: true,
    autoEmailer: false,
    facebookPoster: false
  });
  const [inviting, setInviting] = useState(false);
  const [createdInviteUrl, setCreatedInviteUrl] = useState<string | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);

  // Filter & Search states
  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [teamFilter, setTeamFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Drawers & Modals
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<TeamItem | null>(null);
  const [selectedTeamLead, setSelectedTeamLead] = useState<UserItem | null>(null);
  const [selectedRoleDetail, setSelectedRoleDetail] = useState<string>('admin');

  // Create User Modal State
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'team_lead' | 'agent'>('agent');
  const [newTeamId, setNewTeamId] = useState('');
  const [newModules, setNewModules] = useState<Record<string, boolean>>({
    crm: true,
    campaigns: true,
    octalDialer: true,
    leads: true,
    reports: true,
    googleScraper: false,
    autoEmailer: false,
    facebookScraper: false,
    facebookPoster: false
  });
  const [creatingUser, setCreatingUser] = useState(false);

  // Edit User Modal State
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string>('');
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editRole, setEditRole] = useState<'admin' | 'team_lead' | 'agent'>('agent');
  const [editStatus, setEditStatus] = useState<'Active' | 'Disabled'>('Active');
  const [editPassword, setEditPassword] = useState('');
  const [editModules, setEditModules] = useState<Record<string, boolean>>({});
  const [savingEdit, setSavingEdit] = useState(false);

  // Create Team Modal State
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDesc, setNewTeamDesc] = useState('');
  const [newTeamLeaderId, setNewTeamLeaderId] = useState('');
  const [creatingTeam, setCreatingTeam] = useState(false);

  // Delete User confirmation
  const [userToDelete, setUserToDelete] = useState<UserItem | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);

  const notify = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3500);
  };

  // ─── Data Fetching ────────────────────────────────────────────────────────
  const fetchData = async () => {
    if (!authToken) return;
    setLoading(true);
    setError(null);
    try {
      // 0. Company Platform Entitlements
      try {
        const entRes = await fetch(`${serverUrl}/api/company/entitlements`, {
          headers: { Authorization: `Bearer ${authToken}` }
        });
        if (entRes.ok) {
          const entData = await entRes.json();
          if (entData?.entitlements) {
            setCompanyEntitlements(entData.entitlements);
            setCompanyModulesList(entData.enabledModules || []);
          }
        }
      } catch (e) {
        console.warn('Notice loading company entitlements:', e);
      }

      // 1. Users (Strictly customer organization only)
      const usersRes = await fetch(`${serverUrl}/api/admin/users`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      if (usersRes.ok) {
        const data = await usersRes.json();
        const nonPlatformUsers = Array.isArray(data)
          ? data.filter((u: any) => u.role !== 'platform_admin' && u.role !== 'master_admin')
          : [];
        setUsers(nonPlatformUsers);
      }

      // 2. Teams
      const teamsRes = await fetch(`${serverUrl}/api/admin/teams`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      if (teamsRes.ok) {
        const data = await teamsRes.json();
        setTeams(Array.isArray(data) ? data : []);
      }

      // 3. Roles
      const rolesRes = await fetch(`${serverUrl}/api/admin/roles`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      if (rolesRes.ok) {
        const data = await rolesRes.json();
        setRoles(Array.isArray(data) ? data : []);
      }

      // 4. Tenant Policy
      const meRes = await fetch(`${serverUrl}/auth/me`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      if (meRes.ok) {
        const meData = await meRes.json();
        if (meData?.tenant) {
          setTenantPolicy(meData.tenant);
        }
      }

      // 5. Invitations & Seat Usage
      try {
        const invRes = await fetch(`${serverUrl}/api/admin/invitations`, {
          headers: { Authorization: `Bearer ${authToken}` }
        });
        if (invRes.ok) {
          const invData = await invRes.json();
          setInvitations(Array.isArray(invData.invitations) ? invData.invitations : []);
          if (invData.seatUsage) {
            setSeatUsage(invData.seatUsage);
          }
        }
      } catch (e) {
        console.warn('Notice loading invitations:', e);
      }
    } catch (err: any) {
      console.error('[UsersAndRolesView] Load error:', err);
      setError(err.message || 'Failed to load organization data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [serverUrl, authToken]);

  // ─── Module Entitlement Helpers (PLATFORM -> COMPANY -> TEAM -> USER) ─────
  const isModuleCompanyEntitled = useCallback((moduleId: string): boolean => {
    const normKey = moduleId === 'octalDialer' ? 'dialer' :
                    moduleId === 'googleScraper' ? 'google_scraper' :
                    moduleId === 'autoEmailer' ? 'auto_emailer' :
                    moduleId === 'facebookScraper' ? 'facebook_scraper' :
                    moduleId === 'facebookPoster' ? 'facebook_poster' : moduleId;
    
    if (companyEntitlements[normKey] !== undefined) return !!companyEntitlements[normKey];
    if (companyEntitlements[moduleId] !== undefined) return !!companyEntitlements[moduleId];
    
    if (companyModulesList && companyModulesList.length > 0) {
      return companyModulesList.includes(normKey) || companyModulesList.includes(moduleId);
    }
    return true; // Default fallback if not yet loaded
  }, [companyEntitlements, companyModulesList]);

  const companyAvailableCount = useMemo(() => {
    return AVAILABLE_MODULES.filter(m => isModuleCompanyEntitled(m.id)).length;
  }, [isModuleCompanyEntitled]);

  const getUserEffectiveModulesCount = useCallback((user: UserItem): number => {
    if (user.role === 'admin') {
      return companyAvailableCount;
    }
    const assigned = AVAILABLE_MODULES.filter(m => {
      const p = user.permissions?.find(x => x.moduleId === m.id || (m.id === 'octalDialer' && x.moduleId === 'dialer'));
      const isAssigned = p ? p.enabled === 1 : false;
      return isAssigned && isModuleCompanyEntitled(m.id);
    });
    return assigned.length;
  }, [companyAvailableCount, isModuleCompanyEntitled]);

  // ─── Derived Metrics ──────────────────────────────────────────────────────
  const totalUsersCount = users.length;
  const teamLeadsCount = users.filter(u => u.role === 'team_lead' || teams.some(t => t.leaderId === u.id)).length;
  const teamsCount = teams.length;
  const activeUsersCount = users.filter(u => !u.status || u.status.toLowerCase() === 'active').length;

  // Build user-to-teams map
  const userTeamsMap = useMemo(() => {
    const map = new Map<string, TeamItem[]>();
    for (const team of teams) {
      if (Array.isArray(team.members)) {
        for (const mem of team.members) {
          if (!map.has(mem.userId)) map.set(mem.userId, []);
          map.get(mem.userId)!.push(team);
        }
      }
      if (team.leaderId) {
        if (!map.has(team.leaderId)) map.set(team.leaderId, []);
        const list = map.get(team.leaderId)!;
        if (!list.some(t => t.id === team.id)) {
          list.push(team);
        }
      }
    }
    return map;
  }, [teams]);

  // Filtered Users List
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      // Search
      const searchMatch = !userSearch ||
        u.username.toLowerCase().includes(userSearch.toLowerCase()) ||
        (u.displayName && u.displayName.toLowerCase().includes(userSearch.toLowerCase())) ||
        (u.email && u.email.toLowerCase().includes(userSearch.toLowerCase()));

      // Role Filter
      let roleMatch = true;
      if (roleFilter !== 'ALL') {
        if (roleFilter === 'admin') roleMatch = u.role === 'admin';
        else if (roleFilter === 'team_lead') roleMatch = u.role === 'team_lead' || teams.some(t => t.leaderId === u.id);
        else if (roleFilter === 'agent') roleMatch = u.role === 'agent' || u.role === 'user';
      }

      // Team Filter
      let teamMatch = true;
      if (teamFilter !== 'ALL') {
        const userTeams = userTeamsMap.get(u.id) || [];
        teamMatch = userTeams.some(t => t.id === teamFilter);
      }

      // Status Filter
      let statusMatch = true;
      if (statusFilter !== 'ALL') {
        const uStatus = (u.status || 'Active').toLowerCase();
        statusMatch = uStatus === statusFilter.toLowerCase();
      }

      return searchMatch && roleMatch && teamMatch && statusMatch;
    });
  }, [users, userSearch, roleFilter, teamFilter, statusFilter, userTeamsMap, teams]);

  // Distinct Team Leads list
  const teamLeadsList = useMemo(() => {
    return users.filter(u => u.role === 'team_lead' || teams.some(t => t.leaderId === u.id));
  }, [users, teams]);

  // ─── Handlers ─────────────────────────────────────────────────────────────
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword.trim()) {
      setError('Username and password are required.');
      return;
    }
    setCreatingUser(true);
    setError(null);
    try {
      // Filter out modules that exceed company entitlement ceiling
      const sanitizedModules: Record<string, boolean> = {};
      AVAILABLE_MODULES.forEach(m => {
        sanitizedModules[m.id] = !!newModules[m.id] && isModuleCompanyEntitled(m.id);
      });

      const res = await fetch(`${serverUrl}/api/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({
          username: newUsername.trim(),
          displayName: newDisplayName.trim() || newUsername.trim(),
          email: newEmail.trim() || undefined,
          phone: newPhone.trim() || undefined,
          password: newPassword.trim(),
          role: newRole,
          modules: sanitizedModules
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create user');

      // If a team was selected, assign the new user to it
      if (newTeamId && data.user?.id) {
        await fetch(`${serverUrl}/api/admin/teams/${newTeamId}/members`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`
          },
          body: JSON.stringify({
            userId: data.user.id,
            roleInTeam: newRole === 'team_lead' ? 'leader' : 'member'
          })
        }).catch(err => console.warn('Team assignment notice:', err));
      }

      notify(`User "${newUsername}" created successfully.`);
      setShowCreateUserModal(false);
      setNewUsername('');
      setNewDisplayName('');
      setNewEmail('');
      setNewPhone('');
      setNewPassword('');
      setNewTeamId('');
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to create user');
    } finally {
      setCreatingUser(false);
    }
  };

  const handleOpenEdit = (user: UserItem) => {
    setEditingUserId(user.id);
    setEditDisplayName(user.displayName || user.username);
    setEditEmail(user.email || '');
    setEditPhone(user.phone || '');
    setEditRole((user.role === 'admin' ? 'admin' : user.role === 'team_lead' ? 'team_lead' : 'agent'));
    setEditStatus((user.status?.toLowerCase() === 'disabled' ? 'Disabled' : 'Active'));
    setEditPassword('');

    // Pre-fill modules map respecting company ceiling
    const modMap: Record<string, boolean> = {};
    AVAILABLE_MODULES.forEach(m => {
      const p = user.permissions?.find(x => x.moduleId === m.id || (m.id === 'octalDialer' && x.moduleId === 'dialer'));
      const isAssigned = p ? p.enabled === 1 : false;
      modMap[m.id] = user.role === 'admin' ? isModuleCompanyEntitled(m.id) : (isAssigned && isModuleCompanyEntitled(m.id));
    });
    setEditModules(modMap);
    setShowEditUserModal(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUserId) return;
    setSavingEdit(true);
    setError(null);
    try {
      const targetUser = users.find(u => u.id === editingUserId);
      const isTargetOwner = targetUser?.role === 'admin' || targetUser?.username === 'owner';

      const payload: any = {
        displayName: editDisplayName.trim(),
        email: editEmail.trim(),
        phone: editPhone.trim(),
        status: editStatus
      };

      // Role and Module edits only apply to non-owner members
      if (!isTargetOwner) {
        payload.role = editRole;
        // Sanitize: members cannot be granted modules beyond company ceiling
        const sanitizedModules: Record<string, boolean> = {};
        AVAILABLE_MODULES.forEach(m => {
          sanitizedModules[m.id] = !!editModules[m.id] && isModuleCompanyEntitled(m.id);
        });
        payload.modules = sanitizedModules;
      }

      if (editPassword.trim()) {
        payload.password = editPassword.trim();
      }

      const res = await fetch(`${serverUrl}/api/admin/users/${editingUserId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update user');

      notify(`User updated successfully.`);
      setShowEditUserModal(false);
      if (selectedUser?.id === editingUserId) {
        setSelectedUser(null);
      }
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to update user');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    setDeletingUser(true);
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/api/admin/users/${userToDelete.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete user');

      notify(`User "${userToDelete.username}" removed.`);
      setUserToDelete(null);
      if (selectedUser?.id === userToDelete.id) {
        setSelectedUser(null);
      }
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to delete user');
    } finally {
      setDeletingUser(false);
    }
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) {
      setError('Please provide an email address.');
      return;
    }
    setInviting(true);
    setError(null);
    try {
      const activeMods = Object.keys(inviteModules).filter(k => inviteModules[k]);
      const res = await fetch(`${serverUrl}/api/admin/invitations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: inviteRole,
          teamId: inviteTeamId || undefined,
          initialModules: activeMods
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create invitation.');

      const inviteUrl = `${window.location.origin}/?inviteToken=${data.token}`;
      setCreatedInviteUrl(inviteUrl);
      notify(`Invitation generated for ${inviteEmail.trim()}`);
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to send invitation.');
    } finally {
      setInviting(false);
    }
  };

  const handleRevokeInvite = async (invitationId: string) => {
    try {
      const res = await fetch(`${serverUrl}/api/admin/invitations/${invitationId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` }
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to revoke invitation.');
      }
      notify('Invitation revoked.');
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to revoke invitation.');
    }
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim()) {
      setError('Team name is required.');
      return;
    }
    setCreatingTeam(true);
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/api/admin/teams`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({
          name: newTeamName.trim(),
          description: newTeamDesc.trim() || undefined,
          leaderId: newTeamLeaderId || undefined
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create team');

      notify(`Team "${newTeamName}" created.`);
      setShowCreateTeamModal(false);
      setNewTeamName('');
      setNewTeamDesc('');
      setNewTeamLeaderId('');
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to create team');
    } finally {
      setCreatingTeam(false);
    }
  };

  const handleUpdateTeamVisibility = async (teamId: string, leadVisibility: string) => {
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/api/teams/${teamId}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({ leadVisibility })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update visibility policy');
      notify(`Lead visibility updated for team.`);
      fetchData();
      if (selectedTeam && selectedTeam.id === teamId) {
        setSelectedTeam({
          ...selectedTeam,
          settings: { ...selectedTeam.settings, leadVisibility: leadVisibility as any },
          effectiveVisibility: data.effectiveVisibility
        });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update team settings');
    }
  };

  // Helper for role badge
  const renderRoleBadge = (role: string) => {
    switch (role) {
      case 'admin':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <Shield className="w-3 h-3" /> Company Owner
          </span>
        );
      case 'team_lead':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-purple-500/15 text-purple-400 border border-purple-500/30">
            <Target className="w-3 h-3" /> Team Lead
          </span>
        );
      case 'platform_admin':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
            <Building2 className="w-3 h-3" /> Platform Admin
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30">
            <Users className="w-3 h-3" /> Member
          </span>
        );
    }
  };

  return (
    <div className={`space-y-6 text-left select-none transition-colors duration-200 ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
      {/* ── Seat Usage & Capacity Banner ── */}
      {seatUsage && (
        <div className={`border rounded-2xl p-4 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all ${
          isLight ? 'bg-white border-amber-300' : 'bg-[#0B0E14] border-amber-500/30 shadow-black/50'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                  Company Seat Capacity
                </span>
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                  seatUsage.availableSeats > 0
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-red-500/20 text-red-400 border border-red-500/30'
                }`}>
                  {seatUsage.availableSeats > 0 ? `${seatUsage.availableSeats} Available` : 'Limit Reached'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Seats: <strong className="text-amber-400">{seatUsage.activeSeats}</strong> / <strong className="text-white">{seatUsage.maxSeats}</strong> used (<strong className="text-purple-400">{seatUsage.pendingInvitations}</strong> pending, <strong className="text-emerald-400">{seatUsage.availableSeats}</strong> available)
              </p>
            </div>
          </div>
          <button
            id="invite-user-banner-btn"
            onClick={() => {
              setCreatedInviteUrl(null);
              setInviteEmail('');
              setShowInviteModal(true);
            }}
            disabled={seatUsage.availableSeats <= 0}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-md shadow-amber-500/20 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <UserPlus className="w-4 h-4" />
            <span>Invite User</span>
          </button>
        </div>
      )}

      {/* ── Header Bar ── */}
      <div className={`border rounded-2xl p-5 shadow-2xl transition-colors ${
        isLight ? 'bg-white border-slate-200 shadow-slate-200/50' : 'bg-[#0B0E14] border-slate-800 shadow-black/60'
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                onClick={onBack}
                className="p-2 rounded-xl bg-slate-800/40 hover:bg-slate-800 text-slate-400 hover:text-amber-400 border border-slate-700/50 transition-all cursor-pointer"
                title="Back to Settings"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-black font-display tracking-tight text-white flex items-center gap-2">
                  Users & Roles
                </h1>
                <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 uppercase">
                  Workspace Access
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Manage people, teams and access across your company.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="invite-user-header-btn"
              onClick={() => {
                setCreatedInviteUrl(null);
                setInviteEmail('');
                setShowInviteModal(true);
              }}
              disabled={seatUsage ? seatUsage.availableSeats <= 0 : false}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-amber-500/20 transition-all cursor-pointer disabled:opacity-50"
            >
              <UserPlus className="w-4 h-4" />
              <span>Invite User</span>
            </button>
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

        {/* ── Real Top Metrics Bar ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-slate-800/80">
          <div className="p-3 rounded-xl bg-[#10141D] border border-slate-800">
            <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-blue-400" />
              <span>Total Users</span>
            </div>
            <div className="text-xl font-black font-display text-white mt-1">
              {totalUsersCount}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#10141D] border border-slate-800">
            <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-purple-400" />
              <span>Team Leads</span>
            </div>
            <div className="text-xl font-black font-display text-white mt-1">
              {teamLeadsCount}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#10141D] border border-slate-800">
            <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              <span>Teams</span>
            </div>
            <div className="text-xl font-black font-display text-white mt-1">
              {teamsCount}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#10141D] border border-slate-800">
            <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Active Users</span>
            </div>
            <div className="text-xl font-black font-display text-white mt-1">
              {activeUsersCount}
            </div>
          </div>
        </div>

        {/* ── Sub-Navigation Tabs ── */}
        <div className="flex flex-wrap items-center gap-1.5 pt-4 mt-4 border-t border-slate-800/80">
          {[
            { id: 'overview', label: 'Overview', icon: Briefcase },
            { id: 'users', label: `Users (${users.length})`, icon: Users },
            { id: 'team-leads', label: `Team Leads (${teamLeadsList.length})`, icon: Target },
            { id: 'teams', label: `Teams (${teams.length})`, icon: Layers },
            { id: 'invitations', label: `Invitations (${invitations.filter(i => i.status === 'PENDING').length})`, icon: UserPlus },
            { id: 'roles', label: 'Roles & Permissions', icon: Shield },
            { id: 'access-review', label: 'Access Review', icon: Key }
          ].map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  active
                    ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${active ? 'text-amber-400' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Alert / Feedback banner ── */}
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
      {successMsg && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 1: OVERVIEW                                                    */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="space-y-5">
          {/* Quick Access Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div
              onClick={() => setActiveTab('users')}
              className="p-5 rounded-2xl bg-[#0B0E14] border border-slate-800 hover:border-amber-500/40 transition-all cursor-pointer group shadow-lg"
            >
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mb-3 group-hover:scale-105 transition-transform">
                <Users className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-white group-hover:text-amber-400 transition-colors">
                Manage Users
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                View all {users.length} members, edit profiles, toggle permissions, or invite new teammates.
              </p>
              <div className="flex items-center gap-1 text-[11px] text-amber-400 font-semibold mt-3">
                <span>Browse users</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </div>

            <div
              onClick={() => setActiveTab('team-leads')}
              className="p-5 rounded-2xl bg-[#0B0E14] border border-slate-800 hover:border-amber-500/40 transition-all cursor-pointer group shadow-lg"
            >
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 mb-3 group-hover:scale-105 transition-transform">
                <Target className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-white group-hover:text-amber-400 transition-colors">
                Team Leads
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                {teamLeadsList.length} supervisors overseeing teams, campaigns, and lead queues.
              </p>
              <div className="flex items-center gap-1 text-[11px] text-amber-400 font-semibold mt-3">
                <span>View team leads</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </div>

            <div
              onClick={() => setActiveTab('teams')}
              className="p-5 rounded-2xl bg-[#0B0E14] border border-slate-800 hover:border-amber-500/40 transition-all cursor-pointer group shadow-lg"
            >
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-3 group-hover:scale-105 transition-transform">
                <Layers className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-white group-hover:text-amber-400 transition-colors">
                Teams & Groups
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                {teams.length} configured teams with dedicated lead visibility and assigned campaigns.
              </p>
              <div className="flex items-center gap-1 text-[11px] text-amber-400 font-semibold mt-3">
                <span>Manage teams</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </div>

            <div
              onClick={() => setActiveTab('access-review')}
              className="p-5 rounded-2xl bg-[#0B0E14] border border-slate-800 hover:border-amber-500/40 transition-all cursor-pointer group shadow-lg"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-3 group-hover:scale-105 transition-transform">
                <Key className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-white group-hover:text-amber-400 transition-colors">
                Access Review
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Audit who can access what across the entire organization in a single view.
              </p>
              <div className="flex items-center gap-1 text-[11px] text-amber-400 font-semibold mt-3">
                <span>Audit matrix</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>

          {/* Structural Policy Snapshot */}
          <div className="p-5 rounded-2xl bg-[#0B0E14] border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Shield className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-bold text-white">Company Governance & Structural Scope</h3>
              </div>
              <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                Company Maximum: {tenantPolicy.maxTeamVisibility || 'TEAM_COLLABORATE'}
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Zestify uses a strict multi-layered SaaS architecture: Company Owners oversee the entire organization,
              Team Leads are structurally bound to the teams they lead, and Members collaborate according to team visibility policy capped by the Company Maximum.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
              <div className="p-3.5 rounded-xl bg-[#10141D] border border-slate-800/80">
                <div className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5" /> Company Owner
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Full structural scope across all teams, users, lead queues, campaigns, settings, and billing.
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-[#10141D] border border-slate-800/80">
                <div className="text-xs font-bold text-purple-400 flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5" /> Team Lead
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Structural scope restricted strictly to led teams, members, assigned campaigns, and team queue oversight.
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-[#10141D] border border-slate-800/80">
                <div className="text-xs font-bold text-blue-400 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" /> Member / Agent
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Bound to personal assigned work or team visibility policy (OWN, TEAM_READ, or TEAM_COLLABORATE).
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 2: USERS                                                       */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="p-4 rounded-2xl bg-[#0B0E14] border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search by name, email, username..."
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-[#10141D] border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              {/* Role filter */}
              <select
                value={roleFilter}
                onChange={e => setRoleFilter(e.target.value)}
                className="px-2.5 py-1.5 bg-[#10141D] border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-amber-500/50 cursor-pointer"
              >
                <option value="ALL">All Roles</option>
                <option value="admin">Company Owner</option>
                <option value="team_lead">Team Lead</option>
                <option value="agent">Member / Agent</option>
              </select>

              {/* Team filter */}
              <select
                value={teamFilter}
                onChange={e => setTeamFilter(e.target.value)}
                className="px-2.5 py-1.5 bg-[#10141D] border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-amber-500/50 cursor-pointer"
              >
                <option value="ALL">All Teams</option>
                {teams.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>

              {/* Status filter */}
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="px-2.5 py-1.5 bg-[#10141D] border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-amber-500/50 cursor-pointer"
              >
                <option value="ALL">All Statuses</option>
                <option value="Active">Active</option>
                <option value="Disabled">Disabled</option>
              </select>

              <button
                id="invite-user-table-btn"
                onClick={() => {
                  setCreatedInviteUrl(null);
                  setInviteEmail('');
                  setShowInviteModal(true);
                }}
                disabled={seatUsage ? seatUsage.availableSeats <= 0 : false}
                className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ml-auto disabled:opacity-50"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Invite User</span>
              </button>
            </div>
          </div>

          {/* Users Table */}
          <div className="border border-slate-800 rounded-2xl bg-[#0B0E14] overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800/80 bg-[#10141D]/80 text-slate-400 font-mono uppercase text-[10px]">
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Team(s)</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Modules Enabled</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-10 text-slate-500 text-xs">
                        No users match the active filters.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map(user => {
                      const userTeams = userTeamsMap.get(user.id) || [];
                      const isActive = !user.status || user.status.toLowerCase() === 'active';

                      return (
                        <tr
                          key={user.id}
                          className="hover:bg-slate-900/40 transition-colors cursor-pointer group"
                          onClick={() => setSelectedUser(user)}
                        >
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-amber-400 text-xs uppercase">
                                {(user.displayName || user.username || 'U').charAt(0)}
                              </div>
                              <div>
                                <div className="font-semibold text-white group-hover:text-amber-400 transition-colors">
                                  {user.displayName || user.username}
                                </div>
                                <div className="text-[11px] text-slate-400 font-mono">
                                  {user.email || user.username}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-3.5">
                            {renderRoleBadge(user.role)}
                          </td>

                          <td className="px-4 py-3.5">
                            {userTeams.length === 0 ? (
                              <span className="text-slate-500 text-[11px] italic">Unassigned</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {userTeams.slice(0, 2).map(t => (
                                  <span key={t.id} className="px-2 py-0.5 rounded bg-slate-800/80 text-slate-300 text-[10px] border border-slate-700">
                                    {t.name}
                                  </span>
                                ))}
                                {userTeams.length > 2 && (
                                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px]">
                                    +{userTeams.length - 2}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>

                          <td className="px-4 py-3.5">
                            {isActive ? (
                              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                                Disabled
                              </span>
                            )}
                          </td>

                          <td className="px-4 py-3.5">
                            {user.role === 'admin' ? (
                              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[11px] font-mono border border-emerald-500/20" title="Company Owner inherits all company-entitled modules">
                                All Available ({companyAvailableCount} / {companyAvailableCount})
                              </span>
                            ) : (
                              <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[11px] font-mono border border-slate-700" title={`Effective modules: ${getUserEffectiveModulesCount(user)} of ${companyAvailableCount} available under company ceiling`}>
                                Assigned: {getUserEffectiveModulesCount(user)} / {companyAvailableCount} modules
                              </span>
                            )}
                          </td>

                          <td className="px-4 py-3.5 text-right" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => setSelectedUser(user)}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                                title="View Details"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleOpenEdit(user)}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-400 transition-colors cursor-pointer"
                                title="Edit User"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setUserToDelete(user)}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                                title="Delete User"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 3: TEAM LEADS                                                  */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === 'team-leads' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Target className="w-4 h-4 text-purple-400" />
              Team Leads & Supervisors ({teamLeadsList.length})
            </h3>
            <p className="text-xs text-slate-400">
              Supervisors with structural team oversight and campaign queue monitoring.
            </p>
          </div>

          {teamLeadsList.length === 0 ? (
            <div className="p-8 rounded-2xl bg-[#0B0E14] border border-slate-800 text-center text-slate-500 text-xs">
              No Team Leads found in this company. Promote a member to Team Lead in the Users tab.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {teamLeadsList.map(lead => {
                const ledTeams = teams.filter(t => t.leaderId === lead.id);
                const totalMembers = ledTeams.reduce((sum, t) => sum + (t.memberCount || 0), 0);
                const totalCampaigns = ledTeams.reduce((sum, t) => sum + (t.campaignCount || 0), 0);

                return (
                  <div
                    key={lead.id}
                    onClick={() => setSelectedTeamLead(lead)}
                    className="p-5 rounded-2xl bg-[#0B0E14] border border-slate-800 hover:border-purple-500/40 transition-all cursor-pointer shadow-lg space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center font-bold text-purple-400 text-sm">
                          {(lead.displayName || lead.username).charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-white">
                            {lead.displayName || lead.username}
                          </h4>
                          <span className="text-[11px] text-slate-400 font-mono">
                            {lead.email || lead.username}
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/30">
                        Lead
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800/80 text-center">
                      <div className="p-2 rounded-lg bg-[#10141D]">
                        <div className="text-[10px] text-slate-400">Teams Led</div>
                        <div className="text-sm font-bold text-white mt-0.5">{ledTeams.length}</div>
                      </div>
                      <div className="p-2 rounded-lg bg-[#10141D]">
                        <div className="text-[10px] text-slate-400">Members</div>
                        <div className="text-sm font-bold text-white mt-0.5">{totalMembers}</div>
                      </div>
                      <div className="p-2 rounded-lg bg-[#10141D]">
                        <div className="text-[10px] text-slate-400">Campaigns</div>
                        <div className="text-sm font-bold text-white mt-0.5">{totalCampaigns}</div>
                      </div>
                    </div>

                    {ledTeams.length > 0 && (
                      <div className="space-y-1 pt-1">
                        <div className="text-[10px] font-mono text-slate-400 uppercase">Assigned Teams:</div>
                        <div className="flex flex-wrap gap-1">
                          {ledTeams.map(t => (
                            <span key={t.id} className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] border border-slate-700">
                              {t.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 4: TEAMS                                                       */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === 'teams' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-[#0B0E14] border border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-400" />
                Teams & Groups ({teams.length})
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Organize members into structural squads with custom lead visibility policies.
              </p>
            </div>
            <button
              onClick={() => setShowCreateTeamModal(true)}
              className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create Team</span>
            </button>
          </div>

          {teams.length === 0 ? (
            <div className="p-8 rounded-2xl bg-[#0B0E14] border border-slate-800 text-center text-slate-500 text-xs">
              No teams created yet. Click "+ Create Team" to get started.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {teams.map(team => {
                const effectiveVis = team.effectiveVisibility || team.settings?.leadVisibility || 'OWN';
                return (
                  <div
                    key={team.id}
                    onClick={() => setSelectedTeam(team)}
                    className="p-5 rounded-2xl bg-[#0B0E14] border border-slate-800 hover:border-amber-500/40 transition-all cursor-pointer shadow-lg space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="text-sm font-bold text-white flex items-center gap-2">
                          <Layers className="w-4 h-4 text-amber-400" />
                          {team.name}
                        </h4>
                        {team.description && (
                          <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                            {team.description}
                          </p>
                        )}
                      </div>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                        {effectiveVis}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-[#10141D] border border-slate-800/80 flex items-center justify-between text-xs">
                      <span className="text-slate-400">Team Leader:</span>
                      <span className="font-semibold text-white">
                        {team.leaderName || 'Unassigned'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-center text-xs">
                      <div className="p-2 rounded-lg bg-[#10141D]">
                        <div className="text-[10px] text-slate-400">Members</div>
                        <div className="text-sm font-bold text-white mt-0.5">{team.memberCount || 0}</div>
                      </div>
                      <div className="p-2 rounded-lg bg-[#10141D]">
                        <div className="text-[10px] text-slate-400">Campaigns</div>
                        <div className="text-sm font-bold text-white mt-0.5">{team.campaignCount || 0}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB: INVITATIONS                                                   */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === 'invitations' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-[#0B0E14] border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-amber-400" />
                Workspace Invitations ({invitations.length})
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Invite employees to join your workspace as Team Leads or Members.
              </p>
            </div>
            <button
              id="invite-member-btn"
              onClick={() => {
                setCreatedInviteUrl(null);
                setInviteEmail('');
                setShowInviteModal(true);
              }}
              disabled={seatUsage ? seatUsage.availableSeats <= 0 : false}
              className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <UserPlus className="w-4 h-4" />
              <span>Send New Invitation</span>
            </button>
          </div>

          {invitations.length === 0 ? (
            <div className="p-12 rounded-2xl bg-[#0B0E14] border border-slate-800 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto">
                <UserPlus className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">No Invitations Yet</h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                  Invite your team leads and agents to collaborate in this workspace. They will receive an invitation to join immediately.
                </p>
              </div>
              <button
                onClick={() => {
                  setCreatedInviteUrl(null);
                  setInviteEmail('');
                  setShowInviteModal(true);
                }}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-md cursor-pointer transition-all inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Invite First User</span>
              </button>
            </div>
          ) : (
            <div className="border border-slate-800 rounded-2xl bg-[#0B0E14] overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800/80 bg-[#10141D]/80 text-slate-400 font-mono uppercase text-[10px]">
                      <th className="px-4 py-3">Invited Email</th>
                      <th className="px-4 py-3">Target Role</th>
                      <th className="px-4 py-3">Assigned Team</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Sent Date</th>
                      <th className="px-4 py-3">Expires</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {invitations.map(inv => {
                      const isPending = inv.status === 'PENDING';
                      return (
                        <tr key={inv.id} className="hover:bg-slate-900/40 transition-colors">
                          <td className="px-4 py-3 font-semibold text-white font-mono">
                            {inv.email}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                              inv.role === 'team_lead'
                                ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                                : 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                            }`}>
                              {inv.role === 'team_lead' ? 'Team Lead' : 'Member'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-300">
                            {inv.teamName || (inv.teamId ? 'Assigned' : 'None')}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                              inv.status === 'PENDING'
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                : inv.status === 'ACCEPTED'
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'bg-slate-800 text-slate-400 border border-slate-700'
                            }`}>
                              {inv.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-400 font-mono text-[11px]">
                            {new Date(inv.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 text-slate-400 font-mono text-[11px]">
                            {new Date(inv.expiresAt).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {isPending && (
                              <button
                                onClick={() => handleRevokeInvite(inv.id)}
                                className="px-2.5 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 font-semibold text-[11px] transition-all cursor-pointer"
                              >
                                Revoke
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 5: ROLES & PERMISSIONS                                         */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === 'roles' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Column: Roles list */}
          <div className="lg:col-span-4 space-y-3">
            <div className="text-xs font-mono text-slate-400 uppercase tracking-wider px-1">
              Available Roles
            </div>

            {[
              { id: 'admin', name: 'Company Owner', desc: 'Highest tenant authority with total company control', isBuiltin: true },
              { id: 'team_lead', name: 'Team Lead', desc: 'Supervisor scope bound strictly to assigned teams', isBuiltin: true },
              { id: 'agent', name: 'Member / Agent', desc: 'Standard operator role bound to personal/team queue', isBuiltin: true },
              ...roles.map(r => ({ id: r.id, name: r.roleName, desc: r.description || 'Custom company role', isBuiltin: false }))
            ].map(r => {
              const isSelected = selectedRoleDetail === r.id;
              return (
                <div
                  key={r.id}
                  onClick={() => setSelectedRoleDetail(r.id)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-amber-500/10 border-amber-500/40 shadow-lg'
                      : 'bg-[#0B0E14] border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <h4 className={`text-sm font-bold ${isSelected ? 'text-amber-400' : 'text-white'}`}>
                      {r.name}
                    </h4>
                    {r.isBuiltin && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                        System
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {r.desc}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Right Column: Permissions Matrix + Scope Display */}
          <div className="lg:col-span-8 space-y-4">
            {/* Structural Scope Warning Display (CRITICAL REQUIREMENT) */}
            <div className="p-5 rounded-2xl bg-[#0B0E14] border border-amber-500/30 space-y-3">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-bold text-white">
                  Structural Scope Boundary Enforcement
                </h3>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                In Zestify, user rights are governed by two distinct dimensions: <span className="text-amber-400 font-semibold">Functional Permissions</span> (e.g. can create leads) and <span className="text-amber-400 font-semibold">Structural Scope</span> (e.g. tenant-wide vs. led teams only vs. own scope).
              </p>
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 font-medium">
                ⚡ <strong>Critical Boundary Rule:</strong> A functional permission does <u>NOT</u> override structural scope. A Team Lead granted permission to edit leads can still only edit leads belonging to teams they lead.
              </div>
            </div>

            {/* Role Permissions Breakdown */}
            <div className="p-5 rounded-2xl bg-[#0B0E14] border border-slate-800 space-y-4">
              <h4 className="text-sm font-bold text-white">
                Permissions Granted to: {selectedRoleDetail === 'admin' ? 'Company Owner' : selectedRoleDetail === 'team_lead' ? 'Team Lead' : selectedRoleDetail === 'agent' ? 'Member' : selectedRoleDetail}
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {AVAILABLE_MODULES.map(mod => {
                  const hasAccess = selectedRoleDetail === 'admin'
                    ? true
                    : selectedRoleDetail === 'team_lead'
                    ? ['crm', 'campaigns', 'octalDialer', 'leads', 'reports'].includes(mod.id)
                    : ['octalDialer', 'leads', 'crm'].includes(mod.id);

                  return (
                    <div key={mod.id} className="p-3 rounded-xl bg-[#10141D] border border-slate-800/80 flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${hasAccess ? 'bg-amber-500/15 text-amber-400' : 'bg-slate-800 text-slate-500'}`}>
                        {hasAccess ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                      </div>
                      <div>
                        <div className={`text-xs font-bold ${hasAccess ? 'text-white' : 'text-slate-500'}`}>
                          {mod.label}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {mod.desc}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 6: ACCESS REVIEW (WHO CAN ACCESS WHAT)                           */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === 'access-review' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-[#0B0E14] border border-slate-800">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Key className="w-4 h-4 text-emerald-400" />
              Access Review Matrix — Who Can Access What?
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Forensic access map showing each member's structural scope, lead visibility tier, and active modules.
            </p>
          </div>

          <div className="border border-slate-800 rounded-2xl bg-[#0B0E14] overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800/80 bg-[#10141D]/80 text-slate-400 font-mono uppercase text-[10px]">
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Assigned Team(s)</th>
                    <th className="px-4 py-3">Structural Scope</th>
                    <th className="px-4 py-3">Lead Access Tier</th>
                    <th className="px-4 py-3">Enabled Modules</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {users.map(u => {
                    const userTeams = userTeamsMap.get(u.id) || [];
                    const isOwner = u.role === 'admin';
                    const isLead = u.role === 'team_lead' || teams.some(t => t.leaderId === u.id);
                    const scopeLabel = isOwner ? 'Tenant-Wide' : isLead ? 'Led Teams Only' : 'Own / Peer Scope';
                    const leadTier = isOwner
                      ? 'FULL_ACCESS'
                      : userTeams.length > 0
                      ? userTeams[0].effectiveVisibility || userTeams[0].settings?.leadVisibility || 'OWN'
                      : 'OWN';
                    const isActive = !u.status || u.status.toLowerCase() === 'active';

                    return (
                      <tr key={u.id} className="hover:bg-slate-900/40 transition-colors">
                        <td className="px-4 py-3.5">
                          <div className="font-semibold text-white">
                            {u.displayName || u.username}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            {u.email || u.username}
                          </div>
                        </td>

                        <td className="px-4 py-3.5">
                          {renderRoleBadge(u.role)}
                        </td>

                        <td className="px-4 py-3.5">
                          {userTeams.length === 0 ? (
                            <span className="text-slate-500 text-[11px]">Unassigned</span>
                          ) : (
                            userTeams.map(t => t.name).join(', ')
                          )}
                        </td>

                        <td className="px-4 py-3.5">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                            isOwner
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                              : isLead
                              ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                              : 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                          }`}>
                            {scopeLabel}
                          </span>
                        </td>

                        <td className="px-4 py-3.5">
                          <span className="font-mono text-slate-300 text-[11px]">
                            {leadTier}
                          </span>
                        </td>

                        <td className="px-4 py-3.5">
                          {u.role === 'admin' ? (
                            <span className="text-emerald-400 font-mono text-[11px] font-semibold">
                              All {companyAvailableCount} / {companyAvailableCount} Entitled
                            </span>
                          ) : (
                            <span className="text-slate-300 font-mono text-[11px]">
                              {getUserEffectiveModulesCount(u)} / {companyAvailableCount} Available
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3.5">
                          {isActive ? (
                            <span className="text-emerald-400 text-[11px] font-medium">Active</span>
                          ) : (
                            <span className="text-slate-500 text-[11px]">Disabled</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* USER DETAILS DRAWER (SLIDE-IN FROM RIGHT)                           */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-xs animate-fade-in">
          <div
            className="w-full max-w-md h-full bg-[#0B0E14] border-l border-slate-800 shadow-2xl p-6 overflow-y-auto space-y-6 text-left"
            onClick={e => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center font-bold text-amber-400 text-lg uppercase">
                  {(selectedUser.displayName || selectedUser.username).charAt(0)}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {selectedUser.displayName || selectedUser.username}
                  </h3>
                  <div className="mt-1 flex items-center gap-2">
                    {renderRoleBadge(selectedUser.role)}
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                      {selectedUser.status || 'Active'}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedUser(null)}
                className="p-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Section 1: Account Info */}
            <div className="space-y-2">
              <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                Account Details
              </div>
              <div className="p-3.5 rounded-xl bg-[#10141D] border border-slate-800/80 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Username:</span>
                  <span className="font-mono text-white">{selectedUser.username}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Email:</span>
                  <span className="text-white">{selectedUser.email || 'None'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Phone:</span>
                  <span className="text-white">{selectedUser.phone || 'None'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Joined:</span>
                  <span className="text-slate-400">{new Date(selectedUser.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            </div>

            {/* Section 2: Organization & Teams */}
            <div className="space-y-2">
              <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                Organizational Placement
              </div>
              <div className="p-3.5 rounded-xl bg-[#10141D] border border-slate-800/80 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Assigned Teams:</span>
                  <span className="text-white font-medium">
                    {(userTeamsMap.get(selectedUser.id) || []).map(t => t.name).join(', ') || 'Unassigned'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Structural Scope:</span>
                  <span className="font-mono text-amber-400">
                    {selectedUser.role === 'admin' ? 'Tenant-Wide' : selectedUser.role === 'team_lead' ? 'Led Teams Only' : 'Own / Peer Scope'}
                  </span>
                </div>
              </div>
            </div>

            {/* Section 3: Inherited Module Access Hierarchy */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                  Inherited Module Entitlements
                </div>
                <div className="text-[10px] font-mono text-amber-400">
                  Platform Ceiling ∩ User Assignment
                </div>
              </div>

              {selectedUser.role === 'admin' ? (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
                  <div className="flex items-center gap-1.5 font-bold mb-1">
                    <ShieldCheck className="w-4 h-4 text-amber-400" />
                    <span>Company Owner Entitlement Root</span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    This account possesses root administrative ownership. All {companyAvailableCount} modules provisioned by the Zestify Platform are automatically active with zero subordinate restrictions.
                  </p>
                </div>
              ) : null}

              <div className="border border-slate-800 rounded-xl overflow-hidden bg-[#10141D]">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-900/80 border-b border-slate-800 text-[10px] font-mono text-slate-400 uppercase">
                    <tr>
                      <th className="px-3 py-2">Module</th>
                      <th className="px-2 py-2 text-center">Company Ceiling</th>
                      <th className="px-2 py-2 text-center">User Assignment</th>
                      <th className="px-3 py-2 text-right">Effective Access</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {AVAILABLE_MODULES.map(m => {
                      const companyEntitled = isModuleCompanyEntitled(m.id);
                      const perm = selectedUser.permissions?.find(p => p.moduleId === m.id || (m.id === 'octalDialer' && p.moduleId === 'dialer'));
                      const userAssigned = selectedUser.role === 'admin' ? true : (perm ? perm.enabled === 1 : false);
                      const isEffective = selectedUser.role === 'admin' ? companyEntitled : (companyEntitled && userAssigned);

                      return (
                        <tr key={m.id} className="hover:bg-slate-800/30">
                          <td className="px-3 py-2">
                            <span className="mr-1.5">{m.icon}</span>
                            <span className="font-medium text-slate-200">{m.label}</span>
                          </td>
                          <td className="px-2 py-2 text-center">
                            {companyEntitled ? (
                              <span className="text-emerald-400 font-mono text-[10px]">Allowed</span>
                            ) : (
                              <span className="text-rose-400 font-mono text-[10px]">Blocked</span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-center">
                            {selectedUser.role === 'admin' ? (
                              <span className="text-amber-400 font-mono text-[10px]">Root</span>
                            ) : userAssigned ? (
                              <span className="text-emerald-400 font-mono text-[10px]">Assigned</span>
                            ) : (
                              <span className="text-slate-500 font-mono text-[10px]">Not Set</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {isEffective ? (
                              <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono text-[10px] font-bold border border-emerald-500/20">
                                Active
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-500 font-mono text-[10px] border border-slate-700/50">
                                {!companyEntitled ? 'Ceiling Restrict' : 'Not Granted'}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Section 4: Lead Access Governance */}
            <div className="space-y-2">
              <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                Lead Access Policy
              </div>
              <div className="p-3.5 rounded-xl bg-[#10141D] border border-slate-800/80 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Company Maximum:</span>
                  <span className="font-mono text-white">{tenantPolicy.maxTeamVisibility || 'TEAM_COLLABORATE'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Effective Access:</span>
                  <span className="font-mono text-emerald-400 font-bold">
                    {selectedUser.role === 'admin'
                      ? 'FULL_ACCESS'
                      : (userTeamsMap.get(selectedUser.id)?.[0]?.effectiveVisibility || 'OWN')}
                  </span>
                </div>
              </div>
            </div>

            {/* Section 5: Actions */}
            <div className="pt-2 border-t border-slate-800 flex items-center gap-2">
              <button
                onClick={() => {
                  handleOpenEdit(selectedUser);
                }}
                className="flex-1 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                <Edit className="w-3.5 h-3.5" />
                <span>Edit User & Permissions</span>
              </button>
              <button
                onClick={() => {
                  setUserToDelete(selectedUser);
                }}
                className="p-2 rounded-xl bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 cursor-pointer transition-colors"
                title="Delete User"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TEAM DETAIL MODAL                                                  */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {selectedTeam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-fade-in">
          <div
            className="w-full max-w-lg bg-[#0B0E14] border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-5 text-left"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-amber-400" />
                  Team: {selectedTeam.name}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {selectedTeam.description || 'No description provided.'}
                </p>
              </div>
              <button
                onClick={() => setSelectedTeam(null)}
                className="p-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Team Leader & Counts */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-[#10141D] border border-slate-800">
                <span className="text-slate-400">Team Leader</span>
                <div className="font-bold text-white text-sm mt-0.5">
                  {selectedTeam.leaderName || 'Unassigned'}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-[#10141D] border border-slate-800">
                <span className="text-slate-400">Total Members</span>
                <div className="font-bold text-white text-sm mt-0.5">
                  {selectedTeam.memberCount || 0}
                </div>
              </div>
            </div>

            {/* Lead Visibility Setting for Team */}
            <div className="p-4 rounded-xl bg-[#10141D] border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">Lead Visibility Policy</span>
                <span className="text-[10px] font-mono text-slate-400">
                  Capped by: {tenantPolicy.maxTeamVisibility || 'TEAM_COLLABORATE'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {['OWN', 'TEAM_READ', 'TEAM_COLLABORATE'].map(vis => {
                  const currentVis = selectedTeam.settings?.leadVisibility || 'OWN';
                  const isSelected = currentVis === vis;
                  return (
                    <button
                      key={vis}
                      onClick={() => handleUpdateTeamVisibility(selectedTeam.id, vis)}
                      className={`py-2 px-2 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-amber-500 text-black shadow-md'
                          : 'bg-slate-800/60 text-slate-400 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      {vis}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Members List */}
            <div className="space-y-2">
              <div className="text-xs font-mono text-slate-400 uppercase">Team Members</div>
              <div className="max-h-48 overflow-y-auto divide-y divide-slate-800/60 border border-slate-800 rounded-xl bg-[#10141D]">
                {!selectedTeam.members || selectedTeam.members.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-500">
                    No members enrolled in this team yet.
                  </div>
                ) : (
                  selectedTeam.members.map(m => (
                    <div key={m.id || m.userId} className="p-3 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-medium text-white">{m.displayName || m.username || m.userId}</div>
                        <div className="text-[10px] text-slate-400 capitalize">{m.roleInTeam}</div>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                        Enrolled
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TEAM LEAD DETAIL MODAL                                              */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {selectedTeamLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-fade-in">
          <div
            className="w-full max-w-lg bg-[#0B0E14] border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-5 text-left"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center font-bold text-purple-400">
                  <Target className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {selectedTeamLead.displayName || selectedTeamLead.username}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {selectedTeamLead.email || selectedTeamLead.username}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedTeamLead(null)}
                className="p-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 rounded-xl bg-[#10141D] border border-slate-800 space-y-2 text-xs">
              <div className="text-slate-400">Structural Responsibility:</div>
              <p className="text-slate-300 leading-relaxed">
                This supervisor is authorized to oversee members and campaigns only within their specifically assigned teams.
              </p>
            </div>

            {/* Teams Led list */}
            <div className="space-y-2">
              <div className="text-xs font-mono text-slate-400 uppercase">Teams Led by this Supervisor:</div>
              <div className="divide-y divide-slate-800/60 border border-slate-800 rounded-xl bg-[#10141D]">
                {teams.filter(t => t.leaderId === selectedTeamLead.id).length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-500">
                    No teams currently assigned to lead.
                  </div>
                ) : (
                  teams.filter(t => t.leaderId === selectedTeamLead.id).map(t => (
                    <div key={t.id} className="p-3 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-semibold text-white">{t.name}</div>
                        <div className="text-[11px] text-slate-400">{t.memberCount || 0} members · {t.campaignCount || 0} campaigns</div>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-amber-400 border border-slate-700">
                        {t.effectiveVisibility || 'OWN'}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* MODAL: CREATE USER                                                  */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {showCreateUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-fade-in">
          <div
            className="w-full max-w-lg bg-[#0B0E14] border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-5 text-left max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-amber-400" />
                  Create New Workspace User
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Add a new member, supervisor, or administrator to your company.
                </p>
              </div>
              <button
                onClick={() => setShowCreateUserModal(false)}
                className="p-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Username *</label>
                  <input
                    type="text"
                    required
                    value={newUsername}
                    onChange={e => setNewUsername(e.target.value)}
                    placeholder="e.g. john_doe"
                    className="w-full px-3 py-2 bg-[#10141D] border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500/50"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Full Name</label>
                  <input
                    type="text"
                    value={newDisplayName}
                    onChange={e => setNewDisplayName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="w-full px-3 py-2 bg-[#10141D] border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500/50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Email</label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    placeholder="john@company.com"
                    className="w-full px-3 py-2 bg-[#10141D] border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500/50"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Phone</label>
                  <input
                    type="tel"
                    value={newPhone}
                    onChange={e => setNewPhone(e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    className="w-full px-3 py-2 bg-[#10141D] border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500/50"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Password *</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  className="w-full px-3 py-2 bg-[#10141D] border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500/50"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Company Role *</label>
                  <select
                    value={newRole}
                    onChange={e => setNewRole(e.target.value as any)}
                    className="w-full px-3 py-2 bg-[#10141D] border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500/50 cursor-pointer"
                  >
                    <option value="agent">Member / Agent</option>
                    <option value="team_lead">Team Lead</option>
                    <option value="admin">Company Owner</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Assign to Team</label>
                  <select
                    value={newTeamId}
                    onChange={e => setNewTeamId(e.target.value)}
                    className="w-full px-3 py-2 bg-[#10141D] border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500/50 cursor-pointer"
                  >
                    <option value="">None (Unassigned)</option>
                    {teams.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Module Toggles with Company Ceiling */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300">Module Access Assignments</label>
                  <span className="text-[10px] font-mono text-amber-400">
                    Ceiling: {companyAvailableCount} / {AVAILABLE_MODULES.length} Available
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {AVAILABLE_MODULES.map(m => {
                    const entitled = isModuleCompanyEntitled(m.id);
                    const isChecked = !!newModules[m.id];
                    if (!entitled) {
                      return (
                        <div
                          key={m.id}
                          className="p-2 rounded-xl border border-slate-800/80 bg-slate-950/60 text-slate-500 text-xs flex items-center justify-between opacity-70 cursor-not-allowed"
                          title="Disabled at Company Level — Not entitled by Platform Owner"
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="opacity-50">{m.icon}</span>
                            <span className="line-through text-slate-500 truncate">{m.label}</span>
                          </div>
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-500 shrink-0 flex items-center gap-1">
                            <Lock className="w-2.5 h-2.5" />
                            Blocked
                          </span>
                        </div>
                      );
                    }
                    return (
                      <label
                        key={m.id}
                        className={`p-2 rounded-xl border text-xs flex items-center justify-between cursor-pointer transition-all ${
                          isChecked
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 font-medium'
                            : 'bg-[#10141D] border-slate-800 text-slate-400'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <span>{m.icon}</span>
                          <span className="truncate">{m.label}</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={e => setNewModules({ ...newModules, [m.id]: e.target.checked })}
                          className="rounded accent-amber-500 cursor-pointer"
                        />
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateUserModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingUser}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {creatingUser ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                  <span>Create User</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* MODAL: EDIT USER & PERMISSIONS                                      */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {showEditUserModal && (() => {
        const targetEditingUser = users.find(u => u.id === editingUserId);
        const isEditingOwner = targetEditingUser?.role === 'admin' || targetEditingUser?.username === 'owner';
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-fade-in">
            <div
              className="w-full max-w-lg bg-[#0B0E14] border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-5 text-left max-h-[90vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-start justify-between border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    {isEditingOwner ? <ShieldCheck className="w-5 h-5 text-amber-400" /> : <Edit className="w-5 h-5 text-amber-400" />}
                    {isEditingOwner ? 'Edit Company Owner & Credentials' : 'Edit User & Permissions'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {isEditingOwner
                      ? 'Update contact details or credentials. Root owner inherits all company-entitled modules.'
                      : 'Update role, contact details, status, or module access within company limits.'}
                  </p>
                </div>
                <button
                  onClick={() => setShowEditUserModal(false)}
                  className="p-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveEdit} className="space-y-4">
                {/* Section 1: Account Profile */}
                <div className="space-y-3">
                  <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                    1. Account Profile
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-300">Display Name</label>
                      <input
                        type="text"
                        value={editDisplayName}
                        onChange={e => setEditDisplayName(e.target.value)}
                        className="w-full px-3 py-2 bg-[#10141D] border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500/50"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-300">Email</label>
                      <input
                        type="email"
                        value={editEmail}
                        onChange={e => setEditEmail(e.target.value)}
                        className="w-full px-3 py-2 bg-[#10141D] border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500/50"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-300">Phone</label>
                      <input
                        type="tel"
                        value={editPhone}
                        onChange={e => setEditPhone(e.target.value)}
                        className="w-full px-3 py-2 bg-[#10141D] border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500/50"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-300">Reset Password (optional)</label>
                      <input
                        type="password"
                        value={editPassword}
                        onChange={e => setEditPassword(e.target.value)}
                        placeholder="Leave empty to keep current"
                        className="w-full px-3 py-2 bg-[#10141D] border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500/50"
                      />
                    </div>
                  </div>
                </div>

                {/* Section 2: Organization & Role Hierarchy */}
                <div className="space-y-3 pt-2 border-t border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                    2. Organization & Role Hierarchy
                  </div>
                  {isEditingOwner ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-300">Company Role</label>
                        <div className="w-full px-3 py-2 bg-[#141923] border border-amber-500/30 rounded-xl text-xs text-amber-300 font-bold flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <ShieldCheck className="w-4 h-4 text-amber-400" />
                            Company Owner
                          </span>
                          <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400">
                            Root
                          </span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-300">Structural Scope</label>
                        <div className="w-full px-3 py-2 bg-[#141923] border border-slate-800 rounded-xl text-xs text-slate-300 flex items-center justify-between">
                          <span>Entire Company</span>
                          <span className="text-[10px] font-mono text-emerald-400">TENANT_WIDE</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-300">Company Role</label>
                        <select
                          value={editRole}
                          onChange={e => setEditRole(e.target.value as any)}
                          className="w-full px-3 py-2 bg-[#10141D] border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500/50 cursor-pointer"
                        >
                          <option value="agent">Member / Agent</option>
                          <option value="team_lead">Team Lead</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-300">Account Status</label>
                        <select
                          value={editStatus}
                          onChange={e => setEditStatus(e.target.value as any)}
                          className="w-full px-3 py-2 bg-[#10141D] border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500/50 cursor-pointer"
                        >
                          <option value="Active">Active</option>
                          <option value="Disabled">Disabled</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                {/* Section 3: Module Access Hierarchy */}
                <div className="space-y-3 pt-2 border-t border-slate-800">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                      3. Inherited Module Access Rights
                    </div>
                    <span className="text-[10px] font-mono text-amber-400">
                      Ceiling: {companyAvailableCount} / {AVAILABLE_MODULES.length} Available
                    </span>
                  </div>

                  {isEditingOwner ? (
                    <div className="space-y-3">
                      <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs flex items-start gap-2.5">
                        <Shield className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-bold text-amber-300">Managed by Zestify Platform</div>
                          <div className="text-[11px] text-slate-300 mt-0.5">
                            Module access for the Company Owner account is governed directly by your subscription contract and Platform Owner entitlements. Zero editable checkboxes — company owner automatically inherits all platform-enabled modules.
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {AVAILABLE_MODULES.map(m => {
                          const entitled = isModuleCompanyEntitled(m.id);
                          return (
                            <div
                              key={m.id}
                              className={`p-2.5 rounded-xl border text-xs flex items-center justify-between ${
                                entitled
                                  ? 'bg-[#10141D] border-emerald-500/30 text-slate-200'
                                  : 'bg-slate-950/60 border-slate-800/80 text-slate-500 opacity-60'
                              }`}
                            >
                              <div className="flex items-center gap-2 truncate">
                                <span>{m.icon}</span>
                                <span className="font-medium truncate">{m.label}</span>
                              </div>
                              {entitled ? (
                                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-semibold border border-emerald-500/20 flex items-center gap-1 shrink-0">
                                  <Check className="w-3 h-3" />
                                  Enabled by Platform
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full bg-slate-900 text-slate-500 text-[10px] font-semibold border border-slate-800 flex items-center gap-1 shrink-0">
                                  <Lock className="w-3 h-3" />
                                  Not Included
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="p-3 rounded-xl bg-[#141923] border border-slate-800 text-xs flex items-start gap-2.5">
                        <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-semibold text-slate-200">
                            Company Entitlement Ceiling ({companyAvailableCount} Modules Active)
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            Members cannot be granted modules that are not included in your company's platform contract. Lower layers may only restrict access, never elevate it.
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {AVAILABLE_MODULES.map(m => {
                          const entitled = isModuleCompanyEntitled(m.id);
                          const isChecked = !!editModules[m.id];
                          if (!entitled) {
                            return (
                              <div
                                key={m.id}
                                className="p-2.5 rounded-xl border border-slate-800/80 bg-slate-950/60 text-slate-500 text-xs flex items-center justify-between opacity-70 cursor-not-allowed"
                                title="Disabled at Company Level — Not entitled by Platform Owner"
                              >
                                <div className="flex items-center gap-2 truncate">
                                  <span className="opacity-50">{m.icon}</span>
                                  <div className="truncate">
                                    <div className="font-medium line-through text-slate-500 truncate">{m.label}</div>
                                    <div className="text-[10px] text-slate-600 flex items-center gap-1">
                                      <Lock className="w-2.5 h-2.5" />
                                      Disabled at Company Level
                                    </div>
                                  </div>
                                </div>
                                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-600 shrink-0">
                                  Blocked
                                </span>
                              </div>
                            );
                          }
                          return (
                            <label
                              key={m.id}
                              className={`p-2.5 rounded-xl border text-xs flex items-center justify-between cursor-pointer transition-all ${
                                isChecked
                                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 font-medium'
                                  : 'bg-[#10141D] border-slate-800 text-slate-400 hover:border-slate-700'
                              }`}
                            >
                              <div className="flex items-center gap-2 truncate">
                                <span>{m.icon}</span>
                                <div className="truncate">
                                  <div className="font-medium text-slate-200 truncate">{m.label}</div>
                                  <div className="text-[10px] text-slate-400">
                                    {isChecked ? 'Effective: Granted' : 'Effective: Not Assigned'}
                                  </div>
                                </div>
                              </div>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={e => setEditModules({ ...editModules, [m.id]: e.target.checked })}
                                className="rounded accent-amber-500 w-4 h-4 cursor-pointer shrink-0"
                              />
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowEditUserModal(false)}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingEdit}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {savingEdit ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    <span>Save Changes</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* MODAL: CREATE TEAM                                                  */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {showCreateTeamModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-fade-in">
          <div
            className="w-full max-w-md bg-[#0B0E14] border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-4 text-left"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-amber-400" />
                  Create New Team
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Set up a collaborative squad with an assigned Team Lead.
                </p>
              </div>
              <button
                onClick={() => setShowCreateTeamModal(false)}
                className="p-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateTeam} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Team Name *</label>
                <input
                  type="text"
                  required
                  value={newTeamName}
                  onChange={e => setNewTeamName(e.target.value)}
                  placeholder="e.g. Sales Outbound Squad A"
                  className="w-full px-3 py-2 bg-[#10141D] border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500/50"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Description</label>
                <textarea
                  rows={2}
                  value={newTeamDesc}
                  onChange={e => setNewTeamDesc(e.target.value)}
                  placeholder="Optional team responsibilities..."
                  className="w-full px-3 py-2 bg-[#10141D] border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500/50 resize-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Designate Team Lead</label>
                <select
                  value={newTeamLeaderId}
                  onChange={e => setNewTeamLeaderId(e.target.value)}
                  className="w-full px-3 py-2 bg-[#10141D] border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500/50 cursor-pointer"
                >
                  <option value="">None (Select later)</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.displayName || u.username} ({u.role})
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateTeamModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingTeam}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {creatingTeam ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  <span>Create Team</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* MODAL: DELETE USER CONFIRMATION                                     */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-fade-in">
          <div
            className="w-full max-w-md bg-[#0B0E14] border border-rose-500/30 rounded-2xl shadow-2xl p-6 space-y-4 text-left"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Delete User</h3>
                <p className="text-xs text-slate-400">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to permanently delete user <strong className="text-white font-mono">{userToDelete.username}</strong>?
              Their assigned leads will become unassigned, and their device sessions will be revoked.
            </p>

            <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteUser}
                disabled={deletingUser}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {deletingUser ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>Permanently Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* MODAL: INVITE USER                                                  */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-fade-in">
          <div
            className="w-full max-w-lg bg-[#0B0E14] border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-4 text-left"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-amber-400" />
                  Invite Teammate to Workspace
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Send an invitation link to provision an employee into this workspace.
                </p>
              </div>
              <button
                onClick={() => setShowInviteModal(false)}
                className="p-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {createdInviteUrl ? (
              <div className="space-y-4 py-2">
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-2 text-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                  <h4 className="text-sm font-bold text-white">Invitation Link Generated!</h4>
                  <p className="text-xs text-slate-300">
                    Share this link with your teammate. When they open it or sign up with their email, they will automatically join your company.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Invitation URL:</label>
                  <div className="flex items-center gap-2">
                    <input
                      id="created-invite-url-input"
                      type="text"
                      readOnly
                      value={createdInviteUrl}
                      className="w-full px-3 py-2 bg-[#10141D] border border-slate-800 rounded-xl text-xs text-amber-300 font-mono focus:outline-none"
                    />
                    <button
                      type="button"
                      id="copy-invite-link-btn"
                      onClick={() => {
                        navigator.clipboard.writeText(createdInviteUrl);
                        setCopiedInvite(true);
                        setTimeout(() => setCopiedInvite(false), 3000);
                      }}
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition-all cursor-pointer shrink-0"
                    >
                      {copiedInvite ? 'Copied!' : 'Copy Link'}
                    </button>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setShowInviteModal(false);
                      setCreatedInviteUrl(null);
                    }}
                    className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSendInvite} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Recipient Work Email *</label>
                  <input
                    id="invite-email-input"
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    placeholder="teammate@company.com"
                    className="w-full px-3 py-2 bg-[#10141D] border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500/50 font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">Target Role *</label>
                    <select
                      id="invite-role-select"
                      value={inviteRole}
                      onChange={e => setInviteRole(e.target.value as any)}
                      className="w-full px-3 py-2 bg-[#10141D] border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500/50 cursor-pointer"
                    >
                      <option value="user">Team Member</option>
                      <option value="team_lead">Team Lead</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">Assign to Team</label>
                    <select
                      id="invite-team-select"
                      value={inviteTeamId}
                      onChange={e => setInviteTeamId(e.target.value)}
                      className="w-full px-3 py-2 bg-[#10141D] border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500/50 cursor-pointer"
                    >
                      <option value="">None (Unassigned)</option>
                      {teams.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Core Module Entitlements */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300">Initial Core Modules:</label>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {[
                      { id: 'crm', label: 'CRM Workspace' },
                      { id: 'octalDialer', label: 'OCTAL Dialer' },
                      { id: 'campaigns', label: 'Campaigns' },
                      { id: 'leads', label: 'Leads Database' },
                      { id: 'reports', label: 'Reports & Analytics' },
                      { id: 'autoEmailer', label: 'Auto Emailer' },
                      { id: 'facebookPoster', label: 'FB Auto Poster' }
                    ].map(mod => (
                      <label key={mod.id} className="flex items-center gap-2 p-2 rounded-lg bg-[#10141D] border border-slate-800/80 cursor-pointer hover:border-slate-700">
                        <input
                          type="checkbox"
                          checked={!!inviteModules[mod.id]}
                          onChange={e => setInviteModules({ ...inviteModules, [mod.id]: e.target.checked })}
                          className="rounded border-slate-700 text-amber-500 focus:ring-0"
                        />
                        <span className="text-slate-300 text-[11px] font-medium">{mod.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400 font-mono">
                    {seatUsage ? `${seatUsage.availableSeats} seats remaining` : ''}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowInviteModal(false)}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      id="submit-invite-btn"
                      disabled={inviting}
                      className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {inviting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                      <span>Generate Invitation</span>
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
