import React, { useState, useEffect } from 'react';
import {
  X, User, Calendar, Clock, AlertCircle, Plus, PhoneCall,
  Send, Activity, Tag, Building2, ArrowRight, Trash2, FileText
} from 'lucide-react';
import type { CrmTask, CrmNote } from '../../types/crm';
import { CloseTaskModal, RescheduleTaskModal, CancelTaskModal, CreateTaskModal } from './CRMModals';
import { TaskTimerBadge } from './TaskTimerBadge';

interface LeadProfileDrawerProps {
  isLight?: boolean;
  leadId: string | null;
  isOpen: boolean;
  onClose: () => void;
  serverUrl: string;
  authToken: string;
  onDialLead?: (phone: string, leadId: string, leadName: string) => void;
  onOpenCompany?: (companyId: string) => void;
  users?: Array<{ id: string; name: string }>;
}

interface LeadProfileData {
  lead: {
    id: string;
    name?: string;
    businessName?: string;
    phone?: string;
    email?: string;
    address?: string;
    website?: string;
    source?: string;
    status?: string;
    campaignName?: string;
    campaignId?: string;
    crmCompanyId?: string;
    crmCompanyName?: string;
    contactId?: string;
    crmContactName?: string;
    requirement?: string;
    country?: string;
    createdAt?: string;
  };
  activities: Array<{
    id: string;
    eventType: string;
    description: string;
    username?: string;
    createdAt: string;
  }>;
  callLogs: Array<{
    id: string;
    outcome: string;
    duration: number;
    timestamp: string;
  }>;
  followUps: Array<{
    id: string;
    scheduledAt: string;
    status: string;
    notes?: string;
    assignedAgent?: string;
  }>;
  tasks?: CrmTask[];
  notes?: CrmNote[];
}

