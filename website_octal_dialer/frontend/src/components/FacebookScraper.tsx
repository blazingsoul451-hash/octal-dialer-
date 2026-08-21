import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Database, Download, RefreshCw, Facebook, MapPin, Eye, Link } from 'lucide-react';

interface FacebookScraperProps {
  isLight?: boolean;
  serverUrl: string;
  authToken?: string;
  activeSubTab?: string;
}

interface Account {
  profileId: string;
  name: string;
  status: string;
  note: string;
}

interface ScrapedLead {
  name: string;
  email: string;
  phone: string;
  city: string;
  url: string;
}

export const FacebookScraper: React.FC<FacebookScraperProps> = ({
  isLight = false,
  serverUrl,
  authToken,
  activeSubTab = 'fb-scraper'
}) => {
  // Input fields
  const [keyword, setKeyword] = useState('');
  const [location, setLocation] = useState('');
  const [selectedAccount, setSelectedAccount] = useState('');
  const [maxLeads, setMaxLeads] = useState(200);

  // Loaded states
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'failed'>('idle');
  const [logs, setLogs] = useState<string[]>([]);
  const [leads, setLeads] = useState<ScrapedLead[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const logEndRef = useRef<HTMLDivElement>(null);

  // Fetch profiles
  const fetchAccounts = async () => {
    setLoadingAccounts(true);
    try {
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch(`${serverUrl}/api/facebook-poster/accounts`, { headers });
      if (res.ok) {
        const data = await res.json();
        setAccounts(data);
        if (data.length > 0 && !selectedAccount) {
          setSelectedAccount(data[0].profileId);
        }
      }
    } catch (_) {}
    setLoadingAccounts(false);
  };

  // Fetch status
  const fetchStatus = async () => {
    try {
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch(`${serverUrl}/api/facebook-scraper/status`, { headers });
      if (res.ok) {
        const data = await res.json();
        setStatus(data.status);
        setLogs(data.logs || []);
        setLeads(data.leads || []);
      }
    } catch (_) {}
  };

  useEffect(() => {
    fetchAccounts();
    fetchStatus();
  }, [serverUrl, authToken]);

  useEffect(() => {
    let timer: any = null;
    if (status === 'running') {
      timer = setInterval(fetchStatus, 2000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [status]);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const handleStartScraper = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword.trim() || !selectedAccount) return;
    setError(null);
    setActionLoading(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch(`${serverUrl}/api/facebook-scraper/run`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          keyword: keyword.trim(),
          location: location.trim(),
          account: selectedAccount,
          maxLeads
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start Facebook scraper');
      setStatus('running');
      fetchStatus();
    } catch (err: any) {
      setError(err.message || 'Error starting Facebook scraper.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStopScraper = async () => {
    setActionLoading(true);
    try {
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch(`${serverUrl}/api/facebook-scraper/stop`, {
        method: 'POST',
        headers
      });
      if (res.ok) {
        setStatus('failed');
        fetchStatus();
      }
    } catch (_) {}
    setActionLoading(false);
  };

  const handleDownload = (format: 'csv' | 'xlsx') => {
    if (!authToken) return;
    const url = `${serverUrl}/api/facebook-scraper/download?format=${format}&token=${encodeURIComponent(authToken)}`;
    window.open(url, '_blank');
  };

  const cardBg = isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]';
  const labelColor = isLight ? 'text-slate-700' : 'text-zinc-400 font-mono font-bold';
  const inputBg = isLight ? 'bg-slate-50 border-slate-200 text-slate-900 focus:bg-white' : 'bg-[#121215] border-[#27272a] text-white focus:border-amber-500 font-mono';

  if (activeSubTab === 'fb-scraper-files') {
    return (
      <div className="space-y-6 select-none text-left">
        <div className={`p-6 rounded-2xl border ${cardBg} shadow-2xl text-left`}>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className={`text-lg font-bold tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                Scraped Lead Files
              </h2>
              <p className="text-xs mt-1 text-zinc-400">
                Download and manage your extracted Facebook leads data files.
              </p>
            </div>
            <button
              onClick={fetchStatus}
              className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                isLight ? 'hover:bg-slate-100 border-slate-200 text-slate-600' : 'bg-[#18181b] hover:bg-[#27272a] border-[#27272a] text-zinc-300'
              }`}
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className={`p-5 rounded-2xl border flex flex-col justify-between ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#121215] border-[#27272a]'}`}>
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
                  <Database className="w-6 h-6" />
                </div>
                <div>
                  <h3 className={`font-bold ${isLight ? 'text-slate-800' : 'text-white'}`}>Excel Spreadsheet</h3>
                  <p className="text-xs text-zinc-400">Perfect for importing into CRMs and viewing in Excel</p>
                </div>
              </div>
              <button
                onClick={() => handleDownload('xlsx')}
                disabled={leads.length === 0}
                className="mt-5 w-full flex items-center justify-center gap-2 py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-30 text-black font-bold rounded-xl transition-all cursor-pointer shadow-sm"
              >
                <Download className="w-4.5 h-4.5" />
                <span>Download XLSX Report</span>
              </button>
            </div>

            <div className={`p-5 rounded-2xl border flex flex-col justify-between ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#121215] border-[#27272a]'}`}>
              <div className="flex items-center gap-3">
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
                  <Download className="w-6 h-6" />
                </div>
                <div>
                  <h3 className={`font-bold ${isLight ? 'text-slate-800' : 'text-white'}`}>CSV Flat File</h3>
                  <p className="text-xs text-zinc-400">Lightweight comma-separated format</p>
                </div>
              </div>
              <button
                onClick={() => handleDownload('csv')}
                disabled={leads.length === 0}
                className="mt-5 w-full flex items-center justify-center gap-2 py-3 px-4 bg-amber-500 hover:bg-amber-400 disabled:opacity-30 text-black font-bold rounded-xl transition-all cursor-pointer shadow-sm"
              >
                <Download className="w-4.5 h-4.5" />
                <span>Download CSV Report</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-left select-none">
      {/* Configuration Panel */}
      <div className={`lg:col-span-1 p-6 rounded-2xl border ${cardBg} shadow-2xl flex flex-col justify-between`}>
        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-500">
              <Facebook className="w-6 h-6" />
            </div>
            <div>
              <h2 className={`font-bold text-lg tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                Facebook Lead Scraper
              </h2>
              <p className="text-xs text-zinc-400">Public profile & business phone extractor</p>
            </div>
          </div>

          <form onSubmit={handleStartScraper} className="space-y-4 font-mono text-xs">
            <div className="space-y-1.5">
              <label className={`text-[10px] uppercase font-bold ${labelColor}`}>Target Keyword / Niche</label>
              <input
                type="text"
                placeholder="e.g. Real Estate, Restaurant"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                disabled={status === 'running'}
                className={`w-full py-2.5 px-3.5 rounded-xl border text-xs transition-all focus:outline-none focus:border-amber-500 ${inputBg}`}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className={`text-[10px] uppercase font-bold ${labelColor}`}>City / Country Filter</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 w-4 h-4 text-zinc-500" />
                <input
                  type="text"
                  placeholder="e.g. Lahore, Pakistan"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  disabled={status === 'running'}
                  className={`w-full py-2.5 pl-9 pr-3.5 rounded-xl border text-xs transition-all focus:outline-none focus:border-amber-500 ${inputBg}`}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className={`text-[10px] uppercase font-bold ${labelColor}`}>Select Session Cookie Profile</label>
              <div className="flex items-center gap-2">
                <select
                  value={selectedAccount}
                  onChange={(e) => setSelectedAccount(e.target.value)}
                  disabled={status === 'running' || loadingAccounts}
                  className={`flex-1 py-2.5 px-3.5 rounded-xl border text-xs focus:outline-none focus:border-amber-500 cursor-pointer ${inputBg}`}
                  required
                >
                  {accounts.length === 0 ? (
                    <option value="">No Accounts Connected</option>
                  ) : (
                    accounts.map(acc => (
                      <option key={acc.profileId} value={acc.profileId}>
                        {acc.name} ({acc.status})
                      </option>
                    ))
                  )}
                </select>
                <button
                  type="button"
                  onClick={fetchAccounts}
                  disabled={status === 'running'}
                  className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                    isLight ? 'hover:bg-slate-100 border-slate-200 text-slate-600' : 'bg-[#18181b] hover:bg-[#27272a] border-[#27272a] text-zinc-300'
                  }`}
                  title="Reload accounts list"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className={`text-[10px] uppercase font-bold ${labelColor}`}>Max Profiles to Inspect</label>
              <input
                type="number"
                min={5}
                max={1000}
                value={maxLeads}
                onChange={(e) => setMaxLeads(parseInt(e.target.value) || 100)}
                disabled={status === 'running'}
                className={`w-full py-2.5 px-3.5 rounded-xl border text-xs focus:outline-none focus:border-amber-500 ${inputBg}`}
              />
            </div>

            {error && <div className="p-3 rounded-xl bg-red-500/10 text-red-400 text-xs border border-red-500/30">{error}</div>}

            <div className="pt-2">
              {status === 'running' ? (
                <button
                  type="button"
                  onClick={handleStopScraper}
                  disabled={actionLoading}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-red-500 hover:bg-red-400 text-black font-bold rounded-xl shadow-sm transition-all cursor-pointer font-mono text-xs uppercase tracking-wider"
                >
                  <Square className="w-4 h-4 fill-black" />
                  <span>Abort Lead Campaign</span>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={actionLoading || accounts.length === 0}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black font-bold rounded-xl shadow-sm transition-all cursor-pointer font-mono text-xs uppercase tracking-wider"
                >
                  <Play className="w-4 h-4 fill-black" />
                  <span>Launch Scraper Bot</span>
                </button>
              )}
            </div>
          </form>
        </div>

        <div className={`mt-6 pt-4 border-t ${isLight ? 'border-slate-100' : 'border-[#18181b]'}`}>
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-zinc-400">Current Status:</span>
            <span className={`px-2.5 py-0.5 rounded-full font-bold uppercase text-[9px] ${
              status === 'running' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' :
              status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' :
              status === 'failed' ? 'bg-red-500/10 text-red-400 border border-red-500/30' :
              'bg-[#18181b] text-zinc-400 border border-[#27272a]'
            }`}>
              {status}
            </span>
          </div>
        </div>
      </div>

      {/* Log Console & Results Table */}
      <div className="lg:col-span-2 space-y-6">
        {/* Terminal Logs */}
        <div className={`p-5 rounded-2xl border ${cardBg} shadow-2xl`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className={`font-bold text-xs font-mono uppercase tracking-wider ${isLight ? 'text-slate-800' : 'text-zinc-300'}`}>Live Scraper Console Logs</h3>
            <span className="text-[10px] text-zinc-500 font-mono">playwright_fb_scraper_daemon</span>
          </div>
          <div className="h-44 rounded-xl bg-[#121215] p-4 font-mono text-[11px] text-emerald-400 overflow-y-auto leading-relaxed border border-[#27272a]">
            {logs.length === 0 ? (
              <span className="text-zinc-600">// Standing by... Scraper is currently idle.</span>
            ) : (
              logs.map((log, index) => (
                <div key={index} className="text-left whitespace-pre-wrap">
                  {log}
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>
        </div>

        {/* Real-time Extracted Leads */}
        <div className={`p-6 rounded-2xl border ${cardBg} shadow-2xl`}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className={`font-bold ${isLight ? 'text-slate-800' : 'text-white'}`}>
                Extracted Contact Leads ({leads.length})
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">Contact numbers and email addresses extracted live from profile tags</p>
            </div>
            {leads.length > 0 && (
              <div className="flex items-center gap-2 font-mono">
                <button
                  onClick={() => handleDownload('xlsx')}
                  className="flex items-center gap-1.5 py-1.5 px-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-bold transition-all cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Excel</span>
                </button>
              </div>
            )}
          </div>

          <div className={`overflow-x-auto rounded-xl border ${isLight ? 'border-slate-200' : 'border-[#18181b]'}`}>
            <table className="w-full text-xs font-mono text-left">
              <thead className={`${isLight ? 'bg-slate-50 text-slate-700 border-b border-slate-200' : 'bg-[#121215] text-zinc-400 border-b border-[#18181b]'} text-[10px] font-bold uppercase`}>
                <tr>
                  <th className="py-3 px-3.5">Business Name</th>
                  <th className="py-3 px-3.5">Phone Numbers</th>
                  <th className="py-3 px-3.5">Emails</th>
                  <th className="py-3 px-3.5">City</th>
                  <th className="py-3 px-3.5 text-center">Profile</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isLight ? 'divide-slate-200' : 'divide-[#18181b]'}`}>
                {leads.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-zinc-500 text-xs font-mono">
                      No leads scraped in this session yet. Launch bot to fetch data.
                    </td>
                  </tr>
                ) : (
                  leads.map((lead, idx) => (
                    <tr key={idx} className={`${isLight ? 'hover:bg-slate-50' : 'hover:bg-[#121215]/60'} transition`}>
                      <td className={`py-2.5 px-3.5 font-bold truncate max-w-[140px] ${isLight ? 'text-slate-900' : 'text-white'}`}>
                        {lead.name}
                      </td>
                      <td className="py-2.5 px-3.5 text-amber-500 font-bold text-xs truncate max-w-[120px]">
                        {lead.phone || <span className="text-zinc-500">-</span>}
                      </td>
                      <td className="py-2.5 px-3.5 text-blue-500 text-xs truncate max-w-[140px]">
                        {lead.email || <span className="text-zinc-500">-</span>}
                      </td>
                      <td className={`py-2.5 px-3.5 text-xs truncate ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>
                        {lead.city}
                      </td>
                      <td className="py-2.5 px-3.5 text-center">
                        <a
                          href={lead.url}
                          target="_blank"
                          rel="noreferrer"
                          className={`inline-flex p-1.5 rounded-lg transition-all cursor-pointer ${
                            isLight ? 'hover:bg-slate-100 text-slate-500 hover:text-amber-600' : 'hover:bg-[#18181b] text-zinc-400 hover:text-amber-400'
                          }`}
                        >
                          <Link className="w-4 h-4" />
                        </a>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
