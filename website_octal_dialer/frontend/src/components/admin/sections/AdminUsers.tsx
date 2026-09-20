import React, { useState, useEffect, useMemo } from 'react';
import {
  Trash2, Shield, CheckCircle2, ChevronDown, ChevronRight,
  Search, Filter, AlertCircle, RefreshCw, UserPlus, Edit, CheckSquare, Square
} from 'lucide-react';

interface User {
  id: string;
  username: string;
  role: 'platform_admin' | 'admin' | 'team_lead' | 'agent' | 'user';
  createdAt: string;
  permissions?: {
    id: string;
    userId: string;
    moduleId: string;
    enabled: number;
    grantedBy: string;
    grantedAt: string;
  }[];
}

interface AdminUsersProps {
  isLight?: boolean;
  serverUrl: string;
  authToken: string;
  currentUser?: string;
  currentUserRole?: 'platform_admin' | 'admin' | 'team_lead' | 'agent' | 'user';
}

const MODULES = [
  { id: 'crm', label: 'CRM WORKSPACE', icon: '👥', description: 'Contacts, companies, and relationship intelligence' },
  { id: 'campaigns', label: 'CAMPAIGNS', icon: '📂', description: 'Dialing lists and pipeline campaigns' },
  { id: 'octalDialer', label: 'OCTAL DIALER', icon: '📞', description: 'GSM Auto-dialer & Campaign queue' },
  { id: 'leads', label: 'LEADS DATABASE', icon: '🗄️', description: 'Dedicated contact explorer and imports' },
  { id: 'reports', label: 'REPORTS & ANALYTICS', icon: '📊', description: 'Call analytics, performance charts, and exports' },
  { id: 'googleScraper', label: 'GOOGLE SCRAPER', icon: '🔍', description: 'Google Maps B2B lead extractor' },
  { id: 'autoEmailer', label: 'AUTO EMAILER', icon: '✉️', description: 'SMTP rotation & cold email sequences' },
  { id: 'facebookScraper', label: 'FACEBOOK SCRAPER', icon: '📘', description: 'Facebook group member extractor' },
  { id: 'facebookPoster', label: 'FB AUTO POSTER', icon: '📤', description: 'Facebook group scheduler & poster' }
];

