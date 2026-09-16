import React, { useState, useEffect, useMemo } from 'react';
import {
  Users, Plus, Trash2, Shield, CheckCircle2, XCircle, ChevronDown,
  Search, AlertCircle, RefreshCw, Key, Lock, Eye, EyeOff, ArrowRight
} from 'lucide-react';

export interface UserRecord {
  id: string;
  username: string;
  displayName?: string;
  phone?: string;
  email?: string;
  role: 'platform_admin' | 'admin' | 'agent' | string;
  status: 'Active' | 'Suspended' | string;
  ipRestrictions?: string;
  createdAt: string;
  updatedAt?: string;
  tenantId?: string;
  roleId?: string;
  roleName?: string;
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
  currentUserRole?: 'platform_admin' | 'admin' | 'agent';
  onNavigateToRoles?: () => void;
  onNavigateBackToSettings?: () => void;
}

export const AdminUsers: React.FC<AdminUsersProps> = ({
  isLight,
  serverUrl,
  authToken,
  currentUser = '',
  currentUserRole = 'admin',
  onNavigateToRoles,
  onNavigateBackToSettings
}) => {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [availableRoles, setAvailableRoles] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // View Mode: 'list' | 'add' | 'edit'
  const [viewMode, setViewMode] = useState<'list' | 'add' | 'edit'>('list');

  // Search & Filters for List View
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'Active' | 'Suspended'>('ALL');
  const [entriesPerPage, setEntriesPerPage] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

  // Form State for Add / Edit
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formMobile, setFormMobile] = useState('');
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formType, setFormType] = useState('Admin');
  const [formRole, setFormRole] = useState('Administrator');
  const [formRoleId, setFormRoleId] = useState('');
  const [formIpRestrictions, setFormIpRestrictions] = useState('');
  const [formActive, setFormActive] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedUserForEdit, setSelectedUserForEdit] = useState<UserRecord | null>(null);

  // Delete modal state
  const [userToDelete, setUserToDelete] = useState<UserRecord | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);

  const isPlatformMaster = currentUserRole === 'platform_admin';

  // ─── Fetch Roles & Users ───────────────────────────────────────────────────
  const fetchRoles = async () => {
    try {
      const res = await fetch(`${serverUrl}/api/admin/roles`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        const rawList = Array.isArray(data) ? data : (data.roles || []);
        const formatted = rawList.map((r: any) => ({
          id: String(r.id),
          name: r.roleName || r.name || 'Unnamed Role'
        }));
        setAvailableRoles(formatted);
      }
    } catch (err) {
      console.error('Failed to load roles in users screen:', err);
    }
  };

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
        const errData = await res.json().catch(() => ({}));
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
    fetchRoles();
  }, [serverUrl, authToken]);

  // Close open dropdowns when clicking outside
  useEffect(() => {
    const handleWindowClick = () => setOpenDropdownId(null);
    window.addEventListener('click', handleWindowClick);
    return () => window.removeEventListener('click', handleWindowClick);
  }, []);

  // ─── Open Add User ───────────────────────────────────────────────────────────
  const handleOpenAdd = () => {
    setSelectedUserForEdit(null);
    setFirstName('');
    setLastName('');
    setFormEmail('');
    setFormMobile('');
    setFormUsername('');
    setFormPassword('');
    setFormType('Admin');
    const defaultRole = availableRoles.find(r => r.name.toLowerCase().includes('admin')) || availableRoles[0];
    setFormRole(defaultRole ? defaultRole.name : 'Administrator');
    setFormRoleId(defaultRole ? defaultRole.id : '');
    setFormIpRestrictions('');
    setFormActive(true);
    setShowPassword(false);
    setError(null);
    setSuccess(null);
    setViewMode('add');
  };

  // ─── Open Edit User ──────────────────────────────────────────────────────────
  const handleOpenEdit = (u: UserRecord) => {
    setSelectedUserForEdit(u);
    const parts = (u.displayName || u.username || '').split(' ');
    setFirstName(parts[0] || '');
    setLastName(parts.slice(1).join(' ') || '');
    setFormEmail(u.email || '');
    setFormMobile(u.phone || '');
    setFormUsername(u.username || '');
    setFormPassword('');
    setFormType(u.role === 'admin' || u.role === 'platform_admin' ? 'Admin' : 'Agent');
    const matchedRole = availableRoles.find(r => r.id === u.roleId || r.name.toLowerCase() === (u.roleName || '').toLowerCase());
    setFormRole(matchedRole ? matchedRole.name : (u.roleName || 'Administrator'));
    setFormRoleId(matchedRole ? matchedRole.id : (u.roleId || ''));
    setFormIpRestrictions(u.ipRestrictions || '');
    setFormActive(u.status !== 'Suspended');
    setShowPassword(false);
    setError(null);
    setSuccess(null);
    setViewMode('edit');
    setOpenDropdownId(null);
  };

  // ─── Submit Add or Edit ──────────────────────────────────────────────────────
  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (viewMode === 'add') {
      if (!formUsername.trim()) {
        setError('Username is required.');
        return;
      }
      if (!formPassword || formPassword.length < 4) {
        setError('Password must be at least 4 characters.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const payloadRole = formRole.toLowerCase().includes('admin')
        ? 'admin'
        : formRole.toLowerCase().includes('supervisor')
        ? 'supervisor'
        : 'agent';

      if (viewMode === 'add') {
        const res = await fetch(`${serverUrl}/api/admin/users`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify({
            username: formUsername.trim(),
            password: formPassword,
            email: formEmail.trim() || undefined,
            phone: formMobile.trim() || undefined,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            role: payloadRole,
            roleId: formRoleId || undefined,
            status: formActive ? 'Active' : 'Suspended',
            ipRestrictions: formIpRestrictions.trim() || undefined
          })
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to create user');
        }

        setSuccess(`User "${formUsername}" created successfully.`);
        setViewMode('list');
        fetchUsers();
      } else if (viewMode === 'edit' && selectedUserForEdit) {
        const res = await fetch(`${serverUrl}/api/admin/users/${selectedUserForEdit.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify({
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: formEmail.trim() || undefined,
            phone: formMobile.trim() || undefined,
            role: payloadRole,
            roleId: formRoleId || undefined,
            status: formActive ? 'Active' : 'Suspended',
            ipRestrictions: formIpRestrictions.trim() || undefined,
            newPassword: formPassword && formPassword.length >= 4 ? formPassword : undefined
          })
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to update user');
        }

        setSuccess(`User "${selectedUserForEdit.username}" updated successfully.`);
        setViewMode('list');
        fetchUsers();
      }
    } catch (err: any) {
      setError(err.message || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Delete User ─────────────────────────────────────────────────────────────
  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    setDeletingUser(true);
    try {
      const res = await fetch(`${serverUrl}/api/admin/users/${userToDelete.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        setSuccess(`User "${userToDelete.username}" deleted.`);
        setUserToDelete(null);
        fetchUsers();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to delete user');
      }
    } catch (err: any) {
      setError(err.message || 'Error deleting user');
    } finally {
      setDeletingUser(false);
    }
  };

  // ─── Filtered Users ──────────────────────────────────────────────────────────
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      if (statusFilter !== 'ALL') {
        const isSuspended = u.status === 'Suspended';
        if (statusFilter === 'Active' && isSuspended) return false;
        if (statusFilter === 'Suspended' && !isSuspended) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = (u.displayName || '').toLowerCase().includes(q);
        const matchesUser = (u.username || '').toLowerCase().includes(q);
        const matchesEmail = (u.email || '').toLowerCase().includes(q);
        const matchesPhone = (u.phone || '').toLowerCase().includes(q);
        if (!matchesName && !matchesUser && !matchesEmail && !matchesPhone) return false;
      }
      return true;
    });
  }, [users, statusFilter, searchQuery]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / entriesPerPage));
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * entriesPerPage;
    return filteredUsers.slice(start, start + entriesPerPage);
  }, [filteredUsers, currentPage, entriesPerPage]);

  // ─── Breadcrumb Component ────────────────────────────────────────────────────
  const renderBreadcrumb = () => (
    <div className="flex items-center gap-2 text-xs font-mono text-slate-500 mb-2">
      <button
        onClick={onNavigateBackToSettings}
        className="hover:text-amber-500 transition-colors uppercase font-bold cursor-pointer"
      >
        Settings
      </button>
      <span>/</span>
      <button
        onClick={() => setViewMode('list')}
        className={`hover:text-amber-500 transition-colors font-bold cursor-pointer ${
          viewMode === 'list' ? 'text-amber-500' : ''
        }`}
      >
        Users
      </button>
      {viewMode === 'add' && (
        <>
          <span>/</span>
          <span className="text-amber-500 font-bold">Add User</span>
        </>
      )}
      {viewMode === 'edit' && (
        <>
          <span>/</span>
          <span className="text-amber-500 font-bold">Edit User</span>
        </>
      )}
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // VIEW: ADD / EDIT USER FORM (Panel 3)
  // ─────────────────────────────────────────────────────────────────────────────
  if (viewMode === 'add' || viewMode === 'edit') {
    return (
      <div className="space-y-6 text-left select-none animate-fadeIn">
        {/* Breadcrumb */}
        {renderBreadcrumb()}

        {/* Header */}
        <div>
          <h1 className={`text-2xl font-black font-display tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
            {viewMode === 'add' ? 'Add User' : 'Edit User'}
          </h1>
          <p className={`text-xs mt-1 font-medium ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>
            {viewMode === 'add' ? 'Create a new user account' : `Updating account for ${selectedUserForEdit?.username}`}
          </p>
        </div>

        {/* Alerts */}
        {error && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-mono flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Form Card */}
        <div className={`p-8 rounded-2xl border shadow-sm transition-colors ${
          isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
        }`}>
          <form onSubmit={handleSaveUser} className="space-y-6">
            
            {/* Row 1: First Name & Last Name */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className={`block text-xs font-bold mb-2 ${isLight ? 'text-slate-800' : 'text-zinc-300'}`}>
                  First Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  placeholder="Enter first name"
                  className={`w-full px-4 py-2.5 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/50 ${
                    isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-[#121215] border-[#27272a] text-white'
                  }`}
                />
              </div>

              <div>
                <label className={`block text-xs font-bold mb-2 ${isLight ? 'text-slate-800' : 'text-zinc-300'}`}>
                  Last Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  placeholder="Enter last name"
                  className={`w-full px-4 py-2.5 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/50 ${
                    isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-[#121215] border-[#27272a] text-white'
                  }`}
                />
              </div>
            </div>

            {/* Row 2: Email & Mobile Number */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className={`block text-xs font-bold mb-2 ${isLight ? 'text-slate-800' : 'text-zinc-300'}`}>
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={formEmail}
                  onChange={e => setFormEmail(e.target.value)}
                  placeholder="Enter email address"
                  className={`w-full px-4 py-2.5 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/50 ${
                    isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-[#121215] border-[#27272a] text-white'
                  }`}
                />
              </div>

              <div>
                <label className={`block text-xs font-bold mb-2 ${isLight ? 'text-slate-800' : 'text-zinc-300'}`}>
                  Mobile Number
                </label>
                <input
                  type="text"
                  value={formMobile}
                  onChange={e => setFormMobile(e.target.value)}
                  placeholder="Enter mobile number"
                  className={`w-full px-4 py-2.5 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/50 ${
                    isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-[#121215] border-[#27272a] text-white'
                  }`}
                />
              </div>
            </div>

            {/* Row 3: Username & Password */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className={`block text-xs font-bold mb-2 ${isLight ? 'text-slate-800' : 'text-zinc-300'}`}>
                  Username <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  disabled={viewMode === 'edit'}
                  value={formUsername}
                  onChange={e => setFormUsername(e.target.value)}
                  placeholder="Enter username"
                  className={`w-full px-4 py-2.5 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/50 ${
                    viewMode === 'edit'
                      ? (isLight ? 'bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed' : 'bg-zinc-900 text-zinc-500 border-zinc-800 cursor-not-allowed')
                      : (isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-[#121215] border-[#27272a] text-white')
                  }`}
                />
              </div>

              <div>
                <label className={`block text-xs font-bold mb-2 ${isLight ? 'text-slate-800' : 'text-zinc-300'}`}>
                  Password {viewMode === 'add' && <span className="text-red-500">*</span>}
                  {viewMode === 'edit' && <span className="text-[10px] font-normal text-slate-400 ml-1">(Leave blank to keep unchanged)</span>}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required={viewMode === 'add'}
                    value={formPassword}
                    onChange={e => setFormPassword(e.target.value)}
                    placeholder={viewMode === 'add' ? 'Enter password' : 'Enter new password'}
                    className={`w-full px-4 py-2.5 pr-10 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/50 ${
                      isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-[#121215] border-[#27272a] text-white'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Row 4: Type & Role */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className={`block text-xs font-bold mb-2 ${isLight ? 'text-slate-800' : 'text-zinc-300'}`}>
                  Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={formType}
                  onChange={e => setFormType(e.target.value)}
                  className={`w-full px-4 py-2.5 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/50 cursor-pointer ${
                    isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-[#121215] border-[#27272a] text-white'
                  }`}
                >
                  <option value="Admin">Admin</option>
                  <option value="Agent">Agent</option>
                  <option value="Supervisor">Supervisor</option>
                  <option value="Auditor">Auditor</option>
                </select>
              </div>

              <div>
                <label className={`block text-xs font-bold mb-2 ${isLight ? 'text-slate-800' : 'text-zinc-300'}`}>
                  Role <span className="text-red-500">*</span>
                </label>
                <select
                  value={formRoleId || ''}
                  onChange={e => {
                    const rId = e.target.value;
                    setFormRoleId(rId);
                    const matched = availableRoles.find(r => r.id === rId);
                    if (matched) {
                      setFormRole(matched.name);
                      if (matched.name.toLowerCase().includes('admin')) setFormType('Admin');
                      else if (matched.name.toLowerCase().includes('supervisor')) setFormType('Supervisor');
                      else setFormType('Agent');
                    }
                  }}
                  className={`w-full px-4 py-2.5 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/50 cursor-pointer ${
                    isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-[#121215] border-[#27272a] text-white'
                  }`}
                >
                  {availableRoles.length > 0 ? (
                    availableRoles.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))
                  ) : (
                    <>
                      <option value="1">Administrator</option>
                      <option value="2">Supervisor</option>
                      <option value="3">Agent</option>
                      <option value="4">Auditor</option>
                    </>
                  )}
                </select>
              </div>
            </div>

            {/* Row 5: Restrict via IP & Active Checkbox */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
              <div>
                <label className={`block text-xs font-bold mb-2 ${isLight ? 'text-slate-800' : 'text-zinc-300'}`}>
                  Restrict via IP Address (Comma separated)
                </label>
                <input
                  type="text"
                  value={formIpRestrictions}
                  onChange={e => setFormIpRestrictions(e.target.value)}
                  placeholder="e.g. 192.168.1.1, 10.0.0.1"
                  className={`w-full px-4 py-2.5 rounded-xl border text-sm font-mono transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/50 ${
                    isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-[#121215] border-[#27272a] text-white'
                  }`}
                />
              </div>

              <div className="pt-6">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formActive}
                    onChange={e => setFormActive(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 focus:ring-2"
                  />
                  <span className={`text-sm font-bold ${isLight ? 'text-slate-800' : 'text-zinc-200'}`}>
                    Active
                  </span>
                </label>
              </div>
            </div>

            {/* Bottom Actions Bar */}
            <div className="flex items-center justify-between pt-6 border-t border-slate-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`px-6 py-2.5 rounded-full font-bold text-xs transition-colors cursor-pointer ${
                  isLight ? 'bg-slate-200 hover:bg-slate-300 text-slate-800' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                }`}
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={submitting}
                className="px-8 py-2.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
              >
                {submitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Save and Close</span>
              </button>
            </div>

          </form>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // VIEW: USERS MANAGEMENT TABLE (Panel 2)
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 text-left select-none animate-fadeIn">
      {/* Breadcrumb */}
      {renderBreadcrumb()}

      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-black font-display tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
            Users
          </h1>
          <p className={`text-xs mt-1 font-medium ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>
            Manage all users in your organization
          </p>
        </div>

        {/* Top Right Buttons & Search Bar */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Quick Search */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search users..."
              className={`pl-9 pr-4 py-2 rounded-xl border text-xs transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/50 ${
                isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-[#121215] border-[#27272a] text-white'
              }`}
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
            className={`px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer transition-colors ${
              isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-[#121215] border-[#27272a] text-white'
            }`}
          >
            <option value="ALL">All Status</option>
            <option value="Active">Active</option>
            <option value="Suspended">Suspended</option>
          </select>

          {/* Solid Green + Add New */}
          <button
            onClick={handleOpenAdd}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Add New</span>
          </button>

          {/* Outline Manage Roles */}
          <button
            onClick={onNavigateToRoles}
            className={`px-4 py-2 rounded-xl border font-bold text-xs transition-all cursor-pointer flex items-center gap-1.5 ${
              isLight
                ? 'bg-white border-slate-300 text-slate-800 hover:bg-slate-100'
                : 'bg-[#121215] border-[#27272a] text-zinc-300 hover:bg-zinc-800'
            }`}
          >
            <Shield className="w-4 h-4 text-emerald-500" />
            <span>Manage Roles</span>
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-mono flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* ── Main Table Card ── */}
      <div className={`p-6 rounded-2xl border shadow-sm transition-colors ${
        isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
      }`}>
        
        {/* Table Top Controls: Entries & Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 text-xs font-medium">
          <div className="flex items-center gap-2">
            <span className={isLight ? 'text-slate-600' : 'text-zinc-400'}>Show</span>
            <select
              value={entriesPerPage}
              onChange={e => {
                setEntriesPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className={`px-2 py-1 rounded-lg border cursor-pointer ${
                isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-[#121215] border-[#27272a] text-white'
              }`}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span className={isLight ? 'text-slate-600' : 'text-zinc-400'}>entries</span>
          </div>

          <div className="flex items-center gap-2">
            <span className={isLight ? 'text-slate-600' : 'text-zinc-400'}>Search:</span>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className={`px-3 py-1 rounded-lg border text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
                isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-[#121215] border-[#27272a] text-white'
              }`}
            />
          </div>
        </div>

        {/* The Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className={`border-b ${isLight ? 'border-slate-200 text-slate-700 bg-slate-50/50' : 'border-[#18181b] text-zinc-400 bg-zinc-900/30'}`}>
                <th className="py-3 px-3 font-bold">#</th>
                <th className="py-3 px-3 font-bold">Name</th>
                <th className="py-3 px-3 font-bold">Phone</th>
                <th className="py-3 px-3 font-bold">Email</th>
                <th className="py-3 px-3 font-bold">Type</th>
                <th className="py-3 px-3 font-bold">Role</th>
                <th className="py-3 px-3 font-bold">Status</th>
                <th className="py-3 px-3 font-bold text-right">Action</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isLight ? 'divide-slate-200' : 'divide-[#18181b]'}`}>
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                    <span>Loading users...</span>
                  </td>
                </tr>
              ) : paginatedUsers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No users found.
                  </td>
                </tr>
              ) : (
                paginatedUsers.map((u, idx) => {
                  const indexNum = (currentPage - 1) * entriesPerPage + idx + 1;
                  const isSuspended = u.status === 'Suspended';
                  const roleLabel = u.roleName || (u.role === 'platform_admin' ? 'Administrator' : u.role === 'admin' ? 'Administrator' : 'Agent');
                  const typeLabel = u.role === 'platform_admin' || u.role === 'admin' ? 'Admin' : 'Agent';

                  return (
                    <tr
                      key={u.id}
                      className={`transition-colors ${
                        isLight ? 'hover:bg-slate-50' : 'hover:bg-zinc-900/40'
                      }`}
                    >
                      <td className="py-3.5 px-3 font-mono text-slate-400 font-bold">{indexNum}</td>
                      <td className="py-3.5 px-3 font-bold">
                        <span className={isLight ? 'text-slate-900' : 'text-white'}>
                          {u.displayName || u.username}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 font-mono text-slate-500">
                        {u.phone || '—'}
                      </td>
                      <td className="py-3.5 px-3 font-mono text-slate-500">
                        {u.email || '—'}
                      </td>
                      <td className="py-3.5 px-3">
                        <span className={`font-semibold ${isLight ? 'text-slate-800' : 'text-zinc-300'}`}>
                          {typeLabel}
                        </span>
                      </td>
                      <td className="py-3.5 px-3">
                        <span className={`font-semibold ${isLight ? 'text-slate-800' : 'text-zinc-300'}`}>
                          {roleLabel}
                        </span>
                      </td>
                      <td className="py-3.5 px-3">
                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                          isSuspended
                            ? 'bg-red-500/10 text-red-500 border-red-500/20'
                            : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                        }`}>
                          {isSuspended ? 'Suspended' : 'Active'}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-right relative">
                        <div className="inline-block text-left">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenDropdownId(openDropdownId === u.id ? null : u.id);
                            }}
                            className={`px-3 py-1 rounded-lg border text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 ${
                              isLight
                                ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                                : 'bg-[#121215] border-[#27272a] text-zinc-300 hover:bg-zinc-800'
                            }`}
                          >
                            <span>Edit</span>
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>

                          {/* Action Dropdown Menu */}
                          {openDropdownId === u.id && (
                            <div
                              onClick={e => e.stopPropagation()}
                              className={`absolute right-3 mt-1.5 w-40 rounded-xl shadow-xl border py-1.5 z-20 ${
                                isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#121215] border-[#27272a] text-white'
                              }`}
                            >
                              <button
                                onClick={() => handleOpenEdit(u)}
                                className={`w-full text-left px-3.5 py-1.5 text-xs font-semibold transition-colors flex items-center gap-2 cursor-pointer ${
                                  isLight ? 'hover:bg-slate-100' : 'hover:bg-zinc-800'
                                }`}
                              >
                                <span>Edit Profile</span>
                              </button>
                              
                              <button
                                onClick={() => {
                                  setUserToDelete(u);
                                  setOpenDropdownId(null);
                                }}
                                disabled={u.username === currentUser || u.role === 'platform_admin'}
                                className={`w-full text-left px-3.5 py-1.5 text-xs font-semibold text-red-500 transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                                  isLight ? 'hover:bg-red-50' : 'hover:bg-red-950/20'
                                }`}
                              >
                                <span>Delete User</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer: Entries count & Pagination */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-6 pt-4 border-t border-slate-200 dark:border-zinc-800 text-xs text-slate-500">
          <div>
            Showing {filteredUsers.length === 0 ? 0 : (currentPage - 1) * entriesPerPage + 1} to {Math.min(currentPage * entriesPerPage, filteredUsers.length)} of {filteredUsers.length} entries
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-2.5 py-1 rounded-lg border text-xs font-bold disabled:opacity-30 cursor-pointer"
            >
              &lt;
            </button>
            <span className="w-7 h-7 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-xs">
              {currentPage}
            </span>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-2.5 py-1 rounded-lg border text-xs font-bold disabled:opacity-30 cursor-pointer"
            >
              &gt;
            </button>
          </div>
        </div>

      </div>

      {/* ── Delete Confirmation Modal ── */}
      {userToDelete && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className={`p-6 rounded-2xl border max-w-md w-full shadow-2xl space-y-4 ${
            isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#121215] border-[#27272a] text-white'
          }`}>
            <h3 className="text-base font-bold">Delete User</h3>
            <p className="text-xs text-slate-400">
              Are you sure you want to permanently delete user <strong className="text-white font-mono">{userToDelete.username}</strong>? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3 pt-3">
              <button
                onClick={() => setUserToDelete(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-zinc-800 text-zinc-300 hover:bg-zinc-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteUser}
                disabled={deletingUser}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-500 text-white cursor-pointer"
              >
                {deletingUser ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
