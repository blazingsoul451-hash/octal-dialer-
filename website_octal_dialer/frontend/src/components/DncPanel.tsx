import React, { useState, useEffect } from 'react';
import { ShieldAlert, Plus, Trash2, Search, Upload, FileText, CheckCircle2, AlertCircle } from 'lucide-react';

interface DncEntry {
  id: string;
  phone: string;
  reason?: string;
  source?: string;
  addedAt: string;
}

interface DncPanelProps {
  isLight?: boolean;
  serverUrl: string;
  authToken: string;
}

export const DncPanel: React.FC<DncPanelProps> = ({ isLight, serverUrl, authToken }) => {
  const [entries, setEntries] = useState<DncEntry[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Single add form
  const [newPhone, setNewPhone] = useState('');
  const [newReason, setNewReason] = useState('Do Not Call Request');

  // Bulk import state
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkReason, setBulkReason] = useState('Bulk DNC List Import');

  const fetchDncList = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${serverUrl}/api/suppression-list`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setEntries(data);
      }
    } catch (err) {
      console.error('Error fetching DNC list:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDncList();
  }, [serverUrl, authToken]);

  const handleAddSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPhone.trim()) return;

    setError(null);
    try {
      const res = await fetch(`${serverUrl}/api/suppression-list`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ phone: newPhone.trim(), reason: newReason.trim() })
      });

      const data = await res.json();
      if (res.ok) {
        setSuccessMsg(`Added ${newPhone} to suppression list.`);
        setNewPhone('');
        fetchDncList();
        setTimeout(() => setSuccessMsg(null), 3000);
      } else {
        setError(data.error || 'Failed to add number.');
      }
    } catch {
      setError('Connection error while adding DNC entry.');
    }
  };

  const handleDelete = async (id: string, phone: string) => {
    if (!window.confirm(`Remove ${phone} from suppression list?`)) return;

    try {
      const res = await fetch(`${serverUrl}/api/suppression-list/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        setSuccessMsg(`Removed ${phone} from suppression list.`);
        fetchDncList();
        setTimeout(() => setSuccessMsg(null), 3000);
      }
    } catch {
      setError('Failed to delete DNC entry.');
    }
  };

  const handleBulkImport = async () => {
    if (!bulkText.trim()) return;

    const lines = bulkText.split('\n').map(l => l.trim()).filter(Boolean);
    const parsedEntries = lines.map(line => {
      const parts = line.split(',');
      return {
        phone: parts[0].trim(),
        reason: parts[1]?.trim() || bulkReason
      };
    }).filter(e => e.phone);

    if (parsedEntries.length === 0) return;

    try {
      const res = await fetch(`${serverUrl}/api/suppression-list/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ entries: parsedEntries, reason: bulkReason })
      });

      const data = await res.json();
      if (res.ok) {
        setSuccessMsg(`Bulk DNC Import: ${data.addedCount} added, ${data.skippedCount} skipped/duplicates.`);
        setBulkText('');
        setShowBulkModal(false);
        fetchDncList();
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        setError(data.error || 'Bulk import failed.');
      }
    } catch {
      setError('Connection error during bulk import.');
    }
  };

  const filteredEntries = entries.filter(e =>
    e.phone.toLowerCase().includes(search.toLowerCase()) ||
    (e.reason && e.reason.toLowerCase().includes(search.toLowerCase())) ||
    (e.source && e.source.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6 select-none text-left">
      {/* Top Banner Header */}
      <div className={`p-6 rounded-2xl border shadow-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-colors ${
        isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#09090b] border-[#18181b] text-white'
      }`}>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 shrink-0 shadow-sm">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h2 className={`text-xl font-black font-display tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
              DNC / Suppression Gate
            </h2>
            <p className="text-xs font-mono mt-1 text-zinc-400">
              Backend-enforced compliance list ({entries.length} numbers permanently suppressed)
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowBulkModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl font-mono font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-sm"
        >
          <Upload className="w-4 h-4" />
          <span>Bulk Import CSV</span>
        </button>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-4 rounded-2xl text-xs font-mono flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-2xl text-xs font-mono flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Add Single DNC Form */}
      <div className={`p-6 rounded-2xl border shadow-2xl ${
        isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
      }`}>
        <h3 className="text-xs font-mono font-black text-zinc-400 uppercase tracking-widest mb-4">
          Add Single Number to DNC List
        </h3>
        <form onSubmit={handleAddSingle} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
          <div className="md:col-span-5">
            <label className="block text-[10px] font-mono text-zinc-400 uppercase tracking-wider mb-1 font-bold">
              Phone Number
            </label>
            <input
              type="text"
              value={newPhone}
              onChange={e => setNewPhone(e.target.value)}
              placeholder="+923001234567"
              required
              className={`w-full px-4 py-2.5 text-xs font-mono rounded-xl border focus:outline-none focus:border-red-500 transition ${
                isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-[#121215] border-[#27272a] text-white'
              }`}
            />
          </div>

          <div className="md:col-span-5">
            <label className="block text-[10px] font-mono text-zinc-400 uppercase tracking-wider mb-1 font-bold">
              Suppression Reason
            </label>
            <input
              type="text"
              value={newReason}
              onChange={e => setNewReason(e.target.value)}
              placeholder="e.g. Requested Opt-Out"
              className={`w-full px-4 py-2.5 text-xs font-mono rounded-xl border focus:outline-none focus:border-red-500 transition ${
                isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-[#121215] border-[#27272a] text-white'
              }`}
            />
          </div>

          <div className="md:col-span-2">
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Add DNC</span>
            </button>
          </div>
        </form>
      </div>

      {/* Suppression List Table */}
      <div className={`p-6 rounded-2xl border shadow-2xl ${
        isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
      }`}>
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 mb-6">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search DNC list by phone, reason, source..."
              className={`w-full pl-9 pr-4 py-2 text-xs font-mono rounded-xl border focus:outline-none focus:border-red-500 transition ${
                isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-[#121215] border-[#27272a] text-white'
              }`}
            />
          </div>
          <span className="text-xs font-mono text-zinc-400">
            Showing {filteredEntries.length} of {entries.length} blocked numbers
          </span>
        </div>

        {filteredEntries.length === 0 ? (
          <div className="text-center py-12 text-zinc-500 font-mono text-xs">
            {search ? 'No DNC entries match your search query.' : 'No numbers currently on the DNC suppression list.'}
          </div>
        ) : (
          <div className={`overflow-x-auto rounded-2xl border ${isLight ? 'border-slate-200' : 'border-[#18181b]'}`}>
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className={`border-b uppercase tracking-widest text-[10px] ${
                  isLight ? 'bg-slate-50 border-slate-200 text-slate-600' : 'bg-[#121215] border-[#18181b] text-zinc-400'
                }`}>
                  <th className="p-3.5">Phone Number</th>
                  <th className="p-3.5">Reason</th>
                  <th className="p-3.5">Source</th>
                  <th className="p-3.5">Added Date</th>
                  <th className="p-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isLight ? 'divide-slate-200 text-slate-800' : 'divide-[#18181b] text-zinc-300'}`}>
                {filteredEntries.map(entry => (
                  <tr key={entry.id} className={`${isLight ? 'hover:bg-slate-50' : 'hover:bg-[#121215]/60'} transition-colors`}>
                    <td className="p-3.5 font-bold text-red-500">
                      {entry.phone}
                    </td>
                    <td className={`p-3.5 ${isLight ? 'text-slate-700' : 'text-zinc-300'}`}>
                      {entry.reason || 'Manual DNC'}
                    </td>
                    <td className={`p-3.5 uppercase text-[10px] ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
                      {entry.source || 'dashboard'}
                    </td>
                    <td className={`p-3.5 text-[10px] ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
                      {new Date(entry.addedAt).toLocaleString()}
                    </td>
                    <td className="p-3.5 text-right">
                      <button
                        onClick={() => handleDelete(entry.id, entry.phone)}
                        className="p-1.5 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors cursor-pointer"
                        title="Remove from DNC list"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bulk Import Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className={`w-full max-w-lg p-6 rounded-2xl border shadow-2xl ${
            isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#09090b] border-[#18181b] text-white'
          }`}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-mono font-bold uppercase tracking-wider flex items-center gap-2">
                <FileText className="w-4 h-4 text-red-400" />
                <span>Bulk Import DNC Numbers</span>
              </h3>
              <button
                onClick={() => setShowBulkModal(false)}
                className="text-zinc-500 hover:text-white font-mono text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs font-mono text-zinc-400 mb-4">
              Paste phone numbers (one per line, optional comma-separated reason):
            </p>

            <textarea
              rows={8}
              value={bulkText}
              onChange={e => setBulkText(e.target.value)}
              placeholder="+923001112233, Requested Opt-Out&#10;+923004445566, Customer Complaint&#10;+923219998877"
              className={`w-full p-3 text-xs font-mono rounded-xl border mb-4 focus:outline-none focus:border-red-500 transition ${
                isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-[#121215] border-[#27272a] text-white'
              }`}
            />

            <div className="mb-4">
              <label className="block text-[10px] font-mono text-zinc-400 uppercase tracking-wider mb-1 font-bold">
                Default Reason (if omitted)
              </label>
              <input
                type="text"
                value={bulkReason}
                onChange={e => setBulkReason(e.target.value)}
                className={`w-full px-3.5 py-2 text-xs font-mono rounded-xl border ${
                  isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-[#121215] border-[#27272a] text-white'
                }`}
              />
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowBulkModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-mono text-zinc-400 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkImport}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer shadow-sm"
              >
                Import Numbers
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
