import React, { useState, useEffect } from 'react';
import {
  PhoneCall, Database, Upload, History,
  Bluetooth, PlaySquare, Sun, Moon, ShieldAlert, LayoutDashboard, Menu, Mail,
  Play, Layers, Settings, Users, FileText, Search,
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
import { CompanySettings } from './components/settings/CompanySettings';
import { CustomerOnboardingModal } from './components/onboarding/CustomerOnboardingModal';
import { InvitationAcceptanceModal } from './components/onboarding/InvitationAcceptanceModal';
import { UserProfileMenu } from './components/UserProfileMenu';
import type { Campaign } from './types';
import {
  type StructuralRole,
  type AuthIdentity,
  tryNormalizeStructuralRole,
  getInitialIdentityHintFromToken
} from './utils/roleUtils';

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

const WEB_API_BASE = getBackendUrl();
const SERVER_URL = WEB_API_BASE;

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'crm' | 'campaigns' | 'follow-ups' | 'reports' | 'admin' | 'billing' | 'leads' | 'dialer' | 'pair' | 'upload' | 'dnc' | 'history' | 'scraper' | 'scraper-import' | 'scraper-settings' | 'emailer-gmail' | 'emailer-campaign' | 'emailer-templates' | 'emailer-leads' | 'fb-scraper' | 'fb-scraper-files' | 'fb-poster-accounts' | 'fb-poster-campaigns' | 'fb-poster-scheduler' | 'fb-poster-joiner' | 'fb-poster-logs' | 'team-lead' | 'super-admin'>('dashboard');
  const [settingsSubView, setSettingsSubView] = useState<'overview' | 'company-profile' | 'users-roles' | 'account' | 'billing'>('overview');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);
  const [mobilePairingBaseUrl, setMobilePairingBaseUrl] = useState<string>(WEB_API_BASE);
  const lanServerUrl = mobilePairingBaseUrl;

  // Auto-dismiss toast notification after 3 seconds
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      setToast(null);
    }, 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const isAdminRoute = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');

  const [authToken, setAuthToken] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const imp = sessionStorage.getItem('octal_impersonate_token');
      if (imp) return imp;
      const isAdmin = window.location.pathname.startsWith('/admin');
      if (isAdmin) {
        return localStorage.getItem('octal_platform_auth_token');
      }
      return localStorage.getItem('octal_customer_auth_token') || localStorage.getItem('octal_auth_token');
    }
    return null;
  });
  const [authIdentity, setAuthIdentity] = useState<AuthIdentity | null>(() => {
    if (typeof window !== 'undefined') {
      const imp = sessionStorage.getItem('octal_impersonate_token');
      const isAdmin = window.location.pathname.startsWith('/admin');
      const token = imp || (isAdmin
        ? localStorage.getItem('octal_platform_auth_token')
        : (localStorage.getItem('octal_customer_auth_token') || localStorage.getItem('octal_auth_token')));
      return getInitialIdentityHintFromToken(token);
    }
    return null;
  });
  const [authUser, setAuthUser] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const imp = sessionStorage.getItem('octal_impersonate_token');
      const isAdmin = window.location.pathname.startsWith('/admin');
      const token = imp || (isAdmin
        ? localStorage.getItem('octal_platform_auth_token')
        : (localStorage.getItem('octal_customer_auth_token') || localStorage.getItem('octal_auth_token')));
      const hint = getInitialIdentityHintFromToken(token);
      return hint?.username || (isAdmin
        ? localStorage.getItem('octal_platform_auth_user')
        : (localStorage.getItem('octal_customer_auth_user') || localStorage.getItem('octal_auth_user')));
    }
    return null;
  });
  const [authChecked, setAuthChecked] = useState(false);
  const [showProfileSetupModal, setShowProfileSetupModal] = useState<boolean>(false);

  // ─── Impersonation state (tab-local in sessionStorage; never touches localStorage octal_auth_token) ──
  const [impersonateToken, setImpersonateToken] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      let hashImpToken: string | null = null;
      let hashImpTenant: string | null = null;
      if (window.location.hash && window.location.hash.startsWith('#')) {
        const hashParams = new URLSearchParams(window.location.hash.slice(1));
        hashImpToken = hashParams.get('impersonateToken');
        hashImpTenant = hashParams.get('impersonateTenant');
      }
      if (hashImpToken) {
        sessionStorage.setItem('octal_impersonate_token', hashImpToken);
        if (hashImpTenant) sessionStorage.setItem('octal_impersonate_tenant', hashImpTenant);
        return hashImpToken;
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

  // ─── Permission & Canonical Structural Role ──────────────────────────────────
  const userRole: StructuralRole | null = authIdentity?.role || null;
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

  const handleLogin = (token: string, identity: AuthIdentity) => {
    setAuthToken(token);
    setAuthUser(identity.username);
    setAuthIdentity(identity);
    if (identity.role === 'platform_admin') {
      localStorage.setItem('octal_platform_auth_token', token);
      localStorage.setItem('octal_platform_auth_user', identity.username);
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/admin')) {
        window.history.pushState({}, '', '/admin');
      }
    } else {
      localStorage.setItem('octal_customer_auth_token', token);
      localStorage.setItem('octal_customer_auth_user', identity.username);
      localStorage.setItem('octal_auth_token', token);
      localStorage.setItem('octal_auth_user', identity.username);
    }
  };

  const handleLogout = async () => {
    if (isImpersonating) {
      sessionStorage.removeItem('octal_impersonate_token');
      sessionStorage.removeItem('octal_impersonate_tenant');
      setImpersonateToken(null);
      setImpersonateTenant(null);
      window.location.href = window.location.origin;
      return;
    }
    if (authToken) {
      await fetch(`${WEB_API_BASE}/auth/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` }
      }).catch(() => {});
    }
    if (isAdminRoute || authIdentity?.role === 'platform_admin') {
      localStorage.removeItem('octal_platform_auth_token');
      localStorage.removeItem('octal_platform_auth_user');
    } else {
      localStorage.removeItem('octal_customer_auth_token');
      localStorage.removeItem('octal_customer_auth_user');
      localStorage.removeItem('octal_auth_token');
      localStorage.removeItem('octal_auth_user');
    }
    localStorage.removeItem('octal_session_id');
    setAuthToken(null);
    setAuthUser(null);
    setAuthIdentity(null);
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
    // Check URL parameters for OAuth tokens or auth errors
    const urlParams = new URLSearchParams(window.location.search);
    const oauthToken = urlParams.get('token');
    const oauthUser = urlParams.get('displayName') || urlParams.get('username') || urlParams.get('user') || 'Google User';
    const authError = urlParams.get('auth_error');

    // Check URL fragment/hash for impersonation token and tenant (#impersonateToken=...&impersonateTenant=...)
    let hashImpToken: string | null = null;
    let hashImpTenant: string | null = null;
    if (typeof window !== 'undefined' && window.location.hash && window.location.hash.startsWith('#')) {
      const hashParams = new URLSearchParams(window.location.hash.slice(1));
      hashImpToken = hashParams.get('impersonateToken');
      hashImpTenant = hashParams.get('impersonateTenant');
    }

    let currentToken = effectiveAuthToken;

    if (hashImpToken) {
      sessionStorage.setItem('octal_impersonate_token', hashImpToken);
      if (hashImpTenant) sessionStorage.setItem('octal_impersonate_tenant', hashImpTenant);
      setImpersonateToken(hashImpToken);
      setImpersonateTenant(hashImpTenant || 'Tenant Organization');
      currentToken = hashImpToken;
      const hint = getInitialIdentityHintFromToken(hashImpToken);
      if (hint) setAuthIdentity(hint);
      // Immediately clear fragment with replaceState, preserving search if any
      window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
    } else if (oauthToken) {
      localStorage.setItem('octal_auth_token', oauthToken);
      localStorage.setItem('octal_auth_user', oauthUser);
      setAuthToken(oauthToken);
      setAuthUser(oauthUser);
      currentToken = oauthToken;
      const hint = getInitialIdentityHintFromToken(oauthToken);
      if (hint) setAuthIdentity(hint);
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
        const res = await fetch(`${WEB_API_BASE}/auth/verify`, {
          headers: { 'Authorization': `Bearer ${currentToken}` },
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          const preferredName = data.user?.displayName || data.user?.username;
          const verifiedRole = tryNormalizeStructuralRole(data.user?.role || data.role);
          if (verifiedRole) {
            setAuthIdentity(prev => ({
              username: preferredName || prev?.username || 'user',
              role: verifiedRole,
              displayName: preferredName || prev?.displayName,
              tenantId: data.tenantId || prev?.tenantId,
              userId: data.user?.id || prev?.userId,
              email: data.user?.email || prev?.email,
              needsOnboarding: data.needsOnboarding ?? (!data.tenantId && !data.pendingInvitation),
              pendingInvitation: data.pendingInvitation
            }));
          }
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
            setAuthIdentity(null);
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

  // Fetch user role and permissions using canonical WEB_API_BASE
  useEffect(() => {
    if (!effectiveAuthToken) return;

    const fetchUserData = async () => {
      try {
        // Get user role & profile
        const res = await fetch(`${WEB_API_BASE}/auth/me`, {
          headers: { 'Authorization': `Bearer ${effectiveAuthToken}` }
        });

        if (res.ok) {
          const data = await res.json();
          const verifiedRole = tryNormalizeStructuralRole(data.user?.role || data.role);
          if (verifiedRole) {
            setAuthIdentity(prev => ({
              username: data.user?.username || prev?.username || 'user',
              role: verifiedRole,
              displayName: data.user?.displayName || prev?.displayName,
              tenantId: data.tenant?.id || prev?.tenantId,
              userId: data.user?.id || prev?.userId,
              email: data.user?.email || prev?.email,
              needsOnboarding: data.needsOnboarding ?? (!data.tenant?.id && !data.pendingInvitation),
              pendingInvitation: data.pendingInvitation
            }));
          }
          if (data.tenant) {
            if (data.tenant.customerType) setCustomerType(data.tenant.customerType);
          }
          if (data.needsProfileSetup || data.user?.needsProfileSetup) {
            setShowProfileSetupModal(true);
          }

          if (verifiedRole === 'platform_admin') {
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
            // Fetch module permissions (authoritatively gated by company platform ceiling)
            const permRes = await fetch(`${WEB_API_BASE}/auth/permissions`, {
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
  }, [effectiveAuthToken]);

  // Fetch Server Info (Public Tunnel / LAN IP) on mount for mobile pairing only
  useEffect(() => {
    fetch(`${WEB_API_BASE}/info`)
      .then(res => res.json())
      .then(data => {
        if (data.serverUrl) {
          setMobilePairingBaseUrl(data.serverUrl);
        } else if (data.localIP && data.localIP !== 'localhost') {
          setMobilePairingBaseUrl(`http://${data.localIP}:3000`);
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

  // ─── Gate: show login screen if not authenticated ─────────────────────────────
  if (!effectiveAuthToken) {
    return <LoginScreen serverUrl={WEB_API_BASE} onLogin={handleLogin} />;
  }

  // ─── Gate: show spinner while checking stored token or resolving initial identity ───
  if (!authChecked || !userRole) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center space-y-3 select-none">
        <div className="w-9 h-9 rounded-full border-2 border-amber-500/20 border-t-amber-500 animate-spin" />
        <div className="text-slate-400 font-mono text-xs tracking-wider uppercase animate-pulse">
          Loading workspace...
        </div>
      </div>
    );
  }

  // ─── Gate: Pending Workspace Invitation Acceptance ─────────────────────────────
  if (authIdentity?.pendingInvitation) {
    return (
      <InvitationAcceptanceModal
        serverUrl={WEB_API_BASE}
        authToken={effectiveAuthToken}
        pendingInvitation={authIdentity.pendingInvitation}
        currentUser={authIdentity}
        onAccepted={(newToken, updatedIdentity, tenant) => {
          setAuthToken(newToken);
          setAuthUser(updatedIdentity.username);
          setAuthIdentity(updatedIdentity);
          if (tenant?.customerType) setCustomerType(tenant.customerType);
          setToast({ message: `Welcome to ${tenant?.name || 'your workspace'}!`, type: 'success' });
        }}
        onLogout={handleLogout}
      />
    );
  }

  // ─── Gate: Customer Workspace Onboarding Wizard (Company vs Just Me) ───────────
  if (authIdentity?.needsOnboarding || (!authIdentity?.tenantId && userRole !== 'platform_admin')) {
    return (
      <CustomerOnboardingModal
        serverUrl={WEB_API_BASE}
        authToken={effectiveAuthToken}
        currentUser={authIdentity}
        onComplete={(newToken, updatedIdentity, tenant) => {
          localStorage.setItem('octal_auth_token', newToken);
          localStorage.setItem('octal_auth_user', updatedIdentity.username);
          setAuthToken(newToken);
          setAuthUser(updatedIdentity.username);
          setAuthIdentity(updatedIdentity);
          if (tenant?.customerType) setCustomerType(tenant.customerType);
          setToast({ message: `Workspace "${tenant?.name}" ready! Welcome, Company Owner.`, type: 'success' });
        }}
        onLogout={handleLogout}
      />
    );
  }

  // Guard: If accessing /admin with a customer account, block with dedicated notice
  if (isAdminRoute && userRole !== 'platform_admin' && !isImpersonating) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-950 text-white font-sans">
        <div className="max-w-md w-full bg-slate-900 border border-amber-500/50 rounded-2xl p-6 shadow-2xl text-center space-y-4">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-500/20 text-amber-400 mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-white">Platform Console Restricted</h2>
          <p className="text-sm text-slate-300">
            You are signed in as a customer account (<span className="text-amber-400 font-semibold">{authUser || 'Customer'}</span>). The Platform Admin Console is strictly reserved for Software Owners.
          </p>
          <div className="pt-2 flex flex-col gap-2">
            <button
              onClick={() => { window.location.href = window.location.origin; }}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 rounded-xl transition-all cursor-pointer"
            >
              Go to Customer Workspace
            </button>
            <button
              onClick={handleLogout}
              className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2 rounded-xl transition-all cursor-pointer text-xs"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Section 12: Dedicated Platform Owner shell: if platform_admin and NOT impersonating, render SuperAdminPortal directly without customer drawer
  if (userRole === 'platform_admin' && !isImpersonating) {
    return (
      <div className={`min-h-screen w-full flex flex-col font-sans ${isLight ? 'bg-slate-100 text-slate-900' : 'bg-black text-slate-100'}`}>
        <SuperAdminPortal
          serverUrl={WEB_API_BASE}
          authToken={effectiveAuthToken}
          currentUser={authUser || 'Admin'}
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
        <div className="bg-[#141210] text-white px-5 py-2.5 flex items-center justify-between text-xs font-bold shadow-xl z-50 sticky top-0 border-b border-amber-500/40">
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            <div className="flex items-center gap-2 font-mono">
              <span className="text-amber-400 font-bold uppercase tracking-wider text-[11px] bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                AUDITED IMPERSONATION ACTIVE
              </span>
              <span className="text-zinc-300">
                Acting as <strong className="text-white font-sans">{typeof window !== 'undefined' ? (sessionStorage.getItem('octal_impersonate_user') || 'Company User') : 'Company User'}</strong> ({typeof window !== 'undefined' ? (sessionStorage.getItem('octal_impersonate_role') || 'Company Owner') : 'Company Owner'}) in <strong className="text-amber-300 font-sans">{impersonateTenant || 'Workspace'}</strong>
              </span>
            </div>
          </div>
          <button
            onClick={async () => {
              try {
                await fetch(`${WEB_API_BASE}/api/super-admin/impersonate/exit`, {
                  method: 'POST',
                  headers: { 'Authorization': `Bearer ${effectiveAuthToken}` }
                });
              } catch {}
              sessionStorage.removeItem('octal_impersonate_token');
              sessionStorage.removeItem('octal_impersonate_tenant');
              sessionStorage.removeItem('octal_impersonate_user');
              sessionStorage.removeItem('octal_impersonate_role');
              window.location.href = window.location.origin;
            }}
            className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg transition font-mono text-xs cursor-pointer shadow-md shadow-amber-500/20"
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
              <span className="text-amber-600 dark:text-amber-400 font-black capitalize">
                {activeTab === 'admin' ? 'Settings' : activeTab === 'team-lead' ? 'Team Workspace' : activeTab === 'super-admin' ? 'Platform Console' : activeTab.replace('-', ' ')}
              </span>
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

            {/* ⚙️ Workspace Settings */}
            <button
              id="topbar-settings-btn"
              onClick={() => {
                setSettingsSubView('overview');
                setActiveTab('admin');
              }}
              title="Workspace Settings"
              className={`w-8 h-8 rounded-full flex items-center justify-center border transition-all cursor-pointer shadow-sm ${
                activeTab === 'admin'
                  ? isLight
                    ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-md ring-2 ring-amber-400/50'
                    : 'bg-amber-500 text-slate-950 border-amber-400 shadow-md ring-2 ring-amber-400/50'
                  : isLight
                    ? 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200 hover:text-amber-600'
                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-amber-400 hover:bg-slate-800'
              }`}
            >
              <Settings className="w-4 h-4" />
            </button>

            {/* Theme Toggle Circle */}
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

            {/* 👤 Octal Accounts User Profile Menu with Hover & Camera Modals */}
            <UserProfileMenu
              isLight={isLight}
              serverUrl={WEB_API_BASE}
              authToken={effectiveAuthToken}
              authUser={authUser}
              userRole={userRole}
              showPill={true}
              activeTab={activeTab}
              onNavigateAccount={() => {
                setSettingsSubView('account');
                setActiveTab('admin');
              }}
              onLogout={handleLogout}
            />
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

              {/* CRM Workspace (Gated by CRM permission or Platform Admin) */}
              {(userRole === 'platform_admin' || userPermissions.crm) && (
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

              {/* Campaigns Workspace (Gated by Campaigns permission or Platform Admin) */}
              {(userRole === 'platform_admin' || userPermissions.campaigns) && (
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

              {/* Leads Database (Gated by Leads permission or Platform Admin) */}
              {(userRole === 'platform_admin' || userPermissions.leads) && (
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

              {/* Reports & Analytics (Gated by Reports permission or Platform Admin) */}
              {(userRole === 'platform_admin' || userPermissions.reports) && (
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
                {(userRole === 'platform_admin' || userPermissions.octalDialer) && (
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



                {/* Auto Emailer Group */}
                {(userRole === 'platform_admin' || userPermissions.autoEmailer) && (
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



                {/* Facebook Poster Group */}
                {(userRole === 'platform_admin' || userPermissions.facebookPoster) && (
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
              (userRole === 'platform_admin' || userPermissions.octalDialer) && (
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
              authToken={effectiveAuthToken || ''}
              authUser={authUser}
              phoneConnected={socketData.phoneConnected}
              phoneDeviceName={socketData.phoneDeviceName}
              campaigns={campaigns}
              onNavigateTab={(tab) => setActiveTab(tab)}
              onSelectCampaign={() => {}}
            />
          )}

          {activeTab === 'crm' && (
            (userRole === 'platform_admin' || userPermissions.crm) ? (
              <CRMWorkspacePage
                isLight={isLight}
                serverUrl={SERVER_URL}
                authToken={effectiveAuthToken || ''}
                campaigns={campaigns}
                userRole={authIdentity?.role || userRole}
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
            (userRole === 'platform_admin' || userPermissions.campaigns) ? (
              <CampaignWorkspacePage
                isLight={isLight}
                serverUrl={SERVER_URL}
                authToken={effectiveAuthToken || ''}
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
            (userRole === 'platform_admin' || userPermissions.crm) ? (
              <CRMWorkspacePage
                isLight={isLight}
                serverUrl={SERVER_URL}
                authToken={effectiveAuthToken || ''}
                campaigns={campaigns}
                userRole={authIdentity?.role || userRole}
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
            (userRole === 'platform_admin' || userPermissions.reports) ? (
              <ReportsPage
                isLight={isLight}
                serverUrl={SERVER_URL}
                authToken={effectiveAuthToken}
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
            <CompanySettings
              isLight={isLight}
              serverUrl={SERVER_URL}
              authToken={effectiveAuthToken || ''}
              currentUser={authUser || ''}
              currentUserRole={userRole || 'user'}
              customerType={customerType}
              userPermissions={userPermissions}
              initialSubView={settingsSubView}
              onNavigateTab={(tab) => setActiveTab(tab as any)}
            />
          )}

          {/* Diagnostic Administration Module (Retained for platform diagnostics & compatibility) */}
          {false && <AdminPanel serverUrl={SERVER_URL} authToken={effectiveAuthToken || ''} currentUser={authUser || ''} />}

          {activeTab === 'billing' && (
            userRole === 'platform_admin' ? (
              <BillingPage
                isLight={isLight}
                serverUrl={SERVER_URL}
                authToken={effectiveAuthToken || ''}
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
                serverUrl={SERVER_URL}
                authToken={effectiveAuthToken}
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
                serverUrl={SERVER_URL}
                authToken={effectiveAuthToken || authToken || ''}
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
                serverUrl={SERVER_URL}
                authToken={effectiveAuthToken || ''}

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
              authToken={effectiveAuthToken || ''}
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
              authToken={effectiveAuthToken || ''}
              socket={socketData.socket}
              serverUrl={socketData.qrPayload?.serverUrl || lanServerUrl || SERVER_URL}
            />
          )}

          {activeTab === 'dnc' && (
            <DncPanel
              isLight={isLight}
              serverUrl={SERVER_URL}
              authToken={effectiveAuthToken || ''}
            />
          )}

          {['scraper', 'scraper-import', 'scraper-settings'].includes(activeTab) && (
            (userRole === 'admin' || userRole === 'platform_admin' || userPermissions.googleScraper) ? (
              <ScraperFilesPanel
                isLight={isLight}
                onImportSuccess={handleImportSuccess}
                serverUrl={SERVER_URL}
                authToken={effectiveAuthToken || ''}
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
              authToken={effectiveAuthToken || ''}
              campaigns={campaigns}
            />
          )}

          {activeTab === 'history' && (
            <CallLog
              isLight={isLight}
              serverUrl={SERVER_URL}
              authToken={effectiveAuthToken}
            />
          )}

          {['emailer-gmail', 'emailer-campaign', 'emailer-templates', 'emailer-leads'].includes(activeTab) && (
            (userRole === 'admin' || userRole === 'platform_admin' || userPermissions.autoEmailer) ? (
              <AutoEmailer
                isLight={isLight}
                serverUrl={SERVER_URL}
                authToken={effectiveAuthToken || ''}
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

          {['scraper', 'scraper-import', 'scraper-settings'].includes(activeTab) && (
            <div className="space-y-4">
              <div className={`p-4 rounded-xl border flex items-center justify-between ${isLight ? 'bg-amber-500/10 border-amber-300 text-amber-900' : 'bg-amber-500/10 border-amber-500/20 text-amber-400'}`}>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-500/20">
                    <Search className="w-5 h-5 text-amber-500" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold font-sans">Lead Generation Product Transition</h4>
                    <p className="text-xs text-slate-500 font-mono">Google Maps Scraper is transitioning to a standalone Lead Generation product. For direct lead onboarding, use CSV import in CRM Workspace.</p>
                  </div>
                </div>
                <button
                  onClick={() => setActiveTab('crm')}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 text-black text-xs font-bold hover:bg-amber-400 transition"
                >
                  Go to CRM
                </button>
              </div>
              <ScraperFilesPanel
                isLight={isLight}
                serverUrl={SERVER_URL}
                authToken={effectiveAuthToken || ''}
                activeSubTab={activeTab}
                onImportSuccess={() => {
                  fetchCampaigns();
                  showToast('Scraped leads imported to CRM successfully.', 'success');
                }}
              />
            </div>
          )}

          {['fb-scraper', 'fb-scraper-files'].includes(activeTab) && (
            <div className="space-y-4">
              <div className={`p-4 rounded-xl border flex items-center justify-between ${isLight ? 'bg-amber-500/10 border-amber-300 text-amber-900' : 'bg-amber-500/10 border-amber-500/20 text-amber-400'}`}>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-500/20">
                    <Facebook className="w-5 h-5 text-amber-500" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold font-sans">Lead Generation Product Transition</h4>
                    <p className="text-xs text-slate-500 font-mono">Facebook Scraper is transitioning to our standalone Lead Generation product. Facebook Auto Poster remains active in Zestify Core.</p>
                  </div>
                </div>
                <button
                  onClick={() => setActiveTab('crm')}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 text-black text-xs font-bold hover:bg-amber-400 transition"
                >
                  Go to CRM
                </button>
              </div>
              <FacebookScraper
                isLight={isLight}
                serverUrl={SERVER_URL}
                authToken={effectiveAuthToken || ''}
                activeSubTab={activeTab}
              />
            </div>
          )}

          {['fb-poster-accounts', 'fb-poster-campaigns', 'fb-poster-scheduler', 'fb-poster-joiner', 'fb-poster-logs'].includes(activeTab) && (
            (userRole === 'admin' || userRole === 'platform_admin' || userPermissions.facebookPoster) ? (
              <FacebookAutoPoster
                isLight={isLight}
                serverUrl={SERVER_URL}
                authToken={effectiveAuthToken || ''}
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
        authToken={effectiveAuthToken || ''}
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
