import React, { useState, useEffect } from 'react';
import {
  Building2, Users, Smartphone, CreditCard, Activity, Shield, ArrowLeft,
  CheckCircle2, AlertCircle, RefreshCw, Layers, Key, PhoneCall, Globe, Mail, Clock, Lock
} from 'lucide-react';

interface BusinessDetailProps {
  isLight?: boolean;
  serverUrl: string;
  authToken: string;
  businessId: string;
  onBack: () => void;
}

type DetailTab = 'overview' | 'users' | 'devices' | 'subscription' | 'usage' | 'security';

export const BusinessDetail: React.FC<BusinessDetailProps> = ({
  isLight,
  serverUrl,
  authToken,
  businessId,
  onBack
}) => {
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const fetchDetail = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/admin/tenants/${businessId}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        const err = await res.json();
        setError(err.error || 'Failed to load business details.');
      }
    } catch (err: any) {
      setError(err.message || 'Connection error.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
  }, [businessId, serverUrl, authToken]);

  const handleToggleStatus = async () => {
    if (!data?.tenant) return;
    const newStatus = data.tenant.status === 'active' ? 'suspended' : 'active';
    setUpdatingStatus(true);
    try {
      const res = await fetch(`${serverUrl}/admin/tenants/${businessId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        setData((prev: any) => ({
          ...prev,
          tenant: { ...prev.tenant, status: newStatus }
        }));
      }
    } catch (err) {
      console.error('Failed to update status', err);
    } finally {
      setUpdatingStatus(false);
    }
  };

  if (loading) {
    return (
      <div className="py-16 text-center text-slate-500 font-mono text-xs flex items-center justify-center gap-2">
        <RefreshCw className="w-4 h-4 animate-spin" />
        <span>Loading Business Identity & Relationships...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 rounded-2xl bg-red-950/30 border border-red-500/40 text-red-300 font-mono text-xs space-y-3">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          <span className="font-bold">Error loading business record</span>
        </div>
        <p>{error || 'Business not found.'}</p>
        <button
          onClick={onBack}
          className="px-3 py-1.5 rounded-xl bg-slate-800 text-white hover:bg-slate-700 cursor-pointer font-bold"
        >
          Back to Businesses
        </button>
      </div>
    );
  }

  const { tenant, users, devices, subscriptions, usage, entitlements, auditLogs } = data;
  const currentSub = subscriptions?.[0] || null;

  return (
    <div className="space-y-6 text-left font-sans">
      {/* ── Top Bar / Back Button ── */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Businesses</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleStatus}
            disabled={updatingStatus}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold border cursor-pointer transition ${
              tenant.status === 'active'
                ? 'bg-red-950/40 border-red-800 text-red-400 hover:bg-red-900/60'
                : 'bg-emerald-950/40 border-emerald-800 text-emerald-400 hover:bg-emerald-900/60'
            }`}
          >
            {updatingStatus ? 'Updating...' : tenant.status === 'active' ? 'Suspend Business' : 'Activate Business'}
          </button>
        </div>
      </div>

      {/* ── Business Header Card ── */}
      <div className={`p-6 rounded-2xl border transition-all ${
        isLight ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {/* Logo / Initial */}
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 border border-amber-400/40 flex items-center justify-center text-xl font-black text-slate-950 shadow-xl">
              {tenant.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-black font-display tracking-tight text-white">{tenant.name}</h1>
                <span className={`px-2 py-0.5 rounded border text-[10px] font-bold font-mono uppercase ${
                  tenant.status === 'active'
                    ? 'bg-emerald-950/50 text-emerald-400 border-emerald-800'
                    : 'bg-red-950/50 text-red-400 border-red-800'
                }`}>
                  {tenant.status}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-4 mt-1.5 text-xs text-slate-400 font-mono">
                <span className="flex items-center gap-1">
                  <Globe className="w-3.5 h-3.5 text-slate-500" />
                  <span>{tenant.country || 'US'}</span>
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 text-slate-500" />
                  <span>Owner: <strong className="text-white">{tenant.ownerUsername}</strong></span>
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <CreditCard className="w-3.5 h-3.5 text-slate-500" />
                  <span>Plan: <strong className="text-purple-300">{currentSub?.planName || 'Starter'}</strong></span>
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  <span>Created: {new Date(tenant.createdAt).toLocaleDateString()}</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Internal Tab Navigation ── */}
        <div className="flex items-center gap-1 border-t border-slate-800 mt-5 pt-3 overflow-x-auto select-none">
          {[
            { id: 'overview' as DetailTab, label: 'Overview', icon: Building2 },
            { id: 'users' as DetailTab, label: `Users (${users.length})`, icon: Users },
            { id: 'devices' as DetailTab, label: `Devices (${devices.length})`, icon: Smartphone },
            { id: 'subscription' as DetailTab, label: 'Subscription', icon: CreditCard },
            { id: 'usage' as DetailTab, label: 'Usage & Quotas', icon: Activity },
            { id: 'security' as DetailTab, label: 'Security & Audit', icon: Shield }
          ].map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer transition ${
                  active
                    ? 'bg-amber-500 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── TAB 1: OVERVIEW ── */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Identity & Metadata */}
          <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/80 space-y-3 font-mono text-xs">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-2">
              Business Identity
            </h3>
            <div className="flex justify-between py-1 border-b border-slate-850">
              <span className="text-slate-500">Tenant Slug</span>
              <span className="text-white font-bold">{tenant.slug}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-850">
              <span className="text-slate-500">Owner Account</span>
              <span className="text-white font-bold">{tenant.ownerUsername}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-850">
              <span className="text-slate-500">Owner Email</span>
              <span className="text-white">{tenant.ownerEmail || 'Not Provided'}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-850">
              <span className="text-slate-500">Country / Jurisdiction</span>
              <span className="text-white">{tenant.country || 'US'}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-500">Internal Tenant ID</span>
              <span className="text-slate-400 text-[10px]">{tenant.id}</span>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/80 space-y-3 font-mono text-xs">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-2">
              Resource Summary
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-850">
                <div className="text-slate-500 text-[10px] uppercase">Registered Users</div>
                <div className="text-lg font-bold text-white mt-1">{users.length}</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-850">
                <div className="text-slate-500 text-[10px] uppercase">Paired Phones</div>
                <div className="text-lg font-bold text-white mt-1">{devices.length}</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-850">
                <div className="text-slate-500 text-[10px] uppercase">Active Plan</div>
                <div className="text-lg font-bold text-purple-300 mt-1">{currentSub?.planName || 'Starter'}</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-850">
                <div className="text-slate-500 text-[10px] uppercase">Status</div>
                <div className="text-lg font-bold text-emerald-400 mt-1 uppercase">{tenant.status}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: USERS ── */}
      {activeTab === 'users' && (
        <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/80 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-400">
              Users Belonging to {tenant.name}
            </h3>
            <span className="text-xs font-mono text-slate-500">{users.length} Team Members</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] text-slate-500 uppercase">
                  <th className="pb-2">Username</th>
                  <th className="pb-2">Role</th>
                  <th className="pb-2">Email</th>
                  <th className="pb-2">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {users.map((u: any) => (
                  <tr key={u.id} className="hover:bg-slate-800/30">
                    <td className="py-2.5 font-bold text-white flex items-center gap-2">
                      <div className="w-5 h-5 rounded bg-purple-500/10 text-purple-400 flex items-center justify-center text-[10px]">
                        👤
                      </div>
                      <span>{u.username}</span>
                    </td>
                    <td className="py-2.5">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${
                        u.role === 'admin' 
                          ? 'bg-amber-950/40 text-amber-400 border-amber-800' 
                          : 'bg-slate-800 text-slate-300 border-slate-700'
                      }`}>
                        {u.role === 'admin' ? 'Tenant Admin / Owner' : 'Employee / Agent'}
                      </span>
                    </td>
                    <td className="py-2.5 text-slate-400">{u.email || '—'}</td>
                    <td className="py-2.5 text-slate-500">{new Date(u.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-slate-500">No users found for this business.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 3: DEVICES (User -> Computer/Session -> Phone) ── */}
      {activeTab === 'devices' && (
        <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/80 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-400">
                User → Session / Computer → Phone Topology
              </h3>
              <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                Physical GSM handset connections associated with this business workspace.
              </p>
            </div>
            <span className="text-xs font-mono text-slate-500">{devices.length} Handsets</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] text-slate-500 uppercase">
                  <th className="pb-2">Phone Name</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Assigned User</th>
                  <th className="pb-2">Session / Laptop</th>
                  <th className="pb-2">Last Seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {devices.map((d: any) => (
                  <tr key={d.id} className="hover:bg-slate-800/30">
                    <td className="py-2.5 font-bold text-white flex items-center gap-2">
                      <Smartphone className="w-4 h-4 text-blue-400 shrink-0" />
                      <span>{d.phoneName || 'GSM Handset'}</span>
                    </td>
                    <td className="py-2.5">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${
                        d.status === 'ONLINE'
                          ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}>
                        {d.status || 'OFFLINE'}
                      </span>
                    </td>
                    <td className="py-2.5 text-slate-300 font-bold">{d.username || 'Unassigned'}</td>
                    <td className="py-2.5 text-slate-400 text-[10px]">{d.sessionId ? `Session (${d.sessionId.slice(0, 10)}...)` : 'Direct Pairing'}</td>
                    <td className="py-2.5 text-slate-500">{d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleTimeString() : 'Never'}</td>
                  </tr>
                ))}
                {devices.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500">
                      No phones currently paired for this business.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 4: SUBSCRIPTION ── */}
      {activeTab === 'subscription' && (
        <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/80 space-y-4 font-mono text-xs">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-2">
            Commercial Subscription Record
          </h3>
          {currentSub ? (
            <div className="space-y-3">
              <div className="flex justify-between py-1 border-b border-slate-850">
                <span className="text-slate-500">Subscribed Plan</span>
                <span className="text-purple-300 font-bold">{currentSub.planName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-850">
                <span className="text-slate-500">Subscription Status</span>
                <span className="text-emerald-400 font-bold uppercase">{currentSub.status}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-850">
                <span className="text-slate-500">Period Start</span>
                <span className="text-white">{new Date(currentSub.currentPeriodStart).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-850">
                <span className="text-slate-500">Period End</span>
                <span className="text-white">{new Date(currentSub.currentPeriodEnd).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Subscription ID</span>
                <span className="text-slate-400 text-[10px]">{currentSub.id}</span>
              </div>
            </div>
          ) : (
            <div className="py-6 text-center text-slate-500">No active subscription found.</div>
          )}
        </div>
      )}

      {/* ── TAB 5: USAGE & QUOTAS ── */}
      {activeTab === 'usage' && (
        <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/80 space-y-4 font-mono text-xs">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-2">
            Tenant Resource Utilization vs Plan Quotas
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Object.entries(usage || {}).map(([key, val]: [string, any]) => (
              <div key={key} className="p-3.5 rounded-xl bg-slate-950 border border-slate-850 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 uppercase font-bold text-[10px]">{key}</span>
                  <span className="text-white font-bold">{val.current} / {val.max}</span>
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-amber-500 h-full transition-all"
                    style={{ width: `${Math.min(100, (val.current / (val.max || 1)) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── TAB 6: SECURITY & AUDIT ── */}
      {activeTab === 'security' && (
        <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/80 space-y-4">
          <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-400">
            Tenant Audit Trail & Security Events
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] text-slate-500 uppercase">
                  <th className="pb-2">Action</th>
                  <th className="pb-2">Actor</th>
                  <th className="pb-2">Details</th>
                  <th className="pb-2">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {(auditLogs || []).map((log: any) => (
                  <tr key={log.id} className="hover:bg-slate-800/30">
                    <td className="py-2 font-bold text-amber-400">{log.action}</td>
                    <td className="py-2 text-slate-300">{log.performedBy || 'System'}</td>
                    <td className="py-2 text-slate-400 truncate max-w-xs">{log.details || '—'}</td>
                    <td className="py-2 text-slate-500 text-[10px]">{new Date(log.timestamp).toLocaleString()}</td>
                  </tr>
                ))}
                {(!auditLogs || auditLogs.length === 0) && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-slate-500">No audit events recorded for this business.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
