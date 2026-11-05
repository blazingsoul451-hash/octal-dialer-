import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ShieldCheck, AlertCircle, RefreshCw, Check } from 'lucide-react';
import { AgentDetailPane, type RosterMember, type AgentWorkspaceData } from './AgentDetailPane';

export interface TeamCommandPanelProps {
  tenantId: string;
  currentUserId: string;
  currentUserRole: string;
  isLight?: boolean;
  serverUrl?: string;
  authToken?: string;
}

export const TeamCommandPanel: React.FC<TeamCommandPanelProps> = ({
  tenantId,
  currentUserId,
  currentUserRole,
  isLight = false,
  serverUrl = '',
  authToken = '',
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [callerScope, setCallerScope] = useState<any>(null);
  const [teamLeads, setTeamLeads] = useState<RosterMember[]>([]);
  const [agents, setAgents] = useState<RosterMember[]>([]);

  // Drill-down selections
  const [selectedTeamLeadId, setSelectedTeamLeadId] = useState<string>('ALL');
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [agentWorkspace, setAgentWorkspace] = useState<AgentWorkspaceData | null>(null);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  const headers = useMemo(() => {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-tenant-id': tenantId || '',
      'x-user-id': currentUserId || '',
      'x-user-role': currentUserRole || '',
    };
    if (authToken) {
      h['Authorization'] = `Bearer ${authToken}`;
    }
    return h;
  }, [tenantId, currentUserId, currentUserRole, authToken]);

  const fetchHierarchy = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/api/crm/team-command/hierarchy`, { headers });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to load Team Command hierarchy');
      }
      const data = await res.json();
      setCallerScope(data.callerScope);
      setTeamLeads(data.teamLeads || []);
      setAgents(data.agents || []);

      if (!data.callerScope?.isOwnerOrAdmin && data.teamLeads?.length === 1) {
        setSelectedTeamLeadId(data.teamLeads[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Error connecting to Team Command');
    } finally {
      setLoading(false);
    }
  }, [serverUrl, headers]);

  const fetchAgentWorkspace = useCallback(async (agentId: string) => {
    try {
      const res = await fetch(`${serverUrl}/api/crm/team-command/agent/${agentId}/workspace`, { headers });
      if (!res.ok) return;
      const data = await res.json();
      setAgentWorkspace(data);
    } catch (err) {
      console.error(err);
    }
  }, [serverUrl, headers]);

  useEffect(() => {
    fetchHierarchy();
  }, [fetchHierarchy]);

  useEffect(() => {
    if (selectedAgentId) {
      fetchAgentWorkspace(selectedAgentId);
    } else {
      setAgentWorkspace(null);
    }
  }, [selectedAgentId, fetchAgentWorkspace]);

  // Only actual Team Leads can receive delegation (never Owners or Admins delegating to themselves)
  const delegatedLeads = useMemo(
    () => teamLeads.filter((lead) => !['owner', 'company_owner', 'admin', 'super_admin'].includes((lead.role || '').toLowerCase())),
    [teamLeads]
  );

  // Filter agents under the currently selected Team Lead
  const visibleAgents = useMemo(() => {
    if (selectedTeamLeadId === 'ALL') return agents;
    if (selectedTeamLeadId === 'UNASSIGNED') return agents.filter((a) => !a.reportsToUserId);
    return agents.filter((a) => a.reportsToUserId === selectedTeamLeadId);
  }, [agents, selectedTeamLeadId]);

  const selectedAgent = useMemo(
    () => agents.find((a) => a.id === selectedAgentId) || delegatedLeads.find((t) => t.id === selectedAgentId) || null,
    [agents, delegatedLeads, selectedAgentId]
  );

  // Owner Delegation Handler
  const handleUpdateDelegation = async (targetUserId: string, patch: Partial<RosterMember>) => {
    try {
      await fetch(`${serverUrl}/api/crm/team-command/delegation`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ targetUserId, ...patch }),
      });
      fetchHierarchy();
    } catch (err) {
      console.error(err);
    }
  };

  // Unified In-Place Action Handler
  const executeAgentAction = async (actionType: string, payload: Record<string, any>) => {
    if (!selectedAgentId) return;
    try {
      const res = await fetch(`${serverUrl}/api/crm/team-command/agent/${selectedAgentId}/action`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ actionType, payload }),
      });
      if (res.ok) {
        setActionSuccessMsg(`Action executed successfully.`);
        setTimeout(() => setActionSuccessMsg(null), 3000);
        await Promise.all([fetchAgentWorkspace(selectedAgentId), fetchHierarchy()]);
      } else {
        const errJson = await res.json().catch(() => ({}));
        setError(errJson.error || 'Failed to execute command action');
        setTimeout(() => setError(null), 4000);
      }
    } catch (err: any) {
      setError(err.message || 'Execution error');
      setTimeout(() => setError(null), 4000);
    }
  };

  if (loading) {
    return (
      <div className={`p-8 text-center text-xs font-mono animate-pulse rounded-2xl border ${isLight ? 'bg-slate-50 border-slate-200 text-slate-500' : 'bg-[#121215] border-[#18181b] text-zinc-400'}`}>
        Loading Team Command hierarchy and live agent telemetry...
      </div>
    );
  }

  if (error && !callerScope) {
    return (
      <div className="p-6 rounded-2xl border border-red-500/40 bg-red-950/20 text-red-300 text-xs flex items-center gap-3">
        <AlertCircle className="w-5 h-5 shrink-0 text-red-400" />
        <div>
          <div className="font-bold">Team Command Access Restricted</div>
          <div>{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-5 text-left select-none ${isLight ? 'text-slate-900' : 'text-zinc-100'}`}>
      {/* Action Notification Toast */}
      {actionSuccessMsg && (
        <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-950/20 text-emerald-400 text-xs flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span>{actionSuccessMsg}</span>
        </div>
      )}

      {/* 1. TOP BAR: COMPANY OWNER DELEGATION & SQUAD ACCESS CONTROL */}
      {callerScope?.isOwnerOrAdmin && (
        <div className={`rounded-2xl border p-4 sm:p-5 transition-colors ${isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#121215] border-[#18181b]'}`}>
          <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-inherit">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-500" />
                <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-amber-500">
                  Owner Command & Team Lead Delegation
                </h3>
              </div>
              <p className={`text-[11px] mt-0.5 ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>
                Configure Team Lead authority levels and squad oversight boundaries.
              </p>
            </div>
            <button
              onClick={fetchHierarchy}
              className={`p-1.5 rounded-lg border text-xs font-mono flex items-center gap-1 cursor-pointer transition ${isLight ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700' : 'bg-[#18181b] hover:bg-[#27272a] border-[#27272a] text-zinc-300'}`}
              title="Refresh Roster"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {delegatedLeads.length === 0 ? (
            <div className={`mt-4 p-4 rounded-xl border text-xs font-mono text-center ${isLight ? 'bg-slate-50 border-slate-200 text-slate-500' : 'bg-[#18181b]/50 border-[#27272a] text-zinc-400'}`}>
              No Team Leads designated yet. Promote an agent to Team Lead in Settings &gt; Users &amp; Roles to delegate squad command.
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {delegatedLeads.map((lead) => (
                <div
                  key={lead.id}
                  className={`flex flex-col justify-between rounded-xl border p-3.5 transition-colors ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#18181b]/70 border-[#27272a]'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className={`font-bold text-xs truncate ${isLight ? 'text-slate-900' : 'text-white'}`}>{lead.name}</div>
                      <div className="text-[10px] text-zinc-400 font-mono">Role: {lead.role}</div>
                    </div>
                    <select
                      value={lead.teamCommandAccess}
                      onChange={(e) =>
                        handleUpdateDelegation(lead.id, {
                          teamCommandAccess: e.target.value as 'none' | 'view' | 'manage',
                        })
                      }
                      className={`rounded-lg border px-2 py-1 text-xs font-mono font-bold cursor-pointer ${isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-black border-[#27272a] text-amber-400'}`}
                    >
                      <option value="none">No Command Access</option>
                      <option value="view">Squad View Only</option>
                      <option value="manage">Full Squad Command</option>
                    </select>
                  </div>

                  <div className="mt-3 flex items-center gap-4 border-t border-inherit pt-2 text-[11px]">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={lead.canReassignWork}
                        onChange={(e) => handleUpdateDelegation(lead.id, { canReassignWork: e.target.checked })}
                        className="accent-amber-500 rounded cursor-pointer"
                      />
                      <span className={isLight ? 'text-slate-700' : 'text-zinc-300'}>Can Reassign</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={lead.canApproveQuotes}
                        onChange={(e) => handleUpdateDelegation(lead.id, { canApproveQuotes: e.target.checked })}
                        className="accent-amber-500 rounded cursor-pointer"
                      />
                      <span className={isLight ? 'text-slate-700' : 'text-zinc-300'}>Can Approve Quotes</span>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 2. TIER 1: SQUAD & TEAM LEAD SELECTOR PILLS */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        {callerScope?.isOwnerOrAdmin && (
          <button
            onClick={() => setSelectedTeamLeadId('ALL')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold font-mono transition-all cursor-pointer border shrink-0 ${
              selectedTeamLeadId === 'ALL'
                ? 'bg-amber-500 text-black border-amber-500 shadow-sm'
                : isLight ? 'bg-white border-slate-200 text-slate-700 hover:border-slate-300' : 'border-[#18181b] bg-[#121215] text-zinc-300 hover:border-zinc-700'
            }`}
          >
            All Squads ({agents.length} Agents)
          </button>
        )}

        {delegatedLeads.map((lead) => {
          const squadCount = agents.filter((a) => a.reportsToUserId === lead.id).length;
          return (
            <button
              key={lead.id}
              onClick={() => setSelectedTeamLeadId(lead.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold font-mono transition-all cursor-pointer border shrink-0 ${
                selectedTeamLeadId === lead.id
                  ? 'bg-amber-500 text-black border-amber-500 shadow-sm'
                  : isLight ? 'bg-white border-slate-200 text-slate-700 hover:border-slate-300' : 'border-[#18181b] bg-[#121215] text-zinc-300 hover:border-zinc-700'
              }`}
            >
              Lead: {lead.name} ({squadCount})
            </button>
          );
        })}

        {callerScope?.isOwnerOrAdmin && (
          <button
            onClick={() => setSelectedTeamLeadId('UNASSIGNED')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold font-mono transition-all cursor-pointer border shrink-0 ${
              selectedTeamLeadId === 'UNASSIGNED'
                ? 'bg-amber-500 text-black border-amber-500 shadow-sm'
                : isLight ? 'bg-white border-slate-200 text-slate-500 hover:border-slate-300' : 'border-[#18181b] bg-[#121215] text-zinc-400 hover:border-zinc-700'
            }`}
          >
            Unassigned ({agents.filter((a) => !a.reportsToUserId).length})
          </button>
        )}
      </div>

      {/* 3. TIER 2 & 3: AGENT ROSTER (LEFT) + IN-PLACE AGENT COMMAND CENTER (RIGHT) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT COLUMN: AGENT ROSTER */}
        <div className="lg:col-span-5 space-y-3">
          <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400">
            Select an Agent to Inspect & Control Workload
          </div>

          {visibleAgents.length === 0 ? (
            <div className={`p-8 rounded-2xl border text-center text-xs font-mono ${isLight ? 'bg-white border-slate-200 text-slate-500' : 'bg-[#121215] border-[#18181b] text-zinc-500'}`}>
              No agents assigned to this squad yet.
            </div>
          ) : (
            visibleAgents.map((agent) => {
              const isSelected = agent.id === selectedAgentId;
              return (
                <div
                  key={agent.id}
                  onClick={() => setSelectedAgentId(agent.id)}
                  className={`cursor-pointer rounded-2xl border p-4 transition-all shadow-sm ${
                    isSelected
                      ? 'border-amber-500 bg-amber-500/10'
                      : isLight
                        ? 'border-slate-200 bg-white hover:border-amber-500/50'
                        : 'border-[#18181b] bg-[#121215] hover:border-[#27272a]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`font-bold text-xs truncate ${isLight ? 'text-slate-900' : 'text-white'}`}>{agent.name}</span>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                            agent.phoneOnline
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-red-500/10 text-red-400 border border-red-500/20'
                          }`}
                        >
                          {agent.phoneOnline ? 'Online' : 'Offline'}
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-400 truncate">{agent.email}</div>
                    </div>

                    {callerScope?.isOwnerOrAdmin && (
                      <div onClick={(e) => e.stopPropagation()}>
                        <select
                          value={agent.reportsToUserId || ''}
                          onChange={(e) =>
                            handleUpdateDelegation(agent.id, { reportsToUserId: e.target.value })
                          }
                          className={`rounded-lg border px-2 py-1 text-[10px] font-mono ${isLight ? 'bg-slate-100 border-slate-300 text-slate-700' : 'bg-black border-[#27272a] text-zinc-300'}`}
                        >
                          <option value="">Unassigned</option>
                          {delegatedLeads.map((tl) => (
                            <option key={tl.id} value={tl.id}>
                              Reports to: {tl.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Agent KPI Strip */}
                  <div className={`mt-3 grid grid-cols-4 gap-2 border-t pt-3 text-center text-xs ${isLight ? 'border-slate-100' : 'border-[#18181b]'}`}>
                    <div>
                      <div className="text-[10px] text-zinc-400 font-mono uppercase">Leads</div>
                      <div className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{agent.canonicalLeadsCount}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-zinc-400 font-mono uppercase">Tasks</div>
                      <div className="font-bold text-amber-400">
                        {agent.openTasksCount}
                        {agent.overdueTasksCount > 0 && (
                          <span className="ml-1 text-[9px] text-red-400">
                            ({agent.overdueTasksCount} late)
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-zinc-400 font-mono uppercase">Quotes</div>
                      <div className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{agent.quotesCount}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-zinc-400 font-mono uppercase">Work</div>
                      <div className="font-bold text-sky-400">{agent.activeWorkCount}</div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* RIGHT COLUMN: IN-PLACE AGENT COMMAND CENTER */}
        <div className="lg:col-span-7">
          <AgentDetailPane
            selectedAgent={selectedAgent}
            agentWorkspace={agentWorkspace}
            callerScope={callerScope}
            agents={agents}
            isLight={isLight}
            executeAgentAction={executeAgentAction}
          />
        </div>
      </div>
    </div>
  );
};
