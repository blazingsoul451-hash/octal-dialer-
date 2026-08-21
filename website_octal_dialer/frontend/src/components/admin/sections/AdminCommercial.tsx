import React, { useState, useEffect } from 'react';
import {
  CreditCard, CheckCircle2, AlertCircle, RefreshCw, Layers, ShieldCheck,
  Building2, Users, Activity, Play, Pause, ChevronRight
} from 'lucide-react';

interface AdminCommercialProps {
  isLight?: boolean;
  serverUrl: string;
  authToken: string;
}

type CommercialTab = 'plans' | 'subscriptions' | 'usage';

export const AdminCommercial: React.FC<AdminCommercialProps> = ({
  isLight,
  serverUrl,
  authToken
}) => {
  const [activeSubTab, setActiveSubTab] = useState<CommercialTab>('plans');
  const [plans, setPlans] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const fetchCommercialData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [plansRes, subsRes] = await Promise.all([
        fetch(`${serverUrl}/admin/plans`, { headers: { 'Authorization': `Bearer ${authToken}` } }),
        fetch(`${serverUrl}/admin/billing/subscriptions`, { headers: { 'Authorization': `Bearer ${authToken}` } })
      ]);

      if (plansRes.ok) {
        const pJson = await plansRes.json();
        setPlans(pJson.plans || []);
      }
      if (subsRes.ok) {
        const sJson = await subsRes.json();
        setSubscriptions(sJson.subscriptions || []);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load commercial data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCommercialData();
  }, [serverUrl, authToken]);

  const handleActivate = async (subId: string) => {
    try {
      const res = await fetch(`${serverUrl}/admin/billing/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ subscriptionId: subId })
      });
      if (res.ok) {
        setActionSuccess('Subscription manually activated.');
        fetchCommercialData();
        setTimeout(() => setActionSuccess(null), 3000);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSuspend = async (tenantId: string) => {
    try {
      const res = await fetch(`${serverUrl}/admin/billing/suspend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ tenantId, reason: 'Manual Admin Suspension' })
      });
      if (res.ok) {
        setActionSuccess('Subscription suspended.');
        fetchCommercialData();
        setTimeout(() => setActionSuccess(null), 3000);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6 text-left font-sans">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-black font-display tracking-tight">Commercial & Subscriptions</h2>
          <p className="text-xs text-slate-400 font-medium mt-0.5">
            Catalog pricing plans, active tenant subscriptions, and entitlement quotas.
          </p>
        </div>
        <button
          onClick={fetchCommercialData}
          disabled={loading}
          className={`px-3 py-1.5 rounded-xl border text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer transition ${
            isLight ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700' : 'border-[#18181b] bg-[#18181b] hover:bg-[#27272a] text-slate-300'
          }`}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {actionSuccess && (
        <div className={`p-3 rounded-xl border text-xs font-mono flex items-center gap-2 ${
          isLight ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-emerald-950/40 border-emerald-800 text-emerald-400'
        }`}>
          <CheckCircle2 className="w-4 h-4" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* ── Sub Navigation ── */}
      <div className={`flex items-center gap-2 border-b pb-3 ${isLight ? 'border-slate-200' : 'border-[#18181b]'}`}>
        {[
          { id: 'plans' as CommercialTab, label: `Catalog Plans (${plans.length})` },
          { id: 'subscriptions' as CommercialTab, label: `Tenant Subscriptions (${subscriptions.length})` },
          { id: 'usage' as CommercialTab, label: 'Entitlement Quotas' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold cursor-pointer transition ${
              activeSubTab === tab.id
                ? 'bg-purple-600 text-white shadow-md'
                : isLight ? 'bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200 hover:bg-slate-200' : 'bg-[#18181b] text-slate-400 hover:text-white border border-[#18181b]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── TAB 1: PLANS ── */}
      {activeSubTab === 'plans' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map(p => (
            <div
              key={p.id}
              className={`p-5 rounded-2xl border flex flex-col justify-between space-y-4 ${
                isLight ? 'bg-white border-slate-200 shadow-sm text-slate-900' : 'border-[#18181b] bg-[#09090b] text-white'
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <h3 className={`text-base font-black font-display ${isLight ? 'text-slate-900' : 'text-white'}`}>{p.name}</h3>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${
                    isLight ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-purple-950/40 text-purple-400 border-purple-800'
                  }`}>
                    {p.id}
                  </span>
                </div>
                <div className="mt-3">
                  <span className="text-2xl font-black font-mono text-amber-500">${p.priceMonthly}</span>
                  <span className={`text-xs font-mono ${isLight ? 'text-slate-500' : 'text-slate-500'}`}> / month</span>
                </div>
                <div className={`text-xs font-mono mt-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                  or ${p.priceYearly} billed annually
                </div>
              </div>

              <div className={`pt-4 border-t space-y-2 font-mono text-xs ${
                isLight ? 'border-slate-200 text-slate-700' : 'border-[#18181b] text-slate-300'
              }`}>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span>Multi-Tenant CRM & Campaigns</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span>GSM Auto-Dialer Handsets</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span>Google & Facebook Scrapers</span>
                </div>
              </div>
            </div>
          ))}

          {plans.length === 0 && !loading && (
            <div className={`col-span-3 py-8 text-center font-mono text-xs ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
              No catalog plans found in database.
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: SUBSCRIPTIONS ── */}
      {activeSubTab === 'subscriptions' && (
        <div className={`p-5 rounded-2xl border ${isLight ? 'bg-white border-slate-200 text-slate-900 shadow-sm' : 'border-[#18181b] bg-[#09090b] text-white'}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className={`border-b text-[10px] uppercase ${isLight ? 'border-slate-200 text-slate-500' : 'border-[#18181b] text-slate-500'}`}>
                  <th className="pb-3">Tenant Business</th>
                  <th className="pb-3">Plan</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3">Start Date</th>
                  <th className="pb-3">Renewal Date</th>
                  <th className="pb-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isLight ? 'divide-slate-200 text-slate-800' : 'divide-[#18181b]'}`}>
                {subscriptions.map(s => (
                  <tr key={s.id} className={isLight ? 'hover:bg-slate-50' : 'hover:bg-[#121215]/60'}>
                    <td className={`py-3 font-bold flex items-center gap-2 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                      <Building2 className="w-4 h-4 text-amber-500" />
                      <span>{s.tenantName || s.tenantId}</span>
                    </td>
                    <td className="py-3 text-purple-500 font-bold">{s.planName || s.planId}</td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${
                        s.status === 'active'
                          ? isLight ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-emerald-950/40 text-emerald-400 border-emerald-800'
                          : isLight ? 'bg-red-50 text-red-700 border-red-200' : 'bg-red-950/40 text-red-400 border-red-800'
                      }`}>
                        {s.status}
                      </span>
                    </td>
                    <td className={`py-3 text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      {new Date(s.currentPeriodStart).toLocaleDateString()}
                    </td>
                    <td className={`py-3 text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      {new Date(s.currentPeriodEnd).toLocaleDateString()}
                    </td>
                    <td className="py-3 text-right space-x-2">
                      {s.status === 'active' ? (
                        <button
                          onClick={() => handleSuspend(s.tenantId)}
                          className={`px-2 py-1 border rounded-lg text-[10px] font-bold cursor-pointer transition ${
                            isLight ? 'bg-red-50 hover:bg-red-100 text-red-700 border-red-200' : 'bg-red-950/50 hover:bg-red-900/80 text-red-300 border-red-800'
                          }`}
                        >
                          Suspend
                        </button>
                      ) : (
                        <button
                          onClick={() => handleActivate(s.id)}
                          className={`px-2 py-1 border rounded-lg text-[10px] font-bold cursor-pointer transition ${
                            isLight ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-emerald-950/50 hover:bg-emerald-900/80 text-emerald-300 border-emerald-800'
                          }`}
                        >
                          Activate
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {subscriptions.length === 0 && !loading && (
                  <tr>
                    <td colSpan={6} className={`py-8 text-center ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
                      No active tenant subscriptions recorded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 3: USAGE & ENTITLEMENTS ── */}
      {activeSubTab === 'usage' && (
        <div className={`p-5 rounded-2xl border space-y-4 font-mono text-xs ${
          isLight ? 'bg-white border-slate-200 text-slate-900 shadow-sm' : 'border-[#18181b] bg-[#09090b] text-white'
        }`}>
          <h3 className={`text-xs font-bold uppercase tracking-wider border-b pb-2 ${
            isLight ? 'text-slate-700 border-slate-200' : 'text-slate-400 border-[#18181b]'
          }`}>
            Entitlement Architecture & Safe Quotas
          </h3>
          <p className={`leading-relaxed ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
            Octal Dialer enforces plan boundaries dynamically per tenant using database-backed entitlement policies.
            Every outbound call, lead import, and scraping concurrency is capped to the tenant's subscribed plan tier.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div className={`p-4 rounded-xl border space-y-1 ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#121215] border-[#27272a]'}`}>
              <div className="text-[10px] uppercase text-slate-500 font-bold">Starter Plan</div>
              <div className={`text-sm font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>5 Users • 2 Phones • 5k Leads</div>
            </div>
            <div className={`p-4 rounded-xl border space-y-1 ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#121215] border-[#27272a]'}`}>
              <div className="text-[10px] uppercase text-purple-500 font-bold">Professional Plan</div>
              <div className={`text-sm font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>20 Users • 10 Phones • 25k Leads</div>
            </div>
            <div className={`p-4 rounded-xl border space-y-1 ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#121215] border-[#27272a]'}`}>
              <div className="text-[10px] uppercase text-amber-500 font-bold">Enterprise Plan</div>
              <div className={`text-sm font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>Unlimited Users • 50 Phones • 100k Leads</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
