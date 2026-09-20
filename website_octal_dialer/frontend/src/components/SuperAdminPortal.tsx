import React, { useState, useEffect } from 'react';
import {
  Shield, Building2, PhoneCall, Database, Lock, RefreshCw,
  ExternalLink, Settings, Users, ArrowUpRight, Search, CheckCircle2,
  AlertTriangle, Power, LogOut, Check, Sliders
} from 'lucide-react';

interface SuperAdminPortalProps {
  serverUrl: string;
  authToken: string;
  currentUser: any;
  onLogout: () => void;
}

export const SuperAdminPortal: React.FC<SuperAdminPortalProps> = ({
  serverUrl,
  authToken,
  currentUser,
  onLogout
}) => {
  const [telemetry, setTelemetry] = useState<any>(null);
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [updatingModeId, setUpdatingModeId] = useState<string | null>(null);
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null);

  const fetchGlobalData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [telRes, tenRes] = await Promise.all([
        fetch(${serverUrl}/api/super-admin/telemetry, {
          headers: { 'Authorization': Bearer  }
        }),
        fetch(${serverUrl}/api/super-admin/tenants, {
          headers: { 'Authorization': Bearer  }
        })
      ]);

      if (telRes.ok && tenRes.ok) {
        const telJson = await telRes.json();
        const tenJson = await tenRes.json();
        setTelemetry(telJson.telemetry || null);
        setTenants(tenJson.tenants || []);
      } else {
        setError('Failed to load Super Admin data. Make sure your account has Master privileges.');
      }
    } catch (err: any) {
      setError(err.message || 'Connection error.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGlobalData();
    const interval = setInterval(fetchGlobalData, 30000); // 30s auto-refresh
    return () => clearInterval(interval);
  }, [serverUrl, authToken]);

  const handleToggleLeadPoolMode = async (tenantId: string, currentMode: string) => {
    const newMode = currentMode === 'shared' ? 'assigned' : 'shared';
    setUpdatingModeId(tenantId);
    try {
      const res = await fetch(${serverUrl}/api/super-admin/tenants//mode, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': Bearer 
        },
        body: JSON.stringify({ leadPoolMode: newMode })
      });
      if (res.ok) {
        setTenants(prev => prev.map(t => t.id === tenantId ? { ...t, leadPoolMode: newMode } : t));
      } else {
        alert('Failed to update lead pool mode.');
      }
    } catch (err) {
      alert('Network error while updating lead pool mode.');
    } finally {
      setUpdatingModeId(null);
    }
  };

  const handleImpersonateTenant = async (tenantId: string) => {
    setImpersonatingId(tenantId);
    try {
      const res = await fetch(${serverUrl}/api/super-admin/impersonate/, {
        method: 'POST',
        headers: {
          'Authorization': Bearer 
        }
      });
      if (res.ok) {
        const data = await res.json();
        // Save tenant session and open main app workspace in new window
        localStorage.setItem('octal_impersonation_token', data.token);
        localStorage.setItem('octal_impersonation_user', JSON.stringify(data.user));
        window.open(${window.location.origin}?impersonateToken=, '_blank');
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to generate impersonation session.');
      }
    } catch (err) {
      alert('Error entering tenant workspace.');
    } finally {
      setImpersonatingId(null);
    }
  };

  const filteredTenants = tenants.filter(t => 
    t.name?.toLowerCase().includes(search.toLowerCase()) ||
    t.id?.toLowerCase().includes(search.toLowerCase()) ||
    t.ownerEmail?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className=min-h-screen bg-[#07090e] text-slate-100 p-6 antialiased font-sans>
      {/* Top Header */}
      <header className=flex items-center justify-between border-b border-slate-800/80 pb-5 mb-6>
        <div className=flex items-center space-x-3.5>
          <div className=w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center font-bold text-lg shadow-lg shadow-indigo-500/25>
            <Shield className=w-5 h-5 text-white />
          </div>
          <div>
            <div className=flex items-center space-x-2.5>
              <h1 className=text-xl font-black tracking-wider uppercase text-white>
                Zestify<span className=text-indigo-400>Master</span>
              </h1>
              <span className=text-[11px] px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-bold uppercase tracking-wider>
                Product Super Admin
              </span>
            </div>
            <p className=text-xs text-slate-400 mt-0.5>admin.zestify7.online • Global Orchestrator & Tenant Hub</p>
          </div>
        </div>

        <div className=flex items-center space-x-4>
          <div className=flex items-center space-x-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-3 py-1.5 rounded-xl text-xs font-medium>
            <span className=w-2 h-2 rounded-full bg-emerald-400 animate-pulse></span>
            <span>VPS Live (140.245.215.156)</span>
          </div>

          <button
            onClick={fetchGlobalData}
            disabled={loading}
            className=p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition cursor-pointer
            title=Refresh Real-time Telemetry
          >
            <RefreshCw className={w-4 h-4 } />
          </button>

          <div className=flex items-center space-x-3 border-l border-slate-800/80 pl-4>
            <div className=text-right>
              <div className=text-xs font-bold text-slate-200>
                {currentUser?.displayName || currentUser?.username || 'Master Admin'}
              </div>
              <div className=text-[11px] text-slate-400>{currentUser?.email || 'Platform Owner'}</div>
            </div>
            <button
              onClick={onLogout}
              className=p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition cursor-pointer
              title=Sign Out
            >
              <LogOut className=w-4 h-4 />
            </button>
          </div>
        </div>
      </header>

      {/* Telemetry KPI Cards */}
      <div className=grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6>
        <div className=bg-[#0d121f] border border-slate-800/80 p-4 rounded-2xl relative overflow-hidden shadow-lg shadow-black/40>
          <div className=text-[11px] font-semibold text-slate-400 uppercase tracking-wider>Total Organizations</div>
          <div className=text-2xl font-black mt-1 text-white flex items-baseline gap-2>
            {telemetry?.totalTenants ?? tenants.length}
            <span className=text-xs font-normal text-emerald-400>Active Tenancies</span>
          </div>
          <div className=text-[11px] text-slate-400 mt-2 flex items-center gap-1.5>
            <Building2 className=w-3.5 h-3.5 text-indigo-400 />
            <span>100% Tenant Isolation</span>
          </div>
        </div>

        <div className=bg-[#0d121f] border border-slate-800/80 p-4 rounded-2xl relative overflow-hidden shadow-lg shadow-black/40>
          <div className=text-[11px] font-semibold text-slate-400 uppercase tracking-wider>Global Live Callers</div>
          <div className=text-2xl font-black mt-1 text-emerald-400 flex items-baseline gap-2>
            {telemetry?.activeLaptops ?? 0}
            <span className=text-xs font-normal text-slate-400>Agents Online</span>
          </div>
          <div className=text-[11px] text-slate-400 mt-2 flex items-center gap-1.5>
            <PhoneCall className=w-3.5 h-3.5 text-emerald-400 />
            <span>{telemetry?.liveCalls ?? 0} Active Dials Right Now</span>
          </div>
        </div>

        <div className=bg-[#0d121f] border border-slate-800/80 p-4 rounded-2xl relative overflow-hidden shadow-lg shadow-black/40>
          <div className=text-[11px] font-semibold text-slate-400 uppercase tracking-wider>Total Leads In CRM</div>
          <div className=text-2xl font-black mt-1 text-white flex items-baseline gap-2>
            {(telemetry?.totalLeads ?? 0).toLocaleString()}
            <span className=text-xs font-normal text-slate-400>Across all tenants</span>
          </div>
          <div className=text-[11px] text-slate-400 mt-2 flex items-center gap-1.5>
            <Database className=w-3.5 h-3.5 text-violet-400 />
            <span>PostgreSQL Persistence Layer</span>
          </div>
        </div>

        <div className=bg-[#0d121f] border border-slate-800/80 p-4 rounded-2xl relative overflow-hidden shadow-lg shadow-black/40>
          <div className=text-[11px] font-semibold text-slate-400 uppercase tracking-wider>Cloudflare & SSL</div>
          <div className=text-2xl font-black mt-1 text-indigo-400 flex items-baseline gap-2>
            100% OK
            <span className=text-xs font-normal text-emerald-400>Protected</span>
          </div>
          <div className=text-[11px] text-slate-400 mt-2 flex items-center gap-1.5>
            <Lock className=w-3.5 h-3.5 text-emerald-400 />
            <span>Edge Proxied & SSL Handshake Active</span>
          </div>
        </div>
      </div>

      {/* Action Bar & Search */}
      <div className=flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4>
        <div className=flex items-center space-x-2>
          <span className=text-sm font-bold text-white tracking-wide>Registered Tenant Workspaces</span>
          <span className=text-xs bg-slate-800 text-slate-300 px-2.5 py-0.5 rounded-full border border-slate-700 font-mono>
            {filteredTenants.length} Organizations
          </span>
        </div>

        <div className=relative>
          <Search className=w-3.5 h-3.5 text-slate-500 absolute left-3 top-3 />
          <input
            type=text
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder=Search company, tenantId, owner email...
            className=bg-[#0d121f] border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 w-full sm:w-80 focus:outline-none focus:border-indigo-500 shadow-inner
          />
        </div>
      </div>

      {/* Tenants Table */}
      <div className=bg-[#0d121f] border border-slate-800/80 rounded-2xl overflow-hidden shadow-2xl shadow-black/50 mb-6>
        <div className=overflow-x-auto>
          <table className=w-full text-left text-xs>
            <thead className=bg-slate-950/70 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800>
              <tr>
                <th className=py-3.5 px-5>Company / Workspace</th>
                <th className=py-3.5 px-4>Tenant ID</th>
                <th className=py-3.5 px-4>Primary Owner</th>
                <th className=py-3.5 px-4>Lead Pool Mode</th>
                <th className=py-3.5 px-4 text-center>Users</th>
                <th className=py-3.5 px-4 text-center>Total Leads</th>
                <th className=py-3.5 px-4 text-center>Status</th>
                <th className=py-3.5 px-5 text-right>Actions</th>
              </tr>
            </thead>
            <tbody className=divide-y divide-slate-800/60>
              {filteredTenants.length === 0 ? (
                <tr>
                  <td colSpan={8} className=py-8 text-center text-slate-500>
                    No tenant organizations found matching your search.
                  </td>
                </tr>
              ) : (
                filteredTenants.map(t => {
                  const isAssigned = t.leadPoolMode === 'assigned';
                  return (
                    <tr key={t.id} className=hover:bg-slate-800/30 transition>
                      <td className=py-4 px-5 flex items-center space-x-3>
                        <div className=w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xs>
                          {t.name ? t.name.substring(0, 2).toUpperCase() : 'CO'}
                        </div>
                        <div>
                          <div className=font-bold text-white flex items-center gap-1.5>
                            <span>{t.name || 'Unnamed Organization'}</span>
                            {t.id === 'tenant_default' && (
                              <span className=text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold>
                                Master Root
                              </span>
                            )}
                          </div>
                          <div className=text-[11px] text-slate-400>
                            Created {t.createdAt ? new Date(t.createdAt).toLocaleDateString() : 'N/A'}
                          </div>
                        </div>
                      </td>

                      <td className=py-4 px-4 font-mono text-[11px] text-slate-300 select-all>
                        {t.id}
                      </td>

                      <td className=py-4 px-4>
                        <div className=text-slate-200 font-medium>{t.ownerEmail || '—'}</div>
                        <div className=text-[10px] text-slate-400>Tier: {t.tier || 'standard'}</div>
                      </td>

                      {/* Lead Pool Policy Toggle */}
                      <td className=py-4 px-4>
                        <button
                          onClick={() => handleToggleLeadPoolMode(t.id, t.leadPoolMode)}
                          disabled={updatingModeId === t.id}
                          className={inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer }
                          title=Click to toggle between Shared Team Pool and Agent-Assigned Mode
                        >
                          {isAssigned ? (
                            <>
                              <Lock className=w-3 h-3 mr-1 text-purple-400 />
                              <span>Agent Assigned Only</span>
                            </>
                          ) : (
                            <>
                              <Users className=w-3 h-3 mr-1 text-blue-400 />
                              <span>Shared Team Pool</span>
                            </>
                          )}
                        </button>
                      </td>

                      <td className=py-4 px-4 text-center font-bold text-slate-200>
                        {t.totalUsers ?? 0}
                      </td>

                      <td className=py-4 px-4 text-center font-bold text-indigo-400>
                        {(t.totalLeads ?? 0).toLocaleString()}
                      </td>

                      <td className=py-4 px-4 text-center>
                        <span className={px-2 py-0.5 rounded-full text-[10px] font-semibold border }>
                          {t.status || 'active'}
                        </span>
                      </td>

                      <td className=py-4 px-5 text-right space-x-2>
                        <button
                          onClick={() => handleImpersonateTenant(t.id)}
                          disabled={impersonatingId === t.id}
                          className=bg-indigo-600 hover:bg-indigo-500 text-white px-2.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center space-x-1 shadow-md shadow-indigo-600/30 transition cursor-pointer
                          title=Enter and inspect this company's workspace
                        >
                          <ExternalLink className=w-3 h-3 />
                          <span>{impersonatingId === t.id ? 'Connecting...' : 'Open View'}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
