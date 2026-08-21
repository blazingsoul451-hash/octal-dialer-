import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mail, Plus, Trash2, Play, Square, RefreshCw, Upload,
  Users, Settings, FileText, CheckCircle, AlertCircle,
  Eye, EyeOff, Inbox, ShieldCheck, Server, Building2,
  ExternalLink, Check, Sparkles, Filter, CheckSquare, Square as SquareOutline,
  Key, ChevronDown, ChevronUp, Zap, HelpCircle, ArrowRight
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
  authType?: string;
  createdAt?: string;
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

type ProviderType = 'google' | 'business' | 'outlook' | 'yahoo';

export function AutoEmailer({ isLight, serverUrl, authToken, activeSubTab = 'emailer-gmail' }: Props) {
  const [tab, setTab] = useState<'leads' | 'accounts' | 'templates' | 'campaign'>('accounts');
  const [leads, setLeads] = useState<EmailLead[]>([]);
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [campaignStatus, setCampaignStatus] = useState<'idle' | 'running'>('idle');
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  // Active subtab sync
  useEffect(() => {
    if (activeSubTab === 'emailer-gmail') {
      setTab('accounts');
    } else if (activeSubTab === 'emailer-campaign') {
      setTab('campaign');
    } else if (activeSubTab === 'emailer-templates') {
      setTab('templates');
    } else if (activeSubTab === 'emailer-leads') {
      setTab('leads');
    }
  }, [activeSubTab]);

  // Check URL query parameters for OAuth returns
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connectedEmail = params.get('email_connected');
    const oauthErr = params.get('oauth_error');

    if (connectedEmail) {
      showToast(`🎉 Successfully connected mailbox: ${connectedEmail}! Ready to send emails.`, true);
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (oauthErr) {
      showToast(`⚠️ Connection notice: ${oauthErr}`, false);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // --- Upload leads
  const [leadsText, setLeadsText] = useState('');
  const [uploadResult, setUploadResult] = useState<{ added: number; duplicates: number } | null>(null);

  // --- Provider tabs in Email Accounts
  const [selectedProvider, setSelectedProvider] = useState<ProviderType>('google');
  const [accountFilter, setAccountFilter] = useState<'all' | ProviderType>('all');
  const [showAdvancedSmtp, setShowAdvancedSmtp] = useState(false);
  
  // Comprehensive Business Email Presets
  type BusinessPresetType = 'office365' | 'cpanel' | 'zoho' | 'godaddy' | 'hostinger' | 'namecheap' | 'titan' | 'amazon_ses' | 'sendgrid' | 'brevo' | 'yandex' | 'custom';
  const [businessPreset, setBusinessPreset] = useState<BusinessPresetType>('cpanel');

  // --- Account form
  const [accForm, setAccForm] = useState({
    email: '',
    password: '',
    senderName: '',
    smtpHost: 'mail.yourdomain.com',
    smtpPort: '465'
  });
  const [showPass, setShowPass] = useState(false);

  // --- Campaign Account Selection State
  const [senderMode, setSenderMode] = useState<'all' | 'specific'>('all');
  const [selectedAccountIds, setSelectedAccountIds] = useState<number[]>([]);
  const [campaignLimit, setCampaignLimit] = useState<number>(200);

  // --- Template form
  const [tplForm, setTplForm] = useState({ subject: '', body: '', stage: '1' });
  const [editTplId, setEditTplId] = useState<number | null>(null);

  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` };

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4500);
  }

  // Detect account provider from host / email
  function getAccountProvider(acc: { smtpHost?: string; email?: string; authType?: string }): ProviderType {
    if (acc.authType === 'oauth_google') return 'google';
    if (acc.authType === 'oauth_microsoft') return 'outlook';
    if (acc.authType === 'oauth_yahoo') return 'yahoo';
    const h = (acc.smtpHost || '').toLowerCase();
    const e = (acc.email || '').toLowerCase();
    if (h.includes('gmail') || e.includes('@gmail.com')) return 'google';
    if (h.includes('office365') || h.includes('outlook') || h.includes('live') || h.includes('hotmail') || e.includes('@outlook') || e.includes('@hotmail') || e.includes('@live')) return 'outlook';
    if (h.includes('yahoo') || h.includes('aol') || e.includes('@yahoo') || e.includes('@ymail') || e.includes('@aol')) return 'yahoo';
    return 'business';
  }

  // Smart Business Preset changer with 100% verified SMTP hosts & ports
  const applyBusinessPreset = (preset: BusinessPresetType, currentEmail: string = accForm.email) => {
    setBusinessPreset(preset);
    const domain = currentEmail.includes('@') ? currentEmail.split('@')[1].trim() : 'yourdomain.com';
    
    switch (preset) {
      case 'office365':
        setAccForm(p => ({ ...p, smtpHost: 'smtp.office365.com', smtpPort: '587' }));
        break;
      case 'cpanel':
        setAccForm(p => ({ ...p, smtpHost: `mail.${domain}`, smtpPort: '465' }));
        break;
      case 'zoho':
        setAccForm(p => ({ ...p, smtpHost: 'smtp.zoho.com', smtpPort: '465' }));
        break;
      case 'godaddy':
        setAccForm(p => ({ ...p, smtpHost: 'smtpout.secureserver.net', smtpPort: '465' }));
        break;
      case 'hostinger':
        setAccForm(p => ({ ...p, smtpHost: 'smtp.hostinger.com', smtpPort: '465' }));
        break;
      case 'namecheap':
        setAccForm(p => ({ ...p, smtpHost: 'mail.privateemail.com', smtpPort: '465' }));
        break;
      case 'titan':
        setAccForm(p => ({ ...p, smtpHost: 'smtp.titan.email', smtpPort: '465' }));
        break;
      case 'amazon_ses':
        setAccForm(p => ({ ...p, smtpHost: 'email-smtp.us-east-1.amazonaws.com', smtpPort: '465' }));
        break;
      case 'sendgrid':
        setAccForm(p => ({ ...p, smtpHost: 'smtp.sendgrid.net', smtpPort: '587' }));
        break;
      case 'brevo':
        setAccForm(p => ({ ...p, smtpHost: 'smtp-relay.brevo.com', smtpPort: '587' }));
        break;
      case 'yandex':
        setAccForm(p => ({ ...p, smtpHost: 'smtp.yandex.com', smtpPort: '465' }));
        break;
      case 'custom':
      default:
        setAccForm(p => ({ ...p, smtpHost: p.smtpHost || `mail.${domain}`, smtpPort: p.smtpPort || '465' }));
        break;
    }
  };

  // Switch Provider Selection Tab
  const handleSwitchProvider = (p: ProviderType) => {
    setSelectedProvider(p);
    setShowPass(false);
    setShowAdvancedSmtp(false);

    if (p === 'google') {
      setAccForm(prev => ({ ...prev, smtpHost: 'smtp.gmail.com', smtpPort: '465' }));
    } else if (p === 'outlook') {
      setAccForm(prev => ({ ...prev, smtpHost: 'smtp.office365.com', smtpPort: '587' }));
    } else if (p === 'yahoo') {
      setAccForm(prev => ({ ...prev, smtpHost: 'smtp.mail.yahoo.com', smtpPort: '465' }));
    } else {
      applyBusinessPreset(businessPreset, accForm.email);
    }
  };

  // Smart Real-Time Auto-Detection when typing Email in Business Tab
  const handleBusinessEmailChange = (val: string) => {
    setAccForm(p => {
      const updated = { ...p, email: val };
      const lower = val.toLowerCase().trim();

      // Auto-extract and capitalizes display name if empty
      if (!p.senderName && lower.includes('@')) {
        const prefix = lower.split('@')[0].replace(/[._-]/g, ' ');
        const capitalized = prefix.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        if (capitalized.length > 1) {
          updated.senderName = capitalized;
        }
      }

      // Auto-detect provider or cPanel domain
      if (lower.includes('@')) {
        const domain = lower.split('@')[1];
        if (domain.includes('zoho')) {
          setBusinessPreset('zoho');
          updated.smtpHost = 'smtp.zoho.com';
          updated.smtpPort = '465';
        } else if (domain.includes('hostinger')) {
          setBusinessPreset('hostinger');
          updated.smtpHost = 'smtp.hostinger.com';
          updated.smtpPort = '465';
        } else if (domain.includes('godaddy') || domain.includes('secureserver')) {
          setBusinessPreset('godaddy');
          updated.smtpHost = 'smtpout.secureserver.net';
          updated.smtpPort = '465';
        } else if (domain.includes('namecheap') || domain.includes('privateemail')) {
          setBusinessPreset('namecheap');
          updated.smtpHost = 'mail.privateemail.com';
          updated.smtpPort = '465';
        } else if (domain.includes('titan')) {
          setBusinessPreset('titan');
          updated.smtpHost = 'smtp.titan.email';
          updated.smtpPort = '465';
        } else if (domain.includes('yandex')) {
          setBusinessPreset('yandex');
          updated.smtpHost = 'smtp.yandex.com';
          updated.smtpPort = '465';
        } else if (businessPreset === 'cpanel' && domain.includes('.')) {
          // Standard cPanel/Webmail domain auto-linking
          updated.smtpHost = `mail.${domain}`;
          updated.smtpPort = '465';
        }
      }

      return updated;
    });
  };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [l, a, t, s] = await Promise.all([
        fetch(`${serverUrl}/email/leads`, { headers }).then(r => r.ok ? r.json() : []),
        fetch(`${serverUrl}/email/accounts`, { headers }).then(r => r.ok ? r.json() : []),
        fetch(`${serverUrl}/email/templates`, { headers }).then(r => r.ok ? r.json() : []),
        fetch(`${serverUrl}/emailer/status`, { headers }).then(r => r.ok ? r.json() : { status: 'idle', logs: [] }),
      ]);
      if (Array.isArray(l)) setLeads(l);
      if (Array.isArray(a)) {
        setAccounts(a);
        setSelectedAccountIds(prev => prev.length ? prev : a.filter(acc => acc.status === 'active').map(acc => acc.id));
      }
      if (Array.isArray(t)) setTemplates(t);
      setCampaignStatus(s?.status === 'running' ? 'running' : 'idle');
      if (Array.isArray(s?.logs)) setLogs(s.logs.slice(-150));
    } catch (err: any) {
      console.error('[Emailer] Fetch error:', err);
    }
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

  // 1-Click Connect Google OAuth redirect
  const handleConnectGoogleOAuth = () => {
    window.location.href = `${serverUrl}/email/oauth/google/connect`;
  };

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
  async function handleSaveAccount(e?: React.FormEvent, customData?: Partial<typeof accForm>) {
    if (e) e.preventDefault();
    const data = { ...accForm, ...(customData || {}) };
    if (!data.email || !data.password) {
      showToast('Please enter your email and password', false);
      return;
    }
    const host = data.smtpHost || (data.email.includes('@') ? `mail.${data.email.split('@')[1]}` : 'smtp.gmail.com');
    try {
      const res = await fetch(`${serverUrl}/email/accounts`, {
        method: 'POST', headers,
        body: JSON.stringify({ accounts: [{ ...data, smtpHost: host, smtpPort: Number(data.smtpPort) || 465, status: 'active' }] })
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({ error: 'Failed to save account' }));
        throw new Error(errJson.error || 'Failed to save account');
      }
      showToast('✅ Email account connected successfully!');
      setAccForm({ email: '', password: '', senderName: '', smtpHost: '', smtpPort: '465' });
      fetchAll();
    } catch (err: any) {
      showToast(err.message || 'Failed to save account', false);
    }
  }

  async function handleToggleAccount(acc: EmailAccount) {
    const newStatus = acc.status === 'active' ? 'disabled' : 'active';
    try {
      await fetch(`${serverUrl}/email/accounts`, {
        method: 'POST', headers,
        body: JSON.stringify({ accounts: [{ email: acc.email, password: '***keep***', smtpHost: acc.smtpHost, smtpPort: acc.smtpPort, senderName: acc.senderName, status: newStatus }] })
      });
      showToast(`Account status updated to ${newStatus}`);
      fetchAll();
    } catch {
      showToast('Failed to update account status', false);
    }
  }

  async function handleDeleteAccount(id: number) {
    if (!confirm('Remove this email mailbox from your dialer?')) return;
    try {
      await fetch(`${serverUrl}/email/accounts/${id}`, { method: 'DELETE', headers });
      showToast('Account removed.');
      fetchAll();
    } catch {
      showToast('Failed to delete account.', false);
    }
  }

  // ── Template Management ──────────────────────────────────────────────────────
  async function handleSaveTemplate(e: React.FormEvent) {
    e.preventDefault();
    if (!tplForm.subject || !tplForm.body) { showToast('Subject and body required', false); return; }
    const updated = editTplId
      ? templates.map(t => t.id === editTplId ? { ...t, ...tplForm, stage: Number(tplForm.stage) } : t)
      : [...templates, { subject: tplForm.subject, body: tplForm.body, stage: Number(tplForm.stage) }];
    try {
      await fetch(`${serverUrl}/email/templates`, { method: 'POST', headers, body: JSON.stringify({ templates: updated }) });
      showToast('Template saved successfully!');
      setTplForm({ subject: '', body: '', stage: '1' });
      setEditTplId(null);
      fetchAll();
    } catch { showToast('Failed to save template', false); }
  }

  async function handleDeleteTemplate(id: number) {
    const updated = templates.filter(t => t.id !== id);
    await fetch(`${serverUrl}/email/templates`, { method: 'POST', headers, body: JSON.stringify({ templates: updated }) });
    fetchAll();
  }

  // ── Campaign Control ─────────────────────────────────────────────────────────
  const getTargetCampaignAccounts = () => {
    const activeOnes = accounts.filter(a => a.status === 'active');
    if (senderMode === 'specific') {
      return activeOnes.filter(a => selectedAccountIds.includes(a.id));
    }
    return activeOnes;
  };

  const targetCampaignAccounts = getTargetCampaignAccounts();

  async function startCampaign() {
    if (!accounts.filter(a => a.status === 'active').length) {
      showToast('No active email accounts found! Connect your email account above first.', false);
      return;
    }
    if (!targetCampaignAccounts.length) {
      showToast('Please select at least one sender account for this campaign.', false);
      return;
    }
    if (!templates.length) { showToast('Please create at least one email template first!', false); return; }
    if (!leads.filter(l => l.status !== 'completed').length) { showToast('No pending leads found! Please upload leads first.', false); return; }

    try {
      const res = await fetch(`${serverUrl}/email/start`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          limit: campaignLimit || 200,
          accountIds: targetCampaignAccounts.map(a => a.id)
        })
      });
      if (!res.ok) throw new Error('Failed to start campaign');
      setCampaignStatus('running');
      showToast(`🚀 Campaign started with ${targetCampaignAccounts.length} sender(s)! Running in background...`);
    } catch {
      showToast('Failed to start campaign', false);
    }
  }

  async function stopCampaign() {
    try {
      await fetch(`${serverUrl}/emailer/stop`, { method: 'POST', headers });
      setCampaignStatus('idle');
      showToast('Campaign paused.');
    } catch {
      showToast('Failed to stop campaign', false);
    }
  }

  const toggleAccountSelection = (id: number) => {
    setSelectedAccountIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const pendingLeads = leads.filter(l => l.status === 'pending').length;
  const sentLeads = leads.filter(l => l.status === 'sent').length;
  const completedLeads = leads.filter(l => l.status === 'completed').length;
  const activeAccounts = accounts.filter(a => a.status === 'active').length;

  const filteredAccounts = accounts.filter(a => {
    if (accountFilter === 'all') return true;
    return getAccountProvider(a) === accountFilter;
  });

  const card = `p-6 border rounded-2xl shadow-2xl transition-all ${isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#09090b] border-[#18181b]'}`;
  const inputCls = `w-full px-4 py-3 rounded-xl border text-sm font-sans outline-none transition ${isLight ? 'bg-white border-slate-200 text-slate-900 focus:border-amber-500' : 'bg-[#121215] border-[#27272a] text-white focus:border-amber-500'}`;
  const btnPrimary = 'px-6 py-3 bg-amber-500 hover:bg-amber-400 text-black font-black text-sm rounded-xl transition cursor-pointer shadow-sm flex items-center justify-center gap-2';
  const btnSecondary = `px-4 py-2.5 border rounded-xl text-xs font-bold transition cursor-pointer ${isLight ? 'border-slate-200 text-slate-700 hover:bg-slate-100' : 'border-[#27272a] text-zinc-300 hover:bg-[#18181b]'}`;

  const renderProviderBadge = (provider: ProviderType, authType?: string) => {
    if (authType === 'oauth_google' || (provider === 'google' && authType?.startsWith('oauth'))) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-mono font-bold bg-red-500/10 border border-red-500/30 text-red-400">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Google 1-Click
        </span>
      );
    }
    if (authType === 'oauth_microsoft') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-mono font-bold bg-blue-500/10 border border-blue-500/30 text-blue-400">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Microsoft 1-Click
        </span>
      );
    }
    if (authType === 'oauth_yahoo') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-mono font-bold bg-purple-500/10 border border-purple-500/30 text-purple-400">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-500" /> Yahoo 1-Click
        </span>
      );
    }
    if (provider === 'google') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-mono font-bold bg-red-500/10 border border-red-500/30 text-red-400">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Gmail (App Password)
        </span>
      );
    }
    if (provider === 'outlook') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-mono font-bold bg-blue-500/10 border border-blue-500/30 text-blue-400">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Outlook / 365
        </span>
      );
    }
    if (provider === 'yahoo') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-mono font-bold bg-purple-500/10 border border-purple-500/30 text-purple-400">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-500" /> Yahoo Mail
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-mono font-bold bg-amber-500/10 border border-amber-500/30 text-amber-400">
        <Building2 className="w-3 h-3 text-amber-500" /> Business Mailbox
      </span>
    );
  };

  return (
    <div className="space-y-5 text-left select-none relative max-w-6xl mx-auto">

      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-5 py-3.5 rounded-2xl border flex items-center gap-3 shadow-2xl font-bold text-sm animate-bounce ${
          toast.ok
            ? isLight ? 'bg-emerald-50 border-emerald-400 text-emerald-900' : 'bg-emerald-950/80 border-emerald-500 text-emerald-300'
            : isLight ? 'bg-red-50 border-red-400 text-red-900' : 'bg-red-950/80 border-red-500 text-red-300'
        }`}>
          {toast.ok ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Top Banner */}
      <div className={`border rounded-2xl p-6 shadow-2xl transition-colors ${
        isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800/80 gap-3">
          <div>
            <h2 className={`text-xl font-black font-display tracking-tight flex items-center gap-2.5 ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
              <Mail className="w-6 h-6 text-amber-500" />
              {activeSubTab === 'emailer-gmail' && 'Connect Email Accounts'}
              {activeSubTab === 'emailer-campaign' && 'Auto Campaign Manager'}
              {activeSubTab === 'emailer-templates' && 'Email Templates'}
              {activeSubTab === 'emailer-leads' && 'Lead Contact Lists'}
            </h2>
            <p className={`text-xs mt-1 ${isLight ? 'text-slate-600 font-semibold' : 'text-slate-400'}`}>
              {activeSubTab === 'emailer-gmail' && 'Connect your sender mailboxes in 1 click without any complicated server setups.'}
              {activeSubTab === 'emailer-campaign' && 'Run automated, multi-stage cold outreach campaigns with human-like delays.'}
              {activeSubTab === 'emailer-templates' && 'Write and customize cold outreach templates with dynamic name and company tokens.'}
              {activeSubTab === 'emailer-leads' && 'Upload and organize customer lists for automated email campaigns.'}
            </p>
          </div>
          <button
            onClick={fetchAll}
            disabled={loading}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-xl text-xs font-mono font-bold text-amber-400 flex items-center gap-1.5 transition cursor-pointer self-start sm:self-auto"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Sync</span>
          </button>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {/* ── 1. ULTRA USER-FRIENDLY EMAIL ACCOUNT SETUP ───────────────────────── */}
        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {activeSubTab === 'emailer-gmail' && (
          <div className="mt-6 space-y-6">

            {/* Provider Big Selection Cards */}
            <div>
              <label className={`block text-xs font-bold mb-2.5 uppercase tracking-wider ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                1. Choose Your Email Provider
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { id: 'google', label: 'Google / Gmail', tag: '1-Click Connect', color: 'border-red-500/40 hover:border-red-500 bg-red-500/5', activeColor: 'bg-red-500/20 border-red-500 text-red-400 ring-2 ring-red-500/30' },
                  { id: 'business', label: 'Business / Company', tag: 'cPanel, Zoho, Custom', color: 'border-amber-500/40 hover:border-amber-500 bg-amber-500/5', activeColor: 'bg-amber-500/20 border-amber-500 text-amber-300 ring-2 ring-amber-500/30' },
                  { id: 'outlook', label: 'Outlook / Office 365', tag: 'Microsoft Mail', color: 'border-blue-500/40 hover:border-blue-500 bg-blue-500/5', activeColor: 'bg-blue-500/20 border-blue-500 text-blue-400 ring-2 ring-blue-500/30' },
                  { id: 'yahoo', label: 'Yahoo Mail', tag: 'Yahoo & AOL', color: 'border-purple-500/40 hover:border-purple-500 bg-purple-500/5', activeColor: 'bg-purple-500/20 border-purple-500 text-purple-400 ring-2 ring-purple-500/30' },
                ].map(p => {
                  const active = selectedProvider === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSwitchProvider(p.id as ProviderType)}
                      className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between min-h-[90px] ${
                        active ? p.activeColor : `${isLight ? 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-800' : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-850'}`
                      }`}
                    >
                      <p className="font-extrabold text-sm flex items-center justify-between">
                        <span>{p.label}</span>
                        {active && <Check className="w-4 h-4 shrink-0" />}
                      </p>
                      <p className={`text-[10px] font-mono mt-1 opacity-80`}>{p.tag}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── PROVIDER ACTION CARDS ── */}
            <div className={card}>

              {/* OPTION 1: GOOGLE / GMAIL */}
              {selectedProvider === 'google' && (
                <div className="space-y-6">
                  {/* Header & SMTP Specs Pill */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/60">
                    <div>
                      <h3 className={`text-sm font-black flex items-center gap-2 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                        <span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Connect Google Gmail / Workspace
                      </h3>
                      <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                        Use 1-Click Google OAuth or connect directly with a Gmail App Password.
                      </p>
                    </div>

                    {/* Official Google SMTP Info Badge */}
                    <div className={`px-3 py-1.5 rounded-xl border text-[11px] font-mono font-bold flex items-center gap-2 ${
                      isLight ? 'bg-red-50 border-red-300 text-red-800' : 'bg-red-950/40 border-red-500/40 text-red-300'
                    }`}>
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      <span>SMTP: <strong>smtp.gmail.com:465</strong> (SSL)</span>
                    </div>
                  </div>

                  {/* 1-Click OAuth Hero Box */}
                  <div className={`p-5 rounded-2xl border text-center space-y-3 ${
                    isLight ? 'bg-red-50/50 border-red-200' : 'bg-red-950/20 border-red-900/60'
                  }`}>
                    <div className="max-w-md mx-auto space-y-1">
                      <p className={`text-xs font-black uppercase tracking-wider text-red-400`}>Recommended · Fastest</p>
                      <h4 className={`text-sm font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>1-Click Google OAuth Connect</h4>
                      <p className={`text-xs ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                        Authorizes your Gmail or Google Workspace mailbox in 1 click with Google security.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleConnectGoogleOAuth}
                      className="py-3 px-6 rounded-2xl font-black text-sm bg-white hover:bg-slate-100 text-slate-900 border border-slate-300 shadow-lg transition-all inline-flex items-center justify-center gap-3 cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                      </svg>
                      <span>1-Click Connect with Google</span>
                    </button>
                  </div>

                  {/* Direct Gmail App Password Form */}
                  <div className={`p-5 rounded-2xl border space-y-4 ${
                    isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                  }`}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <h4 className={`text-xs font-black uppercase tracking-wider ${isLight ? 'text-slate-900' : 'text-white'}`}>
                        Or Connect with Google App Password
                      </h4>
                      <span className="text-[10px] font-mono text-slate-500">Auto-configured: smtp.gmail.com:465</span>
                    </div>

                    <form onSubmit={(e) => handleSaveAccount(e, { smtpHost: 'smtp.gmail.com', smtpPort: '465' })} className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className={`block text-xs font-bold mb-1.5 ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                            Gmail Address
                          </label>
                          <input
                            type="email"
                            value={accForm.email}
                            onChange={e => setAccForm(p => ({ ...p, email: e.target.value }))}
                            placeholder="yourname@gmail.com"
                            className={inputCls}
                            required
                          />
                        </div>
                        <div>
                          <label className={`block text-xs font-bold mb-1.5 ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                            Google 16-Letter App Password
                          </label>
                          <div className="relative">
                            <input
                              type={showPass ? 'text' : 'password'}
                              value={accForm.password}
                              onChange={e => setAccForm(p => ({ ...p, password: e.target.value }))}
                              placeholder="xxxx xxxx xxxx xxxx"
                              className={inputCls + ' pr-10'}
                              required
                            />
                            <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 cursor-pointer">
                              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className={`block text-xs font-bold mb-1.5 ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                          Sender Display Name (Optional)
                        </label>
                        <input
                          type="text"
                          value={accForm.senderName}
                          onChange={e => setAccForm(p => ({ ...p, senderName: e.target.value }))}
                          placeholder="e.g. Alex Smith"
                          className={inputCls}
                        />
                      </div>

                      <div className="pt-1">
                        <button type="submit" className={btnPrimary + ' w-full sm:w-auto'}>
                          <Plus className="w-4 h-4" /> Save Gmail SMTP Account
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}


              {/* OPTION 2: BUSINESS / CORPORATE EMAIL */}
              {selectedProvider === 'business' && (
                <div className="space-y-5">
                  <div className="flex flex-col gap-3 pb-3 border-b border-slate-800/60">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h3 className={`text-sm font-black flex items-center gap-2 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                          <Building2 className="w-4 h-4 text-amber-500" /> Connect Your Business / Company Email
                        </h3>
                        <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                          Type your business email and password. Server host and port are auto-detected instantly!
                        </p>
                      </div>

                      {/* Live Auto-Connected Server Badge */}
                      <div className={`px-3 py-1.5 rounded-xl border text-[11px] font-mono font-bold flex items-center gap-2 ${
                        isLight ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                      }`}>
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span>Auto Server: <strong className="font-mono">{accForm.smtpHost || 'mail.yourdomain.com'}:{accForm.smtpPort}</strong></span>
                      </div>
                    </div>

                    {/* Quick Business Presets Bar */}
                    <div>
                      <span className={`block text-[10px] font-mono font-bold mb-1.5 uppercase ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                        Click a popular business provider to auto-fill settings:
                      </span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {[
                          { id: 'office365', label: '🟦 Microsoft 365 / Office' },
                          { id: 'cpanel', label: '🌐 cPanel / Webmail' },
                          { id: 'zoho', label: '📦 Zoho Mail' },
                          { id: 'godaddy', label: '🟡 GoDaddy' },
                          { id: 'hostinger', label: '🟣 Hostinger' },
                          { id: 'namecheap', label: '🏷️ Namecheap' },
                          { id: 'titan', label: '🛡️ Titan Email' },
                          { id: 'amazon_ses', label: '⚡ Amazon SES' },
                          { id: 'sendgrid', label: '📨 SendGrid' },
                          { id: 'brevo', label: '🚀 Brevo' },
                          { id: 'yandex', label: '🇷🇺 Yandex' },
                          { id: 'custom', label: '⚙️ Custom Server' },
                        ].map(pr => (
                          <button
                            key={pr.id}
                            type="button"
                            onClick={() => applyBusinessPreset(pr.id as any)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                              businessPreset === pr.id
                                ? 'bg-amber-500 text-slate-950 font-black shadow-md scale-105'
                                : isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                            }`}
                          >
                            {pr.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <form onSubmit={(e) => handleSaveAccount(e)} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className={`block text-xs font-bold mb-1.5 ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                          Business Email Address
                        </label>
                        <input
                          type="email"
                          value={accForm.email}
                          onChange={e => handleBusinessEmailChange(e.target.value)}
                          placeholder="e.g. sales@yourcompany.com"
                          className={inputCls}
                          required
                        />
                        <p className="text-[10px] text-slate-500 mt-1">Typing your email auto-configures your mail server domain.</p>
                      </div>
                      <div>
                        <label className={`block text-xs font-bold mb-1.5 ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                          Mailbox Password
                        </label>
                        <div className="relative">
                          <input
                            type={showPass ? 'text' : 'password'}
                            value={accForm.password}
                            onChange={e => setAccForm(p => ({ ...p, password: e.target.value }))}
                            placeholder="Your email account password"
                            className={inputCls + ' pr-10'}
                            required
                          />
                          <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 cursor-pointer">
                            {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1">Your company email password used to log into webmail.</p>
                      </div>
                    </div>

                    <div>
                      <label className={`block text-xs font-bold mb-1.5 ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                        Sender Display Name (Optional)
                      </label>
                      <input
                        type="text"
                        value={accForm.senderName}
                        onChange={e => setAccForm(p => ({ ...p, senderName: e.target.value }))}
                        placeholder="e.g. Alex from Octal Team"
                        className={inputCls}
                      />
                    </div>

                    {/* Collapsible Advanced Server Details */}
                    <div>
                      <button
                        type="button"
                        onClick={() => setShowAdvancedSmtp(!showAdvancedSmtp)}
                        className={`text-xs font-bold flex items-center gap-1.5 cursor-pointer py-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}
                      >
                        {showAdvancedSmtp ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        <span>Advanced Server Parameters (Auto: {accForm.smtpHost}:{accForm.smtpPort} {accForm.smtpPort === '465' ? 'SSL' : 'TLS'})</span>
                      </button>

                      {showAdvancedSmtp && (
                        <div className={`mt-2 p-4 rounded-xl border grid grid-cols-1 sm:grid-cols-2 gap-3 ${
                          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-850'
                        }`}>
                          <div>
                            <label className="block text-[10px] font-mono font-bold mb-1 text-slate-400">SMTP Host (Server Domain)</label>
                            <input
                              type="text"
                              value={accForm.smtpHost}
                              onChange={e => setAccForm(p => ({ ...p, smtpHost: e.target.value }))}
                              placeholder="mail.yourdomain.com"
                              className={inputCls}
                            />
                            <span className="text-[9px] text-slate-500 mt-0.5 block">Host is where your mail server lives.</span>
                          </div>
                          <div>
                            <label className="block text-[10px] font-mono font-bold mb-1 text-slate-400">SMTP Port (465 = SSL, 587 = TLS)</label>
                            <input
                              type="number"
                              value={accForm.smtpPort}
                              onChange={e => setAccForm(p => ({ ...p, smtpPort: e.target.value }))}
                              placeholder="465"
                              className={inputCls}
                            />
                            <span className="text-[9px] text-slate-500 mt-0.5 block">Port 465 uses direct SSL encryption.</span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="pt-2">
                      <button type="submit" className={btnPrimary + ' w-full sm:w-auto'}>
                        <Plus className="w-4 h-4" /> Connect Business Email
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* OPTION 3: OUTLOOK / MICROSOFT */}
              {selectedProvider === 'outlook' && (
                <div className="space-y-6">
                  {/* Header & SMTP Specs Pill */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/60">
                    <div>
                      <h3 className={`text-sm font-black flex items-center gap-2 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                        <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Connect Microsoft Outlook / Office 365 / Hotmail
                      </h3>
                      <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                        Use 1-Click Microsoft Login or connect directly with standard Outlook SMTP.
                      </p>
                    </div>

                    {/* Official Microsoft SMTP Info Badge */}
                    <div className={`px-3 py-1.5 rounded-xl border text-[11px] font-mono font-bold flex items-center gap-2 ${
                      isLight ? 'bg-blue-50 border-blue-300 text-blue-800' : 'bg-blue-950/40 border-blue-500/40 text-blue-300'
                    }`}>
                      <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                      <span>SMTP: <strong>smtp.office365.com:587</strong> (TLS)</span>
                    </div>
                  </div>

                  {/* 1-Click OAuth Hero Box */}
                  <div className={`p-5 rounded-2xl border text-center space-y-3 ${
                    isLight ? 'bg-blue-50/50 border-blue-200' : 'bg-blue-950/20 border-blue-900/60'
                  }`}>
                    <div className="max-w-md mx-auto space-y-1">
                      <p className={`text-xs font-black uppercase tracking-wider text-blue-400`}>Recommended · Fastest</p>
                      <h4 className={`text-sm font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>1-Click Microsoft OAuth Connect</h4>
                      <p className={`text-xs ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                        Authorizes your Outlook or corporate Office 365 mailbox in 1 click without typing SMTP server passwords.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { window.location.href = `${serverUrl}/email/oauth/microsoft/connect`; }}
                      className="py-3 px-6 rounded-2xl font-black text-sm bg-[#0078D4] hover:bg-[#006cbd] text-white shadow-lg transition-all inline-flex items-center justify-center gap-3 cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                        <path d="M11.5 2.5H2.5V11.5H11.5V2.5Z" fill="#F25022"/>
                        <path d="M21.5 2.5H12.5V11.5H21.5V2.5Z" fill="#7FBA00"/>
                        <path d="M11.5 12.5H2.5V21.5H11.5V12.5Z" fill="#00A4EF"/>
                        <path d="M21.5 12.5H12.5V21.5H21.5V12.5Z" fill="#FFB900"/>
                      </svg>
                      <span>1-Click Connect with Microsoft</span>
                    </button>
                  </div>

                  {/* Direct Outlook SMTP Form */}
                  <div className={`p-5 rounded-2xl border space-y-4 ${
                    isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                  }`}>
                    <div className="flex items-center justify-between">
                      <h4 className={`text-xs font-black uppercase tracking-wider flex items-center gap-2 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                        <span>Or Connect with Outlook SMTP Credentials</span>
                      </h4>
                      <span className="text-[10px] font-mono text-slate-500">Auto-configured: smtp.office365.com:587</span>
                    </div>

                    <form onSubmit={(e) => handleSaveAccount(e, { smtpHost: 'smtp.office365.com', smtpPort: '587' })} className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className={`block text-xs font-bold mb-1.5 ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                            Outlook / Office 365 Email
                          </label>
                          <input
                            type="email"
                            value={accForm.email}
                            onChange={e => setAccForm(p => ({ ...p, email: e.target.value }))}
                            placeholder="yourname@outlook.com or user@company.com"
                            className={inputCls}
                            required
                          />
                        </div>
                        <div>
                          <label className={`block text-xs font-bold mb-1.5 ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                            Account Password / App Password
                          </label>
                          <div className="relative">
                            <input
                              type={showPass ? 'text' : 'password'}
                              value={accForm.password}
                              onChange={e => setAccForm(p => ({ ...p, password: e.target.value }))}
                              placeholder="Your Microsoft account password"
                              className={inputCls + ' pr-10'}
                              required
                            />
                            <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 cursor-pointer">
                              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className={`block text-xs font-bold mb-1.5 ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                          Sender Display Name (Optional)
                        </label>
                        <input
                          type="text"
                          value={accForm.senderName}
                          onChange={e => setAccForm(p => ({ ...p, senderName: e.target.value }))}
                          placeholder="e.g. Alex (Support Team)"
                          className={inputCls}
                        />
                      </div>

                      <div className="pt-1">
                        <button type="submit" className={btnPrimary + ' w-full sm:w-auto'}>
                          <Plus className="w-4 h-4" /> Save Outlook SMTP Account
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* OPTION 4: YAHOO MAIL */}
              {selectedProvider === 'yahoo' && (
                <div className="space-y-6">
                  {/* Header & SMTP Specs Pill */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/60">
                    <div>
                      <h3 className={`text-sm font-black flex items-center gap-2 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                        <span className="w-2.5 h-2.5 rounded-full bg-purple-500" /> Connect Yahoo Mail / AOL
                      </h3>
                      <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                        Use 1-Click Yahoo Login or connect directly with standard Yahoo SMTP.
                      </p>
                    </div>

                    {/* Official Yahoo SMTP Info Badge */}
                    <div className={`px-3 py-1.5 rounded-xl border text-[11px] font-mono font-bold flex items-center gap-2 ${
                      isLight ? 'bg-purple-50 border-purple-300 text-purple-800' : 'bg-purple-950/40 border-purple-500/40 text-purple-300'
                    }`}>
                      <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                      <span>SMTP: <strong>smtp.mail.yahoo.com:465</strong> (SSL)</span>
                    </div>
                  </div>

                  {/* 1-Click OAuth Hero Box */}
                  <div className={`p-5 rounded-2xl border text-center space-y-3 ${
                    isLight ? 'bg-purple-50/50 border-purple-200' : 'bg-purple-950/20 border-purple-900/60'
                  }`}>
                    <div className="max-w-md mx-auto space-y-1">
                      <p className={`text-xs font-black uppercase tracking-wider text-purple-400`}>Recommended · Fastest</p>
                      <h4 className={`text-sm font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>1-Click Yahoo OAuth Connect</h4>
                      <p className={`text-xs ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                        Authorizes your Yahoo Mail or AOL account in 1 click securely.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { window.location.href = `${serverUrl}/email/oauth/yahoo/connect`; }}
                      className="py-3 px-6 rounded-2xl font-black text-sm bg-[#6001d2] hover:bg-[#5200b3] text-white shadow-lg transition-all inline-flex items-center justify-center gap-3 cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                        <path d="M12.5 13.5L16.2 3.5H19.5L14.2 16.5V20.5H11.8V16.5L6.5 3.5H9.8L12.5 13.5Z" />
                      </svg>
                      <span>1-Click Connect with Yahoo</span>
                    </button>
                  </div>

                  {/* Direct Yahoo SMTP Form */}
                  <div className={`p-5 rounded-2xl border space-y-4 ${
                    isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                  }`}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <h4 className={`text-xs font-black uppercase tracking-wider ${isLight ? 'text-slate-900' : 'text-white'}`}>
                        Or Connect with Yahoo App Password
                      </h4>
                      <a
                        href="https://login.yahoo.com/account/security"
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold text-[10px] shadow inline-flex items-center gap-1 self-start sm:self-auto cursor-pointer"
                      >
                        <span>Generate Yahoo Password</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>

                    <form onSubmit={(e) => handleSaveAccount(e, { smtpHost: 'smtp.mail.yahoo.com', smtpPort: '465' })} className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className={`block text-xs font-bold mb-1.5 ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                            Yahoo Email Address
                          </label>
                          <input
                            type="email"
                            value={accForm.email}
                            onChange={e => setAccForm(p => ({ ...p, email: e.target.value }))}
                            placeholder="yourname@yahoo.com"
                            className={inputCls}
                            required
                          />
                        </div>
                        <div>
                          <label className={`block text-xs font-bold mb-1.5 ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                            Yahoo App Password
                          </label>
                          <div className="relative">
                            <input
                              type={showPass ? 'text' : 'password'}
                              value={accForm.password}
                              onChange={e => setAccForm(p => ({ ...p, password: e.target.value }))}
                              placeholder="16-character generated password"
                              className={inputCls + ' pr-10'}
                              required
                            />
                            <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 cursor-pointer">
                              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className={`block text-xs font-bold mb-1.5 ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                          Sender Display Name (Optional)
                        </label>
                        <input
                          type="text"
                          value={accForm.senderName}
                          onChange={e => setAccForm(p => ({ ...p, senderName: e.target.value }))}
                          placeholder="e.g. Alex Smith"
                          className={inputCls}
                        />
                      </div>

                      <div className="pt-1">
                        <button type="submit" className={btnPrimary + ' w-full sm:w-auto'}>
                          <Plus className="w-4 h-4" /> Save Yahoo SMTP Account
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

            </div>

            {/* ── CONFIGURED SENDER ACCOUNTS LIST ── */}
            <div className={card}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <h3 className={`text-sm font-black flex items-center gap-2 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  <Server className="w-4 h-4 text-emerald-400" /> Active Connected Mailboxes ({accounts.length})
                </h3>

                {/* Filter Pills */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`text-[10px] font-mono mr-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Filter:</span>
                  {[
                    { id: 'all', label: `All (${accounts.length})` },
                    { id: 'google', label: `Google (${accounts.filter(a => getAccountProvider(a) === 'google').length})` },
                    { id: 'business', label: `Business (${accounts.filter(a => getAccountProvider(a) === 'business').length})` },
                    { id: 'outlook', label: `Outlook (${accounts.filter(a => getAccountProvider(a) === 'outlook').length})` },
                    { id: 'yahoo', label: `Yahoo (${accounts.filter(a => getAccountProvider(a) === 'yahoo').length})` },
                  ].map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setAccountFilter(f.id as any)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold transition cursor-pointer ${
                        accountFilter === f.id
                          ? isLight ? 'bg-slate-900 text-white' : 'bg-amber-500 text-slate-950'
                          : isLight ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-slate-900 text-slate-400 hover:bg-slate-850'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Senders List */}
              <div className="space-y-3">
                {filteredAccounts.map(acc => {
                  const provider = getAccountProvider(acc);
                  return (
                    <div
                      key={acc.id}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border gap-3 transition-all ${
                        acc.status === 'active'
                          ? isLight ? 'border-slate-200 bg-slate-50/80' : 'border-slate-800 bg-slate-950/60'
                          : isLight ? 'border-slate-200 bg-slate-100/50 opacity-60' : 'border-slate-900 bg-slate-950/30 opacity-60'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          {renderProviderBadge(provider, acc.authType)}
                          <p className={`text-sm font-bold truncate ${isLight ? 'text-slate-900' : 'text-white'}`}>{acc.email}</p>
                          {acc.senderName && (
                            <span className={`text-xs font-medium ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                              · &ldquo;{acc.senderName}&rdquo;
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-[11px] font-mono">
                          <span className={isLight ? 'text-slate-500' : 'text-slate-400'}>
                            {acc.smtpHost}:{acc.smtpPort}
                          </span>
                          <span className="text-slate-500">•</span>
                          <span className="text-emerald-500 font-bold">
                            ✓ Ready to send
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleToggleAccount(acc)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border transition cursor-pointer ${
                            acc.status === 'active'
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                              : 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20'
                          }`}
                        >
                          {acc.status === 'active' ? '● Active' : '○ Paused'}
                        </button>
                        <button
                          onClick={() => handleDeleteAccount(acc.id)}
                          className="p-2 text-red-400 hover:text-red-300 hover:bg-red-950/40 rounded-lg transition cursor-pointer"
                          title="Remove Account"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {filteredAccounts.length === 0 && (
                  <div className={`p-8 text-center rounded-xl border border-dashed ${isLight ? 'border-slate-200 text-slate-500' : 'border-slate-800 text-slate-500'}`}>
                    <Mail className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-xs font-sans">
                      {accounts.length === 0
                        ? 'No email accounts connected yet. Choose a provider above to link your first account.'
                        : 'No accounts match the selected filter.'}
                    </p>
                  </div>
                )}
              </div>
            </div>

          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* ── 2. SIMPLE CAMPAIGN CONTROL ────────────────────────────────────────── */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {activeSubTab === 'emailer-campaign' && (
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

          {/* Campaign Control Center */}
          <div className={card}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800/80 mb-5">
              <div>
                <h2 className={`text-base font-black flex items-center gap-2 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  <Zap className="w-5 h-5 text-amber-500" /> Cold Email Campaign Engine
                </h2>
                <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  {activeAccounts} sender mailbox{activeAccounts !== 1 ? 'es' : ''} connected · {templates.length} template{templates.length !== 1 ? 's' : ''} loaded
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className={`text-xs font-mono font-bold px-3 py-1.5 rounded-full border ${
                  campaignStatus === 'running'
                    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                    : 'bg-slate-900 border-slate-700 text-slate-400'
                }`}>
                  <span className={`inline-block w-2 h-2 rounded-full mr-2 ${campaignStatus === 'running' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`} />
                  {campaignStatus === 'running' ? 'Active & Sending' : 'Idle'}
                </span>
              </div>
            </div>

            {/* Sender Selection */}
            <div className="space-y-3 mb-5">
              <div className="flex items-center justify-between">
                <label className={`text-xs font-bold uppercase tracking-wider ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                  Send Emails From:
                </label>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setSenderMode('all')}
                    className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                      senderMode === 'all'
                        ? 'bg-amber-500 text-slate-950 font-black'
                        : 'bg-slate-900 text-slate-400 hover:bg-slate-850'
                    }`}
                  >
                    🔄 Rotate All Active ({activeAccounts})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSenderMode('specific')}
                    className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                      senderMode === 'specific'
                        ? 'bg-amber-500 text-slate-950 font-black'
                        : 'bg-slate-900 text-slate-400 hover:bg-slate-850'
                    }`}
                  >
                    🎯 Pick Specific Accounts
                  </button>
                </div>
              </div>

              {senderMode === 'specific' && (
                <div className={`p-4 rounded-xl border space-y-2 max-h-44 overflow-y-auto ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                }`}>
                  {accounts.map(acc => {
                    const checked = selectedAccountIds.includes(acc.id);
                    const provider = getAccountProvider(acc);
                    return (
                      <div
                        key={acc.id}
                        onClick={() => toggleAccountSelection(acc.id)}
                        className={`flex items-center justify-between p-2.5 rounded-lg border text-xs cursor-pointer transition ${
                          checked
                            ? 'bg-amber-500/10 border-amber-500/40 text-white'
                            : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-850'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {checked ? <CheckSquare className="w-4 h-4 text-amber-500" /> : <SquareOutline className="w-4 h-4 text-slate-500" />}
                          <span className="font-bold">{acc.email}</span>
                        </div>
                        {renderProviderBadge(provider, acc.authType)}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Launch Buttons & Throttle */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-slate-800/80">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-400">Daily limit per run:</span>
                <input
                  type="number"
                  value={campaignLimit}
                  onChange={e => setCampaignLimit(Number(e.target.value))}
                  className="w-20 px-3 py-1.5 rounded-lg border text-xs font-mono font-bold bg-slate-900 border-slate-700 text-white"
                  min={1}
                  max={1000}
                />
                <span className="text-xs text-slate-400 font-mono">emails</span>
              </div>

              {campaignStatus === 'idle' ? (
                <button
                  onClick={startCampaign}
                  disabled={targetCampaignAccounts.length === 0}
                  className="px-8 py-3.5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-black text-sm rounded-xl shadow-lg transition cursor-pointer flex items-center justify-center gap-2"
                >
                  <Play className="w-4 h-4 fill-current" /> Start Cold Email Campaign
                </button>
              ) : (
                <button onClick={stopCampaign} className="px-8 py-3.5 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 text-white font-black text-sm rounded-xl shadow-lg transition cursor-pointer flex items-center justify-center gap-2">
                  <Square className="w-4 h-4 fill-current" /> Stop Campaign
                </button>
              )}
            </div>
          </div>

          {/* Live Log */}
          <div className={card}>
            <h3 className={`text-sm font-black mb-3 flex items-center gap-2 ${isLight ? 'text-slate-900' : 'text-white'}`}>
              <Inbox className="w-4 h-4 text-amber-500" /> Live Campaign Activity
            </h3>
            <div
              ref={logRef}
              className={`h-56 overflow-y-auto rounded-xl p-3 font-mono text-[11px] leading-relaxed space-y-1 ${
                isLight ? 'bg-slate-100 text-slate-700 border border-slate-200' : 'bg-black text-emerald-300 border border-slate-800'
              }`}
            >
              {logs.length === 0
                ? <p className="text-slate-500">Ready. Start your campaign to see real-time delivery logs...</p>
                : logs.map((l, i) => <div key={i}>{l}</div>)
              }
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* ── 3. LEADS TAB ────────────────────────────────────────────────────── */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {activeSubTab === 'emailer-leads' && (
        <div className="space-y-5">
          <div className={card}>
            <h2 className={`text-sm font-black mb-1 ${isLight ? 'text-slate-900' : 'text-white'}`}>Upload Email Leads</h2>
            <p className={`text-xs mb-3 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              One lead per line: <code className="font-mono">email,name,company</code>
            </p>
            <textarea
              value={leadsText}
              onChange={e => setLeadsText(e.target.value)}
              placeholder={"john@example.com,John Smith,Acme Corp\njane@company.com,Jane Doe,Tech Ltd"}
              rows={7}
              className={inputCls + ' resize-none font-mono text-xs'}
            />
            <div className="flex items-center gap-3 mt-3">
              <button onClick={handleUploadLeads} className={btnPrimary}>
                <Upload className="w-4 h-4" /> Upload Leads List
              </button>
              <button onClick={handleClearLeads} className="flex items-center gap-2 px-4 py-3 border border-red-400 text-red-500 text-xs font-bold rounded-xl hover:bg-red-50 dark:hover:bg-red-950/30 transition cursor-pointer">
                <Trash2 className="w-4 h-4" /> Clear All Leads
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
            <h2 className={`text-sm font-black mb-3 ${isLight ? 'text-slate-900' : 'text-white'}`}>Leads List ({leads.length})</h2>
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
                {leads.slice(0, 150).map(lead => (
                  <tr key={lead.id} className={`border-b ${isLight ? 'border-slate-100' : 'border-slate-900'}`}>
                    <td className={`py-2 pr-4 font-mono ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>{lead.email}</td>
                    <td className={`py-2 pr-4 ${isLight ? 'text-slate-700' : 'text-slate-400'}`}>{lead.name}</td>
                    <td className={`py-2 pr-4 ${isLight ? 'text-slate-600' : 'text-slate-500'}`}>{lead.company || '—'}</td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold border ${
                        lead.status === 'completed' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
                        : lead.status === 'sent' ? 'bg-blue-500/10 border-blue-500/30 text-blue-500'
                        : 'bg-amber-500/10 border-amber-500/30 text-amber-500'
                      }`}>{lead.status}</span>
                    </td>
                    <td className={`py-2 font-mono font-bold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>{lead.stage}/3</td>
                  </tr>
                ))}
                {leads.length === 0 && (
                  <tr><td colSpan={5} className={`py-8 text-center text-xs ${isLight ? 'text-slate-400' : 'text-slate-600'}`}>No leads loaded yet. Upload your contact list above.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* ── 4. TEMPLATES TAB ───────────────────────────────────────────────── */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {activeSubTab === 'emailer-templates' && (
        <div className="space-y-5">
          <div className={card}>
            <h2 className={`text-sm font-black mb-4 ${isLight ? 'text-slate-900' : 'text-white'}`}>
              {editTplId ? 'Edit Template' : 'Add Email Template'}
            </h2>
            <p className={`text-xs mb-3 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Use <code className="font-mono bg-slate-800 text-amber-400 px-1.5 py-0.5 rounded">{'{{name}}'}</code> and <code className="font-mono bg-slate-800 text-amber-400 px-1.5 py-0.5 rounded">{'{{company}}'}</code> for automatic personalization.
            </p>
            <form onSubmit={handleSaveTemplate} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className={`block text-[10px] font-bold mb-1 uppercase ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Subject</label>
                  <input type="text" value={tplForm.subject} onChange={e => setTplForm(p => ({ ...p, subject: e.target.value }))} placeholder="Quick question for {{name}} at {{company}}" className={inputCls} required />
                </div>
                <div>
                  <label className={`block text-[10px] font-bold mb-1 uppercase ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Campaign Stage</label>
                  <select value={tplForm.stage} onChange={e => setTplForm(p => ({ ...p, stage: e.target.value }))} className={inputCls}>
                    <option value="1">Stage 1 (Initial Contact)</option>
                    <option value="2">Stage 2 (7-Day Follow-Up)</option>
                    <option value="3">Stage 3 (Final Follow-Up)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className={`block text-[10px] font-bold mb-1 uppercase ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Email Message</label>
                <textarea
                  value={tplForm.body}
                  onChange={e => setTplForm(p => ({ ...p, body: e.target.value }))}
                  placeholder={"Hi {{name}},\n\nI noticed your work at {{company}} and wanted to reach out...\n\nBest regards,\n[Your Name]"}
                  rows={8}
                  className={inputCls + ' resize-y font-sans text-xs'}
                  required
                />
              </div>
              <div className="flex items-center gap-3">
                <button type="submit" className={btnPrimary}>
                  <FileText className="w-4 h-4" /> {editTplId ? 'Update Template' : 'Save Template'}
                </button>
                {editTplId && (
                  <button type="button" onClick={() => { setEditTplId(null); setTplForm({ subject: '', body: '', stage: '1' }); }} className={btnSecondary}>
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>

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
                    <p className={`text-xs line-clamp-2 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{tpl.body}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => { setEditTplId(tpl.id); setTplForm({ subject: tpl.subject, body: tpl.body, stage: String(tpl.stage) }); }}
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
                <p className={`text-xs text-center py-6 ${isLight ? 'text-slate-400' : 'text-slate-600'}`}>No email templates yet. Add your first template above.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