export const LeadProfileDrawer: React.FC<LeadProfileDrawerProps> = ({
  isLight,
  leadId,
  isOpen,
  onClose,
  serverUrl,
  authToken,
  onDialLead,
  onOpenCompany,
  users = []
}) => {
  const [data, setData] = useState<LeadProfileData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Quick note form
  const [newNote, setNewNote] = useState('');
  const [noteCategory, setNoteCategory] = useState<'general' | 'call' | 'meeting' | 'requirement' | 'payment' | 'support'>('general');
  const [submittingNote, setSubmittingNote] = useState(false);

  // Task lifecycle modals
  const [selectedTaskForClose, setSelectedTaskForClose] = useState<CrmTask | null>(null);
  const [selectedTaskForReschedule, setSelectedTaskForReschedule] = useState<CrmTask | null>(null);
  const [selectedTaskForCancel, setSelectedTaskForCancel] = useState<CrmTask | null>(null);
  const [showCreateTask, setShowCreateTask] = useState(false);


  const fetchProfile = async () => {
    if (!leadId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/api/crm/leads/${leadId}/profile`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        const errJson = await res.json();
        setError(errJson.error || 'Failed to load lead profile');
      }
    } catch (err: any) {
      setError(err.message || 'Connection error while loading lead profile');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && leadId) {
      fetchProfile();
    } else {
      setData(null);
    }
  }, [isOpen, leadId]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim() || !leadId) return;
    setSubmittingNote(true);
    try {
      const res = await fetch(`${serverUrl}/api/crm/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          entityType: 'lead',
          entityId: leadId,
          category: noteCategory,
          body: newNote.trim()
        })
      });
      if (res.ok) {
        setNewNote('');
        fetchProfile();
      }
    } catch {
      // Ignored
    } finally {
      setSubmittingNote(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      const res = await fetch(`${serverUrl}/api/crm/notes/${noteId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      if (res.ok) {
        fetchProfile();
      }
    } catch {
      // Ignored
    }
  };

  const getCategoryBadge = (cat?: string) => {
    switch (cat) {
      case 'call': return 'bg-blue-500/15 text-blue-400 border border-blue-500/30';
      case 'meeting': return 'bg-purple-500/15 text-purple-400 border border-purple-500/30';
      case 'requirement': return 'bg-amber-500/15 text-amber-400 border border-amber-500/30';
      case 'payment': return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
      case 'support': return 'bg-rose-500/15 text-rose-400 border border-rose-500/30';
      default: return 'bg-zinc-800 text-zinc-300 border border-zinc-700';
    }
  };



  if (!isOpen) return null;

  const leadName = data?.lead.name || data?.lead.businessName || 'Lead Profile';
  const phone = data?.lead.phone || '—';
  const tasks = data?.tasks || [];

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="crm-geist-scope fixed inset-0 z-50 overflow-hidden bg-black/80 backdrop-blur-md flex justify-end transition-opacity select-none"
    >
      <div className={`w-full max-w-xl h-full shadow-2xl flex flex-col border-l transition-transform transform duration-300 ${
        isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#09090b] border-[#18181b] text-white'
      }`}>
        {/* Drawer Header */}
        <div className={`p-5 border-b flex items-center justify-between ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#121216] border-[#18181b]'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center font-bold text-amber-400 shadow-sm">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className={`text-base font-black font-display tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                {leadName}
              </h2>
              <div className="text-xs font-mono text-zinc-400 flex items-center gap-2 mt-0.5">
                <span className="font-bold text-zinc-300">{phone}</span>
                {data?.lead.status && (
                  <span className="px-2 py-0.5 rounded-full border text-[9px] font-bold uppercase bg-amber-500/10 text-amber-400 border-amber-500/30">
                    {data.lead.status}
                  </span>
                )}
                {data?.lead.country && (
                  <span className="text-[10px] text-zinc-400">({data.lead.country})</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onDialLead && data?.lead.phone && (
              <button
                onClick={() => onDialLead(data.lead.phone!, data.lead.id, leadName)}
                className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <PhoneCall className="w-3.5 h-3.5" />
                <span>Dial Now</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-xl border border-[#27272a] text-zinc-400 hover:text-white hover:bg-[#18181b] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Drawer Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 text-left">
          {loading && !data ? (
            <div className="h-64 flex items-center justify-center text-xs font-mono text-zinc-500">
              Loading lead intelligence timeline...
            </div>
          ) : error ? (
            <div className="p-4 border border-red-500/30 bg-red-500/10 text-red-400 rounded-2xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : data ? (
            <>
              {/* Linked Company Pill Banner */}
              {data.lead.crmCompanyId && data.lead.crmCompanyName && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs">
                    <Building2 className="w-4 h-4 text-amber-400" />
                    <span className="text-zinc-300">Linked Account:</span>
                    <span className="font-bold text-amber-400">{data.lead.crmCompanyName}</span>
                  </div>
                  {onOpenCompany && (
                    <button
                      onClick={() => {
                        onClose();
                        onOpenCompany(data.lead.crmCompanyId!);
                      }}
                      className="text-xs font-mono font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer"
                    >
                      <span>View Company</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}

              {/* Contact Information Grid */}
              <div className={`p-4 border rounded-2xl space-y-3 ${
                isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#121216] border-[#27272a]'
              }`}>
                <h3 className="text-xs font-mono font-black uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5" />
                  <span>Lead Contact Card</span>
                </h3>

                <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                  <div>
                    <span className={`text-[10px] block uppercase font-bold ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>Phone Number</span>
                    <span className={`font-bold ${isLight ? 'text-slate-900' : 'text-zinc-200'}`}>{data.lead.phone || '—'}</span>
                  </div>
                  <div>
                    <span className={`text-[10px] block uppercase font-bold ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>Email Address</span>
                    <span className={`font-bold truncate block ${isLight ? 'text-slate-900' : 'text-zinc-200'}`}>{data.lead.email || '—'}</span>
                  </div>
                  <div>
                    <span className={`text-[10px] block uppercase font-bold ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>Campaign Pipeline</span>
                    <span className={`font-bold truncate block ${isLight ? 'text-slate-900' : 'text-zinc-200'}`}>{data.lead.campaignName || 'General'}</span>
                  </div>
                  <div>
                    <span className={`text-[10px] block uppercase font-bold ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>Country</span>
                    <span className={`font-bold truncate block ${isLight ? 'text-slate-800' : 'text-zinc-300'}`}>{data.lead.country || '—'}</span>
                  </div>
                  {data.lead.requirement && (
                    <div className="col-span-2">
                      <span className={`text-[10px] block uppercase font-bold ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>Scope / Requirement</span>
                      <p className={`font-sans text-xs mt-1 p-2 rounded-lg ${isLight ? 'bg-slate-100 text-slate-800' : 'bg-[#18181b] text-zinc-200'}`}>
                        {data.lead.requirement}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Tasks & Scheduled Actions Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-mono font-black uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Tasks & Meetings ({tasks.length})</span>
                  </h3>
                  <button
                    onClick={() => setShowCreateTask(true)}
                    className="text-xs text-amber-400 hover:text-amber-300 font-bold font-mono flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>New Task</span>
                  </button>
                </div>

                {tasks.length === 0 ? (
                  <div className="p-4 border border-dashed border-[#27272a] rounded-xl text-center text-xs text-zinc-500">
                    No active tasks for this lead. Click "New Task" above to schedule a call or meeting.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {tasks.map(task => {
                      const isOverdue = task.status !== 'completed' && task.status !== 'cancelled' && Boolean(task.dueAt) && !isNaN(new Date(task.dueAt).getTime()) && new Date(task.dueAt).getTime() < Date.now();
                      return (
                        <div
                          key={task.id}
                          className={`p-3 border rounded-xl flex flex-col gap-2 transition ${
                            task.status === 'completed'
                              ? 'bg-[#0f1110] border-emerald-500/20 text-zinc-400'
                              : isOverdue
                              ? 'bg-red-950/20 border-red-500/60 shadow-[0_0_15px_rgba(239,68,68,0.15)] text-white'
                              : 'bg-[#121216] border-[#27272a] text-white'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold">{task.title}</span>
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase bg-zinc-800 text-zinc-300">
                                  {task.taskType}
                                </span>
                                {(task.dueAt || task.status === 'completed' || task.status === 'cancelled') && (
                                  <TaskTimerBadge dueAt={task.dueAt} status={task.status} />
                                )}
                              </div>
                              <div className="text-[11px] text-zinc-400 flex items-center gap-3 mt-1.5 font-mono">
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-zinc-500" />
                                  {task.dueAt && !isNaN(new Date(task.dueAt).getTime())
                                    ? new Date(task.dueAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
                                    : 'No deadline'}
                                </span>
                              </div>
                            </div>

                            {task.status !== 'completed' && task.status !== 'cancelled' && (
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={() => setSelectedTaskForClose(task)}
                                  className="px-2 py-0.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-md text-[11px] font-bold"
                                >
                                  Close
                                </button>
                                <button
                                  onClick={() => setSelectedTaskForReschedule(task)}
                                  className="px-2 py-0.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-md text-[11px] font-bold"
                                >
                                  Reschedule
                                </button>
                                <button
                                  onClick={() => setSelectedTaskForCancel(task)}
                                  className="p-1 text-zinc-500 hover:text-red-400"
                                  title="Cancel"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </div>
                          {task.outcomeRemarks && (
                            <p className="text-[11px] text-emerald-400/90 bg-emerald-950/20 p-2 rounded-lg">
                              <span className="font-bold">Summary:</span> {task.outcomeRemarks}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Call History */}
              {data.callLogs && data.callLogs.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-xs font-mono font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <PhoneCall className="w-3.5 h-3.5" />
                    <span>Call History ({data.callLogs.length})</span>
                  </h3>
                  <div className="space-y-2">
                    {data.callLogs.map(log => (
                      <div key={log.id} className="p-3 bg-[#121216] border border-[#27272a] rounded-xl flex items-center justify-between text-xs font-mono">
                        <div>
                          <span className="font-bold text-white uppercase">{log.outcome || 'DIALED'}</span>
                          <span className="text-zinc-500 text-[11px] ml-2">({log.duration}s)</span>
                        </div>
                        <span className="text-zinc-500 text-[11px]">
                          {new Date(log.timestamp).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Log Activity / Note Form */}
              <form onSubmit={handleAddNote} className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className={`block text-xs font-mono font-bold uppercase tracking-wider ${isLight ? 'text-slate-700' : 'text-zinc-400'}`}>
                    Add Lead Note / Interaction
                  </label>
                  <select
                    value={noteCategory}
                    onChange={(e) => setNoteCategory(e.target.value as any)}
                    className="px-2 py-0.5 bg-[#18181b] border border-[#27272a] rounded-lg text-xs text-amber-400 focus:outline-none"
                  >
                    <option value="general">General</option>
                    <option value="call">Call Note</option>
                    <option value="meeting">Meeting Note</option>
                    <option value="requirement">Requirement</option>
                    <option value="payment">Payment</option>
                    <option value="support">Support</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Enter activity note, client requirement update..."
                    value={newNote}
                    onChange={e => setNewNote(e.target.value)}
                    className={`flex-1 px-3.5 py-2.5 rounded-xl border text-xs font-mono outline-none focus:border-amber-500 ${
                      isLight ? 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400' : 'bg-[#121216] border-[#27272a] text-white placeholder:text-zinc-600'
                    }`}
                  />
                  <button
                    type="submit"
                    disabled={submittingNote || !newNote.trim()}
                    className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold text-xs font-mono rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-sm shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{submittingNote ? 'Saving...' : 'Post'}</span>
                  </button>
                </div>
              </form>

              {/* Lead Interaction Notes List */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <h3 className={`text-xs font-mono font-black uppercase tracking-wider flex items-center gap-1.5 ${isLight ? 'text-slate-700' : 'text-zinc-400'}`}>
                    <FileText className="w-3.5 h-3.5 text-amber-500" />
                    <span>Lead Interaction Notes ({data.notes?.length || 0})</span>
                  </h3>
                </div>

                {(!data.notes || data.notes.length === 0) ? (
                  <div className={`p-4 border border-dashed rounded-xl text-center text-xs font-mono ${
                    isLight ? 'border-slate-300 text-slate-500' : 'border-[#27272a] text-zinc-500'
                  }`}>
                    No notes recorded for this lead yet. Use the form above to add interaction logs.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {data.notes.map(note => (
                      <div key={note.id} className={`p-3 border rounded-xl space-y-1.5 transition ${
                        isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#121216] border-[#27272a]'
                      }`}>
                        <div className="flex items-center justify-between text-[11px] font-mono">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${getCategoryBadge(note.category)}`}>
                              {note.category}
                            </span>
                            <span className={`font-bold ${isLight ? 'text-slate-800' : 'text-zinc-300'}`}>
                              {note.createdByName || 'Agent'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-zinc-500">
                              {new Date(note.createdAt).toLocaleString()}
                            </span>
                            <button
                              onClick={() => handleDeleteNote(note.id)}
                              className="text-zinc-500 hover:text-red-400 p-1 rounded transition cursor-pointer"
                              title="Delete note"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <p className={`text-xs whitespace-pre-wrap leading-relaxed ${isLight ? 'text-slate-900' : 'text-zinc-200'}`}>
                          {note.body}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Activity Timeline Stream */}
              <div className="space-y-3 pt-2">
                <h3 className={`text-xs font-mono font-black uppercase tracking-wider flex items-center gap-1.5 ${isLight ? 'text-slate-700' : 'text-zinc-400'}`}>
                  <Activity className="w-3.5 h-3.5 text-amber-500" />
                  <span>Activity History & Audit Trail</span>
                </h3>

                {data.activities.length === 0 ? (
                  <div className={`p-6 border border-dashed rounded-2xl text-center text-xs font-mono ${
                    isLight ? 'border-slate-300 text-slate-500' : 'border-[#27272a] text-zinc-500'
                  }`}>
                    No custom interactions logged yet.
                  </div>
                ) : (
                  <div className={`relative pl-6 space-y-4 border-l ml-3 ${isLight ? 'border-slate-200' : 'border-[#18181b]'}`}>
                    {data.activities.map(act => (
                      <div key={act.id} className="relative">
                        <div className={`absolute -left-[31px] top-1 w-2.5 h-2.5 rounded-full bg-amber-500 ring-4 ${isLight ? 'ring-slate-100' : 'ring-[#09090b]'}`} />
                        <div className={`p-3.5 border rounded-xl text-xs space-y-1 ${
                          isLight ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-[#121216] border-[#27272a] text-zinc-300'
                        }`}>
                          <div className={`flex items-center justify-between text-[10px] font-mono ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
                            <span className="font-bold text-amber-500 uppercase">{act.eventType.replace('_', ' ')}</span>
                            <span>{new Date(act.createdAt).toLocaleString()}</span>
                          </div>
                          <p className={`font-sans text-xs ${isLight ? 'text-slate-900' : 'text-white'}`}>{act.description}</p>
                          {act.username && (
                            <p className={`text-[9px] font-mono ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>By operator: {act.username}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* Task Lifecycle Modals */}
      {selectedTaskForClose && (
        <CloseTaskModal
          isOpen={true}
          task={selectedTaskForClose}
          onClose={() => setSelectedTaskForClose(null)}
          onSuccess={() => {
            setSelectedTaskForClose(null);
            fetchProfile();
          }}
          serverUrl={serverUrl}
          authToken={authToken}
          users={users}
        />
      )}

      {selectedTaskForReschedule && (
        <RescheduleTaskModal
          isOpen={true}
          task={selectedTaskForReschedule}
          onClose={() => setSelectedTaskForReschedule(null)}
          onSuccess={() => {
            setSelectedTaskForReschedule(null);
            fetchProfile();
          }}
          serverUrl={serverUrl}
          authToken={authToken}
          users={users}
        />
      )}

      {selectedTaskForCancel && (
        <CancelTaskModal
          isOpen={true}
          task={selectedTaskForCancel}
          onClose={() => setSelectedTaskForCancel(null)}
          onSuccess={() => {
            setSelectedTaskForCancel(null);
            fetchProfile();
          }}
          serverUrl={serverUrl}
          authToken={authToken}
        />
      )}

      {showCreateTask && (
        <CreateTaskModal
          isOpen={true}
          defaultEntityType="lead"
          defaultEntityId={leadId || undefined}
          defaultEntityName={leadName}
          onClose={() => setShowCreateTask(false)}
          onSuccess={() => {
            setShowCreateTask(false);
            fetchProfile();
          }}
          serverUrl={serverUrl}
          authToken={authToken}
          users={users}
        />
      )}
    </div>
  );
};
