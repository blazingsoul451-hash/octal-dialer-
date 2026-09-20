import React, { useState, useEffect } from 'react';
import { Users, Shield, Target, Settings, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';

interface TeamLeadDashboardProps {
  serverUrl: string;
  authToken: string | null;
  onSelectCampaign?: (campaignId: string) => void;
}

export const TeamLeadDashboard: React.FC<TeamLeadDashboardProps> = ({
  serverUrl,
  authToken,
  onSelectCampaign
}) => {
  const [teams, setTeams] = useState<any[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [policySuccess, setPolicySuccess] = useState<string | null>(null);

  const fetchTeams = async () => {
    if (!authToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/api/teams/my-teams`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      if (!res.ok) throw new Error(`Failed to load teams: ${res.statusText}`);
      const data = await res.json();
      setTeams(data);
      if (data.length > 0 && !selectedTeamId) {
        setSelectedTeamId(data[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load team data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeams();
  }, [authToken, serverUrl]);

  const currentTeam = teams.find((t) => t.id === selectedTeamId) || teams[0];

  const handleUpdatePolicy = async (newPolicy: string) => {
    if (!currentTeam || !authToken) return;
    setSavingPolicy(true);
    setPolicySuccess(null);
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/api/teams/${currentTeam.id}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({ leadVisibility: newPolicy })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update visibility policy');
      setPolicySuccess(`Visibility policy set to ${newPolicy}`);
      setTimeout(() => setPolicySuccess(null), 4000);
      await fetchTeams();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingPolicy(false);
    }
  };

  if (loading && teams.length === 0) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2 text-amber-500" />
        <span>Loading Team Lead Workspace...</span>
      </div>
    );
  }

  if (teams.length === 0) {
    return (
      <div className="p-8 bg-slate-900/60 border border-slate-800 rounded-xl text-center max-w-lg mx-auto mt-12">
        <Users className="w-12 h-12 text-amber-500/50 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-white mb-1">No Teams Assigned</h3>
        <p className="text-sm text-slate-400">
          You currently have no teams assigned to you as a Team Leader. Please contact your Company Administrator to assign team leadership.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header with Team Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
              Team Lead Workspace
            </span>
            <span className="text-xs text-slate-400">Role: Team Lead</span>
          </div>
          <h1 className="text-2xl font-bold text-white mt-1">
            {currentTeam?.name || 'My Team'}
          </h1>
          <p className="text-xs text-slate-400">
            {currentTeam?.description || 'Team coordination and lead visibility management'}
          </p>
        </div>

        {teams.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium">Select Team:</span>
            <select
              value={selectedTeamId}
              onChange={(e) => setSelectedTeamId(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-3 py-2 focus:ring-1 focus:ring-amber-500 outline-none"
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.memberCount || 0} members)
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {policySuccess && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{policySuccess}</span>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-400">Team Members</div>
            <div className="text-2xl font-bold text-white">{currentTeam?.members?.length || 0}</div>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Target className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-400">Assigned Campaigns</div>
            <div className="text-2xl font-bold text-white">{currentTeam?.campaigns?.length || 0}</div>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-400">Effective Visibility</div>
            <div className="text-sm font-bold text-emerald-400">
              {currentTeam?.effectiveVisibility || 'OWN'}
            </div>
          </div>
        </div>
      </div>

      {/* Team Visibility Policy Configurator */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-white">Team Lead Visibility Policy</h3>
          </div>
          <span className="text-xs text-slate-500">
            Current: <span className="text-amber-400 font-mono font-bold">{currentTeam?.settings?.leadVisibility || 'OWN'}</span>
          </span>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          Configure how members of <strong className="text-white">{currentTeam?.name}</strong> view and collaborate on lead records. (Enforced strictly by Company Maximum Policy).
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          <button
            onClick={() => handleUpdatePolicy('OWN')}
            disabled={savingPolicy}
            className={`p-3 rounded-lg border text-left transition-all ${
              (currentTeam?.settings?.leadVisibility || 'OWN') === 'OWN'
                ? 'bg-amber-500/15 border-amber-500/50 text-white'
                : 'bg-slate-850/50 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <div className="text-xs font-bold flex items-center justify-between">
              <span>OWN</span>
              {(currentTeam?.settings?.leadVisibility || 'OWN') === 'OWN' && (
                <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
              )}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Members see only their own and assigned leads.
            </div>
          </button>

          {(() => {
            const isCollaborateRestricted = currentTeam?.companyMaxVisibility === 'OWN' || currentTeam?.companyMaxVisibility === 'TEAM_READ';
            const isReadRestricted = currentTeam?.companyMaxVisibility === 'OWN';
            return (
              <>
                <button
                  onClick={() => handleUpdatePolicy('TEAM_READ')}
                  disabled={savingPolicy || isReadRestricted}
                  title={isReadRestricted ? `Restricted: Company Maximum Policy is set to ${currentTeam?.companyMaxVisibility}` : 'Set TEAM_READ policy'}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    isReadRestricted ? 'opacity-50 cursor-not-allowed bg-slate-900/40 border-slate-800 text-slate-500' :
                    currentTeam?.settings?.leadVisibility === 'TEAM_READ'
                      ? 'bg-amber-500/15 border-amber-500/50 text-white'
                      : 'bg-slate-850/50 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="text-xs font-bold flex items-center justify-between">
                    <span>TEAM_READ</span>
                    {currentTeam?.settings?.leadVisibility === 'TEAM_READ' && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    {isReadRestricted ? `Restricted by Company Policy (${currentTeam?.companyMaxVisibility})` : 'Members can view peer leads in team. Read-only; no reassign.'}
                  </div>
                </button>

                <button
                  onClick={() => handleUpdatePolicy('TEAM_COLLABORATE')}
                  disabled={savingPolicy || isCollaborateRestricted}
                  title={isCollaborateRestricted ? `Restricted: Company Maximum Policy is set to ${currentTeam?.companyMaxVisibility}` : 'Set TEAM_COLLABORATE policy'}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    isCollaborateRestricted ? 'opacity-50 cursor-not-allowed bg-slate-900/40 border-slate-800 text-slate-500' :
                    currentTeam?.settings?.leadVisibility === 'TEAM_COLLABORATE'
                      ? 'bg-amber-500/15 border-amber-500/50 text-white'
                      : 'bg-slate-850/50 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="text-xs font-bold flex items-center justify-between">
                    <span>TEAM_COLLABORATE</span>
                    {currentTeam?.settings?.leadVisibility === 'TEAM_COLLABORATE' && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    {isCollaborateRestricted ? `Restricted by Company Policy (${currentTeam?.companyMaxVisibility})` : 'Members can collaborate and update same-team leads.'}
                  </div>
                </button>
              </>
            );
          })()}
        </div>
      </div>

      {/* Team Members List */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-400" />
            <span>Team Members ({currentTeam?.members?.length || 0})</span>
          </h3>
          <span className="text-xs text-slate-500">Same-tenant authorized seats</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-800/60 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
              <tr>
                <th className="px-5 py-3">Member</th>
                <th className="px-5 py-3">Email</th>
                <th className="px-5 py-3">Role in Team</th>
                <th className="px-5 py-3">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {currentTeam?.members?.map((m: any) => (
                <tr key={m.id || m.userId} className="hover:bg-slate-800/30">
                  <td className="px-5 py-3 font-medium text-white flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold text-amber-400">
                      {(m.displayName || m.username || 'U')[0].toUpperCase()}
                    </div>
                    <span>{m.displayName || m.username}</span>
                  </td>
                  <td className="px-5 py-3 text-slate-400">{m.email || '—'}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        m.roleInTeam === 'leader'
                          ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                          : 'bg-slate-700/50 text-slate-300'
                      }`}
                    >
                      {m.roleInTeam === 'leader' ? 'Team Lead' : 'Member'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-500 font-mono text-[11px]">
                    {m.joinedAt ? new Date(m.joinedAt).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
              {(!currentTeam?.members || currentTeam.members.length === 0) && (
                <tr>
                  <td colSpan={4} className="px-5 py-6 text-center text-slate-500">
                    No members currently in this team.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Assigned Campaigns */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Target className="w-4 h-4 text-amber-400" />
            <span>Assigned Campaigns ({currentTeam?.campaigns?.length || 0})</span>
          </h3>
          <span className="text-xs text-slate-500">Campaigns scoped to this team</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-800/60 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
              <tr>
                <th className="px-5 py-3">Campaign Name</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Lead Count</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {currentTeam?.campaigns?.map((c: any) => (
                <tr key={c.id} className="hover:bg-slate-800/30">
                  <td className="px-5 py-3 font-medium text-white">{c.name}</td>
                  <td className="px-5 py-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {c.status || 'Active'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-300 font-mono">{c.leadCount || 0}</td>
                  <td className="px-5 py-3 text-right">
                    {onSelectCampaign && (
                      <button
                        onClick={() => onSelectCampaign(c.id)}
                        className="px-2.5 py-1 text-xs bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 rounded transition-colors"
                      >
                        Open in Dialer
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {(!currentTeam?.campaigns || currentTeam.campaigns.length === 0) && (
                <tr>
                  <td colSpan={4} className="px-5 py-6 text-center text-slate-500">
                    No campaigns currently mapped to this team.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
