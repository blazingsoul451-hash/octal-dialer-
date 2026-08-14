import React, { useState, useEffect } from 'react';
import { Database, Download, Filter, RefreshCw, CheckSquare, Square } from 'lucide-react';

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

      const res = await fetch(`${serverUrl}/leads?${params}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      if (res.ok) {
        const data = await res.json();
        setLeads(data.leads);
        setTotalPages(data.pagination.totalPages);
        setTotal(data.pagination.total);
      } else {
        const errorData = await res.json();
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
      const updatePromises = Array.from(selectedLeads).map(id =>
        fetch(`${serverUrl}/leads/${id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify({ status })
        })
      );

      await Promise.all(updatePromises);
      setSelectedLeads(new Set());
      fetchLeads();
    } catch {
      setError('Failed to update leads');
    }
  };

  const handleExport = () => {
    const params = new URLSearchParams({ format: 'csv' });
    if (sourceFilter) params.append('source', sourceFilter);
    if (statusFilter) params.append('status', statusFilter);

    const exportUrl = `${serverUrl}/leads/export?${params}`;
    window.open(exportUrl, '_blank');
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      new: 'bg-blue-500/20 text-blue-600 dark:text-blue-400',
      contacted: 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400',
      converted: 'bg-green-500/20 text-green-600 dark:text-green-400',
      invalid: 'bg-red-500/20 text-red-600 dark:text-red-400'
    };
    return styles[status as keyof typeof styles] || styles.new;
  };

  return (
    <div className={`h-full overflow-y-auto ${isLight ? 'bg-white' : 'bg-slate-900'}`}>
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Database className={`w-6 h-6 ${isLight ? 'text-amber-600' : 'text-amber-400'}`} />
            <h1 className={`text-2xl font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
              Scraped Leads
            </h1>
            <span className={`text-sm ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
              ({total} total)
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={fetchLeads}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                isLight
                  ? 'bg-slate-200 hover:bg-slate-300 text-slate-900'
                  : 'bg-slate-700 hover:bg-slate-600 text-white'
              }`}
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-lg transition-colors"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className={`mb-4 p-4 rounded-lg border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-800 border-slate-700'}`}>
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-slate-400" />
            <span className={`text-sm font-medium ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
              Filters
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className={`block text-xs font-medium mb-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                Source Module
              </label>
              <select
                value={sourceFilter}
                onChange={e => { setSourceFilter(e.target.value); setPage(1); }}
                className={`w-full px-3 py-2 rounded border text-sm ${
                  isLight
                    ? 'bg-white border-slate-300 text-slate-900'
                    : 'bg-slate-900 border-slate-600 text-white'
                }`}
              >
                <option value="">All Sources</option>
                <option value="googleScraper">Google Scraper</option>
                <option value="facebookScraper">Facebook Scraper</option>
              </select>
            </div>
            <div>
              <label className={`block text-xs font-medium mb-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                Status
              </label>
              <select
                value={statusFilter}
                onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                className={`w-full px-3 py-2 rounded border text-sm ${
                  isLight
                    ? 'bg-white border-slate-300 text-slate-900'
                    : 'bg-slate-900 border-slate-600 text-white'
                }`}
              >
                <option value="">All Statuses</option>
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="converted">Converted</option>
                <option value="invalid">Invalid</option>
              </select>
            </div>
          </div>
        </div>

        {/* Bulk Actions */}
        {selectedLeads.size > 0 && (
          <div className={`mb-4 p-3 rounded-lg border ${isLight ? 'bg-amber-50 border-amber-200' : 'bg-amber-900/20 border-amber-700'}`}>
            <div className="flex items-center justify-between">
              <span className={`text-sm font-medium ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                {selectedLeads.size} lead{selectedLeads.size > 1 ? 's' : ''} selected
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => handleBulkStatusUpdate('contacted')}
                  className="text-xs px-3 py-1 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-700 dark:text-yellow-400 rounded transition-colors"
                >
                  Mark Contacted
                </button>
                <button
                  onClick={() => handleBulkStatusUpdate('converted')}
                  className="text-xs px-3 py-1 bg-green-500/20 hover:bg-green-500/30 text-green-700 dark:text-green-400 rounded transition-colors"
                >
                  Mark Converted
                </button>
                <button
                  onClick={() => handleBulkStatusUpdate('invalid')}
                  className="text-xs px-3 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-700 dark:text-red-400 rounded transition-colors"
                >
                  Mark Invalid
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Table */}
        <div className={`rounded-lg border ${isLight ? 'bg-white border-slate-200' : 'bg-slate-800 border-slate-700'}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className={`${isLight ? 'bg-slate-50' : 'bg-slate-900'}`}>
                <tr>
                  <th className="px-4 py-3">
                    <button onClick={handleSelectAll} className="text-slate-400 hover:text-slate-600">
                      {selectedLeads.size === leads.length && leads.length > 0 ? (
                        <CheckSquare className="w-4 h-4" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className={`px-4 py-3 text-left text-xs font-bold uppercase ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                    Business
                  </th>
                  <th className={`px-4 py-3 text-left text-xs font-bold uppercase ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                    Contact
                  </th>
                  <th className={`px-4 py-3 text-left text-xs font-bold uppercase ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                    Source
                  </th>
                  <th className={`px-4 py-3 text-left text-xs font-bold uppercase ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                    Status
                  </th>
                  <th className={`px-4 py-3 text-left text-xs font-bold uppercase ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                    Scraped
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      Loading leads...
                    </td>
                  </tr>
                ) : leads.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      No leads found
                    </td>
                  </tr>
                ) : (
                  leads.map(lead => (
                    <tr key={lead.id} className={`border-t ${isLight ? 'border-slate-200' : 'border-slate-700'}`}>
                      <td className="px-4 py-3">
                        <button onClick={() => handleToggleSelect(lead.id)} className="text-slate-400 hover:text-slate-600">
                          {selectedLeads.has(lead.id) ? (
                            <CheckSquare className="w-4 h-4 text-amber-500" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                      <td className={`px-4 py-3 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                        <div className="font-medium">{lead.businessName || 'N/A'}</div>
                        {lead.website && (
                          <div className="text-xs text-blue-500 hover:underline">
                            <a href={lead.website} target="_blank" rel="noopener noreferrer">
                              {lead.website.substring(0, 30)}...
                            </a>
                          </div>
                        )}
                      </td>
                      <td className={`px-4 py-3 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                        {lead.phone && <div className="font-mono text-xs">{lead.phone}</div>}
                        {lead.email && <div className="text-xs text-slate-500">{lead.email}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs bg-slate-500/20 text-slate-600 dark:text-slate-400 px-2 py-1 rounded">
                          {lead.source}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded font-medium ${getStatusBadge(lead.status)}`}>
                          {lead.status.toUpperCase()}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-xs ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                        <div>{new Date(lead.scrapedAt).toLocaleDateString()}</div>
                        <div className="text-slate-500">by {lead.scrapedBy}</div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className={`px-3 py-1 rounded text-sm ${
                page === 1
                  ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                  : 'bg-slate-300 dark:bg-slate-700 text-slate-900 dark:text-white hover:bg-slate-400 dark:hover:bg-slate-600'
              }`}
            >
              Previous
            </button>
            <span className={`text-sm ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className={`px-3 py-1 rounded text-sm ${
                page === totalPages
                  ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                  : 'bg-slate-300 dark:bg-slate-700 text-slate-900 dark:text-white hover:bg-slate-400 dark:hover:bg-slate-600'
              }`}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
