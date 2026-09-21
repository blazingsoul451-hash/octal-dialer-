import React, { useState, useEffect } from 'react';
import {
  X, AlertCircle, Briefcase
} from 'lucide-react';
import type { CrmWorkItem, CrmWorkStatus, CrmWorkPriority, CrmCompany, CrmContact } from '../../types/crm';

interface ModalBaseProps {
  isOpen: boolean;
  onClose: () => void;
  serverUrl: string;
  authToken: string;
}

// -------------------------------------------------------------
// 1. CREATE WORK ITEM MODAL
// -------------------------------------------------------------
interface CreateWorkItemModalProps extends ModalBaseProps {
  companies: CrmCompany[];
  contacts: CrmContact[];
  users?: Array<{ id: string; name: string }>;
  defaultCompanyId?: string;
  defaultContactId?: string;
  onSuccess: () => void;
}

export const CreateWorkItemModal: React.FC<CreateWorkItemModalProps> = ({
  isOpen,
  companies,
  contacts,
  users = [],
  defaultCompanyId,
  defaultContactId,
  onClose,
  onSuccess,
  serverUrl,
  authToken
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Deliverable');
  const [subcategory, setSubcategory] = useState('');
  const [priority, setPriority] = useState<CrmWorkPriority>('normal');
  const [status, setStatus] = useState<CrmWorkStatus>('TODO');
  const [dueAt, setDueAt] = useState('');
  const [crmCompanyId, setCrmCompanyId] = useState(defaultCompanyId || '');
  const [contactId, setContactId] = useState(defaultContactId || '');
  const [assignedUserId, setAssignedUserId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setDescription('');
      setCategory('Deliverable');
      setSubcategory('');
      setPriority('normal');
      setStatus('TODO');
      setDueAt('');
      setCrmCompanyId(defaultCompanyId || '');
      setContactId(defaultContactId || '');
      setAssignedUserId('');
      setError(null);
    }
  }, [isOpen, defaultCompanyId, defaultContactId]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Work item title is required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/api/crm/work-items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          category,
          subcategory: subcategory.trim() || undefined,
          priority,
          status,
          dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
          crmCompanyId: crmCompanyId || undefined,
          contactId: contactId || undefined,
          assignedUserId: assignedUserId || undefined
        })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create work item');
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error creating work item');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in select-none"
    >
      <div className="w-full max-w-lg bg-[#0e0e11] border border-[#27272a] rounded-2xl shadow-2xl overflow-hidden flex flex-col text-left">
        <div className="p-5 border-b border-[#1f1f23] flex items-center justify-between bg-[#121216]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-white tracking-tight">Create Client Work Item</h2>
              <p className="text-xs text-zinc-400">Track client project tasks, onboarding, and deliverables</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg border border-[#27272a] text-zinc-400 hover:text-white hover:bg-[#1f1f23]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
              Work Title <span className="text-amber-500">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., SIP Trunk Integration & Setup"
              className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
              >
                <option value="Deliverable">Deliverable</option>
                <option value="Onboarding">Onboarding</option>
                <option value="Integration">Integration</option>
                <option value="Project">Project</option>
                <option value="Support">Support Ticket</option>
                <option value="Review">Account Review</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
                Subcategory
              </label>
              <input
                type="text"
                value={subcategory}
                onChange={(e) => setSubcategory(e.target.value)}
                placeholder="e.g., Telecom, Custom Script"
                className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as CrmWorkStatus)}
                className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
              >
                <option value="TODO">To Do</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="PENDING">Pending Client</option>
                <option value="SHORTLISTED">Shortlisted</option>
                <option value="COMPLETED">Completed</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as CrmWorkPriority)}
                className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
                Due Date
              </label>
              <input
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
                Assignee
              </label>
              <select
                value={assignedUserId}
                onChange={(e) => setAssignedUserId(e.target.value)}
                className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
              >
                <option value="">Unassigned</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
                Client Company
              </label>
              <select
                value={crmCompanyId}
                onChange={(e) => setCrmCompanyId(e.target.value)}
                className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
              >
                <option value="">None</option>
                {companies.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
                Client Contact
              </label>
              <select
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
                className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
              >
                <option value="">None</option>
                {contacts.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
              Work Description & Requirements
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Scope of work, deliverables, client specifications..."
              className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 resize-none"
            />
          </div>

          <div className="pt-3 border-t border-[#1f1f23] flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs font-bold text-zinc-300 hover:text-white hover:bg-[#202025] transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-extrabold text-xs rounded-xl shadow-lg shadow-amber-500/20 transition disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create Work Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// 2. EDIT WORK ITEM MODAL
// -------------------------------------------------------------
interface EditWorkItemModalProps extends ModalBaseProps {
  workItem: CrmWorkItem | null;
  companies: CrmCompany[];
  contacts: CrmContact[];
  users?: Array<{ id: string; name: string }>;
  onSuccess: () => void;
}

export const EditWorkItemModal: React.FC<EditWorkItemModalProps> = ({
  isOpen,
  workItem,
  companies,
  contacts,
  users = [],
  onClose,
  onSuccess,
  serverUrl,
  authToken
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Deliverable');
  const [subcategory, setSubcategory] = useState('');
  const [priority, setPriority] = useState<CrmWorkPriority>('normal');
  const [status, setStatus] = useState<CrmWorkStatus>('TODO');
  const [dueAt, setDueAt] = useState('');
  const [crmCompanyId, setCrmCompanyId] = useState('');
  const [contactId, setContactId] = useState('');
  const [assignedUserId, setAssignedUserId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (workItem && isOpen) {
      setTitle(workItem.title || '');
      setDescription(workItem.description || '');
      setCategory(workItem.category || 'Deliverable');
      setSubcategory(workItem.subcategory || '');
      setPriority(workItem.priority || 'normal');
      setStatus(workItem.status || 'TODO');
      setCrmCompanyId(workItem.crmCompanyId || '');
      setContactId(workItem.contactId || '');
      setAssignedUserId(workItem.assignedUserId || '');
      if (workItem.dueAt) {
        const d = new Date(workItem.dueAt);
        const isoLocal = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        setDueAt(isoLocal);
      } else {
        setDueAt('');
      }
      setError(null);
    }
  }, [workItem, isOpen]);

  if (!isOpen || !workItem) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Work item title is required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/api/crm/work-items/${workItem.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          category,
          subcategory: subcategory.trim() || undefined,
          priority,
          status,
          dueAt: dueAt ? new Date(dueAt).toISOString() : null,
          crmCompanyId: crmCompanyId || null,
          contactId: contactId || null,
          assignedUserId: assignedUserId || null
        })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update work item');
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error updating work item');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in select-none"
    >
      <div className="w-full max-w-lg bg-[#0e0e11] border border-[#27272a] rounded-2xl shadow-2xl overflow-hidden flex flex-col text-left">
        <div className="p-5 border-b border-[#1f1f23] flex items-center justify-between bg-[#121216]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-white tracking-tight">Edit Client Work Item</h2>
              <p className="text-xs text-zinc-400">Update status, timeline, or assigned team member</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg border border-[#27272a] text-zinc-400 hover:text-white hover:bg-[#1f1f23]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
              Work Title <span className="text-amber-500">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
              >
                <option value="Deliverable">Deliverable</option>
                <option value="Onboarding">Onboarding</option>
                <option value="Integration">Integration</option>
                <option value="Project">Project</option>
                <option value="Support">Support Ticket</option>
                <option value="Review">Account Review</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
                Subcategory
              </label>
              <input
                type="text"
                value={subcategory}
                onChange={(e) => setSubcategory(e.target.value)}
                className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as CrmWorkStatus)}
                className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
              >
                <option value="TODO">To Do</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="PENDING">Pending Client</option>
                <option value="SHORTLISTED">Shortlisted</option>
                <option value="COMPLETED">Completed</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as CrmWorkPriority)}
                className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
                Due Date
              </label>
              <input
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
                Assignee
              </label>
              <select
                value={assignedUserId}
                onChange={(e) => setAssignedUserId(e.target.value)}
                className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
              >
                <option value="">Unassigned</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
                Client Company
              </label>
              <select
                value={crmCompanyId}
                onChange={(e) => setCrmCompanyId(e.target.value)}
                className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
              >
                <option value="">None</option>
                {companies.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
                Client Contact
              </label>
              <select
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
                className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
              >
                <option value="">None</option>
                {contacts.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
              Work Description & Requirements
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500 resize-none"
            />
          </div>

          <div className="pt-3 border-t border-[#1f1f23] flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs font-bold text-zinc-300 hover:text-white hover:bg-[#202025] transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-extrabold text-xs rounded-xl shadow-lg shadow-amber-500/20 transition disabled:opacity-50"
            >
              {submitting ? 'Saving...' : 'Update Work Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
