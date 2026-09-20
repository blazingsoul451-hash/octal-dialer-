import React, { useState, useEffect } from 'react';
import {
  PhoneCall, Database, Upload, History,
  Bluetooth, PlaySquare, Sun, Moon, LogOut, ShieldAlert, LayoutDashboard, Menu, Mail,
  Play, Layers, Settings, Users, FileText,
  Facebook, Share2, Terminal, Bot, Shield, CreditCard, TrendingUp,
  Target, Building2
} from 'lucide-react';
import { useSocket } from './hooks/useSocket';
import { DashboardOverview } from './components/DashboardOverview';
import { ReportsPage } from './components/ReportsPage';
import { ConnectionPanel } from './components/ConnectionPanel';
import { ScraperFilesPanel } from './components/ScraperFilesPanel';
import { ImportPanel } from './components/ImportPanel';
import { LeadQueue } from './components/LeadQueue';
import { CallLog } from './components/CallLog';
import { DispositionModal } from './components/DispositionModal';
import type { DispositionResult } from './components/DispositionModal';
import { LoginScreen } from './components/LoginScreen';
import { DncPanel } from './components/DncPanel';
import { AutoEmailer } from './components/AutoEmailer';
import { FacebookScraper } from './components/FacebookScraper';
import { FacebookAutoPoster } from './components/FacebookAutoPoster';
import { AdminPanel } from './components/AdminPanel';
import { LeadsTable } from './components/LeadsTable';
import { BillingPage } from './components/BillingPage';
import { CampaignWorkspacePage } from './components/crm/CampaignWorkspacePage';
import { CRMWorkspacePage } from './components/crm/CRMWorkspacePage';
import { GoogleProfileSetupModal } from './components/GoogleProfileSetupModal';
import { TeamLeadDashboard } from './components/TeamLeadDashboard';
import { SuperAdminPortal } from './components/SuperAdminPortal';
import type { Campaign } from './types';

const getBackendUrl = () => {
  if (import.meta.env.VITE_SERVER_URL) return import.meta.env.VITE_SERVER_URL;
  if (typeof window !== 'undefined') {
    const loc = window.location;
    if (loc.hostname === 'localhost' || loc.hostname === '127.0.0.1') {
      return 'http://127.0.0.1:5000';
    }
    if (loc.hostname.includes('vercel.app') || loc.hostname.includes('sslip.io') || loc.hostname.includes('.')) {
      return '';
    }
    return `http://${loc.hostname}:5000`;
  }
  return '';
};

