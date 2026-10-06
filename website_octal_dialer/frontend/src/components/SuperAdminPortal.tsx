import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Shield, Building2, Database, RefreshCw,
  Users, Search, LogOut, Copy, Check, Plus, Minus,
  AlertCircle, Cpu, Radio, X, Smartphone, Activity,
  Clock, ShieldCheck, CheckCircle2, AlertTriangle,
  Sliders, ChevronRight, PhoneCall,
  Mail, Share2, UserCheck, ShieldAlert,
  Sun, Moon, Crown, Ban, Menu
} from 'lucide-react';
import { io as socketIO, Socket } from 'socket.io-client';

interface SuperAdminPortalProps {
  serverUrl: string;
  authToken: string;
  currentUser: any;
  onLogout: () => void;
  isLight?: boolean;
  onToggleTheme?: () => void;
}

interface NewWorkspaceForm {
  companyName: string;
  username: string;
  email: string;
  password: string;
  customerType: 'COMPANY' | 'PERSONAL';
  seatLimit: number;
  planId: string;
}

type NavigationTab =
  | 'overview'
  | 'workspaces'
  | 'users'
  | 'devices'
  | 'jobs'
  | 'activity'
  | 'health';

type DetailTab =
  | 'summary'
  | 'users'
  | 'teams'
  | 'matrix'
  | 'entitlements'
  | 'seats'
  | 'devices'
  | 'activity';

const CANONICAL_MODULES = [
  { id: 'crm', label: 'CRM Workspace', desc: 'Core pipeline, customer accounts & contacts', icon: Users },
  { id: 'octalDialer', label: 'OCTAL Dialer', desc: 'Cellular GSM auto-dialing & agent HUD', icon: PhoneCall },
  { id: 'campaigns', label: 'Campaigns', desc: 'Outbound campaign pipelines & dialer queues', icon: Database },
  { id: 'leads', label: 'Leads Database', desc: 'Contact explorer, lead import & assignments', icon: UserCheck },
  { id: 'reports', label: 'Reports & Analytics', desc: 'Call metrics, disposition analytics & exports', icon: Activity },
  { id: 'autoEmailer', label: 'Email Manager', desc: 'Automated drip email outreach engine', icon: Mail },
  { id: 'facebookPoster', label: 'Facebook Auto Poster', desc: 'Automated social distribution & inbound leads', icon: Share2 }
];

