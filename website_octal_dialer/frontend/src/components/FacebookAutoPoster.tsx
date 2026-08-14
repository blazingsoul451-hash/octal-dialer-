import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, RefreshCw, Plus, Trash2, Key, Save, List, Radio, Terminal, Settings, Users, Facebook, BookOpen } from 'lucide-react';

interface FacebookAutoPosterProps {
  isLight?: boolean;
  serverUrl: string;
  authToken?: string;
  activeSubTab?: string;
}

interface Account {
  profileId: string;
  name: string;
  status: 'valid' | 'expired' | 'checking' | 'error' | 'unknown';
  note: string;
}

interface ActivityLog {
  time: string;
  type: string;
  account: string;
  detail: string;
  status: string;
}

interface Group {
  name: string;
  url: string;
  status: string;
  joinedAt?: string;
}

export const FacebookAutoPoster: React.FC<FacebookAutoPosterProps> = ({
  isLight = false,
  serverUrl,
  authToken,
  activeSubTab = 'fb-poster-accounts'
}) => {
  // Common states
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Accounts Form state
  const [profileId, setProfileId] = useState('fb_profile_1');
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [cookiesStr, setCookiesStr] = useState('');

  // Campaigns Form state
  const [caption, setCaption] = useState('');
  const [postUrlsStr, setPostUrlsStr] = useState('');

  // Auto Joiner Form state
  const [keywordsStr, setKeywordsStr] = useState('');
  const [joinsPerSession, setJoinsPerSession] = useState(5);

  // Scheduler Bot state
  const [selectedAccount, setSelectedAccount] = useState('');
  const [botStatus, setBotStatus] = useState<'idle' | 'running' | 'stopped'>('idle');
  const [botLogs, setBotLogs] = useState<string[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);

  const logEndRef = useRef<HTMLDivElement>(null);

  // Fetch profiles
  const fetchAccounts = async () => {
    setLoading(true);
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
    setLoading(false);
  };

  // Fetch campaigns config
  const fetchCampaignConfig = async () => {
    try {
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch(`${serverUrl}/api/facebook-poster/config`, { headers });
      if (res.ok) {
        const data = await res.json();
        setCaption(data.caption || '');
        setPostUrlsStr((data.postUrls || []).join('\n'));
      }
    } catch (_) {}
  };

  // Fetch auto joiner config
  const fetchJoinConfig = async () => {
    try {
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch(`${serverUrl}/api/facebook-poster/join-config`, { headers });
      if (res.ok) {
        const data = await res.json();
        setKeywordsStr((data.keywords || []).join('\n'));
        setJoinsPerSession(data.joinsPerSession || 5);
      }
    } catch (_) {}
  };

  // Fetch Groups
  const fetchGroups = async () => {
    try {
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch(`${serverUrl}/api/facebook-poster/groups`, { headers });
      if (res.ok) {
        const data = await res.json();
        setGroups(data);
      }
    } catch (_) {}
  };

  // Fetch Activity Log
  const fetchActivityLogs = async () => {
    try {
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch(`${serverUrl}/api/facebook-poster/activity-log`, { headers });
      if (res.ok) {
        const data = await res.json();
        setActivityLogs(data);
      }
    } catch (_) {}
  };

  // Fetch Bot Status & Logs
  const fetchBotStatus = async () => {
    try {
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch(`${serverUrl}/api/facebook-poster/status`, { headers });
      if (res.ok) {
        const data = await res.json();
        setBotStatus(data.status);
        setBotLogs(data.logs || []);
      }
    } catch (_) {}
  };

  useEffect(() => {
    fetchAccounts();
    if (activeSubTab === 'fb-poster-campaigns') fetchCampaignConfig();
    if (activeSubTab === 'fb-poster-joiner') {
      fetchJoinConfig();
      fetchGroups();
    }
    if (activeSubTab === 'fb-poster-logs') fetchActivityLogs();
    if (activeSubTab === 'fb-poster-scheduler') {
      fetchBotStatus();
      fetchCampaignConfig();
    }
  }, [activeSubTab, serverUrl, authToken]);

  useEffect(() => {
    let timer: any = null;
    if (botStatus === 'running') {
      timer = setInterval(fetchBotStatus, 2000);
    } else {
      timer = setInterval(fetchBotStatus, 8000);
    }
    return () => clearInterval(timer);
  }, [botStatus]);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [botLogs]);

  // Handlers
  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cookiesStr.trim()) return;
    setError(null);
    setSuccess(null);
    setActionLoading(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch(`${serverUrl}/api/facebook-poster/accounts/add`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          profileId,
          name: name.trim(),
          cookiesStr: cookiesStr.trim(),
          note: note.trim()
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to import account session.');
      setSuccess(data.loggedIn ? 'Account imported and logged in successfully!' : 'Account cookies saved, but verification failed. Double check your cookies.');
      setCookiesStr('');
      setName('');
      setNote('');
      fetchAccounts();
    } catch (err: any) {
      setError(err.message || 'Error importing account.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteAccount = async (pId: string) => {
    if (!window.confirm(`Are you sure you want to delete profile ${pId}?`)) return;
    setError(null);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch(`${serverUrl}/api/facebook-poster/accounts/delete`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ profileId: pId })
      });
      if (res.ok) {
        setSuccess('Account profile deleted successfully.');
        fetchAccounts();
      } else {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete account');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSaveCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setActionLoading(true);
    try {
      const postUrls = postUrlsStr.split('\n').map(u => u.trim()).filter(Boolean);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch(`${serverUrl}/api/facebook-poster/config`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ caption: caption.trim(), postUrls })
      });
      if (res.ok) {
        setSuccess('Campaign post templates saved successfully!');
      } else {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save config.');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveJoiner = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setActionLoading(true);
    try {
      const keywords = keywordsStr.split('\n').map(u => u.trim()).filter(Boolean);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch(`${serverUrl}/api/facebook-poster/join-config`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ keywords, joinsPerSession })
      });
      if (res.ok) {
        setSuccess('Auto Joiner configurations saved successfully.');
      } else {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save join config.');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleTogglePoster = async (mode: 'share' | 'join') => {
    setError(null);
    setSuccess(null);
    if (!selectedAccount && botStatus !== 'running') {
      setError('Please select a Facebook account.');
      return;
    }
    setActionLoading(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch(`${serverUrl}/api/facebook-poster/toggle`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ mode, account: selectedAccount })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error toggling poster bot.');
      setBotStatus(data.status);
      fetchBotStatus();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const cardBg = isLight ? 'bg-white border-slate-200' : 'bg-dark-card border-dark-border';
  const labelColor = isLight ? 'text-slate-700' : 'text-slate-300';
  const inputBg = isLight ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white' : 'bg-slate-950/60 border-slate-800 text-white focus:bg-slate-950';

  return (
    <div className="space-y-6 text-left">
      {success && <div className="p-3.5 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-sm font-semibold">{success}</div>}
      {error && <div className="p-3.5 rounded-xl bg-rose-500/10 text-rose-500 border border-rose-500/20 text-sm font-semibold">{error}</div>}

      {/* RENDER ACCOUNTS SUBTAB */}
      {activeSubTab === 'fb-poster-accounts' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className={`lg:col-span-1 p-6 rounded-2xl border ${cardBg} shadow-xl flex flex-col justify-between`}>
            <div>
              <div className="flex items-center gap-3 mb-5">
                <div className="p-2.5 bg-amber-500/10 rounded-xl text-amber-500">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h3 className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>Link Cookie Session</h3>
                  <p className="text-xs text-slate-500">Import browser cookies JSON</p>
                </div>
              </div>

              <form onSubmit={handleAddAccount} className="space-y-4">
                <div className="space-y-1.5">
                  <label className={`text-xs font-bold ${labelColor}`}>Profile ID Folder</label>
                  <select
                    value={profileId}
                    onChange={(e) => setProfileId(e.target.value)}
                    className={`w-full py-2 px-3.5 rounded-xl border text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 ${inputBg}`}
                  >
                    {[...Array(10)].map((_, i) => (
                      <option key={i} value={`fb_profile_${i + 1}`}>fb_profile_{i + 1}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className={`text-xs font-bold ${labelColor}`}>Account Description / Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Agency Profile 1"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={`w-full py-2 px-3.5 rounded-xl border text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 ${inputBg}`}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className={`text-xs font-bold ${labelColor}`}>Session Cookies (JSON Array)</label>
                  <textarea
                    placeholder='[{"name": "c_user", "value": "..."}, ...]'
                    value={cookiesStr}
                    onChange={(e) => setCookiesStr(e.target.value)}
                    rows={6}
                    className={`w-full p-3 rounded-xl border text-xs font-mono focus:outline-none focus:ring-1 focus:ring-amber-500 ${inputBg}`}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className={`text-xs font-bold ${labelColor}`}>Private Notes</label>
                  <input
                    type="text"
                    placeholder="Optional notes..."
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className={`w-full py-2 px-3.5 rounded-xl border text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 ${inputBg}`}
                  />
                </div>

                <button
                  type="submit"
                  disabled={actionLoading}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-slate-950 font-bold rounded-xl shadow-lg transition-all cursor-pointer"
                >
                  <Plus className="w-4.5 h-4.5" />
                  Link Session
                </button>
              </form>
            </div>
          </div>

          <div className={`lg:col-span-2 p-6 rounded-2xl border ${cardBg} shadow-xl`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`font-bold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>Connected Profiles</h3>
              <button onClick={fetchAccounts} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-900">
              <table className="w-full text-sm text-left">
                <thead className={`${isLight ? 'bg-slate-50 text-slate-700' : 'bg-slate-950/60 text-slate-400'} text-xs font-bold border-b border-slate-200 dark:border-slate-900`}>
                  <tr>
                    <th className="py-2.5 px-3">Folder</th>
                    <th className="py-2.5 px-3">Description</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Notes</th>
                    <th className="py-2.5 px-3 text-center">Delete</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-900/60">
                  {accounts.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-500 text-xs font-mono">
                        No active Facebook cookie sessions found. Import session JSON to start.
                      </td>
                    </tr>
                  ) : (
                    accounts.map(acc => (
                      <tr key={acc.profileId}>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-400">{acc.profileId}</td>
                        <td className={`py-2.5 px-3 font-semibold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>{acc.name}</td>
                        <td className="py-2.5 px-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            acc.status === 'valid' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
                            acc.status === 'expired' ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' :
                            acc.status === 'checking' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' :
                            'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                          }`}>
                            {acc.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-xs text-slate-500 max-w-[150px] truncate">{acc.note || '-'}</td>
                        <td className="py-2.5 px-3 text-center">
                          <button
                            onClick={() => handleDeleteAccount(acc.profileId)}
                            className="p-1 rounded text-slate-500 hover:text-rose-500 transition-all cursor-pointer"
                          >
                            <Trash2 className="w-4.5 h-4.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* RENDER CAMPAIGNS SUBTAB */}
      {activeSubTab === 'fb-poster-campaigns' && (
        <div className={`p-6 rounded-2xl border ${cardBg} shadow-xl`}>
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-amber-500/10 rounded-xl text-amber-500">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>Campaign Content Manager</h3>
              <p className="text-xs text-slate-500">Configure caption post templates and destination links</p>
            </div>
          </div>

          <form onSubmit={handleSaveCampaign} className="space-y-5">
            <div className="space-y-1.5">
              <label className={`text-xs font-bold ${labelColor}`}>Marketing Description / Caption</label>
              <textarea
                placeholder="Type post details, tags, and promotional info..."
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={5}
                className={`w-full p-3.5 rounded-xl border text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 ${inputBg}`}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className={`text-xs font-bold ${labelColor}`}>Target Website URLs (One per line)</label>
              <textarea
                placeholder="https://example.com/landing1&#10;https://example.com/landing2"
                value={postUrlsStr}
                onChange={(e) => setPostUrlsStr(e.target.value)}
                rows={4}
                className={`w-full p-3.5 rounded-xl border text-sm font-mono focus:outline-none focus:ring-1 focus:ring-amber-500 ${inputBg}`}
                required
              />
              <p className="text-[10px] text-slate-500">The bot will randomly select one of these links per post to bypass spamblocks.</p>
            </div>

            <button
              type="submit"
              disabled={actionLoading}
              className="flex items-center gap-2 py-3 px-6 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-slate-950 font-bold rounded-xl shadow-lg transition-all cursor-pointer"
            >
              <Save className="w-4.5 h-4.5" />
              Save Post Templates
            </button>
          </form>
        </div>
      )}

      {/* RENDER SCHEDULER / AUTOPOSER CONTROL PANEL */}
      {activeSubTab === 'fb-poster-scheduler' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className={`lg:col-span-1 p-6 rounded-2xl border ${cardBg} shadow-xl flex flex-col justify-between`}>
            <div>
              <div className="flex items-center gap-3 mb-5">
                <div className="p-2.5 bg-amber-500/10 rounded-xl text-amber-500">
                  <Radio className="w-5 h-5" />
                </div>
                <div>
                  <h3 className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>Post Shares Bot</h3>
                  <p className="text-xs text-slate-500">Auto-posts campaigns to joined groups</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className={`text-xs font-bold ${labelColor}`}>Select Active Profile</label>
                  <select
                    value={selectedAccount}
                    onChange={(e) => setSelectedAccount(e.target.value)}
                    disabled={botStatus === 'running'}
                    className={`w-full py-2.5 px-3.5 rounded-xl border text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 ${inputBg}`}
                  >
                    {accounts.length === 0 ? (
                      <option value="">No Accounts Available</option>
                    ) : (
                      accounts.map(acc => (
                        <option key={acc.profileId} value={acc.profileId}>
                          {acc.name} ({acc.profileId})
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div className="pt-2">
                  {botStatus === 'running' ? (
                    <button
                      onClick={() => handleTogglePoster('share')}
                      disabled={actionLoading}
                      className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl shadow-lg transition-all cursor-pointer"
                    >
                      <Square className="w-4.5 h-4.5 fill-white" />
                      Stop Auto-Posting
                    </button>
                  ) : (
                    <button
                      onClick={() => handleTogglePoster('share')}
                      disabled={actionLoading || accounts.length === 0 || !caption}
                      className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-slate-950 font-bold rounded-xl shadow-lg transition-all cursor-pointer"
                    >
                      <Play className="w-4.5 h-4.5 fill-slate-950" />
                      Run Auto-Posting Campaign
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className={`mt-6 pt-4 border-t ${isLight ? 'border-slate-100' : 'border-slate-900/60'}`}>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Bot Status:</span>
                <span className={`px-2 py-0.5 rounded-full font-bold uppercase ${
                  botStatus === 'running' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20 animate-pulse' :
                  'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                }`}>
                  {botStatus}
                </span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className={`p-6 rounded-2xl border ${cardBg} shadow-xl`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className={`font-bold text-sm ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>Bot Output Console Logs</h3>
                <span className="text-[10px] text-slate-500 font-mono">autoposter_agent_v1</span>
              </div>
              <div className="h-96 rounded-xl bg-slate-950 p-4 font-mono text-[11px] text-emerald-400 overflow-y-auto leading-relaxed border border-slate-900 text-left">
                {botLogs.length === 0 ? (
                  <span className="text-slate-600">// Log output is empty. Run bot to stream details...</span>
                ) : (
                  botLogs.map((log, index) => (
                    <div key={index} className="whitespace-pre-wrap">{log}</div>
                  ))
                )}
                <div ref={logEndRef} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* RENDER GROUP AUTO JOINER */}
      {activeSubTab === 'fb-poster-joiner' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className={`lg:col-span-1 p-6 rounded-2xl border ${cardBg} shadow-xl flex flex-col justify-between`}>
            <div>
              <div className="flex items-center gap-3 mb-5">
                <div className="p-2.5 bg-amber-500/10 rounded-xl text-amber-500">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>Auto Group Joiner</h3>
                  <p className="text-xs text-slate-500">Searches and joins groups in background</p>
                </div>
              </div>

              <form onSubmit={handleSaveJoiner} className="space-y-4">
                <div className="space-y-1.5">
                  <label className={`text-xs font-bold ${labelColor}`}>Select Profile</label>
                  <select
                    value={selectedAccount}
                    onChange={(e) => setSelectedAccount(e.target.value)}
                    disabled={botStatus === 'running'}
                    className={`w-full py-2 px-3.5 rounded-xl border text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 ${inputBg}`}
                  >
                    {accounts.length === 0 ? (
                      <option value="">No Accounts Connected</option>
                    ) : (
                      accounts.map(acc => (
                        <option key={acc.profileId} value={acc.profileId}>
                          {acc.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className={`text-xs font-bold ${labelColor}`}>Group Search Keywords (One per line)</label>
                  <textarea
                    placeholder="Real Estate Group&#10;Restaurant Marketing"
                    value={keywordsStr}
                    onChange={(e) => setKeywordsStr(e.target.value)}
                    rows={4}
                    className={`w-full p-3 rounded-xl border text-sm font-mono focus:outline-none focus:ring-1 focus:ring-amber-500 ${inputBg}`}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className={`text-xs font-bold ${labelColor}`}>Groups to Join per Keyword Session</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={joinsPerSession}
                    onChange={(e) => setJoinsPerSession(parseInt(e.target.value) || 5)}
                    className={`w-full py-2 px-3.5 rounded-xl border text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 ${inputBg}`}
                  />
                </div>

                <div className="flex gap-2.5 pt-2">
                  <button
                    type="submit"
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs transition-all cursor-pointer border border-slate-750"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Save Settings
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTogglePoster('join')}
                    disabled={actionLoading || accounts.length === 0 || !keywordsStr}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-4 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-slate-950 font-bold rounded-xl text-xs shadow transition-all cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Join Groups Now
                  </button>
                </div>
              </form>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className={`p-6 rounded-2xl border ${cardBg} shadow-xl`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className={`font-bold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>Extracted Group Targets ({groups.length})</h3>
                <button onClick={fetchGroups} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400">
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>

              <div className="overflow-y-auto max-h-96 rounded-xl border border-slate-200 dark:border-slate-900">
                <table className="w-full text-sm text-left">
                  <thead className={`${isLight ? 'bg-slate-50 text-slate-700' : 'bg-slate-950/60 text-slate-400'} text-xs font-bold border-b border-slate-200 dark:border-slate-900`}>
                    <tr>
                      <th className="py-2.5 px-3">Group Name</th>
                      <th className="py-2.5 px-3">Facebook Link</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-900/60">
                    {groups.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="py-8 text-center text-slate-500 text-xs font-mono">
                          No group profiles recorded yet. Run joiner bot to harvest groups.
                        </td>
                      </tr>
                    ) : (
                      groups.map((gp, i) => (
                        <tr key={i}>
                          <td className={`py-2 px-3 font-semibold truncate max-w-[200px] ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>{gp.name}</td>
                          <td className="py-2 px-3 text-blue-400 font-mono text-xs truncate max-w-[200px]">
                            <a href={gp.url} target="_blank" rel="noreferrer" className="hover:underline">{gp.url}</a>
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                              gp.status === 'approved' || gp.status === 'member' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
                              'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                            }`}>
                              {gp.status}
                            </span>
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
      )}

      {/* RENDER ACTIVITY LOGS SUBTAB */}
      {activeSubTab === 'fb-poster-logs' && (
        <div className={`p-6 rounded-2xl border ${cardBg} shadow-xl`}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className={`font-bold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>Activity Logs & Execution Feed</h3>
              <p className="text-xs text-slate-500">Historical feed of Facebook auto activities</p>
            </div>
            <button onClick={fetchActivityLogs} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-900">
            <table className="w-full text-sm text-left">
              <thead className={`${isLight ? 'bg-slate-50 text-slate-700' : 'bg-slate-950/60 text-slate-400'} text-xs font-bold border-b border-slate-200 dark:border-slate-900`}>
                <tr>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Profile</th>
                  <th className="py-2.5 px-3">Log Details</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-900/60 text-xs">
                {activityLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500 font-mono">
                      No automated entries logged. Trigger posting/joining campaigns to generate logs.
                    </td>
                  </tr>
                ) : (
                  activityLogs.map((log, i) => (
                    <tr key={i}>
                      <td className="py-2 px-3 text-slate-500 font-mono">{new Date(log.time).toLocaleString()}</td>
                      <td className={`py-2 px-3 font-semibold uppercase ${log.type === 'share' ? 'text-amber-500' : 'text-blue-500'}`}>{log.type}</td>
                      <td className="py-2 px-3 font-mono text-slate-400">{log.account}</td>
                      <td className={`py-2 px-3 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>{log.detail}</td>
                      <td className="py-2 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                          log.status === 'success' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
                          'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                        }`}>
                          {log.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
