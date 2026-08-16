import React, { useState, useEffect } from 'react';
import { CreditCard, CheckCircle2, AlertTriangle, ArrowUpRight, Clock, ShieldCheck, RefreshCw, XCircle, ChevronRight, Zap } from 'lucide-react';

interface BillingProps {
  serverUrl: string;
  authToken: string | null;
  userRole: string;
}

interface Plan {
  id: string;
  name: string;
  priceMonthly: number;
  priceYearly: number;
  status: string;
  billingInterval?: string;
  description?: string;
}

interface UsageMetric {
  current: number;
  limit: number;
}

interface BillingState {
  tenantId: string;
  subscription: {
    id: string;
    planId: string;
    status: string;
    provider: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
    cancelledAt: string | null;
    trialEnd: string | null;
    gracePeriodEnd: string | null;
  } | null;
  plan: Plan | null;
  entitlements?: {
    isValid: boolean;
    planName: string;
    status: string;
    features: Record<string, boolean>;
    limits: Record<string, number>;
  };
  usage?: {
    users: number;
    devices: number;
    campaigns: number;
    apiKeys: number;
    leads: number;
  };
  overLimit?: Record<string, UsageMetric> | null;
}

export const BillingPage: React.FC<BillingProps> = ({ serverUrl, authToken, userRole }) => {
  const [billingState, setBillingState] = useState<BillingState | null>(null);
  const [availablePlans, setAvailablePlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

  const fetchBillingData = async () => {
    try {
      setLoading(true);
      const headers = {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      };

      const [subRes, plansRes] = await Promise.all([
        fetch(`${serverUrl}/billing/subscription`, { headers }),
        fetch(`${serverUrl}/billing/plans`, { headers })
      ]);

      if (subRes.ok) {
        const subData = await subRes.json();
        setBillingState(subData);
      }

      if (plansRes.ok) {
        const plansData = await plansRes.json();
        setAvailablePlans(plansData.plans || []);
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: 'Failed to load billing information: ' + err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBillingData();
  }, [serverUrl, authToken]);

  const handlePlanChange = async (planId: string) => {
    if (!confirm(`Are you sure you want to switch to ${planId}?`)) return;
    try {
      setActionLoading(true);
      setMessage(null);
      const res = await fetch(`${serverUrl}/billing/change-plan`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ planId })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to change plan');
      }

      setMessage({ type: 'success', text: `Plan successfully changed to ${data.subscription?.planId || planId}!` });
      await fetchBillingData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!confirm('Are you sure you want to cancel your subscription? You will retain access until the end of your billing period.')) return;
    try {
      setActionLoading(true);
      setMessage(null);
      const res = await fetch(`${serverUrl}/billing/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to cancel subscription');
      }

      setMessage({ type: 'success', text: 'Subscription scheduled for cancellation at the end of the billing period.' });
      await fetchBillingData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReactivate = async () => {
    try {
      setActionLoading(true);
      setMessage(null);
      const res = await fetch(`${serverUrl}/billing/reactivate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to reactivate subscription');
      }

      setMessage({ type: 'success', text: 'Subscription reactivated successfully!' });
      await fetchBillingData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (status?: string, cancelAtPeriodEnd?: boolean) => {
    if (cancelAtPeriodEnd) {
      return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Cancelling at Period End</span>;
    }
    switch (status) {
      case 'active':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> Active</span>;
      case 'trialing':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" /> Trial / Pending</span>;
      case 'past_due':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Past Due (Grace Period)</span>;
      case 'suspended':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center gap-1.5"><XCircle className="w-3.5 h-3.5" /> Suspended</span>;
      case 'cancelled':
      case 'expired':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-slate-500/20 text-slate-400 border border-slate-500/30 flex items-center gap-1.5"><XCircle className="w-3.5 h-3.5" /> Expired</span>;
      default:
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-slate-500/20 text-slate-400">{status || 'Unknown'}</span>;
    }
  };

  const renderUsageBar = (label: string, current: number, limit: number) => {
    const pct = limit > 0 ? Math.min(100, Math.round((current / limit) * 100)) : 0;
    const isOver = current > limit;
    return (
      <div className="space-y-1.5">
        <div className="flex justify-between items-center text-xs">
          <span className="font-medium text-slate-300">{label}</span>
          <span className={`font-mono ${isOver ? 'text-rose-400 font-bold' : 'text-slate-400'}`}>
            {current.toLocaleString()} / {limit.toLocaleString()} {isOver && '(Quota Exceeded)'}
          </span>
        </div>
        <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-700/50">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isOver ? 'bg-rose-500' : pct > 80 ? 'bg-amber-500' : 'bg-blue-500'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  const currentPlanId = billingState?.subscription?.planId;
  const currentStatus = billingState?.subscription?.status;
  const cancelAtEnd = billingState?.subscription?.cancelAtPeriodEnd;
  const limits = billingState?.entitlements?.limits || { maxUsers: 0, maxDevices: 0, maxCampaigns: 0, maxApiKeys: 0, maxLeads: 0 };
  const usage = billingState?.usage || { users: 0, devices: 0, campaigns: 0, apiKeys: 0, leads: 0 };

  return (
    <div className="space-y-8 max-w-6xl mx-auto p-2 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2.5">
            <CreditCard className="w-7 h-7 text-blue-400" />
            Billing & Subscription Lifecycle
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Server-authoritative subscription management, quota enforcement, and plan upgrades
          </p>
        </div>
        <button
          onClick={fetchBillingData}
          disabled={actionLoading}
          className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${actionLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Toast Notification */}
      {message && (
        <div className={`p-4 rounded-xl text-sm font-medium flex items-center justify-between border ${
          message.type === 'success'
            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
            : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
        }`}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="text-xs hover:underline opacity-80">Dismiss</button>
        </div>
      )}

      {/* Current Subscription & Resource Quota Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Plan Overview */}
        <div className="lg:col-span-1 bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Current Plan</span>
              <h2 className="text-2xl font-black text-slate-100 mt-0.5 capitalize">
                {billingState?.plan?.name || billingState?.entitlements?.planName || currentPlanId || 'No Plan'}
              </h2>
            </div>
            {getStatusBadge(currentStatus, cancelAtEnd)}
          </div>

          <div className="border-t border-slate-800/80 pt-4 space-y-3 text-xs text-slate-300">
            <div className="flex justify-between py-1">
              <span className="text-slate-400">Monthly Price:</span>
              <span className="font-semibold text-slate-200">
                ${billingState?.plan?.priceMonthly ?? 0} / month
              </span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-400">Current Period End:</span>
              <span className="font-mono text-slate-200">
                {billingState?.subscription?.currentPeriodEnd
                  ? new Date(billingState.subscription.currentPeriodEnd).toLocaleDateString()
                  : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-400">Payment Provider:</span>
              <span className="font-mono uppercase text-slate-300">{billingState?.subscription?.provider || 'manual'}</span>
            </div>
          </div>

          {/* Cancellation warning or actions */}
          <div className="border-t border-slate-800/80 pt-4">
            {cancelAtEnd ? (
              <div className="space-y-3">
                <p className="text-xs text-amber-400 bg-amber-500/10 p-3 rounded-lg border border-amber-500/20">
                  Your subscription will expire at the end of this billing cycle.
                </p>
                <button
                  onClick={handleReactivate}
                  disabled={actionLoading}
                  className="w-full py-2 px-3 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition"
                >
                  Reactivate Subscription
                </button>
              </div>
            ) : currentStatus === 'active' || currentStatus === 'trialing' ? (
              <button
                onClick={handleCancelSubscription}
                disabled={actionLoading}
                className="w-full py-2 px-3 text-xs font-medium text-rose-400 hover:bg-rose-500/10 rounded-lg border border-rose-500/20 hover:border-rose-500/40 transition"
              >
                Cancel Subscription at Period End
              </button>
            ) : null}
          </div>
        </div>

        {/* Real-Time Plan Quota & Usage */}
        <div className="lg:col-span-2 bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
          <div className="flex justify-between items-center">
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              Server-Enforced Resource Quotas
            </h3>
            <span className="text-xs text-slate-400 font-mono">Live DB Metrics</span>
          </div>

          <div className="space-y-4 pt-2">
            {renderUsageBar('Team Users', usage.users, limits.maxUsers)}
            {renderUsageBar('Paired Mobile Devices', usage.devices, limits.maxDevices)}
            {renderUsageBar('Dialer Campaigns', usage.campaigns, limits.maxCampaigns)}
            {renderUsageBar('Scraped & Uploaded Leads', usage.leads, limits.maxLeads)}
            {renderUsageBar('API Keys', usage.apiKeys, limits.maxApiKeys)}
          </div>

          {billingState?.overLimit && Object.keys(billingState.overLimit).length > 0 && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                Your current usage exceeds the plan limits. Existing data is safe, but new creation operations will be blocked until usage is reduced or plan is upgraded.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Available Plans Catalog */}
      <div className="space-y-5 pt-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100">Available Subscription Plans</h2>
          <p className="text-xs text-slate-400 mt-1">Upgrade or modify your plan tier with instant server-side entitlement recalculation</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {availablePlans.map((plan) => {
            const isCurrent = plan.id === currentPlanId;
            const isPro = plan.id === 'plan_pro';
            const isEnterprise = plan.id === 'plan_enterprise';

            return (
              <div
                key={plan.id}
                className={`relative bg-slate-900/90 rounded-2xl p-6 border transition-all duration-300 flex flex-col justify-between ${
                  isCurrent
                    ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-blue-500/10'
                    : isPro
                    ? 'border-purple-500/40 hover:border-purple-500 shadow-lg'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                {isPro && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-bold text-[10px] uppercase tracking-wider rounded-full shadow-md">
                    Most Popular
                  </span>
                )}

                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-bold text-slate-100 capitalize">{plan.name}</h3>
                    {isCurrent && (
                      <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-500/20 text-blue-400 rounded-md border border-blue-500/30">
                        Current
                      </span>
                    )}
                  </div>

                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black text-slate-100">${plan.priceMonthly}</span>
                    <span className="text-xs text-slate-400">/ month</span>
                  </div>

                  <p className="text-xs text-slate-400 min-h-[32px]">{plan.description || `Ideal for teams requiring ${plan.name} capabilities.`}</p>

                  <div className="border-t border-slate-800/80 pt-4 space-y-2 text-xs text-slate-300">
                    <div className="font-semibold text-slate-200 mb-2">Features & Quotas:</div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>{plan.id === 'plan_starter' ? '2 Users & 1 Mobile Device' : plan.id === 'plan_pro' ? '10 Users & 5 Mobile Devices' : '100 Users & 50 Mobile Devices'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>{plan.id === 'plan_starter' ? '1,000 Scraped Leads' : plan.id === 'plan_pro' ? '25,000 Scraped Leads' : '500,000 Scraped Leads'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>{plan.id === 'plan_starter' ? 'OCTAL Dialer & Google Scraper' : 'All Scrapers + Auto Emailer + FB Poster'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>{plan.id === 'plan_starter' ? 'Standard Analytics' : 'Custom Roles & Advanced Analytics'}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-6">
                  {isCurrent ? (
                    <button
                      disabled
                      className="w-full py-2.5 px-4 text-xs font-semibold bg-slate-800 text-slate-400 rounded-xl cursor-default border border-slate-700/50"
                    >
                      Active Plan
                    </button>
                  ) : (
                    <button
                      onClick={() => handlePlanChange(plan.id)}
                      disabled={actionLoading}
                      className={`w-full py-2.5 px-4 text-xs font-semibold rounded-xl transition flex items-center justify-center gap-1.5 shadow-md ${
                        isPro
                          ? 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white'
                          : 'bg-blue-600 hover:bg-blue-500 text-white'
                      }`}
                    >
                      <span>Switch to {plan.name}</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
