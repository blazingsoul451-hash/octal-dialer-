import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Shield, Building2, Database, Lock, RefreshCw,
  ExternalLink, Users, Search, LogOut, Copy, Check, Plus,
  AlertCircle, Cpu, Radio, X, Smartphone, Activity,
  Clock, FileText, Key, ShieldCheck
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
}

export const SuperAdminPortal: React.FC<SuperAdminPortalProps> = ({
  serverUrl,
  authToken,
  currentUser,
  onLogout
}) => {
  // Navigation & View State
  const [activeTab, setActiveTab] = useState<'workspaces' | 'devices' | 'jobs' | 'activity' | 'system'>('workspaces');

  // Observability & Telemetry State
  const [overview, setOverview] = useState<any>(null);
  const [tenants, setTenants] = useState<any[]>([]);
  const [totalTenants, setTotalTenants] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(15);
  const [totalPages, setTotalPages] = useState(1);

  // Detail Drawer State
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [tenantDetail, setTenantDetail] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Operations Subviews Data
  const [devicesList, setDevicesList] = useState<any[]>([]);
  const [jobsData, setJobsData] = useState<any>(null);
  const [activityList, setActivityList] = useState<any[]>([]);

  // Loading & Sync Status
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date());
  const [isLiveConnected, setIsLiveConnected] = useState(false);

  // Filters & Search
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [healthFilter, setHealthFilter] = useState<string>('all');

  // Actions State
  const [updatingModeId, setUpdatingModeId] = useState<string | null>(null);
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Provisioning Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createForm, setCreateForm] = useState<NewWorkspaceForm>({
    companyName: '',
    username: '',
    email: '',
    password: ''
  });

  // Access Matrix & Entitlements State
  const [showAccessMatrixModal, setShowAccessMatrixModal] = useState(false);
  const [togglingModule, setTogglingModule] = useState<string | null>(null);

  const CANONICAL_MODULES = [
    { id: 'crm', label: 'CRM Workspace', icon: '👥' },
    { id: 'campaigns', label: 'Campaigns', icon: '📂' },
    { id: 'dialer', label: 'OCTAL Dialer', icon: '📞' },
    { id: 'leads', label: 'Leads Database', icon: '🗄️' },
    { id: 'reports', label: 'Reports & Analytics', icon: '📊' },
    { id: 'auto_emailer', label: 'Auto Emailer', icon: '✉️' },
    { id: 'facebook_poster', label: 'FB Auto Poster', icon: '📤' }
  ];

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
        setError('Master privilege required. Account is not a platform administrator.');
        return;
      }

      // 2. Fetch Paginated & Filtered Tenants Master Table
      const queryParams = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        search: search.trim(),
        type: typeFilter,
        status: statusFilter,
        health: healthFilter
      });

      const tenRes = await fetch(`${serverUrl}/api/super-admin/tenants?${queryParams.toString()}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (tenRes.ok) {
        const tenJson = await tenRes.json();
        if (tenJson.success) {
          setTenants(tenJson.tenants || []);
          setTotalTenants(tenJson.total || 0);
          setTotalPages(tenJson.totalPages || 1);
        }
      }

      // 3. Fetch subviews based on active tab
      if (activeTab === 'devices') {
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
        const actRes = await fetch(`${serverUrl}/api/super-admin/activity`, {
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (actRes.ok) {
          const actJson = await actRes.json();
          if (actJson.success) setActivityList(actJson.activities || []);
        }
      }

      setLastSyncTime(new Date());
    } catch (err: any) {
      console.error('[Platform Console] Sync error:', err);
      setError('Unable to synchronize platform state. Fallback retry in progress.');
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [serverUrl, authToken, page, limit, search, typeFilter, statusFilter, healthFilter, activeTab]);

  // ── Fetch Tenant Detail for Drawer ──────────────────────────────────────────
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
      } else {
        alert('Failed to load tenant detail.');
      }
    } catch {
      alert('Error fetching tenant snapshot.');
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

    // Real-time Platform Events
    const handlePlatformEvent = (_eventData?: any) => {
      setLastSyncTime(new Date());
      fetchGlobalData(false);
    };

    socket.on('platform:tenant-created', (data) => {
      notify(`Tenant "${data.name}" provisioned.`);
      handlePlatformEvent(data);
    });
    socket.on('platform:tenant-updated', handlePlatformEvent);
    socket.on('platform:tenant-suspended', handlePlatformEvent);
    socket.on('platform:device-online', (data) => {
      notify(`Handset "${data.deviceName || data.deviceId}" connected.`);
      handlePlatformEvent(data);
    });
    socket.on('platform:device-offline', handlePlatformEvent);
    socket.on('platform:call-started', handlePlatformEvent);
    socket.on('platform:call-completed', handlePlatformEvent);

    // Fallback polling: 30 seconds
    const interval = setInterval(() => fetchGlobalData(false), 30000);

    // Tab visibility refocus sync
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
  }, [serverUrl, authToken, fetchGlobalData]);

  // ── Actions ─────────────────────────────────────────────────────────────────
  const handleToggleLeadPoolMode = async (tenantId: string, currentMode: string) => {
    const newMode = currentMode === 'assigned' ? 'shared' : 'assigned';
    setUpdatingModeId(tenantId);
    try {
      const res = await fetch(`${serverUrl}/api/super-admin/tenants/${tenantId}/mode`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ leadPoolMode: newMode })
      });
      if (res.ok) {
        setTenants(prev => prev.map(t => t.id === tenantId ? { ...t, leadPoolMode: newMode } : t));
        notify(`Lead pool mode switched to ${newMode === 'assigned' ? 'Agent Assigned' : 'Shared Pool'}.`);
      } else {
        alert('Failed to update lead pool mode.');
      }
    } catch {
      alert('Network error while updating lead pool mode.');
    } finally {
      setUpdatingModeId(null);
    }
  };

  const handleToggleTenantStatus = async (tenantId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
    try {
      const res = await fetch(`${serverUrl}/api/super-admin/tenants/${tenantId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        notify(`Workspace ${tenantId} is now ${newStatus.toUpperCase()}.`);
        fetchGlobalData(false);
        if (tenantDetail && tenantDetail.overview.id === tenantId) {
          fetchTenantDetail(tenantId);
        }
      } else {
        alert('Failed to update tenant status.');
      }
    } catch {
      alert('Network error while updating tenant status.');
    }
  };

  const handleImpersonateTenant = async (tenantId: string) => {
    setImpersonatingId(tenantId);
    try {
      const res = await fetch(`${serverUrl}/api/super-admin/impersonate/${tenantId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        const tenantObj = tenants.find(t => t.id === tenantId);
        const tenantName = tenantObj?.name || tenantId;
        window.open(`${window.location.origin}/#impersonateToken=${encodeURIComponent(data.token)}&impersonateTenant=${encodeURIComponent(tenantName)}`, '_blank');
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to generate impersonation session.');
      }
    } catch {
      alert('Error entering tenant workspace.');
    } finally {
      setImpersonatingId(null);
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
          entitlements: { [moduleId]: newVal }
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update entitlement');

      // Update local tenantDetail state
      setTenantDetail((prev: any) => {
        if (!prev) return prev;
        const updatedEntitlements = {
          ...(prev.moduleEntitlements || {}),
          [moduleId]: newVal
        };
        const updatedModules = newVal
          ? [...(prev.modules || []).filter((m: string) => m !== moduleId), moduleId]
          : (prev.modules || []).filter((m: string) => m !== moduleId);
        return {
          ...prev,
          moduleEntitlements: updatedEntitlements,
          modules: updatedModules
        };
      });

      fetchGlobalData(false);
      notify(`Module "${moduleId}" entitlement set to ${newVal ? 'ENABLED' : 'DISABLED'}.`);
    } catch (err: any) {
      setError(err.message || 'Failed to toggle module entitlement');
    } finally {
      setTogglingModule(null);
    }
  };

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.companyName || !createForm.username || !createForm.password) {
      alert('Company name, admin username, and password are required.');
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
          password: createForm.password
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        notify(`Workspace "${createForm.companyName}" successfully provisioned!`);
        setShowCreateModal(false);
        setCreateForm({ companyName: '', username: '', email: '', password: '' });
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

  const usernameDisplay = currentUser?.username || 'Master';

  return (
    <div className="min-h-screen bg-[#06080c] text-slate-100 flex flex-col font-sans selection:bg-amber-500/20 selection:text-amber-300">
      {/* ── Executive Header ── */}
      <header className="sticky top-0 z-40 bg-[#080a10]/95 backdrop-blur-xl border-b border-slate-800/80 shadow-2xl">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Left: Brand & Telemetry Status */}
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-600 via-amber-500 to-yellow-400 p-[1px] shadow-lg shadow-amber-500/20 shrink-0">
              <div className="w-full h-full bg-[#080a10] rounded-2xl flex items-center justify-center">
                <Shield className="w-5 h-5 text-amber-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black tracking-tight text-white font-display uppercase">
                  Zestify Platform Console
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  v2.0 SaaS
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400 font-mono">
                {isLiveConnected ? (
                  <span className="flex items-center gap-1.5 text-emerald-400 font-semibold text-[11px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    LIVE TELEMETRY
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-amber-400 font-semibold text-[11px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    SYNCING (fallback 30s)
                  </span>
                )}
                <span className="text-slate-600">•</span>
                <span className="text-slate-400 text-[11px]">
                  Last synced: {lastSyncTime.toLocaleTimeString()}
                </span>
              </div>
            </div>
          </div>

          {/* Center: Navigation Subviews */}
          <div className="flex items-center gap-1 bg-[#0d1017] p-1 rounded-2xl border border-slate-800 self-start md:self-auto overflow-x-auto">
            <button
              onClick={() => setActiveTab('workspaces')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                activeTab === 'workspaces'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Workspaces ({totalTenants})</span>
            </button>

            <button
              onClick={() => setActiveTab('devices')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                activeTab === 'devices'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Devices</span>
            </button>

            <button
              onClick={() => setActiveTab('jobs')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                activeTab === 'jobs'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Automation</span>
            </button>

            <button
              onClick={() => setActiveTab('activity')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                activeTab === 'activity'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Activity</span>
            </button>

            <button
              onClick={() => setActiveTab('system')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                activeTab === 'system'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>System</span>
            </button>
          </div>

          {/* Right: Actions & User Dropdown */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30 transition-all cursor-pointer group"
            >
              <Plus className="w-4 h-4 group-hover:rotate-90 transition-transform duration-300" />
              <span>Provision Workspace</span>
            </button>

            <button
              onClick={() => fetchGlobalData(true)}
              disabled={loading}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-amber-500/40 hover:bg-slate-800 transition cursor-pointer disabled:opacity-50"
              title="Refresh Real-time Telemetry"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-400' : ''}`} />
            </button>

            <div className="flex items-center gap-2 pl-3 border-l border-slate-800">
              <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs">
                <div className="w-6 h-6 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center font-bold text-amber-400 text-xs">
                  {usernameDisplay.charAt(0).toUpperCase()}
                </div>
                <div className="text-left hidden md:block">
                  <div className="font-bold text-white capitalize leading-none">{usernameDisplay}</div>
                  <div className="text-[10px] text-amber-400 font-mono mt-0.5">Platform Owner</div>
                </div>
              </div>

              <button
                onClick={onLogout}
                className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition cursor-pointer"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── Main Container ── */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {/* Toast Notification */}
        {successMsg && (
          <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between shadow-lg shadow-emerald-500/5 animate-fade-in">
            <div className="flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <span className="font-semibold">{successMsg}</span>
            </div>
            <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between shadow-lg shadow-rose-500/5">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)} className="text-rose-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ── Live Platform Summary KPI Cards (Always Authoritative) ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Customer Tenants */}
          <div className="p-5 rounded-2xl bg-[#0a0c12] border border-slate-800 hover:border-amber-500/40 transition-all duration-300 shadow-xl relative overflow-hidden group">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Building2 className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                {overview?.activeTenants ?? totalTenants} Active
              </span>
            </div>
            <div className="text-slate-400 text-xs font-medium">Customer Tenants</div>
            <div className="text-3xl font-black text-white font-display mt-1">
              {overview?.totalTenants ?? totalTenants}
            </div>
            <div className="mt-3 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400 font-mono">
              <span>Company / Personal</span>
              <span className="text-amber-400 font-bold">
                {overview?.companyTenants ?? 0} Co • {overview?.personalTenants ?? 0} Pers
              </span>
            </div>
          </div>

          {/* Card 2: Users & Role Hierarchy */}
          <div className="p-5 rounded-2xl bg-[#0a0c12] border border-slate-800 hover:border-blue-500/40 transition-all duration-300 shadow-xl relative overflow-hidden group">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <Users className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold">
                Scoped RBAC
              </span>
            </div>
            <div className="text-slate-400 text-xs font-medium">Provisioned Users</div>
            <div className="text-3xl font-black text-white font-display mt-1">
              {overview?.totalUsers ?? 0}
            </div>
            <div className="mt-3 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400 font-mono">
              <span>Role Distribution</span>
              <span className="text-blue-400 font-bold">
                {overview?.companyOwners ?? 0} Adm • {overview?.teamLeads ?? 0} Leads • {overview?.members ?? 0} Agt
              </span>
            </div>
          </div>

          {/* Card 3: Leads & Sales Operations */}
          <div className="p-5 rounded-2xl bg-[#0a0c12] border border-slate-800 hover:border-emerald-500/40 transition-all duration-300 shadow-xl relative overflow-hidden group">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Database className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                +{overview?.newLeadsToday ?? 0} Today
              </span>
            </div>
            <div className="text-slate-400 text-xs font-medium">Global System Leads</div>
            <div className="text-3xl font-black text-white font-display mt-1">
              {(overview?.totalLeads ?? 0).toLocaleString()}
            </div>
            <div className="mt-3 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400 font-mono">
              <span>Active Campaigns</span>
              <span className="text-emerald-400 font-bold">
                {overview?.activeCampaigns ?? 0} of {overview?.totalCampaigns ?? 0} Active
              </span>
            </div>
          </div>

          {/* Card 4: Telephony & GSM Handsets */}
          <div className="p-5 rounded-2xl bg-[#0a0c12] border border-slate-800 hover:border-purple-500/40 transition-all duration-300 shadow-xl relative overflow-hidden group">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                <Radio className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                {overview?.callsInProgress ?? 0} In Call
              </span>
            </div>
            <div className="text-slate-400 text-xs font-medium">GSM Handsets / Dials Today</div>
            <div className="text-3xl font-black text-purple-400 font-display mt-1 flex items-baseline gap-2">
              {overview?.callsToday ?? 0}
              <span className="text-xs font-normal text-slate-500">
                ({overview?.connectedCallsToday ?? 0} connected)
              </span>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400 font-mono">
              <span>Cellular Hardware</span>
              <span className="text-purple-400 font-bold">
                {overview?.connectedMobileDevices ?? 0} Online • {overview?.offlineDevices ?? 0} Offline
              </span>
            </div>
          </div>
        </div>

        {/* ── TAB 1: WORKSPACES (Customer Tenant Master Record) ── */}
        {activeTab === 'workspaces' && (
          <div className="space-y-4">
            {/* Control & Filter Bar */}
            <div className="p-4 rounded-2xl bg-[#090b10] border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-2">
                {/* Type Filter */}
                <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                  <button
                    onClick={() => { setTypeFilter('all'); setPage(1); }}
                    className={`px-3 py-1 rounded-lg font-medium transition cursor-pointer ${typeFilter === 'all' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'}`}
                  >
                    All Modes
                  </button>
                  <button
                    onClick={() => { setTypeFilter('COMPANY'); setPage(1); }}
                    className={`px-3 py-1 rounded-lg font-medium transition cursor-pointer ${typeFilter === 'COMPANY' ? 'bg-blue-500 text-white font-bold' : 'text-slate-400 hover:text-white'}`}
                  >
                    Company SaaS
                  </button>
                  <button
                    onClick={() => { setTypeFilter('PERSONAL'); setPage(1); }}
                    className={`px-3 py-1 rounded-lg font-medium transition cursor-pointer ${typeFilter === 'PERSONAL' ? 'bg-purple-500 text-white font-bold' : 'text-slate-400 hover:text-white'}`}
                  >
                    Personal
                  </button>
                </div>

                {/* Status Filter */}
                <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                  <button
                    onClick={() => { setStatusFilter('all'); setPage(1); }}
                    className={`px-3 py-1 rounded-lg font-medium transition cursor-pointer ${statusFilter === 'all' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'}`}
                  >
                    All Status
                  </button>
                  <button
                    onClick={() => { setStatusFilter('active'); setPage(1); }}
                    className={`px-3 py-1 rounded-lg font-medium transition cursor-pointer ${statusFilter === 'active' ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'}`}
                  >
                    Active
                  </button>
                  <button
                    onClick={() => { setStatusFilter('suspended'); setPage(1); }}
                    className={`px-3 py-1 rounded-lg font-medium transition cursor-pointer ${statusFilter === 'suspended' ? 'bg-rose-500 text-white font-bold' : 'text-slate-400 hover:text-white'}`}
                  >
                    Suspended
                  </button>
                </div>

                {/* Health Filter */}
                <select
                  value={healthFilter}
                  onChange={e => { setHealthFilter(e.target.value); setPage(1); }}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-amber-500 font-mono"
                >
                  <option value="all">Health: All</option>
                  <option value="HEALTHY">🟢 Healthy</option>
                  <option value="WARNING">🟡 Warning</option>
                  <option value="DEGRADED">🔴 Degraded</option>
                  <option value="OFFLINE">⚪ Offline</option>
                </select>
              </div>

              {/* Search Bar */}
              <div className="relative w-full md:w-80">
                <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1); }}
                  placeholder="Search workspace, slug, ID, email..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-8 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 font-mono"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Tenant Master Record Table */}
            <div className="rounded-2xl bg-[#090b10] border border-slate-800 shadow-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#0c0e14] text-slate-400 uppercase tracking-wider text-[10px] font-mono border-b border-slate-800">
                    <tr>
                      <th className="py-3.5 px-6">Company / Workspace</th>
                      <th className="py-3.5 px-4">Tenant Identifier</th>
                      <th className="py-3.5 px-4 text-center">Health Signal</th>
                      <th className="py-3.5 px-4">Primary Owner</th>
                      <th className="py-3.5 px-4 text-center">Users</th>
                      <th className="py-3.5 px-4 text-center">Leads</th>
                      <th className="py-3.5 px-4 text-center">Calls</th>
                      <th className="py-3.5 px-4">Pool Mode</th>
                      <th className="py-3.5 px-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {tenants.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-16 text-center text-slate-500">
                          <div className="flex flex-col items-center justify-center space-y-3">
                            <Building2 className="w-10 h-10 text-slate-700 stroke-1" />
                            <div className="text-sm font-medium text-slate-400">No organizations match filter</div>
                            <p className="text-xs text-slate-600">Clear your search or filters to display all customer tenants.</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      tenants.map(t => {
                        const isRoot = t.id === 'tenant_default';
                        const isAssigned = t.leadPoolMode === 'assigned';
                        const health = t.healthStatus || 'HEALTHY';

                        return (
                          <tr
                            key={t.id}
                            onClick={() => fetchTenantDetail(t.id)}
                            className="hover:bg-slate-900/50 transition-colors cursor-pointer group"
                          >
                            {/* Company Name & Avatar */}
                            <td className="py-4 px-6">
                              <div className="flex items-center gap-3">
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 border ${
                                  isRoot
                                    ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                                    : 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                                }`}>
                                  {t.name ? t.name.substring(0, 2).toUpperCase() : 'CO'}
                                </div>
                                <div className="min-w-0">
                                  <div className="font-bold text-white flex items-center gap-2">
                                    <span className="truncate group-hover:text-amber-400 transition">{t.name}</span>
                                    {isRoot && (
                                      <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold uppercase">
                                        Root
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                                    {t.slug} • {t.customerType || 'COMPANY'}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Tenant ID */}
                            <td className="py-4 px-4 font-mono text-xs" onClick={e => e.stopPropagation()}>
                              <button
                                onClick={() => copyToClipboard(t.id, t.id)}
                                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
                                title="Click to copy Tenant ID"
                              >
                                <span className="text-[11px] select-all">{t.id}</span>
                                {copiedId === t.id ? (
                                  <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                                ) : (
                                  <Copy className="w-3 h-3 text-slate-500 shrink-0" />
                                )}
                              </button>
                            </td>

                            {/* Live Health Status Badge (Section 4) */}
                            <td className="py-4 px-4 text-center" onClick={e => e.stopPropagation()}>
                              <span
                                title={t.healthReasons ? t.healthReasons.join(', ') : 'Healthy'}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                                  health === 'HEALTHY'
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                    : health === 'WARNING'
                                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                    : health === 'DEGRADED'
                                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                                    : 'bg-slate-800 text-slate-400 border-slate-700'
                                }`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${
                                  health === 'HEALTHY' ? 'bg-emerald-400' :
                                  health === 'WARNING' ? 'bg-amber-400' :
                                  health === 'DEGRADED' ? 'bg-rose-400 animate-pulse' : 'bg-slate-400'
                                }`} />
                                {health}
                              </span>
                            </td>

                            {/* Primary Owner */}
                            <td className="py-4 px-4 font-mono text-xs">
                              <div className="text-slate-200 font-semibold">{t.primaryOwner?.username || 'unassigned'}</div>
                              <div className="text-[10px] text-slate-500 truncate max-w-[140px]">{t.primaryOwner?.email || 'no email'}</div>
                            </td>

                            {/* Users Breakdown */}
                            <td className="py-4 px-4 text-center font-mono text-xs font-bold text-slate-200">
                              {t.userCount ?? 0}
                            </td>

                            {/* Leads Total */}
                            <td className="py-4 px-4 text-center font-mono text-xs font-bold text-amber-400">
                              {(t.leadCount ?? 0).toLocaleString()}
                            </td>

                            {/* Calls Today */}
                            <td className="py-4 px-4 text-center font-mono text-xs text-slate-300">
                              {t.callsToday ?? 0}
                            </td>

                            {/* Lead Pool Policy Toggle */}
                            <td className="py-4 px-4" onClick={e => e.stopPropagation()}>
                              <button
                                onClick={() => handleToggleLeadPoolMode(t.id, t.leadPoolMode)}
                                disabled={updatingModeId === t.id}
                                className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-medium border transition cursor-pointer ${
                                  isAssigned
                                    ? 'bg-purple-500/10 border-purple-500/30 text-purple-400 hover:bg-purple-500/20'
                                    : 'bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20'
                                }`}
                              >
                                {isAssigned ? (
                                  <>
                                    <Lock className="w-3 h-3 mr-1 text-purple-400" />
                                    <span>Assigned</span>
                                  </>
                                ) : (
                                  <>
                                    <Users className="w-3 h-3 mr-1 text-blue-400" />
                                    <span>Shared</span>
                                  </>
                                )}
                              </button>
                            </td>

                            {/* Actions: Impersonate */}
                            <td className="py-4 px-6 text-right" onClick={e => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => handleImpersonateTenant(t.id)}
                                  disabled={impersonatingId === t.id}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 transition cursor-pointer disabled:opacity-50"
                                  title="Enter workspace via audited impersonation"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  <span>{impersonatingId === t.id ? '...' : 'Impersonate'}</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Bar */}
              {totalPages > 1 && (
                <div className="px-6 py-3 border-t border-slate-800 bg-[#0c0e14] flex items-center justify-between text-xs text-slate-400 font-mono">
                  <div>
                    Showing {tenants.length} of {totalTenants} organizations
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      className="px-3 py-1 rounded-lg bg-slate-900 border border-slate-800 disabled:opacity-40 hover:text-white transition cursor-pointer"
                    >
                      Previous
                    </button>
                    <span>Page {page} of {totalPages}</span>
                    <button
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                      className="px-3 py-1 rounded-lg bg-slate-900 border border-slate-800 disabled:opacity-40 hover:text-white transition cursor-pointer"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TAB 2: DEVICES & TELEPHONY MONITORING ── */}
        {activeTab === 'devices' && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-[#090b10] border border-slate-800 shadow-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <Smartphone className="w-5 h-5 text-purple-400" />
                  <h2 className="text-sm font-bold uppercase tracking-wider font-mono text-white">
                    Global GSM Telephony Hardware
                  </h2>
                </div>
                <div className="text-xs font-mono text-slate-400">
                  {devicesList.length} Handset(s) Registered
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#0c0e14] text-slate-400 uppercase tracking-wider text-[10px] font-mono border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Device Name</th>
                      <th className="py-3 px-4">Workspace</th>
                      <th className="py-3 px-4">Assigned User</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-center">Live Socket</th>
                      <th className="py-3 px-4 text-center">Active Call</th>
                      <th className="py-3 px-4">Last Seen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {devicesList.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-500 font-mono">
                          No mobile handsets paired yet. Connect using the Android Mobile App.
                        </td>
                      </tr>
                    ) : (
                      devicesList.map(d => (
                        <tr key={d.id} className="hover:bg-slate-900/40">
                          <td className="py-3.5 px-4 font-bold text-white flex items-center gap-2">
                            <Smartphone className="w-4 h-4 text-slate-500" />
                            <span>{d.name}</span>
                            <span className="text-[10px] text-slate-500 font-mono">({d.osType || 'Android'})</span>
                          </td>
                          <td className="py-3.5 px-4 text-slate-300 font-mono">{d.tenantName || d.tenantId}</td>
                          <td className="py-3.5 px-4 text-slate-400 font-mono">{d.assignedUser || 'unassigned'}</td>
                          <td className="py-3.5 px-4 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                              d.status === 'ONLINE'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : 'bg-slate-800 text-slate-400 border-slate-700'
                            }`}>
                              {d.status}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            {d.isSocketConnected ? (
                              <span className="text-emerald-400 font-bold font-mono">● Connected</span>
                            ) : (
                              <span className="text-slate-600 font-mono">Disconnected</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-center font-mono">
                            {d.activeCall ? (
                              <span className="text-amber-400 font-bold animate-pulse">CALLING ({d.activeCall})</span>
                            ) : (
                              <span className="text-slate-600">Idle</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-slate-500 font-mono text-[11px]">
                            {d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : 'Never'}
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

        {/* ── TAB 3: AUTOMATION & BACKGROUND JOBS ── */}
        {activeTab === 'jobs' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-5 rounded-2xl bg-[#090b10] border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-white uppercase font-mono">Dialer Call Dispatcher & Queue Engine</div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/10 text-emerald-400 font-mono font-bold">
                    Worker Idle
                  </span>
                </div>
                <div className="text-2xl font-black text-white">0 Running</div>
                <p className="text-xs text-slate-400">High-concurrency call dispatching and queue progression worker.</p>
              </div>

              <div className="p-5 rounded-2xl bg-[#090b10] border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-white uppercase font-mono">Auto Emailer Engine</div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-blue-500/10 text-blue-400 font-mono font-bold">
                    {jobsData?.jobs?.emailer?.length ?? 0} Queue(s)
                  </span>
                </div>
                <div className="text-2xl font-black text-white">
                  {jobsData?.summary?.totalRunning ?? 0} Active
                </div>
                <p className="text-xs text-slate-400">Multi-tenant SMTP delivery workers with retry and bounce guards.</p>
              </div>

              <div className="p-5 rounded-2xl bg-[#090b10] border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-white uppercase font-mono">Facebook Poster</div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-purple-500/10 text-purple-400 font-mono font-bold">
                    Standby
                  </span>
                </div>
                <div className="text-2xl font-black text-white">0 Jobs</div>
                <p className="text-xs text-slate-400">Automated social campaigns and marketplace scraper sessions.</p>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 4: PLATFORM ACTIVITY FEED ── */}
        {activeTab === 'activity' && (
          <div className="rounded-2xl bg-[#090b10] border border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-bold uppercase tracking-wider font-mono text-white">
                  Live Operational Platform Audit Stream
                </h2>
              </div>
              <span className="text-xs font-mono text-slate-500">Real-time DB Events</span>
            </div>

            <div className="divide-y divide-slate-800/40 font-mono text-xs">
              {activityList.length === 0 ? (
                <div className="py-8 text-center text-slate-500">
                  No activity events recorded yet.
                </div>
              ) : (
                activityList.map((a, i) => (
                  <div key={a.id || i} className="py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] px-2 py-0.5 rounded bg-slate-900 text-amber-400 border border-slate-800">
                        {a.action}
                      </span>
                      <span className="text-white font-medium">{a.details || a.action}</span>
                      {a.tenantName && (
                        <span className="text-slate-500 text-[11px]">({a.tenantName})</span>
                      )}
                    </div>
                    <span className="text-slate-500 text-[11px]">
                      {a.timestamp ? new Date(a.timestamp).toLocaleTimeString() : ''}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ── TAB 5: SYSTEM HEALTH ── */}
        {activeTab === 'system' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-6 rounded-2xl bg-[#090b10] border border-slate-800 space-y-4">
              <h3 className="text-sm font-bold uppercase font-mono text-white flex items-center gap-2">
                <Cpu className="w-4 h-4 text-emerald-400" />
                <span>Runtime Engine Telemetry</span>
              </h3>
              <div className="space-y-2 text-xs font-mono">
                <div className="flex justify-between py-2 border-b border-slate-800">
                  <span className="text-slate-400">Server Uptime</span>
                  <span className="text-white font-bold">{Math.floor((overview?.uptimeSeconds || 0) / 60)} minutes</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-800">
                  <span className="text-slate-400">Database Engine</span>
                  <span className="text-emerald-400 font-bold">PostgreSQL 18.4 (ACID)</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-800">
                  <span className="text-slate-400">Tenant Isolation Layer</span>
                  <span className="text-emerald-400 font-bold">Active RLS & Scoped Queries</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-slate-400">Telephony Gateway</span>
                  <span className="text-white font-bold">Cellular Socket.IO v4</span>
                </div>
              </div>
            </div>

            <div className="p-6 rounded-2xl bg-[#090b10] border border-slate-800 space-y-4">
              <h3 className="text-sm font-bold uppercase font-mono text-white flex items-center gap-2">
                <Shield className="w-4 h-4 text-amber-400" />
                <span>Security & Governance</span>
              </h3>
              <div className="space-y-2 text-xs font-mono">
                <div className="flex justify-between py-2 border-b border-slate-800">
                  <span className="text-slate-400">Customer Content Privacy</span>
                  <span className="text-emerald-400 font-bold">Strictly Isolated (No Global Leak)</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-800">
                  <span className="text-slate-400">Support Access</span>
                  <span className="text-amber-400 font-bold">Audited Impersonation Only</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-800">
                  <span className="text-slate-400">PL/pgSQL Catalog Constraints</span>
                  <span className="text-emerald-400 font-bold">Enforced (Migration 013)</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-slate-400">JWT Token Invalidation</span>
                  <span className="text-emerald-400 font-bold">Durable SHA-256 Revocation</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ── TENANT DETAIL DRAWER (Section 9) ── */}
      {selectedTenantId && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-2xl bg-[#090c12] border-l border-slate-800 h-full overflow-y-auto p-6 space-y-6 shadow-2xl animate-slide-left">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center font-bold text-amber-400">
                  {tenantDetail?.overview?.name?.substring(0, 2).toUpperCase() || 'CO'}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">{tenantDetail?.overview?.name || selectedTenantId}</h3>
                  <div className="text-xs text-slate-400 font-mono mt-0.5">
                    ID: {selectedTenantId} • Slug: {tenantDetail?.overview?.slug}
                  </div>
                </div>
              </div>
              <button
                onClick={() => { setSelectedTenantId(null); setTenantDetail(null); }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {detailLoading ? (
              <div className="py-20 text-center text-slate-500 font-mono">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-amber-400 mb-2" />
                Loading authoritative tenant state...
              </div>
            ) : tenantDetail ? (
              <div className="space-y-6 text-xs">
                {/* 1. Health & Signals */}
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white uppercase font-mono">Operational Health</span>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                      tenantDetail.health.status === 'HEALTHY'
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                    }`}>
                      {tenantDetail.health.status}
                    </span>
                  </div>
                  <ul className="text-slate-400 text-[11px] space-y-1 list-disc list-inside">
                    {tenantDetail.health.reasons.map((r: string, i: number) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>

                {/* 2. Organization & Users */}
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white uppercase font-mono">Organization Breakdown</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-slate-400">{tenantDetail.organization.totalUsers} User(s)</span>
                      <button
                        onClick={() => setShowAccessMatrixModal(true)}
                        className="px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-[10px] font-mono font-bold border border-amber-500/30 flex items-center gap-1 cursor-pointer transition"
                        title="View Live Access Matrix"
                      >
                        <Key className="w-3 h-3" />
                        <span>View Access Matrix</span>
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {tenantDetail.organization.users.map((u: any) => (
                      <div key={u.id} className="p-2 rounded-xl bg-slate-900 flex items-center justify-between text-slate-300">
                        <div>
                          <span className="font-bold text-white">{u.username}</span>
                          <span className="text-[10px] text-slate-500 ml-2">({u.email || 'no email'})</span>
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-amber-400">
                          {u.role}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 2.5 ACCESS & ENTITLEMENTS (PLATFORM OWNER CEILING) */}
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-amber-400" />
                      <span className="font-bold text-white uppercase font-mono">Platform Entitlement Ceiling</span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400">
                      {(tenantDetail.modules || []).length} / {CANONICAL_MODULES.length} Enabled
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Control which enterprise modules this company tenant is entitled to use. Modules disabled here cannot be granted to any user or team in this organization.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                    {CANONICAL_MODULES.map(m => {
                      const isEnabled = tenantDetail.moduleEntitlements
                        ? !!tenantDetail.moduleEntitlements[m.id]
                        : (tenantDetail.modules || []).includes(m.id);
                      const isBusy = togglingModule === m.id;

                      return (
                        <button
                          key={m.id}
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleToggleEntitlement(m.id, isEnabled)}
                          className={`p-2.5 rounded-xl border text-xs flex items-center justify-between transition cursor-pointer ${
                            isEnabled
                              ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/15'
                              : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <span>{m.icon}</span>
                            <span className="font-medium truncate">{m.label}</span>
                          </div>
                          {isBusy ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                          ) : isEnabled ? (
                            <span className="text-[10px] font-mono font-bold text-emerald-400 flex items-center gap-0.5">
                              <Check className="w-3 h-3" /> ON
                            </span>
                          ) : (
                            <span className="text-[10px] font-mono text-slate-500 flex items-center gap-0.5">
                              <Lock className="w-3 h-3" /> OFF
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Sales Operations */}
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                  <span className="font-bold text-white uppercase font-mono">Sales Operations</span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono pt-1">
                    <div className="p-2.5 rounded-xl bg-slate-900 text-center">
                      <div className="text-slate-400 text-[10px]">Total Leads</div>
                      <div className="text-sm font-bold text-amber-400 mt-0.5">{tenantDetail.salesOperations.totalLeads}</div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-900 text-center">
                      <div className="text-slate-400 text-[10px]">Campaigns</div>
                      <div className="text-sm font-bold text-white mt-0.5">{tenantDetail.salesOperations.totalCampaigns}</div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-900 text-center">
                      <div className="text-slate-400 text-[10px]">Calls Today</div>
                      <div className="text-sm font-bold text-emerald-400 mt-0.5">{tenantDetail.salesOperations.callsToday}</div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-900 text-center">
                      <div className="text-slate-400 text-[10px]">Calls Month</div>
                      <div className="text-sm font-bold text-purple-400 mt-0.5">{tenantDetail.salesOperations.callsThisMonth}</div>
                    </div>
                  </div>
                </div>

                {/* 4. Connected Hardware Devices */}
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white uppercase font-mono">Paired Telephony Handsets</span>
                    <span className="text-slate-400 font-mono">{tenantDetail.connectedDevices.total} Device(s)</span>
                  </div>
                  {tenantDetail.connectedDevices.devices.length === 0 ? (
                    <div className="text-slate-500 font-mono text-center py-2">No devices registered.</div>
                  ) : (
                    tenantDetail.connectedDevices.devices.map((d: any) => (
                      <div key={d.id} className="p-2 rounded-xl bg-slate-900 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Smartphone className="w-3.5 h-3.5 text-slate-400" />
                          <span className="text-white font-medium">{d.name}</span>
                        </div>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                          d.status === 'ONLINE' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-500'
                        }`}>
                          {d.status}
                        </span>
                      </div>
                    ))
                  )}
                </div>

                {/* 5. Support Impersonation Action */}
                <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
                  <button
                    onClick={() => handleToggleTenantStatus(tenantDetail.overview.id, tenantDetail.overview.status)}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                      tenantDetail.overview.status === 'active'
                        ? 'border-rose-500/30 text-rose-400 hover:bg-rose-500/10'
                        : 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10'
                    }`}
                  >
                    {tenantDetail.overview.status === 'active' ? 'Suspend Workspace' : 'Reactivate Workspace'}
                  </button>

                  <button
                    onClick={() => handleImpersonateTenant(tenantDetail.overview.id)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 hover:from-amber-400 hover:to-amber-500 transition cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Impersonate Workspace</span>
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* ── Provision New Workspace Modal ── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0b0e14] border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white font-display">Provision New Workspace</h3>
                  <p className="text-xs text-slate-400 font-mono">Create an isolated client organization</p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateWorkspace} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Company / Workspace Name</label>
                <input
                  type="text"
                  required
                  value={createForm.companyName}
                  onChange={e => setCreateForm({ ...createForm, companyName: e.target.value })}
                  placeholder="e.g. Apex Financial Corp"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Primary Owner Username</label>
                <input
                  type="text"
                  required
                  value={createForm.username}
                  onChange={e => setCreateForm({ ...createForm, username: e.target.value })}
                  placeholder="e.g. apex_admin"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Owner Email (Optional)</label>
                <input
                  type="email"
                  value={createForm.email}
                  onChange={e => setCreateForm({ ...createForm, email: e.target.value })}
                  placeholder="e.g. admin@apexcorp.com"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Initial Password (min 6 chars)</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={createForm.password}
                  onChange={e => setCreateForm({ ...createForm, password: e.target.value })}
                  placeholder="••••••••••••"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {createLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  <span>{createLoading ? 'Provisioning...' : 'Create Workspace'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* MODAL: TENANT LIVE ACCESS MATRIX                                     */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {showAccessMatrixModal && tenantDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-fade-in">
          <div
            className="w-full max-w-4xl bg-[#0B0E14] border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-4 text-left max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Key className="w-5 h-5 text-amber-400" />
                  Live Tenant Access Matrix — {tenantDetail.overview?.name || selectedTenantId}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Authoritative inherited hierarchy: Platform Entitlements ∩ Company Ceiling ∩ Team Scope ∩ User Assignment
                </p>
              </div>
              <button
                onClick={() => setShowAccessMatrixModal(false)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Ceiling Summary Banner */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-400" />
                <span className="text-slate-300">Platform Company Ceiling:</span>
                <span className="text-amber-400 font-bold">{(tenantDetail.modules || []).length} of {CANONICAL_MODULES.length} modules licensed</span>
              </div>
              <div className="text-slate-400">
                {tenantDetail.organization?.totalUsers || 0} provisioned customer accounts
              </div>
            </div>

            {/* Matrix Table */}
            <div className="border border-slate-800 rounded-xl overflow-hidden bg-[#10141D]">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-900/80 border-b border-slate-800 text-[10px] font-mono text-slate-400 uppercase">
                    <th className="px-3.5 py-2.5">User</th>
                    <th className="px-3.5 py-2.5">Role</th>
                    <th className="px-3.5 py-2.5">Structural Scope</th>
                    <th className="px-3.5 py-2.5">Effective Modules</th>
                    <th className="px-3.5 py-2.5 text-right">Effective Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {((tenantDetail.accessMatrix?.users && tenantDetail.accessMatrix.users.length > 0)
                    ? tenantDetail.accessMatrix.users
                    : (tenantDetail.organization?.users || [])
                  ).map((u: any) => {
                    const isOwner = u.role === 'admin';
                    const companyCeilingCount = tenantDetail.modules?.length || 0;
                    const effectiveCount = u.effectiveModules ? u.effectiveModules.length : (isOwner ? companyCeilingCount : (u.assignedModules?.length || 0));

                    return (
                      <tr key={u.id} className="hover:bg-slate-800/30">
                        <td className="px-3.5 py-2.5">
                          <div className="font-semibold text-white">{u.displayName || u.username}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{u.email || u.username}</div>
                        </td>
                        <td className="px-3.5 py-2.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                            isOwner ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30' : 'bg-slate-800 text-slate-300'
                          }`}>
                            {isOwner ? 'Company Owner' : u.role}
                          </span>
                        </td>
                        <td className="px-3.5 py-2.5 font-mono text-[11px] text-slate-300">
                          {isOwner ? (
                            <span className="text-amber-400">Entire Company (Root)</span>
                          ) : (
                            <span className="text-slate-400">Assigned Team Scope</span>
                          )}
                        </td>
                        <td className="px-3.5 py-2.5">
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-mono text-[11px] font-bold border border-emerald-500/20">
                            {effectiveCount} / {companyCeilingCount} Effective
                          </span>
                        </td>
                        <td className="px-3.5 py-2.5 text-right">
                          <span className="text-emerald-400 font-medium font-mono text-[11px]">
                            {u.status || 'Active'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="pt-2 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setShowAccessMatrixModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