const SERVER_URL = getBackendUrl();

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'crm' | 'campaigns' | 'follow-ups' | 'reports' | 'admin' | 'billing' | 'leads' | 'dialer' | 'pair' | 'upload' | 'dnc' | 'history' | 'scraper' | 'scraper-import' | 'scraper-settings' | 'emailer-gmail' | 'emailer-campaign' | 'emailer-templates' | 'emailer-leads' | 'fb-scraper' | 'fb-scraper-files' | 'fb-poster-accounts' | 'fb-poster-campaigns' | 'fb-poster-scheduler' | 'fb-poster-joiner' | 'fb-poster-logs' | 'team-lead' | 'super-admin'>('dashboard');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);
  const [lanServerUrl, setLanServerUrl] = useState<string>(SERVER_URL);

  // Auto-dismiss toast notification after 3 seconds
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      setToast(null);
    }, 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  // ─── Auth state ─────────────────────────────────────────────────────────────
  const [authToken, setAuthToken] = useState<string | null>(() => localStorage.getItem('octal_auth_token'));
  const [authUser, setAuthUser] = useState<string | null>(() => localStorage.getItem('octal_auth_user'));
  const [authChecked, setAuthChecked] = useState(false);
  const [showProfileSetupModal, setShowProfileSetupModal] = useState<boolean>(false);

  // ─── Impersonation state (tab-local in sessionStorage; never touches localStorage octal_auth_token) ──
  const [impersonateToken, setImpersonateToken] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const urlImpToken = urlParams.get('impersonateToken');
      if (urlImpToken) {
        sessionStorage.setItem('octal_impersonate_token', urlImpToken);
        const urlImpTenant = urlParams.get('impersonateTenant');
        if (urlImpTenant) sessionStorage.setItem('octal_impersonate_tenant', urlImpTenant);
        return urlImpToken;
      }
      return sessionStorage.getItem('octal_impersonate_token');
    }
    return null;
  });

  const [impersonateTenant, setImpersonateTenant] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('octal_impersonate_tenant');
    }
    return null;
  });

  const isImpersonating = !!impersonateToken;
  const effectiveAuthToken = impersonateToken || authToken;

  // ─── Permission & SaaS Scope state ──────────────────────────────────────────
  const [userRole, setUserRole] = useState<'platform_admin' | 'admin' | 'team_lead' | 'agent'>('agent');
  const [customerType, setCustomerType] = useState<'COMPANY' | 'PERSONAL'>('COMPANY');
  const [userPermissions, setUserPermissions] = useState<Record<string, boolean>>({
    crm: false,
    campaigns: false,
    octalDialer: false,
    leads: false,
    reports: false,
    googleScraper: false,
    autoEmailer: false,
    facebookScraper: false,
    facebookPoster: false
  });

  // ─── UI Scale / Display Density State (Laptop & Desktop Adaptability) ─────
  const [uiZoom, setUiZoom] = useState<string>(() => {
    return localStorage.getItem('octal_ui_zoom') || '100%';
  });

  useEffect(() => {
    try {
      const zoomMap: Record<string, string> = {
        '100%': '1',
        '90%': '0.9',
        '85%': '0.85',
        '80%': '0.8'
      };
      const zoomVal = zoomMap[uiZoom] || '1';
      (document.documentElement.style as any).zoom = zoomVal;
      localStorage.setItem('octal_ui_zoom', uiZoom);
    } catch (e) {
      console.warn('CSS zoom not supported:', e);
    }
  }, [uiZoom]);

  const cycleUiZoom = () => {
    const zoomLevels = ['100%', '90%', '85%', '80%'];
    const currentIndex = zoomLevels.indexOf(uiZoom);
    const nextZoom = zoomLevels[(currentIndex + 1) % zoomLevels.length];
    setUiZoom(nextZoom);
  };

  // ─── Collapsible Hover & Pinned Navigation Drawer State ──────────
  const [isNavPinned, setIsNavPinned] = useState(() => {
    if (typeof window !== 'undefined') {
      const savedPin = localStorage.getItem('octal_nav_pinned');
      if (savedPin !== null) return savedPin === 'true';
      return window.innerWidth >= 1440; // Default expanded only on large desktop screens >= 1440px
    }
    return false;
  });
  const [isNavHovered, setIsNavHovered] = useState(false);
  const isNavExpanded = isNavPinned || isNavHovered;
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const toggleNavPinned = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsNavPinned((prev) => {
      const next = !prev;
      localStorage.setItem('octal_nav_pinned', String(next));
      return next;
    });
  };

  // Automatically close mobile menu when tab changes or Escape pressed
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [activeTab]);

  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileMenuOpen]);

  const [openAccordion, setOpenAccordion] = useState<Record<string, boolean>>({
    octalDialer: true,
    googleScraper: false,
    autoEmailer: false,
    facebookScraper: false,
    facebookPoster: false
  });

  // Synchronize accordion open/collapse state with active tab
  useEffect(() => {
    const isDialerSubTab = ['dialer', 'pair', 'upload', 'dnc', 'history'].includes(activeTab);
    const isScraperSubTab = ['scraper', 'scraper-import', 'scraper-settings'].includes(activeTab);
    const isEmailerSubTab = ['emailer-gmail', 'emailer-campaign', 'emailer-templates', 'emailer-leads'].includes(activeTab);
    const isFbScraperSubTab = ['fb-scraper', 'fb-scraper-files'].includes(activeTab);
    const isFbPosterSubTab = ['fb-poster-accounts', 'fb-poster-campaigns', 'fb-poster-scheduler', 'fb-poster-joiner', 'fb-poster-logs'].includes(activeTab);

    if (isDialerSubTab) {
      setOpenAccordion({ octalDialer: true, googleScraper: false, autoEmailer: false, facebookScraper: false, facebookPoster: false });
    } else if (isScraperSubTab) {
      setOpenAccordion({ octalDialer: false, googleScraper: true, autoEmailer: false, facebookScraper: false, facebookPoster: false });
    } else if (isEmailerSubTab) {
      setOpenAccordion({ octalDialer: false, googleScraper: false, autoEmailer: true, facebookScraper: false, facebookPoster: false });
    } else if (isFbScraperSubTab) {
      setOpenAccordion({ octalDialer: false, googleScraper: false, autoEmailer: false, facebookScraper: true, facebookPoster: false });
    } else if (isFbPosterSubTab) {
      setOpenAccordion({ octalDialer: false, googleScraper: false, autoEmailer: false, facebookScraper: false, facebookPoster: true });
    } else {
      setOpenAccordion({ octalDialer: false, googleScraper: false, autoEmailer: false, facebookScraper: false, facebookPoster: false });
    }
  }, [activeTab]);

  const toggleAccordion = (key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // Toggle accordion open/closed
    const newState: Record<string, boolean> = { octalDialer: false, googleScraper: false, autoEmailer: false, facebookScraper: false, facebookPoster: false };
    newState[key] = !openAccordion[key];
    setOpenAccordion(newState);

    // When opening, select default tab for that module
    if (newState[key]) {
      if (key === 'octalDialer') {
        setActiveTab('dialer');
      } else if (key === 'googleScraper') {
        setActiveTab('scraper');
      } else if (key === 'autoEmailer') {
        setActiveTab('emailer-gmail');
      } else if (key === 'facebookScraper') {
        setActiveTab('fb-scraper');
      } else if (key === 'facebookPoster') {
        setActiveTab('fb-poster-accounts');
      }
    }
  };

  const handleLogin = (token: string, username: string) => {
    setAuthToken(token);
    setAuthUser(username);
  };

  const handleLogout = async () => {
    if (authToken) {
      await fetch(`${SERVER_URL}/auth/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` }
      }).catch(() => {});
    }
    localStorage.removeItem('octal_auth_token');
    localStorage.removeItem('octal_auth_user');
    localStorage.removeItem('octal_session_id');
    setAuthToken(null);
    setAuthUser(null);
    setUserRole('agent');
    setCustomerType('COMPANY');
    setUserPermissions({} as any);
    setCampaigns([]);
    setDispOpen(false);
    setActiveTab('dashboard');
  };

  // Bright Mode / Dark Mode state
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('octal_theme') as 'dark' | 'light') || 'dark';
  });

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('octal_theme', next);
  };

  // Verify stored auth token on mount & check URL query params from Google OAuth redirects or impersonation
  useEffect(() => {
    // Check URL parameters for OAuth tokens, impersonation tokens, or auth errors
    const urlParams = new URLSearchParams(window.location.search);
    const oauthToken = urlParams.get('token');
    const oauthUser = urlParams.get('displayName') || urlParams.get('username') || urlParams.get('user') || 'Google User';
    const authError = urlParams.get('auth_error');
    const urlImpToken = urlParams.get('impersonateToken');
    const urlImpTenant = urlParams.get('impersonateTenant');

    let currentToken = effectiveAuthToken;

    if (urlImpToken) {
      sessionStorage.setItem('octal_impersonate_token', urlImpToken);
      if (urlImpTenant) sessionStorage.setItem('octal_impersonate_tenant', urlImpTenant);
      setImpersonateToken(urlImpToken);
      setImpersonateTenant(urlImpTenant || 'Tenant Organization');
      currentToken = urlImpToken;
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (oauthToken) {
      localStorage.setItem('octal_auth_token', oauthToken);
      localStorage.setItem('octal_auth_user', oauthUser);
      setAuthToken(oauthToken);
      setAuthUser(oauthUser);
      currentToken = oauthToken;
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (authError) {
      setToast({ message: `Authentication notice: ${authError}`, type: 'info' });
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    const verifyToken = async () => {
      if (!currentToken) {
        setAuthChecked(true);
        return;
      }
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      try {
        const res = await fetch(`${SERVER_URL}/auth/verify`, {
          headers: { 'Authorization': `Bearer ${currentToken}` },
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          const preferredName = data.user?.displayName || data.user?.username;
          if (preferredName) {
            setAuthUser(preferredName);
            if (!sessionStorage.getItem('octal_impersonate_token')) {
              localStorage.setItem('octal_auth_user', preferredName);
            }
          }
        } else if (res.status === 401 || res.status === 403) {
          // Token strictly rejected by server
          if (sessionStorage.getItem('octal_impersonate_token')) {
            sessionStorage.removeItem('octal_impersonate_token');
            sessionStorage.removeItem('octal_impersonate_tenant');
            setImpersonateToken(null);
          } else {
            localStorage.removeItem('octal_auth_token');
            localStorage.removeItem('octal_auth_user');
            setAuthToken(null);
            setAuthUser(null);
          }
        }
      } catch (err) {
        clearTimeout(timeoutId);
        console.warn('Notice: token verification network check skipped:', err);
      } finally {
        setAuthChecked(true);
      }
    };
    verifyToken();
  }, []);

  // Fetch user role and permissions
  useEffect(() => {
    if (!effectiveAuthToken) return;

    const fetchUserData = async () => {
      try {
        // Get user role
        const res = await fetch(`${lanServerUrl}/auth/me`, {
          headers: { 'Authorization': `Bearer ${effectiveAuthToken}` }
        });

        if (res.ok) {
          const data = await res.json();
          setUserRole(data.user.role);
          if (data.tenant) {
            if (data.tenant.customerType) setCustomerType(data.tenant.customerType);
          }
          if (data.needsProfileSetup || data.user?.needsProfileSetup) {
            setShowProfileSetupModal(true);
          }

          if (data.user.role === 'platform_admin') {
            setUserPermissions({
              octalDialer: true,
              googleScraper: true,
              autoEmailer: true,
              facebookScraper: true,
              facebookPoster: true,
              crm: true,
              campaigns: true,
              leads: true,
              reports: true
            });
          } else {
            // Fetch module permissions
            const permRes = await fetch(`${lanServerUrl}/auth/permissions`, {
              headers: { 'Authorization': `Bearer ${effectiveAuthToken}` }
            });

            if (permRes.ok) {
              const data = await permRes.json();
              setUserPermissions(data.permissions || data);
            }
          }
        }
      } catch (err) {
        console.error('Error fetching user data:', err);
      }
    };

    fetchUserData();
  }, [effectiveAuthToken, lanServerUrl]);

  // Fetch Server Info (Public Tunnel / LAN IP) on mount
  useEffect(() => {
    fetch(`${SERVER_URL}/info`)
      .then(res => res.json())
      .then(data => {
        if (data.serverUrl) {
          setLanServerUrl(data.serverUrl);
        } else if (data.localIP && data.localIP !== 'localhost') {
          setLanServerUrl(`http://${data.localIP}:3000`);
        }
      })
      .catch(err => console.error('Error fetching server info:', err));
  }, []);

  // Disposition popup states
  const [dispOpen, setDispOpen] = useState(false);
  const [dispLeadId, setDispLeadId] = useState('');
  const [dispLeadName, setDispLeadName] = useState('');
  const [dispInitialOutcome, setDispInitialOutcome] = useState<string>('ANSWERED');
  const [lastDispositionSaved, setLastDispositionSaved] = useState<DispositionResult | null>(null);

  // Pass auth token to socket connection
  const socketData = useSocket(SERVER_URL, effectiveAuthToken || undefined);

  const fetchCampaigns = async () => {
    if (!effectiveAuthToken) return;
    try {
      const res = await fetch(`${SERVER_URL}/campaigns`, {
        headers: { 'Authorization': `Bearer ${effectiveAuthToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data);
      }
    } catch (err) {
      console.error('Error fetching campaigns:', err);
    }
  };

  useEffect(() => {
    if (effectiveAuthToken) {
      fetchCampaigns();
    }
  }, [effectiveAuthToken]);

  const showToast = (message: string, type: 'success' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleImportSuccess = (campaignName: string, count: number) => {
    showToast(`Campaign "${campaignName}" imported with ${count} leads!`, 'success');
    fetchCampaigns();
    setActiveTab('dialer'); // auto redirect to dialer
  };

  const triggerDisposition = (leadId: string, leadName: string, initialOutcome: string = 'ANSWERED') => {
    setDispLeadId(leadId);
    setDispLeadName(leadName);
    setDispInitialOutcome(initialOutcome);
    setDispOpen(true);
  };

  const isLight = theme === 'light';

  // Synchronize document theme class for Tailwind dark: modifiers
  useEffect(() => {
    if (isLight) {
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
    }
  }, [isLight]);

  // ─── Gate: show spinner while checking stored token ──────────────────────────
  if (!authChecked) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-500 font-mono text-sm animate-pulse">Authenticating...</div>
      </div>
    );
  }

  // ─── Gate: show login screen if not authenticated ─────────────────────────────
  if (!effectiveAuthToken) {
    return <LoginScreen serverUrl={SERVER_URL} onLogin={handleLogin} />;
  }

  // Section 12: Dedicated Platform Owner shell: if platform_admin and NOT impersonating, render SuperAdminPortal directly without customer drawer
  if (userRole === 'platform_admin' && !isImpersonating) {
    return (
      <div className={`min-h-screen w-full flex flex-col font-sans ${isLight ? 'bg-slate-100 text-slate-900' : 'bg-black text-slate-100'}`}>
        <SuperAdminPortal
          serverUrl={lanServerUrl}
          authToken={effectiveAuthToken}
          currentUser={authUser}
          onLogout={handleLogout}
        />
      </div>
    );
  }

  return (
    <div className={`min-h-screen w-full max-w-full overflow-x-hidden flex flex-col font-sans transition-colors ${
      isLight ? 'bg-slate-100 text-slate-900' : 'bg-black text-slate-100'
    }`}>

      {/* 🛡️ Platform Support Impersonation Banner */}
      {isImpersonating && (
        <div className="bg-gradient-to-r from-amber-600 to-rose-600 text-white px-4 py-2.5 flex items-center justify-between text-xs font-bold shadow-lg z-50 sticky top-0 border-b border-rose-400/40">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-white animate-pulse" />
            <span>IMPERSONATING WORKSPACE: <span className="underline font-mono text-amber-200">{impersonateTenant || 'Tenant Organization'}</span> (Platform Support Mode)</span>
          </div>
          <button
            onClick={() => {
              sessionStorage.removeItem('octal_impersonate_token');
              sessionStorage.removeItem('octal_impersonate_tenant');
              window.location.href = window.location.origin;
            }}
            className="px-3 py-1 bg-white text-slate-950 font-bold rounded-lg hover:bg-amber-100 transition font-mono text-[11px] cursor-pointer shadow-sm"
          >
            Exit Impersonation
          </button>
        </div>
      )}

      {/* 📲 Incoming Cellular Call Modal / Banner */}
      {socketData.incomingCall && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4 animate-bounce">
          <div className="p-4 rounded-2xl border-2 border-emerald-500 bg-slate-950 text-white shadow-2xl shadow-emerald-500/30 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
                <span className="text-xl">📞</span>
              </div>
              <div className="min-w-0">
                <div className="text-xs font-mono uppercase tracking-wider text-emerald-400 font-bold">Incoming Cellular Call</div>
                <div className="text-base font-bold truncate text-white">{socketData.incomingCall.phone}</div>
                <div className="text-xs text-slate-400 truncate">{socketData.incomingCall.deviceName}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => socketData.answerCall()}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/30 cursor-pointer flex items-center gap-1.5 transition-all"
              >
                <span>Answer</span>
              </button>
              <button
                onClick={() => socketData.hangupCall()}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-lg shadow-red-600/30 cursor-pointer flex items-center gap-1.5 transition-all"
              >
                <span>Decline</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification Banner (Bottom-Right, Non-Blocking) */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 p-3.5 px-4.5 border-2 rounded-2xl shadow-2xl flex items-center gap-3 transition-all ${
          isLight ? 'bg-white border-emerald-500 text-slate-900 shadow-slate-300/50' : 'bg-slate-900 border-emerald-500 text-white shadow-black/80'
        }`}>
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0 animate-ping" />
          <span className="text-xs font-mono font-bold">{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="ml-2 text-slate-400 hover:text-slate-200 cursor-pointer text-xs p-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* One-Time Google Profile Customization Modal */}
      {showProfileSetupModal && authToken && (
        <GoogleProfileSetupModal
          serverUrl={SERVER_URL}
          authToken={authToken}
          currentUsername={authUser || 'user'}
          onComplete={(newToken, newUsername) => {
            setAuthToken(newToken);
            setAuthUser(newUsername);
            setShowProfileSetupModal(false);
            setToast({ message: `Profile updated! Welcome, ${newUsername}`, type: 'success' });
          }}
        />
      )}

      {/* Main Octal Accounts Style Rounded Header Block (Fixed Top) */}
      <header className={`fixed top-0 right-0 left-0 z-40 transition-all duration-300 ${
        isNavExpanded ? 'md:left-56' : 'md:left-16'
      } ${
        isLight
          ? 'bg-[#f8fafc] text-slate-900'
          : 'bg-black text-white'
      }`}>
        <div className={`mr-4 ml-4 md:ml-0.5 my-2 px-5 h-14 rounded-2xl border flex items-center justify-between gap-4 transition-all duration-300 ${
          isLight
            ? 'bg-white border-slate-200 shadow-md shadow-slate-200/50 text-slate-900'
            : 'bg-[#09090b] border-[#18181b] shadow-xl text-white'
        }`}>

          {/* Left: Brand Identity & Menu Toggle */}
          <div className="flex items-center gap-4 select-none">
            <div className="flex items-center gap-3 cursor-pointer group" onClick={() => setActiveTab('dashboard')}>

              {/* Desktop Menu Icon Button */}
              <button
                onClick={toggleNavPinned}
                title={isNavPinned ? "Unpin Navigation Sidebar (Collapse)" : "Pin Navigation Sidebar Open"}
                className={`hidden md:block p-1.5 rounded-lg transition-all cursor-pointer ${
                  isNavPinned
                    ? isLight ? 'text-amber-700 bg-amber-50 border border-amber-200' : 'text-amber-400 bg-slate-900 border border-amber-500/30'
                    : isLight ? 'text-slate-800 hover:bg-slate-100 border border-slate-200' : 'text-slate-200 hover:bg-slate-800 border border-slate-700'
                }`}
              >
                <Menu className="w-5 h-5 stroke-[2.5]" />
              </button>

              {/* Mobile Menu Icon Button */}
              <button
                onClick={(e) => { e.stopPropagation(); setIsMobileMenuOpen(!isMobileMenuOpen); }}
                title="Toggle Mobile Drawer"
                className={`block md:hidden p-1.5 rounded-lg transition-all cursor-pointer ${
                  isMobileMenuOpen
                    ? isLight ? 'text-amber-700 bg-amber-50 border border-amber-200' : 'text-amber-400 bg-slate-900 border border-amber-500/30'
                    : isLight ? 'text-slate-800 hover:bg-slate-100 border border-slate-200' : 'text-slate-200 hover:bg-slate-800 border border-slate-700'
                }`}
              >
                <Menu className="w-5 h-5 stroke-[2.5]" />
              </button>

              {/* Octal Dialer Premium Gradient Logo Typography */}
              <div className="flex items-center gap-1.5 font-display tracking-tight text-xl font-black select-none">
                <span className={isLight ? 'text-slate-900' : 'text-white'}>
                  OCTAL
                </span>
                <span className="bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 dark:from-amber-400 dark:via-amber-500 dark:to-amber-600 bg-clip-text text-transparent font-black">
                  DIALER
                </span>
              </div>
            </div>

            <div className="hidden md:flex items-center gap-2 pl-4 border-l border-slate-300 dark:border-slate-700/40 text-xs font-mono">
              <span className="text-slate-500 font-bold uppercase text-[10px] tracking-wider">WORKSPACE</span>
              <span className="text-slate-400">/</span>
              <span className="text-amber-600 dark:text-amber-400 font-black capitalize">{activeTab.replace('-', ' ')}</span>
            </div>
          </div>

          {/* Right: Octal Accounts Style Action Bar */}
          <div className="flex items-center gap-3 select-none">

            {/* Phone Status Pill */}
            <button
              onClick={() => setActiveTab('pair')}
              title="Click to manage Bluetooth Phone Link connection"
              className={`hidden sm:flex items-center gap-2 px-3 py-1 rounded-full border transition-all cursor-pointer font-extrabold text-[11px] ${
                socketData.phoneConnected
                  ? isLight
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900 shadow-sm'
                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : isLight
                    ? 'bg-red-50 border-red-200 text-red-800 shadow-sm'
                    : 'bg-red-500/10 border-red-500/30 text-red-400'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${socketData.phoneConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
              <span>{socketData.phoneConnected ? `Phone Connected` : 'Phone Offline'}</span>
            </button>

            {/* User Dropdown Pill (mohsin octal style) */}
            <div className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs font-bold ${
              isLight ? 'bg-slate-100 border-slate-300 text-slate-900 shadow-sm' : 'bg-slate-900 border-slate-800 text-slate-200'
            }`}>
              <span className="capitalize">{authUser || 'mohsin octal'}</span>
              <span className="text-slate-500 text-[10px] font-black">∨</span>
            </div>

            {/* Quick Upload Action */}
            <button
              onClick={() => setActiveTab('upload')}
              title="Upload Lead Sheet"
              className={`w-8 h-8 rounded-full flex items-center justify-center border transition-all cursor-pointer shadow-sm ${
                isLight
                  ? 'bg-slate-100 border-slate-300 text-slate-800 hover:bg-slate-200'
                  : 'bg-slate-900 border-slate-800 text-white hover:bg-slate-800'
              }`}
            >
              <Upload className="w-4 h-4" />
            </button>

            {/* 🎤 Voice Search / Mic */}
            <button
              onClick={() => setActiveTab('dialer')}
              title="Voice Search / Assistant"
              className={`w-8 h-8 rounded-full flex items-center justify-center border text-xs transition-all cursor-pointer shadow-sm ${
                isLight
                  ? 'bg-slate-100 border-slate-300 text-slate-800 hover:bg-slate-200'
                  : 'bg-slate-900 border-slate-800 text-white hover:bg-slate-800'
              }`}
            >
              🎤
            </button>

            {/* 🔍 Display Density / Scale Switcher */}
            <button
              onClick={cycleUiZoom}
              title={`Display Scale: ${uiZoom} (Click to toggle 100% ➔ 90% ➔ 85% ➔ 80% for Laptops)`}
              className={`h-8 px-2 rounded-full border text-[11px] font-mono font-bold flex items-center gap-1 transition-all cursor-pointer shadow-sm ${
                isLight
                  ? 'bg-slate-100 border-slate-300 text-slate-800 hover:bg-slate-200'
                  : 'bg-slate-900 border-slate-800 text-amber-400 hover:text-white'
              }`}
            >
              <span className="text-[10px]">🔍</span>
              <span>{uiZoom}</span>
            </button>

            {/* ⚙️ Settings / Theme Toggle Circle */}
            <button
              onClick={toggleTheme}
              className={`w-8 h-8 rounded-full flex items-center justify-center border transition-all cursor-pointer shadow-sm ${
                isLight
                  ? 'bg-slate-100 border-slate-300 text-slate-800 hover:bg-slate-200 font-bold'
                  : 'bg-slate-900 border-slate-800 text-amber-400 hover:text-white'
              }`}
              title={isLight ? 'Switch to Dark Mode' : 'Switch to Bright Mode'}
            >
              {isLight ? <Moon className="w-4 h-4 text-slate-800" /> : <Sun className="w-4 h-4 text-amber-400" />}
            </button>

            {/* 👤 User Profile Avatar Circle with green online status dot */}
            <div className="relative cursor-pointer" title={`Logged in as ${authUser}`}>
              <div className={`w-8 h-8 rounded-full font-bold text-xs flex items-center justify-center border ${
                isLight ? 'bg-slate-100 text-slate-900 border-slate-300' : 'bg-slate-900 text-amber-400 border-slate-800'
              }`}>
                👤
              </div>
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[#00A651] border-2 border-white dark:border-slate-800" />
            </div>

            {/* Download APK Link for Mobile */}
            <a
              href="/download/apk"
              title="Download Android Dialer APK"
              className={`p-1.5 rounded-lg transition-all flex items-center justify-center cursor-pointer ${
                isLight
                  ? 'text-emerald-700 hover:text-emerald-950 hover:bg-emerald-50'
                  : 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/30'
              }`}
            >
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M17.5 12.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5m-11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5m10.3-4.72l1.9-3.29a.498.498 0 00-.18-.68.498.498 0 00-.68.18l-1.92 3.32C14.73 6.47 13.41 6 12 6s-2.73.47-3.92 1.31L6.16 3.99a.498.498 0 00-.68-.18.498.498 0 00-.18.68l1.9 3.29C4.54 9.17 3 11.9 3 15h18c0-3.1-1.54-5.83-4.2-7.22z"/>
              </svg>
            </a>

            {/* Logout */}
            <button
              id="btn-logout"
              onClick={handleLogout}
              title="Sign out"
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                isLight
                  ? 'text-slate-700 hover:text-red-700 hover:bg-red-50'
                  : 'text-slate-400 hover:text-red-400 hover:bg-red-950/30'
              }`}
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container Layout */}
      <div className="w-full min-h-screen flex flex-col pt-20">

        {/* Backdrop overlay for mobile drawer */}
        {isMobileMenuOpen && (
          <div
            className="fixed inset-0 z-45 bg-black/60 backdrop-blur-sm md:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}

        {/* Octal Accounts Style Fixed Left Icon Rail (Starts from Upper Edge top-0) */}
        <nav
          onMouseEnter={() => setIsNavHovered(true)}
          onMouseLeave={() => setIsNavHovered(false)}
          className={`fixed top-0 bottom-0 z-50 transition-all duration-300 ease-in-out border-r shadow-2xl flex flex-col justify-between select-none ${
            isNavExpanded
              ? 'w-56 p-3 left-0'
              : 'w-16 p-2.5 items-center -left-16 md:left-0'
          } ${
            isMobileMenuOpen ? 'left-0 w-56 p-3' : ''
          } ${
            isLight ? 'bg-white border-slate-200 text-slate-900 shadow-slate-300/50' : 'bg-[#09090b] border-[#18181b] text-white shadow-2xl'
          }`}
        >
          {/* Main Top Actions & Navigation */}
          <div className="w-full flex-1 min-h-0 flex flex-col pt-1">

            {/* Core Fixed Workspaces */}
            <div className="space-y-1.5 w-full shrink-0 pb-2 border-b border-slate-200 dark:border-slate-800/80">
              {/* Dashboard Link */}
              <button
                onClick={() => setActiveTab('dashboard')}
                title="Dashboard"
                className={`w-full flex items-center ${isNavExpanded ? 'gap-2 pl-2.5 pr-2 py-1.5 justify-start text-xs font-semibold' : 'justify-center py-2'} rounded-lg transition-all duration-300 cursor-pointer ${
                  activeTab === 'dashboard'
                    ? isLight
                      ? 'bg-amber-500/15 text-amber-950 font-bold border-l-3 border-amber-500 shadow-sm'
                      : 'bg-amber-500/15 text-amber-400 font-bold border-l-3 border-amber-500 shadow-sm'
                    : isLight
                      ? 'text-slate-800 hover:text-amber-600 hover:bg-amber-500/5 hover:translate-x-0.5 shadow-sm'
                      : 'text-slate-200 hover:text-amber-400 hover:bg-amber-500/10 hover:translate-x-0.5 shadow-sm'
                }`}
              >
                <LayoutDashboard className={`w-4 h-4 shrink-0 ${activeTab === 'dashboard' ? (isLight ? 'text-amber-700' : 'text-amber-400') : 'text-slate-400'}`} />
                {isNavExpanded && <span className="truncate">Dashboard</span>}
              </button>

              {/* CRM Workspace (Gated by CRM permission or Admin) */}
              {(userRole === 'platform_admin' || userRole === 'admin' || userPermissions.crm) && (
                <button
                  onClick={() => setActiveTab('crm')}
                  title="CRM & Customer Intelligence"
                  className={`w-full flex items-center ${isNavExpanded ? 'gap-2 pl-2.5 pr-2 py-1.5 justify-start text-xs font-semibold' : 'justify-center py-2'} rounded-lg transition-all duration-300 cursor-pointer ${
                    activeTab === 'crm' || activeTab === 'follow-ups'
                      ? isLight
                        ? 'bg-amber-500/15 text-amber-950 font-bold border-l-3 border-amber-500 shadow-sm'
                        : 'bg-amber-500/15 text-amber-400 font-bold border-l-3 border-amber-500 shadow-sm'
                      : isLight
                        ? 'text-slate-800 hover:text-amber-600 hover:bg-amber-500/5 hover:translate-x-0.5 shadow-sm'
                        : 'text-slate-200 hover:text-amber-400 hover:bg-amber-500/10 hover:translate-x-0.5 shadow-sm'
                  }`}
                >
                  <Users className={`w-4 h-4 shrink-0 ${activeTab === 'crm' || activeTab === 'follow-ups' ? (isLight ? 'text-amber-700' : 'text-amber-400') : 'text-slate-400'}`} />
                  {isNavExpanded && <span className="truncate">CRM Workspace</span>}
                </button>
              )}

              {/* Campaigns Workspace (Gated by Campaigns permission or Admin) */}
              {(userRole === 'platform_admin' || userRole === 'admin' || userPermissions.campaigns) && (
                <button
                  onClick={() => setActiveTab('campaigns')}
                  title="Campaigns Workspace"
                  className={`w-full flex items-center ${isNavExpanded ? 'gap-2 pl-2.5 pr-2 py-1.5 justify-start text-xs font-semibold' : 'justify-center py-2'} rounded-lg transition-all duration-300 cursor-pointer ${
                    activeTab === 'campaigns'
                      ? isLight
                        ? 'bg-amber-500/15 text-amber-950 font-bold border-l-3 border-amber-500 shadow-sm'
                        : 'bg-amber-500/15 text-amber-400 font-bold border-l-3 border-amber-500 shadow-sm'
                      : isLight
                        ? 'text-slate-800 hover:text-amber-600 hover:bg-amber-500/5 hover:translate-x-0.5 shadow-sm'
                        : 'text-slate-200 hover:text-amber-400 hover:bg-amber-500/10 hover:translate-x-0.5 shadow-sm'
                  }`}
                >
                  <Layers className={`w-4 h-4 shrink-0 ${activeTab === 'campaigns' ? (isLight ? 'text-amber-700' : 'text-amber-400') : 'text-slate-400'}`} />
                  {isNavExpanded && <span className="truncate">Campaigns</span>}
                </button>
              )}

              {/* Leads Database (Gated by Leads permission or Admin) */}
              {(userRole === 'platform_admin' || userRole === 'admin' || userPermissions.leads) && (
                <button
                  onClick={() => setActiveTab('leads')}
                  className={`w-full flex items-center ${isNavExpanded ? 'gap-2 pl-2.5 pr-2 py-1.5 justify-start text-xs font-semibold' : 'justify-center py-2'} rounded-lg transition-all duration-300 cursor-pointer ${
                    activeTab === 'leads'
                      ? isLight
                        ? 'bg-blue-500/15 text-blue-950 font-bold border-l-3 border-blue-500 shadow-sm'
                        : 'bg-blue-500/15 text-blue-400 font-bold border-l-3 border-blue-500 shadow-sm'
                      : isLight
                        ? 'text-slate-800 hover:text-blue-600 hover:bg-blue-500/5 hover:translate-x-0.5 shadow-sm'
                        : 'text-slate-200 hover:text-blue-400 hover:bg-blue-500/10 hover:translate-x-0.5 shadow-sm'
                  }`}
                >
                  <Database className={`w-4 h-4 shrink-0 ${activeTab === 'leads' ? (isLight ? 'text-blue-700' : 'text-blue-400') : 'text-slate-400'}`} />
                  {isNavExpanded && <span className="truncate">Leads Database</span>}
                </button>
              )}

              {/* Administration — Available to Platform Admin & Tenant Admin for COMPANY accounts */}
              {(userRole === 'platform_admin' || userRole === 'admin') && customerType !== 'PERSONAL' && (
                <button
                  onClick={() => setActiveTab('admin')}
                  className={`w-full flex items-center ${isNavExpanded ? 'gap-2 pl-2.5 pr-2 py-1.5 justify-start text-xs font-semibold' : 'justify-center py-2'} rounded-lg transition-all duration-300 cursor-pointer ${
                    activeTab === 'admin'
                      ? isLight
                        ? 'bg-purple-500/15 text-purple-950 font-bold border-l-3 border-purple-500 shadow-sm'
                        : 'bg-purple-500/15 text-purple-400 font-bold border-l-3 border-purple-500 shadow-sm'
                      : isLight
                        ? 'text-slate-800 hover:text-purple-600 hover:bg-purple-500/5 hover:translate-x-0.5 shadow-sm'
                        : 'text-slate-200 hover:text-purple-400 hover:bg-purple-500/10 hover:translate-x-0.5 shadow-sm'
                  }`}
                >
                  <Shield className={`w-4 h-4 shrink-0 ${activeTab === 'admin' ? (isLight ? 'text-purple-700' : 'text-purple-400') : 'text-slate-400'}`} />
                  {isNavExpanded && <span className="truncate">{userRole === 'platform_admin' ? 'Platform Admin' : 'Administration'}</span>}
                </button>
              )}

              {/* Billing & Subscription — STRICTLY MASTER ADMIN ONLY */}
              {userRole === 'platform_admin' && (
                <button
                  onClick={() => setActiveTab('billing')}
                  className={`w-full flex items-center ${isNavExpanded ? 'gap-2 pl-2.5 pr-2 py-1.5 justify-start text-xs font-semibold' : 'justify-center py-2'} rounded-lg transition-all duration-300 cursor-pointer ${
                    activeTab === 'billing'
                      ? isLight
                        ? 'bg-emerald-500/15 text-emerald-950 font-bold border-l-3 border-emerald-500 shadow-sm'
                        : 'bg-emerald-500/15 text-emerald-400 font-bold border-l-3 border-emerald-500 shadow-sm'
                      : isLight
                        ? 'text-slate-800 hover:text-emerald-600 hover:bg-emerald-500/5 hover:translate-x-0.5 shadow-sm'
                        : 'text-slate-200 hover:text-emerald-400 hover:bg-emerald-500/10 hover:translate-x-0.5 shadow-sm'
                  }`}
                >
                  <CreditCard className={`w-4 h-4 shrink-0 ${activeTab === 'billing' ? (isLight ? 'text-emerald-700' : 'text-emerald-400') : 'text-slate-400'}`} />
                  {isNavExpanded && <span className="truncate">Billing & Plans</span>}
                </button>
              )}

              {/* Team Workspace — Gated by Team Lead / Admin / Platform Admin in Company workspace */}
              {(userRole === 'platform_admin' || userRole === 'admin' || userRole === 'team_lead') && customerType !== 'PERSONAL' && (
                <button
                  onClick={() => setActiveTab('team-lead')}
                  title="Team Workspace"
                  className={`w-full flex items-center ${isNavExpanded ? 'gap-2 pl-2.5 pr-2 py-1.5 justify-start text-xs font-semibold' : 'justify-center py-2'} rounded-lg transition-all duration-300 cursor-pointer ${
                    activeTab === 'team-lead'
                      ? isLight
                        ? 'bg-amber-500/15 text-amber-950 font-bold border-l-3 border-amber-500 shadow-sm'
                        : 'bg-amber-500/15 text-amber-400 font-bold border-l-3 border-amber-500 shadow-sm'
                      : isLight
                        ? 'text-slate-800 hover:text-amber-600 hover:bg-amber-500/5 hover:translate-x-0.5 shadow-sm'
                        : 'text-slate-200 hover:text-amber-400 hover:bg-amber-500/10 hover:translate-x-0.5 shadow-sm'
                  }`}
                >
                  <Target className={`w-4 h-4 shrink-0 ${activeTab === 'team-lead' ? (isLight ? 'text-amber-700' : 'text-amber-400') : 'text-slate-400'}`} />
                  {isNavExpanded && <span className="truncate">Team Workspace</span>}
                </button>
              )}

              {/* Platform Console — STRICTLY PLATFORM ADMIN ONLY */}
              {userRole === 'platform_admin' && (
                <button
                  onClick={() => setActiveTab('super-admin')}
                  title="Platform Console"
                  className={`w-full flex items-center ${isNavExpanded ? 'gap-2 pl-2.5 pr-2 py-1.5 justify-start text-xs font-semibold' : 'justify-center py-2'} rounded-lg transition-all duration-300 cursor-pointer ${
                    activeTab === 'super-admin'
                      ? isLight
                        ? 'bg-indigo-500/15 text-indigo-950 font-bold border-l-3 border-indigo-500 shadow-sm'
                        : 'bg-indigo-500/15 text-indigo-400 font-bold border-l-3 border-indigo-500 shadow-sm'
                      : isLight
                        ? 'text-slate-800 hover:text-indigo-600 hover:bg-indigo-500/5 hover:translate-x-0.5 shadow-sm'
                        : 'text-slate-200 hover:text-indigo-400 hover:bg-indigo-500/10 hover:translate-x-0.5 shadow-sm'
                  }`}
                >
                  <Building2 className={`w-4 h-4 shrink-0 ${activeTab === 'super-admin' ? (isLight ? 'text-indigo-700' : 'text-indigo-400') : 'text-slate-400'}`} />
                  {isNavExpanded && <span className="truncate">Platform Console</span>}
                </button>
              )}

              {/* Reports & Analytics (Gated by Reports permission or Admin) */}
              {(userRole === 'platform_admin' || userRole === 'admin' || userPermissions.reports) && (
                <button
                  onClick={() => setActiveTab('reports')}
                  title="Reports & Analytics"
                  className={`w-full flex items-center ${isNavExpanded ? 'gap-2 pl-2.5 pr-2 py-1.5 justify-start text-xs font-semibold' : 'justify-center py-2'} rounded-lg transition-all duration-300 cursor-pointer ${
                    activeTab === 'reports'
                      ? isLight
                        ? 'bg-amber-500/15 text-amber-950 font-bold border-l-3 border-amber-500 shadow-sm'
                        : 'bg-amber-500/15 text-amber-400 font-bold border-l-3 border-amber-500 shadow-sm'
                      : isLight
                        ? 'text-slate-800 hover:text-amber-600 hover:bg-amber-500/5 hover:translate-x-0.5 shadow-sm'
                        : 'text-slate-200 hover:text-amber-400 hover:bg-amber-500/10 hover:translate-x-0.5 shadow-sm'
                  }`}
                >
                  <TrendingUp className={`w-4 h-4 shrink-0 ${activeTab === 'reports' ? (isLight ? 'text-amber-700' : 'text-amber-400') : 'text-slate-400'}`} />
                  {isNavExpanded && <span className="truncate">Reports & Analytics</span>}
                </button>
              )}
            </div>

            {/* Accordion Categorized Navigation (Sliding with hidden slider) */}
            {isNavExpanded ? (
              <div className="space-y-3 text-left overflow-y-auto flex-1 min-h-0 pr-1 pt-2 no-scrollbar">

                {/* OCTAL Dialer Group */}
                {(userRole === 'platform_admin' || userRole === 'admin' || userPermissions.octalDialer) && (
                <div className="space-y-1">
                  <button
                    onClick={(e) => toggleAccordion('octalDialer', e)}
                    className={`w-full flex items-center justify-between pl-2.5 pr-2 py-1.5 rounded-lg transition-all duration-300 cursor-pointer select-none ${
                      openAccordion.octalDialer
                        ? isLight
                          ? 'bg-amber-500/10 text-amber-900 border border-amber-500/30 shadow-sm'
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-sm'
                        : isLight
                          ? 'text-slate-800 hover:text-amber-600 hover:bg-amber-500/5 hover:translate-x-0.5 shadow-sm'
                          : 'text-slate-200 hover:text-amber-400 hover:bg-amber-500/10 hover:translate-x-0.5 shadow-sm'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <PhoneCall className={`w-4 h-4 shrink-0 ${openAccordion.octalDialer ? 'text-amber-500' : (isLight ? 'text-slate-700' : 'text-slate-300')}`} />
                      <div className="flex items-center gap-0.5 font-sans tracking-tight text-xs font-extrabold select-none">
                        <span className={openAccordion.octalDialer ? 'text-amber-500' : (isLight ? 'text-slate-800' : 'text-white')}>
                          OCTAL
                        </span>
                        <span className="bg-gradient-to-r from-amber-500 to-amber-600 dark:from-amber-400 dark:to-amber-500 bg-clip-text text-transparent font-black">
                          DIALER
                        </span>
                      </div>
                    </div>
                    <span className={`font-bold text-[10px] ${openAccordion.octalDialer ? 'text-amber-500' : (isLight ? 'text-slate-500' : 'text-slate-400')}`}>
                      {openAccordion.octalDialer ? '−' : '+'}
                    </span>
                  </button>
                  <div className={`grid transition-all duration-300 ease-in-out ${
                    openAccordion.octalDialer ? 'grid-rows-[1fr] opacity-100 mt-1' : 'grid-rows-[0fr] opacity-0'
                  }`}>
                    <div className="overflow-hidden">
                      <div className="pl-2 space-y-1 border-l border-slate-300 dark:border-slate-800 ml-3 pt-1 pb-1.5">
                        {[
                          { id: 'dialer', label: 'Auto Dialer', icon: PlaySquare },
                          { id: 'pair', label: 'Connect to Phone', icon: Bluetooth },
                          { id: 'upload', label: 'Upload Sheet', icon: Upload },
                          { id: 'dnc', label: 'DNC Suppression', icon: ShieldAlert },
                          { id: 'history', label: 'Call Logs', icon: History },
                        ].map((item, idx) => {
                          const Icon = item.icon;
                          const active = activeTab === item.id;
                          return (
                            <button
                              key={item.label + idx}
                              onClick={() => setActiveTab(item.id as any)}
                              className={`w-full flex items-center gap-2 pl-2 pr-1.5 py-1.5 rounded-md text-xs font-sans font-medium transition-all duration-300 cursor-pointer ${
                                active
                                  ? isLight
                                    ? 'bg-amber-500/15 text-amber-950 font-bold border-l-3 border-amber-500'
                                    : 'bg-amber-500/15 text-amber-400 font-bold border-l-3 border-amber-500'
                                  : isLight
                                    ? 'text-slate-700 hover:text-amber-600 hover:bg-amber-500/5 hover:translate-x-0.5'
                                    : 'text-slate-300 hover:text-amber-400 hover:bg-amber-500/10 hover:translate-x-0.5'
                              }`}
                            >
                              <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-amber-500' : 'text-slate-400'}`} />
                              <span className="truncate">{item.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
                )}

                {/* Google Scraper Group */}
                {(userRole === 'platform_admin' || userRole === 'admin' || userPermissions.googleScraper) && (
                <div className="space-y-1">
                  <button
                    onClick={(e) => toggleAccordion('googleScraper', e)}
                    className={`w-full flex items-center justify-between pl-2.5 pr-2 py-1.5 rounded-lg transition-all duration-300 cursor-pointer select-none ${
                      openAccordion.googleScraper
                        ? isLight
                          ? 'bg-amber-500/10 text-amber-900 border border-amber-500/30 shadow-sm'
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-sm'
                        : isLight
                          ? 'text-slate-800 hover:text-amber-600 hover:bg-amber-500/5 hover:translate-x-0.5 shadow-sm'
                          : 'text-slate-200 hover:text-amber-400 hover:bg-amber-500/10 hover:translate-x-0.5 shadow-sm'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Database className={`w-4 h-4 shrink-0 ${openAccordion.googleScraper ? 'text-amber-500' : (isLight ? 'text-slate-700' : 'text-slate-300')}`} />
                      <div className="flex items-center gap-0.5 font-sans tracking-tight text-xs font-extrabold select-none">
                        <span className={openAccordion.googleScraper ? 'text-amber-500' : (isLight ? 'text-slate-800' : 'text-white')}>
                          GOOGLE
                        </span>
                        <span className="bg-gradient-to-r from-amber-500 to-amber-600 dark:from-amber-400 dark:to-amber-500 bg-clip-text text-transparent font-black">
                          SCRAPER
                        </span>
                      </div>
                    </div>
                    <span className={`font-bold text-[10px] ${openAccordion.googleScraper ? 'text-amber-500' : (isLight ? 'text-slate-500' : 'text-slate-400')}`}>
                      {openAccordion.googleScraper ? '−' : '+'}
                    </span>
                  </button>
                  <div className={`grid transition-all duration-300 ease-in-out ${
                    openAccordion.googleScraper ? 'grid-rows-[1fr] opacity-100 mt-1' : 'grid-rows-[0fr] opacity-0'
                  }`}>
                    <div className="overflow-hidden">
                      <div className="pl-2 space-y-1 border-l border-slate-300 dark:border-slate-800 ml-3 pt-1 pb-1.5">
                        {[
                          { id: 'scraper', label: 'Run Scraper', icon: Play },
                          { id: 'scraper-import', label: 'File Manager', icon: Database },
                          { id: 'scraper-settings', label: 'Settings', icon: Settings },
                        ].map((item, idx) => {
                          const Icon = item.icon;
                          const active = activeTab === item.id;
                          return (
                            <button
                              key={item.label + idx}
                              onClick={() => setActiveTab(item.id as any)}
                              className={`w-full flex items-center gap-2 pl-2 pr-1.5 py-1.5 rounded-md text-xs font-sans font-medium transition-all duration-300 cursor-pointer ${
                                active
                                  ? isLight
                                    ? 'bg-amber-500/15 text-amber-950 font-bold border-l-3 border-amber-500'
                                    : 'bg-amber-500/15 text-amber-400 font-bold border-l-3 border-amber-500'
                                  : isLight
                                    ? 'text-slate-700 hover:text-amber-600 hover:bg-amber-500/5 hover:translate-x-0.5'
                                    : 'text-slate-300 hover:text-amber-400 hover:bg-amber-500/10 hover:translate-x-0.5'
                              }`}
                            >
                              <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-amber-500' : 'text-slate-400'}`} />
                              <span className="truncate">{item.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
                )}

                {/* Auto Emailer Group */}
                {(userRole === 'platform_admin' || userRole === 'admin' || userPermissions.autoEmailer) && (
                <div className="space-y-1">
                  <button
                    onClick={(e) => toggleAccordion('autoEmailer', e)}
                    className={`w-full flex items-center justify-between pl-2.5 pr-2 py-1.5 rounded-lg transition-all duration-300 cursor-pointer select-none ${
                      openAccordion.autoEmailer
                        ? isLight
                          ? 'bg-amber-500/10 text-amber-900 border border-amber-500/30 shadow-sm'
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-sm'
                        : isLight
                          ? 'text-slate-800 hover:text-amber-600 hover:bg-amber-500/5 hover:translate-x-0.5 shadow-sm'
                          : 'text-slate-200 hover:text-amber-400 hover:bg-amber-500/10 hover:translate-x-0.5 shadow-sm'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Mail className={`w-4 h-4 shrink-0 ${openAccordion.autoEmailer ? 'text-amber-500' : (isLight ? 'text-slate-700' : 'text-slate-300')}`} />
                      <div className="flex items-center gap-0.5 font-sans tracking-tight text-xs font-extrabold select-none">
                        <span className={openAccordion.autoEmailer ? 'text-amber-500' : (isLight ? 'text-slate-800' : 'text-white')}>
                          AUTO
                        </span>
                        <span className="bg-gradient-to-r from-amber-500 to-amber-600 dark:from-amber-400 dark:to-amber-500 bg-clip-text text-transparent font-black">
                          EMAILER
                        </span>
                      </div>
                    </div>
                    <span className={`font-bold text-[10px] ${openAccordion.autoEmailer ? 'text-amber-500' : (isLight ? 'text-slate-500' : 'text-slate-400')}`}>
                      {openAccordion.autoEmailer ? '−' : '+'}
                    </span>
                  </button>
                  <div className={`grid transition-all duration-300 ease-in-out ${
                    openAccordion.autoEmailer ? 'grid-rows-[1fr] opacity-100 mt-1' : 'grid-rows-[0fr] opacity-0'
                  }`}>
                    <div className="overflow-hidden">
                      <div className="pl-2 space-y-1 border-l border-slate-300 dark:border-slate-800 ml-3 pt-1 pb-1.5">
                        {[
                          { id: 'emailer-gmail', label: 'Email Accounts', icon: Mail },
                          { id: 'emailer-campaign', label: 'Campaign Manager', icon: Play },
                          { id: 'emailer-templates', label: 'Templates', icon: FileText },
                          { id: 'emailer-leads', label: 'Lead Management', icon: Users },
                        ].map((item, idx) => {
                          const Icon = item.icon;
                          const active = activeTab === item.id;
                          return (
                            <button
                              key={item.label + idx}
                              onClick={() => setActiveTab(item.id as any)}
                              className={`w-full flex items-center gap-2 pl-2 pr-1.5 py-1.5 rounded-md text-xs font-sans font-medium transition-all duration-300 cursor-pointer ${
                                active
                                  ? isLight
                                    ? 'bg-amber-500/15 text-amber-950 font-bold border-l-3 border-amber-500'
                                    : 'bg-amber-500/15 text-amber-400 font-bold border-l-3 border-amber-500'
                                  : isLight
                                    ? 'text-slate-700 hover:text-amber-600 hover:bg-amber-500/5 hover:translate-x-0.5'
                                    : 'text-slate-300 hover:text-amber-400 hover:bg-amber-500/10 hover:translate-x-0.5'
                              }`}
                            >
                              <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-amber-500' : 'text-slate-400'}`} />
                              <span className="truncate">{item.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
                )}

                {/* Facebook Scraper Group */}
                {(userRole === 'platform_admin' || userRole === 'admin' || userPermissions.facebookScraper) && (
                <div className="space-y-1">
                  <button
                    onClick={(e) => toggleAccordion('facebookScraper', e)}
                    className={`w-full flex items-center justify-between pl-2.5 pr-2 py-1.5 rounded-lg transition-all duration-300 cursor-pointer select-none ${
                      openAccordion.facebookScraper
                        ? isLight
                          ? 'bg-amber-500/10 text-amber-900 border border-amber-500/30 shadow-sm'
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-sm'
                        : isLight
                          ? 'text-slate-800 hover:text-amber-600 hover:bg-amber-500/5 hover:translate-x-0.5 shadow-sm'
                          : 'text-slate-200 hover:text-amber-400 hover:bg-amber-500/10 hover:translate-x-0.5 shadow-sm'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Facebook className={`w-4 h-4 shrink-0 ${openAccordion.facebookScraper ? 'text-amber-500' : (isLight ? 'text-slate-700' : 'text-slate-300')}`} />
                      <div className="flex items-center gap-0.5 font-sans tracking-tight text-xs font-extrabold select-none">
                        <span className={openAccordion.facebookScraper ? 'text-amber-500' : (isLight ? 'text-slate-800' : 'text-white')}>
                          FACEBOOK
                        </span>
                        <span className="bg-gradient-to-r from-amber-500 to-amber-600 dark:from-amber-400 dark:to-amber-500 bg-clip-text text-transparent font-black">
                          SCRAPER
                        </span>
                      </div>
                    </div>
                    <span className={`font-bold text-[10px] ${openAccordion.facebookScraper ? 'text-amber-500' : (isLight ? 'text-slate-500' : 'text-slate-400')}`}>
                      {openAccordion.facebookScraper ? '−' : '+'}
                    </span>
                  </button>
                  <div className={`grid transition-all duration-300 ease-in-out ${
                    openAccordion.facebookScraper ? 'grid-rows-[1fr] opacity-100 mt-1' : 'grid-rows-[0fr] opacity-0'
                  }`}>
                    <div className="overflow-hidden">
                      <div className="pl-2 space-y-1 border-l border-slate-300 dark:border-slate-800 ml-3 pt-1 pb-1.5">
                        {[
                          { id: 'fb-scraper', label: 'Run Scraper', icon: Play },
                          { id: 'fb-scraper-files', label: 'File Manager', icon: Database },
                        ].map((item, idx) => {
                          const Icon = item.icon;
                          const active = activeTab === item.id;
                          return (
                            <button
                              key={item.label + idx}
                              onClick={() => setActiveTab(item.id as any)}
                              className={`w-full flex items-center gap-2 pl-2 pr-1.5 py-1.5 rounded-md text-xs font-sans font-medium transition-all duration-300 cursor-pointer ${
                                active
                                  ? isLight
                                    ? 'bg-amber-500/15 text-amber-950 font-bold border-l-3 border-amber-500'
                                    : 'bg-amber-500/15 text-amber-400 font-bold border-l-3 border-amber-500'
                                  : isLight
                                    ? 'text-slate-700 hover:text-amber-600 hover:bg-amber-500/5 hover:translate-x-0.5'
                                    : 'text-slate-300 hover:text-amber-400 hover:bg-amber-500/10 hover:translate-x-0.5'
                              }`}
                            >
                              <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-amber-500' : 'text-slate-400'}`} />
                              <span className="truncate">{item.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
                )}

                {/* Facebook Poster Group */}
                {(userRole === 'platform_admin' || userRole === 'admin' || userPermissions.facebookPoster) && (
                <div className="space-y-1">
                  <button
                    onClick={(e) => toggleAccordion('facebookPoster', e)}
                    className={`w-full flex items-center justify-between pl-2.5 pr-2 py-1.5 rounded-lg transition-all duration-300 cursor-pointer select-none ${
                      openAccordion.facebookPoster
                        ? isLight
                          ? 'bg-amber-500/10 text-amber-900 border border-amber-500/30 shadow-sm'
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-sm'
                        : isLight
                          ? 'text-slate-800 hover:text-amber-600 hover:bg-amber-500/5 hover:translate-x-0.5 shadow-sm'
                          : 'text-slate-200 hover:text-amber-400 hover:bg-amber-500/10 hover:translate-x-0.5 shadow-sm'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Share2 className={`w-4 h-4 shrink-0 ${openAccordion.facebookPoster ? 'text-amber-500' : (isLight ? 'text-slate-700' : 'text-slate-300')}`} />
                      <div className="flex items-center gap-0.5 font-sans tracking-tight text-xs font-extrabold select-none">
                        <span className={openAccordion.facebookPoster ? 'text-amber-500' : (isLight ? 'text-slate-800' : 'text-white')}>
                          FB
                        </span>
                        <span className="bg-gradient-to-r from-amber-500 to-amber-600 dark:from-amber-400 dark:to-amber-500 bg-clip-text text-transparent font-black">
                          AUTOPOSTER
                        </span>
                      </div>
                    </div>
                    <span className={`font-bold text-[10px] ${openAccordion.facebookPoster ? 'text-amber-500' : (isLight ? 'text-slate-500' : 'text-slate-400')}`}>
                      {openAccordion.facebookPoster ? '−' : '+'}
                    </span>
                  </button>
                  <div className={`grid transition-all duration-300 ease-in-out ${
                    openAccordion.facebookPoster ? 'grid-rows-[1fr] opacity-100 mt-1' : 'grid-rows-[0fr] opacity-0'
                  }`}>
                    <div className="overflow-hidden">
                      <div className="pl-2 space-y-1 border-l border-slate-300 dark:border-slate-800 ml-3 pt-1 pb-1.5">
                        {[
                          { id: 'fb-poster-accounts', label: 'FB Accounts', icon: Users },
                          { id: 'fb-poster-campaigns', label: 'Campaign Manager', icon: Play },
                          { id: 'fb-poster-scheduler', label: 'Auto Poster', icon: Share2 },
                          { id: 'fb-poster-joiner', label: 'Auto Joiner', icon: Bot },
                          { id: 'fb-poster-logs', label: 'Activity Logs', icon: Terminal },
                        ].map((item, idx) => {
                          const Icon = item.icon;
                          const active = activeTab === item.id;
                          return (
                            <button
                              key={item.label + idx}
                              onClick={() => setActiveTab(item.id as any)}
                              className={`w-full flex items-center gap-2 pl-2 pr-1.5 py-1.5 rounded-md text-xs font-sans font-medium transition-all duration-300 cursor-pointer ${
                                active
                                  ? isLight
                                    ? 'bg-amber-500/15 text-amber-950 font-bold border-l-3 border-amber-500'
                                    : 'bg-amber-500/15 text-amber-400 font-bold border-l-3 border-amber-500'
                                  : isLight
                                    ? 'text-slate-700 hover:text-amber-600 hover:bg-amber-500/5 hover:translate-x-0.5'
                                    : 'text-slate-300 hover:text-amber-400 hover:bg-amber-500/10 hover:translate-x-0.5'
                              }`}
                            >
                              <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-amber-500' : 'text-slate-400'}`} />
                              <span className="truncate">{item.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
                )}
              </div>
            ) : (
              /* Collapsed Icon-Only Vertical Docked Rail */
              (userRole === 'platform_admin' || userRole === 'admin' || userPermissions.octalDialer) && (
                <div className="space-y-3 flex flex-col items-center pt-2">
                  {[
                    { id: 'dialer', label: 'Auto Dialer', icon: PlaySquare },
                    { id: 'pair', label: 'Connect to Phone', icon: Bluetooth },
                    { id: 'upload', label: 'Upload Sheet', icon: Upload },
                    { id: 'dnc', label: 'DNC Suppression', icon: ShieldAlert },
                    { id: 'history', label: 'Call Logs', icon: History },
                  ].map((item) => {
                    const Icon = item.icon;
                    const active = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setActiveTab(item.id as any)}
                        title={item.label}
                        className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                          active
                            ? isLight
                              ? 'bg-amber-500/20 text-amber-800 border-amber-500 shadow-sm'
                              : 'bg-amber-500/20 text-amber-400 border-amber-500/40 shadow-sm'
                            : isLight
                              ? 'text-slate-600 hover:bg-slate-100 border-transparent'
                              : 'text-slate-400 hover:text-white hover:bg-slate-800/60 border-transparent'
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                      </button>
                    );
                  })}
                </div>
              )
            )}
          </div>

          {/* Bottom Sidebar Card: User Profile & Hardware Status */}
          <div className={`pt-2.5 border-t w-full ${isLight ? 'border-slate-200' : 'border-slate-800/80'}`}>
            {isNavExpanded ? (
              <div className={`p-2 rounded-xl flex items-center justify-between text-left border ${
                isLight ? 'bg-slate-50 border-slate-200 shadow-sm' : 'bg-slate-950/60 border-slate-800'
              }`}>
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`w-6.5 h-6.5 rounded-lg font-bold text-xs flex items-center justify-center border shrink-0 ${
                    isLight ? 'bg-amber-500/15 text-amber-800 border-amber-300' : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                  }`}>
                    {authUser?.charAt(0).toUpperCase() || 'A'}
                  </div>
                  <div className="min-w-0">
                    <p className={`text-xs font-black truncate capitalize ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>{authUser}</p>
                    <p className="text-[9px] font-mono text-emerald-600 dark:text-emerald-400 font-bold">● Active</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex justify-center" title={`Active: ${authUser}`}>
                <div className={`w-8 h-8 rounded-xl font-bold text-xs flex items-center justify-center border ${
                  isLight ? 'bg-amber-500/15 text-amber-800 border-amber-300' : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                }`}>
                  {authUser?.charAt(0).toUpperCase() || 'A'}
                </div>
              </div>
            )}
          </div>
        </nav>

        {/* Tab Content Panel Container */}
        <main className={`flex-1 min-w-0 transition-all duration-300 p-3 sm:p-5 lg:p-6 ${isNavExpanded ? 'ml-0 md:ml-56' : 'ml-0 md:ml-16'}`}>
          {activeTab === 'dashboard' && (
            <DashboardOverview
              isLight={isLight}
              serverUrl={SERVER_URL}
              authToken={authToken || ''}
              authUser={authUser}
              phoneConnected={socketData.phoneConnected}
              phoneDeviceName={socketData.phoneDeviceName}
              campaigns={campaigns}
              onNavigateTab={(tab) => setActiveTab(tab)}
              onSelectCampaign={() => {}}
            />
          )}

          {activeTab === 'crm' && (
            (userRole === 'platform_admin' || userRole === 'admin' || userPermissions.crm) ? (
              <CRMWorkspacePage
                isLight={isLight}
                serverUrl={SERVER_URL}
                authToken={authToken || ''}
                campaigns={campaigns}
                onDialLead={(phone, leadId, leadName) => {
                  socketData.dialLead(phone, leadName, 30, leadId);
                  setActiveTab('dialer');
                }}
                onNavigateTab={(tab) => setActiveTab(tab as any)}
              />
            ) : (
              <div className={`p-8 border rounded-2xl text-center space-y-3 ${isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-950 border-slate-800 text-slate-300'}`}>
                <Users className="w-8 h-8 text-amber-500 mx-auto" />
                <h3 className="text-base font-bold font-display">CRM Module Access Required</h3>
                <p className="text-xs font-mono text-slate-500 max-w-md mx-auto">
                  Your account does not have permission to access the CRM & Customer Intelligence workspace. Please contact your organization administrator.
                </p>
              </div>
            )
          )}

          {activeTab === 'campaigns' && (
            (userRole === 'platform_admin' || userRole === 'admin' || userPermissions.campaigns) ? (
              <CampaignWorkspacePage
                isLight={isLight}
                serverUrl={SERVER_URL}
                authToken={authToken || ''}
                campaigns={campaigns}
                onSelectCampaignForDialer={() => {}}
                onNavigateTab={(tab) => setActiveTab(tab as any)}
              />
            ) : (
              <div className={`p-8 border rounded-2xl text-center space-y-3 ${isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-950 border-slate-800 text-slate-300'}`}>
                <Layers className="w-8 h-8 text-amber-500 mx-auto" />
                <h3 className="text-base font-bold font-display">Campaigns Module Access Required</h3>
                <p className="text-xs font-mono text-slate-500 max-w-md mx-auto">
                  Your account does not have permission to access Campaigns management. Please contact your organization administrator.
                </p>
              </div>
            )
          )}

          {activeTab === 'follow-ups' && (
            (userRole === 'platform_admin' || userRole === 'admin' || userPermissions.crm) ? (
              <CRMWorkspacePage
                isLight={isLight}
                serverUrl={SERVER_URL}
                authToken={authToken || ''}
                campaigns={campaigns}
                initialSubTab="follow-ups"
                onDialLead={(phone, leadId, leadName) => {
                  socketData.dialLead(phone, leadName, 30, leadId);
                  setActiveTab('dialer');
                }}
                onNavigateTab={(tab) => setActiveTab(tab as any)}
              />
            ) : (
              <div className={`p-8 border rounded-2xl text-center space-y-3 ${isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-950 border-slate-800 text-slate-300'}`}>
                <Users className="w-8 h-8 text-amber-500 mx-auto" />
                <h3 className="text-base font-bold font-display">CRM Module Access Required</h3>
                <p className="text-xs font-mono text-slate-500 max-w-md mx-auto">
                  Your account does not have permission to access Follow-ups and Callbacks. Please contact your organization administrator.
                </p>
              </div>
            )
          )}

          {activeTab === 'reports' && (
            (userRole === 'platform_admin' || userRole === 'admin' || userPermissions.reports) ? (
              <ReportsPage
                isLight={isLight}
                serverUrl={SERVER_URL}
                authToken={authToken}
                campaigns={campaigns}
              />
            ) : (
              <div className={`p-8 border rounded-2xl text-center space-y-3 ${isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-950 border-slate-800 text-slate-300'}`}>
                <TrendingUp className="w-8 h-8 text-amber-500 mx-auto" />
                <h3 className="text-base font-bold font-display">Reports & Analytics Access Restricted</h3>
                <p className="text-xs font-mono text-slate-500 max-w-md mx-auto">
                  Your account does not have permission to view reporting dashboards and call analytics.
                </p>
              </div>
            )
          )}

          {activeTab === 'admin' && (
            (userRole === 'admin' || userRole === 'platform_admin') ? (
              <AdminPanel
                isLight={isLight}
                serverUrl={lanServerUrl}
                authToken={authToken || ''}
                currentUser={authUser || ''}
                currentUserRole={userRole}
              />
            ) : (
              <div className={`p-8 border rounded-2xl text-center space-y-3 ${isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-950 border-slate-800 text-slate-300'}`}>
                <Shield className="w-8 h-8 text-amber-500 mx-auto" />
                <h3 className="text-base font-bold font-display">Administrator Access Required</h3>
                <p className="text-xs font-mono text-slate-500 max-w-md mx-auto">
                  You are currently logged in as an Employee. The Enterprise Control Center is restricted to Tenant Administrators and Master Admin authorities.
                </p>
              </div>
            )
          )}

          {activeTab === 'billing' && (
            userRole === 'platform_admin' ? (
              <BillingPage
                isLight={isLight}
                serverUrl={lanServerUrl}
                authToken={authToken || ''}
                userRole={userRole}
              />
            ) : (
              <div className={`p-8 border rounded-2xl text-center space-y-3 ${isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-950 border-slate-800 text-slate-300'}`}>
                <CreditCard className="w-8 h-8 text-emerald-500 mx-auto" />
                <h3 className="text-base font-bold font-display">Internal Plans & Platform Billing Restricted</h3>
                <p className="text-xs font-mono text-slate-500 max-w-md mx-auto">
                  Internal plan configuration and subscription control are strictly restricted to Master Admin authorities.
                </p>
              </div>
            )
          )}

          {activeTab === 'team-lead' && (
            (userRole === 'team_lead' || userRole === 'admin' || userRole === 'platform_admin') ? (
              <TeamLeadDashboard
                serverUrl={lanServerUrl}
                authToken={authToken}
                onSelectCampaign={(_cId) => setActiveTab('campaigns')}
              />
            ) : (
              <div className={`p-8 border rounded-2xl text-center space-y-3 ${isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-950 border-slate-800 text-slate-300'}`}>
                <Users className="w-8 h-8 text-amber-500 mx-auto" />
                <h3 className="text-base font-bold font-display">Team Workspace Access Restricted</h3>
                <p className="text-xs font-mono text-slate-500 max-w-md mx-auto">
                  Team workspace and supervisor controls are reserved for Team Leads, Company Administrators, and Platform Owners.
                </p>
              </div>
            )
          )}

          {activeTab === 'super-admin' && (
            userRole === 'platform_admin' ? (
              <SuperAdminPortal
                serverUrl={lanServerUrl}
                authToken={authToken || ''}
                currentUser={authUser}
                onLogout={handleLogout}
              />
            ) : (
              <div className={`p-8 border rounded-2xl text-center space-y-3 ${isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-950 border-slate-800 text-slate-300'}`}>
                <Shield className="w-8 h-8 text-purple-500 mx-auto" />
                <h3 className="text-base font-bold font-display">Platform Console Access Restricted</h3>
                <p className="text-xs font-mono text-slate-500 max-w-md mx-auto">
                  The Global Platform Console is strictly restricted to Platform Administrators.
                </p>
              </div>
            )
          )}

          {activeTab === 'leads' && (
            (userRole === 'platform_admin' || userRole === 'admin' || userPermissions.leads) ? (
              <LeadsTable
                isLight={isLight}
                serverUrl={lanServerUrl}
                authToken={authToken || ''}

              />
            ) : (
              <div className={`p-8 border rounded-2xl text-center space-y-3 ${isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-950 border-slate-800 text-slate-300'}`}>
                <Database className="w-8 h-8 text-blue-500 mx-auto" />
                <h3 className="text-base font-bold font-display">Leads Database Access Restricted</h3>
                <p className="text-xs font-mono text-slate-500 max-w-md mx-auto">
                  Your account does not have permission to browse or export the central leads database.
                </p>
              </div>
            )
          )}

          {/* Always mounted — hidden when not on dialer tab to preserve state */}
          <div className={activeTab !== 'dialer' ? 'hidden' : ''}>
          <LeadQueue
              isLight={isLight}
              phoneConnected={socketData.phoneConnected}
              isConnected={socketData.isConnected}
              campaigns={campaigns}
              serverUrl={SERVER_URL}
              authToken={authToken || ''}
              dialLead={socketData.dialLead}
              hangupCall={socketData.hangupCall}
              emergencyStop={socketData.emergencyStop}
              clearEmergencyStop={socketData.clearEmergencyStop}
              callState={socketData.callState}
              lastCallFinished={socketData.lastCallFinished}
              lastBlockedReason={socketData.lastBlockedReason}
              triggerDisposition={triggerDisposition}
              socket={socketData.socket}
              latencyMs={socketData.latencyMs}
              phoneDeviceName={socketData.phoneDeviceName}
              lastDispositionSaved={lastDispositionSaved}
              sessionId={socketData.sessionId}
              granularCallState={socketData.granularCallState}
              callSessionData={socketData.callSessionData}
              availableSims={socketData.availableSims}
              selectedSimSlot={socketData.selectedSimSlot}
              setSelectedSimSlot={socketData.setSelectedSimSlot}
            />
          </div>

          {activeTab === 'pair' && (
            <ConnectionPanel
              isLight={isLight}
              isConnected={socketData.isConnected}
              sessionId={socketData.sessionId}
              token={socketData.token}
              qrPayload={socketData.qrPayload}
              phoneConnected={socketData.phoneConnected}
              phoneDeviceName={socketData.phoneDeviceName}
              phoneBtAddress={socketData.phoneBtAddress}
              phoneOsType={socketData.phoneOsType}
              phoneIpAddress={socketData.phoneIpAddress}
              phoneDeviceId={socketData.phoneDeviceId}
              laptopBtAddress={socketData.laptopBtAddress}
              revokePhone={socketData.revokePhone}
              connectDevice={socketData.connectDevice}
              disconnectDevice={socketData.disconnectDevice}
              deviceError={socketData.deviceError}
              authToken={authToken || ''}
              socket={socketData.socket}
              serverUrl={socketData.qrPayload?.serverUrl || lanServerUrl || SERVER_URL}
            />
          )}

          {activeTab === 'dnc' && (
            <DncPanel
              isLight={isLight}
              serverUrl={SERVER_URL}
              authToken={authToken || ''}
            />
          )}

          {['scraper', 'scraper-import', 'scraper-settings'].includes(activeTab) && (
            (userRole === 'admin' || userRole === 'platform_admin' || userPermissions.googleScraper) ? (
              <ScraperFilesPanel
                isLight={isLight}
                onImportSuccess={handleImportSuccess}
                serverUrl={SERVER_URL}
                authToken={authToken || ''}
                activeSubTab={activeTab}
              />
            ) : (
              <div className={`p-8 border rounded-2xl text-center space-y-3 ${isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-950 border-slate-800 text-slate-300'}`}>
                <Database className="w-8 h-8 text-amber-500 mx-auto" />
                <h3 className="text-base font-bold font-display">Google Maps Scraper Restricted</h3>
                <p className="text-xs font-mono text-slate-500 max-w-md mx-auto">
                  Your user account does not currently have permissions enabled for the Google Scraper module. Contact your administrator to request access.
                </p>
              </div>
            )
          )}

          {activeTab === 'upload' && (
            <ImportPanel
              isLight={isLight}
              onImportSuccess={handleImportSuccess}
              serverUrl={SERVER_URL}
              authToken={authToken || ''}
              campaigns={campaigns}
            />
          )}

          {activeTab === 'history' && (
            <CallLog
              isLight={isLight}
              serverUrl={SERVER_URL}
              authToken={authToken}
            />
          )}

          {['emailer-gmail', 'emailer-campaign', 'emailer-templates', 'emailer-leads'].includes(activeTab) && (
            (userRole === 'admin' || userRole === 'platform_admin' || userPermissions.autoEmailer) ? (
              <AutoEmailer
                isLight={isLight}
                serverUrl={SERVER_URL}
                authToken={authToken || ''}
                activeSubTab={activeTab}
              />
            ) : (
              <div className={`p-8 border rounded-2xl text-center space-y-3 ${isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-950 border-slate-800 text-slate-300'}`}>
                <Mail className="w-8 h-8 text-amber-500 mx-auto" />
                <h3 className="text-base font-bold font-display">Auto Emailer Restricted</h3>
                <p className="text-xs font-mono text-slate-500 max-w-md mx-auto">
                  Your user account does not currently have permissions enabled for the Auto Emailer module. Contact your administrator to request access.
                </p>
              </div>
            )
          )}

          {['fb-scraper', 'fb-scraper-files'].includes(activeTab) && (
            (userRole === 'admin' || userRole === 'platform_admin' || userPermissions.facebookScraper) ? (
              <FacebookScraper
                isLight={isLight}
                serverUrl={SERVER_URL}
                authToken={authToken || ''}
                activeSubTab={activeTab}
              />
            ) : (
              <div className={`p-8 border rounded-2xl text-center space-y-3 ${isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-950 border-slate-800 text-slate-300'}`}>
                <Facebook className="w-8 h-8 text-blue-500 mx-auto" />
                <h3 className="text-base font-bold font-display">Facebook Scraper Restricted</h3>
                <p className="text-xs font-mono text-slate-500 max-w-md mx-auto">
                  Your user account does not currently have permissions enabled for the Facebook Scraper module. Contact your administrator to request access.
                </p>
              </div>
            )
          )}

          {['fb-poster-accounts', 'fb-poster-campaigns', 'fb-poster-scheduler', 'fb-poster-joiner', 'fb-poster-logs'].includes(activeTab) && (
            (userRole === 'admin' || userRole === 'platform_admin' || userPermissions.facebookPoster) ? (
              <FacebookAutoPoster
                isLight={isLight}
                serverUrl={SERVER_URL}
                authToken={authToken || ''}
                activeSubTab={activeTab}
              />
            ) : (
              <div className={`p-8 border rounded-2xl text-center space-y-3 ${isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-950 border-slate-800 text-slate-300'}`}>
                <Share2 className="w-8 h-8 text-blue-500 mx-auto" />
                <h3 className="text-base font-bold font-display">Facebook Auto-Poster Restricted</h3>
                <p className="text-xs font-mono text-slate-500 max-w-md mx-auto">
                  Your user account does not currently have permissions enabled for the Facebook Auto-Poster module. Contact your administrator to request access.
                </p>
              </div>
            )
          )}
        </main>
      </div>

      {/* Global Post-Call Disposition popup modal */}
      <DispositionModal
        isLight={isLight}
        isOpen={dispOpen}
        leadId={dispLeadId}
        leadName={dispLeadName}
        initialOutcome={dispInitialOutcome}
        onClose={() => setDispOpen(false)}
        serverUrl={SERVER_URL}
        authToken={authToken || ''}
        onSaveSuccess={(result) => {
          if (!result?.success) return;
          showToast('Call disposition logged successfully.', 'success');
          fetchCampaigns();
          if (result) {
            setLastDispositionSaved(result);
          }
        }}
      />
    </div>
  );
}
