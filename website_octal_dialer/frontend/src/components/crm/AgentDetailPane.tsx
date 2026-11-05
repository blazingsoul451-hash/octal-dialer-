import React, { useState } from 'react';

export interface RosterMember {
  id: string;
  name: string;
  email: string;
  role: string;
  reportsToUserId: string | null;
  teamCommandAccess: 'none' | 'view' | 'manage';
  canReassignWork: boolean;
  canApproveQuotes: boolean;
  phoneOnline: boolean;
  companiesCount: number;
  contactsCount: number;
  canonicalLeadsCount: number;
  openTasksCount: number;
  overdueTasksCount: number;
  upcomingMeetingsCount: number;
  quotesCount: number;
  activeWorkCount: number;
}

export interface AgentWorkspaceData {
  agentId: string;
  canonicalLeads: Array<{ id: string; name: string; phone: string; status: string; companyName?: string }>;
  tasks: Array<{ id: string; title: string; priority: string; status: string; dueAt: string }>;
  meetings: Array<{ id: string; title: string; scheduledAt: string; status: string }>;
  quotes: Array<{ id: string; quoteNumber: string; title: string; amount: number; status: string }>;
  clientWork: Array<{ id: string; title: string; status: string; progress: number }>;
  unifiedActivity: Array<{ id: string; type: string; summary: string; createdAt: string }>;
}

export interface AgentDetailPaneProps {
  selectedAgent: RosterMember | null;
  agentWorkspace: AgentWorkspaceData | null;
  callerScope: any;
  agents: RosterMember[];
  isLight?: boolean;
  executeAgentAction: (actionType: string, payload: Record<string, any>) => Promise<void>;
}

