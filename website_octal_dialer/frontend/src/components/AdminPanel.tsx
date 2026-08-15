import React, { useState, useEffect } from 'react';
import { Users, Plus, Trash2, Edit, Shield, CheckCircle2, XCircle, ChevronDown, ChevronRight } from 'lucide-react';

interface User {
  id: string;
  username: string;
  role: 'platform_admin' | 'admin' | 'agent';
  createdAt: string;
  permissions: {
    id: string;
    userId: string;
    moduleId: string;
    enabled: number;
    grantedBy: string;
    grantedAt: string;
  }[];
}

interface AdminPanelProps {
  isLight?: boolean;
  serverUrl: string;
  authToken: string;
  currentUser: string;
  currentUserRole?: 'platform_admin' | 'admin' | 'agent';
}

const MODULES = [
  { id: 'octalDialer', label: 'OCTAL DIALER', icon: '📞' },
  { id: 'googleScraper', label: 'GOOGLE SCRAPER', icon: '🔍' },
  { id: 'autoEmailer', label: 'AUTO EMAILER', icon: '✉️' },
  { id: 'facebookScraper', label: 'FACEBOOK SCRAPER', icon: '📘' },
  { id: 'facebookPoster', label: 'FB AUTO POSTER', icon: '📤' }
];

export const AdminPanel: React.FC<AdminPanelProps> = ({ isLight, serverUrl, authToken, currentUser, currentUserRole }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  // Create user modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'agent'>('agent');

  // Edit user modal state
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editRole, setEditRole] = useState<'admin' | 'agent'>('agent');
  const [editPassword, setEditPassword] = useState('');

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${serverUrl}/admin/users`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      } else {
        const errorData = await res.json();
        setError(errorData.error || 'Failed to fetch users');
      }
    } catch (err) {
      setError('Connection error while fetching users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [serverUrl, authToken]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      const res = await fetch(`${serverUrl}/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          username: newUsername.trim(),
          password: newPassword,
          role: newRole
        })
      });

      const data = await res.json();
      if (res.ok) {
        setSuccess(`User ${newUsername} created successfully!`);
        setShowCreateModal(false);
        setNewUsername('');
        setNewPassword('');
        setNewRole('agent');
        fetchUsers();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(data.error || 'Failed to create user');
      }
    } catch {
      setError('Connection error while creating user');
    }
  };

  const handleDeleteUser = async (userId: string, username: string) => {
    if (!window.confirm(`Delete user "${username}"? This action cannot be undone.`)) return;

    try {
      const res = await fetch(`${serverUrl}/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      const data = await res.json();
      if (res.ok) {
        setSuccess(`User ${username} deleted successfully`);
        fetchUsers();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(data.error || 'Failed to delete user');
      }
    } catch {
      setError('Connection error while deleting user');
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    try {
      const body: any = {};
      if (editRole !== editingUser.role) body.role = editRole;
      if (editPassword.trim()) body.newPassword = editPassword;

      const res = await fetch(`${serverUrl}/admin/users/${editingUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(body)
      });

      const data = await res.json();
      if (res.ok) {
        setSuccess(`User ${editingUser.username} updated successfully`);
        setEditingUser(null);
        setEditPassword('');
        fetchUsers();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(data.error || 'Failed to update user');
      }
    } catch {
      setError('Connection error while updating user');
    }
  };

  const handleTogglePermission = async (userId: string, moduleId: string, currentEnabled: boolean) => {
    try {
      const res = await fetch(`${serverUrl}/admin/permissions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          userId,
          moduleId,
          enabled: !currentEnabled
        })
      });

      if (res.ok) {
        fetchUsers();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to update permission');
      }
    } catch {
      setError('Connection error while updating permission');
    }
  };

  const getPermissionStatus = (user: User, moduleId: string): boolean => {
    const perm = user.permissions.find(p => p.moduleId === moduleId);
    return perm ? perm.enabled === 1 : true; // default to true if no entry
  };

  return (
    <div className={`h-full overflow-y-auto ${isLight ? 'bg-white' : 'bg-slate-900'}`}>
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Shield className={`w-6 h-6 ${isLight ? 'text-amber-600' : 'text-amber-400'}`} />
            <h1 className={`text-2xl font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
              Admin Dashboard
            </h1>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create User
          </button>
        </div>

        {/* Success/Error Messages */}
        {success && (
          <div className="mb-4 bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-3 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
            <span className={isLight ? 'text-green-900' : 'text-green-300'}>{success}</span>
          </div>
        )}
        {error && (
          <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 flex items-center gap-2">
            <XCircle className="w-5 h-5 text-red-500" />
            <span className={isLight ? 'text-red-900' : 'text-red-300'}>{error}</span>
          </div>
        )}

        {/* Users Table */}
        <div className={`rounded-lg border ${isLight ? 'bg-white border-slate-200' : 'bg-slate-800 border-slate-700'}`}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className={`${isLight ? 'bg-slate-50' : 'bg-slate-900'}`}>
                <tr>
                  <th className={`px-4 py-3 text-left text-xs font-bold uppercase ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                    User
                  </th>
                  <th className={`px-4 py-3 text-left text-xs font-bold uppercase ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                    Role
                  </th>
                  <th className={`px-4 py-3 text-left text-xs font-bold uppercase ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                    Module Access
                  </th>
                  <th className={`px-4 py-3 text-right text-xs font-bold uppercase ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                      Loading users...
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                      No users found
                    </td>
                  </tr>
                ) : (
                  users.map(user => (
                    <React.Fragment key={user.id}>
                      <tr className={`border-t ${isLight ? 'border-slate-200' : 'border-slate-700'}`}>
                        <td className={`px-4 py-4 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4 text-slate-400" />
                            <span className="font-medium">{user.username}</span>
                            {user.username === currentUser && (
                              <span className="text-xs bg-amber-500/20 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded">
                                You
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
                            Created {new Date(user.createdAt).toLocaleDateString()}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          {user.role === 'platform_admin' ? (
                            <span className="inline-flex items-center gap-1 bg-amber-500/20 text-amber-500 font-black px-2 py-1 rounded text-xs">
                              👑 PLATFORM ADMIN
                            </span>
                          ) : user.role === 'admin' ? (
                            <span className="inline-flex items-center gap-1 bg-purple-500/20 text-purple-600 dark:text-purple-400 px-2 py-1 rounded text-xs font-bold">
                              <Shield className="w-3 h-3" />
                              TENANT ADMIN
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 bg-blue-500/20 text-blue-600 dark:text-blue-400 px-2 py-1 rounded text-xs font-bold">
                              AGENT
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          {user.role === 'platform_admin' || user.role === 'admin' ? (
                            <span className="text-xs text-slate-500">Full Access ({user.role === 'platform_admin' ? 'Platform Admin' : 'Tenant Admin'})</span>
                          ) : (
                            <>
                              <button
                                onClick={() => setExpandedUser(expandedUser === user.id ? null : user.id)}
                                className="flex items-center gap-1 text-xs text-slate-500 hover:text-amber-500 transition-colors"
                              >
                                {expandedUser === user.id ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                {user.permissions.filter(p => p.enabled === 1).length}/{MODULES.length} modules enabled
                              </button>
                            </>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center justify-end gap-2">
                            {user.role === 'platform_admin' && currentUserRole !== 'platform_admin' ? (
                              <span className="text-[10px] font-mono text-slate-500 italic">Protected</span>
                            ) : (
                              <>
                                <button
                                  onClick={() => {
                                    setEditingUser(user);
                                    setEditRole(user.role === 'platform_admin' ? 'admin' : user.role);
                                    setEditPassword('');
                                  }}
                                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
                                  title="Edit user"
                                >
                                  <Edit className="w-4 h-4 text-slate-400 hover:text-blue-500" />
                                </button>
                                {user.username !== currentUser && (
                                  <button
                                    onClick={() => handleDeleteUser(user.id, user.username)}
                                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
                                    title="Delete user"
                                  >
                                    <Trash2 className="w-4 h-4 text-slate-400 hover:text-red-500" />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                      {/* Expanded module permissions row */}
                      {expandedUser === user.id && user.role === 'agent' && (
                        <tr className={`border-t ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-700 bg-slate-800'}`}>
                          <td colSpan={4} className="px-4 py-3">
                            <div className="flex flex-wrap gap-2 pl-6">
                              {MODULES.map(module => {
                                const enabled = getPermissionStatus(user, module.id);
                                return (
                                  <button
                                    key={module.id}
                                    onClick={() => handleTogglePermission(user.id, module.id, enabled)}
                                    className={`text-xs px-3 py-1.5 rounded transition-colors font-medium ${
                                      enabled
                                        ? 'bg-green-500/20 text-green-600 dark:text-green-400 hover:bg-green-500/30'
                                        : 'bg-red-500/20 text-red-600 dark:text-red-400 hover:bg-red-500/30'
                                    }`}
                                    title={`${module.label}: ${enabled ? 'Enabled' : 'Disabled'}`}
                                  >
                                    {module.icon} {module.label.split(' ')[0]} {enabled ? '✓' : '✗'}
                                  </button>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Create User Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className={`w-full max-w-md rounded-lg ${isLight ? 'bg-white' : 'bg-slate-800'} p-6`}>
              <h2 className={`text-xl font-bold mb-4 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                Create New User
              </h2>
              <form onSubmit={handleCreateUser} className="space-y-4">
                <div>
                  <label className={`block text-sm font-medium mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                    Username
                  </label>
                  <input
                    type="text"
                    value={newUsername}
                    onChange={e => setNewUsername(e.target.value)}
                    required
                    className={`w-full px-3 py-2 rounded border ${
                      isLight
                        ? 'bg-white border-slate-300 text-slate-900'
                        : 'bg-slate-900 border-slate-600 text-white'
                    }`}
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                    Password (min 6 characters)
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                    className={`w-full px-3 py-2 rounded border ${
                      isLight
                        ? 'bg-white border-slate-300 text-slate-900'
                        : 'bg-slate-900 border-slate-600 text-white'
                    }`}
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                    Role
                  </label>
                  <select
                    value={newRole}
                    onChange={e => setNewRole(e.target.value as 'admin' | 'agent')}
                    className={`w-full px-3 py-2 rounded border ${
                      isLight
                        ? 'bg-white border-slate-300 text-slate-900'
                        : 'bg-slate-900 border-slate-600 text-white'
                    }`}
                  >
                    <option value="agent">Agent</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateModal(false);
                      setNewUsername('');
                      setNewPassword('');
                      setNewRole('agent');
                    }}
                    className={`px-4 py-2 rounded ${
                      isLight
                        ? 'bg-slate-200 hover:bg-slate-300 text-slate-900'
                        : 'bg-slate-700 hover:bg-slate-600 text-white'
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded"
                  >
                    Create User
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit User Modal */}
        {editingUser && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className={`w-full max-w-md rounded-lg ${isLight ? 'bg-white' : 'bg-slate-800'} p-6`}>
              <h2 className={`text-xl font-bold mb-4 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                Edit User: {editingUser.username}
              </h2>
              <form onSubmit={handleUpdateUser} className="space-y-4">
                <div>
                  <label className={`block text-sm font-medium mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                    Role
                  </label>
                  <select
                    value={editRole}
                    onChange={e => setEditRole(e.target.value as 'admin' | 'agent')}
                    className={`w-full px-3 py-2 rounded border ${
                      isLight
                        ? 'bg-white border-slate-300 text-slate-900'
                        : 'bg-slate-900 border-slate-600 text-white'
                    }`}
                  >
                    <option value="agent">Agent</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                    New Password (leave blank to keep current)
                  </label>
                  <input
                    type="password"
                    value={editPassword}
                    onChange={e => setEditPassword(e.target.value)}
                    minLength={6}
                    className={`w-full px-3 py-2 rounded border ${
                      isLight
                        ? 'bg-white border-slate-300 text-slate-900'
                        : 'bg-slate-900 border-slate-600 text-white'
                    }`}
                  />
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingUser(null);
                      setEditPassword('');
                    }}
                    className={`px-4 py-2 rounded ${
                      isLight
                        ? 'bg-slate-200 hover:bg-slate-300 text-slate-900'
                        : 'bg-slate-700 hover:bg-slate-600 text-white'
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded"
                  >
                    Update User
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