export function LiveTrialCountdown({ targetDate, className = '' }: { targetDate?: string | null; className?: string }) {
  const [display, setDisplay] = useState<{ text: string; isExpired: boolean }>({ text: 'Calculating...', isExpired: false });

  useEffect(() => {
    if (!targetDate) {
      setDisplay({ text: 'No expiration set', isExpired: false });
      return;
    }

    const update = () => {
      const diff = new Date(targetDate).getTime() - Date.now();
      if (diff <= 0) {
        setDisplay({ text: 'EXPIRED', isExpired: true });
        return;
      }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      let str = '';
      if (days > 0) str += `${days}d `;
      if (days > 0 || hours > 0) str += `${hours}h `;
      str += `${minutes}m ${seconds}s left`;
      setDisplay({ text: str, isExpired: false });
    };

    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [targetDate]);

  return (
    <span className={`font-mono inline-flex items-center gap-1 ${display.isExpired ? 'text-rose-500 font-bold' : 'text-amber-500 font-bold'} ${className}`}>
      <span>{display.isExpired ? '⚠️' : '⏳'}</span>
      <span>{display.text}</span>
    </span>
  );
}

export function getDisplayPlan(planOrTier?: string | null): string {
  if (!planOrTier) return 'STARTER';
  const clean = String(planOrTier).toLowerCase().replace(/^plan_/, '').trim();
  if (clean === 'standard') return 'STARTER';
  return clean.toUpperCase() || 'STARTER';
}

export const SuperAdminPortal: React.FC<SuperAdminPortalProps> = ({
  serverUrl,
  authToken,
  currentUser,
  onLogout,
  isLight: isLightProp,
  onToggleTheme
}) => {
  // Theme State
  const [internalTheme, setInternalTheme] = useState<'light' | 'dark'>(() => {
    if (typeof isLightProp === 'boolean') return isLightProp ? 'light' : 'dark';
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('octal_theme') as 'light' | 'dark') || 'dark';
    }
    return 'dark';
  });

  useEffect(() => {
    if (typeof isLightProp === 'boolean') {
      setInternalTheme(isLightProp ? 'light' : 'dark');
    }
  }, [isLightProp]);

  const isLight = typeof isLightProp === 'boolean' ? isLightProp : internalTheme === 'light';

  const handleToggleTheme = () => {
    if (onToggleTheme) {
      onToggleTheme();
    } else {
      const next = isLight ? 'dark' : 'light';
      setInternalTheme(next);
      localStorage.setItem('octal_theme', next);
      if (next === 'light') {
        document.documentElement.classList.remove('dark');
      } else {
        document.documentElement.classList.add('dark');
      }
    }
  };

  // Navigation State
  const [activeTab, setActiveTab] = useState<NavigationTab>('overview');
  const [isNavPinned, setIsNavPinned] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('zestify_admin_nav_pinned');
      if (saved !== null) return saved === 'true';
      return window.innerWidth >= 1440;
    }
    return false;
  });
  const [isNavHovered, setIsNavHovered] = useState(false);
  const isNavExpanded = isNavPinned || isNavHovered;

  const toggleNavPinned = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsNavPinned(prev => {
      const next = !prev;
      localStorage.setItem('zestify_admin_nav_pinned', String(next));
      return next;
    });
  };

  // Observability & Telemetry State
  const [overview, setOverview] = useState<any>(null);
  const [tenants, setTenants] = useState<any[]>([]);
  const [totalTenants, setTotalTenants] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(15);
  const [totalPages, setTotalPages] = useState(1);

  // Subviews State
  const [globalUsers, setGlobalUsers] = useState<any[]>([]);
  const [devicesList, setDevicesList] = useState<any[]>([]);
  const [jobsData, setJobsData] = useState<any>(null);
  const [activityList, setActivityList] = useState<any[]>([]);
  const [systemHealth, setSystemHealth] = useState<any>(null);

  // Workspace Detail Drawer / Modal State
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [tenantDetail, setTenantDetail] = useState<any | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('summary');
  const [detailLoading, setDetailLoading] = useState(false);

  // Live Trial Adjustment Modal State
  const [adjustingTrialTenant, setAdjustingTrialTenant] = useState<any | null>(null);
  const [trialAdjustDays, setTrialAdjustDays] = useState<number>(1);
  const [trialAdjustHours, setTrialAdjustHours] = useState<number>(0);
  const [trialActionLoading, setTrialActionLoading] = useState(false);

  // Commercial Plan Update Modal State
  const [updatingPlanTenant, setUpdatingPlanTenant] = useState<any | null>(null);
  const [selectedNewPlan, setSelectedNewPlan] = useState<string>('starter');
  const [planUpdateLoading, setPlanUpdateLoading] = useState(false);

  // Loading & Sync Status
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date());
  const [isLiveConnected, setIsLiveConnected] = useState(false);

  // Master Superadmin Authority State & Handlers
  const [allPlatformSuperUsers, setAllPlatformSuperUsers] = useState<any[]>([]);
  const [superActionLoadingId, setSuperActionLoadingId] = useState<string | null>(null);
  const [superUsersLoading, setSuperUsersLoading] = useState(false);

  const fetchSuperadminUsers = useCallback(async () => {
    if (!authToken) return;
    setSuperUsersLoading(true);
    try {
      const res = await fetch(`${serverUrl}/api/superadmin/users`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAllPlatformSuperUsers(data.users || []);
      }
    } catch (err) {
      console.error('[SuperAdminPortal] Failed to load superadmin users:', err);
    } finally {
      setSuperUsersLoading(false);
    }
  }, [serverUrl, authToken]);

  const handleSuperadminToggleStatus = async (user: any, newStatus: 'Active' | 'Suspended') => {
    if (!confirm(`Are you sure you want to change ${user.username}'s status to ${newStatus}?`)) return;
    setSuperActionLoadingId(user.id);
    try {
      const res = await fetch(`${serverUrl}/api/superadmin/users/${user.id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ status: newStatus, reason: 'Superadmin manual status change' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update user status');
      setSuccessMsg(`User ${user.username} is now ${newStatus}`);
      await fetchSuperadminUsers();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSuperActionLoadingId(null);
    }
  };

  // Filters & Search for Workspaces
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('newest');

  // Filters for Global Users
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<string>('all');
  const [userStatusFilter, setUserStatusFilter] = useState<string>('all');

  // Provisioning Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createForm, setCreateForm] = useState<NewWorkspaceForm>({
    companyName: '',
    username: '',
    email: '',
    password: '',
    customerType: 'COMPANY',
    seatLimit: 10,
    planId: 'plan_pro'
  });

  // Seat Management Modal State
  const [showSeatModal, setShowSeatModal] = useState(false);
  const [newSeatLimit, setNewSeatLimit] = useState<number>(10);
  const [seatUpdating, setSeatUpdating] = useState(false);

  // Suspend Workspace Modal State
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [suspendReason, setSuspendReason] = useState('Platform administrative action');
  const [targetSuspendTenant, setTargetSuspendTenant] = useState<any | null>(null);
  const [suspendLoading, setSuspendLoading] = useState(false);

  // Impersonation Confirmation Modal State
  const [showImpersonateModal, setShowImpersonateModal] = useState(false);
  const [impersonateTargetTenant, setImpersonateTargetTenant] = useState<any | null>(null);
  const [impersonateUserId, setImpersonateUserId] = useState<string>('');
  const [impersonateReason, setImpersonateReason] = useState('Platform Support Investigation');
  const [impersonateLoading, setImpersonateLoading] = useState(false);

  // Module Entitlement Toggling & Cell Inspection
  const [togglingModule, setTogglingModule] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [inspectCell, setInspectCell] = useState<{
    user: any;
    mod: { id: string; label: string };
    status: 'allowed' | 'blocked_company' | 'not_assigned' | 'inactive';
    reason: string;
  } | null>(null);

  const socketRef = useRef<Socket | null>(null);

  const notify = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // ── Stage 1: Authoritative Snapshot Fetch ────────────────────────────────────
  const fetchGlobalData = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    setError(null);

    try {
      // 1. Fetch Global SaaS Overview
      const ovRes = await fetch(`${serverUrl}/api/super-admin/overview`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (ovRes.ok) {
        const ovJson = await ovRes.json();
        if (ovJson.success) setOverview(ovJson.overview);
      } else if (ovRes.status === 403) {
        setError('Supreme platform privilege required. Current account is not a platform administrator.');
        return;
      }

      // 2. Fetch Paginated & Filtered Tenants Master Table
      const queryParams = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        search: search.trim(),
        type: typeFilter,
        status: statusFilter
      });

      const tenRes = await fetch(`${serverUrl}/api/super-admin/tenants?${queryParams.toString()}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (tenRes.ok) {
        const tenJson = await tenRes.json();
        if (tenJson.success) {
          let list = tenJson.tenants || [];
          if (planFilter !== 'all') {
            list = list.filter((t: any) => {
              const p = (t.tier || t.plan || '').toLowerCase().replace(/^plan_/, '');
              const normalized = p === 'standard' ? 'starter' : p;
              return normalized === planFilter.toLowerCase();
            });
          }
          if (sortBy === 'oldest') {
            list.sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
          } else if (sortBy === 'most_users') {
            list.sort((a: any, b: any) => (b.totalUsers || 0) - (a.totalUsers || 0));
          } else if (sortBy === 'highest_seats') {
            list.sort((a: any, b: any) => {
              const utilA = a.maxAgents ? (a.totalUsers || 0) / a.maxAgents : 0;
              const utilB = b.maxAgents ? (b.totalUsers || 0) / b.maxAgents : 0;
              return utilB - utilA;
            });
          }
          setTenants(list);
          setTotalTenants(tenJson.total || 0);
          setTotalPages(tenJson.totalPages || 1);
        }
      }

      // 3. Fetch subviews based on active tab
      if (activeTab === 'users') {
        fetchSuperadminUsers();
        const uParams = new URLSearchParams({
          search: userSearch.trim(),
          role: userRoleFilter,
          status: userStatusFilter
        });
        const uRes = await fetch(`${serverUrl}/api/super-admin/users?${uParams.toString()}`, {
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (uRes.ok) {
          const uJson = await uRes.json();
          if (uJson.success) setGlobalUsers(uJson.users || []);
        }
      } else if (activeTab === 'devices') {
        const devRes = await fetch(`${serverUrl}/api/super-admin/devices`, {
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (devRes.ok) {
          const devJson = await devRes.json();
          if (devJson.success) setDevicesList(devJson.devices || []);
        }
      } else if (activeTab === 'jobs') {
        const jobRes = await fetch(`${serverUrl}/api/super-admin/jobs`, {
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (jobRes.ok) {
          const jobJson = await jobRes.json();
          if (jobJson.success) setJobsData(jobJson);
        }
      } else if (activeTab === 'activity') {
        const actRes = await fetch(`${serverUrl}/api/super-admin/activity?limit=50`, {
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (actRes.ok) {
          const actJson = await actRes.json();
          if (actJson.success) setActivityList(actJson.activities || []);
        }
      } else if (activeTab === 'health') {
        const hRes = await fetch(`${serverUrl}/api/super-admin/system-health`, {
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (hRes.ok) {
          const hJson = await hRes.json();
          if (hJson.success) setSystemHealth(hJson.health);
        }
      }

      setLastSyncTime(new Date());
    } catch (err: any) {
      console.error('[Platform Console] Sync error:', err);
      setError('Unable to synchronize platform state. Fallback retry in progress.');
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [serverUrl, authToken, page, limit, search, typeFilter, statusFilter, planFilter, sortBy, activeTab, userSearch, userRoleFilter, userStatusFilter]);

  // ── Fetch Tenant Detail for Command Center ──────────────────────────────────
  const fetchTenantDetail = async (tenantId: string) => {
    setSelectedTenantId(tenantId);
    setDetailLoading(true);
    try {
      const res = await fetch(`${serverUrl}/api/super-admin/tenants/${tenantId}/detail`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTenantDetail(data.detail);
        if (data.detail?.overview?.maxAgents) {
          setNewSeatLimit(data.detail.overview.maxAgents);
        }
      } else {
        notify('Failed to load workspace command center snapshot.');
      }
    } catch {
      notify('Network error fetching workspace snapshot.');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleAdjustTrial = async (
    tenantId: string,
    action: 'add' | 'reduce' | 'expire_now' | 'custom',
    daysVal: number = 0,
    hoursVal: number = 0
  ) => {
    setTrialActionLoading(true);
    try {
      let days = daysVal;
      let hours = hoursVal;
      if (action === 'expire_now') {
        days = 0;
        hours = 0;
      }
      const res = await fetch(`${serverUrl}/api/super-admin/tenants/${tenantId}/adjust-trial`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          action,
          days: action === 'reduce' ? -(Math.abs(days || 0)) : (days || 0),
          hours: action === 'reduce' ? -(Math.abs(hours || 0)) : (hours || 0)
        })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to adjust trial');
      notify(d.message || 'Trial duration adjusted successfully!');
      setAdjustingTrialTenant(null);
      fetchGlobalData(false);
      if (selectedTenantId === tenantId) fetchTenantDetail(tenantId);
    } catch (e: any) {
      alert('Error adjusting trial: ' + (e.message || e));
    } finally {
      setTrialActionLoading(false);
    }
  };

  const handleUpdateTenantPlan = async (tenantId: string, planId: string) => {
    setPlanUpdateLoading(true);
    try {
      const res = await fetch(`${serverUrl}/api/super-admin/tenants/${tenantId}/plan`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ planId })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to update plan');
      notify(d.message || `Plan updated to ${d.plan.toUpperCase()}!`);
      setUpdatingPlanTenant(null);
      fetchGlobalData(false);
      if (selectedTenantId === tenantId) fetchTenantDetail(tenantId);
    } catch (e: any) {
      alert('Error updating plan: ' + (e.message || e));
    } finally {
      setPlanUpdateLoading(false);
    }
  };



  // ── Stage 2: Live Socket.IO Events & Fallback Polling ────────────────────────
  useEffect(() => {
    fetchGlobalData(true);

    const socket = socketIO(serverUrl, {
      auth: { token: authToken },
      reconnectionAttempts: 5,
      reconnectionDelay: 2000
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsLiveConnected(true);
      socket.emit('platform:subscribe', { authToken });
    });

    socket.on('disconnect', () => {
      setIsLiveConnected(false);
    });

    const handlePlatformEvent = (_eventData?: any) => {
      setLastSyncTime(new Date());
      fetchGlobalData(false);
      if (selectedTenantId) {
        fetchTenantDetail(selectedTenantId);
      }
    };

    socket.on('platform:tenant-created', (data) => {
      notify(`Workspace "${data.name}" provisioned.`);
      handlePlatformEvent(data);
    });
    socket.on('platform:tenant-updated', handlePlatformEvent);
    socket.on('platform:tenant-suspended', handlePlatformEvent);
    socket.on('platform:device-online', (data) => {
      notify(`GSM Device "${data.deviceName || data.deviceId}" connected.`);
      handlePlatformEvent(data);
    });
    socket.on('platform:device-offline', handlePlatformEvent);
    socket.on('platform:call-started', handlePlatformEvent);
    socket.on('platform:call-completed', handlePlatformEvent);

    const interval = setInterval(() => fetchGlobalData(false), 30000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchGlobalData(false);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      socket.disconnect();
    };
  }, [serverUrl, authToken, fetchGlobalData, selectedTenantId]);

  // ── Actions ─────────────────────────────────────────────────────────────────
  const handleUpdateSeatLimit = async (tenantId: string, seatLimit: number) => {
    setSeatUpdating(true);
    try {
      const res = await fetch(`${serverUrl}/api/super-admin/tenants/${tenantId}/seats`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ seatLimit })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        notify(`Seat limit updated to ${seatLimit} seats.`);
        setShowSeatModal(false);
        fetchGlobalData(false);
        if (selectedTenantId) fetchTenantDetail(selectedTenantId);
      } else {
        alert(data.error || 'Failed to update seat limit.');
      }
    } catch {
      alert('Network error while updating seat limit.');
    } finally {
      setSeatUpdating(false);
    }
  };

  const handleConfirmSuspend = async () => {
    if (!targetSuspendTenant) return;
    setSuspendLoading(true);
    const newStatus = targetSuspendTenant.status === 'active' ? 'suspended' : 'active';
    try {
      const res = await fetch(`${serverUrl}/api/super-admin/tenants/${targetSuspendTenant.id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ status: newStatus, reason: suspendReason })
      });
      if (res.ok) {
        notify(`Workspace ${targetSuspendTenant.name} is now ${newStatus.toUpperCase()}.`);
        setShowSuspendModal(false);
        setTargetSuspendTenant(null);
        fetchGlobalData(false);
        if (selectedTenantId) fetchTenantDetail(selectedTenantId);
      } else {
        alert('Failed to update workspace status.');
      }
    } catch {
      alert('Network error while updating workspace status.');
    } finally {
      setSuspendLoading(false);
    }
  };

  const handleStartImpersonation = async () => {
    if (!impersonateTargetTenant) return;
    setImpersonateLoading(true);
    try {
      const res = await fetch(`${serverUrl}/api/super-admin/impersonate/${impersonateTargetTenant.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          userId: impersonateUserId || undefined,
          reason: impersonateReason
        })
      });
      if (res.ok) {
        const data = await res.json();
        const tenantName = impersonateTargetTenant.name || impersonateTargetTenant.id;
        const targetUserName = data.user.displayName || data.user.username;
        const targetUserRole = data.user.role === 'admin' ? 'Company Owner' : (data.user.role === 'team_lead' ? 'Team Lead' : 'Member');

        sessionStorage.setItem('octal_impersonate_token', data.token);
        sessionStorage.setItem('octal_impersonate_tenant', tenantName);
        sessionStorage.setItem('octal_impersonate_user', targetUserName);
        sessionStorage.setItem('octal_impersonate_role', targetUserRole);

        setShowImpersonateModal(false);
        window.open(
          `${window.location.origin}/#impersonateToken=${encodeURIComponent(data.token)}&impersonateTenant=${encodeURIComponent(tenantName)}&impersonateUser=${encodeURIComponent(targetUserName)}&impersonateRole=${encodeURIComponent(targetUserRole)}`,
          '_blank'
        );
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to generate audited impersonation session.');
      }
    } catch {
      alert('Network error entering workspace.');
    } finally {
      setImpersonateLoading(false);
    }
  };

  const handleToggleEntitlement = async (moduleId: string, currentVal: boolean) => {
    if (!selectedTenantId) return;
    setTogglingModule(moduleId);
    try {
      const newVal = !currentVal;
      const res = await fetch(`${serverUrl}/api/super-admin/tenants/${selectedTenantId}/entitlements`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          moduleId,
          enabled: newVal
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update company module ceiling');

      setTenantDetail((prev: any) => {
        if (!prev) return prev;
        const updatedEntitlements = {
          ...(prev.moduleEntitlements || {}),
          [moduleId]: newVal
        };
        const updatedModules = newVal
          ? [...(prev.enabledModulesList || []).filter((m: string) => m !== moduleId), moduleId]
          : (prev.enabledModulesList || []).filter((m: string) => m !== moduleId);
        return {
          ...prev,
          moduleEntitlements: updatedEntitlements,
          enabledModulesList: updatedModules
        };
      });

      fetchGlobalData(false);
      notify(`Company ceiling for "${moduleId}" set to ${newVal ? 'ENABLED' : 'DISABLED'}.`);
    } catch (err: any) {
      setError(err.message || 'Failed to toggle module ceiling');
    } finally {
      setTogglingModule(null);
    }
  };

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.companyName || !createForm.username || !createForm.password) {
      alert('Company name, primary owner username, and password are required.');
      return;
    }
    setCreateLoading(true);
    try {
      const res = await fetch(`${serverUrl}/api/super-admin/provision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          name: createForm.companyName,
          username: createForm.username,
          email: createForm.email,
          password: createForm.password,
          customerType: createForm.customerType,
          maxAgents: createForm.seatLimit,
          planId: createForm.planId
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        notify(`Workspace "${createForm.companyName}" successfully provisioned!`);
        setShowCreateModal(false);
        setCreateForm({
          companyName: '',
          username: '',
          email: '',
          password: '',
          customerType: 'COMPANY',
          seatLimit: 10,
          planId: 'plan_pro'
        });
        fetchGlobalData(false);
      } else {
        alert(data.error || 'Failed to provision workspace.');
      }
    } catch (err: any) {
      alert(err.message || 'Network error while creating workspace.');
    } finally {
      setCreateLoading(false);
    }
  };

  // Derive Attention Center Items
  const attentionItems: Array<{
    id: string;
    severity: 'critical' | 'warning' | 'info';
    title: string;
    description: string;
    tenantId?: string;
    tenantName?: string;
    actionLabel?: string;
  }> = [];

  tenants.forEach((t: any) => {
    if (t.status === 'suspended') {
      attentionItems.push({
        id: `suspended_${t.id}`,
        severity: 'critical',
        title: 'Workspace Suspended',
        description: `Customer organization "${t.name}" is currently suspended. Users cannot access workspaces.`,
        tenantId: t.id,
        tenantName: t.name,
        actionLabel: 'Inspect Workspace'
      });
    }

    const seatsUsed = t.totalUsers || 0;
    const seatCap = t.maxAgents || 10;
    if (seatCap > 0 && seatsUsed >= seatCap) {
      attentionItems.push({
        id: `seat_limit_${t.id}`,
        severity: 'warning',
        title: 'Seat Limit Reached',
        description: `"${t.name}" is utilizing ${seatsUsed} of ${seatCap} provisioned seats (100% capacity).`,
        tenantId: t.id,
        tenantName: t.name,
        actionLabel: 'Adjust Limit'
      });
    } else if (seatCap > 0 && (seatsUsed / seatCap) >= 0.8) {
      attentionItems.push({
        id: `seat_warn_${t.id}`,
        severity: 'info',
        title: 'Approaching Seat Limit',
        description: `"${t.name}" has ${seatsUsed}/${seatCap} seats filled (>80% utilization).`,
        tenantId: t.id,
        tenantName: t.name,
        actionLabel: 'Review Limits'
      });
    }

    if (t.status === 'trial') {
      attentionItems.push({
        id: `trial_${t.id}`,
        severity: 'info',
        title: 'Active Trial Workspace',
        description: `"${t.name}" is in commercial evaluation period.`,
        tenantId: t.id,
        tenantName: t.name,
        actionLabel: 'View Plan'
      });
    }
  });

  const usernameDisplay = typeof currentUser === 'string' ? currentUser : currentUser?.username || 'admin';
  const isMasterSuperAdmin = usernameDisplay.toLowerCase() === 'master_mohsin7' || currentUser?.role === 'superadmin';

  return (
    <div className={`min-h-screen flex flex-row font-sans selection:bg-amber-500/20 selection:text-amber-500 antialiased transition-colors duration-200 ${
      isLight ? 'bg-slate-100 text-slate-900' : 'bg-[#080706] text-slate-100'
    }`}>
      {/* ── 1. PLATFORM OWNER SIDEBAR ── */}
      <aside
        onMouseEnter={() => setIsNavHovered(true)}
        onMouseLeave={() => setIsNavHovered(false)}
        className={`border-r flex flex-col shrink-0 z-30 select-none transition-all duration-300 ease-in-out ${
          isNavExpanded ? 'w-64' : 'w-16 items-center'
        } ${
          isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#0d0c0a] border-[#1c1917]'
        }`}
      >
        {/* Brand Header */}
        <div className={`border-b flex items-center transition-all ${
          isNavExpanded ? 'p-4 justify-between w-full' : 'p-3.5 justify-center'
        } ${
          isLight ? 'border-slate-200 bg-white' : 'border-[#1c1917] bg-[#0d0c0a]'
        }`}>
          {isNavExpanded ? (
            <>
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="w-9 h-9 rounded-xl bg-amber-500 shadow-lg shadow-amber-500/20 flex items-center justify-center shrink-0">
                  <Shield className="w-5 h-5 text-slate-950" />
                </div>
                <div className="overflow-hidden">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-sm font-extrabold tracking-wider ${isLight ? 'text-slate-900' : 'text-white'}`}>
                      ZESTIFY
                    </span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      isLight ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    }`}>
                      ROOT
                    </span>
                  </div>
                  <div className={`text-[10px] font-semibold tracking-wider uppercase truncate ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>
                    PLATFORM CONSOLE
                  </div>
                </div>
              </div>
              <button
                onClick={toggleNavPinned}
                title={isNavPinned ? "Unpin Navigation Sidebar (Collapse)" : "Pin Navigation Sidebar Open"}
                className={`p-1.5 rounded-lg border transition cursor-pointer shrink-0 ${
                  isNavPinned
                    ? (isLight ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-amber-500/20 border-amber-500/40 text-amber-400')
                    : (isLight ? 'border-slate-200 text-slate-500 hover:bg-slate-100' : 'border-[#27272a] text-zinc-400 hover:bg-[#181614]')
                }`}
              >
                <Menu className="w-4 h-4 stroke-[2.5]" />
              </button>
            </>
          ) : (
            <button
              onClick={toggleNavPinned}
              title="Pin Navigation Sidebar Open"
              className="w-9 h-9 rounded-xl bg-amber-500 shadow-lg shadow-amber-500/20 flex items-center justify-center shrink-0 cursor-pointer hover:scale-105 transition-transform"
            >
              <Shield className="w-5 h-5 text-slate-950" />
            </button>
          )}
        </div>

        {/* Navigation Menu */}
        <nav className={`flex-1 space-y-1 overflow-y-auto overflow-x-hidden ${isNavExpanded ? 'p-3 w-full' : 'p-2 w-full flex flex-col items-center'}`}>
          {[
            { id: 'overview', label: 'OVERVIEW', icon: Activity },
            { id: 'workspaces', label: 'COMPANIES', icon: Building2, count: totalTenants },
            { id: 'users', label: 'PEOPLE', icon: Users },
            { id: 'devices', label: 'TELEPHONY & DEVICES', icon: Smartphone },
            { id: 'jobs', label: 'AUTOMATION & JOBS', icon: Sliders },
            { id: 'activity', label: 'SECURITY & AUDIT', icon: ShieldAlert },
            { id: 'health', label: 'SYSTEM HEALTH', icon: ShieldCheck },
          ].map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as NavigationTab)}
                title={`${item.label}${item.count !== undefined ? ` (${item.count})` : ''}`}
                className={`transition cursor-pointer relative ${
                  isNavExpanded
                    ? 'w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold'
                    : 'w-10 h-10 flex items-center justify-center rounded-xl my-0.5'
                } ${
                  isActive
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                    : isLight
                    ? 'text-slate-600 hover:text-slate-950 hover:bg-slate-100 font-semibold'
                    : 'text-zinc-400 hover:text-white hover:bg-[#181614] font-semibold'
                }`}
              >
                {isNavExpanded ? (
                  <>
                    <div className="flex items-center gap-3">
                      <Icon className={`w-4 h-4 ${isActive ? 'text-slate-950' : 'text-amber-500'}`} />
                      <span>{item.label}</span>
                    </div>
                    {item.count !== undefined && (
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
                        isActive
                          ? 'bg-slate-950 text-amber-400'
                          : isLight
                          ? 'bg-slate-100 text-slate-700 border border-slate-200'
                          : 'bg-[#1c1917] text-zinc-400'
                      }`}>
                        {item.count}
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <Icon className={`w-5 h-5 ${isActive ? 'text-slate-950' : 'text-amber-500'}`} />
                    {item.count !== undefined && item.count > 0 && (
                      <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-[#0d0c0a]" />
                    )}
                  </>
                )}
              </button>
            );
          })}
        </nav>

        {/* Profile / Bottom Section */}
        <div className={`border-t transition-colors ${
          isNavExpanded ? 'p-4 w-full' : 'p-2.5 w-full flex flex-col items-center gap-2'
        } ${
          isLight ? 'border-slate-200 bg-slate-50' : 'border-[#1c1917] bg-[#090807]'
        }`}>
          {isNavExpanded ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 overflow-hidden">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                  isMasterSuperAdmin
                    ? 'bg-amber-500/20 border border-amber-500/50 text-amber-400'
                    : (isLight ? 'bg-amber-100 border border-amber-300 text-amber-900' : 'bg-amber-500/10 border border-amber-500/30 text-amber-400')
                }`}>
                  {isMasterSuperAdmin ? <Crown className="w-4 h-4 text-amber-400" /> : 'PO'}
                </div>
                <div className="text-left overflow-hidden">
                  <div className={`text-xs font-bold capitalize leading-tight flex items-center gap-1 truncate ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    {usernameDisplay}
                    {isMasterSuperAdmin && <Crown className="w-3 h-3 text-amber-400 shrink-0" />}
                  </div>
                  <div className={`text-[10px] font-extrabold uppercase truncate ${isMasterSuperAdmin ? 'text-amber-400 font-mono tracking-wider' : (isLight ? 'text-amber-800' : 'text-amber-400')}`}>
                    {isMasterSuperAdmin ? 'SUPERADMIN (MASTER)' : 'Platform Owner'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={handleToggleTheme}
                  className={`p-2 rounded-lg border transition cursor-pointer ${
                    isLight
                      ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900 shadow-sm'
                      : 'bg-[#141210] border-[#27272a] text-amber-400 hover:text-white'
                  }`}
                  title={isLight ? 'Switch to Dark Mode' : 'Switch to Bright Mode'}
                >
                  {isLight ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                </button>

                <button
                  onClick={onLogout}
                  className={`p-2 rounded-lg border transition cursor-pointer ${
                    isLight
                      ? 'bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100'
                      : 'bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500/20'
                  }`}
                  title="Sign Out Platform Admin"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div
                title={`${usernameDisplay} (${isMasterSuperAdmin ? 'SUPERADMIN MASTER' : 'Platform Owner'})`}
                className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs cursor-pointer ${
                  isMasterSuperAdmin
                    ? 'bg-amber-500/20 border border-amber-500/50 text-amber-400'
                    : (isLight ? 'bg-amber-100 border border-amber-300 text-amber-900' : 'bg-amber-500/10 border border-amber-500/30 text-amber-400')
                }`}
              >
                {isMasterSuperAdmin ? <Crown className="w-4 h-4 text-amber-400" /> : 'PO'}
              </div>
              <button
                onClick={handleToggleTheme}
                className={`p-2 rounded-lg border transition cursor-pointer ${
                  isLight
                    ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 shadow-sm'
                    : 'bg-[#141210] border-[#27272a] text-amber-400 hover:text-white'
                }`}
                title={isLight ? 'Switch to Dark Mode' : 'Switch to Bright Mode'}
              >
                {isLight ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              </button>
              <button
                onClick={onLogout}
                className={`p-2 rounded-lg border transition cursor-pointer ${
                  isLight
                    ? 'bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100'
                    : 'bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500/20'
                }`}
                title="Sign Out Platform Admin"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ── 2. MAIN APPLICATION CONTENT AREA ── */}
      <div className={`flex-1 flex flex-col min-w-0 overflow-hidden transition-colors duration-200 ${
        isLight ? 'bg-slate-100 text-slate-900' : 'bg-[#080706] text-slate-100'
      }`}>
        {/* Executive Top Bar */}
        <header className={`h-16 backdrop-blur-md border-b flex items-center justify-between px-6 shrink-0 z-20 transition-colors duration-200 ${
          isLight ? 'bg-white/95 border-slate-200 shadow-sm' : 'bg-[#0d0c0a]/90 border-[#1c1917]'
        }`}>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleNavPinned}
              title={isNavPinned ? "Unpin Navigation Sidebar (Collapse)" : "Pin Navigation Sidebar Open"}
              className={`p-2 rounded-xl border transition-all cursor-pointer mr-1 ${
                isNavPinned
                  ? (isLight ? 'bg-amber-50 border-amber-300 text-amber-800' : 'bg-amber-500/15 border-amber-500/30 text-amber-400')
                  : (isLight ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700' : 'bg-[#141210] hover:bg-[#1a1815] border-[#27272a] text-zinc-400 hover:text-white')
              }`}
            >
              <Menu className="w-4 h-4 stroke-[2.5]" />
            </button>
            <h2 className={`text-sm font-extrabold uppercase tracking-wider ${isLight ? 'text-slate-900' : 'text-white'}`}>
              {activeTab === 'overview' && 'Platform Overview & Telemetry'}
              {activeTab === 'workspaces' && 'Customer Workspaces & Entitlements'}
              {activeTab === 'users' && 'Global Customer Users & Scoped RBAC'}
              {activeTab === 'devices' && 'Telephony Handsets & Cellular Radio'}
              {activeTab === 'jobs' && 'Automation Workers & Task Health'}
              {activeTab === 'activity' && 'Forensic Platform Audit Stream'}
              {activeTab === 'health' && 'System Health & Engine Observability'}
            </h2>
            <span className={isLight ? 'text-slate-300' : 'text-zinc-600'}>•</span>
            <div className="flex items-center gap-2 text-xs font-medium">
              {isLiveConnected ? (
                <span className={`flex items-center gap-1.5 font-semibold ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  REALTIME ENGINE LIVE
                </span>
              ) : (
                <span className={`flex items-center gap-1.5 font-semibold ${isLight ? 'text-amber-600' : 'text-amber-400'}`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  SYNCING (30s POLLING)
                </span>
              )}
              <span className={isLight ? 'text-slate-300' : 'text-zinc-600'}>•</span>
              <span className={isLight ? 'text-slate-500' : 'text-zinc-400'}>Synced {lastSyncTime.toLocaleTimeString()}</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleToggleTheme}
              className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-all cursor-pointer shadow-sm ${
                isLight
                  ? 'bg-slate-100 border-slate-300 text-slate-800 hover:bg-slate-200'
                  : 'bg-[#141210] border-[#27272a] text-amber-400 hover:text-white'
              }`}
              title={isLight ? 'Switch to Dark Mode' : 'Switch to Bright Mode'}
            >
              {isLight ? <Moon className="w-4 h-4 text-slate-800" /> : <Sun className="w-4 h-4 text-amber-400" />}
            </button>

            <button
              onClick={() => fetchGlobalData(true)}
              disabled={loading}
              className={`p-2 rounded-xl border transition cursor-pointer disabled:opacity-50 ${
                isLight
                  ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                  : 'bg-[#141210] border-[#27272a] text-zinc-300 hover:text-white hover:border-amber-500/40'
              }`}
              title="Refresh Real-time Telemetry"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-500' : ''}`} />
            </button>

            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Provision Workspace</span>
            </button>
          </div>
        </header>

        {/* Content Body */}
        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Notifications */}
          {successMsg && (
            <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between shadow-lg">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="font-semibold">{successMsg}</span>
              </div>
              <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {error && (
            <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between shadow-lg">
              <div className="flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-400" />
                <span>{error}</span>
              </div>
              <button onClick={() => setError(null)} className="text-rose-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════
              SUBVIEW 1: OVERVIEW DASHBOARD
          ══════════════════════════════════════════════════════════════════════ */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Top 8 Executive KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                {/* 1. Total Workspaces */}
                <div className={`p-4 rounded-xl border transition ${
                  isLight
                    ? 'bg-white border-slate-200 shadow-sm hover:border-amber-400'
                    : 'bg-[#0f0e0c] border-[#1f1c19] hover:border-amber-500/40 shadow-lg'
                }`}>
                  <div className={`flex items-center justify-between text-xs font-semibold mb-2 ${
                    isLight ? 'text-slate-500' : 'text-zinc-400'
                  }`}>
                    <span>Total Workspaces</span>
                    <Building2 className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className={`text-2xl font-extrabold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    {overview?.totalTenants ?? totalTenants}
                  </div>
                  <div className={`mt-2 text-xs font-medium ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
                    {overview?.companyTenants ?? 0} Company • {overview?.personalTenants ?? 0} Personal
                  </div>
                </div>

                {/* 2. Active Workspaces */}
                <div className={`p-4 rounded-xl border transition ${
                  isLight
                    ? 'bg-white border-slate-200 shadow-sm hover:border-emerald-400'
                    : 'bg-[#0f0e0c] border-[#1f1c19] hover:border-emerald-500/40 shadow-lg'
                }`}>
                  <div className={`flex items-center justify-between text-xs font-semibold mb-2 ${
                    isLight ? 'text-slate-500' : 'text-zinc-400'
                  }`}>
                    <span>Active Workspaces</span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div className={`text-2xl font-extrabold ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`}>
                    {overview?.activeTenants ?? 0}
                  </div>
                  <div className={`mt-2 text-xs font-medium ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
                    Operational customer tenants
                  </div>
                </div>

                {/* 3. Trialing */}
                <div className={`p-4 rounded-xl border transition ${
                  isLight
                    ? 'bg-white border-slate-200 shadow-sm hover:border-amber-400'
                    : 'bg-[#0f0e0c] border-[#1f1c19] hover:border-amber-500/40 shadow-lg'
                }`}>
                  <div className={`flex items-center justify-between text-xs font-semibold mb-2 ${
                    isLight ? 'text-slate-500' : 'text-zinc-400'
                  }`}>
                    <span>Trialing Accounts</span>
                    <Clock className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className={`text-2xl font-extrabold ${isLight ? 'text-amber-600' : 'text-amber-400'}`}>
                    {overview?.trialTenants ?? 0}
                  </div>
                  <div className={`mt-2 text-xs font-medium ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
                    Evaluation subscriptions
                  </div>
                </div>

                {/* 4. Suspended */}
                <div className={`p-4 rounded-xl border transition ${
                  isLight
                    ? 'bg-white border-slate-200 shadow-sm hover:border-rose-400'
                    : 'bg-[#0f0e0c] border-[#1f1c19] hover:border-rose-500/40 shadow-lg'
                }`}>
                  <div className={`flex items-center justify-between text-xs font-semibold mb-2 ${
                    isLight ? 'text-slate-500' : 'text-zinc-400'
                  }`}>
                    <span>Suspended</span>
                    <ShieldAlert className="w-4 h-4 text-rose-500" />
                  </div>
                  <div className={`text-2xl font-extrabold ${isLight ? 'text-rose-600' : 'text-rose-400'}`}>
                    {overview?.suspendedTenants ?? 0}
                  </div>
                  <div className={`mt-2 text-xs font-medium ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
                    Accounts paused by admin
                  </div>
                </div>

                {/* 5. Total Customer Users */}
                <div className={`p-4 rounded-xl border transition ${
                  isLight
                    ? 'bg-white border-slate-200 shadow-sm hover:border-amber-400'
                    : 'bg-[#0f0e0c] border-[#1f1c19] hover:border-amber-500/40 shadow-lg'
                }`}>
                  <div className={`flex items-center justify-between text-xs font-semibold mb-2 ${
                    isLight ? 'text-slate-500' : 'text-zinc-400'
                  }`}>
                    <span>Total Customer Users</span>
                    <Users className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className={`text-2xl font-extrabold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    {overview?.totalUsers ?? 0}
                  </div>
                  <div className={`mt-2 text-xs font-medium ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
                    {overview?.companyOwners ?? 0} Owners • {overview?.teamLeads ?? 0} Team Leads • {overview?.members ?? 0} Members
                  </div>
                </div>

                {/* 6. Seats Used */}
                <div className={`p-4 rounded-xl border transition ${
                  isLight
                    ? 'bg-white border-slate-200 shadow-sm hover:border-amber-400'
                    : 'bg-[#0f0e0c] border-[#1f1c19] hover:border-amber-500/40 shadow-lg'
                }`}>
                  <div className={`flex items-center justify-between text-xs font-semibold mb-2 ${
                    isLight ? 'text-slate-500' : 'text-zinc-400'
                  }`}>
                    <span>Seats Capacity & Utilization</span>
                    <UserCheck className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className={`text-2xl font-extrabold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    {overview?.totalUsers ?? 0} seats
                  </div>
                  <div className={`mt-2 text-xs font-medium ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
                    Active assigned user seats
                  </div>
                </div>

                {/* 7. Connected Devices */}
                <div className={`p-4 rounded-xl border transition ${
                  isLight
                    ? 'bg-white border-slate-200 shadow-sm hover:border-purple-400'
                    : 'bg-[#0f0e0c] border-[#1f1c19] hover:border-purple-500/40 shadow-lg'
                }`}>
                  <div className={`flex items-center justify-between text-xs font-semibold mb-2 ${
                    isLight ? 'text-slate-500' : 'text-zinc-400'
                  }`}>
                    <span>Connected Devices</span>
                    <Smartphone className="w-4 h-4 text-purple-500" />
                  </div>
                  <div className={`text-2xl font-extrabold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    {overview?.activeTelephonySockets ?? 0}
                  </div>
                  <div className={`mt-2 text-xs font-medium ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
                    {overview?.callsInProgress ?? 0} Live Call Sessions Active
                  </div>
                </div>

                {/* 8. Active Jobs */}
                <div className={`p-4 rounded-xl border transition ${
                  isLight
                    ? 'bg-white border-slate-200 shadow-sm hover:border-blue-400'
                    : 'bg-[#0f0e0c] border-[#1f1c19] hover:border-blue-500/40 shadow-lg'
                }`}>
                  <div className={`flex items-center justify-between text-xs font-semibold mb-2 ${
                    isLight ? 'text-slate-500' : 'text-zinc-400'
                  }`}>
                    <span>Active Automation Jobs</span>
                    <Activity className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className={`text-2xl font-extrabold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    {overview?.emailJobsRunning ?? 0}
                  </div>
                  <div className={`mt-2 text-xs font-medium ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
                    Email & background workers
                  </div>
                </div>
              </div>

              {/* Needs Attention Center */}
              <div className={`p-5 rounded-2xl border space-y-4 ${
                isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#0d0c0a] border-[#1c1917]'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    <h3 className={`text-sm font-bold tracking-wide uppercase ${isLight ? 'text-slate-900' : 'text-white'}`}>
                      NEEDS ATTENTION
                    </h3>
                  </div>
                  <span className={`text-xs font-medium ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
                    {attentionItems.length} items requiring intervention
                  </span>
                </div>

                {attentionItems.length === 0 ? (
                  <div className={`p-6 rounded-xl border text-center text-xs ${
                    isLight ? 'bg-slate-50 border-slate-200 text-slate-600' : 'bg-[#141210] border-[#27272a] text-zinc-400'
                  }`}>
                    <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-2" />
                    <span>All customer workspaces, seat quotas, and automation jobs are operating normally.</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {attentionItems.map((item) => (
                      <div
                        key={item.id}
                        className={`p-4 rounded-xl border flex flex-col justify-between transition ${
                          item.severity === 'critical'
                            ? (isLight ? 'bg-rose-50/70 border-rose-200' : 'bg-rose-950/20 border-rose-500/30')
                            : item.severity === 'warning'
                            ? (isLight ? 'bg-amber-50/70 border-amber-200' : 'bg-amber-950/20 border-amber-500/30')
                            : (isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#141210] border-[#27272a]')
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className={`text-xs font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{item.title}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                              item.severity === 'critical'
                                ? (isLight ? 'bg-rose-100 text-rose-700 border border-rose-200' : 'bg-rose-500/10 text-rose-400 border border-rose-500/30')
                                : item.severity === 'warning'
                                ? (isLight ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-amber-500/10 text-amber-400 border border-amber-500/30')
                                : (isLight ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-blue-500/10 text-blue-400 border border-blue-500/30')
                            }`}>
                              {item.severity}
                            </span>
                          </div>
                          <p className={`text-xs leading-relaxed ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>{item.description}</p>
                        </div>
                        {item.tenantId && (
                          <div className={`mt-3 pt-2.5 border-t flex justify-end ${isLight ? 'border-slate-200' : 'border-[#27272a]/50'}`}>
                            <button
                              onClick={() => {
                                fetchTenantDetail(item.tenantId!);
                                setDetailTab(item.title.includes('Seat') ? 'seats' : 'summary');
                              }}
                              className={`text-xs font-bold flex items-center gap-1 cursor-pointer transition ${
                                isLight ? 'text-amber-800 hover:text-amber-900' : 'text-amber-400 hover:text-amber-300'
                              }`}
                            >
                              <span>{item.actionLabel || 'Inspect'}</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Quick Actions & High-Value Activity */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Quick Actions Bar */}
                <div className={`p-5 rounded-2xl border space-y-3 ${
                  isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#0d0c0a] border-[#1c1917]'
                }`}>
                  <h3 className={`text-xs font-bold uppercase tracking-wider ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>
                    Quick Control Shortcuts
                  </h3>
                  <div className="space-y-2">
                    <button
                      onClick={() => setShowCreateModal(true)}
                      className={`w-full flex items-center justify-between p-3 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                        isLight
                          ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800'
                          : 'bg-[#141210] hover:bg-[#1a1815] border-[#27272a] text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Plus className="w-4 h-4 text-amber-500" />
                        <span>Provision New Workspace</span>
                      </div>
                      <ChevronRight className={`w-4 h-4 ${isLight ? 'text-slate-400' : 'text-zinc-500'}`} />
                    </button>

                    <button
                      onClick={() => { setActiveTab('workspaces'); setStatusFilter('suspended'); }}
                      className={`w-full flex items-center justify-between p-3 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                        isLight
                          ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800'
                          : 'bg-[#141210] hover:bg-[#1a1815] border-[#27272a] text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <ShieldAlert className="w-4 h-4 text-rose-500" />
                        <span>Review Suspended Accounts</span>
                      </div>
                      <ChevronRight className={`w-4 h-4 ${isLight ? 'text-slate-400' : 'text-zinc-500'}`} />
                    </button>

                    <button
                      onClick={() => setActiveTab('jobs')}
                      className={`w-full flex items-center justify-between p-3 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                        isLight
                          ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800'
                          : 'bg-[#141210] hover:bg-[#1a1815] border-[#27272a] text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Sliders className="w-4 h-4 text-blue-500" />
                        <span>Inspect Automation Health</span>
                      </div>
                      <ChevronRight className={`w-4 h-4 ${isLight ? 'text-slate-400' : 'text-zinc-500'}`} />
                    </button>
                  </div>
                </div>

                {/* Recent Activity Snapshot */}
                <div className={`lg:col-span-2 p-5 rounded-2xl border space-y-3 ${
                  isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#0d0c0a] border-[#1c1917]'
                }`}>
                  <div className="flex items-center justify-between">
                    <h3 className={`text-xs font-bold uppercase tracking-wider ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>
                      Recent High-Value Platform Activity
                    </h3>
                    <button
                      onClick={() => setActiveTab('activity')}
                      className={`text-xs font-semibold hover:underline cursor-pointer ${isLight ? 'text-amber-800' : 'text-amber-400'}`}
                    >
                      View All
                    </button>
                  </div>

                  <div className="space-y-2">
                    {activityList.slice(0, 5).map((act, idx) => (
                      <div
                        key={act.id || idx}
                        className={`p-2.5 rounded-xl border flex items-center justify-between text-xs ${
                          isLight
                            ? 'bg-slate-50 border-slate-200 text-slate-800'
                            : 'bg-[#141210] border-[#1c1917] text-zinc-200'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-2 h-2 rounded-full bg-amber-500" />
                          <div>
                            <span className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{act.action}</span>
                            <span className={`ml-2 ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
                              by {act.username || act.performedBy || 'system'}
                            </span>
                          </div>
                        </div>
                        <span className={`text-[11px] font-medium ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
                          {new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))}
                    {activityList.length === 0 && (
                      <div className={`text-center py-6 text-xs ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
                        No recent platform-level events recorded yet.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════
              SUBVIEW 2: WORKSPACES (Primary Data Table)
          ══════════════════════════════════════════════════════════════════════ */}
          {activeTab === 'workspaces' && (
            <div className="space-y-4">
              {/* Search & Filter Toolbar */}
              <div className={`p-4 rounded-xl border flex flex-col md:flex-row items-center justify-between gap-3 ${
                isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#0d0c0a] border-[#1c1917]'
              }`}>
                <div className="flex flex-1 items-center gap-3 w-full md:w-auto">
                  <div className="relative flex-1 max-w-md">
                    <Search className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 ${isLight ? 'text-slate-400' : 'text-zinc-500'}`} />
                    <input
                      type="text"
                      value={search}
                      onChange={e => { setSearch(e.target.value); setPage(1); }}
                      placeholder="Search company, owner name, email, workspace ID..."
                      className={`w-full border rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:border-amber-500 font-sans transition ${
                        isLight
                          ? 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:bg-white'
                          : 'bg-[#141210] border-[#27272a] text-white placeholder-zinc-500'
                      }`}
                    />
                  </div>

                  <select
                    value={statusFilter}
                    onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                    className={`border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500 font-sans font-medium cursor-pointer transition ${
                      isLight
                        ? 'bg-slate-50 border-slate-200 text-slate-800 focus:bg-white'
                        : 'bg-[#141210] border-[#27272a] text-zinc-300'
                    }`}
                  >
                    <option value="all">Status: All</option>
                    <option value="active">Active</option>
                    <option value="trial">Trialing</option>
                    <option value="suspended">Suspended</option>
                  </select>

                  <select
                    value={typeFilter}
                    onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
                    className={`border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500 font-sans font-medium cursor-pointer transition ${
                      isLight
                        ? 'bg-slate-50 border-slate-200 text-slate-800 focus:bg-white'
                        : 'bg-[#141210] border-[#27272a] text-zinc-300'
                    }`}
                  >
                    <option value="all">Type: All</option>
                    <option value="COMPANY">Company</option>
                    <option value="PERSONAL">Personal</option>
                  </select>

                  <select
                    value={planFilter}
                    onChange={e => { setPlanFilter(e.target.value); setPage(1); }}
                    className={`border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500 font-sans font-medium cursor-pointer transition ${
                      isLight
                        ? 'bg-slate-50 border-slate-200 text-slate-800 focus:bg-white'
                        : 'bg-[#141210] border-[#27272a] text-zinc-300'
                    }`}
                  >
                    <option value="all">Plan: All</option>
                    <option value="starter">Starter</option>
                    <option value="pro">Pro</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value)}
                    className={`border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500 font-sans font-medium cursor-pointer transition ${
                      isLight
                        ? 'bg-slate-50 border-slate-200 text-slate-800 focus:bg-white'
                        : 'bg-[#141210] border-[#27272a] text-zinc-300'
                    }`}
                  >
                    <option value="newest">Sort: Newest</option>
                    <option value="oldest">Sort: Oldest</option>
                    <option value="most_users">Sort: Most Users</option>
                    <option value="highest_seats">Sort: Highest Seat Usage</option>
                  </select>
                </div>
              </div>

              {/* Workspaces Table */}
              <div className={`rounded-xl border overflow-hidden shadow-xl ${
                isLight ? 'border-slate-200 bg-white' : 'border-[#1c1917] bg-[#0d0c0a]'
              }`}>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className={`border-b text-[10px] uppercase tracking-wider font-semibold ${
                        isLight ? 'border-slate-200 bg-slate-50 text-slate-600' : 'border-[#1c1917] bg-[#12110e] text-zinc-400'
                      }`}>
                        <th className="py-2 px-2.5 font-bold">Company / Workspace</th>
                        <th className="py-2 px-2.5 font-bold">Owner</th>
                        <th className="py-2 px-2 font-bold">Type</th>
                        <th className="py-2 px-2 font-bold">Plan</th>
                        <th className="py-2 px-2 font-bold">Users</th>
                        <th className="py-2 px-2 font-bold">Seats</th>
                        <th className="py-2 px-2 font-bold">Modules</th>
                        <th className="py-2 px-2 font-bold">Status</th>
                        <th className="py-2 px-2 font-bold">Created</th>
                        <th className="py-2 px-2.5 font-bold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isLight ? 'divide-slate-100' : 'divide-[#181614]'}`}>
                      {tenants.map((t: any) => {
                        const seatsUsed = t.totalUsers || 0;
                        const seatLimit = t.maxAgents || 10;
                        const isMaxed = seatsUsed >= seatLimit;
                        return (
                          <tr
                            key={t.id}
                            className={`transition group cursor-pointer ${
                              isLight ? 'hover:bg-slate-50/80 text-slate-800' : 'hover:bg-[#141210] text-slate-200'
                            }`}
                            onClick={() => { fetchTenantDetail(t.id); setDetailTab('summary'); }}
                          >
                            <td className="py-2 px-2.5">
                              <div className="flex items-center gap-2">
                                <div className={`w-7 h-7 rounded-lg border flex items-center justify-center font-bold text-xs shrink-0 ${
                                  isLight
                                    ? 'bg-amber-100 border-amber-300 text-amber-900'
                                    : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                                }`}>
                                  {t.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <div className={`font-bold transition leading-snug truncate max-w-[140px] xl:max-w-[180px] ${isLight ? 'text-slate-900 group-hover:text-amber-800' : 'text-white group-hover:text-amber-400'}`}>
                                    {t.name}
                                  </div>
                                  <div className={`text-[10px] font-mono leading-none truncate max-w-[140px] xl:max-w-[180px] ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>{t.slug}</div>
                                </div>
                              </div>
                            </td>

                            <td className="py-2 px-2.5">
                              <div className="min-w-0">
                                <div className={`font-semibold leading-snug truncate max-w-[130px] xl:max-w-[160px] ${isLight ? 'text-slate-900' : 'text-white'}`}>{t.primaryOwner?.username || '—'}</div>
                                <div className={`text-[10px] leading-none truncate max-w-[130px] xl:max-w-[160px] ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>{t.ownerEmail || t.primaryOwner?.email || '—'}</div>
                              </div>
                            </td>

                            <td className="py-2 px-2">
                              <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold tracking-wide ${
                                t.customerType === 'PERSONAL'
                                  ? (isLight ? 'bg-purple-100 text-purple-700 border border-purple-200' : 'bg-purple-500/10 text-purple-400 border border-purple-500/20')
                                  : (isLight ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20')
                              }`}>
                                {t.customerType || 'COMPANY'}
                              </span>
                            </td>

                            <td className="py-2 px-2">
                              <span className={`text-[11px] uppercase font-bold ${isLight ? 'text-amber-800' : 'text-amber-400'}`}>
                                {getDisplayPlan(t.tier || t.plan)}
                              </span>
                            </td>

                            <td className={`py-2 px-2 font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                              {seatsUsed}
                            </td>

                            <td className="py-2 px-2">
                              <div className="space-y-0.5 w-20">
                                <div className="flex items-center justify-between text-[10px]">
                                  <span className={`font-semibold ${
                                    isMaxed
                                      ? (isLight ? 'text-rose-600' : 'text-rose-400')
                                      : (isLight ? 'text-slate-600' : 'text-zinc-400')
                                  }`}>
                                    {seatsUsed} / {seatLimit}
                                  </span>
                                </div>
                                <div className={`w-full h-1.5 rounded-full overflow-hidden ${isLight ? 'bg-slate-200' : 'bg-[#27272a]'}`}>
                                  <div
                                    className={`h-full rounded-full transition-all ${
                                      isMaxed ? 'bg-rose-500' : (seatsUsed / seatLimit >= 0.8 ? 'bg-amber-500' : 'bg-emerald-500')
                                    }`}
                                    style={{ width: `${Math.min(100, Math.round((seatsUsed / seatLimit) * 100))}%` }}
                                  />
                                </div>
                              </div>
                            </td>

                            <td className="py-2 px-2 whitespace-nowrap">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                                isLight ? 'bg-slate-100 text-slate-800 border border-slate-200' : 'bg-zinc-900 text-zinc-200 border border-zinc-700/80 shadow-sm'
                              }`}>
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                                {CANONICAL_MODULES.filter(m => {
                                  if (Array.isArray(t.moduleEntitlements)) return t.moduleEntitlements.includes(m.id);
                                  if (t.moduleEntitlements && typeof t.moduleEntitlements === 'object') return Boolean((t.moduleEntitlements as Record<string, boolean>)[m.id]);
                                  return false;
                                }).length}/{CANONICAL_MODULES.length} Active
                              </span>
                            </td>

                            <td className="py-2 px-2 whitespace-nowrap">
                              {(t.status === 'trial' || t.isTrial) ? (
                                <div className="flex flex-col items-start gap-0.5">
                                  <div className="flex items-center gap-1">
                                    <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                                      isLight ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                                    }`}>
                                      <span className="relative flex h-1.5 w-1.5">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500"></span>
                                      </span>
                                      Trial
                                    </span>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setAdjustingTrialTenant(t); }}
                                      className={`text-[9px] px-1 py-0.2 rounded font-bold border transition cursor-pointer ${
                                        isLight ? 'bg-amber-100 hover:bg-amber-200 text-amber-950 border-amber-300' : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/40'
                                      }`}
                                      title="Adjust Trial Duration (Add / Reduce Time)"
                                    >
                                      ⏱️ Adjust
                                    </button>
                                  </div>
                                  <LiveTrialCountdown targetDate={t.trialEndsAt} className="text-[10px]" />
                                </div>
                              ) : t.status === 'active' ? (
                                <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                                  isLight ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                }`}>
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                  Active
                                </span>
                              ) : (
                                <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                                  isLight ? 'bg-rose-100 text-rose-800 border border-rose-200' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                }`}>
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                                  {t.status}
                                </span>
                              )}
                            </td>

                            <td className={`py-2 px-2 text-[11px] whitespace-nowrap ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
                              {new Date(t.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                            </td>

                            <td className="py-2.5 px-3.5 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1.5">
                                {(t.status === 'trial' || t.isTrial) && (
                                  <div className="inline-flex items-center rounded-lg border border-amber-500/30 overflow-hidden shadow-sm">
                                    <button
                                      onClick={() => handleAdjustTrial(t.id, 'add', 7, 0)}
                                      className={`px-2 py-1 text-xs font-bold transition cursor-pointer flex items-center gap-0.5 ${
                                        isLight
                                          ? 'bg-amber-50 hover:bg-amber-100 text-amber-900'
                                          : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400'
                                      }`}
                                      title="Quick Add +7 Days to Trial"
                                    >
                                      +7d
                                    </button>
                                    <button
                                      onClick={() => handleAdjustTrial(t.id, 'reduce', 1, 0)}
                                      className={`px-2 py-1 text-xs font-bold transition cursor-pointer border-l border-amber-500/30 flex items-center gap-0.5 ${
                                        isLight
                                          ? 'bg-rose-50 hover:bg-rose-100 text-rose-800'
                                          : 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400'
                                      }`}
                                      title="Quick Reduce -1 Day from Trial"
                                    >
                                      -1d
                                    </button>
                                    <button
                                      onClick={() => setAdjustingTrialTenant(t)}
                                      className={`px-2 py-1 text-xs font-bold transition cursor-pointer border-l border-amber-500/30 flex items-center gap-0.5 ${
                                        isLight
                                          ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                          : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                                      }`}
                                      title="Open Full Trial Time Controller (Add / Reduce / Custom)"
                                    >
                                      ⏱️ Time
                                    </button>
                                  </div>
                                )}

                                <button
                                  onClick={() => {
                                    setImpersonateTargetTenant(t);
                                    setImpersonateUserId(t.primaryOwner?.id || '');
                                    setShowImpersonateModal(true);
                                  }}
                                  className={`px-2.5 py-1 rounded-lg border text-xs font-bold transition cursor-pointer ${
                                    isLight
                                      ? 'bg-amber-50 hover:bg-amber-500 hover:text-slate-950 text-amber-800 border-amber-300'
                                      : 'bg-[#1a1815] hover:bg-amber-500 hover:text-black text-amber-400 border-amber-500/30'
                                  }`}
                                  title="Audited Impersonation"
                                >
                                  Impersonate
                                </button>

                                <button
                                  onClick={() => { fetchTenantDetail(t.id); setDetailTab('summary'); }}
                                  className={`px-2.5 py-1 rounded-lg border text-xs font-bold transition cursor-pointer ${
                                    isLight
                                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                                      : 'bg-[#141210] hover:bg-[#27272a] text-zinc-300 border-[#27272a]'
                                  }`}
                                >
                                  Manage
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {tenants.length === 0 && (
                        <tr>
                          <td colSpan={10} className={`py-8 text-center text-xs ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
                            No matching workspaces found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className={`p-3.5 border-t flex items-center justify-between text-xs font-medium ${
                  isLight ? 'bg-slate-50 border-slate-200 text-slate-600' : 'bg-[#12110e] border-[#1c1917] text-zinc-400'
                }`}>
                  <span>Showing {tenants.length} of {totalTenants} organizations</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      disabled={page <= 1}
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      className={`px-3 py-1 rounded-lg border font-semibold disabled:opacity-30 cursor-pointer transition ${
                        isLight
                          ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 shadow-sm'
                          : 'bg-[#1c1917] hover:bg-[#27272a] text-white border-transparent'
                      }`}
                    >
                      Prev
                    </button>
                    <span className="px-2 font-bold">{page} / {totalPages}</span>
                    <button
                      disabled={page >= totalPages}
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      className={`px-3 py-1 rounded-lg border font-semibold disabled:opacity-30 cursor-pointer transition ${
                        isLight
                          ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 shadow-sm'
                          : 'bg-[#1c1917] hover:bg-[#27272a] text-white border-transparent'
                      }`}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════
              SUBVIEW 3: USERS & ACCESS (Global Directory)
          ══════════════════════════════════════════════════════════════════════ */}
          {activeTab === 'users' && (
            <div className="space-y-6">

              {/* ══════════════════════════════════════════════════════════════════
                  👑 MASTER MOHSIN SUPERADMIN CONTROL — Suspend or Restore ANY User
                  ══════════════════════════════════════════════════════════════════ */}
              {isMasterSuperAdmin && (
                <div className="rounded-2xl border-2 border-amber-500/40 bg-amber-950/20 p-5 space-y-4 shadow-xl">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0">
                        <Crown className="w-5 h-5 text-amber-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-black text-amber-400 tracking-tight">
                            MASTER MOHSIN CONTROL — ALL PLATFORM ACCOUNTS
                          </h3>
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-500/20 border border-amber-500/40 text-amber-300 font-mono">
                            SUPERADMIN
                          </span>
                        </div>
                        <p className="text-xs text-zinc-400 mt-0.5">
                          Highest system authority. Suspend or restore ANY account across all platform admins and customer companies.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={fetchSuperadminUsers}
                      disabled={superUsersLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 text-xs font-bold cursor-pointer transition disabled:opacity-50 self-start sm:self-auto shrink-0"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${superUsersLoading ? 'animate-spin' : ''}`} />
                      <span>Refresh Accounts</span>
                    </button>
                  </div>

                  <div className="rounded-xl border border-amber-500/20 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-amber-950/40 border-b border-amber-500/20 text-[10px] uppercase tracking-wider text-amber-400 font-bold">
                            <th className="py-3 px-4">User</th>
                            <th className="py-3 px-4">Email</th>
                            <th className="py-3 px-4">Role Tier</th>
                            <th className="py-3 px-4">Status</th>
                            <th className="py-3 px-4">Workspace</th>
                            <th className="py-3 px-4 text-right">Superadmin Control</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-amber-500/10">
                          {superUsersLoading && allPlatformSuperUsers.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="py-6 text-center text-zinc-500 text-xs">
                                Loading platform accounts...
                              </td>
                            </tr>
                          ) : allPlatformSuperUsers.map((su: any) => {
                            const isSelf = su.username === 'master_mohsin7' || su.username === usernameDisplay;
                            const isActing = superActionLoadingId === su.id;
                            const isActive = (su.status || 'Active').toLowerCase() === 'active';
                            const isSuspended = (su.status || '').toLowerCase() === 'suspended';
                            const tierColor = su.role === 'superadmin'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                              : su.role === 'platform_admin'
                              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                              : su.role === 'admin'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : 'bg-zinc-800 text-zinc-300 border border-zinc-700';

                            return (
                              <tr key={su.id} className="hover:bg-amber-950/10 transition">
                                <td className="py-3 px-4">
                                  <span className="font-bold text-white flex items-center gap-1.5">
                                    {su.username}
                                    {isSelf && (
                                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/30 text-amber-300 border border-amber-500/50 font-mono">
                                        YOU
                                      </span>
                                    )}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-zinc-400 text-[11px] font-mono">{su.email || '—'}</td>
                                <td className="py-3 px-4">
                                  <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${tierColor}`}>
                                    {su.role}
                                  </span>
                                </td>
                                <td className="py-3 px-4">
                                  <span className={`text-[11px] font-bold ${
                                    isActive ? 'text-emerald-400' : isSuspended ? 'text-rose-400' : 'text-zinc-500'
                                  }`}>
                                    {su.status || 'Active'}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-zinc-400 text-[11px]">
                                  {su.tenantId ? (su.tenantId.slice(0, 14) + '…') : 'Platform Root'}
                                </td>
                                <td className="py-3 px-4 text-right">
                                  {isSelf || su.role === 'superadmin' ? (
                                    <span className="text-[10px] text-zinc-500 font-mono italic">Protected Master</span>
                                  ) : (
                                    <div className="flex items-center justify-end gap-2">
                                      {!isActive && (
                                        <button
                                          onClick={() => handleSuperadminToggleStatus(su, 'Active')}
                                          disabled={isActing}
                                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-emerald-950/60 border border-emerald-700 text-emerald-400 hover:bg-emerald-900/60 cursor-pointer transition disabled:opacity-50"
                                          title="Restore account to Active"
                                        >
                                          <UserCheck className="w-3 h-3" />
                                          {isActing ? '…' : 'Restore'}
                                        </button>
                                      )}
                                      {!isSuspended && (
                                        <button
                                          onClick={() => handleSuperadminToggleStatus(su, 'Suspended')}
                                          disabled={isActing}
                                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-rose-950/60 border border-rose-700/70 text-rose-400 hover:bg-rose-900/60 cursor-pointer transition disabled:opacity-50"
                                          title="Suspend account immediately"
                                        >
                                          <Ban className="w-3 h-3" />
                                          {isActing ? '…' : 'Suspend / Stop'}
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Search Toolbar */}
              <div className={`p-4 rounded-xl border flex flex-col md:flex-row items-center justify-between gap-3 ${
                isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#0d0c0a] border-[#1c1917]'
              }`}>
                <div className="flex flex-1 items-center gap-3 w-full md:w-auto">
                  <div className="relative flex-1 max-w-md">
                    <Search className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 ${isLight ? 'text-slate-400' : 'text-zinc-500'}`} />
                    <input
                      type="text"
                      value={userSearch}
                      onChange={e => setUserSearch(e.target.value)}
                      placeholder="Search users by name, username, email, workspace..."
                      className={`w-full border rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:border-amber-500 font-sans transition ${
                        isLight
                          ? 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:bg-white'
                          : 'bg-[#141210] border-[#27272a] text-white placeholder-zinc-500'
                      }`}
                    />
                  </div>

                  <select
                    value={userRoleFilter}
                    onChange={e => setUserRoleFilter(e.target.value)}
                    className={`border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500 font-sans font-medium cursor-pointer transition ${
                      isLight
                        ? 'bg-slate-50 border-slate-200 text-slate-800 focus:bg-white'
                        : 'bg-[#141210] border-[#27272a] text-zinc-300'
                    }`}
                  >
                    <option value="all">Role: All</option>
                    <option value="admin">Company Owner</option>
                    <option value="team_lead">Team Lead</option>
                    <option value="user">Member Agent</option>
                  </select>

                  <select
                    value={userStatusFilter}
                    onChange={e => setUserStatusFilter(e.target.value)}
                    className={`border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500 font-sans font-medium cursor-pointer transition ${
                      isLight
                        ? 'bg-slate-50 border-slate-200 text-slate-800 focus:bg-white'
                        : 'bg-[#141210] border-[#27272a] text-zinc-300'
                    }`}
                  >
                    <option value="all">Status: All</option>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>

                <div className={`text-xs font-semibold ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
                  {globalUsers.length} customer user accounts indexed
                </div>
              </div>

              {/* Users Table */}
              <div className={`rounded-xl border overflow-hidden shadow-xl ${
                isLight ? 'border-slate-200 bg-white' : 'border-[#1c1917] bg-[#0d0c0a]'
              }`}>
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className={`border-b text-[11px] uppercase tracking-wider font-semibold ${
                      isLight ? 'border-slate-200 bg-slate-50 text-slate-600' : 'border-[#1c1917] bg-[#12110e] text-zinc-400'
                    }`}>
                      <th className="py-3.5 px-4 font-bold">User</th>
                      <th className="py-3.5 px-4 font-bold">Email</th>
                      <th className="py-3.5 px-4 font-bold">Workspace</th>
                      <th className="py-3.5 px-4 font-bold">Role</th>
                      <th className="py-3.5 px-4 font-bold">Team</th>
                      <th className="py-3.5 px-4 font-bold">Status</th>
                      <th className="py-3.5 px-4 font-bold">Assigned Modules</th>
                      <th className="py-3.5 px-4 font-bold">Created</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isLight ? 'divide-slate-100' : 'divide-[#181614]'}`}>
                    {globalUsers.map((u: any) => (
                      <tr key={u.id} className={`transition ${
                        isLight ? 'hover:bg-slate-50/80 text-slate-800' : 'hover:bg-[#141210] text-slate-200'
                      }`}>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-8 h-8 rounded-xl border flex items-center justify-center font-bold text-xs shrink-0 ${
                              isLight
                                ? 'bg-amber-100 border-amber-300 text-amber-900'
                                : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                            }`}>
                              {u.username.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{u.displayName || u.username}</div>
                              <div className={`text-[11px] font-sans ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>@{u.username}</div>
                            </div>
                          </div>
                        </td>

                        <td className={`py-3.5 px-4 font-sans ${isLight ? 'text-slate-600' : 'text-zinc-300'}`}>
                          {u.email}
                        </td>

                        <td className="py-3.5 px-4 font-semibold">
                          <button
                            onClick={() => { fetchTenantDetail(u.tenantId); setDetailTab('summary'); }}
                            className={`transition text-left cursor-pointer hover:underline ${
                              isLight ? 'text-slate-900 hover:text-amber-800' : 'text-white hover:text-amber-400'
                            }`}
                          >
                            {u.tenantName}
                          </button>
                        </td>

                        <td className="py-3.5 px-4">
                          <span className={`text-[11px] px-2.5 py-0.5 rounded-md font-bold ${
                            u.role === 'admin'
                              ? (isLight ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20')
                              : u.role === 'team_lead'
                              ? (isLight ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20')
                              : (isLight ? 'bg-slate-100 text-slate-700 border border-slate-200' : 'bg-zinc-800 text-zinc-300')
                          }`}>
                            {u.roleDisplay}
                          </span>
                        </td>

                        <td className={`py-3.5 px-4 text-xs ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>
                          {u.teamDisplay}
                        </td>

                        <td className="py-3.5 px-4">
                          <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold uppercase ${
                            isLight
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          }`}>
                            {u.status}
                          </span>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {(u.modules || []).map((m: string) => (
                              <span key={m} className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                                isLight
                                  ? 'bg-slate-100 text-slate-700 border border-slate-200'
                                  : 'bg-[#1c1917] text-zinc-400 border border-[#27272a]'
                              }`}>
                                {m}
                              </span>
                            ))}
                          </div>
                        </td>

                        <td className={`py-3.5 px-4 text-xs ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
                          {new Date(u.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                    {globalUsers.length === 0 && (
                      <tr>
                        <td colSpan={8} className={`py-8 text-center text-xs ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
                          No matching customer users found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════
              SUBVIEW 4: DEVICES & TELEPHONY
          ══════════════════════════════════════════════════════════════════════ */}
          {activeTab === 'devices' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                <div className={`p-4 rounded-xl border transition ${
                  isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#0f0e0c] border-[#1f1c19]'
                }`}>
                  <div className={`text-xs font-semibold ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>Registered Handsets</div>
                  <div className={`text-2xl font-extrabold mt-1 ${isLight ? 'text-slate-900' : 'text-white'}`}>{devicesList.length}</div>
                  <div className={`text-xs font-medium mt-1 ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>Platform-wide GSM phones</div>
                </div>

                <div className={`p-4 rounded-xl border transition ${
                  isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#0f0e0c] border-[#1f1c19]'
                }`}>
                  <div className={`text-xs font-semibold ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>Online Sockets</div>
                  <div className={`text-2xl font-extrabold mt-1 ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`}>
                    {devicesList.filter((d: any) => d.isSocketConnected).length}
                  </div>
                  <div className={`text-xs font-medium mt-1 ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>Ready for outbound dispatch</div>
                </div>

                <div className={`p-4 rounded-xl border transition ${
                  isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#0f0e0c] border-[#1f1c19]'
                }`}>
                  <div className={`text-xs font-semibold ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>Live Cellular Calls</div>
                  <div className={`text-2xl font-extrabold mt-1 ${isLight ? 'text-purple-600' : 'text-purple-400'}`}>
                    {devicesList.filter((d: any) => !!d.activeCall).length}
                  </div>
                  <div className={`text-xs font-medium mt-1 ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>GSM voice channels occupied</div>
                </div>
              </div>

              <div className={`rounded-xl border overflow-hidden shadow-xl ${
                isLight ? 'border-slate-200 bg-white' : 'border-[#1c1917] bg-[#0d0c0a]'
              }`}>
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className={`border-b text-[11px] uppercase tracking-wider font-semibold ${
                      isLight ? 'border-slate-200 bg-slate-50 text-slate-600' : 'border-[#1c1917] bg-[#12110e] text-zinc-400'
                    }`}>
                      <th className="py-3.5 px-4 font-bold">Device</th>
                      <th className="py-3.5 px-4 font-bold">Workspace</th>
                      <th className="py-3.5 px-4 font-bold">Platform & Version</th>
                      <th className="py-3.5 px-4 font-bold">Socket State</th>
                      <th className="py-3.5 px-4 font-bold">Active Call</th>
                      <th className="py-3.5 px-4 font-bold">Last Seen</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isLight ? 'divide-slate-100' : 'divide-[#181614]'}`}>
                    {devicesList.map((d: any) => (
                      <tr key={d.id} className={`transition ${
                        isLight ? 'hover:bg-slate-50/80 text-slate-800' : 'hover:bg-[#141210] text-slate-200'
                      }`}>
                        <td className="py-3.5 px-4 font-bold flex items-center gap-2">
                          <Smartphone className="w-4 h-4 text-amber-500" />
                          <span className={isLight ? 'text-slate-900' : 'text-white'}>{d.name || d.id}</span>
                        </td>
                        <td className={`py-3.5 px-4 font-sans ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>
                          {d.tenantId || '—'}
                        </td>
                        <td className={`py-3.5 px-4 ${isLight ? 'text-slate-600' : 'text-zinc-300'}`}>
                          {d.platform || 'Android'} • v{d.appVersion || '1.0.0'}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold uppercase ${
                            d.isSocketConnected
                              ? (isLight ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20')
                              : (isLight ? 'bg-slate-100 text-slate-600 border border-slate-200' : 'bg-zinc-800 text-zinc-400')
                          }`}>
                            {d.isSocketConnected ? 'CONNECTED' : 'DISCONNECTED'}
                          </span>
                        </td>
                        <td className={`py-3.5 px-4 font-bold ${d.activeCall ? (isLight ? 'text-purple-700' : 'text-purple-400') : (isLight ? 'text-slate-400' : 'text-zinc-500')}`}>
                          {d.activeCall ? `Active Call #${d.activeCall}` : 'Idle'}
                        </td>
                        <td className={`py-3.5 px-4 text-xs ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
                          {d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : 'Never'}
                        </td>
                      </tr>
                    ))}
                    {devicesList.length === 0 && (
                      <tr>
                        <td colSpan={6} className={`py-8 text-center text-xs ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
                          No telephony devices currently registered.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════
              SUBVIEW 5: AUTOMATION & JOBS
          ══════════════════════════════════════════════════════════════════════ */}
          {activeTab === 'jobs' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                <div className={`p-4 rounded-xl border transition ${
                  isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#0f0e0c] border-[#1f1c19]'
                }`}>
                  <div className={`text-xs font-semibold ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>Running Automation Workers</div>
                  <div className={`text-2xl font-extrabold mt-1 ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`}>
                    {jobsData?.summary?.totalRunning || 0}
                  </div>
                  <div className={`text-xs font-medium mt-1 ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>Workers actively processing tasks</div>
                </div>

                <div className={`p-4 rounded-xl border transition ${
                  isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#0f0e0c] border-[#1f1c19]'
                }`}>
                  <div className={`text-xs font-semibold ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>Email Queue Jobs</div>
                  <div className={`text-2xl font-extrabold mt-1 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    {jobsData?.jobs?.emailer?.length || 0}
                  </div>
                  <div className={`text-xs font-medium mt-1 ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>Tenant drip email workers</div>
                </div>

                <div className={`p-4 rounded-xl border transition ${
                  isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#0f0e0c] border-[#1f1c19]'
                }`}>
                  <div className={`text-xs font-semibold ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>Failed / Warning Jobs</div>
                  <div className={`text-2xl font-extrabold mt-1 ${isLight ? 'text-rose-600' : 'text-rose-400'}`}>
                    {jobsData?.summary?.totalFailed || 0}
                  </div>
                  <div className={`text-xs font-medium mt-1 ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>0 fatal exceptions</div>
                </div>
              </div>

              <div className={`rounded-xl border overflow-hidden shadow-xl ${
                isLight ? 'border-slate-200 bg-white' : 'border-[#1c1917] bg-[#0d0c0a]'
              }`}>
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className={`border-b text-[11px] uppercase tracking-wider font-semibold ${
                      isLight ? 'border-slate-200 bg-slate-50 text-slate-600' : 'border-[#1c1917] bg-[#12110e] text-zinc-400'
                    }`}>
                      <th className="py-3.5 px-4 font-bold">Job Worker</th>
                      <th className="py-3.5 px-4 font-bold">Workspace</th>
                      <th className="py-3.5 px-4 font-bold">Module</th>
                      <th className="py-3.5 px-4 font-bold">Status</th>
                      <th className="py-3.5 px-4 font-bold">Logs Count</th>
                      <th className="py-3.5 px-4 font-bold">Recent Result / Log</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isLight ? 'divide-slate-100' : 'divide-[#181614]'}`}>
                    {(jobsData?.jobs?.emailer || []).map((j: any) => (
                      <tr key={j.jobId} className={`transition ${
                        isLight ? 'hover:bg-slate-50/80 text-slate-800' : 'hover:bg-[#141210] text-slate-200'
                      }`}>
                        <td className={`py-3.5 px-4 font-sans font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                          {j.jobId}
                        </td>
                        <td className={`py-3.5 px-4 font-sans ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>
                          {j.tenantId}
                        </td>
                        <td className={`py-3.5 px-4 font-semibold ${isLight ? 'text-amber-800' : 'text-amber-400'}`}>
                          Email Manager
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold uppercase ${
                            j.status === 'running'
                              ? (isLight ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20')
                              : (isLight ? 'bg-slate-100 text-slate-600 border border-slate-200' : 'bg-zinc-800 text-zinc-400')
                          }`}>
                            {j.status}
                          </span>
                        </td>
                        <td className={`py-3.5 px-4 ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>
                          {j.logsCount} entries
                        </td>
                        <td className={`py-3.5 px-4 text-xs ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>
                          {j.logs && j.logs.length > 0 ? j.logs[j.logs.length - 1] : 'Idle. Awaiting queued recipient batches.'}
                        </td>
                      </tr>
                    ))}
                    {(!jobsData?.jobs?.emailer || jobsData.jobs.emailer.length === 0) && (
                      <tr>
                        <td colSpan={6} className={`py-8 text-center text-xs ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
                          No automation workers currently active.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════
              SUBVIEW 6: PLATFORM ACTIVITY
          ══════════════════════════════════════════════════════════════════════ */}
          {activeTab === 'activity' && (
            <div className="space-y-4">
              <div className={`rounded-xl border overflow-hidden shadow-xl ${
                isLight ? 'border-slate-200 bg-white' : 'border-[#1c1917] bg-[#0d0c0a]'
              }`}>
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className={`border-b text-[11px] uppercase tracking-wider font-semibold ${
                      isLight ? 'border-slate-200 bg-slate-50 text-slate-600' : 'border-[#1c1917] bg-[#12110e] text-zinc-400'
                    }`}>
                      <th className="py-3.5 px-4 font-bold">Timestamp</th>
                      <th className="py-3.5 px-4 font-bold">Action</th>
                      <th className="py-3.5 px-4 font-bold">Actor</th>
                      <th className="py-3.5 px-4 font-bold">Target Workspace</th>
                      <th className="py-3.5 px-4 font-bold">Payload & Parameters</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isLight ? 'divide-slate-100' : 'divide-[#181614]'}`}>
                    {activityList.map((act: any) => (
                      <tr key={act.id} className={`transition ${
                        isLight ? 'hover:bg-slate-50/80 text-slate-800' : 'hover:bg-[#141210] text-slate-200'
                      }`}>
                        <td className={`py-3.5 px-4 text-xs ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
                          {new Date(act.timestamp).toLocaleString()}
                        </td>
                        <td className={`py-3.5 px-4 font-bold ${isLight ? 'text-amber-800' : 'text-amber-400'}`}>
                          {act.action}
                        </td>
                        <td className={`py-3.5 px-4 font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                          {act.username || act.performedBy || 'system'}
                        </td>
                        <td className={`py-3.5 px-4 font-sans ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>
                          {act.tenantId || '—'}
                        </td>
                        <td className={`py-3.5 px-4 text-xs max-w-md truncate ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>
                          {act.details || '—'}
                        </td>
                      </tr>
                    ))}
                    {activityList.length === 0 && (
                      <tr>
                        <td colSpan={5} className={`py-8 text-center text-xs ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
                          No audit entries recorded.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════
              SUBVIEW 7: SYSTEM HEALTH
          ══════════════════════════════════════════════════════════════════════ */}
          {activeTab === 'health' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Database Health */}
                <div className={`p-4 rounded-xl border transition ${
                  isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#0f0e0c] border-[#1f1c19]'
                }`}>
                  <div className={`flex items-center justify-between mb-2 text-xs font-semibold ${
                    isLight ? 'text-slate-500' : 'text-zinc-400'
                  }`}>
                    <span>PostgreSQL Database</span>
                    <Database className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className={`text-xl font-extrabold ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`}>
                    {systemHealth?.database?.status?.toUpperCase() || 'OPERATIONAL'}
                  </div>
                  <div className={`mt-2 text-xs font-medium ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
                    Latency: {systemHealth?.database?.latencyMs ?? 1}ms response
                  </div>
                </div>

                {/* API & Engine */}
                <div className={`p-4 rounded-xl border transition ${
                  isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#0f0e0c] border-[#1f1c19]'
                }`}>
                  <div className={`flex items-center justify-between mb-2 text-xs font-semibold ${
                    isLight ? 'text-slate-500' : 'text-zinc-400'
                  }`}>
                    <span>Node.js API Engine</span>
                    <Cpu className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className={`text-xl font-extrabold ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`}>
                    OPERATIONAL
                  </div>
                  <div className={`mt-2 text-xs font-medium ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
                    Uptime: {Math.floor((systemHealth?.uptimeSeconds || 0) / 60)} minutes
                  </div>
                </div>

                {/* Realtime Sockets */}
                <div className={`p-4 rounded-xl border transition ${
                  isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#0f0e0c] border-[#1f1c19]'
                }`}>
                  <div className={`flex items-center justify-between mb-2 text-xs font-semibold ${
                    isLight ? 'text-slate-500' : 'text-zinc-400'
                  }`}>
                    <span>Socket.IO Gateway</span>
                    <Radio className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className={`text-xl font-extrabold ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`}>
                    OPERATIONAL
                  </div>
                  <div className={`mt-2 text-xs font-medium ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
                    {systemHealth?.realtime?.connectedClients ?? 0} active socket connections
                  </div>
                </div>

                {/* Process Memory */}
                <div className={`p-4 rounded-xl border transition ${
                  isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#0f0e0c] border-[#1f1c19]'
                }`}>
                  <div className={`flex items-center justify-between mb-2 text-xs font-semibold ${
                    isLight ? 'text-slate-500' : 'text-zinc-400'
                  }`}>
                    <span>Process Memory (RSS)</span>
                    <Activity className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className={`text-xl font-extrabold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    {systemHealth?.memory?.rssMb ?? 0} MB
                  </div>
                  <div className={`mt-2 text-xs font-medium ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
                    Heap: {systemHealth?.memory?.heapUsedMb ?? 0} / {systemHealth?.memory?.heapTotalMb ?? 0} MB
                  </div>
                </div>
              </div>

              {/* Infrastructure Summary Table */}
              <div className={`p-5 rounded-2xl border space-y-3 ${
                isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#0d0c0a] border-[#1c1917]'
              }`}>
                <h3 className={`text-xs font-bold uppercase tracking-wider ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>
                  Operational Component Inspection
                </h3>
                <div className="space-y-2">
                  <div className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
                    isLight ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-[#141210] border-[#27272a] text-white'
                  }`}>
                    <div className="flex items-center gap-2.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="font-bold">PostgreSQL Multi-Tenant Storage Layer</span>
                    </div>
                    <span className={`font-semibold ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>100% Operational • Zero Leaks</span>
                  </div>

                  <div className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
                    isLight ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-[#141210] border-[#27272a] text-white'
                  }`}>
                    <div className="flex items-center gap-2.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="font-bold">Dual-SIM Telephony Socket Gateway</span>
                    </div>
                    <span className={`font-semibold ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>Ready • GSM Call Dispatch Latency &lt;5ms</span>
                  </div>

                  <div className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
                    isLight ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-[#141210] border-[#27272a] text-white'
                  }`}>
                    <div className="flex items-center gap-2.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="font-bold">Background Automation Workers</span>
                    </div>
                    <span className={`font-semibold ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>Active • 0 Faults</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          WORKSPACE COMMAND CENTER DRAWER / DETAIL VIEW
      ══════════════════════════════════════════════════════════════════════ */}
      {selectedTenantId && tenantDetail && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-end animate-fade-in">
          <div className={`w-full max-w-4xl border-l h-full flex flex-col shadow-2xl overflow-hidden transition-colors ${
            isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#0d0c0a] border-[#1c1917] text-slate-100'
          }`}>
            {/* Command Center Header */}
            <div className={`p-6 border-b flex flex-col gap-4 ${
              isLight ? 'border-slate-200 bg-slate-50' : 'border-[#1c1917] bg-[#090807]'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl border flex items-center justify-center font-bold text-sm ${
                    isLight ? 'bg-amber-100 border-amber-300 text-amber-900' : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  }`}>
                    {tenantDetail.overview?.name?.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className={`text-lg font-extrabold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                        {tenantDetail.overview?.name}
                      </h2>
                      <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold uppercase ${
                        (tenantDetail.overview?.status === 'trial' || tenantDetail.subscription?.status === 'trialing' || tenantDetail.overview?.isTrial)
                          ? (isLight ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-amber-500/15 text-amber-400 border border-amber-500/30')
                          : tenantDetail.overview?.status === 'active'
                          ? (isLight ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20')
                          : (isLight ? 'bg-rose-100 text-rose-800 border border-rose-200' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20')
                      }`}>
                        {(tenantDetail.overview?.status === 'trial' || tenantDetail.subscription?.status === 'trialing' || tenantDetail.overview?.isTrial) ? 'TRIAL' : tenantDetail.overview?.status}
                      </span>
                      <span className={`text-[11px] px-2.5 py-0.5 rounded-md font-bold uppercase ${
                        isLight ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                      }`}>
                        {tenantDetail.overview?.customerType || 'COMPANY'}
                      </span>
                    </div>
                    <div className={`text-xs mt-0.5 flex items-center gap-2 ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
                      <span className="font-sans">Slug: {tenantDetail.overview?.slug}</span>
                      <span>•</span>
                      <span className="font-sans">ID: {tenantDetail.overview?.id}</span>
                      <button
                        onClick={() => copyToClipboard(tenantDetail.overview?.id, 'drawer_tenant_id')}
                        className={`inline-flex items-center gap-1 text-[11px] font-semibold transition ${
                          isLight ? 'text-slate-500 hover:text-amber-800' : 'text-zinc-400 hover:text-amber-400'
                        }`}
                        title="Copy Workspace ID"
                      >
                        {copiedId === 'drawer_tenant_id' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedId === 'drawer_tenant_id' ? 'Copied' : 'Copy'}</span>
                      </button>
                      {detailLoading && (
                        <>
                          <span>•</span>
                          <span className="text-amber-500 inline-flex items-center gap-1 font-semibold">
                            <RefreshCw className="w-3 h-3 animate-spin" /> Syncing
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => { setSelectedTenantId(null); setTenantDetail(null); }}
                  className={`p-2 rounded-xl transition cursor-pointer ${
                    isLight
                      ? 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 shadow-sm'
                      : 'bg-[#141210] hover:bg-[#27272a] text-zinc-400 hover:text-white'
                  }`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Action Buttons Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setImpersonateTargetTenant(tenantDetail.overview);
                      const primaryOwner = tenantDetail.organization?.users?.find((u: any) => u.role === 'admin');
                      setImpersonateUserId(primaryOwner?.id || '');
                      setShowImpersonateModal(true);
                    }}
                    className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 transition cursor-pointer"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Impersonate Support</span>
                  </button>

                  <button
                    onClick={() => {
                      setNewSeatLimit(tenantDetail.overview?.maxAgents || 10);
                      setShowSeatModal(true);
                    }}
                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                      isLight
                        ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 shadow-sm'
                        : 'bg-[#141210] hover:bg-[#27272a] text-zinc-200 border-[#27272a]'
                    }`}
                  >
                    <UserCheck className="w-3.5 h-3.5 text-amber-500" />
                    <span>Edit Seat Limits</span>
                  </button>

                  <button
                    onClick={() => {
                      setTargetSuspendTenant(tenantDetail.overview);
                      setSuspendReason('Administrative intervention');
                      setShowSuspendModal(true);
                    }}
                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                      tenantDetail.overview?.status === 'active'
                        ? (isLight ? 'bg-rose-100 hover:bg-rose-200 text-rose-800 border-rose-300' : 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border-rose-500/30')
                        : (isLight ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border-emerald-300' : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30')
                    }`}
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>{tenantDetail.overview?.status === 'active' ? 'Suspend Workspace' : 'Reactivate Workspace'}</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <div className={`text-xs font-medium ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
                    Plan: <span className={`font-bold uppercase ${isLight ? 'text-amber-800' : 'text-amber-400'}`}>{getDisplayPlan(tenantDetail.overview?.tier || tenantDetail.subscription?.planId)}</span>
                  </div>
                  <button
                    onClick={() => {
                      setUpdatingPlanTenant(tenantDetail.overview);
                      setSelectedNewPlan((tenantDetail.overview?.tier || tenantDetail.subscription?.planId || 'starter').toLowerCase().replace(/^plan_/, ''));
                    }}
                    className={`text-[10px] px-2 py-0.5 rounded font-bold border transition cursor-pointer ${
                      isLight ? 'bg-amber-100 hover:bg-amber-200 text-amber-950 border-amber-300' : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30'
                    }`}
                    title="Change Workspace Commercial Plan"
                  >
                    Change Plan
                  </button>
                </div>
              </div>

              {/* Sub-Navigation Tabs */}
              <div className={`flex items-center gap-1 overflow-x-auto border-t pt-3 ${
                isLight ? 'border-slate-200' : 'border-[#1c1917]'
              }`}>
                {[
                  { id: 'summary' as DetailTab, label: 'Overview' },
                  { id: 'users' as DetailTab, label: `Users (${tenantDetail.organization?.users?.length || 0})` },
                  { id: 'teams' as DetailTab, label: `Teams (${tenantDetail.organization?.teams?.length || 0})` },
                  { id: 'matrix' as DetailTab, label: 'Access Matrix' },
                  { id: 'entitlements' as DetailTab, label: 'Module Ceiling' },
                  { id: 'seats' as DetailTab, label: 'Seats & Quotas' },
                  { id: 'devices' as DetailTab, label: `Devices (${tenantDetail.connectedDevices?.devices?.length || 0})` },
                  { id: 'activity' as DetailTab, label: 'Audit Trail' }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setDetailTab(tab.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                      detailTab === tab.id
                        ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                        : isLight
                        ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-medium'
                        : 'text-zinc-400 hover:text-white hover:bg-[#141210] font-medium'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Command Center Body */}
            <div className={`flex-1 overflow-y-auto p-6 space-y-6 ${isLight ? 'bg-slate-50' : 'bg-[#080706]'}`}>
              {/* TAB 1: SUMMARY / OVERVIEW */}
              {detailTab === 'summary' && (
                <div className="space-y-6">
                  {/* Trial Lifecycle Card */}
                  {(tenantDetail.overview?.status === 'trial' || tenantDetail.subscription?.status === 'trialing') && (
                    <div className={`p-4 rounded-xl border space-y-3 ${
                      isLight ? 'bg-amber-50/60 border-amber-200 shadow-sm text-slate-800' : 'bg-[#181512] border-amber-500/30'
                    }`}>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-amber-500/20">
                        <div className="flex items-center gap-2">
                          <span className="p-1.5 rounded-lg bg-amber-500/20 text-amber-500">
                            <Clock className="w-4 h-4" />
                          </span>
                          <div>
                            <div className="text-xs font-bold uppercase tracking-wider text-amber-500">Live Trial Lifecycle</div>
                            <div className={`text-xs ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>
                              Expires: <span className="font-semibold">{new Date(tenantDetail.subscription?.trialEndsAt || tenantDetail.subscription?.currentPeriodEnd || tenantDetail.overview?.createdAt).toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <LiveTrialCountdown targetDate={tenantDetail.subscription?.trialEndsAt || tenantDetail.subscription?.currentPeriodEnd} className="text-sm font-extrabold" />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <span className={`text-xs font-bold ${isLight ? 'text-slate-700' : 'text-zinc-300'}`}>Quick Add Time:</span>
                        <button
                          onClick={() => handleAdjustTrial(tenantDetail.overview.id, 'add', 1, 0)}
                          disabled={trialActionLoading}
                          className="px-2.5 py-1 text-xs font-bold rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition cursor-pointer"
                        >
                          +1 Day
                        </button>
                        <button
                          onClick={() => handleAdjustTrial(tenantDetail.overview.id, 'add', 3, 0)}
                          disabled={trialActionLoading}
                          className="px-2.5 py-1 text-xs font-bold rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition cursor-pointer"
                        >
                          +3 Days
                        </button>
                        <button
                          onClick={() => handleAdjustTrial(tenantDetail.overview.id, 'add', 7, 0)}
                          disabled={trialActionLoading}
                          className="px-2.5 py-1 text-xs font-bold rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition cursor-pointer"
                        >
                          +7 Days
                        </button>
                        <button
                          onClick={() => handleAdjustTrial(tenantDetail.overview.id, 'add', 14, 0)}
                          disabled={trialActionLoading}
                          className="px-2.5 py-1 text-xs font-bold rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition cursor-pointer"
                        >
                          +14 Days
                        </button>

                        <div className="h-4 w-px bg-zinc-700 mx-1 hidden sm:block"></div>

                        <span className={`text-xs font-bold ${isLight ? 'text-slate-700' : 'text-zinc-300'}`}>Quick Reduce:</span>
                        <button
                          onClick={() => handleAdjustTrial(tenantDetail.overview.id, 'reduce', 1, 0)}
                          disabled={trialActionLoading}
                          className="px-2.5 py-1 text-xs font-bold rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition cursor-pointer"
                        >
                          -1 Day
                        </button>
                        <button
                          onClick={() => handleAdjustTrial(tenantDetail.overview.id, 'reduce', 3, 0)}
                          disabled={trialActionLoading}
                          className="px-2.5 py-1 text-xs font-bold rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition cursor-pointer"
                        >
                          -3 Days
                        </button>
                        <button
                          onClick={() => handleAdjustTrial(tenantDetail.overview.id, 'reduce', 7, 0)}
                          disabled={trialActionLoading}
                          className="px-2.5 py-1 text-xs font-bold rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition cursor-pointer"
                        >
                          -7 Days
                        </button>
                        <button
                          onClick={() => handleAdjustTrial(tenantDetail.overview.id, 'expire_now')}
                          disabled={trialActionLoading}
                          className="px-2.5 py-1 text-xs font-bold rounded-lg bg-red-600 hover:bg-red-500 text-white shadow-sm transition cursor-pointer"
                        >
                          🚨 Expire Now
                        </button>

                        <button
                          onClick={() => setAdjustingTrialTenant({ id: tenantDetail.overview.id, name: tenantDetail.overview.name, trialEndsAt: tenantDetail.subscription?.trialEndsAt || tenantDetail.subscription?.currentPeriodEnd })}
                          className={`ml-auto px-3 py-1 text-xs font-bold rounded-lg border transition cursor-pointer ${
                            isLight ? 'bg-amber-100 hover:bg-amber-200 text-amber-950 border-amber-300' : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/40'
                          }`}
                        >
                          Custom Adjust ⏱️
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Summary Grid */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className={`p-4 rounded-xl border space-y-2 ${
                      isLight ? 'bg-white border-slate-200 shadow-sm text-slate-800' : 'bg-[#141210] border-[#27272a]'
                    }`}>
                      <div className={`text-xs font-bold uppercase ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>Workspace Identity</div>
                      <div className="text-xs space-y-1.5">
                        <div className="flex justify-between"><span className={isLight ? 'text-slate-500' : 'text-zinc-500'}>Owner Email:</span> <span className={`font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>{tenantDetail.overview?.ownerEmail || '—'}</span></div>
                        <div className="flex justify-between"><span className={isLight ? 'text-slate-500' : 'text-zinc-500'}>Customer Type:</span> <span className={`font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>{tenantDetail.overview?.customerType || 'COMPANY'}</span></div>
                        <div className="flex justify-between"><span className={isLight ? 'text-slate-500' : 'text-zinc-500'}>Created Date:</span> <span className={`font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>{new Date(tenantDetail.overview?.createdAt).toLocaleDateString()}</span></div>
                        <div className="flex justify-between"><span className={isLight ? 'text-slate-500' : 'text-zinc-500'}>Distribution Mode:</span> <span className={`font-semibold capitalize ${isLight ? 'text-amber-800' : 'text-amber-400'}`}>{tenantDetail.overview?.leadPoolMode || 'Shared'} Pool</span></div>
                      </div>
                    </div>

                    <div className={`p-4 rounded-xl border space-y-2 ${
                      isLight ? 'bg-white border-slate-200 shadow-sm text-slate-800' : 'bg-[#141210] border-[#27272a]'
                    }`}>
                      <div className={`text-xs font-bold uppercase ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>Commercial Seats</div>
                      <div className="text-xs space-y-1.5">
                        <div className="flex justify-between"><span className={isLight ? 'text-slate-500' : 'text-zinc-500'}>Active Users:</span> <span className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{tenantDetail.organization?.users?.length || 0}</span></div>
                        <div className="flex justify-between"><span className={isLight ? 'text-slate-500' : 'text-zinc-500'}>Seat Limit:</span> <span className={`font-bold ${isLight ? 'text-amber-800' : 'text-amber-400'}`}>{tenantDetail.overview?.maxAgents || 10}</span></div>
                        <div className="flex justify-between"><span className={isLight ? 'text-slate-500' : 'text-zinc-500'}>Available:</span> <span className={`font-bold ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>{Math.max(0, (tenantDetail.overview?.maxAgents || 10) - (tenantDetail.organization?.users?.length || 0))}</span></div>
                        <div className="flex justify-between"><span className={isLight ? 'text-slate-500' : 'text-zinc-500'}>Subscription:</span> <span className={`font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>{tenantDetail.subscription?.status || 'Active'}</span></div>
                      </div>
                    </div>
                  </div>

                  {/* Modules Entitlement Snapshot */}
                  <div className={`p-4 rounded-xl border space-y-3 ${
                    isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#141210] border-[#27272a]'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-bold uppercase ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>Company Module Ceiling Status</span>
                      <button
                        onClick={() => setDetailTab('entitlements')}
                        className={`text-xs font-semibold hover:underline cursor-pointer ${isLight ? 'text-amber-800' : 'text-amber-400'}`}
                      >
                        Edit Ceiling
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {CANONICAL_MODULES.map((m) => {
                        const Icon = m.icon;
                        const isEnabled = Boolean(tenantDetail.moduleEntitlements?.[m.id]);
                        return (
                          <div
                            key={m.id}
                            className={`p-3 rounded-xl border flex flex-col items-center text-center gap-1.5 transition ${
                              isEnabled
                                ? (isLight ? 'bg-amber-50/70 border-amber-200 text-slate-900' : 'bg-[#1a1815] border-amber-500/30 text-white')
                                : (isLight ? 'bg-slate-100 border-slate-200 text-slate-400 opacity-60' : 'bg-[#0a0908] border-[#27272a]/40 opacity-50')
                            }`}
                          >
                            <Icon className={`w-5 h-5 ${isEnabled ? 'text-amber-500' : (isLight ? 'text-slate-400' : 'text-zinc-600')}`} />
                            <div className="text-xs font-bold">{m.label}</div>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                              isEnabled
                                ? (isLight ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-amber-500/10 text-amber-400')
                                : (isLight ? 'bg-slate-200 text-slate-500' : 'bg-zinc-800 text-zinc-500')
                            }`}>
                              {isEnabled ? 'Enabled' : 'Disabled'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: USERS */}
              {detailTab === 'users' && (
                <div className="space-y-4">
                  <div className={`p-3.5 rounded-xl border text-xs font-medium ${
                    isLight ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                  }`}>
                    Security Isolation: Platform Administrators are completely isolated and never displayed as customer company staff.
                  </div>

                  <div className={`rounded-xl border overflow-hidden shadow-xl ${
                    isLight ? 'border-slate-200 bg-white' : 'border-[#27272a] bg-[#141210]'
                  }`}>
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className={`border-b text-[11px] uppercase tracking-wider font-semibold ${
                          isLight ? 'border-slate-200 bg-slate-50 text-slate-600' : 'border-[#27272a] bg-[#0d0c0a] text-zinc-400'
                        }`}>
                          <th className="py-3 px-4 font-bold">Name / Username</th>
                          <th className="py-3 px-4 font-bold">Email</th>
                          <th className="py-3 px-4 font-bold">Role</th>
                          <th className="py-3 px-4 font-bold">Status</th>
                          <th className="py-3 px-4 font-bold text-right">Impersonate</th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${isLight ? 'divide-slate-100' : 'divide-[#27272a]/60'}`}>
                        {(tenantDetail.organization?.users || []).map((u: any) => (
                          <tr key={u.id} className={`transition ${
                            isLight ? 'hover:bg-slate-50/80 text-slate-800' : 'hover:bg-[#1a1815] text-white'
                          }`}>
                            <td className="py-3 px-4 font-bold">
                              <div>{u.displayName || u.username}</div>
                              <div className={`text-[11px] font-sans ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>@{u.username}</div>
                            </td>
                            <td className={`py-3 px-4 font-sans ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>{u.email || '—'}</td>
                            <td className="py-3 px-4">
                              <span className={`text-[11px] px-2.5 py-0.5 rounded-md font-bold ${
                                u.role === 'admin'
                                  ? (isLight ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20')
                                  : u.role === 'team_lead'
                                  ? (isLight ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20')
                                  : (isLight ? 'bg-slate-100 text-slate-700 border border-slate-200' : 'bg-zinc-800 text-zinc-300')
                              }`}>
                                {u.role === 'admin' ? 'Company Owner' : (u.role === 'team_lead' ? 'Team Lead' : 'Member Agent')}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <span className={`text-[11px] px-2.5 py-0.5 rounded-full uppercase font-bold ${
                                isLight ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              }`}>
                                {u.status || 'Active'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                onClick={() => {
                                  setImpersonateTargetTenant(tenantDetail.overview);
                                  setImpersonateUserId(u.id);
                                  setShowImpersonateModal(true);
                                }}
                                className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                                  isLight
                                    ? 'bg-amber-100 hover:bg-amber-500 hover:text-slate-950 text-amber-900 border border-amber-300'
                                    : 'bg-[#1c1917] hover:bg-amber-500 hover:text-black text-amber-400'
                                }`}
                              >
                                Act As User
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 3: TEAMS */}
              {detailTab === 'teams' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(tenantDetail.organization?.teams || []).map((t: any) => (
                      <div key={t.id} className={`p-4 rounded-xl border space-y-3 ${
                        isLight ? 'bg-white border-slate-200 shadow-sm text-slate-800' : 'bg-[#141210] border-[#27272a]'
                      }`}>
                        <div className="flex items-center justify-between">
                          <span className={`font-bold text-sm ${isLight ? 'text-slate-900' : 'text-white'}`}>{t.name}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                            isLight ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                          }`}>
                            Team
                          </span>
                        </div>
                        <div className={`text-xs ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>{t.description || 'No description provided.'}</div>
                        <div className={`text-[11px] pt-2 border-t font-sans ${isLight ? 'text-slate-500 border-slate-100' : 'text-zinc-500 border-[#27272a]'}`}>
                          Leader ID: {t.leaderId || 'Unassigned'}
                        </div>
                      </div>
                    ))}
                    {(!tenantDetail.organization?.teams || tenantDetail.organization.teams.length === 0) && (
                      <div className={`col-span-2 text-center py-8 text-xs ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
                        No teams have been configured in this workspace yet.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 4: ACCESS MATRIX */}
              {detailTab === 'matrix' && (
                <div className="space-y-4">
                  <div className={`p-3.5 rounded-xl border flex items-center justify-between text-xs ${
                    isLight ? 'bg-white border-slate-200 text-slate-700 shadow-sm' : 'bg-[#141210] border-[#27272a] text-zinc-300'
                  }`}>
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-amber-500" />
                      <span className="font-semibold">Access Matrix: Effective Access = Company Ceiling ∩ Role Permissions ∩ Explicit User Grants</span>
                    </div>
                    <span className={`text-[11px] font-medium ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>Click any cell to inspect permission decision</span>
                  </div>

                  {/* Master Matrix Grid Table */}
                  <div className={`rounded-xl border overflow-x-auto shadow-xl ${
                    isLight ? 'border-slate-200 bg-white' : 'border-[#27272a] bg-[#141210]'
                  }`}>
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className={`border-b text-[11px] uppercase tracking-wider font-semibold ${
                          isLight ? 'border-slate-200 bg-slate-50 text-slate-600' : 'border-[#27272a] bg-[#0d0c0a] text-zinc-400'
                        }`}>
                          <th className="py-3 px-4 min-w-[180px] font-bold">Person / Role</th>
                          <th className="py-3 px-4 min-w-[120px] font-bold">Team Scope</th>
                          {CANONICAL_MODULES.map((mod) => (
                            <th key={mod.id} className="py-3 px-4 text-center min-w-[130px] font-bold">
                              <div className="flex items-center justify-center gap-1.5">
                                {mod.label}
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${isLight ? 'divide-slate-100' : 'divide-[#27272a]/60'}`}>
                        {(tenantDetail.accessMatrix || []).map((m: any) => {
                          const isUserInactive = m.status && m.status.toLowerCase() !== 'active';
                          return (
                            <tr key={m.userId} className={`transition ${
                              isLight ? 'hover:bg-slate-50/80 text-slate-800' : 'hover:bg-[#1a1815] text-white'
                            }`}>
                              <td className="py-3 px-4">
                                <div className={`font-bold text-xs ${isLight ? 'text-slate-900' : 'text-white'}`}>{m.displayName || m.username}</div>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className={`text-[10px] font-bold ${isLight ? 'text-amber-800' : 'text-amber-400'}`}>{m.roleDisplay}</span>
                                  {isUserInactive && (
                                    <span className={`text-[10px] px-1.5 rounded font-bold ${
                                      isLight ? 'bg-rose-100 text-rose-700 border border-rose-200' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                    }`}>Inactive</span>
                                  )}
                                </div>
                              </td>
                              <td className={`py-3 px-4 text-xs ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>
                                {m.teamDisplay}
                              </td>

                              {/* Module Status Cells */}
                              {CANONICAL_MODULES.map((mod) => {
                                const isCoBlocked = !m.companyEntitlements || !m.companyEntitlements.includes(mod.id);
                                const isUnassigned = !m.assignedModules || !m.assignedModules.includes(mod.id);
                                const isAllowed = !isUserInactive && !isCoBlocked && !isUnassigned && m.effectiveModules && m.effectiveModules.includes(mod.id);

                                let badgeColor = isLight
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
                                let badgeText = 'Allowed';
                                let statusType: 'allowed' | 'blocked_company' | 'not_assigned' | 'inactive' = 'allowed';
                                let reasonText = 'Module is enabled at company level and explicitly assigned to user.';

                                if (isUserInactive) {
                                  badgeColor = isLight ? 'bg-slate-100 text-slate-500 border-slate-200' : 'bg-zinc-800 text-zinc-500 border-zinc-700';
                                  badgeText = 'Account Disabled';
                                  statusType = 'inactive';
                                  reasonText = 'User account is disabled or suspended. All module permissions are revoked.';
                                } else if (isCoBlocked) {
                                  badgeColor = isLight ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-amber-500/10 text-amber-400 border-amber-500/30';
                                  badgeText = 'Blocked by Co.';
                                  statusType = 'blocked_company';
                                  reasonText = 'Module is disabled at the company platform ceiling by Platform Owner.';
                                } else if (isUnassigned) {
                                  badgeColor = isLight ? 'bg-slate-100 text-slate-500 border-slate-200' : 'bg-zinc-800 text-zinc-400 border-zinc-700';
                                  badgeText = 'Not Assigned';
                                  statusType = 'not_assigned';
                                  reasonText = 'Company owns module, but Company Owner has not granted this module to this user.';
                                } else if (!isAllowed) {
                                  badgeColor = isLight ? 'bg-rose-100 text-rose-800 border-rose-200' : 'bg-rose-500/10 text-rose-400 border-rose-500/30';
                                  badgeText = 'Blocked by Role';
                                  statusType = 'not_assigned';
                                  reasonText = 'User role does not permit access to this module.';
                                }

                                return (
                                  <td key={mod.id} className="py-3 px-4 text-center">
                                    <button
                                      onClick={() => setInspectCell({
                                        user: m,
                                        mod: { id: mod.id, label: mod.label },
                                        status: statusType,
                                        reason: reasonText
                                      })}
                                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition cursor-pointer hover:scale-105 ${badgeColor}`}
                                      title="Click to inspect authorization decision"
                                    >
                                      {badgeText}
                                    </button>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Interactive Access Decision Inspector Drawer / Modal */}
                  {inspectCell && (
                    <div className={`p-4 rounded-xl border space-y-3 animate-fadeIn ${
                      isLight ? 'bg-white border-amber-400 shadow-lg text-slate-900' : 'bg-[#0f0e0c] border-amber-500/40 text-white'
                    }`}>
                      <div className={`flex items-center justify-between border-b pb-2 ${isLight ? 'border-slate-200' : 'border-[#27272a]'}`}>
                        <div className="flex items-center gap-2">
                          <Shield className="w-4 h-4 text-amber-500" />
                          <span className="font-bold text-xs">
                            Access Decision Inspector: {inspectCell.user.displayName || inspectCell.user.username} ➔ {inspectCell.mod.label}
                          </span>
                        </div>
                        <button
                          onClick={() => setInspectCell(null)}
                          className={`text-xs font-semibold px-2 py-0.5 rounded cursor-pointer ${isLight ? 'text-slate-500 hover:text-slate-800' : 'text-zinc-500 hover:text-white'}`}
                        >
                          ✕ Close
                        </button>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div className={`p-2.5 rounded-lg border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#141210] border-[#27272a]'}`}>
                          <div className={`text-[10px] uppercase font-bold ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>Final Effective Access</div>
                          <div className={`font-bold mt-1 ${inspectCell.status === 'allowed' ? (isLight ? 'text-emerald-700' : 'text-emerald-400') : (isLight ? 'text-rose-700' : 'text-rose-400')}`}>
                            {inspectCell.status === 'allowed' ? 'GRANTED (Allowed)' : 'DENIED (Blocked)'}
                          </div>
                        </div>

                        <div className={`p-2.5 rounded-lg border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#141210] border-[#27272a]'}`}>
                          <div className={`text-[10px] uppercase font-bold ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>Company Platform Ceiling</div>
                          <div className={`font-bold mt-1 ${inspectCell.status === 'blocked_company' ? (isLight ? 'text-rose-700' : 'text-rose-400') : (isLight ? 'text-emerald-700' : 'text-emerald-400')}`}>
                            {inspectCell.status === 'blocked_company' ? 'DISABLED (0 of 1)' : 'ENABLED (Active)'}
                          </div>
                        </div>

                        <div className={`p-2.5 rounded-lg border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#141210] border-[#27272a]'}`}>
                          <div className={`text-[10px] uppercase font-bold ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>Employee Assignment</div>
                          <div className={`font-bold mt-1 ${inspectCell.status === 'not_assigned' ? (isLight ? 'text-slate-500' : 'text-zinc-400') : (isLight ? 'text-emerald-700' : 'text-emerald-400')}`}>
                            {inspectCell.status === 'not_assigned' ? 'NOT ASSIGNED' : 'ASSIGNED'}
                          </div>
                        </div>

                        <div className={`p-2.5 rounded-lg border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#141210] border-[#27272a]'}`}>
                          <div className={`text-[10px] uppercase font-bold ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>Account Lifecycle</div>
                          <div className={`font-bold mt-1 ${inspectCell.status === 'inactive' ? (isLight ? 'text-rose-700' : 'text-rose-400') : (isLight ? 'text-emerald-700' : 'text-emerald-400')}`}>
                            {inspectCell.status === 'inactive' ? 'DISABLED' : 'ACTIVE'}
                          </div>
                        </div>
                      </div>

                      <div className={`text-xs p-2.5 rounded-lg border ${
                        isLight ? 'bg-amber-50/50 border-amber-200 text-slate-700' : 'bg-[#141210] border-[#27272a] text-zinc-300'
                      }`}>
                        <span className={`font-bold ${isLight ? 'text-amber-800' : 'text-amber-400'}`}>Policy Reason: </span>
                        {inspectCell.reason}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 5: MODULE CEILING CONTROLS */}
              {detailTab === 'entitlements' && (
                <div className="space-y-4">
                  <div className={`p-4 rounded-xl border text-xs space-y-1 ${
                    isLight ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                  }`}>
                    <div className="font-bold flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                      <span>Company Module Ceiling Governance</span>
                    </div>
                    <p>
                      Platform Owner controls the maximum available capabilities for this customer account.
                      Disabling a module immediately eliminates effective access for all company users assigned that module.
                    </p>
                  </div>

                  <div className="space-y-3">
                    {CANONICAL_MODULES.map((mod) => {
                      const Icon = mod.icon;
                      const isEnabled = Boolean(tenantDetail.moduleEntitlements?.[mod.id]);
                      const isToggling = togglingModule === mod.id;
                      return (
                        <div
                          key={mod.id}
                          className={`p-4 rounded-xl border flex items-center justify-between transition ${
                            isLight
                              ? 'bg-white border-slate-200 shadow-sm hover:border-amber-400/50'
                              : 'bg-[#141210] border-[#27272a] hover:border-amber-500/30'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`p-2.5 rounded-xl border ${
                              isEnabled
                                ? (isLight ? 'bg-amber-100 text-amber-900 border-amber-300' : 'bg-amber-500/10 text-amber-400 border-amber-500/30')
                                : (isLight ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-zinc-900 text-zinc-600 border-zinc-800')
                            }`}>
                              <Icon className="w-5 h-5" />
                            </div>
                            <div>
                              <div className={`text-sm font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{mod.label}</div>
                              <div className={`text-xs ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>{mod.desc}</div>
                            </div>
                          </div>

                          <button
                            onClick={() => handleToggleEntitlement(mod.id, isEnabled)}
                            disabled={isToggling}
                            className={`px-4 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                              isEnabled
                                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20'
                                : isLight
                                ? 'bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200'
                                : 'bg-[#1c1917] hover:bg-[#27272a] text-zinc-400 border border-[#27272a]'
                            }`}
                          >
                            {isToggling ? 'Updating...' : (isEnabled ? 'ENABLED' : 'DISABLED')}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB 6: SEAT MANAGEMENT */}
              {detailTab === 'seats' && (
                <div className="space-y-6">
                  <div className={`p-6 rounded-2xl border space-y-4 ${
                    isLight ? 'bg-white border-slate-200 shadow-sm text-slate-800' : 'bg-[#141210] border-[#27272a]'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className={`text-base font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>Commercial Seat Ceiling</h4>
                        <p className={`text-xs mt-1 ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>
                          Enforces how many users/agents this customer workspace can provision.
                        </p>
                      </div>
                      <div className="text-right">
                        <div className={`text-2xl font-extrabold ${isLight ? 'text-amber-800' : 'text-amber-400'}`}>
                          {tenantDetail.organization?.users?.length || 0} / {tenantDetail.overview?.maxAgents || 10}
                        </div>
                        <div className={`text-xs ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>Seats currently utilized</div>
                      </div>
                    </div>

                    <div className={`w-full h-3 rounded-full overflow-hidden ${isLight ? 'bg-slate-200' : 'bg-[#1c1917]'}`}>
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-600 transition-all"
                        style={{
                          width: `${Math.min(100, Math.round(((tenantDetail.organization?.users?.length || 0) / (tenantDetail.overview?.maxAgents || 10)) * 100))}%`
                        }}
                      />
                    </div>

                    <div className={`pt-4 border-t flex items-center justify-between ${isLight ? 'border-slate-200' : 'border-[#27272a]'}`}>
                      <div className={`text-xs font-semibold ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>
                        Available Seats: <span className={`font-bold ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>{Math.max(0, (tenantDetail.overview?.maxAgents || 10) - (tenantDetail.organization?.users?.length || 0))}</span>
                      </div>
                      <button
                        onClick={() => {
                          setNewSeatLimit(tenantDetail.overview?.maxAgents || 10);
                          setShowSeatModal(true);
                        }}
                        className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 transition cursor-pointer"
                      >
                        Adjust Seat Ceiling
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 7: DEVICES */}
              {detailTab === 'devices' && (
                <div className="space-y-4">
                  <div className={`rounded-xl border overflow-hidden shadow-xl ${
                    isLight ? 'border-slate-200 bg-white' : 'border-[#27272a] bg-[#141210]'
                  }`}>
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className={`border-b text-[11px] uppercase tracking-wider font-semibold ${
                          isLight ? 'border-slate-200 bg-slate-50 text-slate-600' : 'border-[#27272a] bg-[#0d0c0a] text-zinc-400'
                        }`}>
                          <th className="py-3 px-4 font-bold">Device Model</th>
                          <th className="py-3 px-4 font-bold">OS & Version</th>
                          <th className="py-3 px-4 font-bold">Status</th>
                          <th className="py-3 px-4 font-bold">Last Seen</th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${isLight ? 'divide-slate-100' : 'divide-[#27272a]/60'}`}>
                        {(tenantDetail.connectedDevices?.devices || []).map((dev: any) => (
                          <tr key={dev.id} className={`transition ${
                            isLight ? 'hover:bg-slate-50/80 text-slate-800' : 'hover:bg-[#1a1815] text-white'
                          }`}>
                            <td className="py-3 px-4 font-bold flex items-center gap-2">
                              <Smartphone className="w-4 h-4 text-amber-500" />
                              <span className={isLight ? 'text-slate-900' : 'text-white'}>{dev.name || dev.id}</span>
                            </td>
                            <td className={`py-3 px-4 ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>
                              {dev.platform || 'Android'} • v{dev.appVersion || '1.0.0'}
                            </td>
                            <td className="py-3 px-4">
                              <span className={`text-[11px] px-2.5 py-0.5 rounded-full uppercase font-bold ${
                                dev.status === 'ONLINE' || dev.status === 'online'
                                  ? (isLight ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20')
                                  : (isLight ? 'bg-slate-100 text-slate-600 border border-slate-200' : 'bg-zinc-800 text-zinc-400')
                              }`}>
                                {dev.status || 'Offline'}
                              </span>
                            </td>
                            <td className={`py-3 px-4 text-xs ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
                              {dev.lastSeenAt ? new Date(dev.lastSeenAt).toLocaleString() : 'Never'}
                            </td>
                          </tr>
                        ))}
                        {(!tenantDetail.connectedDevices?.devices || tenantDetail.connectedDevices.devices.length === 0) && (
                          <tr>
                            <td colSpan={4} className={`py-8 text-center text-xs ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
                              No devices paired to this workspace.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 8: ACTIVITY */}
              {detailTab === 'activity' && (
                <div className="space-y-4">
                  <div className={`rounded-xl border overflow-hidden shadow-xl ${
                    isLight ? 'border-slate-200 bg-white' : 'border-[#27272a] bg-[#141210]'
                  }`}>
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className={`border-b text-[11px] uppercase tracking-wider font-semibold ${
                          isLight ? 'border-slate-200 bg-slate-50 text-slate-600' : 'border-[#27272a] bg-[#0d0c0a] text-zinc-400'
                        }`}>
                          <th className="py-3 px-4 font-bold">Timestamp</th>
                          <th className="py-3 px-4 font-bold">Action</th>
                          <th className="py-3 px-4 font-bold">Details</th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${isLight ? 'divide-slate-100' : 'divide-[#27272a]/60'}`}>
                        {(tenantDetail.auditLogs || []).map((act: any) => (
                          <tr key={act.id} className={`transition ${
                            isLight ? 'hover:bg-slate-50/80 text-slate-800' : 'hover:bg-[#1a1815] text-white'
                          }`}>
                            <td className={`py-3 px-4 text-xs ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
                              {new Date(act.timestamp).toLocaleString()}
                            </td>
                            <td className={`py-3 px-4 font-bold ${isLight ? 'text-amber-800' : 'text-amber-400'}`}>
                              {act.action}
                            </td>
                            <td className={`py-3 px-4 text-xs truncate max-w-sm ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>
                              {act.details || '—'}
                            </td>
                          </tr>
                        ))}
                        {(!tenantDetail.auditLogs || tenantDetail.auditLogs.length === 0) && (
                          <tr>
                            <td colSpan={3} className={`py-8 text-center text-xs ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
                              No scoped activity logs found.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL 1: PROVISION WORKSPACE MODAL
      ══════════════════════════════════════════════════════════════════════ */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className={`w-full max-w-lg rounded-2xl border shadow-2xl p-6 space-y-5 transition ${
            isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#0d0c0a] border-[#1c1917] text-white'
          }`}>
            <div className={`flex items-center justify-between border-b pb-4 ${
              isLight ? 'border-slate-200' : 'border-[#1c1917]'
            }`}>
              <div className="flex items-center gap-2.5">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                  isLight ? 'bg-amber-100 text-amber-700' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                }`}>
                  <Building2 className="w-5 h-5" />
                </div>
                <h3 className={`text-base font-bold font-sans ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  Provision Customer Workspace
                </h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className={`p-1.5 rounded-lg transition ${
                  isLight ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100' : 'text-zinc-500 hover:text-white hover:bg-zinc-800'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateWorkspace} className="space-y-4">
              <div>
                <label className={`block text-xs font-semibold mb-1 ${isLight ? 'text-slate-700' : 'text-zinc-300'}`}>
                  Company / Workspace Name *
                </label>
                <input
                  type="text"
                  required
                  value={createForm.companyName}
                  onChange={e => setCreateForm({ ...createForm, companyName: e.target.value })}
                  placeholder="e.g. Apex Logistics Global"
                  className={`w-full rounded-xl px-3.5 py-2.5 text-xs font-sans transition focus:outline-none focus:ring-2 focus:ring-amber-500/30 ${
                    isLight
                      ? 'bg-slate-50 border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-amber-500'
                      : 'bg-[#141210] border border-[#27272a] text-white placeholder-zinc-500 focus:border-amber-500'
                  }`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${isLight ? 'text-slate-700' : 'text-zinc-300'}`}>
                    Workspace Type
                  </label>
                  <select
                    value={createForm.customerType}
                    onChange={e => setCreateForm({ ...createForm, customerType: e.target.value as any })}
                    className={`w-full rounded-xl px-3 py-2.5 text-xs font-sans transition focus:outline-none focus:ring-2 focus:ring-amber-500/30 ${
                      isLight
                        ? 'bg-slate-50 border border-slate-300 text-slate-900 focus:border-amber-500'
                        : 'bg-[#141210] border border-[#27272a] text-white focus:border-amber-500'
                    }`}
                  >
                    <option value="COMPANY">Company Workspace</option>
                    <option value="PERSONAL">Personal Workspace</option>
                  </select>
                </div>

                <div>
                  <label className={`block text-xs font-semibold mb-1 ${isLight ? 'text-slate-700' : 'text-zinc-300'}`}>
                    Seat Limit
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="500"
                    value={createForm.seatLimit}
                    onChange={e => setCreateForm({ ...createForm, seatLimit: parseInt(e.target.value, 10) || 5 })}
                    className={`w-full rounded-xl px-3 py-2.5 text-xs font-sans transition focus:outline-none focus:ring-2 focus:ring-amber-500/30 ${
                      isLight
                        ? 'bg-slate-50 border border-slate-300 text-slate-900 focus:border-amber-500'
                        : 'bg-[#141210] border border-[#27272a] text-white focus:border-amber-500'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className={`block text-xs font-semibold mb-1 ${isLight ? 'text-slate-700' : 'text-zinc-300'}`}>
                  Commercial Plan
                </label>
                <select
                  value={createForm.planId}
                  onChange={e => setCreateForm({ ...createForm, planId: e.target.value })}
                  className={`w-full rounded-xl px-3 py-2.5 text-xs font-sans transition focus:outline-none focus:ring-2 focus:ring-amber-500/30 ${
                    isLight
                      ? 'bg-slate-50 border border-slate-300 text-slate-900 focus:border-amber-500'
                      : 'bg-[#141210] border border-[#27272a] text-white focus:border-amber-500'
                  }`}
                >
                  <option value="plan_starter">Starter Plan (5 Seats • Core CRM + Dialer)</option>
                  <option value="plan_pro">Pro Plan (20 Seats • Full Suite)</option>
                  <option value="plan_enterprise">Enterprise Plan (1000 Seats • High-Volume Calling)</option>
                </select>
              </div>

              <div className={`pt-3 border-t space-y-3 ${isLight ? 'border-slate-200' : 'border-[#1c1917]'}`}>
                <div className={`text-xs font-bold uppercase tracking-wider ${isLight ? 'text-slate-700' : 'text-zinc-400'}`}>
                  Primary Company Owner Credentials
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={`block text-[11px] font-semibold mb-1 ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>
                      Username *
                    </label>
                    <input
                      type="text"
                      required
                      value={createForm.username}
                      onChange={e => setCreateForm({ ...createForm, username: e.target.value })}
                      placeholder="e.g. john_apex"
                      className={`w-full rounded-xl px-3 py-2 text-xs font-sans transition focus:outline-none focus:ring-2 focus:ring-amber-500/30 ${
                        isLight
                          ? 'bg-slate-50 border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-amber-500'
                          : 'bg-[#141210] border border-[#27272a] text-white placeholder-zinc-500 focus:border-amber-500'
                      }`}
                    />
                  </div>
                  <div>
                    <label className={`block text-[11px] font-semibold mb-1 ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>
                      Password *
                    </label>
                    <input
                      type="password"
                      required
                      value={createForm.password}
                      onChange={e => setCreateForm({ ...createForm, password: e.target.value })}
                      placeholder="Initial password"
                      className={`w-full rounded-xl px-3 py-2 text-xs font-sans transition focus:outline-none focus:ring-2 focus:ring-amber-500/30 ${
                        isLight
                          ? 'bg-slate-50 border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-amber-500'
                          : 'bg-[#141210] border border-[#27272a] text-white placeholder-zinc-500 focus:border-amber-500'
                      }`}
                    />
                  </div>
                </div>

                <div>
                  <label className={`block text-[11px] font-semibold mb-1 ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>
                    Owner Email
                  </label>
                  <input
                    type="email"
                    value={createForm.email}
                    onChange={e => setCreateForm({ ...createForm, email: e.target.value })}
                    placeholder="e.g. john@apexlogistics.com"
                    className={`w-full rounded-xl px-3.5 py-2 text-xs font-sans transition focus:outline-none focus:ring-2 focus:ring-amber-500/30 ${
                      isLight
                        ? 'bg-slate-50 border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-amber-500'
                        : 'bg-[#141210] border border-[#27272a] text-white placeholder-zinc-500 focus:border-amber-500'
                    }`}
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                    isLight
                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      : 'bg-[#141210] hover:bg-[#1a1815] text-zinc-400'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shadow-lg shadow-amber-500/20 transition cursor-pointer disabled:opacity-50"
                >
                  {createLoading ? 'Provisioning...' : 'Provision Workspace'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL 2: AUDITED IMPERSONATION CONFIRMATION MODAL
      ══════════════════════════════════════════════════════════════════════ */}
      {showImpersonateModal && impersonateTargetTenant && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className={`w-full max-w-md rounded-2xl border shadow-2xl p-6 space-y-4 transition ${
            isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#0d0c0a] border-[#1c1917] text-white'
          }`}>
            <div className={`flex items-center gap-3 border-b pb-3.5 ${
              isLight ? 'border-slate-200' : 'border-[#1c1917]'
            }`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${
                isLight ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-amber-500/10 border border-amber-500/30 text-amber-400'
              }`}>
                <UserCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className={`text-base font-bold font-sans ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  Enter Customer Workspace
                </h3>
                <p className={`text-xs font-medium ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>
                  Audited Support Session
                </p>
              </div>
            </div>

            <div className={`p-4 rounded-xl border space-y-2.5 text-xs ${
              isLight ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-[#141210] border-[#27272a] text-zinc-300'
            }`}>
              <div className="flex justify-between">
                <span className={isLight ? 'text-slate-500 font-medium' : 'text-zinc-500'}>Real Identity:</span>
                <span className={`font-bold ${isLight ? 'text-amber-800' : 'text-amber-400'}`}>
                  Platform Owner ({usernameDisplay})
                </span>
              </div>
              <div className="flex justify-between">
                <span className={isLight ? 'text-slate-500 font-medium' : 'text-zinc-500'}>Target Workspace:</span>
                <span className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  {impersonateTargetTenant.name}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className={isLight ? 'text-slate-500 font-medium' : 'text-zinc-500'}>Workspace ID:</span>
                <span className={`font-sans text-[11px] ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>
                  {impersonateTargetTenant.id}
                </span>
              </div>
            </div>

            <div>
              <label className={`block text-xs font-semibold mb-1 ${isLight ? 'text-slate-700' : 'text-zinc-300'}`}>
                Reason for Impersonation *
              </label>
              <input
                type="text"
                required
                value={impersonateReason}
                onChange={e => setImpersonateReason(e.target.value)}
                placeholder="e.g. Support ticket #894 / Investigation"
                className={`w-full rounded-xl px-3.5 py-2.5 text-xs font-sans transition focus:outline-none focus:ring-2 focus:ring-amber-500/30 ${
                  isLight
                    ? 'bg-slate-50 border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-amber-500'
                    : 'bg-[#141210] border border-[#27272a] text-white placeholder-zinc-500 focus:border-amber-500'
                }`}
              />
              <p className={`text-[11px] mt-1.5 ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
                Recorded immutably in Platform Audit Logs for regulatory compliance.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowImpersonateModal(false)}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  isLight
                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    : 'bg-[#141210] hover:bg-[#1a1815] text-zinc-400'
                }`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStartImpersonation}
                disabled={impersonateLoading}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shadow-lg shadow-amber-500/20 transition cursor-pointer disabled:opacity-50"
              >
                {impersonateLoading ? 'Entering Workspace...' : 'Start Impersonation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL 3: ADJUST SEAT CEILING MODAL
      ══════════════════════════════════════════════════════════════════════ */}
      {showSeatModal && selectedTenantId && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className={`w-full max-w-md rounded-2xl border shadow-2xl p-6 space-y-4 transition ${
            isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#0d0c0a] border-[#1c1917] text-white'
          }`}>
            <div className={`flex items-center gap-3 border-b pb-3.5 ${
              isLight ? 'border-slate-200' : 'border-[#1c1917]'
            }`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${
                isLight ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-amber-500/10 border border-amber-500/30 text-amber-400'
              }`}>
                <UserCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className={`text-base font-bold font-sans ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  Change Seat Limit
                </h3>
                <p className={`text-xs font-medium ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>
                  {tenantDetail?.overview?.name}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className={`block text-xs font-semibold mb-1 ${isLight ? 'text-slate-700' : 'text-zinc-300'}`}>
                  New Seat Ceiling
                </label>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={newSeatLimit}
                  onChange={e => setNewSeatLimit(parseInt(e.target.value, 10) || 1)}
                  className={`w-full rounded-xl px-3.5 py-2.5 text-sm font-sans transition focus:outline-none focus:ring-2 focus:ring-amber-500/30 ${
                    isLight
                      ? 'bg-slate-50 border border-slate-300 text-slate-900 focus:border-amber-500 font-bold'
                      : 'bg-[#141210] border border-[#27272a] text-white focus:border-amber-500 font-bold'
                  }`}
                />
              </div>

              <div className={`p-3.5 rounded-xl border text-xs space-y-1.5 ${
                isLight ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-[#141210] border-[#27272a] text-zinc-300'
              }`}>
                <div className="flex justify-between">
                  <span className={isLight ? 'text-slate-500' : 'text-zinc-400'}>Current Active Users:</span>
                  <span className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    {tenantDetail?.organization?.users?.length || 0}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className={isLight ? 'text-slate-500' : 'text-zinc-400'}>Current Seat Limit:</span>
                  <span className={`font-bold ${isLight ? 'text-amber-700' : 'text-amber-400'}`}>
                    {tenantDetail?.overview?.maxAgents || 10}
                  </span>
                </div>
              </div>

              {newSeatLimit < (tenantDetail?.organization?.users?.length || 0) && (
                <div className={`p-3 rounded-xl border text-xs flex items-center gap-2.5 ${
                  isLight ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                }`}>
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                  <span>Warning: Setting limit below active user count will prevent any new user creation.</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowSeatModal(false)}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  isLight
                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    : 'bg-[#141210] hover:bg-[#1a1815] text-zinc-400'
                }`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleUpdateSeatLimit(selectedTenantId, newSeatLimit)}
                disabled={seatUpdating}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shadow-lg shadow-amber-500/20 transition cursor-pointer disabled:opacity-50"
              >
                {seatUpdating ? 'Updating Limit...' : 'Save Limit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TRIAL DURATION ADJUSTMENT MODAL (ADD & REDUCE TIME) */}
      {adjustingTrialTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className={`w-full max-w-lg rounded-2xl border p-6 shadow-2xl space-y-5 transition ${
            isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-[#141210] border-[#27272a] text-white'
          }`}>
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/30">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold">Adjust Trial Duration</h3>
                  <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>
                    Company: <span className="font-semibold text-amber-500">{adjustingTrialTenant.name}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setAdjustingTrialTenant(null)}
                className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Live Countdown & Current Expiration */}
            <div className={`p-4 rounded-xl border flex items-center justify-between ${
              isLight ? 'bg-amber-50 border-amber-200' : 'bg-[#1a1714] border-amber-500/30'
            }`}>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-amber-500">Current Status</div>
                <div className={`text-xs mt-0.5 ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>
                  Expires: <span className="font-mono font-bold">{new Date(adjustingTrialTenant.trialEndsAt || Date.now()).toLocaleString()}</span>
                </div>
              </div>
              <div className="text-right">
                <LiveTrialCountdown targetDate={adjustingTrialTenant.trialEndsAt} className="text-sm font-black" />
              </div>
            </div>

            {/* Quick Add Section */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-500 uppercase tracking-wider">
                <Plus className="w-3.5 h-3.5" />
                <span>Add Time to Trial</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: '+1 Day', days: 1, hours: 0 },
                  { label: '+3 Days', days: 3, hours: 0 },
                  { label: '+7 Days', days: 7, hours: 0 },
                  { label: '+14 Days', days: 14, hours: 0 },
                  { label: '+30 Days', days: 30, hours: 0 },
                  { label: '+1 Hour', days: 0, hours: 1 },
                  { label: '+6 Hours', days: 0, hours: 6 },
                  { label: '+12 Hours', days: 0, hours: 12 },
                ].map(opt => (
                  <button
                    key={opt.label}
                    onClick={() => handleAdjustTrial(adjustingTrialTenant.id, 'add', opt.days, opt.hours)}
                    disabled={trialActionLoading}
                    className="px-2.5 py-2 text-xs font-bold rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition cursor-pointer text-center"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Reduce Section */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-rose-500 uppercase tracking-wider">
                <Minus className="w-3.5 h-3.5" />
                <span>Reduce Time from Trial</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: '-1 Day', days: 1, hours: 0 },
                  { label: '-3 Days', days: 3, hours: 0 },
                  { label: '-7 Days', days: 7, hours: 0 },
                  { label: '-14 Days', days: 14, hours: 0 },
                  { label: '-1 Hour', days: 0, hours: 1 },
                  { label: '-6 Hours', days: 0, hours: 6 },
                  { label: '-12 Hours', days: 0, hours: 12 },
                  { label: '🚨 Expire Now', expire: true }
                ].map(opt => (
                  <button
                    key={opt.label}
                    onClick={() => opt.expire ? handleAdjustTrial(adjustingTrialTenant.id, 'expire_now') : handleAdjustTrial(adjustingTrialTenant.id, 'reduce', opt.days, opt.hours)}
                    disabled={trialActionLoading}
                    className={`px-2.5 py-2 text-xs font-bold rounded-xl transition cursor-pointer text-center ${
                      opt.expire
                        ? 'bg-red-600 hover:bg-red-500 text-white shadow-sm'
                        : 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Time Adjustment */}
            <div className={`p-4 rounded-xl border space-y-3 ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#181614] border-[#27272a]'
            }`}>
              <div className="text-xs font-bold uppercase tracking-wider text-amber-500">Custom Duration Input</div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={trialAdjustDays}
                  onChange={e => setTrialAdjustDays(Math.max(1, parseInt(e.target.value) || 1))}
                  className={`w-24 px-3 py-2 rounded-xl text-xs font-bold text-center border focus:outline-none focus:ring-2 focus:ring-amber-500/40 ${
                    isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-zinc-900 border-zinc-700 text-white'
                  }`}
                />
                <span className="text-xs font-bold">Days</span>

                <input
                  type="number"
                  min="0"
                  max="23"
                  value={trialAdjustHours}
                  onChange={e => setTrialAdjustHours(Math.max(0, parseInt(e.target.value) || 0))}
                  className={`w-20 px-3 py-2 rounded-xl text-xs font-bold text-center border focus:outline-none focus:ring-2 focus:ring-amber-500/40 ${
                    isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-zinc-900 border-zinc-700 text-white'
                  }`}
                />
                <span className="text-xs font-bold">Hours</span>

                <div className="flex items-center gap-2 ml-auto">
                  <button
                    onClick={() => handleAdjustTrial(adjustingTrialTenant.id, 'add', trialAdjustDays, trialAdjustHours)}
                    disabled={trialActionLoading}
                    className="px-3 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition cursor-pointer flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                  <button
                    onClick={() => handleAdjustTrial(adjustingTrialTenant.id, 'reduce', trialAdjustDays, trialAdjustHours)}
                    disabled={trialActionLoading}
                    className="px-3 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-500 text-white shadow-sm transition cursor-pointer flex items-center gap-1"
                  >
                    <Minus className="w-3.5 h-3.5" /> Reduce
                  </button>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end pt-2">
              <button
                onClick={() => setAdjustingTrialTenant(null)}
                className={`px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
                  isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                }`}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL: CHANGE COMMERCIAL PLAN MODAL
      ══════════════════════════════════════════════════════════════════════ */}
      {updatingPlanTenant && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className={`w-full max-w-md rounded-2xl border shadow-2xl p-6 space-y-4 transition ${
            isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#0d0c0a] border-[#1c1917] text-white'
          }`}>
            <div className={`flex items-center justify-between border-b pb-3.5 ${
              isLight ? 'border-slate-200' : 'border-[#1c1917]'
            }`}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold bg-amber-500/10 border border-amber-500/30 text-amber-500 text-lg">
                  ⭐
                </div>
                <div>
                  <h3 className={`text-base font-bold font-sans ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    Change Commercial Plan
                  </h3>
                  <div className={`text-xs ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>
                    {updatingPlanTenant.name}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setUpdatingPlanTenant(null)}
                className={`p-1.5 rounded-lg transition ${
                  isLight ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100' : 'text-zinc-500 hover:text-white hover:bg-zinc-800'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 pt-1">
              <label className={`block text-xs font-semibold ${isLight ? 'text-slate-700' : 'text-zinc-300'}`}>
                Select Commercial Tier
              </label>
              <div className="grid grid-cols-1 gap-2">
                {[
                  { id: 'starter', name: 'Starter Plan', desc: '5 Seats • Core CRM & Dialer' },
                  { id: 'pro', name: 'Pro Plan', desc: '20 Seats • Full Suite & Advanced Features' },
                  { id: 'enterprise', name: 'Enterprise Plan', desc: '1000 Seats • High-Volume Calling & Max Capacity' }
                ].map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedNewPlan(p.id)}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer flex items-center justify-between ${
                      selectedNewPlan === p.id
                        ? 'border-amber-500 bg-amber-500/10 text-amber-400 font-bold'
                        : isLight
                        ? 'border-slate-200 hover:border-slate-300 bg-slate-50 text-slate-800'
                        : 'border-[#27272a] hover:border-[#3f3f46] bg-[#141210] text-zinc-300'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-bold">{p.name}</div>
                      <div className="text-[11px] opacity-75 font-normal">{p.desc}</div>
                    </div>
                    {selectedNewPlan === p.id && <span className="text-amber-500 font-bold text-sm">✓</span>}
                  </button>
                ))}
              </div>
            </div>

            <div className={`flex items-center justify-end gap-3 pt-3 border-t ${
              isLight ? 'border-slate-200' : 'border-[#1c1917]'
            }`}>
              <button
                type="button"
                onClick={() => setUpdatingPlanTenant(null)}
                className={`px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
                  isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                }`}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={planUpdateLoading}
                onClick={() => handleUpdateTenantPlan(updatingPlanTenant.id, selectedNewPlan)}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-sans transition cursor-pointer flex items-center gap-1.5"
              >
                {planUpdateLoading ? 'Updating...' : 'Save Plan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL 4: SUSPEND / REACTIVATE CONFIRMATION MODAL
      ══════════════════════════════════════════════════════════════════════ */}
      {showSuspendModal && targetSuspendTenant && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className={`w-full max-w-md rounded-2xl border shadow-2xl p-6 space-y-4 transition ${
            isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#0d0c0a] border-[#1c1917] text-white'
          }`}>
            <div className={`flex items-center gap-3 border-b pb-3.5 ${
              isLight ? 'border-slate-200' : 'border-[#1c1917]'
            }`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${
                targetSuspendTenant.status === 'active'
                  ? (isLight ? 'bg-rose-100 border border-rose-200 text-rose-700' : 'bg-rose-500/10 border border-rose-500/30 text-rose-400')
                  : (isLight ? 'bg-emerald-100 border border-emerald-200 text-emerald-700' : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400')
              }`}>
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className={`text-base font-bold font-sans ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  {targetSuspendTenant.status === 'active' ? `Suspend ${targetSuspendTenant.name}?` : `Reactivate ${targetSuspendTenant.name}?`}
                </h3>
                <p className={`text-xs font-medium ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>
                  {targetSuspendTenant.status === 'active'
                    ? 'Users will immediately lose workspace access.'
                    : 'Restores workspace access for customer users.'}
                </p>
              </div>
            </div>

            <div>
              <label className={`block text-xs font-semibold mb-1 ${isLight ? 'text-slate-700' : 'text-zinc-300'}`}>
                Reason for Status Change *
              </label>
              <textarea
                rows={3}
                required
                value={suspendReason}
                onChange={e => setSuspendReason(e.target.value)}
                placeholder="Document rationale for this action..."
                className={`w-full rounded-xl p-3 text-xs font-sans transition focus:outline-none focus:ring-2 focus:ring-amber-500/30 ${
                  isLight
                    ? 'bg-slate-50 border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-amber-500'
                    : 'bg-[#141210] border border-[#27272a] text-white placeholder-zinc-500 focus:border-amber-500'
                }`}
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowSuspendModal(false)}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  isLight
                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    : 'bg-[#141210] hover:bg-[#1a1815] text-zinc-400'
                }`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSuspend}
                disabled={suspendLoading}
                className={`px-5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer disabled:opacity-50 ${
                  targetSuspendTenant.status === 'active'
                    ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/20'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20'
                }`}
              >
                {suspendLoading
                  ? 'Updating...'
                  : (targetSuspendTenant.status === 'active' ? 'Suspend Workspace' : 'Reactivate Workspace')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
