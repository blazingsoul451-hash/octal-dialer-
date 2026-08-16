import React, { useState, useEffect } from 'react';
import {
  Building2, Search, Filter, RefreshCw, Eye, AlertCircle, Globe, Users,
  Smartphone, CreditCard, CheckCircle2, ShieldAlert
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
  const [planFilter, setPlanFilter] = useState('ALL');

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
      if (planFilter !== 'ALL') params.append('plan', planFilter);

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
  }, [search, countryFilter, statusFilter, planFilter, serverUrl, authToken]);

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
              isLight ? 'bg-white border-slate-300 hover:bg-slate-50 text-slate-700' : 'bg-slate-900 border-slate-800 hover:bg-slate-850 text-slate-300'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* ── Search & Filter Controls ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by business name or owner..."
            className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-9 pr-3.5 py-2 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
          />
        </div>

        {/* Country Filter */}
        <select
          value={countryFilter}
          onChange={(e) => setCountryFilter(e.target.value)}
          className="bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-300 focus:outline-none focus:border-amber-500 cursor-pointer"
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
          className="bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-300 focus:outline-none focus:border-amber-500 cursor-pointer"
        >
          <option value="ALL">All Statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {/* ── Businesses Table ── */}
      <div className={`p-5 rounded-2xl border ${
        isLight ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
      }`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] text-slate-500 uppercase">
                <th className="pb-3">Business</th>
                <th className="pb-3">Owner</th>
                <th className="pb-3">Country</th>
                <th className="pb-3">Plan</th>
                <th className="pb-3">Users</th>
                <th className="pb-3">Devices</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Created</th>
                <th className="pb-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {tenants.map((t: any) => (
                <tr key={t.id} className="hover:bg-slate-800/40 transition">
                  {/* Business Name + Avatar */}
                  <td className="py-3 font-bold text-white flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-amber-600 border border-amber-400/30 flex items-center justify-center text-xs font-black text-slate-950 shrink-0 shadow">
                      {t.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-white font-bold">{t.name}</div>
                      <div className="text-[10px] text-slate-500">{t.slug}</div>
                    </div>
                  </td>

                  {/* Owner */}
                  <td className="py-3 text-slate-300">
                    <span className="font-bold">{t.ownerUsername || '—'}</span>
                  </td>

                  {/* Country */}
                  <td className="py-3 text-slate-400">
                    <span className="flex items-center gap-1">
                      <Globe className="w-3.5 h-3.5 text-slate-500" />
                      <span>{t.country || 'US'}</span>
                    </span>
                  </td>

                  {/* Plan */}
                  <td className="py-3 text-purple-300 font-bold">
                    {t.planName || 'Starter'}
                  </td>

                  {/* Users */}
                  <td className="py-3 text-slate-300">
                    <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-[10px] font-bold">
                      {t.userCount || 0}
                    </span>
                  </td>

                  {/* Devices */}
                  <td className="py-3 text-slate-300">
                    <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-[10px] font-bold">
                      {t.deviceCount || 0}
                    </span>
                  </td>

                  {/* Status */}
                  <td className="py-3">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${
                      t.status === 'active' 
                        ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800' 
                        : 'bg-red-950/40 text-red-400 border-red-800'
                    }`}>
                      {t.status}
                    </span>
                  </td>

                  {/* Created */}
                  <td className="py-3 text-slate-500 text-[10px]">
                    {new Date(t.createdAt).toLocaleDateString()}
                  </td>

                  {/* Action */}
                  <td className="py-3 text-right">
                    <button
                      onClick={() => setSelectedBusinessId(t.id)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-300 text-[10px] font-bold font-mono cursor-pointer transition flex items-center gap-1 ml-auto"
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
