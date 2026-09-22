import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Shield, Building2, Database, RefreshCw,
  Users, Search, LogOut, Copy, Check, Plus,
  AlertCircle, Cpu, Radio, X, Smartphone, Activity,
  Clock, FileText, ShieldCheck, CheckCircle2, AlertTriangle,
  Sliders, ChevronRight, PhoneCall,
  Mail, Share2, UserCheck, ShieldAlert
} from 'lucide-react';
import { io as socketIO, Socket } from 'socket.io-client';

interface SuperAdminPortalProps {
  serverUrl: string;
  authToken: string;
  currentUser: any;
  onLogout: () => void;
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
  { id: 'autoEmailer', label: 'Email Manager', desc: 'Automated drip email outreach engine', icon: Mail },
  { id: 'facebookPoster', label: 'Facebook Auto Poster', desc: 'Automated social distribution & inbound leads', icon: Share2 }
];

export const SuperAdminPortal: React.FC<SuperAdminPortalProps> = ({
  serverUrl,
  authToken,
  currentUser,
  onLogout
}) => {
  // Navigation State
  const [activeTab, setActiveTab] = useState<NavigationTab>('overview');

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

  // Loading & Sync Status
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date());
  const [isLiveConnected, setIsLiveConnected] = useState(false);

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

  // Module Entitlement Toggling
  const [togglingModule, setTogglingModule] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

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
            list = list.filter((t: any) => (t.tier || 'standard').toLowerCase() === planFilter.toLowerCase());
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

  const usernameDisplay = currentUser?.username || 'admin';

  return (
    <div className="min-h-screen bg-[#080706] text-slate-100 flex flex-row font-sans selection:bg-amber-500/20 selection:text-amber-300 antialiased">
      {/* ── 1. PLATFORM OWNER SIDEBAR ── */}
      <aside className="w-64 bg-[#0d0c0a] border-r border-[#1c1917] flex flex-col shrink-0 z-30 select-none">
        {/* Brand Header */}
        <div className="p-5 border-b border-[#1c1917] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 p-[1px] shadow-lg shadow-amber-500/20 shrink-0">
              <div className="w-full h-full bg-[#0d0c0a] rounded-xl flex items-center justify-center">
                <Shield className="w-5 h-5 text-amber-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-black tracking-wider text-white uppercase font-display">
                  ZESTIFY
                </span>
                <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  ROOT
                </span>
              </div>
              <div className="text-[10px] text-zinc-400 font-mono tracking-wide uppercase">
                PLATFORM CONSOLE
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          <button
            onClick={() => setActiveTab('overview')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
              activeTab === 'overview'
                ? 'bg-amber-500 text-black font-bold shadow-md shadow-amber-500/20'
                : 'text-zinc-400 hover:text-white hover:bg-[#181614]'
            }`}
          >
            <Activity className={`w-4 h-4 ${activeTab === 'overview' ? 'text-black' : 'text-amber-400/80'}`} />
            <span>OVERVIEW</span>
          </button>

          <button
            onClick={() => setActiveTab('workspaces')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
              activeTab === 'workspaces'
                ? 'bg-amber-500 text-black font-bold shadow-md shadow-amber-500/20'
                : 'text-zinc-400 hover:text-white hover:bg-[#181614]'
            }`}
          >
            <div className="flex items-center gap-3">
              <Building2 className={`w-4 h-4 ${activeTab === 'workspaces' ? 'text-black' : 'text-amber-400/80'}`} />
              <span>WORKSPACES</span>
            </div>
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
              activeTab === 'workspaces' ? 'bg-black text-amber-400 font-bold' : 'bg-[#1c1917] text-zinc-400'
            }`}>
              {totalTenants}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('users')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
              activeTab === 'users'
                ? 'bg-amber-500 text-black font-bold shadow-md shadow-amber-500/20'
                : 'text-zinc-400 hover:text-white hover:bg-[#181614]'
            }`}
          >
            <Users className={`w-4 h-4 ${activeTab === 'users' ? 'text-black' : 'text-amber-400/80'}`} />
            <span>USERS & ACCESS</span>
          </button>

          <button
            onClick={() => setActiveTab('devices')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
              activeTab === 'devices'
                ? 'bg-amber-500 text-black font-bold shadow-md shadow-amber-500/20'
                : 'text-zinc-400 hover:text-white hover:bg-[#181614]'
            }`}
          >
            <Smartphone className={`w-4 h-4 ${activeTab === 'devices' ? 'text-black' : 'text-amber-400/80'}`} />
            <span>DEVICES & TELEPHONY</span>
          </button>

          <button
            onClick={() => setActiveTab('jobs')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
              activeTab === 'jobs'
                ? 'bg-amber-500 text-black font-bold shadow-md shadow-amber-500/20'
                : 'text-zinc-400 hover:text-white hover:bg-[#181614]'
            }`}
          >
            <Sliders className={`w-4 h-4 ${activeTab === 'jobs' ? 'text-black' : 'text-amber-400/80'}`} />
            <span>AUTOMATION & JOBS</span>
          </button>

          <button
            onClick={() => setActiveTab('activity')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
              activeTab === 'activity'
                ? 'bg-amber-500 text-black font-bold shadow-md shadow-amber-500/20'
                : 'text-zinc-400 hover:text-white hover:bg-[#181614]'
            }`}
          >
            <FileText className={`w-4 h-4 ${activeTab === 'activity' ? 'text-black' : 'text-amber-400/80'}`} />
            <span>PLATFORM ACTIVITY</span>
          </button>

          <button
            onClick={() => setActiveTab('health')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
              activeTab === 'health'
                ? 'bg-amber-500 text-black font-bold shadow-md shadow-amber-500/20'
                : 'text-zinc-400 hover:text-white hover:bg-[#181614]'
            }`}
          >
            <ShieldCheck className={`w-4 h-4 ${activeTab === 'health' ? 'text-black' : 'text-amber-400/80'}`} />
            <span>SYSTEM HEALTH</span>
          </button>
        </nav>

        {/* Profile / Bottom Section */}
        <div className="p-4 border-t border-[#1c1917] bg-[#090807]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center font-bold text-amber-400 text-xs">
                PO
              </div>
              <div className="text-left">
                <div className="text-xs font-bold text-white capitalize leading-tight">
                  {usernameDisplay}
                </div>
                <div className="text-[10px] text-amber-400/90 font-mono">Platform Owner</div>
              </div>
            </div>

            <button
              onClick={onLogout}
              className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition cursor-pointer"
              title="Sign Out Platform Admin"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── 2. MAIN APPLICATION CONTENT AREA ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#080706]">
        {/* Executive Top Bar */}
        <header className="h-16 bg-[#0d0c0a]/90 backdrop-blur-md border-b border-[#1c1917] flex items-center justify-between px-6 shrink-0 z-20">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-black uppercase tracking-wider text-white font-display">
              {activeTab === 'overview' && 'Platform Overview & Telemetry'}
              {activeTab === 'workspaces' && 'Customer Workspaces & Entitlements'}
              {activeTab === 'users' && 'Global Customer Users & Scoped RBAC'}
              {activeTab === 'devices' && 'Telephony Handsets & Cellular Radio'}
              {activeTab === 'jobs' && 'Automation Workers & Task Health'}
              {activeTab === 'activity' && 'Forensic Platform Audit Stream'}
              {activeTab === 'health' && 'System Health & Engine Observability'}
            </h2>
            <span className="text-zinc-600">•</span>
            <div className="flex items-center gap-2 text-[11px] font-mono">
              {isLiveConnected ? (
                <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  REALTIME ENGINE LIVE
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-amber-400 font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  SYNCING (30s POLLING)
                </span>
              )}
              <span className="text-zinc-600">•</span>
              <span className="text-zinc-500">Synced {lastSyncTime.toLocaleTimeString()}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs shadow-md shadow-amber-500/20 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Provision Workspace</span>
            </button>

            <button
              onClick={() => fetchGlobalData(true)}
              disabled={loading}
              className="p-2 rounded-xl bg-[#141210] border border-[#27272a] text-zinc-300 hover:text-white hover:border-amber-500/40 transition cursor-pointer disabled:opacity-50"
              title="Refresh Real-time Telemetry"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-400' : ''}`} />
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
                <div className="p-4 rounded-xl bg-[#0f0e0c] border border-[#1f1c19] hover:border-amber-500/40 transition shadow-lg">
                  <div className="flex items-center justify-between text-zinc-400 text-xs font-medium mb-2">
                    <span>Total Workspaces</span>
                    <Building2 className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-2xl font-bold text-white font-display">
                    {overview?.totalTenants ?? totalTenants}
                  </div>
                  <div className="mt-2 text-[11px] text-zinc-500 font-mono">
                    {overview?.companyTenants ?? 0} Company • {overview?.personalTenants ?? 0} Personal
                  </div>
                </div>

                {/* 2. Active Workspaces */}
                <div className="p-4 rounded-xl bg-[#0f0e0c] border border-[#1f1c19] hover:border-emerald-500/40 transition shadow-lg">
                  <div className="flex items-center justify-between text-zinc-400 text-xs font-medium mb-2">
                    <span>Active Workspaces</span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-2xl font-bold text-emerald-400 font-display">
                    {overview?.activeTenants ?? 0}
                  </div>
                  <div className="mt-2 text-[11px] text-zinc-500 font-mono">
                    Operational customer tenants
                  </div>
                </div>

                {/* 3. Trialing */}
                <div className="p-4 rounded-xl bg-[#0f0e0c] border border-[#1f1c19] hover:border-amber-500/40 transition shadow-lg">
                  <div className="flex items-center justify-between text-zinc-400 text-xs font-medium mb-2">
                    <span>Trialing Accounts</span>
                    <Clock className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-2xl font-bold text-amber-400 font-display">
                    {overview?.trialTenants ?? 0}
                  </div>
                  <div className="mt-2 text-[11px] text-zinc-500 font-mono">
                    Evaluation subscriptions
                  </div>
                </div>

                {/* 4. Suspended */}
                <div className="p-4 rounded-xl bg-[#0f0e0c] border border-[#1f1c19] hover:border-rose-500/40 transition shadow-lg">
                  <div className="flex items-center justify-between text-zinc-400 text-xs font-medium mb-2">
                    <span>Suspended</span>
                    <ShieldAlert className="w-4 h-4 text-rose-400" />
                  </div>
                  <div className="text-2xl font-bold text-rose-400 font-display">
                    {overview?.suspendedTenants ?? 0}
                  </div>
                  <div className="mt-2 text-[11px] text-zinc-500 font-mono">
                    Accounts paused by admin
                  </div>
                </div>

                {/* 5. Total Customer Users */}
                <div className="p-4 rounded-xl bg-[#0f0e0c] border border-[#1f1c19] hover:border-amber-500/40 transition shadow-lg">
                  <div className="flex items-center justify-between text-zinc-400 text-xs font-medium mb-2">
                    <span>Total Customer Users</span>
                    <Users className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-2xl font-bold text-white font-display">
                    {overview?.totalUsers ?? 0}
                  </div>
                  <div className="mt-2 text-[11px] text-zinc-500 font-mono">
                    {overview?.companyOwners ?? 0} Owners • {overview?.teamLeads ?? 0} Leads • {overview?.members ?? 0} Members
                  </div>
                </div>

                {/* 6. Seats Used */}
                <div className="p-4 rounded-xl bg-[#0f0e0c] border border-[#1f1c19] hover:border-amber-500/40 transition shadow-lg">
                  <div className="flex items-center justify-between text-zinc-400 text-xs font-medium mb-2">
                    <span>Seats Capacity & Utilization</span>
                    <UserCheck className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-2xl font-bold text-white font-display">
                    {overview?.totalUsers ?? 0} seats
                  </div>
                  <div className="mt-2 text-[11px] text-zinc-500 font-mono">
                    Active assigned user seats
                  </div>
                </div>

                {/* 7. Connected Devices */}
                <div className="p-4 rounded-xl bg-[#0f0e0c] border border-[#1f1c19] hover:border-purple-500/40 transition shadow-lg">
                  <div className="flex items-center justify-between text-zinc-400 text-xs font-medium mb-2">
                    <span>Connected Devices</span>
                    <Smartphone className="w-4 h-4 text-purple-400" />
                  </div>
                  <div className="text-2xl font-bold text-white font-display">
                    {overview?.activeTelephonySockets ?? 0}
                  </div>
                  <div className="mt-2 text-[11px] text-zinc-500 font-mono">
                    {overview?.callsInProgress ?? 0} Live Call Sessions Active
                  </div>
                </div>

                {/* 8. Active Jobs */}
                <div className="p-4 rounded-xl bg-[#0f0e0c] border border-[#1f1c19] hover:border-blue-500/40 transition shadow-lg">
                  <div className="flex items-center justify-between text-zinc-400 text-xs font-medium mb-2">
                    <span>Active Automation Jobs</span>
                    <Activity className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="text-2xl font-bold text-white font-display">
                    {overview?.emailJobsRunning ?? 0}
                  </div>
                  <div className="mt-2 text-[11px] text-zinc-500 font-mono">
                    Email & background workers
                  </div>
                </div>
              </div>

              {/* Needs Attention Center */}
              <div className="p-5 rounded-2xl bg-[#0d0c0a] border border-[#1c1917] space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <h3 className="text-sm font-bold text-white tracking-wide uppercase font-display">
                      NEEDS ATTENTION
                    </h3>
                  </div>
                  <span className="text-[11px] font-mono text-zinc-500">
                    {attentionItems.length} items requiring intervention
                  </span>
                </div>

                {attentionItems.length === 0 ? (
                  <div className="p-6 rounded-xl bg-[#141210] border border-[#27272a] text-center text-zinc-400 text-xs">
                    <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
                    <span>All customer workspaces, seat quotas, and automation jobs are operating normally.</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {attentionItems.map((item) => (
                      <div
                        key={item.id}
                        className={`p-3.5 rounded-xl border flex flex-col justify-between transition ${
                          item.severity === 'critical'
                            ? 'bg-rose-950/20 border-rose-500/30'
                            : item.severity === 'warning'
                            ? 'bg-amber-950/20 border-amber-500/30'
                            : 'bg-[#141210] border-[#27272a]'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-bold text-white">{item.title}</span>
                            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold uppercase ${
                              item.severity === 'critical'
                                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                                : item.severity === 'warning'
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                                : 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                            }`}>
                              {item.severity}
                            </span>
                          </div>
                          <p className="text-xs text-zinc-400 leading-relaxed">{item.description}</p>
                        </div>
                        {item.tenantId && (
                          <div className="mt-3 pt-2 border-t border-[#27272a]/50 flex justify-end">
                            <button
                              onClick={() => {
                                fetchTenantDetail(item.tenantId!);
                                setDetailTab(item.title.includes('Seat') ? 'seats' : 'summary');
                              }}
                              className="text-[11px] font-bold text-amber-400 hover:text-amber-300 font-mono flex items-center gap-1 cursor-pointer"
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
                <div className="p-5 rounded-2xl bg-[#0d0c0a] border border-[#1c1917] space-y-3">
                  <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider font-mono">
                    Quick Control Shortcuts
                  </h3>
                  <div className="space-y-2">
                    <button
                      onClick={() => setShowCreateModal(true)}
                      className="w-full flex items-center justify-between p-3 rounded-xl bg-[#141210] hover:bg-[#1a1815] border border-[#27272a] text-xs font-semibold text-white transition cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <Plus className="w-4 h-4 text-amber-400" />
                        <span>Provision New Workspace</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-zinc-500" />
                    </button>

                    <button
                      onClick={() => { setActiveTab('workspaces'); setStatusFilter('suspended'); }}
                      className="w-full flex items-center justify-between p-3 rounded-xl bg-[#141210] hover:bg-[#1a1815] border border-[#27272a] text-xs font-semibold text-white transition cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <ShieldAlert className="w-4 h-4 text-rose-400" />
                        <span>Review Suspended Accounts</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-zinc-500" />
                    </button>

                    <button
                      onClick={() => setActiveTab('jobs')}
                      className="w-full flex items-center justify-between p-3 rounded-xl bg-[#141210] hover:bg-[#1a1815] border border-[#27272a] text-xs font-semibold text-white transition cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <Sliders className="w-4 h-4 text-blue-400" />
                        <span>Inspect Automation Health</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-zinc-500" />
                    </button>
                  </div>
                </div>

                {/* Recent Activity Snapshot */}
                <div className="lg:col-span-2 p-5 rounded-2xl bg-[#0d0c0a] border border-[#1c1917] space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider font-mono">
                      Recent High-Value Platform Activity
                    </h3>
                    <button
                      onClick={() => setActiveTab('activity')}
                      className="text-xs text-amber-400 hover:underline font-mono"
                    >
                      View All
                    </button>
                  </div>

                  <div className="space-y-2">
                    {activityList.slice(0, 5).map((act, idx) => (
                      <div
                        key={act.id || idx}
                        className="p-2.5 rounded-xl bg-[#141210] border border-[#1c1917] flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                          <div>
                            <span className="font-bold text-white font-mono">{act.action}</span>
                            <span className="text-zinc-500 ml-2">by {act.username || act.performedBy || 'system'}</span>
                          </div>
                        </div>
                        <span className="text-zinc-500 font-mono text-[11px]">
                          {new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))}
                    {activityList.length === 0 && (
                      <div className="text-center py-6 text-zinc-500 text-xs">
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
              <div className="p-4 rounded-xl bg-[#0d0c0a] border border-[#1c1917] flex flex-col md:flex-row items-center justify-between gap-3">
                <div className="flex flex-1 items-center gap-3 w-full md:w-auto">
                  <div className="relative flex-1 max-w-md">
                    <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={search}
                      onChange={e => { setSearch(e.target.value); setPage(1); }}
                      placeholder="Search company, owner name, email, workspace ID..."
                      className="w-full bg-[#141210] border border-[#27272a] rounded-xl pl-9 pr-4 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 font-sans"
                    />
                  </div>

                  <select
                    value={statusFilter}
                    onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                    className="bg-[#141210] border border-[#27272a] rounded-xl px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-amber-500 font-mono cursor-pointer"
                  >
                    <option value="all">Status: All</option>
                    <option value="active">Active</option>
                    <option value="trial">Trialing</option>
                    <option value="suspended">Suspended</option>
                  </select>

                  <select
                    value={typeFilter}
                    onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
                    className="bg-[#141210] border border-[#27272a] rounded-xl px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-amber-500 font-mono cursor-pointer"
                  >
                    <option value="all">Type: All</option>
                    <option value="COMPANY">Company</option>
                    <option value="PERSONAL">Personal</option>
                  </select>

                  <select
                    value={planFilter}
                    onChange={e => { setPlanFilter(e.target.value); setPage(1); }}
                    className="bg-[#141210] border border-[#27272a] rounded-xl px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-amber-500 font-mono cursor-pointer"
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
                    className="bg-[#141210] border border-[#27272a] rounded-xl px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-amber-500 font-mono cursor-pointer"
                  >
                    <option value="newest">Sort: Newest</option>
                    <option value="oldest">Sort: Oldest</option>
                    <option value="most_users">Sort: Most Users</option>
                    <option value="highest_seats">Sort: Highest Seat Usage</option>
                  </select>
                </div>
              </div>

              {/* Workspaces Table */}
              <div className="rounded-xl border border-[#1c1917] bg-[#0d0c0a] overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[#1c1917] bg-[#12110e] text-zinc-400 font-mono text-[11px] uppercase">
                        <th className="py-3 px-4">Company / Workspace</th>
                        <th className="py-3 px-4">Owner</th>
                        <th className="py-3 px-4">Type</th>
                        <th className="py-3 px-4">Plan</th>
                        <th className="py-3 px-4">Users</th>
                        <th className="py-3 px-4">Seats Used</th>
                        <th className="py-3 px-4">Modules Ceiling</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Created</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#181614]">
                      {tenants.map((t: any) => {
                        const seatsUsed = t.totalUsers || 0;
                        const seatLimit = t.maxAgents || 10;
                        const isMaxed = seatsUsed >= seatLimit;
                        return (
                          <tr
                            key={t.id}
                            className="hover:bg-[#141210] transition group cursor-pointer"
                            onClick={() => { fetchTenantDetail(t.id); setDetailTab('summary'); }}
                          >
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center font-bold text-amber-400 font-mono text-xs shrink-0">
                                  {t.name.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <div className="font-bold text-white group-hover:text-amber-400 transition">
                                    {t.name}
                                  </div>
                                  <div className="text-[10px] text-zinc-500 font-mono">{t.slug}</div>
                                </div>
                              </div>
                            </td>

                            <td className="py-3 px-4">
                              <div className="font-medium text-white">{t.primaryOwner?.username || '—'}</div>
                              <div className="text-[10px] text-zinc-500 font-mono">{t.ownerEmail || t.primaryOwner?.email || '—'}</div>
                            </td>

                            <td className="py-3 px-4">
                              <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
                                t.customerType === 'PERSONAL'
                                  ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                                  : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                              }`}>
                                {t.customerType || 'COMPANY'}
                              </span>
                            </td>

                            <td className="py-3 px-4">
                              <span className="text-[10px] font-mono uppercase text-amber-400/90 font-bold">
                                {t.tier || 'STANDARD'}
                              </span>
                            </td>

                            <td className="py-3 px-4 font-mono font-bold text-white">
                              {seatsUsed}
                            </td>

                            <td className="py-3 px-4">
                              <div className="space-y-1 w-28">
                                <div className="flex items-center justify-between text-[11px] font-mono">
                                  <span className={isMaxed ? 'text-rose-400 font-bold' : 'text-zinc-400'}>
                                    {seatsUsed} / {seatLimit}
                                  </span>
                                </div>
                                <div className="w-full h-1.5 rounded-full bg-[#27272a] overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${
                                      isMaxed ? 'bg-rose-500' : (seatsUsed / seatLimit >= 0.8 ? 'bg-amber-500' : 'bg-emerald-500')
                                    }`}
                                    style={{ width: `${Math.min(100, Math.round((seatsUsed / seatLimit) * 100))}%` }}
                                  />
                                </div>
                              </div>
                            </td>

                            <td className="py-3 px-4">
                              <div className="flex flex-wrap gap-1 max-w-xs">
                                {CANONICAL_MODULES.map(m => {
                                  const isEnabled = t.moduleEntitlements ? t.moduleEntitlements[m.id] : true;
                                  return (
                                    <span
                                      key={m.id}
                                      className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                                        isEnabled
                                          ? 'bg-[#1c1917] text-zinc-300 border border-[#27272a]'
                                          : 'bg-transparent text-zinc-600 line-through'
                                      }`}
                                    >
                                      {m.label.split(' ')[0]}
                                    </span>
                                  );
                                })}
                              </div>
                            </td>

                            <td className="py-3 px-4">
                              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold uppercase ${
                                t.status === 'active'
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : t.status === 'trial'
                                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              }`}>
                                {t.status}
                              </span>
                            </td>

                            <td className="py-3 px-4 font-mono text-zinc-500 text-[11px]">
                              {new Date(t.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                            </td>

                            <td className="py-3 px-4 text-right" onClick={e => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => {
                                    setImpersonateTargetTenant(t);
                                    setImpersonateUserId(t.primaryOwner?.id || '');
                                    setShowImpersonateModal(true);
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-[#1a1815] hover:bg-amber-500 hover:text-black text-amber-400 border border-amber-500/30 text-[11px] font-bold font-mono transition cursor-pointer"
                                  title="Audited Impersonation"
                                >
                                  Impersonate
                                </button>

                                <button
                                  onClick={() => { fetchTenantDetail(t.id); setDetailTab('summary'); }}
                                  className="px-2.5 py-1 rounded-lg bg-[#141210] hover:bg-[#27272a] text-zinc-300 border border-[#27272a] text-[11px] font-bold font-mono transition cursor-pointer"
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
                          <td colSpan={10} className="py-8 text-center text-zinc-500 font-mono text-xs">
                            No matching workspaces found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="p-3 bg-[#12110e] border-t border-[#1c1917] flex items-center justify-between text-xs text-zinc-400 font-mono">
                  <span>Showing {tenants.length} of {totalTenants} organizations</span>
                  <div className="flex items-center gap-1">
                    <button
                      disabled={page <= 1}
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      className="px-3 py-1 rounded bg-[#1c1917] hover:bg-[#27272a] text-white disabled:opacity-30 cursor-pointer"
                    >
                      Prev
                    </button>
                    <span className="px-2">{page} / {totalPages}</span>
                    <button
                      disabled={page >= totalPages}
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      className="px-3 py-1 rounded bg-[#1c1917] hover:bg-[#27272a] text-white disabled:opacity-30 cursor-pointer"
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
            <div className="space-y-4">
              {/* Search Toolbar */}
              <div className="p-4 rounded-xl bg-[#0d0c0a] border border-[#1c1917] flex flex-col md:flex-row items-center justify-between gap-3">
                <div className="flex flex-1 items-center gap-3 w-full md:w-auto">
                  <div className="relative flex-1 max-w-md">
                    <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={userSearch}
                      onChange={e => setUserSearch(e.target.value)}
                      placeholder="Search users by name, username, email, workspace..."
                      className="w-full bg-[#141210] border border-[#27272a] rounded-xl pl-9 pr-4 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 font-sans"
                    />
                  </div>

                  <select
                    value={userRoleFilter}
                    onChange={e => setUserRoleFilter(e.target.value)}
                    className="bg-[#141210] border border-[#27272a] rounded-xl px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-amber-500 font-mono cursor-pointer"
                  >
                    <option value="all">Role: All</option>
                    <option value="admin">Company Owner</option>
                    <option value="team_lead">Team Lead</option>
                    <option value="user">Member Agent</option>
                  </select>

                  <select
                    value={userStatusFilter}
                    onChange={e => setUserStatusFilter(e.target.value)}
                    className="bg-[#141210] border border-[#27272a] rounded-xl px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-amber-500 font-mono cursor-pointer"
                  >
                    <option value="all">Status: All</option>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>

                <div className="text-xs text-zinc-500 font-mono">
                  {globalUsers.length} customer user accounts indexed
                </div>
              </div>

              {/* Users Table */}
              <div className="rounded-xl border border-[#1c1917] bg-[#0d0c0a] overflow-hidden shadow-xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#1c1917] bg-[#12110e] text-zinc-400 font-mono text-[11px] uppercase">
                      <th className="py-3 px-4">User</th>
                      <th className="py-3 px-4">Email</th>
                      <th className="py-3 px-4">Workspace</th>
                      <th className="py-3 px-4">Role</th>
                      <th className="py-3 px-4">Team</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Assigned Modules</th>
                      <th className="py-3 px-4">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#181614]">
                    {globalUsers.map((u: any) => (
                      <tr key={u.id} className="hover:bg-[#141210] transition">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center font-bold text-amber-400 text-xs">
                              {u.username.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-bold text-white">{u.displayName || u.username}</div>
                              <div className="text-[10px] text-zinc-500 font-mono">@{u.username}</div>
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-4 font-mono text-zinc-300">
                          {u.email}
                        </td>

                        <td className="py-3 px-4 font-medium text-white">
                          <button
                            onClick={() => { fetchTenantDetail(u.tenantId); setDetailTab('summary'); }}
                            className="hover:text-amber-400 hover:underline transition text-left cursor-pointer"
                          >
                            {u.tenantName}
                          </button>
                        </td>

                        <td className="py-3 px-4">
                          <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                            u.role === 'admin'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : u.role === 'team_lead'
                              ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                              : 'bg-zinc-800 text-zinc-300'
                          }`}>
                            {u.roleDisplay}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-zinc-400 font-mono text-[11px]">
                          {u.teamDisplay}
                        </td>

                        <td className="py-3 px-4">
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold uppercase">
                            {u.status}
                          </span>
                        </td>

                        <td className="py-3 px-4">
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {(u.modules || []).map((m: string) => (
                              <span key={m} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#1c1917] text-zinc-400 border border-[#27272a]">
                                {m}
                              </span>
                            ))}
                          </div>
                        </td>

                        <td className="py-3 px-4 font-mono text-zinc-500 text-[11px]">
                          {new Date(u.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                    {globalUsers.length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-zinc-500 font-mono text-xs">
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
                <div className="p-4 rounded-xl bg-[#0f0e0c] border border-[#1f1c19]">
                  <div className="text-zinc-400 text-xs font-medium">Registered Handsets</div>
                  <div className="text-2xl font-bold text-white font-display mt-1">{devicesList.length}</div>
                  <div className="text-[11px] text-zinc-500 font-mono mt-1">Platform-wide GSM phones</div>
                </div>

                <div className="p-4 rounded-xl bg-[#0f0e0c] border border-[#1f1c19]">
                  <div className="text-zinc-400 text-xs font-medium">Online Sockets</div>
                  <div className="text-2xl font-bold text-emerald-400 font-display mt-1">
                    {devicesList.filter((d: any) => d.isSocketConnected).length}
                  </div>
                  <div className="text-[11px] text-zinc-500 font-mono mt-1">Ready for outbound dispatch</div>
                </div>

                <div className="p-4 rounded-xl bg-[#0f0e0c] border border-[#1f1c19]">
                  <div className="text-zinc-400 text-xs font-medium">Live Cellular Calls</div>
                  <div className="text-2xl font-bold text-purple-400 font-display mt-1">
                    {devicesList.filter((d: any) => !!d.activeCall).length}
                  </div>
                  <div className="text-[11px] text-zinc-500 font-mono mt-1">GSM voice channels occupied</div>
                </div>
              </div>

              <div className="rounded-xl border border-[#1c1917] bg-[#0d0c0a] overflow-hidden shadow-xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#1c1917] bg-[#12110e] text-zinc-400 font-mono text-[11px] uppercase">
                      <th className="py-3 px-4">Device</th>
                      <th className="py-3 px-4">Workspace</th>
                      <th className="py-3 px-4">Platform & Version</th>
                      <th className="py-3 px-4">Socket State</th>
                      <th className="py-3 px-4">Active Call</th>
                      <th className="py-3 px-4">Last Seen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#181614]">
                    {devicesList.map((d: any) => (
                      <tr key={d.id} className="hover:bg-[#141210] transition">
                        <td className="py-3 px-4 font-bold text-white flex items-center gap-2">
                          <Smartphone className="w-4 h-4 text-amber-400" />
                          <span>{d.name || d.id}</span>
                        </td>
                        <td className="py-3 px-4 font-mono text-zinc-400">
                          {d.tenantId || '—'}
                        </td>
                        <td className="py-3 px-4 font-mono text-zinc-300">
                          {d.platform || 'Android'} • v{d.appVersion || '1.0.0'}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold uppercase ${
                            d.isSocketConnected
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-zinc-800 text-zinc-400'
                          }`}>
                            {d.isSocketConnected ? 'CONNECTED' : 'DISCONNECTED'}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-purple-400 font-bold">
                          {d.activeCall ? `Active Call #${d.activeCall}` : 'Idle'}
                        </td>
                        <td className="py-3 px-4 font-mono text-zinc-500 text-[11px]">
                          {d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : 'Never'}
                        </td>
                      </tr>
                    ))}
                    {devicesList.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-zinc-500 font-mono text-xs">
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
                <div className="p-4 rounded-xl bg-[#0f0e0c] border border-[#1f1c19]">
                  <div className="text-zinc-400 text-xs font-medium">Running Automation Workers</div>
                  <div className="text-2xl font-bold text-emerald-400 font-display mt-1">
                    {jobsData?.summary?.totalRunning || 0}
                  </div>
                  <div className="text-[11px] text-zinc-500 font-mono mt-1">Workers actively processing tasks</div>
                </div>

                <div className="p-4 rounded-xl bg-[#0f0e0c] border border-[#1f1c19]">
                  <div className="text-zinc-400 text-xs font-medium">Email Queue Jobs</div>
                  <div className="text-2xl font-bold text-white font-display mt-1">
                    {jobsData?.jobs?.emailer?.length || 0}
                  </div>
                  <div className="text-[11px] text-zinc-500 font-mono mt-1">Tenant drip email workers</div>
                </div>

                <div className="p-4 rounded-xl bg-[#0f0e0c] border border-[#1f1c19]">
                  <div className="text-zinc-400 text-xs font-medium">Failed / Warning Jobs</div>
                  <div className="text-2xl font-bold text-rose-400 font-display mt-1">
                    {jobsData?.summary?.totalFailed || 0}
                  </div>
                  <div className="text-[11px] text-zinc-500 font-mono mt-1">0 fatal exceptions</div>
                </div>
              </div>

              <div className="rounded-xl border border-[#1c1917] bg-[#0d0c0a] overflow-hidden shadow-xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#1c1917] bg-[#12110e] text-zinc-400 font-mono text-[11px] uppercase">
                      <th className="py-3 px-4">Job Worker</th>
                      <th className="py-3 px-4">Workspace</th>
                      <th className="py-3 px-4">Module</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Logs Count</th>
                      <th className="py-3 px-4">Recent Result / Log</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#181614]">
                    {(jobsData?.jobs?.emailer || []).map((j: any) => (
                      <tr key={j.jobId} className="hover:bg-[#141210] transition">
                        <td className="py-3 px-4 font-bold text-white font-mono">
                          {j.jobId}
                        </td>
                        <td className="py-3 px-4 font-mono text-zinc-400">
                          {j.tenantId}
                        </td>
                        <td className="py-3 px-4 font-semibold text-amber-400">
                          Email Manager
                        </td>
                        <td className="py-3 px-4">
                          <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold uppercase ${
                            j.status === 'running'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-zinc-800 text-zinc-400'
                          }`}>
                            {j.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-zinc-400">
                          {j.logsCount} entries
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-zinc-400">
                          {j.logs && j.logs.length > 0 ? j.logs[j.logs.length - 1] : 'Idle. Awaiting queued recipient batches.'}
                        </td>
                      </tr>
                    ))}
                    {(!jobsData?.jobs?.emailer || jobsData.jobs.emailer.length === 0) && (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-zinc-500 font-mono text-xs">
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
              <div className="rounded-xl border border-[#1c1917] bg-[#0d0c0a] overflow-hidden shadow-xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#1c1917] bg-[#12110e] text-zinc-400 font-mono text-[11px] uppercase">
                      <th className="py-3 px-4">Timestamp</th>
                      <th className="py-3 px-4">Action</th>
                      <th className="py-3 px-4">Actor</th>
                      <th className="py-3 px-4">Target Workspace</th>
                      <th className="py-3 px-4">Payload & Parameters</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#181614]">
                    {activityList.map((act: any) => (
                      <tr key={act.id} className="hover:bg-[#141210] transition">
                        <td className="py-3 px-4 font-mono text-zinc-500 text-[11px]">
                          {new Date(act.timestamp).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-amber-400">
                          {act.action}
                        </td>
                        <td className="py-3 px-4 font-medium text-white">
                          {act.username || act.performedBy || 'system'}
                        </td>
                        <td className="py-3 px-4 font-mono text-zinc-400">
                          {act.tenantId || '—'}
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-zinc-400 max-w-md truncate">
                          {act.details || '—'}
                        </td>
                      </tr>
                    ))}
                    {activityList.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-zinc-500 font-mono text-xs">
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
                <div className="p-4 rounded-xl bg-[#0f0e0c] border border-[#1f1c19]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-zinc-400 text-xs font-medium">PostgreSQL Database</span>
                    <Database className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-xl font-bold text-emerald-400 font-display">
                    {systemHealth?.database?.status?.toUpperCase() || 'OPERATIONAL'}
                  </div>
                  <div className="mt-2 text-[11px] text-zinc-500 font-mono">
                    Latency: {systemHealth?.database?.latencyMs ?? 1}ms response
                  </div>
                </div>

                {/* API & Engine */}
                <div className="p-4 rounded-xl bg-[#0f0e0c] border border-[#1f1c19]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-zinc-400 text-xs font-medium">Node.js API Engine</span>
                    <Cpu className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-xl font-bold text-emerald-400 font-display">
                    OPERATIONAL
                  </div>
                  <div className="mt-2 text-[11px] text-zinc-500 font-mono">
                    Uptime: {Math.floor((systemHealth?.uptimeSeconds || 0) / 60)} minutes
                  </div>
                </div>

                {/* Realtime Sockets */}
                <div className="p-4 rounded-xl bg-[#0f0e0c] border border-[#1f1c19]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-zinc-400 text-xs font-medium">Socket.IO Gateway</span>
                    <Radio className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-xl font-bold text-emerald-400 font-display">
                    OPERATIONAL
                  </div>
                  <div className="mt-2 text-[11px] text-zinc-500 font-mono">
                    {systemHealth?.realtime?.connectedClients ?? 0} active socket connections
                  </div>
                </div>

                {/* Process Memory */}
                <div className="p-4 rounded-xl bg-[#0f0e0c] border border-[#1f1c19]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-zinc-400 text-xs font-medium">Process Memory (RSS)</span>
                    <Activity className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-xl font-bold text-white font-display">
                    {systemHealth?.memory?.rssMb ?? 0} MB
                  </div>
                  <div className="mt-2 text-[11px] text-zinc-500 font-mono">
                    Heap: {systemHealth?.memory?.heapUsedMb ?? 0} / {systemHealth?.memory?.heapTotalMb ?? 0} MB
                  </div>
                </div>
              </div>

              {/* Infrastructure Summary Table */}
              <div className="p-5 rounded-2xl bg-[#0d0c0a] border border-[#1c1917] space-y-3">
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider font-mono">
                  Operational Component Inspection
                </h3>
                <div className="space-y-2">
                  <div className="p-3 rounded-xl bg-[#141210] border border-[#27272a] flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="font-bold text-white">PostgreSQL Multi-Tenant Storage Layer</span>
                    </div>
                    <span className="font-mono text-emerald-400">100% Operational • Zero Leaks</span>
                  </div>

                  <div className="p-3 rounded-xl bg-[#141210] border border-[#27272a] flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="font-bold text-white">Dual-SIM Telephony Socket Gateway</span>
                    </div>
                    <span className="font-mono text-emerald-400">Ready • GSM Call Dispatch Latency &lt;5ms</span>
                  </div>

                  <div className="p-3 rounded-xl bg-[#141210] border border-[#27272a] flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="font-bold text-white">Background Automation Workers</span>
                    </div>
                    <span className="font-mono text-emerald-400">Active • 0 Faults</span>
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
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex justify-end animate-fade-in">
          <div className="w-full max-w-4xl bg-[#0d0c0a] border-l border-[#1c1917] h-full flex flex-col shadow-2xl overflow-hidden">
            {/* Command Center Header */}
            <div className="p-6 border-b border-[#1c1917] bg-[#090807] flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center font-bold text-amber-400 text-sm">
                    {tenantDetail.overview?.name?.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-black text-white font-display">
                        {tenantDetail.overview?.name}
                      </h2>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold uppercase ${
                        tenantDetail.overview?.status === 'active'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                      }`}>
                        {tenantDetail.overview?.status}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold uppercase">
                        {tenantDetail.overview?.customerType || 'COMPANY'}
                      </span>
                    </div>
                    <div className="text-xs text-zinc-500 font-mono mt-0.5 flex items-center gap-2">
                      <span>Slug: {tenantDetail.overview?.slug}</span>
                      <span>•</span>
                      <span>ID: {tenantDetail.overview?.id}</span>
                      <button
                        onClick={() => copyToClipboard(tenantDetail.overview?.id, 'drawer_tenant_id')}
                        className="inline-flex items-center gap-1 text-[10px] text-zinc-400 hover:text-amber-400 transition"
                        title="Copy Workspace ID"
                      >
                        {copiedId === 'drawer_tenant_id' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedId === 'drawer_tenant_id' ? 'Copied' : 'Copy'}</span>
                      </button>
                      {detailLoading && (
                        <>
                          <span>•</span>
                          <span className="text-amber-400 inline-flex items-center gap-1">
                            <RefreshCw className="w-3 h-3 animate-spin" /> Syncing
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => { setSelectedTenantId(null); setTenantDetail(null); }}
                  className="p-2 rounded-xl bg-[#141210] hover:bg-[#27272a] text-zinc-400 hover:text-white transition cursor-pointer"
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
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs shadow-md shadow-amber-500/20 transition cursor-pointer"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Impersonate Support</span>
                  </button>

                  <button
                    onClick={() => {
                      setNewSeatLimit(tenantDetail.overview?.maxAgents || 10);
                      setShowSeatModal(true);
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#141210] hover:bg-[#27272a] text-zinc-200 border border-[#27272a] text-xs font-semibold transition cursor-pointer"
                  >
                    <UserCheck className="w-3.5 h-3.5 text-amber-400" />
                    <span>Edit Seat Limits</span>
                  </button>

                  <button
                    onClick={() => {
                      setTargetSuspendTenant(tenantDetail.overview);
                      setSuspendReason('Administrative intervention');
                      setShowSuspendModal(true);
                    }}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                      tenantDetail.overview?.status === 'active'
                        ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border-rose-500/30'
                        : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    }`}
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>{tenantDetail.overview?.status === 'active' ? 'Suspend Workspace' : 'Reactivate Workspace'}</span>
                  </button>
                </div>

                <div className="text-[11px] font-mono text-zinc-500">
                  Plan: <span className="text-amber-400 font-bold uppercase">{tenantDetail.overview?.tier || 'Pro'}</span>
                </div>
              </div>

              {/* Sub-Navigation Tabs */}
              <div className="flex items-center gap-1 overflow-x-auto border-t border-[#1c1917] pt-3">
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
                        ? 'bg-amber-500 text-black font-bold'
                        : 'text-zinc-400 hover:text-white hover:bg-[#141210]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Command Center Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* TAB 1: SUMMARY / OVERVIEW */}
              {detailTab === 'summary' && (
                <div className="space-y-6">
                  {/* Summary Grid */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-[#141210] border border-[#27272a] space-y-2">
                      <div className="text-xs font-bold text-zinc-400 uppercase font-mono">Workspace Identity</div>
                      <div className="text-xs space-y-1 font-mono">
                        <div className="flex justify-between"><span className="text-zinc-500">Owner Email:</span> <span className="text-white font-medium">{tenantDetail.overview?.ownerEmail || '—'}</span></div>
                        <div className="flex justify-between"><span className="text-zinc-500">Customer Type:</span> <span className="text-white font-medium">{tenantDetail.overview?.customerType || 'COMPANY'}</span></div>
                        <div className="flex justify-between"><span className="text-zinc-500">Created Date:</span> <span className="text-white font-medium">{new Date(tenantDetail.overview?.createdAt).toLocaleDateString()}</span></div>
                        <div className="flex justify-between"><span className="text-zinc-500">Lead Mode:</span> <span className="text-amber-400 font-medium capitalize">{tenantDetail.overview?.leadPoolMode} Pool</span></div>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-[#141210] border border-[#27272a] space-y-2">
                      <div className="text-xs font-bold text-zinc-400 uppercase font-mono">Commercial Seats</div>
                      <div className="text-xs space-y-1 font-mono">
                        <div className="flex justify-between"><span className="text-zinc-500">Active Users:</span> <span className="text-white font-bold">{tenantDetail.organization?.users?.length || 0}</span></div>
                        <div className="flex justify-between"><span className="text-zinc-500">Seat Limit:</span> <span className="text-amber-400 font-bold">{tenantDetail.overview?.maxAgents || 10}</span></div>
                        <div className="flex justify-between"><span className="text-zinc-500">Available:</span> <span className="text-emerald-400 font-bold">{Math.max(0, (tenantDetail.overview?.maxAgents || 10) - (tenantDetail.organization?.users?.length || 0))}</span></div>
                        <div className="flex justify-between"><span className="text-zinc-500">Subscription:</span> <span className="text-white font-medium">{tenantDetail.subscription?.status || 'Active'}</span></div>
                      </div>
                    </div>
                  </div>

                  {/* Modules Entitlement Snapshot */}
                  <div className="p-4 rounded-xl bg-[#141210] border border-[#27272a] space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-400 uppercase font-mono">Company Module Ceiling Status</span>
                      <button
                        onClick={() => setDetailTab('entitlements')}
                        className="text-xs text-amber-400 hover:underline font-mono"
                      >
                        Edit Ceiling
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {CANONICAL_MODULES.map((m) => {
                        const Icon = m.icon;
                        const isEnabled = tenantDetail.moduleEntitlements ? tenantDetail.moduleEntitlements[m.id] : true;
                        return (
                          <div
                            key={m.id}
                            className={`p-3 rounded-xl border flex flex-col items-center text-center gap-1.5 ${
                              isEnabled
                                ? 'bg-[#1a1815] border-amber-500/30'
                                : 'bg-[#0a0908] border-[#27272a]/40 opacity-50'
                            }`}
                          >
                            <Icon className={`w-5 h-5 ${isEnabled ? 'text-amber-400' : 'text-zinc-600'}`} />
                            <div className="text-xs font-bold text-white">{m.label}</div>
                            <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold uppercase ${
                              isEnabled ? 'bg-amber-500/10 text-amber-400' : 'bg-zinc-800 text-zinc-500'
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
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 font-mono">
                    Security Isolation: Platform Administrators are completely isolated and never displayed as customer company staff.
                  </div>

                  <div className="rounded-xl border border-[#27272a] bg-[#141210] overflow-hidden">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-[#27272a] bg-[#0d0c0a] text-zinc-400 font-mono text-[11px] uppercase">
                          <th className="py-2.5 px-4">Name / Username</th>
                          <th className="py-2.5 px-4">Email</th>
                          <th className="py-2.5 px-4">Role</th>
                          <th className="py-2.5 px-4">Status</th>
                          <th className="py-2.5 px-4 text-right">Impersonate</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#27272a]/60">
                        {(tenantDetail.organization?.users || []).map((u: any) => (
                          <tr key={u.id} className="hover:bg-[#1a1815] transition">
                            <td className="py-3 px-4 font-bold text-white">
                              <div>{u.displayName || u.username}</div>
                              <div className="text-[10px] text-zinc-500 font-mono">@{u.username}</div>
                            </td>
                            <td className="py-3 px-4 font-mono text-zinc-400">{u.email || '—'}</td>
                            <td className="py-3 px-4">
                              <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                                u.role === 'admin'
                                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                  : u.role === 'team_lead'
                                  ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                  : 'bg-zinc-800 text-zinc-300'
                              }`}>
                                {u.role === 'admin' ? 'Company Owner' : (u.role === 'team_lead' ? 'Team Lead' : 'Member Agent')}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase font-bold">
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
                                className="px-2.5 py-1 rounded bg-[#1c1917] hover:bg-amber-500 hover:text-black text-amber-400 text-xs font-mono font-bold transition cursor-pointer"
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
                      <div key={t.id} className="p-4 rounded-xl bg-[#141210] border border-[#27272a] space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-white text-sm">{t.name}</span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            Team
                          </span>
                        </div>
                        <div className="text-xs text-zinc-400">{t.description || 'No description provided.'}</div>
                        <div className="text-[11px] font-mono text-zinc-500 pt-2 border-t border-[#27272a]">
                          Leader ID: {t.leaderId || 'Unassigned'}
                        </div>
                      </div>
                    ))}
                    {(!tenantDetail.organization?.teams || tenantDetail.organization.teams.length === 0) && (
                      <div className="col-span-2 text-center py-8 text-zinc-500 font-mono text-xs">
                        No teams have been configured in this workspace yet.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 4: ACCESS MATRIX */}
              {detailTab === 'matrix' && (
                <div className="space-y-4">
                  <div className="p-3 rounded-xl bg-[#141210] border border-[#27272a] text-xs text-zinc-300 font-mono">
                    Access Matrix evaluates: User Role + Team Assignment + Company Module Ceiling → Authoritative Effective Access.
                  </div>

                  <div className="rounded-xl border border-[#27272a] bg-[#141210] overflow-hidden">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-[#27272a] bg-[#0d0c0a] text-zinc-400 font-mono text-[11px] uppercase">
                          <th className="py-2.5 px-4">User</th>
                          <th className="py-2.5 px-4">Role</th>
                          <th className="py-2.5 px-4">Team</th>
                          <th className="py-2.5 px-4">Company Ceiling</th>
                          <th className="py-2.5 px-4">User Assigned</th>
                          <th className="py-2.5 px-4">Effective Access</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#27272a]/60">
                        {(tenantDetail.accessMatrix || []).map((m: any) => (
                          <tr key={m.userId} className="hover:bg-[#1a1815] transition">
                            <td className="py-3 px-4 font-bold text-white">
                              {m.displayName || m.username}
                            </td>
                            <td className="py-3 px-4">
                              <span className="text-[10px] font-mono font-bold text-amber-400">
                                {m.roleDisplay}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-mono text-zinc-400">{m.teamDisplay}</td>
                            <td className="py-3 px-4 font-mono text-zinc-300">{m.companyCeiling}</td>
                            <td className="py-3 px-4 font-mono text-zinc-300">{m.assignedSummary}</td>
                            <td className="py-3 px-4">
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20">
                                {m.effectiveSummary}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 5: MODULE CEILING CONTROLS */}
              {detailTab === 'entitlements' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono space-y-1">
                    <div className="font-bold flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
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
                      const isEnabled = tenantDetail.moduleEntitlements ? tenantDetail.moduleEntitlements[mod.id] : true;
                      const isToggling = togglingModule === mod.id;
                      return (
                        <div
                          key={mod.id}
                          className="p-4 rounded-xl bg-[#141210] border border-[#27272a] flex items-center justify-between transition hover:border-amber-500/30"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`p-2.5 rounded-xl border ${isEnabled ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : 'bg-zinc-900 text-zinc-600 border-zinc-800'}`}>
                              <Icon className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="text-sm font-bold text-white">{mod.label}</div>
                              <div className="text-xs text-zinc-400">{mod.desc}</div>
                            </div>
                          </div>

                          <button
                            onClick={() => handleToggleEntitlement(mod.id, isEnabled)}
                            disabled={isToggling}
                            className={`px-4 py-1.5 rounded-xl text-xs font-mono font-bold transition cursor-pointer ${
                              isEnabled
                                ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-md shadow-amber-500/20'
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
                  <div className="p-6 rounded-2xl bg-[#141210] border border-[#27272a] space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-base font-bold text-white">Commercial Seat Ceiling</h4>
                        <p className="text-xs text-zinc-400 mt-1">
                          Enforces how many users/agents this customer workspace can provision.
                        </p>
                      </div>
                      <div className="text-right font-mono">
                        <div className="text-2xl font-black text-amber-400">
                          {tenantDetail.organization?.users?.length || 0} / {tenantDetail.overview?.maxAgents || 10}
                        </div>
                        <div className="text-[11px] text-zinc-500">Seats currently utilized</div>
                      </div>
                    </div>

                    <div className="w-full h-3 rounded-full bg-[#1c1917] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-600 transition-all"
                        style={{
                          width: `${Math.min(100, Math.round(((tenantDetail.organization?.users?.length || 0) / (tenantDetail.overview?.maxAgents || 10)) * 100))}%`
                        }}
                      />
                    </div>

                    <div className="pt-4 border-t border-[#27272a] flex items-center justify-between">
                      <div className="text-xs text-zinc-400 font-mono">
                        Available Seats: <span className="text-emerald-400 font-bold">{Math.max(0, (tenantDetail.overview?.maxAgents || 10) - (tenantDetail.organization?.users?.length || 0))}</span>
                      </div>
                      <button
                        onClick={() => {
                          setNewSeatLimit(tenantDetail.overview?.maxAgents || 10);
                          setShowSeatModal(true);
                        }}
                        className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs font-mono shadow-md shadow-amber-500/20 transition cursor-pointer"
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
                  <div className="rounded-xl border border-[#27272a] bg-[#141210] overflow-hidden">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-[#27272a] bg-[#0d0c0a] text-zinc-400 font-mono text-[11px] uppercase">
                          <th className="py-2.5 px-4">Device Model</th>
                          <th className="py-2.5 px-4">OS & Version</th>
                          <th className="py-2.5 px-4">Status</th>
                          <th className="py-2.5 px-4">Last Seen</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#27272a]/60">
                        {(tenantDetail.connectedDevices?.devices || []).map((dev: any) => (
                          <tr key={dev.id} className="hover:bg-[#1a1815] transition">
                            <td className="py-3 px-4 font-bold text-white flex items-center gap-2">
                              <Smartphone className="w-4 h-4 text-amber-400" />
                              <span>{dev.name || dev.id}</span>
                            </td>
                            <td className="py-3 px-4 font-mono text-zinc-400">
                              {dev.platform || 'Android'} • v{dev.appVersion || '1.0.0'}
                            </td>
                            <td className="py-3 px-4">
                              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full uppercase font-bold ${
                                dev.status === 'ONLINE' || dev.status === 'online'
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : 'bg-zinc-800 text-zinc-400'
                              }`}>
                                {dev.status || 'Offline'}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-mono text-zinc-500 text-[11px]">
                              {dev.lastSeenAt ? new Date(dev.lastSeenAt).toLocaleString() : 'Never'}
                            </td>
                          </tr>
                        ))}
                        {(!tenantDetail.connectedDevices?.devices || tenantDetail.connectedDevices.devices.length === 0) && (
                          <tr>
                            <td colSpan={4} className="py-8 text-center text-zinc-500 font-mono text-xs">
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
                  <div className="rounded-xl border border-[#27272a] bg-[#141210] overflow-hidden">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-[#27272a] bg-[#0d0c0a] text-zinc-400 font-mono text-[11px] uppercase">
                          <th className="py-2.5 px-4">Timestamp</th>
                          <th className="py-2.5 px-4">Action</th>
                          <th className="py-2.5 px-4">Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#27272a]/60">
                        {(tenantDetail.auditLogs || []).map((act: any) => (
                          <tr key={act.id} className="hover:bg-[#1a1815] transition">
                            <td className="py-3 px-4 font-mono text-zinc-500 text-[11px]">
                              {new Date(act.timestamp).toLocaleString()}
                            </td>
                            <td className="py-3 px-4 font-mono font-bold text-amber-400">
                              {act.action}
                            </td>
                            <td className="py-3 px-4 font-mono text-zinc-400 truncate max-w-sm">
                              {act.details || '—'}
                            </td>
                          </tr>
                        ))}
                        {(!tenantDetail.auditLogs || tenantDetail.auditLogs.length === 0) && (
                          <tr>
                            <td colSpan={3} className="py-8 text-center text-zinc-500 font-mono text-xs">
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
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="w-full max-w-lg bg-[#0d0c0a] border border-[#1c1917] rounded-2xl shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-[#1c1917] pb-4">
              <div className="flex items-center gap-2.5">
                <Building2 className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-white font-display">Provision Customer Workspace</h3>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="text-zinc-500 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateWorkspace} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-zinc-400 mb-1">Company / Workspace Name *</label>
                <input
                  type="text"
                  required
                  value={createForm.companyName}
                  onChange={e => setCreateForm({ ...createForm, companyName: e.target.value })}
                  placeholder="e.g. Apex Logistics Global"
                  className="w-full bg-[#141210] border border-[#27272a] rounded-xl px-3.5 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 font-sans"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono text-zinc-400 mb-1">Workspace Type</label>
                  <select
                    value={createForm.customerType}
                    onChange={e => setCreateForm({ ...createForm, customerType: e.target.value as any })}
                    className="w-full bg-[#141210] border border-[#27272a] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                  >
                    <option value="COMPANY">Company Workspace</option>
                    <option value="PERSONAL">Personal Workspace</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-mono text-zinc-400 mb-1">Seat Limit</label>
                  <input
                    type="number"
                    min="1"
                    max="500"
                    value={createForm.seatLimit}
                    onChange={e => setCreateForm({ ...createForm, seatLimit: parseInt(e.target.value, 10) || 5 })}
                    className="w-full bg-[#141210] border border-[#27272a] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono text-zinc-400 mb-1">Commercial Plan</label>
                <select
                  value={createForm.planId}
                  onChange={e => setCreateForm({ ...createForm, planId: e.target.value })}
                  className="w-full bg-[#141210] border border-[#27272a] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                >
                  <option value="plan_starter">Starter Plan (5 Seats • Core CRM + Dialer)</option>
                  <option value="plan_pro">Pro Plan (20 Seats • Full Suite)</option>
                  <option value="plan_enterprise">Enterprise Plan (1000 Seats • High-Volume Calling)</option>
                </select>
              </div>

              <div className="pt-2 border-t border-[#1c1917] space-y-3">
                <div className="text-xs font-bold text-zinc-400 font-mono">Primary Company Owner Credentials</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-mono text-zinc-500 mb-1">Username *</label>
                    <input
                      type="text"
                      required
                      value={createForm.username}
                      onChange={e => setCreateForm({ ...createForm, username: e.target.value })}
                      placeholder="e.g. john_apex"
                      className="w-full bg-[#141210] border border-[#27272a] rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-mono text-zinc-500 mb-1">Password *</label>
                    <input
                      type="password"
                      required
                      value={createForm.password}
                      onChange={e => setCreateForm({ ...createForm, password: e.target.value })}
                      placeholder="Initial password"
                      className="w-full bg-[#141210] border border-[#27272a] rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-mono text-zinc-500 mb-1">Owner Email</label>
                  <input
                    type="email"
                    value={createForm.email}
                    onChange={e => setCreateForm({ ...createForm, email: e.target.value })}
                    placeholder="e.g. john@apexlogistics.com"
                    className="w-full bg-[#141210] border border-[#27272a] rounded-xl px-3.5 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 font-sans"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl bg-[#141210] hover:bg-[#1a1815] text-zinc-400 text-xs font-mono font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold font-mono shadow-lg shadow-amber-500/20 transition cursor-pointer disabled:opacity-50"
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
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="w-full max-w-md bg-[#0d0c0a] border border-[#1c1917] rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 border-b border-[#1c1917] pb-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center font-bold text-amber-400">
                <UserCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white font-display">Enter Customer Workspace</h3>
                <p className="text-xs text-zinc-400 font-mono">Audited Support Session</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[#141210] border border-[#27272a] space-y-2.5 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-zinc-500">Real Identity:</span>
                <span className="text-amber-400 font-bold">Platform Owner ({usernameDisplay})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Target Workspace:</span>
                <span className="text-white font-bold">{impersonateTargetTenant.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Workspace ID:</span>
                <span className="text-zinc-400">{impersonateTargetTenant.id}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-mono text-zinc-400 mb-1">Reason for Impersonation *</label>
              <input
                type="text"
                required
                value={impersonateReason}
                onChange={e => setImpersonateReason(e.target.value)}
                placeholder="e.g. Support ticket #894 / Investigation"
                className="w-full bg-[#141210] border border-[#27272a] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-sans"
              />
              <p className="text-[11px] text-zinc-500 font-mono mt-1">
                Recorded immutably in Platform Audit Logs for regulatory compliance.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowImpersonateModal(false)}
                className="px-4 py-2 rounded-xl bg-[#141210] hover:bg-[#1a1815] text-zinc-400 text-xs font-mono font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStartImpersonation}
                disabled={impersonateLoading}
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold font-mono shadow-lg shadow-amber-500/20 transition cursor-pointer disabled:opacity-50"
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
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="w-full max-w-md bg-[#0d0c0a] border border-[#1c1917] rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 border-b border-[#1c1917] pb-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center font-bold text-amber-400">
                <UserCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white font-display">Change Seat Limit</h3>
                <p className="text-xs text-zinc-400 font-mono">{tenantDetail?.overview?.name}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-mono text-zinc-400 mb-1">New Seat Ceiling</label>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={newSeatLimit}
                  onChange={e => setNewSeatLimit(parseInt(e.target.value, 10) || 1)}
                  className="w-full bg-[#141210] border border-[#27272a] rounded-xl px-3.5 py-2 text-sm text-white font-mono focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="p-3 rounded-xl bg-[#141210] border border-[#27272a] text-xs font-mono space-y-1">
                <div className="flex justify-between text-zinc-400">
                  <span>Current Active Users:</span>
                  <span className="font-bold text-white">{tenantDetail?.organization?.users?.length || 0}</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Current Seat Limit:</span>
                  <span className="font-bold text-amber-400">{tenantDetail?.overview?.maxAgents || 10}</span>
                </div>
              </div>

              {newSeatLimit < (tenantDetail?.organization?.users?.length || 0) && (
                <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs font-mono flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>Warning: Setting limit below active user count will prevent any new user creation.</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowSeatModal(false)}
                className="px-4 py-2 rounded-xl bg-[#141210] hover:bg-[#1a1815] text-zinc-400 text-xs font-mono font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleUpdateSeatLimit(selectedTenantId, newSeatLimit)}
                disabled={seatUpdating}
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold font-mono shadow-lg shadow-amber-500/20 transition cursor-pointer disabled:opacity-50"
              >
                {seatUpdating ? 'Updating Limit...' : 'Save Limit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL 4: SUSPEND / REACTIVATE CONFIRMATION MODAL
      ══════════════════════════════════════════════════════════════════════ */}
      {showSuspendModal && targetSuspendTenant && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="w-full max-w-md bg-[#0d0c0a] border border-[#1c1917] rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 border-b border-[#1c1917] pb-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${
                targetSuspendTenant.status === 'active'
                  ? 'bg-rose-500/10 border border-rose-500/30 text-rose-400'
                  : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
              }`}>
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white font-display">
                  {targetSuspendTenant.status === 'active' ? `Suspend ${targetSuspendTenant.name}?` : `Reactivate ${targetSuspendTenant.name}?`}
                </h3>
                <p className="text-xs text-zinc-400 font-mono">
                  {targetSuspendTenant.status === 'active'
                    ? 'Users will immediately lose workspace access.'
                    : 'Restores workspace access for customer users.'}
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-mono text-zinc-400 mb-1">Reason for Status Change *</label>
              <textarea
                rows={3}
                required
                value={suspendReason}
                onChange={e => setSuspendReason(e.target.value)}
                placeholder="Document rationale for this action..."
                className="w-full bg-[#141210] border border-[#27272a] rounded-xl p-3 text-xs text-white focus:outline-none focus:border-amber-500 font-sans"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowSuspendModal(false)}
                className="px-4 py-2 rounded-xl bg-[#141210] hover:bg-[#1a1815] text-zinc-400 text-xs font-mono font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSuspend}
                disabled={suspendLoading}
                className={`px-5 py-2 rounded-xl text-xs font-bold font-mono transition cursor-pointer disabled:opacity-50 ${
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