export const AgentDetailPane: React.FC<AgentDetailPaneProps> = ({
  selectedAgent,
  agentWorkspace,
  callerScope,
  agents,
  isLight = false,
  executeAgentAction,
}) => {
  const [activeAgentTab, setActiveAgentTab] = useState<'tasks' | 'leads' | 'quotes' | 'work' | 'meetings' | 'activity'>('tasks');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<'normal' | 'high' | 'urgent'>('high');
  const [newMeetingTitle, setNewMeetingTitle] = useState('');
  const [newMeetingTime, setNewMeetingTime] = useState('');
  const [reassignTargetAgentId, setReassignTargetAgentId] = useState<string>('');

  if (!selectedAgent) {
    return (
      <div className={`p-12 rounded-2xl border text-center text-xs font-mono ${isLight ? 'bg-white border-slate-200 text-slate-500' : 'bg-[#121215] border-[#18181b] text-zinc-500'}`}>
        Select an agent on the left to inspect their leads, tasks, and execute in-place commands.
      </div>
    );
  }

  if (!agentWorkspace) {
    return (
      <div className={`p-8 text-center text-xs font-mono animate-pulse rounded-2xl border ${isLight ? 'bg-white border-slate-200 text-slate-500' : 'bg-[#121215] border-[#18181b] text-zinc-400'}`}>
        Syncing agent workload telemetry...
      </div>
    );
  }

  return (
    <div className={`space-y-4 rounded-2xl border p-5 shadow-2xl transition-colors ${isLight ? 'bg-white border-slate-200' : 'bg-[#121215] border-[#18181b]'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-inherit pb-3">
        <div>
          <h3 className={`text-base font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>
            Managing Agent: <span className="text-amber-500">{selectedAgent.name}</span>
          </h3>
          <p className="text-[11px] text-zinc-400">
            Direct In-Place Control — Syncs instantly to the Agent's CRM &amp; Android Dialer
          </p>
        </div>
      </div>

      {/* QUICK DISPATCH BAR */}
      {callerScope?.teamCommandAccess === 'manage' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Task Dispatch */}
          <div className={`space-y-2 rounded-xl border p-3 ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#18181b] border-[#27272a]'}`}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-500">Dispatch Urgent Task</span>
              <select
                value={newTaskPriority}
                onChange={(e) => setNewTaskPriority(e.target.value as any)}
                className={`rounded border px-1.5 py-0.5 text-[9px] font-mono uppercase font-bold cursor-pointer ${isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-black border-[#27272a] text-amber-400'}`}
              >
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                placeholder="Task title or directive..."
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newTaskTitle.trim()) {
                    executeAgentAction('DISPATCH_TASK', {
                      title: newTaskTitle.trim(),
                      priority: newTaskPriority,
                    });
                    setNewTaskTitle('');
                  }
                }}
                className={`min-w-0 flex-1 rounded-lg border px-2.5 py-1 text-xs ${isLight ? 'bg-white border-slate-300 text-slate-800 focus:border-amber-500' : 'bg-black border-[#27272a] text-white focus:border-amber-500'}`}
              />
              <button
                onClick={() => {
                  if (!newTaskTitle.trim()) return;
                  executeAgentAction('DISPATCH_TASK', {
                    title: newTaskTitle.trim(),
                    priority: newTaskPriority,
                  });
                  setNewTaskTitle('');
                }}
                className="shrink-0 rounded-lg bg-amber-500 hover:bg-amber-400 px-3 py-1 text-xs font-mono font-bold text-black cursor-pointer transition shadow-sm"
              >
                Push
              </button>
            </div>
          </div>

          {/* Meeting Booking */}
          <div className={`space-y-2 rounded-xl border p-3 ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#18181b] border-[#27272a]'}`}>
            <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-sky-400">
              Book Client Meeting
            </div>
            <input
              type="text"
              placeholder="Agenda or meeting title..."
              value={newMeetingTitle}
              onChange={(e) => setNewMeetingTitle(e.target.value)}
              className={`w-full rounded-lg border px-2.5 py-1 text-xs ${isLight ? 'bg-white border-slate-300 text-slate-800 focus:border-sky-500' : 'bg-black border-[#27272a] text-white focus:border-sky-500'}`}
            />
            <div className="flex items-center gap-1.5">
              <input
                type="datetime-local"
                value={newMeetingTime}
                onChange={(e) => setNewMeetingTime(e.target.value)}
                className={`min-w-0 flex-1 rounded-lg border px-2 py-1 text-xs font-mono ${isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-black border-[#27272a] text-zinc-300'}`}
              />
              <button
                onClick={() => {
                  if (!newMeetingTitle.trim()) return;
                  executeAgentAction('SCHEDULE_MEETING', {
                    title: newMeetingTitle.trim(),
                    scheduledAt: newMeetingTime || new Date().toISOString(),
                  });
                  setNewMeetingTitle('');
                }}
                className="shrink-0 rounded-lg bg-sky-500 hover:bg-sky-400 px-3 py-1 text-xs font-mono font-bold text-black cursor-pointer transition shadow-sm"
              >
                Book
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WORKLOAD SUB-TABS */}
      <div className="flex items-center gap-1.5 border-b border-inherit pb-2 overflow-x-auto no-scrollbar">
        {[
          { key: 'tasks', label: `Tasks (${agentWorkspace.tasks.length})` },
          { key: 'leads', label: `Leads (${agentWorkspace.canonicalLeads.length})` },
          { key: 'quotes', label: `Quotes (${agentWorkspace.quotes.length})` },
          { key: 'work', label: `Client Work (${agentWorkspace.clientWork.length})` },
          { key: 'meetings', label: `Meetings (${agentWorkspace.meetings.length})` },
          { key: 'activity', label: `Activity (${agentWorkspace.unifiedActivity.length})` },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveAgentTab(t.key as any)}
            className={`rounded-lg px-2.5 py-1 text-xs font-mono font-bold transition-all cursor-pointer border ${
              activeAgentTab === t.key
                ? 'bg-amber-500 text-black border-amber-500'
                : isLight ? 'bg-slate-100 border-slate-200 text-slate-600' : 'bg-black border-[#27272a] text-zinc-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* WORKLOAD ITEM LIST */}
      <div className="max-h-[380px] space-y-2 overflow-y-auto pr-1">
        {activeAgentTab === 'tasks' &&
          (agentWorkspace.tasks.length === 0 ? (
            <div className="text-center py-6 text-xs text-zinc-500 font-mono">No tasks assigned to this agent.</div>
          ) : (
            agentWorkspace.tasks.map((task) => (
              <div
                key={task.id}
                className={`flex items-center justify-between rounded-xl border p-3 text-xs ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#18181b] border-[#27272a]'}`}
              >
                <div>
                  <div className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{task.title}</div>
                  <div className="text-[11px] text-zinc-400">
                    Priority: <span className="text-amber-500 uppercase font-mono">{task.priority}</span> • Status: {task.status}
                  </div>
                </div>
                {callerScope?.canReassignWork && (
                  <div className="flex items-center gap-1.5">
                    <select
                      value={reassignTargetAgentId}
                      onChange={(e) => setReassignTargetAgentId(e.target.value)}
                      className={`rounded-lg border px-2 py-1 text-[11px] font-mono ${isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-black border-[#27272a] text-zinc-300'}`}
                    >
                      <option value="">Transfer to...</option>
                      {agents
                        .filter((a) => a.id !== selectedAgent.id)
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                    </select>
                    <button
                      onClick={() =>
                        reassignTargetAgentId &&
                        executeAgentAction('REASSIGN_ENTITY', {
                          entityType: 'task',
                          entityId: task.id,
                          newAgentId: reassignTargetAgentId,
                        })
                      }
                      className="rounded-lg bg-zinc-800 hover:bg-zinc-700 px-2.5 py-1 text-[11px] font-mono font-bold text-amber-400 cursor-pointer"
                    >
                      Reassign
                    </button>
                  </div>
                )}
              </div>
            ))
          ))}

        {activeAgentTab === 'leads' &&
          (agentWorkspace.canonicalLeads.length === 0 ? (
            <div className="text-center py-6 text-xs text-zinc-500 font-mono">No leads assigned to this agent.</div>
          ) : (
            agentWorkspace.canonicalLeads.map((lead) => (
              <div
                key={lead.id}
                className={`flex items-center justify-between rounded-xl border p-3 text-xs ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#18181b] border-[#27272a]'}`}
              >
                <div>
                  <div className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    {lead.name} {lead.companyName ? `(${lead.companyName})` : ''}
                  </div>
                  <div className="text-[11px] text-zinc-400 font-mono">
                    {lead.phone} • Stage: <span className="text-emerald-400 uppercase">{lead.status}</span>
                  </div>
                </div>
                {callerScope?.canReassignWork && (
                  <div className="flex items-center gap-1.5">
                    <select
                      value={reassignTargetAgentId}
                      onChange={(e) => setReassignTargetAgentId(e.target.value)}
                      className={`rounded-lg border px-2 py-1 text-[11px] font-mono ${isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-black border-[#27272a] text-zinc-300'}`}
                    >
                      <option value="">Transfer to...</option>
                      {agents
                        .filter((a) => a.id !== selectedAgent.id)
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                    </select>
                    <button
                      onClick={() =>
                        reassignTargetAgentId &&
                        executeAgentAction('REASSIGN_ENTITY', {
                          entityType: 'lead',
                          entityId: lead.id,
                          newAgentId: reassignTargetAgentId,
                        })
                      }
                      className="rounded-lg bg-zinc-800 hover:bg-zinc-700 px-2.5 py-1 text-[11px] font-mono font-bold text-amber-400 cursor-pointer"
                    >
                      Transfer
                    </button>
                  </div>
                )}
              </div>
            ))
          ))}

        {activeAgentTab === 'quotes' &&
          (agentWorkspace.quotes.length === 0 ? (
            <div className="text-center py-6 text-xs text-zinc-500 font-mono">No quotes generated by this agent.</div>
          ) : (
            agentWorkspace.quotes.map((quote) => (
              <div
                key={quote.id}
                className={`flex items-center justify-between rounded-xl border p-3 text-xs ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#18181b] border-[#27272a]'}`}
              >
                <div>
                  <div className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    {quote.quoteNumber} — {quote.title} (${quote.amount})
                  </div>
                  <div className="text-[11px] text-zinc-400 font-mono">Status: {quote.status}</div>
                </div>
                {callerScope?.canApproveQuotes && (
                  <div className="flex gap-1.5">
                    <button
                      onClick={() =>
                        executeAgentAction('UPDATE_QUOTE_STATUS', {
                          quoteId: quote.id,
                          status: 'approved',
                        })
                      }
                      className="rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 px-2.5 py-1 text-[11px] font-mono font-bold text-emerald-400 cursor-pointer"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() =>
                        executeAgentAction('UPDATE_QUOTE_STATUS', {
                          quoteId: quote.id,
                          status: 'revision_needed',
                        })
                      }
                      className="rounded-lg bg-red-500/20 hover:bg-red-500/30 px-2.5 py-1 text-[11px] font-mono font-bold text-red-400 cursor-pointer"
                    >
                      Request Changes
                    </button>
                  </div>
                )}
              </div>
            ))
          ))}

        {activeAgentTab === 'work' &&
          (agentWorkspace.clientWork.length === 0 ? (
            <div className="text-center py-6 text-xs text-zinc-500 font-mono">No client work items assigned.</div>
          ) : (
            agentWorkspace.clientWork.map((item) => (
              <div
                key={item.id}
                className={`flex items-center justify-between rounded-xl border p-3 text-xs ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#18181b] border-[#27272a]'}`}
              >
                <div>
                  <div className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{item.title}</div>
                  <div className="text-[11px] text-zinc-400 font-mono">
                    Status: {item.status} ({item.progress || 0}%)
                  </div>
                </div>
                <button
                  onClick={() =>
                    executeAgentAction('UPDATE_WORK_STATUS', {
                      workId: item.id,
                      status: 'COMPLETED',
                    })
                  }
                  className="rounded-lg bg-sky-500/20 hover:bg-sky-500/30 px-2.5 py-1 text-[11px] font-mono font-bold text-sky-400 cursor-pointer"
                >
                  Mark Completed
                </button>
              </div>
            ))
          ))}

        {activeAgentTab === 'meetings' &&
          (agentWorkspace.meetings.length === 0 ? (
            <div className="text-center py-6 text-xs text-zinc-500 font-mono">No meetings scheduled for this agent.</div>
          ) : (
            agentWorkspace.meetings.map((m) => (
              <div
                key={m.id}
                className={`flex items-center justify-between rounded-xl border p-3 text-xs ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#18181b] border-[#27272a]'}`}
              >
                <div>
                  <div className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{m.title}</div>
                  <div className="text-[11px] text-zinc-400 font-mono">{new Date(m.scheduledAt).toLocaleString()}</div>
                </div>
                <span className="rounded-md bg-zinc-800 px-2 py-0.5 text-[10px] font-mono text-zinc-300">{m.status}</span>
              </div>
            ))
          ))}

        {activeAgentTab === 'activity' &&
          (agentWorkspace.unifiedActivity.length === 0 ? (
            <div className="text-center py-6 text-xs text-zinc-500 font-mono">No recent activity logged for this agent.</div>
          ) : (
            agentWorkspace.unifiedActivity.map((act) => (
              <div
                key={act.id}
                className={`rounded-xl border p-3 text-xs space-y-0.5 ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#18181b] border-[#27272a]'}`}
              >
                <div className="font-mono font-bold text-amber-500 text-[10px] uppercase">{act.type}</div>
                <div className={isLight ? 'text-slate-800' : 'text-zinc-200'}>{act.summary}</div>
                <div className="text-[9px] text-zinc-500 font-mono">
                  {new Date(act.createdAt).toLocaleString()}
                </div>
              </div>
            ))
          ))}
      </div>
    </div>
  );
};
