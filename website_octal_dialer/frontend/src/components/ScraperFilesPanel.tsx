import React, { useState, useEffect } from 'react';
import { Database, FileSpreadsheet, RefreshCw, ChevronRight, Check, Download } from 'lucide-react';
import type { ScraperFile } from '../types';

interface ScraperFilesPanelProps {
  onImportSuccess: (campaignName: string, count: number) => void;
  serverUrl: string;
  authToken?: string;
  isLight?: boolean;
  activeSubTab?: string;
}

export const ScraperFilesPanel: React.FC<ScraperFilesPanelProps> = ({ onImportSuccess, serverUrl, authToken, isLight, activeSubTab = 'scraper' }) => {
  const [files, setFiles] = useState<ScraperFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<ScraperFile | null>(null);
  const [campaignName, setCampaignName] = useState('');
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [keyword, setKeyword] = useState('');
  const [location, setLocation] = useState('');
  const [requirePhone, setRequirePhone] = useState(false);
  const [requireEmail, setRequireEmail] = useState(false);
  const [scraperStatus, setScraperStatus] = useState<'idle' | 'running' | 'completed' | 'failed'>('idle');
  const [scraperLogs, setScraperLogs] = useState<string[]>([]);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchScraperStatus = async () => {
    try {
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch(`${serverUrl}/api/scraper/status`, { headers });
      if (res.ok) {
        const data = await res.json();
        setScraperStatus(data.status);
        setScraperLogs(data.logs);
      }
    } catch (err) {
      console.error('Error fetching scraper status:', err);
    }
  };

  useEffect(() => {
    fetchScraperStatus();
    let interval: any = null;
    if (scraperStatus === 'running') {
      interval = setInterval(fetchScraperStatus, 1500);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [scraperStatus, serverUrl, authToken]);

  const handleStartScraper = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword.trim()) return;
    setActionLoading(true);
    setError(null);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const res = await fetch(`${serverUrl}/api/scraper/run`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          keyword: keyword.trim(),
          location: location.trim(),
          requirePhone,
          requireEmail
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start scraper');
      setScraperStatus('running');
      fetchScraperStatus();
    } catch (err: any) {
      setError(err.message || 'Error starting scraper.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStopScraper = async () => {
    setActionLoading(true);
    try {
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch(`${serverUrl}/api/scraper/stop`, { method: 'POST', headers });
      if (res.ok) {
        setScraperStatus('failed');
        fetchScraperStatus();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  const fetchFiles = async () => {
    setLoading(true);
    setError(null);
    try {
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const res = await fetch(`${serverUrl}/api/scraper-files`, { headers });
      if (!res.ok) throw new Error('Failed to load scraper files. Server response: ' + res.status);
      const data = await res.json();
      setFiles(data);
    } catch (err: any) {
      setError(err.message || 'Error communicating with backend.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
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

      onImportSuccess(result.name, result.count);
      setSelectedFile(null);
      setCampaignName('');
    } catch (err: any) {
      setError(err.message || 'Error importing file.');
    } finally {
      setImporting(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  // Get section title based on active tab
  const getSectionTitle = () => {
    switch (activeSubTab) {
      case 'scraper': return 'Run Google Maps Scraper';
      case 'scraper-import': return 'File Manager & Import';
      case 'scraper-settings': return 'Scraper Settings';
      default: return 'Google Maps Scraper';
    }
  };

  const getSectionDescription = () => {
    switch (activeSubTab) {
      case 'scraper': return 'Launch scraping jobs with filters, batch queue, and live monitoring';
      case 'scraper-import': return 'Browse, preview, export, and import scraped lead files';
      case 'scraper-settings': return 'Configure performance, speed, and advanced scraping options';
      default: return 'Professional lead generation system';
    }
  };

  return (
    <div className={`border rounded-2xl p-6 shadow-2xl space-y-6 text-left select-none transition-colors ${
      isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#09090b] border-[#18181b] text-white'
    }`}>
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b gap-3 ${
        isLight ? 'border-slate-200' : 'border-slate-800/80'
      }`}>
        <div>
          <h2 className={`text-xl font-black font-display tracking-tight ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
            {getSectionTitle()}
          </h2>
          <p className={`text-xs mt-1 ${isLight ? 'text-slate-600 font-semibold' : 'text-slate-400'}`}>
            {getSectionDescription()}
          </p>
        </div>
        {(activeSubTab === 'scraper' || activeSubTab === 'scraper-import') && (
          <button
            onClick={fetchFiles}
            disabled={loading}
            className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-xl text-xs font-mono font-bold text-amber-400 flex items-center gap-1.5 transition cursor-pointer self-start sm:self-auto"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        )}
      </div>

      {error && (
        <div className={`p-3 border text-xs rounded-xl ${
          isLight ? 'bg-red-50 border-red-200 text-red-700' : 'bg-red-950/20 border-red-900/30 text-red-400'
        }`}>
          {error}
        </div>
      )}

      {/* Run Scraper - includes controller, filters, batch queue */}
      {activeSubTab === 'scraper' && (
        <div className="space-y-5">
          <div className={`p-5 rounded-2xl border ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-850'
          }`}>
            <h3 className={`text-sm font-black font-display uppercase tracking-wider mb-3 ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
              🤖 Live Google Maps Scraper Controller
            </h3>
            <form onSubmit={handleStartScraper} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-slate-500 block uppercase font-bold">
                    Search Keyword / Niche
                  </label>
                  <input
                    type="text"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    disabled={scraperStatus === 'running'}
                    placeholder="E.g., Dentist, Doctor, Tax Consultant"
                    className={`w-full border focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none transition ${
                      isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
                    }`}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-slate-500 block uppercase font-bold">
                    Target Country / City
                  </label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    disabled={scraperStatus === 'running'}
                    placeholder="E.g., Pakistan, New York, Lahore"
                    className={`w-full border focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none transition ${
                      isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
                    }`}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-6 py-1 select-none">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-mono font-bold text-slate-500">
                  <input
                    type="checkbox"
                    checked={requirePhone}
                    onChange={(e) => setRequirePhone(e.target.checked)}
                    disabled={scraperStatus === 'running'}
                    className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500 cursor-pointer"
                  />
                  <span>Phone Number Required</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-xs font-mono font-bold text-slate-500">
                  <input
                    type="checkbox"
                    checked={requireEmail}
                    onChange={(e) => setRequireEmail(e.target.checked)}
                    disabled={scraperStatus === 'running'}
                    className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500 cursor-pointer"
                  />
                  <span>Email Address Required</span>
                </label>
              </div>

              <div className="flex items-center gap-3">
                {scraperStatus === 'running' ? (
                  <button
                    type="button"
                    onClick={handleStopScraper}
                    disabled={actionLoading}
                    className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold text-xs font-mono uppercase tracking-wider rounded-xl transition cursor-pointer flex items-center gap-1.5"
                  >
                    <span>Stop Scraper</span>
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={actionLoading || !keyword.trim()}
                    className={`px-5 py-2.5 font-bold text-xs font-mono uppercase tracking-wider rounded-xl transition-all duration-200 cursor-pointer ${
                      !keyword.trim()
                        ? isLight
                          ? 'bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed'
                          : 'bg-slate-800 text-slate-500 border border-slate-750 cursor-not-allowed'
                        : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-lg shadow-amber-500/25'
                    }`}
                  >
                    {actionLoading ? 'Initializing...' : 'Launch Scraper'}
                  </button>
                )}
              </div>
            </form>

            {/* Live Terminal Console */}
            {scraperLogs.length > 0 && (
              <div className="mt-4 space-y-2">
                <label className="text-[10px] font-mono text-slate-500 block uppercase font-bold">
                  Live Output Terminal Console
                </label>
                <div
                  className="bg-black text-green-400 font-mono text-[10px] p-4 rounded-xl overflow-y-auto max-h-48 space-y-1 scrollbar-thin scrollbar-thumb-slate-800"
                  ref={(el) => { if (el) el.scrollTop = el.scrollHeight; }}
                >
                  {scraperLogs.map((log, idx) => (
                    <div key={idx} className="whitespace-pre-wrap leading-relaxed">
                      {log}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Advanced Filters - inline */}
          <div className={`p-5 rounded-2xl border ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-850'
          }`}>
            <h3 className={`text-sm font-black mb-3 ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>Advanced Filters</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-slate-500 block uppercase font-bold">
                    Minimum Rating
                  </label>
                  <select
                    className={`w-full border rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-amber-500 transition ${
                      isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
                    }`}
                  >
                    <option value="0">Any Rating</option>
                    <option value="3">3.0+ Stars</option>
                    <option value="3.5">3.5+ Stars</option>
                    <option value="4">4.0+ Stars</option>
                    <option value="4.5">4.5+ Stars</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-slate-500 block uppercase font-bold">
                    Minimum Reviews
                  </label>
                  <input
                    type="number"
                    placeholder="0"
                    min="0"
                    className={`w-full border rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-amber-500 transition ${
                      isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
                    }`}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer text-xs font-mono font-bold text-slate-500">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500 cursor-pointer"
                />
                <span>Include Website URL</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-xs font-mono font-bold text-slate-500">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500 cursor-pointer"
                />
                <span>Include Social Media Links</span>
              </label>
            </div>
          </div>

          {/* Batch Queue - inline */}
          <div className={`p-5 rounded-2xl border ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-850'
          }`}>
            <h3 className={`text-sm font-black mb-3 ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>Batch Scraping Queue</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Keyword (e.g., Dentist)"
                  className={`border rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-amber-500 transition ${
                    isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
                  }`}
                />
                <input
                  type="text"
                  placeholder="Location (e.g., New York)"
                  className={`border rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-amber-500 transition ${
                    isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
                  }`}
                />
              </div>
              <button
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Add to Queue
              </button>

              <div className={`p-4 border border-dashed rounded-xl text-center ${
                isLight ? 'border-slate-300 text-slate-500' : 'border-slate-800 text-slate-400'
              }`}>
                <p className="text-xs">No items in queue. Add keyword/location combinations above.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* File Manager - includes import, preview, export */}
      {activeSubTab === 'scraper-import' && (
        <div className="space-y-5">
          {/* Data Preview */}
          <div className={`p-5 rounded-2xl border ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-850'
          }`}>
            <h3 className={`text-sm font-black mb-3 ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>Data Preview</h3>
            <p className="text-xs text-slate-500 mb-4">Select a file from File Import section to preview its contents</p>
            <div className={`p-8 border border-dashed rounded-xl text-center ${
              isLight ? 'border-slate-300 text-slate-500' : 'border-slate-800 text-slate-400'
            }`}>
              <Database className="w-12 h-12 mx-auto mb-3 text-slate-400" />
              <p className="text-xs">No file selected for preview</p>
            </div>
          </div>

          {/* Export Options */}
          <div className={`p-5 rounded-2xl border ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-850'
          }`}>
            <h3 className={`text-sm font-black mb-3 ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>Export Options</h3>
            <div className="space-y-3">
              <button className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-2">
                <Download className="w-4 h-4" />
                Export as XLSX
              </button>
              <button className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-2">
                <Download className="w-4 h-4" />
                Export as CSV
              </button>
              <button className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-2">
                <Download className="w-4 h-4" />
                Export as JSON
              </button>
            </div>
          </div>

          {/* File Import Manager */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Files list */}
            <div className="lg:col-span-7 space-y-3">
              <h3 className="text-xs font-mono font-bold text-slate-500 uppercase tracking-wider">
                Scraped Output Sheets (.xlsx / .csv)
              </h3>

              {loading ? (
                <div className="h-44 flex items-center justify-center text-slate-500 font-mono text-xs">
                  Scanning directories...
                </div>
              ) : files.length === 0 ? (
                <div className={`h-44 border border-dashed rounded-xl flex flex-col items-center justify-center text-center p-4 ${
                  isLight ? 'border-slate-300 bg-slate-50/50' : 'border-slate-800'
                }`}>
                  <FileSpreadsheet className="w-8 h-8 text-slate-400 mb-2" />
                  <p className="text-xs text-slate-500 font-bold">No scraper output files detected.</p>
                  <p className="text-[10px] text-slate-400 mt-1 max-w-[280px]">
                    Run Google Maps Scraper Pro. Generated files will appear here automatically from google-maps-scraper-pro/output.
                  </p>
                </div>
              ) : (
                <div className="max-h-60 overflow-y-auto space-y-2 pr-1 select-none">
                  {files.map((file) => (
                    <button
                      key={file.path}
                      onClick={() => handleSelectFile(file)}
                      className={`w-full p-3.5 rounded-xl border text-left flex items-center justify-between transition cursor-pointer ${
                        selectedFile?.path === file.path
                          ? isLight
                            ? 'bg-amber-500/15 border-amber-500 text-slate-900 shadow-sm'
                            : 'bg-amber-500/10 border-amber-500 text-white'
                          : isLight
                            ? 'bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-800'
                            : 'bg-slate-950 border-slate-850 hover:border-slate-750 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <FileSpreadsheet className={`w-5 h-5 shrink-0 ${selectedFile?.path === file.path ? 'text-amber-500' : 'text-slate-400'}`} />
                        <div className="min-w-0">
                          <p className="text-xs font-bold truncate pr-2">{file.name}</p>
                          <p className="text-[9px] font-mono text-slate-500 mt-0.5">
                            Modified: {new Date(file.lastModified).toLocaleDateString()} {new Date(file.lastModified).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-[9px] font-mono px-2 py-0.5 rounded border ${
                          isLight ? 'bg-slate-100 border-slate-300 text-slate-600' : 'bg-slate-900 border-slate-800/80 text-slate-400'
                        }`}>
                          {formatSize(file.sizeBytes)}
                        </span>
                        {selectedFile?.path === file.path && <Check className="w-4 h-4 text-amber-500" />}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Selected file info / import controller */}
            <div className="lg:col-span-5">
              {selectedFile ? (
                <div className={`p-5 border rounded-2xl space-y-4 ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-850'
                }`}>
                  <div className="space-y-1">
                    <span className="text-[9px] font-mono font-bold text-amber-600 dark:text-amber-500 uppercase tracking-widest block">
                      File Selected
                    </span>
                    <h4 className={`text-sm font-bold truncate ${isLight ? 'text-slate-900' : 'text-white'}`}>{selectedFile.name}</h4>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-mono text-slate-500 block uppercase font-bold">
                      Campaign Title
                    </label>
                    <input
                      type="text"
                      value={campaignName}
                      onChange={(e) => setCampaignName(e.target.value)}
                      placeholder="E.g., Scraper Doctors"
                      className={`w-full border focus:border-amber-500 rounded-xl px-3 py-2 text-xs focus:outline-none transition ${
                        isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
                      }`}
                    />
                  </div>

                  <div className={`text-[10px] text-slate-500 leading-normal border-t pt-3 ${
                    isLight ? 'border-slate-200' : 'border-slate-800'
                  }`}>
                    This will automatically parse the spreadsheet, map coordinates, filter duplicates, and load leads directly into the auto dialer queue.
                  </div>

                  <button
                    onClick={handleImport}
                    disabled={importing || !campaignName.trim()}
                    className={`w-full py-2.5 font-bold text-xs font-mono uppercase tracking-wider rounded-xl transition-all duration-200 flex items-center justify-center gap-1.5 transform ${
                      importing || !campaignName.trim()
                        ? isLight
                          ? 'bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed'
                          : 'bg-slate-800 text-slate-500 border border-slate-750 cursor-not-allowed'
                        : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-lg shadow-amber-500/25 hover:-translate-y-0.5 active:translate-y-0 cursor-pointer'
                    }`}
                  >
                    {importing ? 'Importing Leads...' : 'Import to Dialer'}
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className={`h-full border border-dashed rounded-2xl flex items-center justify-center text-center p-6 text-slate-500 text-xs font-mono ${
                  isLight ? 'border-slate-300 bg-slate-50/50' : 'border-slate-800'
                }`}>
                  Select a scraper file to load
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Settings Tab - Performance Settings */}
      {activeSubTab === 'scraper-settings' && (
        <div className={`p-5 rounded-2xl border ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-850'
        }`}>
          <h3 className={`text-sm font-black mb-3 ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>Performance Configuration</h3>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-slate-500 block uppercase font-bold">
                Worker Threads
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="1"
                  max="8"
                  defaultValue="2"
                  className="flex-1"
                />
                <span className="text-sm font-bold w-8 text-center">2</span>
              </div>
              <p className="text-[10px] text-slate-500">Higher = faster but more CPU intensive</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-slate-500 block uppercase font-bold">
                Speed Preset
              </label>
              <select
                className={`w-full border rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-amber-500 transition ${
                  isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
                }`}
              >
                <option value="slow">Slow (Safer)</option>
                <option value="medium">Medium (Balanced)</option>
                <option value="fast">Fast (Aggressive)</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
