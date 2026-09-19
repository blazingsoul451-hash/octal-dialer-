import React, { useState, useEffect, useRef } from 'react';
import { FileSpreadsheet, RefreshCw, ChevronRight, Download, Play, Square, Search } from 'lucide-react';
import type { ScraperFile } from '../types';

interface ScraperFilesPanelProps {
  onImportSuccess: (campaignName: string, count: number) => void;
  serverUrl: string;
  authToken?: string;
  isLight?: boolean;
  activeSubTab?: string;
}

export const ScraperFilesPanel: React.FC<ScraperFilesPanelProps> = ({
  onImportSuccess,
  serverUrl,
  authToken,
  isLight,
  activeSubTab: _activeSubTab = 'scraper'
}) => {
  const [files, setFiles] = useState<ScraperFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<ScraperFile | null>(null);
  const [campaignName, setCampaignName] = useState('');
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Scraper controls
  const [keyword, setKeyword] = useState('Dentists');
  const [location, setLocation] = useState('Lahore');
  const [maxLeads, setMaxLeads] = useState<number>(50);
  const [requirePhone, setRequirePhone] = useState(true);
  const [enrichWebsite, setEnrichWebsite] = useState(false);
  const [requireEmail, setRequireEmail] = useState(false);

  // Status & Logs
  const [activeJobId, setActiveJobId] = useState<string>('');
  const [scraperStatus, setScraperStatus] = useState<
    'idle' | 'queued' | 'running' | 'paused_challenge' | 'completed' | 'completed_partial' | 'stopping' | 'stopped' | 'failed'
  >('idle');
  const [scraperLogs, setScraperLogs] = useState<string[]>([]);
  const [counters, setCounters] = useState({
    discovered: 0,
    extracted: 0,
    enriched: 0,
    skippedPhone: 0,
    skippedEmail: 0,
    failed: 0
  });
  const [actionLoading, setActionLoading] = useState(false);

  const logsContainerRef = useRef<HTMLDivElement>(null);
  const pollSeqRef = useRef<number>(0);
  const fileSeqRef = useRef<number>(0);

  const fetchScraperStatus = async () => {
    const currentSeq = ++pollSeqRef.current;
    try {
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const queryParam = activeJobId ? `?jobId=${encodeURIComponent(activeJobId)}` : '';
      const res = await fetch(`${serverUrl}/api/scraper/status${queryParam}`, { headers });
      if (res.ok) {
        // Prevent stale responses from overwriting newer polls
        const data = await res.json();
        if (currentSeq !== pollSeqRef.current) return;
        if (!data) { setScraperStatus('idle'); return; }
        if (data.jobId) setActiveJobId(data.jobId);
        setScraperStatus(data.status || 'idle');
        setScraperLogs(data.logs || []);
        if (data.counters) {
          setCounters(data.counters);
        } else if (data.extractedCount !== undefined) {
          setCounters(prev => ({ ...prev, extracted: data.extractedCount }));
        }

        if (['completed', 'completed_partial', 'failed', 'stopped'].includes(data.status)) {
          fetchFiles();
        }
      }
    } catch (err) {
      console.error('Error fetching scraper status:', err);
    }
  };

  useEffect(() => {
    fetchScraperStatus();
    let interval: any = null;
    if (scraperStatus === 'running' || scraperStatus === 'queued') {
      interval = setInterval(fetchScraperStatus, 1500);
    } else {
      interval = setInterval(fetchScraperStatus, 6000);
    }
    return () => {
      if (interval) clearInterval(interval);
      ++pollSeqRef.current;
    };
  }, [scraperStatus, serverUrl, authToken, activeJobId]);

  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [scraperLogs]);

  const handleStartScraper = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword.trim()) return;
    ++pollSeqRef.current;
    setActionLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const res = await fetch(`${serverUrl}/api/scraper/run`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          keyword: keyword.trim(),
          location: location.trim(),
          maxLeads,
          requirePhone,
          requireEmail: enrichWebsite && requireEmail,
          enrichWebsite
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start scraper');
      ++pollSeqRef.current;
      if (data.jobId) setActiveJobId(data.jobId);
      setScraperStatus(data.status || 'queued');
      setSuccessMsg(`Scraper job ${data.jobId || ''} submitted for "${keyword}" (Target: ${maxLeads} leads).`);
    } catch (err: any) {
      setError(err.message || 'Error starting scraper.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStopScraper = async () => {
    setActionLoading(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch(`${serverUrl}/api/scraper/stop`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ jobId: activeJobId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to stop scraper.');
      ++pollSeqRef.current;
      setScraperStatus(data.status || 'stopping');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const fetchFiles = async () => {
    const seq = ++fileSeqRef.current;
    setLoading(true);
    try {
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const res = await fetch(`${serverUrl}/api/scraper-files`, { headers });
      if (res.ok) {
        const data = await res.json();
        if (seq === fileSeqRef.current) setFiles(data);
      }
    } catch (err: any) {
      console.error('Error fetching files:', err);
    } finally {
      if (seq === fileSeqRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    setSelectedFile(null);
    setFiles([]);
    setActiveJobId('');
    fetchFiles();
    return () => { ++fileSeqRef.current; ++pollSeqRef.current; };
  }, [serverUrl, authToken]);

  const handleSelectFile = (file: ScraperFile) => {
    setSelectedFile(file);
    const defaultName = file.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim();
    setCampaignName(`Scraper: ${defaultName}`);
  };

  const handleImport = async () => {
    if (!selectedFile) return;
    setImporting(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const res = await fetch(`${serverUrl}/api/scraper-files/import`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          filePath: selectedFile.path,
          campaignName: campaignName.trim()
        })
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || 'Failed to import file.');
      }

      setSuccessMsg(`Successfully imported ${result.count} leads into campaign "${result.name}"!`);
      onImportSuccess(result.name, result.count);
      setSelectedFile(null);
      setCampaignName('');
    } catch (err: any) {
      setError(err.message || 'Error importing file.');
    } finally {
      setImporting(false);
    }
  };

  const handleDownload = async (fileName: string) => {
    try {
      const headers: Record<string, string> = {};
      if (authToken) headers.Authorization = `Bearer ${authToken}`;
      const response = await fetch(`${serverUrl}/api/scraper-files/download/${encodeURIComponent(fileName)}`, { headers });
      if (!response.ok) throw new Error('Download failed. Check your access and retry.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err: any) { setError(err.message); }
  };

  const formatSize = (bytes: number) => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  return (
    <div className={`border rounded-2xl p-6 shadow-2xl space-y-6 text-left select-none transition-colors ${
      isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#09090b] border-[#18181b] text-white'
    }`}>
      {/* Header */}
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b gap-3 ${
        isLight ? 'border-slate-200' : 'border-slate-800/80'
      }`}>
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Search className="w-4 h-4" />
            </div>
            <h2 className={`text-xl font-black font-display tracking-tight ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
              Google Maps Lead Scraper & CRM Auto-Import
            </h2>
          </div>
          <p className={`text-xs mt-1 ${isLight ? 'text-slate-600 font-semibold' : 'text-slate-400'}`}>
            Extract verified phone numbers, business names, addresses, and websites directly from Google Maps into your calling queue.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchFiles}
          disabled={loading}
          className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-xl text-xs font-mono font-bold text-amber-400 flex items-center gap-1.5 transition cursor-pointer self-start sm:self-auto shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Files</span>
        </button>
      </div>

      {error && (
        <div className="p-3.5 border text-xs rounded-xl bg-red-950/30 border-red-500/40 text-red-300 flex items-center gap-2">
          <span>❌</span>
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 border text-xs rounded-xl bg-emerald-950/30 border-emerald-500/40 text-emerald-300 flex items-center gap-2">
          <span>✅</span>
          <span>{successMsg}</span>
        </div>
      )}

      {/* Main Scraper Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Scraper Form & Live Terminal */}
        <div className="lg:col-span-7 space-y-5">
          <div className={`p-5 rounded-2xl border ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-850 shadow-inner'
          }`}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className={`text-xs font-black font-mono uppercase tracking-wider ${isLight ? 'text-slate-800' : 'text-amber-400'}`}>
                  🎯 Launch New Scraping Job
                </h3>
                {activeJobId && (
                  <span className="text-[10px] font-mono text-slate-500 block mt-0.5">
                    Job ID: {activeJobId}
                  </span>
                )}
              </div>
              <span className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full border ${
                scraperStatus === 'running'
                  ? 'bg-amber-500/20 border-amber-500 text-amber-300 animate-pulse'
                  : scraperStatus === 'queued'
                  ? 'bg-sky-500/20 border-sky-500 text-sky-300 animate-pulse'
                  : scraperStatus === 'paused_challenge'
                  ? 'bg-orange-500/20 border-orange-500 text-orange-300'
                  : scraperStatus === 'completed'
                  ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                  : scraperStatus === 'completed_partial'
                  ? 'bg-teal-500/20 border-teal-500 text-teal-300'
                  : scraperStatus === 'failed'
                  ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                  : scraperStatus === 'stopped' || scraperStatus === 'stopping'
                  ? 'bg-slate-800 border-slate-700 text-slate-300'
                  : 'bg-slate-900 border-slate-800 text-slate-400'
              }`}>
                ● {scraperStatus.replace('_', ' ').toUpperCase()}
              </span>
            </div>

            <form onSubmit={handleStartScraper} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-slate-400 block uppercase font-bold">
                    Industry / Business Niche
                  </label>
                  <input
                    type="text"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    disabled={scraperStatus === 'running' || scraperStatus === 'queued'}
                    placeholder="E.g., Dentists, Restaurants, Lawyers"
                    className="w-full bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-amber-500/30 transition"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-slate-400 block uppercase font-bold">
                    Target City or Country
                  </label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    disabled={scraperStatus === 'running' || scraperStatus === 'queued'}
                    placeholder="E.g., Lahore, New York, London"
                    className="w-full bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-amber-500/30 transition"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-slate-400 block uppercase font-bold">
                    Max Leads to Extract
                  </label>
                  <select
                    value={maxLeads}
                    onChange={(e) => setMaxLeads(Number(e.target.value))}
                    disabled={scraperStatus === 'running' || scraperStatus === 'queued'}
                    className="w-full bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-amber-500/30 transition"
                  >
                    <option value={25}>25 Leads (Fast Test)</option>
                    <option value={50}>50 Leads (Standard)</option>
                    <option value={100}>100 Leads (Recommended)</option>
                    <option value={250}>250 Leads (Deep Search)</option>
                    <option value={500}>500 Leads (Full City Scan)</option>
                  </select>
                </div>

                <div className="space-y-2 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-mono text-slate-300">
                    <input
                      type="checkbox"
                      checked={requirePhone}
                      onChange={(e) => setRequirePhone(e.target.checked)}
                      disabled={scraperStatus === 'running' || scraperStatus === 'queued'}
                      className="w-4 h-4 rounded text-amber-500 bg-slate-900 border-slate-700 focus:ring-amber-500 cursor-pointer"
                    />
                    <span>Require Phone Number</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs font-mono text-slate-300">
                    <input
                      type="checkbox"
                      checked={enrichWebsite}
                      onChange={(e) => {
                        setEnrichWebsite(e.target.checked);
                        if (!e.target.checked) setRequireEmail(false);
                      }}
                      disabled={scraperStatus === 'running' || scraperStatus === 'queued'}
                      className="w-4 h-4 rounded text-amber-500 bg-slate-900 border-slate-700 focus:ring-amber-500 cursor-pointer"
                    />
                    <span>Enrich Websites (Emails & Socials)</span>
                  </label>

                  {enrichWebsite && (
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-mono text-slate-400 pl-6">
                      <input
                        type="checkbox"
                        checked={requireEmail}
                        onChange={(e) => setRequireEmail(e.target.checked)}
                        disabled={scraperStatus === 'running' || scraperStatus === 'queued'}
                        className="w-3.5 h-3.5 rounded text-amber-500 bg-slate-900 border-slate-700 focus:ring-amber-500 cursor-pointer"
                      />
                      <span>Require Email Address</span>
                    </label>
                  )}
                </div>
              </div>

              {/* Progress Counters Bar */}
              {(scraperStatus !== 'idle' || counters.extracted > 0) && (
                <div className="grid grid-cols-4 gap-2 p-2.5 bg-slate-900/80 border border-slate-800 rounded-xl text-center font-mono text-[10px]">
                  <div>
                    <span className="text-slate-500 block">Discovered</span>
                    <span className="font-bold text-white text-xs">{counters.discovered}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Extracted</span>
                    <span className="font-bold text-amber-400 text-xs">{counters.extracted} / {maxLeads}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Enriched</span>
                    <span className="font-bold text-emerald-400 text-xs">{counters.enriched}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Skipped</span>
                    <span className="font-bold text-slate-400 text-xs">{counters.skippedPhone + counters.skippedEmail}</span>
                  </div>
                </div>
              )}

              <div className="pt-2 flex items-center gap-3">
                {scraperStatus === 'running' || scraperStatus === 'queued' ? (
                  <button
                    type="button"
                    onClick={handleStopScraper}
                    disabled={actionLoading}
                    className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white font-bold text-xs font-mono uppercase tracking-wider rounded-xl transition cursor-pointer flex items-center gap-2 shadow-lg shadow-red-600/20"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span>Stop Scraper</span>
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={actionLoading || !keyword.trim()}
                    className="px-6 py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs font-mono uppercase tracking-wider rounded-xl transition-all duration-200 cursor-pointer flex items-center gap-2 shadow-lg shadow-amber-500/20"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>{actionLoading ? 'Initializing Worker...' : 'Start Extraction'}</span>
                  </button>
                )}
              </div>
            </form>

            {/* Live Terminal Console */}
            <div className="mt-5 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-mono text-slate-400 block uppercase font-bold flex items-center gap-1.5">
                  <span>⚡ Real-Time Terminal Stream</span>
                  {counters.extracted > 0 && <span className="text-amber-400">({counters.extracted} Extracted)</span>}
                </label>
              </div>
              <div
                ref={logsContainerRef}
                className="bg-black/90 border border-slate-800 text-emerald-400 font-mono text-[11px] p-4 rounded-xl overflow-y-auto max-h-56 space-y-1 scrollbar-thin scrollbar-thumb-slate-800 shadow-inner"
              >
                {scraperLogs.length === 0 ? (
                  <div className="text-slate-600 italic">Console ready. Click "Start Extraction" to launch scraper...</div>
                ) : (
                  scraperLogs.map((log, idx) => (
                    <div key={idx} className="whitespace-pre-wrap leading-relaxed">
                      {log}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Scraped Files & 1-Click Import into Campaign */}
        <div className="lg:col-span-5 space-y-5">
          <div className={`p-5 rounded-2xl border ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-850 shadow-inner'
          }`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className={`text-xs font-black font-mono uppercase tracking-wider ${isLight ? 'text-slate-800' : 'text-amber-400'}`}>
                📁 Scraped Output Sheets
              </h3>
              <span className="text-[10px] font-mono text-slate-500">{files.length} Files</span>
            </div>

            {loading ? (
              <div className="h-44 flex items-center justify-center text-slate-500 font-mono text-xs">
                Loading files...
              </div>
            ) : files.length === 0 ? (
              <div className="h-44 border border-dashed border-slate-800 rounded-xl flex flex-col items-center justify-center text-center p-4">
                <FileSpreadsheet className="w-8 h-8 text-slate-600 mb-2" />
                <p className="text-xs text-slate-400 font-bold">No scraper output files yet.</p>
                <p className="text-[10px] text-slate-500 mt-1 max-w-[240px]">
                  Extracted leads will automatically appear here as structured Excel spreadsheets.
                </p>
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto space-y-2 pr-1 select-none">
                {files.map((file) => (
                  <div
                    key={file.path}
                    onClick={() => handleSelectFile(file)}
                    className={`w-full p-3.5 rounded-xl border text-left transition cursor-pointer ${
                      selectedFile?.path === file.path
                        ? 'bg-amber-500/10 border-amber-500 text-white shadow-md'
                        : 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FileSpreadsheet className={`w-4 h-4 shrink-0 ${selectedFile?.path === file.path ? 'text-amber-400' : 'text-slate-400'}`} />
                        <div className="min-w-0">
                          <p className="text-xs font-bold truncate pr-1 text-white">{file.name}</p>
                          <p className="text-[9px] font-mono text-slate-500 mt-0.5">
                            {new Date(file.lastModified).toLocaleDateString()} {new Date(file.lastModified).toLocaleTimeString()} • {formatSize(file.sizeBytes)}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownload(file.name);
                        }}
                        title="Download Excel Sheet"
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-amber-500/20 text-slate-400 hover:text-amber-300 border border-slate-700 transition"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Selected File 1-Click Import Box */}
            {selectedFile && (
              <div className="mt-4 pt-4 border-t border-slate-800 space-y-3">
                <div className="space-y-1">
                  <span className="text-[9px] font-mono font-bold text-amber-400 uppercase tracking-widest block">
                    Selected for Dialer Import:
                  </span>
                  <p className="text-xs font-bold text-white truncate">{selectedFile.name}</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-slate-400 block uppercase font-bold">
                    Campaign Name
                  </label>
                  <input
                    type="text"
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                    placeholder="E.g., Dentists Lahore Queue"
                    className="w-full bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none transition"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleImport}
                  disabled={importing || !campaignName.trim()}
                  className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 text-slate-950 font-black text-xs font-mono uppercase tracking-wider rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/20"
                >
                  {importing ? 'Importing Leads...' : 'Import to Dialer Queue'}
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
