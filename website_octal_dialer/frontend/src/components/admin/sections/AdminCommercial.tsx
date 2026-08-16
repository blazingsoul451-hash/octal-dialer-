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
          className="px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {actionSuccess && (
        <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800 text-emerald-400 text-xs font-mono flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* ── Sub Navigation ── */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
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
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
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
              className="p-5 rounded-2xl border border-slate-800 bg-slate-900/90 flex flex-col justify-between space-y-4"
            >
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-black font-display text-white">{p.name}</h3>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-purple-950/40 text-purple-400 border border-purple-800">
                    {p.id}
                  </span>
                </div>
                <div className="mt-3">
                  <span className="text-2xl font-black font-mono text-amber-400">${p.priceMonthly}</span>
                  <span className="text-xs text-slate-500 font-mono"> / month</span>
                </div>
                <div className="text-xs text-slate-400 font-mono mt-1">
                  or ${p.priceYearly} billed annually
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 space-y-2 font-mono text-xs text-slate-300">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Multi-Tenant CRM & Campaigns</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>GSM Auto-Dialer Handsets</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Google & Facebook Scrapers</span>
                </div>
              </div>
            </div>
          ))}

          {plans.length === 0 && !loading && (
            <div className="col-span-3 py-8 text-center text-slate-500 font-mono text-xs">
              No catalog plans found in database.
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: SUBSCRIPTIONS ── */}
      {activeSubTab === 'subscriptions' && (
        <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/90">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] text-slate-500 uppercase">
                  <th className="pb-3">Tenant Business</th>
                  <th className="pb-3">Plan</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3">Start Date</th>
                  <th className="pb-3">Renewal Date</th>
                  <th className="pb-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {subscriptions.map(s => (
                  <tr key={s.id} className="hover:bg-slate-800/30">
                    <td className="py-3 font-bold text-white flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-amber-400" />
                      <span>{s.tenantName || s.tenantId}</span>
                    </td>
                    <td className="py-3 text-purple-300 font-bold">{s.planName || s.planId}</td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${
                        s.status === 'active'
                          ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800'
                          : 'bg-red-950/40 text-red-400 border-red-800'
                      }`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="py-3 text-slate-400 text-[10px]">
                      {new Date(s.currentPeriodStart).toLocaleDateString()}
                    </td>
                    <td className="py-3 text-slate-400 text-[10px]">
                      {new Date(s.currentPeriodEnd).toLocaleDateString()}
                    </td>
                    <td className="py-3 text-right space-x-2">
                      {s.status === 'active' ? (
                        <button
                          onClick={() => handleSuspend(s.tenantId)}
                          className="px-2 py-1 bg-red-950/50 hover:bg-red-900/80 text-red-300 border border-red-800 rounded-lg text-[10px] font-bold cursor-pointer"
                        >
                          Suspend
                        </button>
                      ) : (
                        <button
                          onClick={() => handleActivate(s.id)}
                          className="px-2 py-1 bg-emerald-950/50 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-800 rounded-lg text-[10px] font-bold cursor-pointer"
                        >
                          Activate
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {subscriptions.length === 0 && !loading && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
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
        <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/90 space-y-4 font-mono text-xs">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-2">
            Entitlement Architecture & Safe Quotas
          </h3>
          <p className="text-slate-400 leading-relaxed">
            Octal Dialer enforces plan boundaries dynamically per tenant using database-backed entitlement policies.
            Every outbound call, lead import, and scraping concurrency is capped to the tenant's subscribed plan tier.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-850 space-y-1">
              <div className="text-[10px] uppercase text-slate-500 font-bold">Starter Plan</div>
              <div className="text-sm font-bold text-white">5 Users • 2 Phones • 5k Leads</div>
            </div>
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-850 space-y-1">
              <div className="text-[10px] uppercase text-purple-400 font-bold">Professional Plan</div>
              <div className="text-sm font-bold text-white">20 Users • 10 Phones • 25k Leads</div>
            </div>
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-850 space-y-1">
              <div className="text-[10px] uppercase text-amber-400 font-bold">Enterprise Plan</div>
              <div className="text-sm font-bold text-white">Unlimited Users • 50 Phones • 100k Leads</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
