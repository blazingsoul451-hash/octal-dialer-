import React, { useState, useEffect } from 'react';
import {
  X, UserPlus, Users, AlertCircle, Eye, EyeOff
} from 'lucide-react';

interface QuickAddUserModalProps {
  isOpen: boolean;
  isLight?: boolean;
  serverUrl: string;
  authToken: string;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onNavigateSettings?: () => void;
}

export const QuickAddUserModal: React.FC<QuickAddUserModalProps> = ({
  isOpen,
  isLight,
  serverUrl,
  authToken,
  onClose,
  onSuccess,
  onNavigateSettings
}) => {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'agent' | 'team_lead'>('agent');
  const [teamId, setTeamId] = useState('');
  const [teams, setTeams] = useState<Array<{ id: string; name: string }>>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && authToken) {
      setError(null);
      fetch(`${serverUrl}/api/admin/teams`, {
        headers: { Authorization: `Bearer ${authToken}` }
      })
        .then(res => res.ok ? res.json() : [])
        .then(data => setTeams(Array.isArray(data) ? data : []))
        .catch(() => setTeams([]));
    }
  }, [isOpen, serverUrl, authToken]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Username and password are required.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/api/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({
          username: username.trim(),
          displayName: displayName.trim() || username.trim(),
          email: email.trim() || undefined,
          password: password.trim(),
          role,
          modules: { crm: true, dialer: true, auto_emailer: true }
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create user');

      if (teamId && data.user?.id) {
        await fetch(`${serverUrl}/api/admin/teams/${teamId}/members`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`
          },
          body: JSON.stringify({
            userId: data.user.id,
            roleInTeam: role === 'team_lead' ? 'leader' : 'member'
          })
        }).catch(() => {});
      }

      onSuccess(`User "${username}" created successfully.`);
      setUsername('');
      setDisplayName('');
      setEmail('');
      setPassword('');
      setTeamId('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className={`w-full max-w-md rounded-2xl border shadow-2xl p-6 space-y-5 text-left transition-colors ${
        isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#0B0E14] border-slate-800 text-slate-100'
      }`}>
        <div className="flex items-center justify-between border-b pb-4 border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold font-display">Add User / Agent</h3>
              <p className={`text-xs ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Quickly add an employee to your organization</p>
            </div>
          </div>
          <button onClick={onClose} className={`p-1 rounded-lg transition-colors cursor-pointer ${isLight ? 'hover:bg-slate-100 text-slate-500 hover:text-slate-800' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}`}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className={`block font-semibold mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Username *</label>
            <input
              type="text"
              required
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="e.g. john_agent"
              className={`w-full px-3.5 py-2.5 rounded-xl border outline-none font-mono ${
                isLight ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-amber-500' : 'bg-[#10141D] border-slate-800 text-white focus:border-amber-500'
              }`}
            />
          </div>

          <div>
            <label className={`block font-semibold mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Full / Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="e.g. John Doe"
              className={`w-full px-3.5 py-2.5 rounded-xl border outline-none ${
                isLight ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-amber-500' : 'bg-[#10141D] border-slate-800 text-white focus:border-amber-500'
              }`}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={`block font-semibold mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Email Address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="john@company.com"
                className={`w-full px-3.5 py-2.5 rounded-xl border outline-none ${
                  isLight ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-amber-500' : 'bg-[#10141D] border-slate-800 text-white focus:border-amber-500'
                }`}
              />
            </div>
            <div>
              <label className={`block font-semibold mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Assigned Role</label>
              <select
                value={role}
                onChange={e => setRole(e.target.value as any)}
                className={`w-full px-3.5 py-2.5 rounded-xl border outline-none ${
                  isLight ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-amber-500' : 'bg-[#10141D] border-slate-800 text-white focus:border-amber-500'
                }`}
              >
                <option value="agent">Agent (Dialer & Leads)</option>
                <option value="team_lead">Team Lead (Team Supervisor)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={`block font-semibold mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Temporary Password *</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  className={`w-full pl-3.5 pr-9 py-2.5 rounded-xl border outline-none ${
                    isLight ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-amber-500' : 'bg-[#10141D] border-slate-800 text-white focus:border-amber-500'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(p => !p)}
                  className={`absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer ${isLight ? 'text-slate-500 hover:text-slate-800' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className={`block font-semibold mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Assign to Team</label>
              <select
                value={teamId}
                onChange={e => setTeamId(e.target.value)}
                className={`w-full px-3.5 py-2.5 rounded-xl border outline-none ${
                  isLight ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-amber-500' : 'bg-[#10141D] border-slate-800 text-white focus:border-amber-500'
                }`}
              >
                <option value="">No team yet (Unassigned)</option>
                {teams.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
            {onNavigateSettings && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onNavigateSettings();
                }}
                className="text-amber-500 hover:underline cursor-pointer font-semibold"
              >
                Full User Management &rarr;
              </button>
            )}
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className={`px-4 py-2 rounded-xl cursor-pointer ${isLight ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-slate-200'}`}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold transition disabled:opacity-50 cursor-pointer shadow-md shadow-amber-500/20"
              >
                {loading ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

interface QuickAssignTeamModalProps {
  isOpen: boolean;
  isLight?: boolean;
  serverUrl: string;
  authToken: string;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onNavigateSettings?: () => void;
}

export const QuickAssignTeamModal: React.FC<QuickAssignTeamModalProps> = ({
  isOpen,
  isLight,
  serverUrl,
  authToken,
  onClose,
  onSuccess,
  onNavigateSettings
}) => {
  const [teamName, setTeamName] = useState('');
  const [teamDesc, setTeamDesc] = useState('');
  const [leaderId, setLeaderId] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [users, setUsers] = useState<Array<{ id: string; username: string; displayName?: string; role: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && authToken) {
      setError(null);
      fetch(`${serverUrl}/api/admin/users`, {
        headers: { Authorization: `Bearer ${authToken}` }
      })
        .then(res => res.ok ? res.json() : [])
        .then(data => setUsers(Array.isArray(data) ? data : []))
        .catch(() => setUsers([]));
    }
  }, [isOpen, serverUrl, authToken]);

  if (!isOpen) return null;

  const toggleMember = (id: string) => {
    setSelectedMemberIds(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName.trim()) {
      setError('Team name is required.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // 1. Create Team
      const res = await fetch(`${serverUrl}/api/admin/teams`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({
          name: teamName.trim(),
          description: teamDesc.trim() || undefined,
          leaderId: leaderId || undefined
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create team');

      const createdTeamId = data.team?.id || data.id;

      // 2. Assign Team Lead if selected
      if (leaderId && createdTeamId) {
        await fetch(`${serverUrl}/api/admin/teams/${createdTeamId}/members`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`
          },
          body: JSON.stringify({ userId: leaderId, roleInTeam: 'leader' })
        }).catch(() => {});

        // Promote role to team_lead if not already admin
        const target = users.find(u => u.id === leaderId);
        if (target && target.role !== 'admin' && target.role !== 'platform_admin') {
          await fetch(`${serverUrl}/api/admin/users/${leaderId}/role`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${authToken}`
            },
            body: JSON.stringify({ role: 'team_lead' })
          }).catch(() => {});
        }
      }

      // 3. Assign member users under this team lead
      if (createdTeamId && selectedMemberIds.length > 0) {
        for (const memberId of selectedMemberIds) {
          if (memberId === leaderId) continue;
          await fetch(`${serverUrl}/api/admin/teams/${createdTeamId}/members`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${authToken}`
            },
            body: JSON.stringify({ userId: memberId, roleInTeam: 'member' })
          }).catch(() => {});
        }
      }

      onSuccess(`Team "${teamName}" created with assigned members.`);
      setTeamName('');
      setTeamDesc('');
      setLeaderId('');
      setSelectedMemberIds([]);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create team');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className={`w-full max-w-lg rounded-2xl border shadow-2xl p-6 space-y-5 text-left max-h-[90vh] overflow-y-auto transition-colors ${
        isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#0B0E14] border-slate-800 text-slate-100'
      }`}>
        <div className="flex items-center justify-between border-b pb-4 border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold font-display">Create Team Lead & Assign Users</h3>
              <p className={`text-xs ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Group agents under a designated team lead</p>
            </div>
          </div>
          <button onClick={onClose} className={`p-1 rounded-lg transition-colors cursor-pointer ${isLight ? 'hover:bg-slate-100 text-slate-500 hover:text-slate-800' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}`}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className={`block font-semibold mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Team Name *</label>
            <input
              type="text"
              required
              value={teamName}
              onChange={e => setTeamName(e.target.value)}
              placeholder="e.g. Outbound Sales Alpha"
              className={`w-full px-3.5 py-2.5 rounded-xl border outline-none font-semibold ${
                isLight ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-amber-500' : 'bg-[#10141D] border-slate-800 text-white focus:border-amber-500'
              }`}
            />
          </div>

          <div>
            <label className={`block font-semibold mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Designate Team Lead</label>
            <select
              value={leaderId}
              onChange={e => setLeaderId(e.target.value)}
              className={`w-full px-3.5 py-2.5 rounded-xl border outline-none ${
                isLight ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-amber-500' : 'bg-[#10141D] border-slate-800 text-white focus:border-amber-500'
              }`}
            >
              <option value="">Select a user to lead this team</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {u.displayName || u.username} ({u.role})
                </option>
              ))}
            </select>
            <p className={`text-[10px] mt-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              The selected member will be designated as Team Lead and given supervisor access over this team.
            </p>
          </div>

          <div>
            <label className={`block font-semibold mb-1.5 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
              Assign Users & Agents Under This Lead ({selectedMemberIds.length} selected)
            </label>
            <div className={`max-h-44 overflow-y-auto rounded-xl border p-2 divide-y ${
              isLight ? 'bg-slate-50 border-slate-300 divide-slate-200' : 'bg-[#10141D] border-slate-800 divide-slate-800/60'
            }`}>
              {users.length === 0 ? (
                <div className={`p-4 text-center ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>No users found.</div>
              ) : (
                users.map(u => {
                  const isChecked = selectedMemberIds.includes(u.id);
                  const isLeader = leaderId === u.id;
                  return (
                    <div
                      key={u.id}
                      onClick={() => !isLeader && toggleMember(u.id)}
                      className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition ${
                        isLeader ? 'opacity-60 bg-blue-500/10' : isChecked ? 'bg-amber-500/10' : isLight ? 'hover:bg-slate-200/70' : 'hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={isChecked || isLeader}
                          disabled={isLeader}
                          onChange={() => {}}
                          className="rounded text-amber-500"
                        />
                        <div className="truncate">
                          <span className={`font-semibold ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>{u.displayName || u.username}</span>
                          <span className={`text-[10px] ml-1.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>({u.role})</span>
                        </div>
                      </div>
                      {isLeader && (
                        <span className="text-[10px] font-bold text-blue-500 px-2 py-0.5 rounded-full bg-blue-500/20">
                          Team Lead
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
            {onNavigateSettings && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onNavigateSettings();
                }}
                className="text-amber-500 hover:underline cursor-pointer font-semibold"
              >
                Advanced Settings &rarr;
              </button>
            )}
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className={`px-4 py-2 rounded-xl cursor-pointer ${isLight ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-slate-200'}`}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold transition disabled:opacity-50 cursor-pointer shadow-md shadow-amber-500/20"
              >
                {loading ? 'Saving...' : 'Create & Assign'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