export const AdminUsers: React.FC<AdminUsersProps> = ({
  isLight,
  serverUrl,
  authToken,
  currentUser = '',
  currentUserRole = 'admin'
}) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  const isPlatformMaster = currentUserRole === 'platform_admin';

  // Create User Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'team_lead' | 'agent'>('agent');
  const [selectedModules, setSelectedModules] = useState<Record<string, boolean>>({});
  const [creatingUser, setCreatingUser] = useState(false);

  // Edit User & Permissions Modal State
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editRole, setEditRole] = useState<'admin' | 'team_lead' | 'agent'>('agent');
  const [editPassword, setEditPassword] = useState('');
  const [editModules, setEditModules] = useState<Record<string, boolean>>({});
  const [savingUserEdit, setSavingUserEdit] = useState(false);

  // Delete Confirmation Modal State
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/api/admin/users`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(Array.isArray(data) ? data : []);
      } else {
        const errData = await res.json();
        setError(errData.error || 'Failed to fetch user list');
      }
    } catch (err: any) {
      setError(err.message || 'Connection error while fetching users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [serverUrl, authToken]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowCreateModal(false);
        setEditingUser(null);
        setUserToDelete(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword) {
      setError('Username and password are required.');
      return;
    }
    setCreatingUser(true);
    setError(null);
    try {
      const initialPermissions = Object.keys(selectedModules).filter(k => selectedModules[k]);

      const res = await fetch(`${serverUrl}/api/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          username: newUsername.trim(),
          password: newPassword,
          role: isPlatformMaster ? newRole : (newRole === 'team_lead' ? 'team_lead' : 'agent'),
          initialPermissions
        })
      });

      const data = await res.json();
      if (res.ok) {
        setSuccess(`User "${newUsername.trim()}" created successfully with ${initialPermissions.length} granted module(s)!`);
        setShowCreateModal(false);
        setNewUsername('');
        setNewPassword('');
        setNewRole('agent');
        setSelectedModules({});
        fetchUsers();
        setTimeout(() => setSuccess(null), 4000);
      } else {
        setError(data.error || 'Failed to create user');
      }
    } catch (err: any) {
      setError(err.message || 'Connection error while creating user');
    } finally {
      setCreatingUser(false);
    }
  };

  const handleOpenEdit = (u: User) => {
    setEditingUser(u);
    setEditRole(u.role === 'admin' ? 'admin' : (u.role === 'team_lead' ? 'team_lead' : 'agent'));
    setEditPassword('');
    const modMap: Record<string, boolean> = {};
    MODULES.forEach(m => {
      modMap[m.id] = (u.permissions || []).some(p => p.moduleId === m.id && p.enabled === 1);
    });
    setEditModules(modMap);
  };

  const handleSaveUserEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setSavingUserEdit(true);
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/api/admin/users/${editingUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          role: isPlatformMaster ? editRole : ((editingUser.role === 'admin' || editingUser.role === 'platform_admin') ? undefined : editRole),
          newPassword: editPassword.trim() ? editPassword.trim() : undefined,
          permissions: editModules
        })
      });

      const data = await res.json();
      if (res.ok) {
        setSuccess(`User "${editingUser.username}" and module permissions updated successfully!`);
        setEditingUser(null);
        fetchUsers();
        setTimeout(() => setSuccess(null), 4000);
      } else {
        setError(data.error || 'Failed to update user');
      }
    } catch (err: any) {
      setError(err.message || 'Connection error while updating user');
    } finally {
      setSavingUserEdit(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    setDeletingUser(true);
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/api/admin/users/${userToDelete.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      const data = await res.json();
      if (res.ok) {
        setSuccess(`User "${userToDelete.username}" deleted successfully`);
        setUserToDelete(null);
        fetchUsers();
        setTimeout(() => setSuccess(null), 4000);
      } else {
        setError(data.error || 'Failed to delete user');
      }
    } catch (err: any) {
      setError(err.message || 'Connection error while deleting user');
    } finally {
      setDeletingUser(false);
    }
  };

  const handleTogglePermission = async (userId: string, moduleId: string, currentlyEnabled: boolean) => {
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/api/admin/permissions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          userId,
          moduleId,
          enabled: !currentlyEnabled
        })
      });

      if (res.ok) {
        setUsers(prev => prev.map(u => {
          if (u.id !== userId) return u;
          const currentPerms = u.permissions || [];
          const existing = currentPerms.find(p => p.moduleId === moduleId);
          let newPerms;
          if (existing) {
            newPerms = currentPerms.map(p => p.moduleId === moduleId ? { ...p, enabled: !currentlyEnabled ? 1 : 0 } : p);
          } else {
            newPerms = [...currentPerms, { id: 'p_' + Date.now(), userId, moduleId, enabled: !currentlyEnabled ? 1 : 0, grantedBy: currentUser, grantedAt: new Date().toISOString() }];
          }
          return { ...u, permissions: newPerms };
        }));
      } else {
        const errData = await res.json();
        setError(errData.error || 'Failed to update permission');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to toggle permission');
    }
  };

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const matchSearch = searchQuery === '' || u.username.toLowerCase().includes(searchQuery.toLowerCase());
      const matchRole = roleFilter === 'ALL' || u.role === roleFilter;
      return matchSearch && matchRole;
    });
  }, [users, searchQuery, roleFilter]);

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'platform_admin':
        return isLight ? 'bg-purple-100 border-purple-300 text-purple-800' : 'bg-purple-950/40 border-purple-800 text-purple-400';
      case 'admin':
        return isLight ? 'bg-amber-100 border-amber-300 text-amber-800' : 'bg-amber-950/40 border-amber-800 text-amber-400';
      case 'team_lead':
        return isLight ? 'bg-blue-100 border-blue-300 text-blue-800' : 'bg-blue-950/40 border-blue-800 text-blue-400';
      default:
        return isLight ? 'bg-slate-100 border-slate-300 text-slate-700' : 'bg-[#18181b] border-[#18181b] text-slate-300';
    }
  };

  return (
    <div className="space-y-6 text-left">
      {/* ── Header & Action Controls ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className={`text-xl font-black font-display tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
            Users & Role Permissions
          </h2>
          <p className={`text-xs mt-1 font-medium ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
            Manage organizational team members, role assignments, and granular business module access.
          </p>
        </div>

        <button
          onClick={() => {
            setNewUsername('');
            setNewPassword('');
            setNewRole('agent');
            setSelectedModules({});
            setShowCreateModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold font-display text-xs bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all shadow-md shadow-amber-500/10 cursor-pointer self-start sm:self-auto"
        >
          <UserPlus className="w-4 h-4" />
          <span>Add Team Member</span>
        </button>
      </div>

      {/* Alert Messages */}
      {error && (
        <div className="p-3.5 rounded-2xl border flex items-center justify-between gap-3 text-xs font-mono bg-rose-500/10 border-rose-500/30 text-rose-400">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-white cursor-pointer">×</button>
        </div>
      )}

      {success && (
        <div className="p-3.5 rounded-2xl border flex items-center justify-between gap-3 text-xs font-mono bg-emerald-500/10 border-emerald-500/30 text-emerald-400">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess(null)} className="text-emerald-400 hover:text-white cursor-pointer">×</button>
        </div>
      )}

      {/* ── Search & Filter Bar ── */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search by username or user ID..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className={`w-full pl-9 pr-3 py-2 text-xs rounded-xl border font-mono transition-colors outline-none ${
              isLight ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-amber-500' : 'bg-[#18181b] border-[#18181b] text-white focus:border-amber-500/50'
            }`}
          />
        </div>

        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          <Filter className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <select
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
            className={`text-xs rounded-xl border px-3 py-2 font-mono outline-none cursor-pointer w-full sm:w-auto ${
              isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-[#18181b] border-[#18181b] text-slate-200'
            }`}
          >
            <option value="ALL">All Roles</option>
            <option value="platform_admin">Master Admin</option>
            <option value="admin">Tenant Admin</option>
            <option value="team_lead">Team Lead</option>
            <option value="agent">Employee / Agent</option>
          </select>
        </div>

        <button
          onClick={fetchUsers}
          disabled={loading}
          className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
            isLight ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700' : 'bg-[#18181b] hover:bg-[#27272a] border-[#18181b] text-slate-300'
          }`}
          title="Refresh user list"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-500' : ''}`} />
        </button>
      </div>

      {/* Users Table */}
      {loading && users.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-xs font-mono text-slate-500">
          Loading team members...
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="h-40 border border-dashed rounded-2xl flex flex-col items-center justify-center text-center p-6 text-slate-500 text-xs font-mono border-[#18181b]">
          No team members found matching your search
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#18181b]">
          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead>
              <tr className={`border-b text-[9px] uppercase tracking-wider ${
                isLight ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-[#18181b] text-slate-400 border-[#18181b]'
              }`}>
                <th className="p-3">User</th>
                <th className="p-3">Hierarchy Role</th>
                <th className="p-3">Module Permissions</th>
                <th className="p-3">Created</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isLight ? 'divide-slate-200 text-slate-800' : 'divide-[#18181b] text-slate-300'}`}>
              {filteredUsers.map(u => {
                const isExpanded = expandedUser === u.id;
                const isSelf = u.username === currentUser;
                const createdDate = u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—';
                const activePermsCount = (u.permissions || []).filter(p => p.enabled === 1).length;

                return (
                  <React.Fragment key={u.id}>
                    <tr className={isLight ? 'hover:bg-slate-50' : 'hover:bg-[#121215]'}>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setExpandedUser(isExpanded ? null : u.id)}
                            className="p-1 text-slate-400 hover:text-amber-500 cursor-pointer"
                            title="Toggle module permissions"
                          >
                            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          </button>
                          <div>
                            <span className={`font-bold font-body text-sm ${isLight ? 'text-slate-900' : 'text-white'}`}>
                              {u.username}
                            </span>
                            {isSelf && (
                              <span className="ml-2 text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400">
                                You
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded border text-[10px] font-bold uppercase ${getRoleBadge(u.role)}`}>
                          {u.role === 'platform_admin' ? 'Master Admin' : u.role === 'admin' ? 'Tenant Admin' : u.role === 'team_lead' ? 'Team Lead' : 'Employee'}
                        </span>
                      </td>

                      <td className="p-3">
                        <span className="text-slate-400">
                          {u.role === 'platform_admin' ? (
                            <span className="text-purple-400 font-bold">Platform Superuser</span>
                          ) : u.role === 'admin' ? (
                            <span className="text-amber-400 font-bold">All Tenant Modules</span>
                          ) : (
                            <span className={activePermsCount > 0 ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                              {activePermsCount} of {MODULES.length} active
                            </span>
                          )}
                        </span>
                      </td>

                      <td className="p-3 text-[10px] text-slate-500">{createdDate}</td>

                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {u.role !== 'platform_admin' && (
                            <button
                              onClick={() => handleOpenEdit(u)}
                              className="p-1.5 rounded-lg border border-[#18181b] text-slate-400 hover:text-amber-400 hover:bg-[#27272a] transition cursor-pointer"
                              title="Edit User & Module Permissions"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {!isSelf && u.role !== 'platform_admin' && (
                            <button
                              onClick={() => setUserToDelete(u)}
                              className="p-1.5 rounded-lg border border-[#18181b] text-slate-400 hover:text-red-400 hover:bg-red-950/20 transition cursor-pointer"
                              title="Delete User"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Expanded Module Permissions Row */}
                    {isExpanded && (
                      <tr className={isLight ? 'bg-slate-50/80' : 'bg-[#121215]'}>
                        <td colSpan={5} className="p-4 pl-10 border-t border-[#18181b]">
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                Granular Business Module Permissions for {u.username}
                              </h4>
                              {u.role === 'agent' && (
                                <span className="text-[10px] text-slate-500">
                                  Default is disabled unless explicitly enabled below
                                </span>
                              )}
                            </div>

                            {/* Platform Admin Lock Notice */}
                            <div className={`p-2.5 rounded-xl border flex items-center justify-between text-xs ${
                              isLight ? 'bg-purple-50/60 border-purple-200' : 'bg-purple-950/20 border-purple-900/40'
                            }`}>
                              <div className="flex items-center gap-2">
                                <Shield className="w-4 h-4 text-purple-400" />
                                <div>
                                  <span className="font-bold text-purple-300 text-[11px]">Platform Administrator Authority</span>
                                  <p className="text-[9px] text-slate-500">Master Admin only. Never delegable as a standard module checkbox.</p>
                                </div>
                              </div>
                              <span className="px-2 py-0.5 rounded border text-[9px] font-bold uppercase bg-purple-950/60 text-purple-400 border-purple-800">
                                {u.role === 'platform_admin' ? 'ACTIVE (SUPERUSER)' : 'LOCKED (NON-DELEGABLE)'}
                              </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1">
                              {MODULES.map(m => {
                                const isGranted = (u.permissions || []).some(p => p.moduleId === m.id && p.enabled === 1);
                                const isLockedAdmin = u.role === 'admin' || u.role === 'platform_admin';

                                return (
                                  <div
                                    key={m.id}
                                    className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
                                      isGranted || isLockedAdmin
                                        ? isLight ? 'bg-emerald-50 border-emerald-300' : 'bg-emerald-950/20 border-emerald-900/40'
                                        : isLight ? 'bg-white border-slate-200' : 'bg-[#121215] border-[#27272a]'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className="text-base">{m.icon}</span>
                                      <div>
                                        <div className="text-[11px] font-bold font-display">{m.label}</div>
                                        <div className="text-[9px] text-slate-500 font-sans">{m.description}</div>
                                      </div>
                                    </div>

                                    {isLockedAdmin ? (
                                      <span className="text-[9px] font-bold text-emerald-400 font-mono">ENABLED</span>
                                    ) : (
                                      <button
                                        onClick={() => handleTogglePermission(u.id, m.id, isGranted)}
                                        className={`px-2.5 py-1 rounded text-[9px] font-bold transition cursor-pointer ${
                                          isGranted
                                            ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-600'
                                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                                        }`}
                                      >
                                        {isGranted ? 'ENABLED' : 'DISABLED'}
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modal: Create User ── */}
      {showCreateModal && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setShowCreateModal(false); }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs"
        >
          <div className={`w-full max-w-lg border rounded-2xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto ${
            isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#121215] border-[#18181b] text-white'
          }`}>
            <div className="flex items-center justify-between border-b pb-3 border-[#18181b]">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-amber-500" />
                <h3 className="text-base font-bold font-display">Add Organizational Team Member</h3>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white text-lg cursor-pointer">×</button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4 font-mono text-xs">
              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Username</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. agent_sarah"
                  value={newUsername}
                  onChange={e => setNewUsername(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border outline-none ${
                    isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-[#18181b] border-[#18181b] text-white focus:border-amber-500'
                  }`}
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Password</label>
                <input
                  type="password"
                  required
                  placeholder="Minimum 6 characters"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border outline-none ${
                    isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-[#18181b] border-[#18181b] text-white focus:border-amber-500'
                  }`}
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Account Role</label>
                {isPlatformMaster ? (
                  <select
                    value={newRole}
                    onChange={e => setNewRole(e.target.value as any)}
                    className={`w-full px-3 py-2 rounded-xl border outline-none cursor-pointer ${
                      isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-[#18181b] border-[#18181b] text-white'
                    }`}
                  >
                    <option value="agent">Employee / Agent (Restricted by module permissions)</option>
                    <option value="team_lead">Team Lead (Leads assigned teams)</option>
                    <option value="admin">Tenant Administrator (Full organizational authority)</option>
                  </select>
                ) : (
                  <select
                    value={newRole}
                    onChange={e => setNewRole(e.target.value as any)}
                    className={`w-full px-3 py-2 rounded-xl border outline-none cursor-pointer ${
                      isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-[#18181b] border-[#18181b] text-white'
                    }`}
                  >
                    <option value="agent">Employee / Agent (Restricted by module permissions)</option>
                    <option value="team_lead">Team Lead (Leads assigned teams)</option>
                  </select>
                )}
              </div>

              {/* Initial Module Permissions Checklist */}
              <div className="space-y-2 pt-2 border-t border-[#18181b]">
                <div className="flex items-center justify-between">
                  <label className="block text-[10px] text-slate-400 uppercase font-bold">
                    Initial Permitted Business Modules
                  </label>
                  <span className="text-[10px] text-slate-500">
                    Default: Minimal / None
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {MODULES.map(m => {
                    const isChecked = !!selectedModules[m.id];
                    return (
                      <button
                        type="button"
                        key={m.id}
                        onClick={() => setSelectedModules(prev => ({ ...prev, [m.id]: !prev[m.id] }))}
                        className={`p-2 rounded-xl border flex items-center justify-between text-left transition cursor-pointer ${
                          isChecked
                            ? isLight ? 'bg-amber-50 border-amber-300 text-slate-900' : 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                            : isLight ? 'bg-slate-50 border-slate-200 text-slate-600' : 'bg-[#121215] border-[#18181b] text-slate-400'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span>{m.icon}</span>
                          <span className="text-[11px] font-bold">{m.label}</span>
                        </div>
                        {isChecked ? <CheckSquare className="w-3.5 h-3.5 text-amber-500" /> : <Square className="w-3.5 h-3.5 text-slate-500" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#18181b]">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl border border-[#18181b] text-slate-400 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingUser}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl transition cursor-pointer"
                >
                  {creatingUser ? 'Creating...' : 'Create Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Edit User & Module Permissions ── */}
      {editingUser && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setEditingUser(null); }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs"
        >
          <div className={`w-full max-w-xl border rounded-2xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto ${
            isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#121215] border-[#18181b] text-white'
          }`}>
            <div className="flex items-center justify-between border-b pb-3 border-[#18181b]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Edit className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold font-display">Edit User & Module Access</h3>
                  <p className="text-[10px] text-slate-400 font-mono">User: {editingUser.username}</p>
                </div>
              </div>
              <button onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-white text-lg cursor-pointer">×</button>
            </div>

            <form onSubmit={handleSaveUserEdit} className="space-y-4 font-mono text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Select Role */}
                <div>
                  <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">
                    Assigned Role
                  </label>
                  {isPlatformMaster ? (
                    <select
                      value={editRole}
                      onChange={e => setEditRole(e.target.value as any)}
                      className={`w-full px-3 py-2 rounded-xl border outline-none cursor-pointer ${
                        isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-[#18181b] border-[#18181b] text-white'
                      }`}
                    >
                      <option value="agent">Employee / Agent</option>
                      <option value="team_lead">Team Lead</option>
                      <option value="admin">Tenant Administrator</option>
                    </select>
                  ) : (editingUser.role === 'admin' || editingUser.role === 'platform_admin') ? (
                    <div className={`p-2.5 rounded-xl border text-xs ${
                      isLight ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-[#18181b] border-[#18181b] text-slate-300'
                    }`}>
                      <span className="font-bold">{editingUser.role === 'platform_admin' ? 'Master Admin' : 'Tenant Administrator'}</span> (Protected)
                    </div>
                  ) : (
                    <select
                      value={editRole}
                      onChange={e => setEditRole(e.target.value as any)}
                      className={`w-full px-3 py-2 rounded-xl border outline-none cursor-pointer ${
                        isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-[#18181b] border-[#18181b] text-white'
                      }`}
                    >
                      <option value="agent">Employee / Agent</option>
                      <option value="team_lead">Team Lead</option>
                    </select>
                  )}
                </div>

                {/* Reset / Change Password (Optional) */}
                <div>
                  <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Reset Password <span className="text-slate-500 lowercase">(optional)</span></label>
                  <input
                    type="password"
                    placeholder="Leave blank to keep current"
                    value={editPassword}
                    onChange={e => setEditPassword(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl border outline-none ${
                      isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-[#18181b] border-[#18181b] text-white focus:border-amber-500'
                    }`}
                  />
                </div>
              </div>

              {/* Module & Tool Permissions Section */}
              <div className="pt-2 border-t border-[#18181b]">
                <div className="flex items-center justify-between mb-2.5">
                  <div>
                    <label className="block text-[10px] text-slate-400 uppercase font-bold">Business Modules & Tool Access</label>
                    <span className="text-[10px] text-slate-500">
                      {Object.values(editModules).filter(Boolean).length} of {MODULES.length} modules granted
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const all: Record<string, boolean> = {};
                        MODULES.forEach(m => all[m.id] = true);
                        setEditModules(all);
                      }}
                      className="px-2 py-0.5 rounded border text-[9px] uppercase font-bold border-amber-500/40 text-amber-400 hover:bg-amber-500/10 cursor-pointer"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const none: Record<string, boolean> = {};
                        MODULES.forEach(m => none[m.id] = false);
                        setEditModules(none);
                      }}
                      className="px-2 py-0.5 rounded border text-[9px] uppercase font-bold border-[#27272a] text-slate-400 hover:bg-[#27272a] cursor-pointer"
                    >
                      Deselect All
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                  {MODULES.map(m => {
                    const isChecked = !!editModules[m.id];
                    return (
                      <div
                        key={m.id}
                        onClick={() => setEditModules(prev => ({ ...prev, [m.id]: !prev[m.id] }))}
                        className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer select-none transition-all ${
                          isChecked
                            ? isLight ? 'bg-amber-50 border-amber-300' : 'bg-amber-950/20 border-amber-500/40'
                            : isLight ? 'bg-slate-50 border-slate-200 opacity-60' : 'bg-[#121215] border-[#27272a] opacity-60'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm shrink-0">{m.icon}</span>
                          <div className="min-w-0">
                            <div className="text-[11px] font-bold truncate">{m.label}</div>
                            <div className="text-[9px] text-slate-500 truncate">{m.description}</div>
                          </div>
                        </div>
                        <div className="shrink-0 ml-2">
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-amber-400" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-600" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#18181b]">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 rounded-xl border border-[#18181b] text-slate-400 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingUserEdit}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5"
                >
                  {savingUserEdit ? 'Saving Changes...' : 'Save All Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Delete User Confirmation ── */}
      {userToDelete && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setUserToDelete(null); }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs"
        >
          <div className={`w-full max-w-sm border rounded-2xl p-6 shadow-2xl space-y-4 ${
            isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#121215] border-[#18181b] text-white'
          }`}>
            <div className="flex items-center gap-2 text-red-500">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <h3 className="text-base font-bold font-display">Confirm User Deletion</h3>
            </div>
            <p className="text-xs text-slate-400 font-sans">
              Are you sure you want to permanently delete user <span className="font-bold text-white font-mono">"{userToDelete.username}"</span>? This will revoke all active sessions and module permissions.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#18181b] font-mono text-xs">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                className="px-4 py-2 rounded-xl border border-[#18181b] text-slate-400 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteUser}
                disabled={deletingUser}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition cursor-pointer"
              >
                {deletingUser ? 'Deleting...' : 'Delete User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
