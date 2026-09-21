import React, { useState, useEffect } from 'react';
import {
  X, User, Building2, Mail, Plus, Send,
  PhoneCall, Calendar, FileText, AlertCircle, Edit3
} from 'lucide-react';
import type { CrmContact, CrmTask, CrmNote, CrmQuote } from '../../types/crm';
import { CloseTaskModal, RescheduleTaskModal, CancelTaskModal, CreateTaskModal } from './CRMModals';

interface ContactProfileDrawerProps {
  isLight?: boolean;
  contactId: string | null;
  isOpen: boolean;
  onClose: () => void;
  serverUrl: string;
  authToken: string;
  onDialPhone?: (phone: string, leadId: string, leadName: string) => void;
  onOpenCompany?: (companyId: string) => void;
  onOpenLead?: (leadId: string) => void;
  onEditContact?: (contact: CrmContact) => void;
  onOpenQuoteBuilder?: (companyId?: string, contactId?: string) => void;
  users?: Array<{ id: string; name: string }>;
}

export const ContactProfileDrawer: React.FC<ContactProfileDrawerProps> = ({
  isLight: _isLight,
  contactId,
  isOpen,
  onClose,
  serverUrl,
  authToken,
  onDialPhone,
  onOpenCompany,
  onOpenLead: _onOpenLead,
  onEditContact,
  onOpenQuoteBuilder,
  users = []
}) => {
  const [contact, setContact] = useState<CrmContact | null>(null);
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [notes, setNotes] = useState<CrmNote[]>([]);
  const [quotes, setQuotes] = useState<CrmQuote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'overview' | 'tasks' | 'quotes' | 'activity'>('overview');
  const [newNote, setNewNote] = useState('');
  const [noteCategory, setNoteCategory] = useState<'general' | 'call' | 'meeting' | 'support'>('general');
  const [submittingNote, setSubmittingNote] = useState(false);

  // Task modals
  const [selectedTaskForClose, setSelectedTaskForClose] = useState<CrmTask | null>(null);
  const [selectedTaskForReschedule, setSelectedTaskForReschedule] = useState<CrmTask | null>(null);
  const [selectedTaskForCancel, setSelectedTaskForCancel] = useState<CrmTask | null>(null);
  const [showCreateTask, setShowCreateTask] = useState(false);

  const fetchContactDetails = async () => {
    if (!contactId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/api/crm/contacts/${contactId}`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      if (!res.ok) throw new Error('Failed to load contact profile');
      const data = await res.json();
      setContact(data.contact);
      setTasks(data.tasks || []);
      setNotes(data.notes || []);

      // Fetch linked quotes
      try {
        const qRes = await fetch(`${serverUrl}/api/crm/quotes`, {
          headers: { Authorization: `Bearer ${authToken}` }
        });
        if (qRes.ok) {
          const qData = await qRes.json();
          setQuotes((qData.quotes || []).filter((q: CrmQuote) => q.contactId === contactId));
        }
      } catch {}
    } catch (err: any) {
      setError(err.message || 'Error loading contact');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && contactId) {
      fetchContactDetails();
    }
  }, [isOpen, contactId]);

  if (!isOpen) return null;

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim() || !contactId) return;
    setSubmittingNote(true);
    try {
      const res = await fetch(`${serverUrl}/api/crm/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({
          entityType: 'contact',
          entityId: contactId,
          category: noteCategory,
          body: newNote.trim()
        })
      });
      if (!res.ok) throw new Error('Failed to add note');
      setNewNote('');
      fetchContactDetails();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmittingNote(false);
    }
  };

  return (
    <div className="crm-geist-scope fixed inset-0 z-50 overflow-hidden flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-[#0d0d12] border-l border-[#1f1f23] text-zinc-200 flex flex-col h-full shadow-2xl">
        {/* Header Bar */}
        <div className="p-5 border-b border-[#1f1f23] flex items-center justify-between bg-[#13131a]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold text-lg">
              {contact?.name ? contact.name.charAt(0).toUpperCase() : <User className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                {contact?.name || 'Contact Profile'}
                {contact?.roleTitle && (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 font-normal">
                    {contact.roleTitle}
                  </span>
                )}
              </h2>
              {contact?.companyName && (
                <button
                  type="button"
                  onClick={() => contact.crmCompanyId && onOpenCompany?.(contact.crmCompanyId)}
                  className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 mt-0.5 hover:underline font-mono"
                >
                  <Building2 className="w-3 h-3" />
                  {contact.companyName}
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {contact && onEditContact && (
              <button
                type="button"
                onClick={() => onEditContact(contact)}
                className="p-2 text-zinc-400 hover:text-white bg-[#1a1a24] hover:bg-[#252535] rounded-xl border border-zinc-800 transition"
                title="Edit Contact"
              >
                <Edit3 className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-white bg-[#1a1a24] hover:bg-[#252535] rounded-xl border border-zinc-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Quick Action Bar */}
        {contact && (
          <div className="px-5 py-3 bg-[#111118] border-b border-[#1f1f23] flex items-center justify-between gap-3 overflow-x-auto">
            <div className="flex items-center gap-2">
              {contact.phone && (
                <button
                  type="button"
                  onClick={() => onDialPhone?.(contact.phone || '', contact.id, contact.name)}
                  className="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 text-xs font-bold rounded-lg flex items-center gap-1.5 transition"
                >
                  <PhoneCall className="w-3.5 h-3.5" />
                  Dial {contact.phone}
                </button>
              )}
              {contact.email && (
                <a
                  href={`mailto:${contact.email}`}
                  className="px-3 py-1.5 bg-sky-500/10 border border-sky-500/30 text-sky-400 hover:bg-sky-500/20 text-xs font-bold rounded-lg flex items-center gap-1.5 transition"
                >
                  <Mail className="w-3.5 h-3.5" />
                  {contact.email}
                </a>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowCreateTask(true)}
                className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-lg flex items-center gap-1 transition"
              >
                <Calendar className="w-3.5 h-3.5 text-amber-400" />
                Task
              </button>
              {onOpenQuoteBuilder && (
                <button
                  type="button"
                  onClick={() => onOpenQuoteBuilder(contact.crmCompanyId, contact.id)}
                  className="px-2.5 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 text-black font-extrabold text-xs rounded-lg flex items-center gap-1 shadow-sm transition"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Quote
                </button>
              )}
            </div>
          </div>
        )}

        {/* Navigation Sub-Tabs */}
        <div className="px-5 border-b border-[#1f1f23] flex items-center gap-6 bg-[#0f0f15] text-xs font-mono uppercase tracking-wider">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`py-3 font-bold border-b-2 transition ${
              activeTab === 'overview'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tasks')}
            className={`py-3 font-bold border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'tasks'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Tasks & Meetings
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-zinc-800 text-zinc-300">
              {tasks.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('quotes')}
            className={`py-3 font-bold border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'quotes'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Quotes
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-zinc-800 text-zinc-300">
              {quotes.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('activity')}
            className={`py-3 font-bold border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'activity'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Activity & Notes
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-zinc-800 text-zinc-300">
              {notes.length}
            </span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading && (
            <div className="py-12 text-center text-xs font-mono text-zinc-500">
              Loading contact details...
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {!loading && contact && (
            <>
              {/* TAB 1: OVERVIEW */}
              {activeTab === 'overview' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 bg-[#14141c] border border-[#20202c] rounded-xl">
                      <div className="text-[11px] font-mono text-zinc-400 uppercase">Role / Title</div>
                      <div className="text-sm font-semibold text-white mt-1">{contact.roleTitle || '—'}</div>
                    </div>
                    <div className="p-4 bg-[#14141c] border border-[#20202c] rounded-xl">
                      <div className="text-[11px] font-mono text-zinc-400 uppercase">Assigned Agent</div>
                      <div className="text-sm font-semibold text-white mt-1">{contact.assignedUserName || 'Unassigned'}</div>
                    </div>
                    <div className="p-4 bg-[#14141c] border border-[#20202c] rounded-xl">
                      <div className="text-[11px] font-mono text-zinc-400 uppercase">Phone Number</div>
                      <div className="text-sm font-semibold text-white mt-1">{contact.phone || '—'}</div>
                    </div>
                    <div className="p-4 bg-[#14141c] border border-[#20202c] rounded-xl">
                      <div className="text-[11px] font-mono text-zinc-400 uppercase">Email Address</div>
                      <div className="text-sm font-semibold text-white mt-1">{contact.email || '—'}</div>
                    </div>
                  </div>

                  {contact.notes && (
                    <div className="p-4 bg-[#14141c] border border-[#20202c] rounded-xl">
                      <div className="text-[11px] font-mono text-zinc-400 uppercase mb-1">Contact Bio & Notes</div>
                      <div className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed">{contact.notes}</div>
                    </div>
                  )}

                  {/* Summary Stat Cards */}
                  <div className="grid grid-cols-3 gap-3 pt-2">
                    <div className="p-3 bg-[#111118] border border-[#1f1f28] rounded-xl text-center">
                      <div className="text-lg font-black text-amber-400">{tasks.filter(t => t.status === 'pending' || t.status === 'overdue').length}</div>
                      <div className="text-[10px] font-mono text-zinc-400 uppercase mt-0.5">Open Tasks</div>
                    </div>
                    <div className="p-3 bg-[#111118] border border-[#1f1f28] rounded-xl text-center">
                      <div className="text-lg font-black text-emerald-400">{quotes.filter(q => q.status === 'ACCEPTED').length}</div>
                      <div className="text-[10px] font-mono text-zinc-400 uppercase mt-0.5">Won Quotes</div>
                    </div>
                    <div className="p-3 bg-[#111118] border border-[#1f1f28] rounded-xl text-center">
                      <div className="text-lg font-black text-zinc-300">{notes.length}</div>
                      <div className="text-[10px] font-mono text-zinc-400 uppercase mt-0.5">Activity Notes</div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: TASKS & MEETINGS */}
              {activeTab === 'tasks' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono uppercase text-zinc-400">Scheduled Actions</span>
                    <button
                      type="button"
                      onClick={() => setShowCreateTask(true)}
                      className="px-2.5 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 text-xs font-bold rounded-lg flex items-center gap-1 transition"
                    >
                      <Plus className="w-3 h-3" />
                      Add Task
                    </button>
                  </div>

                  {tasks.length === 0 ? (
                    <div className="py-8 text-center text-xs font-mono text-zinc-500 bg-[#12121a] rounded-xl border border-dashed border-zinc-800">
                      No tasks or meetings linked to this contact.
                    </div>
                  ) : (
                    tasks.map(t => (
                      <div
                        key={t.id}
                        className="p-3.5 bg-[#14141c] border border-[#22222e] rounded-xl flex items-start justify-between gap-3 hover:border-zinc-700 transition"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-mono uppercase font-bold px-1.5 py-0.5 rounded ${
                              t.status === 'completed'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                : t.status === 'cancelled'
                                ? 'bg-zinc-800 text-zinc-400'
                                : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                            }`}>
                              {t.status}
                            </span>
                            <span className="text-xs font-bold text-white">{t.title}</span>
                          </div>
                          {t.description && <p className="text-xs text-zinc-400">{t.description}</p>}
                          <div className="text-[11px] font-mono text-zinc-500 flex items-center gap-3">
                            <span>Due: {new Date(t.dueAt).toLocaleString()}</span>
                            <span>•</span>
                            <span>Type: {t.taskType}</span>
                          </div>
                        </div>

                        {(t.status === 'pending' || t.status === 'overdue') && (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setSelectedTaskForClose(t)}
                              className="px-2 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 text-[11px] font-bold rounded"
                            >
                              Close
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedTaskForReschedule(t)}
                              className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-bold rounded"
                            >
                              Reschedule
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* TAB 3: QUOTES */}
              {activeTab === 'quotes' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono uppercase text-zinc-400">Commercial Quotes</span>
                    {onOpenQuoteBuilder && (
                      <button
                        type="button"
                        onClick={() => onOpenQuoteBuilder(contact.crmCompanyId, contact.id)}
                        className="px-2.5 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 text-xs font-bold rounded-lg flex items-center gap-1 transition"
                      >
                        <Plus className="w-3 h-3" />
                        New Quote
                      </button>
                    )}
                  </div>

                  {quotes.length === 0 ? (
                    <div className="py-8 text-center text-xs font-mono text-zinc-500 bg-[#12121a] rounded-xl border border-dashed border-zinc-800">
                      No commercial quotes generated for this contact.
                    </div>
                  ) : (
                    quotes.map(q => (
                      <div
                        key={q.id}
                        className="p-3.5 bg-[#14141c] border border-[#22222e] rounded-xl flex items-center justify-between gap-3"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold text-amber-400">#{q.quoteNumber}</span>
                            <span className="text-xs font-bold text-white">{q.packageName}</span>
                            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${
                              q.status === 'ACCEPTED'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                : q.status === 'SENT'
                                ? 'bg-sky-500/10 text-sky-400 border border-sky-500/30'
                                : 'bg-zinc-800 text-zinc-400'
                            }`}>
                              {q.status}
                            </span>
                          </div>
                          <div className="text-[11px] font-mono text-zinc-500 mt-1">
                            {q.userCount} seats • {q.billingCycle} • Created: {new Date(q.createdAt).toLocaleDateString()}
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-sm font-black text-white">
                            {q.currency} {Number(q.totalAmount).toFixed(2)}
                          </div>
                          {q.discountPct > 0 && (
                            <div className="text-[10px] font-mono text-emerald-400">
                              {q.discountPct}% off applied
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* TAB 4: ACTIVITY & NOTES */}
              {activeTab === 'activity' && (
                <div className="space-y-4">
                  {/* Add Note Form */}
                  <form onSubmit={handleAddNote} className="p-3.5 bg-[#14141c] border border-[#22222e] rounded-xl space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono uppercase text-zinc-400">Add Interaction Note</span>
                      <select
                        value={noteCategory}
                        onChange={(e) => setNoteCategory(e.target.value as any)}
                        className="px-2 py-1 bg-[#1a1a24] border border-[#2a2a38] rounded-lg text-xs text-white"
                      >
                        <option value="general">General</option>
                        <option value="call">Call Summary</option>
                        <option value="meeting">Meeting Note</option>
                        <option value="support">Support</option>
                      </select>
                    </div>
                    <textarea
                      rows={2}
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      placeholder="Type note details here..."
                      className="w-full px-3 py-2 bg-[#181822] border border-[#262634] rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 resize-none"
                    />
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={submittingNote || !newNote.trim()}
                        className="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 text-black font-extrabold text-xs rounded-lg flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <Send className="w-3 h-3" />
                        {submittingNote ? 'Saving...' : 'Post Note'}
                      </button>
                    </div>
                  </form>

                  {/* Notes Feed */}
                  <div className="space-y-2.5">
                    {notes.map(n => (
                      <div key={n.id} className="p-3 bg-[#12121a] border border-[#1e1e28] rounded-xl space-y-1">
                        <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
                          <span className="font-bold text-amber-400 uppercase">{n.category}</span>
                          <span>{new Date(n.createdAt).toLocaleString()}</span>
                        </div>
                        <p className="text-xs text-zinc-200 whitespace-pre-wrap">{n.body}</p>
                        <div className="text-[10px] font-mono text-zinc-500">By: {n.createdByName || 'User'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
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
            fetchContactDetails();
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
            fetchContactDetails();
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
            fetchContactDetails();
          }}
          serverUrl={serverUrl}
          authToken={authToken}
        />
      )}

      {showCreateTask && contact && (
        <CreateTaskModal
          isOpen={true}
          defaultEntityType="contact"
          defaultEntityId={contact.id}
          defaultEntityName={contact.name}
          onClose={() => setShowCreateTask(false)}
          onSuccess={() => {
            setShowCreateTask(false);
            fetchContactDetails();
          }}
          serverUrl={serverUrl}
          authToken={authToken}
          users={users}
        />
      )}
    </div>
  );
};