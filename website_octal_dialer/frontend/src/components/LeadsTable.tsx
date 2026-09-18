import React, { useState, useEffect } from 'react';
import { Database, Download, Filter, RefreshCw, CheckSquare, Square } from 'lucide-react';
import { LeadProfileDrawer } from './crm/LeadProfileDrawer';

interface Lead {
  id: string;
  source: string;
  businessName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  website: string | null;
  status: 'new' | 'contacted' | 'converted' | 'invalid';
  scrapedBy: string;
  scrapedAt: string;
}

interface LeadsTableProps {
  isLight?: boolean;
  serverUrl: string;
  authToken: string;
  contextSource?: string; // If provided, auto-filter by this source
}

export const LeadsTable: React.FC<LeadsTableProps> = ({ isLight, serverUrl, authToken, contextSource }) => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [selectedLeadForDrawer, setSelectedLeadForDrawer] = useState<string | null>(null);

  // Filters
  const [sourceFilter, setSourceFilter] = useState(contextSource || '');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchLeads = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '50'
      });
      if (sourceFilter) params.append('source', sourceFilter);
      if (statusFilter) params.append('status', statusFilter);

      const targetUrl = serverUrl && serverUrl.startsWith('http') ? serverUrl : window.location.origin;
      const res = await fetch(`${targetUrl}/leads?${params}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      if (res.ok) {
        const data = await res.json();
        setLeads(data.leads || []);
        setTotalPages(data.pagination?.totalPages || 1);
        setTotal(data.pagination?.total || 0);
      } else {
        const errorData = await res.json().catch(() => ({}));
        setError(errorData.error || 'Failed to fetch leads');
      }
    } catch {
      setError('Connection error while fetching leads');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, [page, sourceFilter, statusFilter, serverUrl, authToken]);

  const handleToggleSelect = (leadId: string) => {
    const newSelected = new Set(selectedLeads);
    if (newSelected.has(leadId)) {
      newSelected.delete(leadId);
    } else {
      newSelected.add(leadId);
    }
    setSelectedLeads(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedLeads.size === leads.length) {
      setSelectedLeads(new Set());
    } else {
      setSelectedLeads(new Set(leads.map(l => l.id)));
    }
  };

  const handleBulkStatusUpdate = async (status: string) => {
    if (selectedLeads.size === 0) return;

    try {
      const targetUrl = serverUrl && serverUrl.startsWith('http') ? serverUrl : window.location.origin;
      const updatePromises = Array.from(selectedLeads).map(id =>
        fetch(`${targetUrl}/leads/${id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify({ status })
        })
      );

      const results = await Promise.all(updatePromises);
      if (results.some(result => !result.ok)) throw new Error('One or more lead updates failed.');
      setSelectedLeads(new Set());
      fetchLeads();
    } catch {
      setError('Failed to update leads');
    }
  };

  const handleExport = async () => {
    try {
      const params = new URLSearchParams({ format: 'csv' });
      if (sourceFilter) params.append('source', sourceFilter);
      if (statusFilter) params.append('status', statusFilter);

      const targetUrl = serverUrl && serverUrl.startsWith('http') ? serverUrl : window.location.origin;
      const res = await fetch(`${targetUrl}/api/leads/export?${params}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (!res.ok) throw new Error('Failed to export leads');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `octal_dialer_leads_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      setError('Failed to export leads: ' + err.message);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      new: isLight ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-blue-500/10 text-blue-400 border border-blue-500/30',
      contacted: isLight ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-amber-500/10 text-amber-400 border border-amber-500/30',
      converted: isLight ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30',
      invalid: isLight ? 'bg-red-50 text-red-700 border-red-200' : 'bg-red-500/10 text-red-400 border border-red-500/30'
    };
    return styles[status as keyof typeof styles] || styles.new;
  };

  return (
    <div className={`h-full w-full overflow-y-auto ${isLight ? 'bg-slate-100 text-slate-900' : 'bg-black text-slate-100'}`}>
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        
        {/* Top Header Card */}
        <div className={`p-6 border rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${
          isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#09090b] border-[#18181b] shadow-2xl'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <Database className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className={`text-xl font-black font-display tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  Central Leads Database
                </h1>
                <span className="text-xs px-2 py-0.5 rounded-full font-mono font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                  {total.toLocaleString()} leads
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Browse, search, and manage leads synced across campaigns and scrapers.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={fetchLeads}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                isLight
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200'
                  : 'bg-[#18181b] hover:bg-[#27272a] text-zinc-200 border border-[#27272a]'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs px-4 py-2 rounded-xl transition-all cursor-pointer shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Filters Card */}
        <div className={`p-5 rounded-2xl border transition-colors ${
          isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b] shadow-xl'
        }`}>
          <div className="flex items-center gap-2 mb-3 select-none">
            <Filter className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-xs font-mono font-black uppercase tracking-wider text-amber-500">
              Filter Pipeline
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-mono font-bold uppercase text-zinc-400 mb-1.5">
                Source Campaign
              </label>
              <input
                type="text"
                value={sourceFilter}
                placeholder="Search by campaign name or ID..."
                onChange={e => { setSourceFilter(e.target.value); setPage(1); }}
                className={`w-full px-3.5 py-2.5 rounded-xl border text-xs font-medium focus:outline-none focus:border-amber-500 transition ${
                  isLight
                    ? 'bg-slate-50 border-slate-200 text-slate-900'
                    : 'bg-[#121215] border-[#27272a] text-white placeholder:text-zinc-600'
                }`}
              />
            </div>
            <div>
              <label className="block text-[11px] font-mono font-bold uppercase text-zinc-400 mb-1.5">
                Lead Status
              </label>
              <select
                value={statusFilter}
                onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                className={`w-full px-3.5 py-2.5 rounded-xl border text-xs font-medium focus:outline-none focus:border-amber-500 transition cursor-pointer ${
                  isLight
                    ? 'bg-slate-50 border-slate-200 text-slate-900'
                    : 'bg-[#121215] border-[#27272a] text-white'
                }`}
              >
                <option value="">All Statuses</option>
                <option value="PENDING">Pending (New)</option>
                <option value="COMPLETED">Completed (Converted)</option>
                <option value="ANSWERED">Answered / Reached</option>
                <option value="NO_ANSWER">No Answer</option>
                <option value="DNC">Suppressed / DNC</option>
              </select>
            </div>
          </div>
        </div>

        {/* Bulk Actions */}
        {selectedLeads.size > 0 && (
          <div className={`p-3.5 rounded-2xl border flex items-center justify-between ${
            isLight ? 'bg-amber-50 border-amber-200' : 'bg-amber-500/10 border-amber-500/30'
          }`}>
            <span className="text-xs font-bold text-amber-400">
              {selectedLeads.size} lead{selectedLeads.size > 1 ? 's' : ''} selected
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => handleBulkStatusUpdate('ANSWERED')}
                className="text-xs px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 rounded-lg transition-colors font-bold cursor-pointer"
              >
                Mark Reached
              </button>
              <button
                onClick={() => handleBulkStatusUpdate('COMPLETED')}
                className="text-xs px-3 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded-lg transition-colors font-bold cursor-pointer"
              >
                Mark Converted
              </button>
              <button
                onClick={() => handleBulkStatusUpdate('DNC')}
                className="text-xs px-3 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors font-bold cursor-pointer"
              >
                Mark DNC
              </button>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl px-4 py-3 text-xs font-mono text-red-400">
            {error}
          </div>
        )}

        {/* Leads Table Container */}
        <div className={`rounded-2xl border overflow-hidden transition-colors ${
          isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#09090b] border-[#18181b] shadow-2xl'
        }`}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className={isLight ? 'bg-slate-50 border-b border-slate-200' : 'bg-[#121215] border-b border-[#18181b]'}>
                <tr>
                  <th className="px-4 py-3.5 w-12 text-center">
                    <button onClick={handleSelectAll} className="text-zinc-500 hover:text-white cursor-pointer">
                      {selectedLeads.size === leads.length && leads.length > 0 ? (
                        <CheckSquare className="w-4 h-4 text-amber-500" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-3.5 text-left font-mono font-bold uppercase tracking-wider text-zinc-400">
                    Business / Lead
                  </th>
                  <th className="px-4 py-3.5 text-left font-mono font-bold uppercase tracking-wider text-zinc-400">
                    Contact Phone
                  </th>
                  <th className="px-4 py-3.5 text-left font-mono font-bold uppercase tracking-wider text-zinc-400">
                    Campaign Source
                  </th>
                  <th className="px-4 py-3.5 text-left font-mono font-bold uppercase tracking-wider text-zinc-400">
                    Status
                  </th>
                  <th className="px-4 py-3.5 text-left font-mono font-bold uppercase tracking-wider text-zinc-400">
                    Created / Synced
                  </th>
                </tr>
              </thead>
              <tbody className={isLight ? 'divide-y divide-slate-100' : 'divide-y divide-[#18181b]'}>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-zinc-500 font-mono">
                      Loading leads...
                    </td>
                  </tr>
                ) : leads.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-zinc-500 font-mono">
                      No leads found matching your criteria.
                    </td>
                  </tr>
                ) : (
                  leads.map(lead => (
                    <tr key={lead.id} className={isLight ? 'hover:bg-slate-50 transition' : 'hover:bg-[#121215]/60 transition'}>
                      <td className="px-4 py-3.5 text-center">
                        <button onClick={() => handleToggleSelect(lead.id)} className={`cursor-pointer ${isLight ? 'text-slate-400 hover:text-slate-700' : 'text-zinc-500 hover:text-white'}`}>
                          {selectedLeads.has(lead.id) ? (
                            <CheckSquare className="w-4 h-4 text-amber-500" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3.5 font-medium">
                        <button
                          onClick={() => setSelectedLeadForDrawer(lead.id)}
                          className={`font-bold hover:text-amber-500 transition cursor-pointer text-left block ${isLight ? 'text-slate-900' : 'text-white'}`}
                        >
                          {lead.businessName || 'Unnamed Contact'}
                        </button>
                      </td>
                      <td className={`px-4 py-3.5 font-mono font-bold ${isLight ? 'text-slate-800' : 'text-zinc-300'}`}>
                        {lead.phone || '—'}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`px-2.5 py-1 rounded-lg text-[11px] font-mono ${
                          isLight ? 'bg-slate-100 border border-slate-200 text-slate-700' : 'bg-[#18181b] border border-[#27272a] text-zinc-300'
                        }`}>
                          {lead.source}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${getStatusBadge(lead.status)}`}>
                          {lead.status}
                        </span>
                      </td>
                      <td className={`px-4 py-3.5 font-mono text-[11px] ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
                        {new Date(lead.scrapedAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                page === 1
                  ? isLight
                    ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                    : 'bg-[#18181b] text-zinc-600 border border-[#27272a] cursor-not-allowed'
                  : isLight
                  ? 'bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 shadow-sm cursor-pointer'
                  : 'bg-[#18181b] hover:bg-[#27272a] text-white border border-[#27272a] cursor-pointer'
              }`}
            >
              Previous
            </button>
            <span className={`text-xs font-mono ${isLight ? 'text-slate-600 font-bold' : 'text-zinc-400'}`}>
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                page === totalPages
                  ? isLight
                    ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                    : 'bg-[#18181b] text-zinc-600 border border-[#27272a] cursor-not-allowed'
                  : isLight
                  ? 'bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 shadow-sm cursor-pointer'
                  : 'bg-[#18181b] hover:bg-[#27272a] text-white border border-[#27272a] cursor-pointer'
              }`}
            >
              Next
            </button>
          </div>
        )}

      </div>

      {/* ── Lead Intelligence Profile Drawer ── */}
      <LeadProfileDrawer
        isLight={isLight}
        leadId={selectedLeadForDrawer}
        isOpen={Boolean(selectedLeadForDrawer)}
        onClose={() => setSelectedLeadForDrawer(null)}
        serverUrl={serverUrl}
        authToken={authToken}
      />
    </div>
  );
};
