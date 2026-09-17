import React, { useState, useEffect, useMemo } from 'react';
import {
  Users, UserCheck, Plus, Search, Edit2, Trash2, ArrowLeft,
  CheckCircle2, XCircle, AlertCircle, RefreshCw, Layers, Shield,
  ChevronRight, Phone, Mail, FolderKanban, Check, X
} from 'lucide-react';

export interface TeamMember {
  userId: string;
  username: string;
  displayName?: string;
  email?: string;
  role?: string;
  roleInTeam: 'leader' | 'member';
  joinedAt: string;
}

export interface TeamCampaign {
  id: string;
  name: string;
  status: string;
  leadCount?: number;
  assignedAt: string;
}

export interface TeamRecord {
  id: string;
  name: string;
  description: string;
  leaderId?: string | null;
  leaderName?: string | null;
  status: 'active' | 'inactive';
  tenantId: string;
  createdAt: string;
  updatedAt: string;
  memberCount?: number;
  campaignCount?: number;
  members?: TeamMember[];
  campaigns?: TeamCampaign[];
}

export interface SimpleUser {
  id: string;
  username: string;
  displayName?: string;
  email?: string;
  role?: string;
  status?: string;
}

export interface SimpleCampaign {
  id: string;
  name: string;
  status?: string;
  leadCount?: number;
}

interface AdminTeamsProps {
  isLight?: boolean;
  serverUrl: string;
  authToken: string;
  currentUser?: string;
  currentUserRole?: string;
  onNavigateUsers?: () => void;
  onBackToSettings?: () => void;
}

