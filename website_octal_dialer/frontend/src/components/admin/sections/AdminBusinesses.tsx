import React, { useState, useEffect } from 'react';
import {
  Search, RefreshCw, Eye, AlertCircle, Globe
} from 'lucide-react';
import { BusinessDetail } from './BusinessDetail';

interface AdminBusinessesProps {
  isLight?: boolean;
  serverUrl: string;
  authToken: string;
  initialBusinessId?: string | null;
}

export const AdminBusinesses: React.FC<AdminBusinessesProps> = ({
  isLight,
  serverUrl,
  authToken,
  initialBusinessId
}) => {
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search
  const [search, setSearch] = useState('');
  const [countryFilter, setCountryFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Selected Business for Detail Workspace
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(initialBusinessId || null);

  const fetchTenants = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.append('search', search.trim());
      if (countryFilter !== 'ALL') params.append('country', countryFilter);
      if (statusFilter !== 'ALL') params.append('status', statusFilter);

      const res = await fetch(`${serverUrl}/admin/tenants?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      if (res.ok) {
        const json = await res.json();
        setTenants(json.tenants || []);
      } else {
        const err = await res.json();
        setError(err.error || 'Failed to load businesses.');
      }
    } catch (err: any) {
      setError(err.message || 'Connection error.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTenants();
  }, [search, countryFilter, statusFilter, serverUrl, authToken]);

  if (selectedBusinessId) {
    return (
      <BusinessDetail
        isLight={isLight}
        serverUrl={serverUrl}
        authToken={authToken}
        businessId={selectedBusinessId}
        onBack={() => {
          setSelectedBusinessId(null);
          fetchTenants();
        }}
      />
    );
  }

  const countries = Array.from(new Set(tenants.map(t => t.country || 'US'))).filter(Boolean);

  return (
    <div className="space-y-6 text-left">
      {/* ── Top Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-black font-display tracking-tight">Business / Tenant Organizations</h2>
          <p className="text-xs text-slate-400 font-medium mt-0.5">
            First-class organizations, tenant ownership, resource quotas, and topology oversight.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchTenants}
            disabled={loading}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold font-mono flex items-center gap-1.5 cursor-pointer transition ${
              isLight ? 'bg-white border-slate-300 hover:bg-slate-50 text-slate-700' : 'bg-[#18181b] border-[#18181b] hover:bg-[#27272a] text-slate-300'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs text-rose-500 bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl font-mono">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ── Search & Filter Controls ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by business name or owner..."
            className={`w-full rounded-xl pl-9 pr-3.5 py-2 text-xs font-mono placeholder-slate-500 focus:outline-none focus:border-amber-500 transition border ${
              isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-[#121215] border-[#18181b] text-white'
            }`}
          />
        </div>

        {/* Country Filter */}
        <select
          value={countryFilter}
          onChange={(e) => setCountryFilter(e.target.value)}
          className={`border rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:border-amber-500 cursor-pointer ${
            isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-[#121215] border-[#18181b] text-slate-300'
          }`}
        >
          <option value="ALL">All Countries</option>
          {countries.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={`border rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:border-amber-500 cursor-pointer ${
            isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-[#121215] border-[#18181b] text-slate-300'
          }`}
        >
          <option value="ALL">All Statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {/* ── Businesses Table ── */}
      <div className={`p-5 rounded-2xl border ${
        isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
      }`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className={`border-b text-[10px] uppercase ${
                isLight ? 'border-slate-200 text-slate-600 bg-slate-50' : 'border-[#18181b] text-slate-500'
              }`}>
                <th className="p-3">Business</th>
                <th className="p-3">Owner</th>
                <th className="p-3">Country</th>
                <th className="p-3">Plan</th>
                <th className="p-3">Users</th>
                <th className="p-3">Devices</th>
                <th className="p-3">Status</th>
                <th className="p-3">Created</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isLight ? 'divide-slate-200 text-slate-800' : 'divide-[#18181b]'}`}>
              {tenants.map((t: any) => (
                <tr key={t.id} className={`${isLight ? 'hover:bg-slate-50' : 'hover:bg-[#121215]/60'} transition`}>
                  {/* Business Name + Avatar */}
                  <td className="p-3 font-bold flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-amber-600 border border-amber-400/30 flex items-center justify-center text-xs font-black text-slate-950 shrink-0 shadow">
                      {t.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{t.name}</div>
                      <div className="text-[10px] text-slate-500">{t.slug}</div>
                    </div>
                  </td>

                  {/* Owner */}
                  <td className={`p-3 ${isLight ? 'text-slate-800' : 'text-slate-300'}`}>
                    <span className="font-bold">{t.ownerUsername || '—'}</span>
                  </td>

                  {/* Country */}
                  <td className="p-3 text-slate-400">
                    <span className="flex items-center gap-1">
                      <Globe className="w-3.5 h-3.5 text-slate-500" />
                      <span>{t.country || 'US'}</span>
                    </span>
                  </td>

                  {/* Plan */}
                  <td className="p-3 text-purple-400 font-bold">
                    {t.planName || 'Starter'}
                  </td>

                  {/* Users */}
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${
                      isLight ? 'bg-slate-100 border-slate-200 text-slate-800' : 'bg-[#121215] border-[#18181b] text-slate-300'
                    }`}>
                      {t.userCount || 0}
                    </span>
                  </td>

                  {/* Devices */}
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${
                      isLight ? 'bg-slate-100 border-slate-200 text-slate-800' : 'bg-[#121215] border-[#18181b] text-slate-300'
                    }`}>
                      {t.deviceCount || 0}
                    </span>
                  </td>

                  {/* Status */}
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${
                      t.status === 'active' 
                        ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800' 
                        : 'bg-red-950/40 text-red-400 border-red-800'
                    }`}>
                      {t.status}
                    </span>
                  </td>

                  {/* Created */}
                  <td className="p-3 text-slate-500 text-[10px]">
                    {new Date(t.createdAt).toLocaleDateString()}
                  </td>

                  {/* Action */}
                  <td className="p-3 text-right">
                    <button
                      onClick={() => setSelectedBusinessId(t.id)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold font-mono cursor-pointer transition flex items-center gap-1 ml-auto ${
                        isLight ? 'bg-slate-100 hover:bg-amber-500 hover:text-slate-950 text-slate-700' : 'bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-300'
                      }`}
                    >
                      <Eye className="w-3 h-3" />
                      <span>Inspect</span>
                    </button>
                  </td>
                </tr>
              ))}

              {tenants.length === 0 && !loading && (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-slate-500">
                    No businesses matching the selected criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
