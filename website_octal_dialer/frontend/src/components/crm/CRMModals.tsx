import React, { useState, useEffect } from 'react';
import {
  X, CheckCircle2, Calendar, AlertTriangle, AlertCircle,
  Building2, User, Phone, CalendarCheck, Clock, PhoneCall
} from 'lucide-react';
import type { CrmTask, CrmTaskType, CrmTaskPriority } from '../../types/crm';

interface ModalBaseProps {
  isOpen: boolean;
  onClose: () => void;
  serverUrl: string;
  authToken: string;
}

// -------------------------------------------------------------
// 1. CLOSE TASK MODAL (from reference 08_close_meeting_modal.png)
// -------------------------------------------------------------
interface CloseTaskModalProps extends ModalBaseProps {
  task: CrmTask | null;
  onSuccess: () => void;
  users?: Array<{ id: string; name: string }>;
}

export const CloseTaskModal: React.FC<CloseTaskModalProps> = ({
  isOpen,
  task,
  onClose,
  onSuccess,
  serverUrl,
  authToken,
  users = []
}) => {
  const [outcome, setOutcome] = useState('Completed');
  const [outcomeRemarks, setOutcomeRemarks] = useState('');
  const [scheduleNext, setScheduleNext] = useState(false);
  const [nextTitle, setNextTitle] = useState('');
  const [nextTaskType, setNextTaskType] = useState<CrmTaskType>('follow_up');
  const [nextDueAt, setNextDueAt] = useState('');
  const [nextPriority, setNextPriority] = useState<CrmTaskPriority>('normal');
  const [nextAssignedUserId, setNextAssignedUserId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setOutcome('Completed');
      setOutcomeRemarks('');
      setScheduleNext(false);
      setNextTitle('');
      setNextTaskType('follow_up');
      setNextDueAt('');
      setNextPriority('normal');
      setNextAssignedUserId(task?.assignedUserId || '');
      setError(null);
    }
  }, [isOpen, task]);

  if (!isOpen || !task) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!outcomeRemarks.trim()) {
      setError('Please provide outcome remarks or meeting summary.');
      return;
    }
    if (scheduleNext && !nextDueAt) {
      setError('Please specify a due date for the next follow-up task.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload: any = {
        outcome,
        outcomeRemarks: outcomeRemarks.trim()
      };

      if (scheduleNext) {
        payload.nextTask = {
          title: nextTitle.trim() || `Follow-up on ${task.title}`,
          taskType: nextTaskType,
          dueAt: new Date(nextDueAt).toISOString(),
          priority: nextPriority,
          assignedUserId: nextAssignedUserId || undefined
        };
      }

      const res = await fetch(`${serverUrl}/api/crm/tasks/${task.id}/close`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to close task');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error closing task');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="crm-geist-scope fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in select-none"
    >
      <div className="w-full max-w-lg bg-[#0e0e11] border border-[#27272a] rounded-2xl shadow-2xl overflow-hidden flex flex-col text-left">
        {/* Header */}
        <div className="p-5 border-b border-[#1f1f23] flex items-center justify-between bg-[#121216]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-white tracking-tight">Close Task / Meeting</h2>
              <p className="text-xs text-zinc-400 truncate max-w-xs">{task.title}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg border border-[#27272a] text-zinc-400 hover:text-white hover:bg-[#1f1f23]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Outcome Category */}
          <div>
            <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
              Task Outcome Status
            </label>
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
            >
              <option value="Completed">Completed / Satisfied</option>
              <option value="Won / Converted">Won / Deal Closed</option>
              <option value="Follow-up Required">Follow-up Required</option>
              <option value="Not Interested">Not Interested / Closed</option>
              <option value="No Answer / Unreachable">No Answer / Unreachable</option>
              <option value="Payment Received">Payment Received</option>
            </select>
          </div>

          {/* Outcome Remarks */}
          <div>
            <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
              Outcome Remarks / Meeting Summary <span className="text-amber-500">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={outcomeRemarks}
              onChange={(e) => setOutcomeRemarks(e.target.value)}
              placeholder="Detail the discussion, deliverables, next steps, or reasons for closure..."
              className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 resize-none"
            />
          </div>

          {/* Schedule Next Task Checkbox */}
          <div className="p-3 bg-[#141418] border border-[#27272a] rounded-xl space-y-3">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={scheduleNext}
                onChange={(e) => setScheduleNext(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-700 text-amber-500 focus:ring-amber-500/20 bg-zinc-900"
              />
              <span className="text-xs font-bold text-zinc-200">
                Schedule Chained Next Task / Follow-up
              </span>
            </label>

            {scheduleNext && (
              <div className="space-y-3 pt-2 border-t border-[#1f1f23]">
                <div>
                  <label className="block text-[11px] font-mono font-bold text-zinc-400 mb-1">
                    Next Task Title
                  </label>
                  <input
                    type="text"
                    value={nextTitle}
                    onChange={(e) => setNextTitle(e.target.value)}
                    placeholder={`e.g., Follow up on ${task.title}`}
                    className="w-full px-3 py-1.5 bg-[#18181b] border border-[#27272a] rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-mono font-bold text-zinc-400 mb-1">
                      Action Type
                    </label>
                    <select
                      value={nextTaskType}
                      onChange={(e) => setNextTaskType(e.target.value as CrmTaskType)}
                      className="w-full px-2.5 py-1.5 bg-[#18181b] border border-[#27272a] rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
                    >
                      <option value="follow_up">Follow-up</option>
                      <option value="call">Phone Call</option>
                      <option value="meeting">Meeting</option>
                      <option value="email">Email</option>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="payment">Payment</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono font-bold text-zinc-400 mb-1">
                      Due Date & Time
                    </label>
                    <input
                      type="datetime-local"
                      value={nextDueAt}
                      onChange={(e) => setNextDueAt(e.target.value)}
                      className="w-full px-2 py-1 bg-[#18181b] border border-[#27272a] rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-mono font-bold text-zinc-400 mb-1">
                      Priority
                    </label>
                    <select
                      value={nextPriority}
                      onChange={(e) => setNextPriority(e.target.value as CrmTaskPriority)}
                      className="w-full px-2.5 py-1.5 bg-[#18181b] border border-[#27272a] rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
                    >
                      <option value="low">Low</option>
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>

                  {users.length > 0 && (
                    <div>
                      <label className="block text-[11px] font-mono font-bold text-zinc-400 mb-1">
                        Assign Agent
                      </label>
                      <select
                        value={nextAssignedUserId}
                        onChange={(e) => setNextAssignedUserId(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-[#18181b] border border-[#27272a] rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
                      >
                        <option value="">Leave default / unassigned</option>
                        {users.map(u => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
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
              {submitting ? 'Closing...' : 'Confirm & Close Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// 2. RESCHEDULE TASK MODAL (from reference 09_reschedule_meeting_modal.png)
// -------------------------------------------------------------
interface RescheduleTaskModalProps extends ModalBaseProps {
  task: CrmTask | null;
  onSuccess: () => void;
  users?: Array<{ id: string; name: string }>;
}

export const RescheduleTaskModal: React.FC<RescheduleTaskModalProps> = ({
  isOpen,
  task,
  onClose,
  onSuccess,
  serverUrl,
  authToken,
  users = []
}) => {
  const [newDueAt, setNewDueAt] = useState('');
  const [taskType, setTaskType] = useState<CrmTaskType>('meeting');
  const [assignedUserId, setAssignedUserId] = useState('');
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && task) {
      setTaskType(task.taskType || 'meeting');
      setAssignedUserId(task.assignedUserId || '');
      setRemarks('');
      setError(null);
      // Format current dueAt for datetime-local input if present
      if (task.dueAt) {
        try {
          const d = new Date(task.dueAt);
          d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
          setNewDueAt(d.toISOString().slice(0, 16));
        } catch {
          setNewDueAt('');
        }
      }
    }
  }, [isOpen, task]);

  if (!isOpen || !task) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDueAt) {
      setError('Please select a new date and time.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`${serverUrl}/api/crm/tasks/${task.id}/reschedule`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          newDueAt: new Date(newDueAt).toISOString(),
          taskType,
          assignedUserId: assignedUserId || undefined,
          remarks: remarks.trim()
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to reschedule task');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error rescheduling task');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="crm-geist-scope fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in select-none"
    >
      <div className="w-full max-w-md bg-[#0e0e11] border border-[#27272a] rounded-2xl shadow-2xl overflow-hidden flex flex-col text-left">
        {/* Header */}
        <div className="p-5 border-b border-[#1f1f23] flex items-center justify-between bg-[#121216]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-white tracking-tight">Reschedule Task / Meeting</h2>
              <p className="text-xs text-zinc-400 truncate max-w-xs">{task.title}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg border border-[#27272a] text-zinc-400 hover:text-white hover:bg-[#1f1f23]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* New Due Date & Time */}
          <div>
            <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
              New Date & Time <span className="text-amber-500">*</span>
            </label>
            <input
              type="datetime-local"
              required
              value={newDueAt}
              onChange={(e) => setNewDueAt(e.target.value)}
              className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Action Type */}
          <div>
            <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
              Action / Task Type
            </label>
            <select
              value={taskType}
              onChange={(e) => setTaskType(e.target.value as CrmTaskType)}
              className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
            >
              <option value="meeting">Meeting</option>
              <option value="call">Call</option>
              <option value="follow_up">Follow-up</option>
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="payment">Payment</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Assigned Agent */}
          {users.length > 0 && (
            <div>
              <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
                Assign To Agent
              </label>
              <select
                value={assignedUserId}
                onChange={(e) => setAssignedUserId(e.target.value)}
                className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
              >
                <option value="">Leave default</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Remarks */}
          <div>
            <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
              Reason / Reschedule Notes
            </label>
            <textarea
              rows={3}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g., Client requested later slot due to conflicting review..."
              className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 resize-none"
            />
          </div>

          {/* Action Buttons */}
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
              {submitting ? 'Updating...' : 'Save & Reschedule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// 3. CANCEL TASK MODAL (from reference 10_cancel_meeting_modal.png)
// -------------------------------------------------------------
interface CancelTaskModalProps extends ModalBaseProps {
  task: CrmTask | null;
  onSuccess: () => void;
}

export const CancelTaskModal: React.FC<CancelTaskModalProps> = ({
  isOpen,
  task,
  onClose,
  onSuccess,
  serverUrl,
  authToken
}) => {
  const [cancellationReason, setCancellationReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setCancellationReason('');
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen || !task) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellationReason.trim()) {
      setError('Cancellation reason is required to close out the task.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`${serverUrl}/api/crm/tasks/${task.id}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          cancellationReason: cancellationReason.trim()
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to cancel task');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error cancelling task');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="crm-geist-scope fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in select-none"
    >
      <div className="w-full max-w-md bg-[#0e0e11] border border-red-500/20 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-left">
        {/* Header */}
        <div className="p-5 border-b border-[#1f1f23] flex items-center justify-between bg-red-950/20">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-white tracking-tight">Cancel Task / Meeting</h2>
              <p className="text-xs text-zinc-400 truncate max-w-xs">{task.title}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg border border-[#27272a] text-zinc-400 hover:text-white hover:bg-[#1f1f23]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <p className="text-xs text-zinc-300">
            This action will mark the task as cancelled and log the cancellation reason directly into the entity audit timeline.
          </p>

          {/* Cancellation Reason */}
          <div>
            <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
              Reason for Cancellation <span className="text-red-400">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={cancellationReason}
              onChange={(e) => setCancellationReason(e.target.value)}
              placeholder="e.g., Client requested project freeze / no longer requiring proposal..."
              className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-red-500 resize-none"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-3 border-t border-[#1f1f23] flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs font-bold text-zinc-300 hover:text-white hover:bg-[#202025] transition"
            >
              Keep Task
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-red-600/20 transition disabled:opacity-50"
            >
              {submitting ? 'Cancelling...' : 'Confirm Cancellation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// 4. ADD CLIENT COMPANY MODAL (from reference 04_add_client_company_modal.png)
// -------------------------------------------------------------
interface AddCompanyModalProps extends ModalBaseProps {
  onSuccess: (newCompany?: any) => void;
  users?: Array<{ id: string; name: string }>;
}

export const AddCompanyModal: React.FC<AddCompanyModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  serverUrl,
  authToken,
  users = []
}) => {
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState('');
  const [country, setCountry] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [address, setAddress] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'pending' | 'overdue' | 'due_soon'>('pending');
  const [assignedUserId, setAssignedUserId] = useState('');

  // Optional Contact & Note
  const [hasContact, setHasContact] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactRole, setContactRole] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [initialNote, setInitialNote] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setIndustry('');
      setCountry('');
      setPhone('');
      setEmail('');
      setWebsite('');
      setAddress('');
      setStatus('active');
      setPaymentStatus('pending');
      setAssignedUserId('');
      setHasContact(false);
      setContactName('');
      setContactRole('');
      setContactEmail('');
      setContactPhone('');
      setInitialNote('');
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Company name is required.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload: any = {
        name: name.trim(),
        industry: industry.trim() || undefined,
        country: country.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        website: website.trim() || undefined,
        address: address.trim() || undefined,
        status,
        paymentStatus,
        assignedUserId: assignedUserId || undefined,
        initialNote: initialNote.trim() || undefined
      };

      if (hasContact && contactName.trim()) {
        payload.initialContact = {
          name: contactName.trim(),
          roleTitle: contactRole.trim() || undefined,
          email: contactEmail.trim() || undefined,
          phone: contactPhone.trim() || undefined
        };
      }

      const res = await fetch(`${serverUrl}/api/crm/companies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create company');
      }

      const data = await res.json();
      onSuccess(data.company);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error creating company');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="crm-geist-scope fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in select-none"
    >
      <div className="w-full max-w-xl bg-[#0e0e11] border border-[#27272a] rounded-2xl shadow-2xl overflow-hidden flex flex-col text-left">
        {/* Header */}
        <div className="p-5 border-b border-[#1f1f23] flex items-center justify-between bg-[#121216]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-white tracking-tight">Add Client Company</h2>
              <p className="text-xs text-zinc-400">Register new enterprise or commercial account</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg border border-[#27272a] text-zinc-400 hover:text-white hover:bg-[#1f1f23]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Company Core */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
                Company Name <span className="text-amber-500">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Acme Corporation"
                className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
                Industry
              </label>
              <input
                type="text"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder="e.g. Logistics, Healthcare"
                className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
                Country / Region
              </label>
              <input
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="e.g. United Kingdom"
                className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
                Phone Number
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+44 20 7946 0991"
                className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contact@acme.com"
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
                onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')}
                className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
                Payment Status
              </label>
              <select
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value as any)}
                className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
              >
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="due_soon">Due Soon</option>
                <option value="overdue">Overdue</option>
              </select>
            </div>
          </div>

          {users.length > 0 && (
            <div>
              <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
                Assigned Account Manager
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
          )}

          {/* Initial Contact Toggle */}
          <div className="p-3 bg-[#141418] border border-[#27272a] rounded-xl space-y-3">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={hasContact}
                onChange={(e) => setHasContact(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-700 text-amber-500 focus:ring-amber-500/20 bg-zinc-900"
              />
              <span className="text-xs font-bold text-zinc-200">
                Add Primary Key Contact Person
              </span>
            </label>

            {hasContact && (
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#1f1f23]">
                <div>
                  <label className="block text-[11px] font-mono font-bold text-zinc-400 mb-1">
                    Contact Name
                  </label>
                  <input
                    type="text"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full px-2.5 py-1.5 bg-[#18181b] border border-[#27272a] rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-mono font-bold text-zinc-400 mb-1">
                    Job Title / Role
                  </label>
                  <input
                    type="text"
                    value={contactRole}
                    onChange={(e) => setContactRole(e.target.value)}
                    placeholder="Managing Director"
                    className="w-full px-2.5 py-1.5 bg-[#18181b] border border-[#27272a] rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-mono font-bold text-zinc-400 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="john@acme.com"
                    className="w-full px-2.5 py-1.5 bg-[#18181b] border border-[#27272a] rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-mono font-bold text-zinc-400 mb-1">
                    Direct Phone
                  </label>
                  <input
                    type="text"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="+44 7123 456789"
                    className="w-full px-2.5 py-1.5 bg-[#18181b] border border-[#27272a] rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Initial Note */}
          <div>
            <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
              Initial Requirement / Background Note
            </label>
            <textarea
              rows={2}
              value={initialNote}
              onChange={(e) => setInitialNote(e.target.value)}
              placeholder="Initial onboarding notes, contract details, or requirement summary..."
              className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 resize-none"
            />
          </div>

          {/* Action Buttons */}
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
              {submitting ? 'Creating...' : 'Create Company'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// 5. ADD CONTACT MODAL (from reference 05_add_contact_modal.png)
// -------------------------------------------------------------
interface AddContactModalProps extends ModalBaseProps {
  defaultCompanyId?: string;
  companies?: Array<{ id: string; name: string }>;
  onSuccess: (newContact?: any) => void;
  users?: Array<{ id: string; name: string }>;
}

export const AddContactModal: React.FC<AddContactModalProps> = ({
  isOpen,
  defaultCompanyId,
  companies = [],
  onClose,
  onSuccess,
  serverUrl,
  authToken,
  users: _users = []
}) => {
  const [crmCompanyId, setCrmCompanyId] = useState('');
  const [name, setName] = useState('');
  const [roleTitle, setRoleTitle] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [assignedUserId, setAssignedUserId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setCrmCompanyId(defaultCompanyId || (companies[0]?.id || ''));
      setName('');
      setRoleTitle('');
      setEmail('');
      setPhone('');
      setNotes('');
      setAssignedUserId('');
      setError(null);
    }
  }, [isOpen, defaultCompanyId, companies]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Contact name is required.');
      return;
    }
    if (!crmCompanyId) {
      setError('Please select or specify a client company.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`${serverUrl}/api/crm/contacts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          crmCompanyId,
          name: name.trim(),
          roleTitle: roleTitle.trim() || undefined,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          notes: notes.trim() || undefined,
          assignedUserId: assignedUserId || undefined
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create contact');
      }

      const data = await res.json();
      onSuccess(data.contact);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error creating contact');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="crm-geist-scope fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in select-none"
    >
      <div className="w-full max-w-md bg-[#0e0e11] border border-[#27272a] rounded-2xl shadow-2xl overflow-hidden flex flex-col text-left">
        {/* Header */}
        <div className="p-5 border-b border-[#1f1f23] flex items-center justify-between bg-[#121216]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-white tracking-tight">Add Contact Person</h2>
              <p className="text-xs text-zinc-400">Attach key individual to client company</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg border border-[#27272a] text-zinc-400 hover:text-white hover:bg-[#1f1f23]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Company Selection */}
          <div>
            <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
              Client Company <span className="text-amber-500">*</span>
            </label>
            <select
              required
              value={crmCompanyId}
              onChange={(e) => setCrmCompanyId(e.target.value)}
              className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
            >
              <option value="">Select Company</option>
              {companies.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Contact Name & Title */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
                Full Name <span className="text-amber-500">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Smith"
                className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
                Role / Title
              </label>
              <input
                type="text"
                value={roleTitle}
                onChange={(e) => setRoleTitle(e.target.value)}
                placeholder="Chief Operating Officer"
                className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Email & Phone */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@example.com"
                className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
                Phone Number
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+44 7123 456789"
                className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
              Contact Notes / Preferences
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Prefers WhatsApp in morning hours; primary budget decision maker..."
              className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 resize-none"
            />
          </div>

          {/* Action Buttons */}
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
              {submitting ? 'Saving...' : 'Save Contact'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// 6. ADD CANONICAL LEAD MODAL (from reference 02_add_lead_modal.png)
// -------------------------------------------------------------
interface AddLeadModalProps extends ModalBaseProps {
  companies?: Array<{ id: string; name: string }>;
  campaigns?: Array<{ id: string; name: string }>;
  defaultCompanyId?: string;
  onSuccess: (newLead?: any) => void;
  onDialLead?: (phone: string, leadId: string, leadName: string) => void;
}

export const AddLeadModal: React.FC<AddLeadModalProps> = ({
  isOpen,
  companies = [],
  campaigns = [],
  defaultCompanyId,
  onClose,
  onSuccess,
  onDialLead,
  serverUrl,
  authToken
}) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState('');
  const [requirement, setRequirement] = useState('');
  const [pipelineStatus, setPipelineStatus] = useState('new');
  const [crmCompanyId, setCrmCompanyId] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Quick Task Timer state
  const [createTask, setCreateTask] = useState(false);
  const [taskPreset, setTaskPreset] = useState<'15m' | '30m' | '1h' | '2h' | 'tomorrow' | 'custom'>('30m');
  const [customDueAt, setCustomDueAt] = useState('');
  const [taskPriority, setTaskPriority] = useState<CrmTaskPriority>('normal');
  const [taskType, setTaskType] = useState<CrmTaskType>('follow_up');
  const [taskTitle, setTaskTitle] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName('');
      setPhone('');
      setCompanyName('');
      setEmail('');
      setCountry('');
      setRequirement('');
      setPipelineStatus('new');
      setCrmCompanyId(defaultCompanyId || '');
      setCampaignId(campaigns[0]?.id || '');
      setError(null);
      setCreateTask(false);
      setTaskPreset('30m');
      setCustomDueAt('');
      setTaskPriority('normal');
      setTaskType('follow_up');
      setTaskTitle('');
    }
  }, [isOpen, defaultCompanyId, campaigns]);

  if (!isOpen) return null;

  const getDueAtFromPreset = (preset: string): string => {
    const now = Date.now();
    if (preset === '15m') return new Date(now + 15 * 60000).toISOString();
    if (preset === '30m') return new Date(now + 30 * 60000).toISOString();
    if (preset === '1h') return new Date(now + 60 * 60000).toISOString();
    if (preset === '2h') return new Date(now + 120 * 60000).toISOString();
    if (preset === 'tomorrow') {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d.toISOString();
    }
    if (preset === 'custom' && customDueAt) {
      const parsed = new Date(customDueAt).getTime();
      if (!isNaN(parsed)) {
        return new Date(parsed).toISOString();
      }
    }
    return new Date(now + 30 * 60000).toISOString();
  };

  const handleSave = async (forceTask: boolean = false, dialAfterSave: boolean = false) => {
    if (!name.trim()) {
      setError('Lead / contact name is required.');
      return;
    }
    if (!phone.trim()) {
      setError('Valid phone number is required.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const shouldIncludeTask = forceTask || createTask;
      const payload: any = {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        country: country.trim() || undefined,
        requirement: requirement.trim() || undefined,
        pipelineStatus,
        crmCompanyId: crmCompanyId || undefined,
        companyName: companyName.trim() || undefined,
        campaignId: campaignId || undefined
      };

      if (shouldIncludeTask) {
        payload.task = {
          title: taskTitle.trim() || `Follow up with ${name.trim()}${companyName.trim() ? ` (${companyName.trim()})` : ''}`,
          taskType,
          dueAt: getDueAtFromPreset(taskPreset),
          priority: taskPriority,
          description: requirement.trim() || undefined
        };
      }

      const res = await fetch(`${serverUrl}/api/crm/leads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create lead');
      }

      const data = await res.json();
      onSuccess(data.lead);

      if (dialAfterSave && onDialLead && data.lead) {
        onDialLead(data.lead.phone, data.lead.id, data.lead.name || 'Lead');
      }

      onClose();
    } catch (err: any) {
      setError(err.message || 'Error creating lead');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="crm-geist-scope fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in select-none"
    >
      <div className="w-full max-w-xl bg-[#0e0e11] border border-[#27272a] rounded-2xl shadow-2xl overflow-hidden flex flex-col text-left max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-[#1f1f23] flex items-center justify-between bg-[#121216]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Phone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-white tracking-tight">Quick Lead & Task Sync</h2>
              <p className="text-xs text-zinc-400">Register lead into unified dialer & start live task timer</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg border border-[#27272a] text-zinc-400 hover:text-white hover:bg-[#1f1f23]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Form */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Contact Name & Company Name */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
                Lead / Contact Name <span className="text-amber-500">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. John Doe"
                className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
                Company Name
              </label>
              <input
                type="text"
                list="crm-company-options"
                value={companyName}
                onChange={(e) => {
                  setCompanyName(e.target.value);
                  const matched = companies.find(c => c.name.toLowerCase() === e.target.value.toLowerCase());
                  if (matched) setCrmCompanyId(matched.id);
                }}
                placeholder="e.g. Apex Dynamics Ltd"
                className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
              />
              <datalist id="crm-company-options">
                {companies.map(c => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>
            </div>
          </div>

          {/* Phone Number & Email */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
                Phone Number <span className="text-amber-500">*</span>
              </label>
              <input
                type="text"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+44 7123 456789"
                className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="lead@company.com"
                className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Pipeline Stage Pills */}
          <div>
            <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
              Pipeline Stage
            </label>
            <div className="flex flex-wrap gap-1.5">
              {[
                { id: 'new', label: 'New Lead' },
                { id: 'contacted', label: 'Contacted' },
                { id: 'interested', label: 'Interested 👍' },
                { id: 'callback', label: 'Callback 📞' },
                { id: 'qualified', label: 'Qualified 🎯' },
                { id: 'not_interested', label: 'Not Interested ❌' },
              ].map(st => (
                <button
                  type="button"
                  key={st.id}
                  onClick={() => setPipelineStatus(st.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                    pipelineStatus === st.id
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-sm'
                      : 'bg-[#18181b] text-zinc-400 border border-[#27272a] hover:text-white hover:bg-[#202025]'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Task with Live Timer Toggle Section */}
          <div className="p-3.5 bg-[#141418] border border-[#27272a] rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={createTask}
                  onChange={(e) => setCreateTask(e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-700 text-amber-500 focus:ring-amber-500/20 bg-zinc-900"
                />
                <span className="text-xs font-extrabold text-white flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  Attach Quick Task with Countdown Timer
                </span>
              </label>
              <span className="text-[10px] font-mono text-zinc-500">Live Octal Timer</span>
            </div>

            {createTask && (
              <div className="space-y-3 pt-2.5 border-t border-[#1f1f23]">
                {/* Timer Presets */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-mono font-bold text-zinc-400">
                      Timer Preset (Turns RED When Expired)
                    </span>
                    <span className="text-[10px] text-amber-400 font-mono">
                      Due: {new Date(getDueAtFromPreset(taskPreset)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="grid grid-cols-6 gap-1.5">
                    {[
                      { id: '15m', label: '15m' },
                      { id: '30m', label: '30m' },
                      { id: '1h', label: '1h' },
                      { id: '2h', label: '2h' },
                      { id: 'tomorrow', label: 'Tmrw 9A' },
                      { id: 'custom', label: 'Custom' },
                    ].map(p => (
                      <button
                        type="button"
                        key={p.id}
                        onClick={() => setTaskPreset(p.id as any)}
                        className={`py-1.5 rounded-lg text-xs font-bold transition text-center ${
                          taskPreset === p.id
                            ? 'bg-amber-500 text-black font-extrabold shadow-sm'
                            : 'bg-[#18181b] text-zinc-400 border border-[#27272a] hover:text-white'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {taskPreset === 'custom' && (
                  <div>
                    <label className="block text-[11px] font-mono font-bold text-zinc-400 mb-1">
                      Custom Deadline Date & Time
                    </label>
                    <input
                      type="datetime-local"
                      value={customDueAt}
                      onChange={(e) => setCustomDueAt(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-[#18181b] border border-[#27272a] rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                )}

                {/* Priority & Action Type */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-mono font-bold text-zinc-400 mb-1">
                      Action Type
                    </label>
                    <select
                      value={taskType}
                      onChange={(e) => setTaskType(e.target.value as CrmTaskType)}
                      className="w-full px-2.5 py-1.5 bg-[#18181b] border border-[#27272a] rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
                    >
                      <option value="follow_up">Follow-up</option>
                      <option value="call">Phone Call</option>
                      <option value="meeting">Meeting</option>
                      <option value="email">Email</option>
                      <option value="whatsapp">WhatsApp</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-mono font-bold text-zinc-400 mb-1">
                      Priority
                    </label>
                    <select
                      value={taskPriority}
                      onChange={(e) => setTaskPriority(e.target.value as CrmTaskPriority)}
                      className="w-full px-2.5 py-1.5 bg-[#18181b] border border-[#27272a] rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
                    >
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent 🔥</option>
                    </select>
                  </div>
                </div>

                {/* Task Title */}
                <div>
                  <input
                    type="text"
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    placeholder={`e.g. Call back ${name || 'lead'} regarding quote`}
                    className="w-full px-3 py-1.5 bg-[#18181b] border border-[#27272a] rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Notes / Requirement */}
          <div>
            <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
              Requirement / Lead Notes
            </label>
            <textarea
              rows={2}
              value={requirement}
              onChange={(e) => setRequirement(e.target.value)}
              placeholder="Requirement brief, lead inquiry context, or special instructions..."
              className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 resize-none"
            />
          </div>
        </div>

        {/* Action Buttons Footer */}
        <div className="p-4 border-t border-[#1f1f23] bg-[#121216] flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs font-bold text-zinc-400 hover:text-white hover:bg-[#202025] transition"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleSave(false, false)}
              className="px-3.5 py-2 bg-[#18181b] border border-[#27272a] hover:border-zinc-500 rounded-xl text-xs font-bold text-zinc-200 hover:text-white transition disabled:opacity-50"
            >
              Save Lead Only
            </button>

            <button
              type="button"
              disabled={submitting}
              onClick={() => handleSave(true, false)}
              className="px-3.5 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-extrabold flex items-center gap-1.5 shadow-sm transition disabled:opacity-50"
            >
              <Clock className="w-3.5 h-3.5" />
              Save & Start Task Timer ⏱️
            </button>

            {onDialLead && (
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleSave(createTask, true)}
                className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-black font-black text-xs rounded-xl shadow-lg shadow-emerald-500/20 transition disabled:opacity-50 flex items-center gap-1.5"
              >
                <PhoneCall className="w-3.5 h-3.5" />
                Save & Dial Now 📞
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// 7. CREATE TASK / MEETING MODAL (General Task Creation)
// -------------------------------------------------------------
interface CreateTaskModalProps extends ModalBaseProps {
  defaultEntityType?: 'company' | 'contact' | 'lead';
  defaultEntityId?: string;
  defaultEntityName?: string;
  defaultTaskType?: CrmTaskType;
  companies?: Array<{ id: string; name: string }>;
  contacts?: Array<{ id: string; name: string }>;
  leads?: Array<{ id: string; name: string }>;
  users?: Array<{ id: string; name: string }>;
  onSuccess: (newTask?: any) => void;
}

export const CreateTaskModal: React.FC<CreateTaskModalProps> = ({
  isOpen,
  defaultEntityType,
  defaultEntityId,
  defaultEntityName,
  defaultTaskType = 'follow_up',
  companies = [],
  contacts: _contacts = [],
  leads = [],
  users = [],
  onClose,
  onSuccess,
  serverUrl,
  authToken
}) => {
  const [title, setTitle] = useState('');
  const [taskType, setTaskType] = useState<CrmTaskType>(defaultTaskType);
  const [priority, setPriority] = useState<CrmTaskPriority>('normal');
  const [dueAt, setDueAt] = useState('');
  const [description, setDescription] = useState('');

  // Target association
  const [crmCompanyId, setCrmCompanyId] = useState('');
  const [contactId, setContactId] = useState('');
  const [leadId, setLeadId] = useState('');
  const [assignedUserId, setAssignedUserId] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setTaskType(defaultTaskType || 'follow_up');
      setPriority('normal');
      setDescription('');
      setError(null);

      // Pre-populate association based on defaultEntityType
      if (defaultEntityType === 'company') {
        setCrmCompanyId(defaultEntityId || '');
        setContactId('');
        setLeadId('');
      } else if (defaultEntityType === 'contact') {
        setCrmCompanyId('');
        setContactId(defaultEntityId || '');
        setLeadId('');
      } else if (defaultEntityType === 'lead') {
        setCrmCompanyId('');
        setContactId('');
        setLeadId(defaultEntityId || '');
      } else {
        setCrmCompanyId('');
        setContactId('');
        setLeadId('');
      }

      // Default due date to tomorrow 10:00 AM
      const tmrw = new Date();
      tmrw.setDate(tmrw.getDate() + 1);
      tmrw.setHours(10, 0, 0, 0);
      tmrw.setMinutes(tmrw.getMinutes() - tmrw.getTimezoneOffset());
      setDueAt(tmrw.toISOString().slice(0, 16));
    }
  }, [isOpen, defaultEntityType, defaultEntityId, defaultTaskType]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Task title is required.');
      return;
    }
    if (!dueAt) {
      setError('Due date & time is required.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`${serverUrl}/api/crm/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          title: title.trim(),
          taskType,
          priority,
          dueAt: new Date(dueAt).toISOString(),
          description: description.trim() || undefined,
          crmCompanyId: crmCompanyId || undefined,
          contactId: contactId || undefined,
          leadId: leadId || undefined,
          assignedUserId: assignedUserId || undefined
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create task');
      }

      const data = await res.json();
      onSuccess(data.task);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error creating task');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="crm-geist-scope fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in select-none"
    >
      <div className="w-full max-w-lg bg-[#0e0e11] border border-[#27272a] rounded-2xl shadow-2xl overflow-hidden flex flex-col text-left">
        {/* Header */}
        <div className="p-5 border-b border-[#1f1f23] flex items-center justify-between bg-[#121216]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <CalendarCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-white tracking-tight">
                {(taskType === 'meeting' || taskType === 'online_meeting') ? 'Schedule Meeting Agenda' : 'Create Task / Action'}
              </h2>
              <p className="text-xs text-zinc-400">
                {defaultEntityName ? `Linked to ${defaultEntityName}` : (taskType === 'meeting' || taskType === 'online_meeting' ? 'Set up calendar meeting, attendees, and agenda' : 'Schedule call, task, payment, or follow-up')}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg border border-[#27272a] text-zinc-400 hover:text-white hover:bg-[#1f1f23]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
              Task Title <span className="text-amber-500">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Q3 Scope Alignment Call"
              className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Type & Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
                Task Type
              </label>
              <select
                value={taskType}
                onChange={(e) => setTaskType(e.target.value as CrmTaskType)}
                className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
              >
                <option value="meeting">Meeting</option>
                <option value="call">Call</option>
                <option value="follow_up">Follow-up</option>
                <option value="email">Email</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="payment">Payment</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as CrmTaskPriority)}
                className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          {/* Due At & Assignee */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
                Due Date & Time <span className="text-amber-500">*</span>
              </label>
              <input
                type="datetime-local"
                required
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
                <option value="">Unassigned / Current</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Linked Entity Overrides if not in subdrawer */}
          {!defaultEntityId && (
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#1f1f23]">
              {companies.length > 0 && (
                <div>
                  <label className="block text-[11px] font-mono font-bold text-zinc-400 mb-1">
                    Link Company
                  </label>
                  <select
                    value={crmCompanyId}
                    onChange={(e) => setCrmCompanyId(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-[#18181b] border border-[#27272a] rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="">None</option>
                    {companies.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {leads.length > 0 && (
                <div>
                  <label className="block text-[11px] font-mono font-bold text-zinc-400 mb-1">
                    Link Lead
                  </label>
                  <select
                    value={leadId}
                    onChange={(e) => setLeadId(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-[#18181b] border border-[#27272a] rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="">None</option>
                    {leads.map(l => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
              Task Instructions / Agenda
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Outline discussion points, deliverables, or objectives..."
              className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 resize-none"
            />
          </div>

          {/* Action Buttons */}
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
              {submitting ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Re-export extended Phase 2 modals
export * from './CRMEditModals';
export * from './CRMWorkModals';
export * from './CRMPricingModals';
