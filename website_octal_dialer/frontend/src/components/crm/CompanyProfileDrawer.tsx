import React, { useState, useEffect } from 'react';
import {
  X, Building2, User, Phone, Mail, Tag,
  Clock, AlertTriangle, Plus, Send,
  PhoneCall
} from 'lucide-react';
import type { CrmCompany, CrmContact, CrmTask, CrmNote } from '../../types/crm';
import { CloseTaskModal, RescheduleTaskModal, CancelTaskModal, AddContactModal, CreateTaskModal } from './CRMModals';

interface CompanyProfileDrawerProps {
  isLight?: boolean;
  companyId: string | null;
  isOpen: boolean;
  onClose: () => void;
  serverUrl: string;
  authToken: string;
  onDialPhone?: (phone: string, leadId: string, leadName: string) => void;
  onOpenLead?: (leadId: string) => void;
  users?: Array<{ id: string; name: string }>;
}

export const CompanyProfileDrawer: React.FC<CompanyProfileDrawerProps> = ({
  isLight,
  companyId,
  isOpen,
  onClose,
  serverUrl,
  authToken,
  onDialPhone,
  onOpenLead,
  users = []
}) => {
  const [company, setCompany] = useState<CrmCompany | null>(null);
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [notes, setNotes] = useState<CrmNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Active sub-tab inside drawer
  const [activeTab, setActiveTab] = useState<'overview' | 'contacts' | 'leads' | 'tasks' | 'timeline'>('overview');

  // New note form
  const [newNote, setNewNote] = useState('');
  const [noteCategory, setNoteCategory] = useState<'general' | 'call' | 'meeting' | 'requirement' | 'payment' | 'support'>('general');
  const [submittingNote, setSubmittingNote] = useState(false);

  // Modals state
  const [selectedTaskForClose, setSelectedTaskForClose] = useState<CrmTask | null>(null);
  const [selectedTaskForReschedule, setSelectedTaskForReschedule] = useState<CrmTask | null>(null);
  const [selectedTaskForCancel, setSelectedTaskForCancel] = useState<CrmTask | null>(null);
  const [showAddContact, setShowAddContact] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);

  const fetchCompanyDetails = async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/api/crm/companies/${companyId}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        const json = await res.json();
        setCompany(json.company);
        setContacts(json.contacts || []);
        setLeads(json.leads || []);
        setTasks(json.tasks || []);
        setNotes(json.notes || []);
      } else {
        const errJson = await res.json();
        setError(errJson.error || 'Failed to load company profile');
      }
    } catch (err: any) {
      setError(err.message || 'Error connecting to server');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && companyId) {
      fetchCompanyDetails();
    } else {
      setCompany(null);
      setContacts([]);
      setLeads([]);
      setTasks([]);
      setNotes([]);
    }
  }, [isOpen, companyId]);

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
    if (!newNote.trim() || !companyId) return;
    setSubmittingNote(true);
    try {
      const res = await fetch(`${serverUrl}/api/crm/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          entityType: 'company',
          entityId: companyId,
          category: noteCategory,
          body: newNote.trim()
        })
      });
      if (res.ok) {
        setNewNote('');
        fetchCompanyDetails();
      }
    } catch {
      // Ignored
    } finally {
      setSubmittingNote(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="crm-geist-scope fixed inset-0 z-50 overflow-hidden bg-black/80 backdrop-blur-md flex justify-end transition-opacity select-none"
    >
      <div className={`w-full max-w-2xl h-full shadow-2xl flex flex-col border-l transition-transform transform duration-300 ${
        isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#09090b] border-[#18181b] text-white'
      }`}>
        {/* Drawer Header */}
        <div className={`p-5 border-b flex items-center justify-between ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#121215] border-[#18181b]'
        }`}>
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 font-bold shadow-sm">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-white tracking-tight">
                  {company?.name || 'Company Profile'}
                </h2>
                {company?.status && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${
                    company.status === 'active'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30'
                  }`}>
                    {company.status}
                  </span>
                )}
                {company?.paymentStatus && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${
                    company.paymentStatus === 'paid'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : company.paymentStatus === 'overdue'
                      ? 'bg-red-500/10 text-red-400 border-red-500/30'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                  }`}>
                    {company.paymentStatus.replace('_', ' ')}
                  </span>
                )}
              </div>
              <p className="text-xs font-mono text-zinc-400 flex items-center gap-2 mt-0.5">
                {company?.industry && <span>{company.industry}</span>}
                {company?.industry && company?.country && <span>•</span>}
                {company?.country && <span>{company.country}</span>}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCreateTask(true)}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Task</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl border border-[#27272a] text-zinc-400 hover:text-white hover:bg-[#18181b] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-5 border-b border-[#18181b] bg-[#0c0c0f] flex items-center gap-2 text-xs overflow-x-auto">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'contacts', label: `Contacts (${contacts.length})` },
            { id: 'leads', label: `Leads (${leads.length})` },
            { id: 'tasks', label: `Tasks (${tasks.filter(t => t.status === 'pending' || t.status === 'overdue').length})` },
            { id: 'timeline', label: `Activity (${notes.length})` }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-3 px-3 font-mono font-bold text-xs border-b-2 transition whitespace-nowrap cursor-pointer ${
                activeTab === tab.id
                  ? 'border-amber-500 text-amber-400'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-left">
          {loading && !company ? (
            <div className="h-64 flex items-center justify-center text-xs font-mono text-zinc-500">
              Loading company data & relationships...
            </div>
          ) : error ? (
            <div className="p-4 border border-red-500/30 bg-red-500/10 text-red-400 rounded-2xl text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : company ? (
            <>
              {/* TAB 1: OVERVIEW */}
              {activeTab === 'overview' && (
                <div className="space-y-4">
                  {/* Account Details Card */}
                  <div className="p-4 rounded-2xl bg-[#121216] border border-[#27272a] space-y-3">
                    <h3 className="text-xs font-mono font-black uppercase text-amber-500 flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5" />
                      <span>Account Information</span>
                    </h3>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-zinc-500 block font-mono text-[10px]">PHONE</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-zinc-200 font-medium">{company.phone || '—'}</span>
                          {company.phone && onDialPhone && (
                            <button
                              onClick={() => onDialPhone(company.phone!, company.id, company.name)}
                              className="p-1 rounded-md bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                              title="Dial Phone"
                            >
                              <PhoneCall className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div>
                        <span className="text-zinc-500 block font-mono text-[10px]">EMAIL</span>
                        <span className="text-zinc-200 font-medium truncate block mt-0.5">{company.email || '—'}</span>
                      </div>

                      <div>
                        <span className="text-zinc-500 block font-mono text-[10px]">WEBSITE</span>
                        {company.website ? (
                          <a
                            href={company.website.startsWith('http') ? company.website : `https://${company.website}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-amber-400 hover:underline block truncate mt-0.5"
                          >
                            {company.website}
                          </a>
                        ) : (
                          <span className="text-zinc-400 block mt-0.5">—</span>
                        )}
                      </div>

                      <div>
                        <span className="text-zinc-500 block font-mono text-[10px]">ASSIGNED AGENT</span>
                        <span className="text-zinc-200 font-medium block mt-0.5">{company.assignedUserName || 'Unassigned'}</span>
                      </div>

                      <div className="col-span-2">
                        <span className="text-zinc-500 block font-mono text-[10px]">OFFICE ADDRESS</span>
                        <span className="text-zinc-200 font-medium block mt-0.5">{company.address || '—'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Summary Metric Counters */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 rounded-xl bg-[#141418] border border-[#27272a] text-center">
                      <div className="text-xl font-black text-amber-400">{contacts.length}</div>
                      <div className="text-[10px] font-mono text-zinc-400 uppercase mt-0.5">Contacts</div>
                    </div>
                    <div className="p-3 rounded-xl bg-[#141418] border border-[#27272a] text-center">
                      <div className="text-xl font-black text-emerald-400">{leads.length}</div>
                      <div className="text-[10px] font-mono text-zinc-400 uppercase mt-0.5">Leads</div>
                    </div>
                    <div className="p-3 rounded-xl bg-[#141418] border border-[#27272a] text-center">
                      <div className="text-xl font-black text-amber-500">
                        {tasks.filter(t => t.status === 'pending' || t.status === 'overdue').length}
                      </div>
                      <div className="text-[10px] font-mono text-zinc-400 uppercase mt-0.5">Open Tasks</div>
                    </div>
                  </div>

                  {/* Primary Contacts Snapshot */}
                  <div className="p-4 rounded-2xl bg-[#121216] border border-[#27272a] space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-mono font-black uppercase text-amber-500">Key Contacts</h3>
                      <button
                        onClick={() => setShowAddContact(true)}
                        className="text-xs text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add</span>
                      </button>
                    </div>

                    {contacts.length === 0 ? (
                      <p className="text-xs text-zinc-500 italic">No contacts added yet.</p>
                    ) : (
                      <div className="divide-y divide-[#1f1f23]">
                        {contacts.map(contact => (
                          <div key={contact.id} className="py-2.5 flex items-center justify-between first:pt-0 last:pb-0">
                            <div>
                              <div className="text-xs font-bold text-white flex items-center gap-1.5">
                                <User className="w-3.5 h-3.5 text-zinc-400" />
                                <span>{contact.name}</span>
                                {contact.roleTitle && (
                                  <span className="text-[10px] font-mono text-zinc-400">({contact.roleTitle})</span>
                                )}
                              </div>
                              <div className="text-[11px] text-zinc-400 flex items-center gap-2 mt-0.5">
                                {contact.email && <span>{contact.email}</span>}
                                {contact.email && contact.phone && <span>•</span>}
                                {contact.phone && <span>{contact.phone}</span>}
                              </div>
                            </div>
                            {contact.phone && onDialPhone && (
                              <button
                                onClick={() => onDialPhone(contact.phone!, contact.id, contact.name)}
                                className="px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg text-[10px] font-bold flex items-center gap-1"
                              >
                                <PhoneCall className="w-2.5 h-2.5" />
                                <span>Call</span>
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: CONTACTS */}
              {activeTab === 'contacts' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-400">Company Decision Makers & Stakeholders</span>
                    <button
                      onClick={() => setShowAddContact(true)}
                      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs rounded-xl flex items-center gap-1.5 transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Contact</span>
                    </button>
                  </div>

                  {contacts.length === 0 ? (
                    <div className="p-8 text-center border border-dashed border-[#27272a] rounded-2xl text-zinc-500 text-xs">
                      No contacts associated with this company. Click "Add Contact" above.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {contacts.map(c => (
                        <div key={c.id} className="p-3.5 bg-[#121216] border border-[#27272a] rounded-xl flex items-center justify-between">
                          <div>
                            <div className="text-sm font-bold text-white flex items-center gap-2">
                              <span>{c.name}</span>
                              {c.roleTitle && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-zinc-800 text-zinc-300">
                                  {c.roleTitle}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-zinc-400 flex items-center gap-3 mt-1">
                              {c.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</span>}
                              {c.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{c.email}</span>}
                            </div>
                            {c.notes && (
                              <p className="text-[11px] text-zinc-400 mt-1.5 italic bg-[#18181b] p-2 rounded-lg">
                                {c.notes}
                              </p>
                            )}
                          </div>
                          {c.phone && onDialPhone && (
                            <button
                              onClick={() => onDialPhone(c.phone!, c.id, c.name)}
                              className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs rounded-xl flex items-center gap-1.5 transition shadow-sm"
                            >
                              <PhoneCall className="w-3 h-3" />
                              <span>Dial</span>
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: LEADS */}
              {activeTab === 'leads' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-400">Pipeline Leads Linked to this Company</span>
                  </div>

                  {leads.length === 0 ? (
                    <div className="p-8 text-center border border-dashed border-[#27272a] rounded-2xl text-zinc-500 text-xs">
                      No canonical leads linked to this company yet.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {leads.map(lead => (
                        <div
                          key={lead.id}
                          className="p-3.5 bg-[#121216] border border-[#27272a] rounded-xl flex items-center justify-between hover:border-zinc-700 transition"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-white">{lead.name || lead.businessName}</span>
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-amber-500/10 text-amber-400 border border-amber-500/30">
                                {lead.status}
                              </span>
                            </div>
                            <div className="text-xs text-zinc-400 flex items-center gap-2 mt-0.5">
                              <span>{lead.phone}</span>
                              {lead.country && <span>• {lead.country}</span>}
                            </div>
                            {lead.requirement && (
                              <p className="text-[11px] text-zinc-400 line-clamp-1 mt-1">
                                Scope: {lead.requirement}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {lead.phone && onDialPhone && (
                              <button
                                onClick={() => onDialPhone(lead.phone, lead.id, lead.name || lead.businessName)}
                                className="p-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 transition"
                                title="Dial Lead"
                              >
                                <PhoneCall className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {onOpenLead && (
                              <button
                                onClick={() => {
                                  onClose();
                                  onOpenLead(lead.id);
                                }}
                                className="px-2.5 py-1.5 bg-[#18181b] hover:bg-[#202025] text-zinc-300 rounded-xl text-xs font-mono font-bold transition"
                              >
                                View Lead
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: TASKS */}
              {activeTab === 'tasks' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-400">Scheduled Actions, Meetings & Follow-ups</span>
                    <button
                      onClick={() => setShowCreateTask(true)}
                      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs rounded-xl flex items-center gap-1.5 transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>New Task</span>
                    </button>
                  </div>

                  {tasks.length === 0 ? (
                    <div className="p-8 text-center border border-dashed border-[#27272a] rounded-2xl text-zinc-500 text-xs">
                      No tasks scheduled for this company.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {tasks.map(task => {
                        const isOverdue = task.status === 'overdue' || (task.status === 'pending' && new Date(task.dueAt).getTime() < Date.now());
                        return (
                          <div
                            key={task.id}
                            className={`p-3.5 rounded-xl border flex flex-col gap-2.5 ${
                              task.status === 'completed'
                                ? 'bg-[#0f1110] border-emerald-500/20 text-zinc-400'
                                : isOverdue
                                ? 'bg-[#170e0f] border-red-500/30 text-white'
                                : 'bg-[#121216] border-[#27272a] text-white'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold">{task.title}</span>
                                  <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase bg-zinc-800 text-zinc-300">
                                    {task.taskType}
                                  </span>
                                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                                    task.status === 'completed'
                                      ? 'bg-emerald-500/10 text-emerald-400'
                                      : isOverdue
                                      ? 'bg-red-500/10 text-red-400'
                                      : 'bg-amber-500/10 text-amber-400'
                                  }`}>
                                    {task.status}
                                  </span>
                                </div>
                                <div className="text-[11px] text-zinc-400 flex items-center gap-3 mt-1">
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {new Date(task.dueAt).toLocaleString()}
                                  </span>
                                  {task.assignedUserName && (
                                    <span className="flex items-center gap-1">
                                      <User className="w-3 h-3" />
                                      {task.assignedUserName}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Task Lifecycle Actions */}
                              {task.status !== 'completed' && task.status !== 'cancelled' && (
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    onClick={() => setSelectedTaskForClose(task)}
                                    className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-bold transition"
                                  >
                                    Close
                                  </button>
                                  <button
                                    onClick={() => setSelectedTaskForReschedule(task)}
                                    className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-bold transition"
                                  >
                                    Reschedule
                                  </button>
                                  <button
                                    onClick={() => setSelectedTaskForCancel(task)}
                                    className="px-2 py-1 bg-zinc-800 hover:bg-red-950/40 text-zinc-400 hover:text-red-400 rounded-lg text-xs transition"
                                    title="Cancel"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </div>

                            {task.description && (
                              <p className="text-xs text-zinc-400 bg-[#16161a] p-2 rounded-lg">
                                {task.description}
                              </p>
                            )}
                            {task.outcomeRemarks && (
                              <div className="text-xs text-emerald-400/90 bg-emerald-950/20 border border-emerald-500/20 p-2 rounded-lg">
                                <span className="font-bold">Closed ({task.outcome || 'Done'}):</span> {task.outcomeRemarks}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 5: TIMELINE / NOTES */}
              {activeTab === 'timeline' && (
                <div className="space-y-4">
                  {/* Note Creator Form */}
                  <form onSubmit={handleAddNote} className="p-3 bg-[#121216] border border-[#27272a] rounded-2xl space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold uppercase text-zinc-400">Post Activity Note</span>
                      <select
                        value={noteCategory}
                        onChange={(e) => setNoteCategory(e.target.value as any)}
                        className="px-2.5 py-1 bg-[#18181b] border border-[#27272a] rounded-lg text-xs text-amber-400 focus:outline-none"
                      >
                        <option value="general">General Note</option>
                        <option value="call">Call Note</option>
                        <option value="meeting">Meeting Note</option>
                        <option value="requirement">Requirement Update</option>
                        <option value="payment">Payment Note</option>
                        <option value="support">Support Ticket</option>
                      </select>
                    </div>

                    <textarea
                      rows={2}
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      placeholder="Add an update, client preference, or meeting brief..."
                      className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 resize-none"
                    />

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={submittingNote || !newNote.trim()}
                        className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs rounded-xl flex items-center gap-1.5 transition disabled:opacity-50"
                      >
                        <Send className="w-3 h-3" />
                        <span>{submittingNote ? 'Saving...' : 'Add Note'}</span>
                      </button>
                    </div>
                  </form>

                  {/* Notes List */}
                  {notes.length === 0 ? (
                    <div className="p-8 text-center border border-dashed border-[#27272a] rounded-2xl text-zinc-500 text-xs">
                      No notes recorded for this company yet.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {notes.map(note => (
                        <div key={note.id} className="p-3 bg-[#121216] border border-[#27272a] rounded-xl space-y-1.5">
                          <div className="flex items-center justify-between text-[11px]">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded-full font-mono text-[9px] font-bold uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                {note.category}
                              </span>
                              <span className="font-bold text-zinc-300">{note.createdByName || 'Agent'}</span>
                            </div>
                            <span className="text-zinc-500 font-mono text-[10px]">
                              {new Date(note.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-xs text-zinc-200 whitespace-pre-wrap">{note.body}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>

      {/* MODALS */}
      {selectedTaskForClose && (
        <CloseTaskModal
          isOpen={true}
          task={selectedTaskForClose}
          onClose={() => setSelectedTaskForClose(null)}
          onSuccess={() => {
            setSelectedTaskForClose(null);
            fetchCompanyDetails();
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
            fetchCompanyDetails();
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
            fetchCompanyDetails();
          }}
          serverUrl={serverUrl}
          authToken={authToken}
        />
      )}

      {showAddContact && (
        <AddContactModal
          isOpen={true}
          defaultCompanyId={companyId || undefined}
          companies={company ? [{ id: company.id, name: company.name }] : []}
          onClose={() => setShowAddContact(false)}
          onSuccess={() => {
            setShowAddContact(false);
            fetchCompanyDetails();
          }}
          serverUrl={serverUrl}
          authToken={authToken}
          users={users}
        />
      )}

      {showCreateTask && (
        <CreateTaskModal
          isOpen={true}
          defaultEntityType="company"
          defaultEntityId={companyId || undefined}
          defaultEntityName={company?.name}
          onClose={() => setShowCreateTask(false)}
          onSuccess={() => {
            setShowCreateTask(false);
            fetchCompanyDetails();
          }}
          serverUrl={serverUrl}
          authToken={authToken}
          users={users}
        />
      )}
    </div>
  );
};
