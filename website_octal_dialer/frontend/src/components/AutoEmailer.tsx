import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mail, Plus, Trash2, Play, Square, RefreshCw, Upload,
  Users, Settings, FileText, CheckCircle, AlertCircle,
  ChevronDown, ChevronUp, Send, Eye, EyeOff, Inbox
} from 'lucide-react';

interface EmailLead {
  id: number;
  email: string;
  name: string;
  company: string;
  status: 'pending' | 'sent' | 'completed';
  stage: number;
  lastSentAt: string | null;
  createdAt: string;
}

interface EmailAccount {
  id: number;
  email: string;
  senderName: string;
  smtpHost: string;
  smtpPort: number;
  status: 'active' | 'disabled';
}

interface EmailTemplate {
  id: number;
  subject: string;
  body: string;
  stage: number;
}

interface Props {
  isLight: boolean;
  serverUrl: string;
  authToken: string;
  activeSubTab?: string;
}

export function AutoEmailer({ isLight, serverUrl, authToken, activeSubTab = 'emailer-gmail' }: Props) {
  const [tab, setTab] = useState<'leads' | 'accounts' | 'templates' | 'campaign'>('campaign');
  const [leads, setLeads] = useState<EmailLead[]>([]);
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [campaignStatus, setCampaignStatus] = useState<'idle' | 'running'>('idle');
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  // --- Upload leads
  const [leadsText, setLeadsText] = useState('');
  const [uploadResult, setUploadResult] = useState<{ added: number; duplicates: number } | null>(null);

  // --- Account form
  const [accForm, setAccForm] = useState({ email: '', password: '', senderName: '', smtpHost: 'smtp.office365.com', smtpPort: '587' });
  const [showPass, setShowPass] = useState(false);

  // --- Template form
  const [tplForm, setTplForm] = useState({ subject: '', body: '', stage: '1' });
  const [editTplId, setEditTplId] = useState<number | null>(null);

  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` };

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [l, a, t, s] = await Promise.all([
        fetch(`${serverUrl}/email/leads`, { headers }).then(r => r.json()),
        fetch(`${serverUrl}/email/accounts`, { headers }).then(r => r.json()),
        fetch(`${serverUrl}/email/templates`, { headers }).then(r => r.json()),
        fetch(`${serverUrl}/emailer/status`, { headers }).then(r => r.json()),
      ]);
      if (Array.isArray(l)) setLeads(l);
      if (Array.isArray(a)) setAccounts(a);
      if (Array.isArray(t)) setTemplates(t);
      setCampaignStatus(s?.status === 'running' ? 'running' : 'idle');
      if (Array.isArray(s?.logs)) setLogs(s.logs.slice(-150));
    } catch {}
    setLoading(false);
  }, [serverUrl, authToken]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Auto-scroll logs
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // Poll logs while running
  useEffect(() => {
    if (campaignStatus !== 'running') return;
    const interval = setInterval(async () => {
      try {
        const s = await fetch(`${serverUrl}/emailer/status`, { headers }).then(r => r.json());
        setCampaignStatus(s?.status === 'running' ? 'running' : 'idle');
        if (Array.isArray(s?.logs)) setLogs(s.logs.slice(-150));
      } catch {}
    }, 4000);
    return () => clearInterval(interval);
  }, [campaignStatus, serverUrl, authToken]);

  // ── Lead Upload ──────────────────────────────────────────────────────────────
  async function handleUploadLeads() {
    const lines = leadsText.trim().split('\n').filter(Boolean);
    const parsed = lines.map(line => {
      const parts = line.split(',');
      return { email: parts[0]?.trim() ?? '', name: parts[1]?.trim() ?? 'Client', company: parts[2]?.trim() ?? '' };
    }).filter(l => l.email.includes('@'));

    if (!parsed.length) { showToast('No valid emails found. Format: email,name,company (one per line)', false); return; }

    try {
      const res = await fetch(`${serverUrl}/email/upload`, { method: 'POST', headers, body: JSON.stringify({ leads: parsed }) }).then(r => r.json());
      setUploadResult({ added: res.added, duplicates: res.duplicates });
      showToast(`✅ Added ${res.added} leads. ${res.duplicates} duplicates skipped.`);
      setLeadsText('');
      fetchAll();
    } catch { showToast('Upload failed', false); }
  }

  async function handleClearLeads() {
    if (!confirm('Clear ALL email leads? This cannot be undone.')) return;
    await fetch(`${serverUrl}/email/leads`, { method: 'DELETE', headers });
    showToast('All leads cleared.');
    fetchAll();
  }

  // ── Account Management ───────────────────────────────────────────────────────
  async function handleAddAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!accForm.email || !accForm.password) { showToast('Email and password required', false); return; }
    try {
      await fetch(`${serverUrl}/email/accounts`, {
        method: 'POST', headers,
        body: JSON.stringify({ accounts: [{ ...accForm, smtpPort: Number(accForm.smtpPort), status: 'active' }] })
      });
      showToast('Account saved!');
      setAccForm({ email: '', password: '', senderName: '', smtpHost: 'smtp.office365.com', smtpPort: '587' });
      fetchAll();
    } catch { showToast('Failed to save account', false); }
  }

  async function handleToggleAccount(acc: EmailAccount) {
    const newStatus = acc.status === 'active' ? 'disabled' : 'active';
    await fetch(`${serverUrl}/email/accounts`, {
      method: 'POST', headers,
      body: JSON.stringify({ accounts: [{ email: acc.email, password: '***keep***', smtpHost: acc.smtpHost, smtpPort: acc.smtpPort, senderName: acc.senderName, status: newStatus }] })
    });
    fetchAll();
  }

  // ── Template Management ──────────────────────────────────────────────────────
  async function handleSaveTemplate(e: React.FormEvent) {
    e.preventDefault();
    if (!tplForm.subject || !tplForm.body) { showToast('Subject and body required', false); return; }
    const updated = editTplId
      ? templates.map(t => t.id === editTplId ? { ...t, ...tplForm, stage: Number(tplForm.stage) } : t)
      : [...templates, { subject: tplForm.subject, body: tplForm.body, stage: Number(tplForm.stage) }];
    await fetch(`${serverUrl}/email/templates`, { method: 'POST', headers, body: JSON.stringify({ templates: updated }) });
    showToast('Templates saved!');
    setTplForm({ subject: '', body: '', stage: '1' });
    setEditTplId(null);
    fetchAll();
  }

  async function handleDeleteTemplate(id: number) {
    const updated = templates.filter(t => t.id !== id);
    await fetch(`${serverUrl}/email/templates`, { method: 'POST', headers, body: JSON.stringify({ templates: updated }) });
    fetchAll();
  }

  // ── Campaign Control ─────────────────────────────────────────────────────────
  async function startCampaign() {
    if (!accounts.filter(a => a.status === 'active').length) { showToast('No active SMTP accounts found!', false); return; }
    if (!templates.length) { showToast('No email templates found!', false); return; }
    if (!leads.filter(l => l.status !== 'completed').length) { showToast('No pending leads to email!', false); return; }

    await fetch(`${serverUrl}/email/start`, { method: 'POST', headers, body: JSON.stringify({ limit: 300 }) });
    setCampaignStatus('running');
    showToast('Campaign started! Sending emails in the background...');
  }

  async function stopCampaign() {
    await fetch(`${serverUrl}/emailer/stop`, { method: 'POST', headers });
    setCampaignStatus('idle');
    showToast('Campaign stopped.');
  }

  const pendingLeads = leads.filter(l => l.status === 'pending').length;
  const sentLeads = leads.filter(l => l.status === 'sent').length;
  const completedLeads = leads.filter(l => l.status === 'completed').length;
  const activeAccounts = accounts.filter(a => a.status === 'active').length;

  const card = `p-5 border rounded-2xl shadow-lg transition-all ${isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#090d16] border-slate-800'}`;
  const inputCls = `w-full px-3 py-2 rounded-xl border text-sm font-mono outline-none transition ${isLight ? 'bg-white border-slate-300 text-slate-900 focus:border-amber-400' : 'bg-slate-900 border-slate-700 text-white focus:border-amber-500'}`;
  const btnPrimary = 'px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs rounded-xl transition cursor-pointer';
  const btnSecondary = `px-4 py-2 border rounded-xl text-xs font-bold transition cursor-pointer ${isLight ? 'border-slate-300 text-slate-700 hover:bg-slate-100' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}`;

  // Get section title based on active tab
  const getSectionTitle = () => {
    switch (activeSubTab) {
      case 'emailer-gmail': return 'Email Accounts';
      case 'emailer-campaign': return 'Campaign Manager';
      case 'emailer-templates': return 'Email Templates';
      case 'emailer-leads': return 'Lead Management';
      default: return 'Auto Emailer';
    }
  };

  const getSectionDescription = () => {
    switch (activeSubTab) {
      case 'emailer-gmail': return 'Configure email accounts - Gmail, Outlook, Yahoo, or Custom SMTP';
      case 'emailer-campaign': return 'Start, stop, and monitor email campaigns with leads and templates';
      case 'emailer-templates': return 'Create and manage email templates for multi-stage campaigns';
      case 'emailer-leads': return 'Upload and manage email lead lists';
      default: return 'Professional email automation system';
    }
  };

  return (
    <div className="space-y-5 text-left select-none relative">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-2xl border flex items-center gap-3 shadow-2xl font-bold text-sm animate-bounce ${
          toast.ok
            ? isLight ? 'bg-emerald-50 border-emerald-400 text-emerald-900' : 'bg-emerald-950/60 border-emerald-500 text-emerald-300'
            : isLight ? 'bg-red-50 border-red-400 text-red-900' : 'bg-red-950/60 border-red-500 text-red-300'
        }`}>
          {toast.ok ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className={`border rounded-2xl p-6 shadow-2xl transition-colors ${
        isLight ? 'bg-white border-slate-200/90 shadow-slate-200/50' : 'bg-[#0f172a]/95 border-slate-800/90'
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
          <button
            onClick={fetchAll}
            disabled={loading}
            className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-xl text-xs font-mono font-bold text-amber-400 flex items-center gap-1.5 transition cursor-pointer self-start sm:self-auto"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Email Accounts - All Providers */}
        {activeSubTab === 'emailer-gmail' && (
          <div className="mt-6 space-y-6">
          {/* Gmail Section */}
          <div className="space-y-4">
            <div className={`p-4 rounded-xl border ${isLight ? 'bg-blue-50 border-blue-200' : 'bg-blue-950/20 border-blue-900/30'}`}>
              <h3 className={`text-sm font-bold mb-2 ${isLight ? 'text-blue-900' : 'text-blue-300'}`}>📧 Gmail Setup Instructions</h3>
              <ul className={`text-xs space-y-1 ${isLight ? 'text-blue-800' : 'text-blue-400'}`}>
                <li>• Enable 2-Factor Authentication on your Gmail account</li>
                <li>• Generate an App Password: Google Account → Security → 2-Step Verification → App Passwords</li>
                <li>• Use the 16-character app password below (not your regular password)</li>
                <li>• SMTP Host: <span className="font-mono">smtp.gmail.com</span> | Port: <span className="font-mono">587</span></li>
              </ul>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-mono text-slate-500 mb-1.5 uppercase tracking-wider">Gmail Address</label>
                <input type="email" placeholder="your.email@gmail.com" className={inputCls} value={accForm.email} onChange={e => setAccForm({...accForm, email: e.target.value, smtpHost: 'smtp.gmail.com', smtpPort: '587'})} />
              </div>
              <div>
                <label className="block text-xs font-mono text-slate-500 mb-1.5 uppercase tracking-wider">App Password (16 chars)</label>
                <div className="relative">
                  <input type={showPass ? 'text' : 'password'} placeholder="xxxx xxxx xxxx xxxx" className={inputCls} value={accForm.password} onChange={e => setAccForm({...accForm, password: e.target.value})} />
                  <button onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-mono text-slate-500 mb-1.5 uppercase tracking-wider">Sender Name</label>
                <input type="text" placeholder="Your Business Name" className={inputCls} value={accForm.senderName} onChange={e => setAccForm({...accForm, senderName: e.target.value})} />
              </div>
              <button onClick={addAccount} className={btnPrimary}>Add Gmail Account</button>
            </div>
          </div>

          {/* Outlook Section */}
          <div className="space-y-4">
            <div className={`p-4 rounded-xl border ${isLight ? 'bg-blue-50 border-blue-200' : 'bg-blue-950/20 border-blue-900/30'}`}>
              <h3 className={`text-sm font-bold mb-2 ${isLight ? 'text-blue-900' : 'text-blue-300'}`}>📧 Outlook/Office 365 Setup</h3>
              <ul className={`text-xs space-y-1 ${isLight ? 'text-blue-800' : 'text-blue-400'}`}>
                <li>• Works with Outlook.com, Hotmail, and Office 365 Business accounts</li>
                <li>• Use your regular email password</li>
                <li>• SMTP Host: <span className="font-mono">smtp.office365.com</span> | Port: <span className="font-mono">587</span></li>
                <li>• TLS/STARTTLS encryption enabled automatically</li>
              </ul>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-mono text-slate-500 mb-1.5 uppercase tracking-wider">Outlook Email</label>
                <input type="email" placeholder="your.email@outlook.com" className={inputCls} value={accForm.email} onChange={e => setAccForm({...accForm, email: e.target.value, smtpHost: 'smtp.office365.com', smtpPort: '587'})} />
              </div>
              <div>
                <label className="block text-xs font-mono text-slate-500 mb-1.5 uppercase tracking-wider">Password</label>
                <div className="relative">
                  <input type={showPass ? 'text' : 'password'} placeholder="••••••••" className={inputCls} value={accForm.password} onChange={e => setAccForm({...accForm, password: e.target.value})} />
                  <button onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-mono text-slate-500 mb-1.5 uppercase tracking-wider">Sender Name</label>
                <input type="text" placeholder="Your Business Name" className={inputCls} value={accForm.senderName} onChange={e => setAccForm({...accForm, senderName: e.target.value})} />
              </div>
              <button onClick={addAccount} className={btnPrimary}>Add Outlook Account</button>
            </div>
          </div>

          {/* Yahoo Section */}
          <div className="space-y-4">
            <div className={`p-4 rounded-xl border ${isLight ? 'bg-purple-50 border-purple-200' : 'bg-purple-950/20 border-purple-900/30'}`}>
              <h3 className={`text-sm font-bold mb-2 ${isLight ? 'text-purple-900' : 'text-purple-300'}`}>📧 Yahoo Mail Setup</h3>
              <ul className={`text-xs space-y-1 ${isLight ? 'text-purple-800' : 'text-purple-400'}`}>
                <li>• Generate an App Password: Yahoo Account Security → App Passwords</li>
                <li>• Select "Other App" and generate a password</li>
                <li>• Use the generated app password below</li>
                <li>• SMTP Host: <span className="font-mono">smtp.mail.yahoo.com</span> | Port: <span className="font-mono">587</span></li>
              </ul>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-mono text-slate-500 mb-1.5 uppercase tracking-wider">Yahoo Email</label>
                <input type="email" placeholder="your.email@yahoo.com" className={inputCls} value={accForm.email} onChange={e => setAccForm({...accForm, email: e.target.value, smtpHost: 'smtp.mail.yahoo.com', smtpPort: '587'})} />
              </div>
              <div>
                <label className="block text-xs font-mono text-slate-500 mb-1.5 uppercase tracking-wider">App Password</label>
                <div className="relative">
                  <input type={showPass ? 'text' : 'password'} placeholder="App password from Yahoo" className={inputCls} value={accForm.password} onChange={e => setAccForm({...accForm, password: e.target.value})} />
                  <button onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-mono text-slate-500 mb-1.5 uppercase tracking-wider">Sender Name</label>
                <input type="text" placeholder="Your Business Name" className={inputCls} value={accForm.senderName} onChange={e => setAccForm({...accForm, senderName: e.target.value})} />
              </div>
              <button onClick={addAccount} className={btnPrimary}>Add Yahoo Account</button>
            </div>
          </div>

          {/* SMTP Section */}
          <div className="space-y-4">
            <div className={`p-4 rounded-xl border ${isLight ? 'bg-amber-50 border-amber-200' : 'bg-amber-950/20 border-amber-900/30'}`}>
              <h3 className={`text-sm font-bold mb-2 ${isLight ? 'text-amber-900' : 'text-amber-300'}`}>⚙️ Custom SMTP Server</h3>
              <p className={`text-xs ${isLight ? 'text-amber-800' : 'text-amber-400'}`}>
                Configure any email provider with custom SMTP settings. Contact your email provider for SMTP host and port details.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-mono text-slate-500 mb-1.5 uppercase tracking-wider">Email Address</label>
                <input type="email" placeholder="your.email@domain.com" className={inputCls} value={accForm.email} onChange={e => setAccForm({...accForm, email: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs font-mono text-slate-500 mb-1.5 uppercase tracking-wider">Password</label>
                <div className="relative">
                  <input type={showPass ? 'text' : 'password'} placeholder="••••••••" className={inputCls} value={accForm.password} onChange={e => setAccForm({...accForm, password: e.target.value})} />
                  <button onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-mono text-slate-500 mb-1.5 uppercase tracking-wider">Sender Name</label>
                <input type="text" placeholder="Your Business Name" className={inputCls} value={accForm.senderName} onChange={e => setAccForm({...accForm, senderName: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono text-slate-500 mb-1.5 uppercase tracking-wider">SMTP Host</label>
                  <input type="text" placeholder="smtp.example.com" className={inputCls} value={accForm.smtpHost} onChange={e => setAccForm({...accForm, smtpHost: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-mono text-slate-500 mb-1.5 uppercase tracking-wider">SMTP Port</label>
                  <input type="number" placeholder="587" className={inputCls} value={accForm.smtpPort} onChange={e => setAccForm({...accForm, smtpPort: e.target.value})} />
                </div>
              </div>
              <button onClick={addAccount} className={btnPrimary}>Add Custom SMTP Account</button>
            </div>
          </div>
          </div>
        )}
      </div>

      {/* ── CAMPAIGN CONTROL ──────────────────────────────────────────────── */}
      {activeSubTab === 'emailer-campaign' && tab === 'campaign' && (
        <div className="space-y-5">
          {/* Stats Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Total Leads', value: leads.length, color: 'text-white' },
              { label: 'Pending', value: pendingLeads, color: 'text-amber-400' },
              { label: 'Sent (Follow-Up)', value: sentLeads, color: 'text-blue-400' },
              { label: 'Completed', value: completedLeads, color: 'text-emerald-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className={card}>
                <p className={`text-[10px] font-mono font-bold uppercase tracking-wider ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{label}</p>
                <p className={`text-3xl font-black font-mono mt-1 ${isLight ? 'text-slate-900' : color}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Control Panel */}
          <div className={card}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className={`text-base font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>Campaign Engine</h2>
                <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  {activeAccounts} active sender account{activeAccounts !== 1 ? 's' : ''} · {templates.length} template{templates.length !== 1 ? 's' : ''} loaded
                </p>
              </div>
              <div className={`px-3 py-1 rounded-full text-xs font-mono font-bold border ${
                campaignStatus === 'running'
                  ? isLight ? 'bg-emerald-50 border-emerald-400 text-emerald-800' : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                  : isLight ? 'bg-slate-100 border-slate-300 text-slate-600' : 'bg-slate-900 border-slate-700 text-slate-400'
              }`}>
                <span className={`inline-block w-2 h-2 rounded-full mr-2 ${campaignStatus === 'running' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`} />
                {campaignStatus === 'running' ? 'Running' : 'Idle'}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              {campaignStatus === 'idle' ? (
                <button onClick={startCampaign} className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-bold text-sm rounded-xl shadow-md transition cursor-pointer">
                  <Play className="w-4 h-4 fill-current" /> Start Campaign
                </button>
              ) : (
                <button onClick={stopCampaign} className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 text-white font-bold text-sm rounded-xl shadow-md transition cursor-pointer">
                  <Square className="w-4 h-4 fill-current" /> Stop Campaign
                </button>
              )}
              <button onClick={() => setTab('leads')} className={btnSecondary + ' flex items-center gap-2'}>
                <Upload className="w-3.5 h-3.5" /> Upload Leads
              </button>
              <button onClick={() => setTab('accounts')} className={btnSecondary + ' flex items-center gap-2'}>
                <Settings className="w-3.5 h-3.5" /> SMTP Accounts
              </button>
            </div>

            {/* How it works */}
            <div className={`mt-5 p-4 rounded-xl border text-xs font-mono space-y-1.5 ${isLight ? 'bg-slate-50 border-slate-200 text-slate-600' : 'bg-slate-950/60 border-slate-800 text-slate-400'}`}>
              <p className={`font-black text-[11px] uppercase tracking-wider mb-2 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>📬 How it works</p>
              <p>► Stage 1: Send first email to all Pending leads</p>
              <p>► Stage 2: 7-day follow-up to Stage 1 recipients</p>
              <p>► Stage 3: Final 7-day follow-up — lead marked Completed</p>
              <p>► Rotates through all active SMTP accounts (300 emails/account/day)</p>
              <p>► Automatic 30-60s delay between emails to appear human</p>
              <p>► Duplicate detection on upload — no double sending</p>
            </div>
          </div>

          {/* Live Log */}
          <div className={card}>
            <h3 className={`text-sm font-black mb-3 flex items-center gap-2 ${isLight ? 'text-slate-900' : 'text-white'}`}>
              <Inbox className="w-4 h-4 text-amber-500" /> Live Campaign Logs
            </h3>
            <div
              ref={logRef}
              className={`h-52 overflow-y-auto rounded-xl p-3 font-mono text-[11px] leading-relaxed space-y-0.5 ${
                isLight ? 'bg-slate-100 text-slate-700 border border-slate-200' : 'bg-black text-emerald-300 border border-slate-800'
              }`}
            >
              {logs.length === 0
                ? <p className="text-slate-500">No logs yet. Start a campaign to see live output...</p>
                : logs.map((l, i) => <div key={i}>{l}</div>)
              }
            </div>
          </div>
        </div>
      )}

      {/* ── LEADS ─────────────────────────────────────────────────────────── */}
      {activeSubTab === 'emailer-leads' && (
        <div className="space-y-5">
          {/* Upload box */}
          <div className={card}>
            <h2 className={`text-sm font-black mb-1 ${isLight ? 'text-slate-900' : 'text-white'}`}>Upload Email Leads</h2>
            <p className={`text-xs mb-3 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              One lead per line: <code className="font-mono">email,name,company</code> (name &amp; company optional)
            </p>
            <textarea
              value={leadsText}
              onChange={e => setLeadsText(e.target.value)}
              placeholder={"john@example.com,John Smith,Acme Corp\njane@company.pk,Jane Doe,Tech Ltd"}
              rows={8}
              className={inputCls + ' resize-none font-mono text-[11px]'}
            />
            <div className="flex items-center gap-3 mt-3">
              <button onClick={handleUploadLeads} className={btnPrimary + ' flex items-center gap-2'}>
                <Upload className="w-3.5 h-3.5" /> Upload Leads
              </button>
              <button onClick={handleClearLeads} className="flex items-center gap-2 px-4 py-2 border border-red-400 text-red-500 text-xs font-bold rounded-xl hover:bg-red-50 dark:hover:bg-red-950/30 transition cursor-pointer">
                <Trash2 className="w-3.5 h-3.5" /> Clear All
              </button>
              {uploadResult && (
                <span className={`text-xs font-mono font-bold ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>
                  +{uploadResult.added} added · {uploadResult.duplicates} skipped
                </span>
              )}
            </div>
          </div>

          {/* Leads table */}
          <div className={card + ' overflow-x-auto'}>
            <h2 className={`text-sm font-black mb-3 ${isLight ? 'text-slate-900' : 'text-white'}`}>Leads ({leads.length})</h2>
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className={`border-b font-mono text-[10px] uppercase ${isLight ? 'border-slate-200 text-slate-500' : 'border-slate-800 text-slate-400'}`}>
                  <th className="pb-2 pr-4">Email</th>
                  <th className="pb-2 pr-4">Name</th>
                  <th className="pb-2 pr-4">Company</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2">Stage</th>
                </tr>
              </thead>
              <tbody>
                {leads.slice(0, 200).map(lead => (
                  <tr key={lead.id} className={`border-b ${isLight ? 'border-slate-100' : 'border-slate-900'}`}>
                    <td className={`py-1.5 pr-4 font-mono ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>{lead.email}</td>
                    <td className={`py-1.5 pr-4 ${isLight ? 'text-slate-700' : 'text-slate-400'}`}>{lead.name}</td>
                    <td className={`py-1.5 pr-4 ${isLight ? 'text-slate-600' : 'text-slate-500'}`}>{lead.company || '—'}</td>
                    <td className="py-1.5 pr-4">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold border ${
                        lead.status === 'completed' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
                        : lead.status === 'sent' ? 'bg-blue-500/10 border-blue-500/30 text-blue-500'
                        : 'bg-amber-500/10 border-amber-500/30 text-amber-500'
                      }`}>{lead.status}</span>
                    </td>
                    <td className={`py-1.5 font-mono font-bold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>{lead.stage}/3</td>
                  </tr>
                ))}
                {leads.length === 0 && (
                  <tr><td colSpan={5} className={`py-8 text-center text-xs ${isLight ? 'text-slate-400' : 'text-slate-600'}`}>No leads loaded. Upload leads above.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── SMTP ACCOUNTS ─────────────────────────────────────────────────── */}
      {tab === 'accounts' && (
        <div className="space-y-5">
          {/* Add account form */}
          <div className={card}>
            <h2 className={`text-sm font-black mb-4 ${isLight ? 'text-slate-900' : 'text-white'}`}>Add SMTP Account (Outlook / Gmail)</h2>
            <form onSubmit={handleAddAccount} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={`block text-[10px] font-mono font-bold mb-1 uppercase ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Email Address</label>
                  <input type="email" value={accForm.email} onChange={e => setAccForm(p => ({ ...p, email: e.target.value }))} placeholder="sender@outlook.com" className={inputCls} required />
                </div>
                <div>
                  <label className={`block text-[10px] font-mono font-bold mb-1 uppercase ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>App Password</label>
                  <div className="relative">
                    <input type={showPass ? 'text' : 'password'} value={accForm.password} onChange={e => setAccForm(p => ({ ...p, password: e.target.value }))} placeholder="App password (not account password)" className={inputCls + ' pr-10'} required />
                    <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 cursor-pointer">
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className={`block text-[10px] font-mono font-bold mb-1 uppercase ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Sender Name</label>
                  <input type="text" value={accForm.senderName} onChange={e => setAccForm(p => ({ ...p, senderName: e.target.value }))} placeholder="e.g. Mohsin Ali" className={inputCls} />
                </div>
                <div>
                  <label className={`block text-[10px] font-mono font-bold mb-1 uppercase ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>SMTP Host</label>
                  <input type="text" value={accForm.smtpHost} onChange={e => setAccForm(p => ({ ...p, smtpHost: e.target.value }))} className={inputCls} />
                </div>
              </div>
              <button type="submit" className={btnPrimary + ' flex items-center gap-2'}>
                <Plus className="w-4 h-4" /> Save Account
              </button>
            </form>
          </div>

          {/* Accounts list */}
          <div className={card}>
            <h2 className={`text-sm font-black mb-3 ${isLight ? 'text-slate-900' : 'text-white'}`}>Sender Accounts ({accounts.length})</h2>
            <div className="space-y-2">
              {accounts.map(acc => (
                <div key={acc.id} className={`flex items-center justify-between p-3 rounded-xl border ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-950/60'}`}>
                  <div>
                    <p className={`text-sm font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{acc.email}</p>
                    <p className={`text-[10px] font-mono ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{acc.senderName || 'No display name'} · {acc.smtpHost}:{acc.smtpPort}</p>
                  </div>
                  <button
                    onClick={() => handleToggleAccount(acc)}
                    className={`px-3 py-1 rounded-lg text-[10px] font-mono font-bold border transition cursor-pointer ${
                      acc.status === 'active'
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/20'
                        : 'bg-red-500/10 border-red-500/30 text-red-500 hover:bg-red-500/20'
                    }`}
                  >
                    {acc.status === 'active' ? '● Active' : '○ Disabled'}
                  </button>
                </div>
              ))}
              {accounts.length === 0 && (
                <p className={`text-xs text-center py-6 ${isLight ? 'text-slate-400' : 'text-slate-600'}`}>No accounts added yet.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TEMPLATES ─────────────────────────────────────────────────────── */}
      {activeSubTab === 'emailer-templates' && (
        <div className="space-y-5">
          {/* Template form */}
          <div className={card}>
            <h2 className={`text-sm font-black mb-4 ${isLight ? 'text-slate-900' : 'text-white'}`}>
              {editTplId ? 'Edit Template' : 'Add Email Template'}
            </h2>
            <p className={`text-xs mb-3 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Use <code className="font-mono bg-slate-800 text-amber-400 px-1 rounded">{'{{name}}'}</code> and <code className="font-mono bg-slate-800 text-amber-400 px-1 rounded">{'{{company}}'}</code> as personalization tokens.
            </p>
            <form onSubmit={handleSaveTemplate} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className={`block text-[10px] font-mono font-bold mb-1 uppercase ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Email Subject</label>
                  <input type="text" value={tplForm.subject} onChange={e => setTplForm(p => ({ ...p, subject: e.target.value }))} placeholder="Business Inquiry for {{company}}" className={inputCls} required />
                </div>
                <div>
                  <label className={`block text-[10px] font-mono font-bold mb-1 uppercase ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Stage</label>
                  <select value={tplForm.stage} onChange={e => setTplForm(p => ({ ...p, stage: e.target.value }))} className={inputCls}>
                    <option value="1">Stage 1 (First Contact)</option>
                    <option value="2">Stage 2 (7-Day Follow-Up)</option>
                    <option value="3">Stage 3 (Final Follow-Up)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className={`block text-[10px] font-mono font-bold mb-1 uppercase ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Email Body</label>
                <textarea
                  value={tplForm.body}
                  onChange={e => setTplForm(p => ({ ...p, body: e.target.value }))}
                  placeholder={"Dear {{name}},\n\nI hope this email finds you well. My name is [Your Name] and I am reaching out from [Your Company]...\n\nBest regards,\n[Your Name]"}
                  rows={10}
                  className={inputCls + ' resize-y font-mono text-[11px]'}
                  required
                />
              </div>
              <div className="flex items-center gap-3">
                <button type="submit" className={btnPrimary + ' flex items-center gap-2'}>
                  <FileText className="w-3.5 h-3.5" /> {editTplId ? 'Update Template' : 'Add Template'}
                </button>
                {editTplId && (
                  <button type="button" onClick={() => { setEditTplId(null); setTplForm({ subject: '', body: '', stage: '1' }); }} className={btnSecondary}>
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Templates list */}
          <div className="space-y-3">
            {templates.map(tpl => (
              <div key={tpl.id} className={card}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold border ${
                        tpl.stage === 1 ? 'bg-amber-500/10 border-amber-500/30 text-amber-500'
                        : tpl.stage === 2 ? 'bg-blue-500/10 border-blue-500/30 text-blue-500'
                        : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
                      }`}>Stage {tpl.stage}</span>
                      <p className={`text-sm font-black truncate ${isLight ? 'text-slate-900' : 'text-white'}`}>{tpl.subject}</p>
                    </div>
                    <p className={`text-[11px] font-mono line-clamp-2 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{tpl.body}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => { setEditTplId(tpl.id); setTplForm({ subject: tpl.subject, body: tpl.body, stage: String(tpl.stage) }); setTab('templates'); }}
                      className={btnSecondary}
                    >Edit</button>
                    <button onClick={() => handleDeleteTemplate(tpl.id)} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition cursor-pointer">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {templates.length === 0 && (
              <div className={card}>
                <p className={`text-xs text-center py-6 ${isLight ? 'text-slate-400' : 'text-slate-600'}`}>No templates yet. Add your first email template above.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