export const AdminTeams: React.FC<AdminTeamsProps> = ({
  isLight,
  serverUrl,
  authToken,
  currentUser = '',
  currentUserRole = 'admin',
  onNavigateUsers,
  onBackToSettings
}) => {
  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [users, setUsers] = useState<SimpleUser[]>([]);
  const [campaigns, setCampaigns] = useState<SimpleCampaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // View state: 'list' | 'create' | 'edit'
  const [viewMode, setViewMode] = useState<'list' | 'create' | 'edit'>('list');
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'active' | 'inactive'>('ALL');
  const [entriesPerPage, setEntriesPerPage] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Form State
  const [teamName, setTeamName] = useState('');
  const [teamDescription, setTeamDescription] = useState('');
  const [teamLeaderId, setTeamLeaderId] = useState<string>('');
  const [teamStatus, setTeamStatus] = useState<'active' | 'inactive'>('active');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>([]);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [campaignSearchQuery, setCampaignSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);

  // Fetch all initial data
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      };

      // 1. Fetch Teams
      const teamsRes = await fetch(`${serverUrl}/api/admin/teams`, { headers });
      if (!teamsRes.ok) {
        throw new Error(`Failed to load teams (HTTP ${teamsRes.status})`);
      }
      const teamsData = await teamsRes.json();
      setTeams(Array.isArray(teamsData) ? teamsData : []);

      // 2. Fetch Users
      const usersRes = await fetch(`${serverUrl}/api/admin/users`, { headers });
      if (usersRes.ok) {
        const usersData = await usersRes.json();
        setUsers(Array.isArray(usersData) ? usersData : []);
      }

      // 3. Fetch Campaigns
      const campRes = await fetch(`${serverUrl}/api/campaigns`, { headers });
      if (campRes.ok) {
        const campData = await campRes.json();
        setCampaigns(Array.isArray(campData) ? campData : []);
      }
    } catch (err: any) {
      console.error('Error loading teams data:', err);
      setError(err.message || 'Error communicating with server');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [serverUrl, authToken]);

  const resetForm = () => {
    setTeamName('');
    setTeamDescription('');
    setTeamLeaderId('');
    setTeamStatus('active');
    setSelectedMemberIds([]);
    setSelectedCampaignIds([]);
    setMemberSearchQuery('');
    setCampaignSearchQuery('');
    setEditingTeamId(null);
    setError(null);
  };

  const handleOpenCreate = () => {
    resetForm();
    setViewMode('create');
  };

  const handleOpenEdit = (team: TeamRecord) => {
    setEditingTeamId(team.id);
    setTeamName(team.name);
    setTeamDescription(team.description || '');
    setTeamLeaderId(team.leaderId || '');
    setTeamStatus(team.status || 'active');

    const memberIds = team.members ? team.members.map(m => m.userId) : [];
    setSelectedMemberIds(memberIds);

    const campIds = team.campaigns ? team.campaigns.map(c => c.id) : [];
    setSelectedCampaignIds(campIds);

    setMemberSearchQuery('');
    setCampaignSearchQuery('');
    setError(null);
    setViewMode('edit');
  };

  const handleSaveTeam = async () => {
    if (!teamName.trim()) {
      setError('Team name is required.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const payload = {
        name: teamName.trim(),
        description: teamDescription.trim(),
        leaderId: teamLeaderId || null,
        status: teamStatus,
        memberIds: selectedMemberIds,
        campaignIds: selectedCampaignIds
      };

      const url = editingTeamId
        ? `${serverUrl}/api/admin/teams/${editingTeamId}`
        : `${serverUrl}/api/admin/teams`;

      const method = editingTeamId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}: Failed to save team`);
      }

      setSuccess(editingTeamId ? 'Team updated successfully!' : 'Team created successfully!');
      setTimeout(() => setSuccess(null), 3500);
      setViewMode('list');
      await fetchData();
    } catch (err: any) {
      console.error('Error saving team:', err);
      setError(err.message || 'Failed to save team');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTeam = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete the team "${name}"?\nAll team member assignments and campaign mappings will be removed.`)) {
      return;
    }

    try {
      const res = await fetch(`${serverUrl}/api/admin/teams/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete team');
      }

      setSuccess(`Team "${name}" deleted successfully.`);
      setTimeout(() => setSuccess(null), 3500);
      await fetchData();
    } catch (err: any) {
      alert(err.message || 'Error deleting team');
    }
  };

  const toggleMemberSelection = (userId: string) => {
    setSelectedMemberIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const toggleCampaignSelection = (campaignId: string) => {
    setSelectedCampaignIds(prev =>
      prev.includes(campaignId) ? prev.filter(id => id !== campaignId) : [...prev, campaignId]
    );
  };

  // Filtered Teams for Table View
  const filteredTeams = useMemo(() => {
    return teams.filter(t => {
      const matchesSearch =
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.description && t.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (t.leaderName && t.leaderName.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesStatus =
        statusFilter === 'ALL' || t.status.toLowerCase() === statusFilter.toLowerCase();

      return matchesSearch && matchesStatus;
    });
  }, [teams, searchQuery, statusFilter]);

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(filteredTeams.length / entriesPerPage));
  const displayedTeams = filteredTeams.slice(
    (currentPage - 1) * entriesPerPage,
    currentPage * entriesPerPage
  );

  // Filtered Users for Form Multi-select
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const q = memberSearchQuery.toLowerCase();
      const name = (u.displayName || u.username || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [users, memberSearchQuery]);

  // Filtered Campaigns for Form Multi-select
  const filteredCampaigns = useMemo(() => {
    return campaigns.filter(c => {
      const q = campaignSearchQuery.toLowerCase();
      return c.name.toLowerCase().includes(q);
    });
  }, [campaigns, campaignSearchQuery]);

  return (
    <div className="space-y-6 text-left select-none animate-fadeIn">
      {/* Alert Banners */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-mono flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="hover:opacity-70">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess(null)} className="hover:opacity-70">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          VIEW 1: CREATE / EDIT TEAM FORM
         ══════════════════════════════════════════════════════════════════════ */}
      {viewMode === 'create' || viewMode === 'edit' ? (
        <div className="space-y-6">
          {/* Breadcrumbs */}
          <div className="flex items-center gap-2 text-xs font-mono text-slate-500">
            <span className="text-zinc-500 font-bold uppercase">WORKSPACE</span>
            <span>/</span>
            {onBackToSettings && (
              <>
                <button
                  onClick={onBackToSettings}
                  className="hover:text-amber-500 transition-colors uppercase font-bold cursor-pointer"
                >
                  Settings
                </button>
                <span>/</span>
              </>
            )}
            <button
              onClick={() => setViewMode('list')}
              className="hover:text-amber-500 transition-colors font-bold cursor-pointer"
            >
              Teams
            </button>
            <span>/</span>
            <span className="text-amber-500 font-bold">
              {viewMode === 'edit' ? 'Edit Team' : 'Create Team'}
            </span>
          </div>

          {/* Form Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                  isLight
                    ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                    : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-zinc-300'
                }`}
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <h1 className={`text-xl font-bold font-display tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  {viewMode === 'edit' ? 'Edit Team & Scoping' : 'Create New Team'}
                </h1>
                <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>
                  Define team leadership, assign member agents, and bind campaign visibility scopes
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`px-4 py-2 rounded-xl text-xs font-bold font-mono border transition-all cursor-pointer ${
                  isLight
                    ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                    : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-zinc-300'
                }`}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveTeam}
                className="px-6 py-2 rounded-xl text-xs font-bold font-mono transition-all bg-[#00A651] hover:bg-[#008f45] text-white shadow-md cursor-pointer disabled:opacity-50 flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Save Team</span>
                )}
              </button>
            </div>
          </div>

          {/* Form Content Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left Card: Team Core Details */}
            <div className={`lg:col-span-1 p-6 rounded-2xl border shadow-sm space-y-5 ${
              isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
            }`}>
              <div className="flex items-center gap-2.5 pb-3 border-b border-zinc-200 dark:border-zinc-800">
                <Shield className="w-4 h-4 text-amber-500" />
                <h2 className={`text-sm font-black font-display uppercase tracking-wider ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  Team Profile
                </h2>
              </div>

              <div>
                <label className="block text-xs font-mono font-bold mb-1.5 text-zinc-400">
                  Team Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Outbound Sales Alpha"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-xs font-sans outline-none transition-all ${
                    isLight
                      ? 'bg-white border-slate-300 text-slate-900 focus:border-emerald-500'
                      : 'bg-zinc-900 border-zinc-800 text-white focus:border-emerald-500'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-bold mb-1.5 text-zinc-400">
                  Description
                </label>
                <textarea
                  rows={3}
                  placeholder="Operational responsibilities and dialer campaign scope..."
                  value={teamDescription}
                  onChange={(e) => setTeamDescription(e.target.value)}
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-xs font-sans outline-none transition-all resize-none ${
                    isLight
                      ? 'bg-white border-slate-300 text-slate-900 focus:border-emerald-500'
                      : 'bg-zinc-900 border-zinc-800 text-white focus:border-emerald-500'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-bold mb-1.5 text-zinc-400">
                  Team Leader
                </label>
                <select
                  value={teamLeaderId}
                  onChange={(e) => {
                    const lid = e.target.value;
                    setTeamLeaderId(lid);
                    if (lid && !selectedMemberIds.includes(lid)) {
                      setSelectedMemberIds(prev => [...prev, lid]);
                    }
                  }}
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-xs font-sans outline-none transition-all cursor-pointer ${
                    isLight
                      ? 'bg-white border-slate-300 text-slate-900 focus:border-emerald-500'
                      : 'bg-zinc-900 border-zinc-800 text-white focus:border-emerald-500'
                  }`}
                >
                  <option value="">-- No Leader Assigned --</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.displayName || u.username} ({u.role || 'user'})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-zinc-500 mt-1 font-mono">
                  Team leaders can oversee queues and listen to team recordings.
                </p>
              </div>

              <div>
                <label className="block text-xs font-mono font-bold mb-1.5 text-zinc-400">
                  Status
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTeamStatus('active')}
                    className={`py-2 px-3 rounded-xl text-xs font-mono font-bold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      teamStatus === 'active'
                        ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                        : isLight
                          ? 'bg-slate-100 border-slate-200 text-slate-500'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-500'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Active</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTeamStatus('inactive')}
                    className={`py-2 px-3 rounded-xl text-xs font-mono font-bold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      teamStatus === 'inactive'
                        ? 'bg-zinc-500/10 border-zinc-500/40 text-zinc-400'
                        : isLight
                          ? 'bg-slate-100 border-slate-200 text-slate-500'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-500'
                    }`}
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Inactive</span>
                  </button>
                </div>
              </div>

              {/* Summary Counts */}
              <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 space-y-2 text-xs font-mono">
                <div className="flex justify-between items-center text-zinc-400">
                  <span>Assigned Agents:</span>
                  <span className="font-bold text-amber-500">{selectedMemberIds.length}</span>
                </div>
                <div className="flex justify-between items-center text-zinc-400">
                  <span>Scoped Campaigns:</span>
                  <span className="font-bold text-amber-500">{selectedCampaignIds.length}</span>
                </div>
              </div>
            </div>

            {/* Middle Card: Team Members Selection */}
            <div className={`lg:col-span-1 p-6 rounded-2xl border shadow-sm space-y-4 flex flex-col ${
              isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
            }`}>
              <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center gap-2.5">
                  <Users className="w-4 h-4 text-blue-500" />
                  <h2 className={`text-sm font-black font-display uppercase tracking-wider ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    Team Members
                  </h2>
                </div>
                <span className="text-xs font-mono font-bold text-blue-400 bg-blue-500/10 px-2.5 py-0.5 rounded-full border border-blue-500/20">
                  {selectedMemberIds.length} selected
                </span>
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Filter users..."
                  value={memberSearchQuery}
                  onChange={(e) => setMemberSearchQuery(e.target.value)}
                  className={`w-full pl-8 pr-3 py-2 rounded-xl border text-xs font-sans outline-none ${
                    isLight
                      ? 'bg-slate-50 border-slate-200 text-slate-900'
                      : 'bg-zinc-900/80 border-zinc-800 text-white'
                  }`}
                />
              </div>

              <div className="flex-1 overflow-y-auto max-h-[380px] space-y-1.5 pr-1">
                {filteredUsers.length === 0 ? (
                  <p className="text-xs text-zinc-500 text-center py-6">No users found</p>
                ) : (
                  filteredUsers.map(u => {
                    const isSelected = selectedMemberIds.includes(u.id);
                    const isLead = u.id === teamLeaderId;
                    return (
                      <div
                        key={u.id}
                        onClick={() => toggleMemberSelection(u.id)}
                        className={`p-2.5 rounded-xl border text-xs transition-all cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? 'bg-amber-500/10 border-amber-500/40 text-white'
                            : isLight
                              ? 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                              : 'bg-zinc-900/40 hover:bg-zinc-900 border-zinc-800/80 text-zinc-400'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-[10px] shrink-0 ${
                            isSelected ? 'bg-amber-500 text-black' : 'bg-zinc-800 text-zinc-400'
                          }`}>
                            {(u.displayName || u.username || '?').charAt(0).toUpperCase()}
                          </div>
                          <div className="truncate">
                            <div className="font-bold flex items-center gap-1.5">
                              <span className={isSelected ? 'text-amber-400' : ''}>{u.displayName || u.username}</span>
                              {isLead && (
                                <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-400 font-mono font-bold border border-blue-500/30">
                                  Lead
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-zinc-500 font-mono truncate">{u.email || u.username}</div>
                          </div>
                        </div>

                        <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                          isSelected ? 'bg-amber-500 border-amber-500 text-black' : 'border-zinc-700'
                        }`}>
                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right Card: Scoped Campaigns Selection */}
            <div className={`lg:col-span-1 p-6 rounded-2xl border shadow-sm space-y-4 flex flex-col ${
              isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
            }`}>
              <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center gap-2.5">
                  <FolderKanban className="w-4 h-4 text-purple-500" />
                  <h2 className={`text-sm font-black font-display uppercase tracking-wider ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    Assigned Campaigns
                  </h2>
                </div>
                <span className="text-xs font-mono font-bold text-purple-400 bg-purple-500/10 px-2.5 py-0.5 rounded-full border border-purple-500/20">
                  {selectedCampaignIds.length} scoped
                </span>
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Filter campaigns..."
                  value={campaignSearchQuery}
                  onChange={(e) => setCampaignSearchQuery(e.target.value)}
                  className={`w-full pl-8 pr-3 py-2 rounded-xl border text-xs font-sans outline-none ${
                    isLight
                      ? 'bg-slate-50 border-slate-200 text-slate-900'
                      : 'bg-zinc-900/80 border-zinc-800 text-white'
                  }`}
                />
              </div>

              <div className="flex-1 overflow-y-auto max-h-[380px] space-y-1.5 pr-1">
                {filteredCampaigns.length === 0 ? (
                  <p className="text-xs text-zinc-500 text-center py-6">No campaigns found</p>
                ) : (
                  filteredCampaigns.map(c => {
                    const isSelected = selectedCampaignIds.includes(c.id);
                    return (
                      <div
                        key={c.id}
                        onClick={() => toggleCampaignSelection(c.id)}
                        className={`p-2.5 rounded-xl border text-xs transition-all cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? 'bg-purple-500/10 border-purple-500/40 text-white'
                            : isLight
                              ? 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                              : 'bg-zinc-900/40 hover:bg-zinc-900 border-zinc-800/80 text-zinc-400'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-[10px] shrink-0 ${
                            isSelected ? 'bg-purple-500 text-white' : 'bg-zinc-800 text-zinc-400'
                          }`}>
                            <Layers className="w-3 h-3" />
                          </div>
                          <div className="truncate">
                            <div className={`font-bold ${isSelected ? 'text-purple-300' : ''}`}>{c.name}</div>
                            <div className="text-[10px] text-zinc-500 font-mono">
                              {c.leadCount !== undefined ? `${c.leadCount} leads` : 'Active Queue'}
                            </div>
                          </div>
                        </div>

                        <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                          isSelected ? 'bg-purple-500 border-purple-500 text-white' : 'border-zinc-700'
                        }`}>
                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

          </div>
        </div>
      ) : (
        /* ══════════════════════════════════════════════════════════════════════
            VIEW 2: TEAMS DIRECTORY LIST
           ══════════════════════════════════════════════════════════════════════ */
        <div className="space-y-6">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-xs font-mono text-slate-500">
            <span className="text-zinc-500 font-bold uppercase">WORKSPACE</span>
            <span>/</span>
            {onBackToSettings && (
              <>
                <button
                  onClick={onBackToSettings}
                  className="hover:text-amber-500 transition-colors uppercase font-bold cursor-pointer"
                >
                  Settings
                </button>
                <span>/</span>
              </>
            )}
            <span className="text-zinc-400 font-bold">Users & Access</span>
            <span>/</span>
            <span className="text-amber-500 font-bold">Teams</span>
          </div>

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-zinc-200 dark:border-zinc-800">
            <div>
              <h1 className={`text-2xl font-black font-display tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                Teams & Scoping
              </h1>
              <p className={`text-xs mt-1 font-medium ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>
                Organize agents into operational squads and enforce campaign dialer scoping boundaries
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleOpenCreate}
                className="px-5 py-2 rounded-xl text-xs font-bold font-mono transition-all bg-[#00A651] hover:bg-[#008f45] text-white shadow-md flex items-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Create New Team</span>
              </button>

              {onNavigateUsers && (
                <button
                  type="button"
                  onClick={onNavigateUsers}
                  className={`px-4 py-2 rounded-xl text-xs font-bold font-mono border transition-all cursor-pointer flex items-center gap-2 ${
                    isLight
                      ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
                      : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-zinc-300'
                  }`}
                >
                  <Users className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Manage Users</span>
                </button>
              )}
            </div>
          </div>

          {/* Search and Filters Bar */}
          <div className={`p-4 rounded-2xl border shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4 ${
            isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
          }`}>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 absolute left-3.5 top-3 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Search teams or leaders..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className={`w-full pl-9 pr-3.5 py-2 rounded-xl border text-xs font-sans outline-none transition-all ${
                    isLight
                      ? 'bg-slate-50 border-slate-200 text-slate-900 focus:border-amber-500'
                      : 'bg-zinc-900/80 border-zinc-800 text-white focus:border-amber-500'
                  }`}
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as any);
                  setCurrentPage(1);
                }}
                className={`px-3 py-2 rounded-xl border text-xs font-mono font-bold outline-none cursor-pointer ${
                  isLight
                    ? 'bg-slate-50 border-slate-200 text-slate-700'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-300'
                }`}
              >
                <option value="ALL">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            <div className="flex items-center gap-2 text-xs font-mono text-zinc-400 self-end sm:self-auto">
              <span>Show</span>
              <select
                value={entriesPerPage}
                onChange={(e) => {
                  setEntriesPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono font-bold outline-none cursor-pointer ${
                  isLight
                    ? 'bg-slate-50 border-slate-200 text-slate-700'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-300'
                }`}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
              <span>entries</span>
            </div>
          </div>

          {/* Teams Table */}
          <div className={`rounded-2xl border shadow-sm overflow-hidden ${
            isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
          }`}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className={`border-b font-mono uppercase text-[11px] font-bold ${
                    isLight ? 'bg-slate-50/80 border-slate-200 text-slate-500' : 'bg-zinc-950/60 border-zinc-800 text-zinc-400'
                  }`}>
                    <th className="py-3.5 px-4 w-12 text-center">#</th>
                    <th className="py-3.5 px-4">Team Name</th>
                    <th className="py-3.5 px-4">Team Lead</th>
                    <th className="py-3.5 px-4 text-center">Members</th>
                    <th className="py-3.5 px-4 text-center">Campaign Scope</th>
                    <th className="py-3.5 px-4 text-center">Status</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/80">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-zinc-500">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 opacity-50" />
                        <span>Loading team directory...</span>
                      </td>
                    </tr>
                  ) : displayedTeams.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-zinc-500 font-mono">
                        No teams found. Click "Create New Team" to establish your first squad.
                      </td>
                    </tr>
                  ) : (
                    displayedTeams.map((team, idx) => {
                      const rowNum = (currentPage - 1) * entriesPerPage + idx + 1;
                      const leader = users.find(u => u.id === team.leaderId);
                      const leaderDisplayName = leader?.displayName || leader?.username || team.leaderName || 'Unassigned';

                      return (
                        <tr
                          key={team.id}
                          className={`transition-colors ${
                            isLight ? 'hover:bg-slate-50/80' : 'hover:bg-zinc-900/40'
                          }`}
                        >
                          <td className="py-4 px-4 text-center font-mono text-zinc-500">{rowNum}</td>

                          {/* Team Name & Description */}
                          <td className="py-4 px-4">
                            <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                              <span>{team.name}</span>
                            </div>
                            {team.description && (
                              <p className="text-[11px] text-zinc-500 mt-0.5 line-clamp-1 max-w-xs">
                                {team.description}
                              </p>
                            )}
                          </td>

                          {/* Team Lead */}
                          <td className="py-4 px-4">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center font-bold text-xs text-blue-400">
                                {leaderDisplayName.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-bold text-slate-800 dark:text-zinc-200">
                                  {leaderDisplayName}
                                </div>
                                {leader?.email && (
                                  <div className="text-[10px] text-zinc-500 font-mono truncate max-w-[150px]">
                                    {leader.email}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Members Count Badge */}
                          <td className="py-4 px-4 text-center">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                              <Users className="w-3 h-3" />
                              <span>{team.memberCount ?? (team.members?.length ?? 0)} Agents</span>
                            </span>
                          </td>

                          {/* Campaign Scope Count Badge */}
                          <td className="py-4 px-4 text-center">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                              <FolderKanban className="w-3 h-3" />
                              <span>{team.campaignCount ?? (team.campaigns?.length ?? 0)} Campaigns</span>
                            </span>
                          </td>

                          {/* Status */}
                          <td className="py-4 px-4 text-center">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border uppercase ${
                              team.status === 'active'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                            }`}>
                              {team.status === 'active' ? (
                                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                              ) : (
                                <XCircle className="w-3 h-3 text-zinc-500" />
                              )}
                              <span>{team.status}</span>
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="py-4 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                title="Edit Team"
                                onClick={() => handleOpenEdit(team)}
                                className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                                  isLight
                                    ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                                    : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-300'
                                }`}
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                title="Delete Team"
                                onClick={() => handleDeleteTeam(team.id, team.name)}
                                className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                                  isLight
                                    ? 'bg-red-50 hover:bg-red-100 border-red-200 text-red-600'
                                    : 'bg-red-500/10 hover:bg-red-500/20 border-red-500/30 text-red-400'
                                }`}
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

            {/* Pagination footer */}
            <div className={`p-4 border-t flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-xs text-zinc-400 ${
              isLight ? 'border-slate-200 bg-slate-50/50' : 'border-[#18181b] bg-zinc-950/40'
            }`}>
              <div>
                Showing {filteredTeams.length === 0 ? 0 : (currentPage - 1) * entriesPerPage + 1} to{' '}
                {Math.min(currentPage * entriesPerPage, filteredTeams.length)} of {filteredTeams.length} entries
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className={`px-3 py-1 rounded-lg border transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                    isLight
                      ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  Previous
                </button>
                <span>
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  className={`px-3 py-1 rounded-lg border transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                    isLight
                      ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
