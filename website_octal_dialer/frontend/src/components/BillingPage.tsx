import React, { useState, useEffect } from 'react';
import { CreditCard, CheckCircle2, AlertTriangle, ArrowUpRight, Clock, ShieldCheck, RefreshCw, XCircle, Zap } from 'lucide-react';

interface BillingProps {
  isLight?: boolean;
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

export const BillingPage: React.FC<BillingProps> = ({ isLight, serverUrl, authToken, userRole: _userRole }) => {
  const [billingState, setBillingState] = useState<BillingState | null>(null);
  const [availablePlans, setAvailablePlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
      const res = await fetch(`${serverUrl}/billing/plan/change`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ planId })
      });

      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: `Plan successfully updated to ${planId}. Entitlements recalculated.` });
        fetchBillingData();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to update plan.' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: 'Error executing plan change: ' + err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!confirm('Are you sure you want to schedule subscription cancellation at the end of the current billing period?')) return;
    try {
      setActionLoading(true);
      const res = await fetch(`${serverUrl}/billing/subscription/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ immediate: false })
      });

      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: 'Subscription cancellation scheduled for period end.' });
        fetchBillingData();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to cancel subscription.' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: 'Error canceling subscription: ' + err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReactivate = async () => {
    try {
      setActionLoading(true);
      const res = await fetch(`${serverUrl}/billing/subscription/reactivate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: 'Subscription successfully reactivated!' });
        fetchBillingData();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to reactivate subscription.' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: 'Error reactivating subscription: ' + err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (status?: string, cancelAtEnd?: boolean) => {
    if (cancelAtEnd) {
      return (
        <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1.5">
          <Clock className="w-3 h-3" />
          <span>Cancelling at Period End</span>
        </span>
      );
    }

    switch (status) {
      case 'active':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
            <CheckCircle2 className="w-3 h-3" />
            <span>Active & Enforced</span>
          </span>
        );
      case 'trialing':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-blue-500/10 text-blue-400 border border-blue-500/30 flex items-center gap-1.5">
            <Zap className="w-3 h-3" />
            <span>Active Trial</span>
          </span>
        );
      case 'past_due':
      case 'grace_period':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1.5">
            <AlertTriangle className="w-3 h-3" />
            <span>Grace Period</span>
          </span>
        );
      case 'suspended':
      case 'canceled':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-red-500/10 text-red-400 border border-red-500/30 flex items-center gap-1.5">
            <XCircle className="w-3 h-3" />
            <span>Suspended</span>
          </span>
        );
      default:
        return (
          <span className={`px-2.5 py-1 rounded-full text-xs font-mono font-bold ${isLight ? 'bg-slate-100 text-slate-700 border border-slate-300' : 'bg-[#18181b] text-zinc-400 border border-[#27272a]'}`}>
            <span>{status || 'Unknown'}</span>
          </span>
        );
    }
  };

  const renderUsageBar = (label: string, current: number, limit: number) => {
    const isUnlimited = limit === -1 || limit === 0 || limit >= 999999;
    const percentage = isUnlimited ? 0 : Math.min(100, Math.round((current / limit) * 100));
    const isExceeded = !isUnlimited && current > limit;
    const isNearLimit = !isUnlimited && percentage >= 80;

    return (
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs font-mono">
          <span className={isLight ? 'text-slate-700 font-bold' : 'text-zinc-300'}>{label}</span>
          <span className={isLight ? 'text-slate-900 font-bold' : 'text-white'}>
            {current.toLocaleString()} {isUnlimited ? '/ Unlimited' : `/ ${limit.toLocaleString()} (${percentage}%)`}
          </span>
        </div>
        <div className={`w-full h-2 rounded-full overflow-hidden ${isLight ? 'bg-slate-200' : 'bg-[#121215] border border-[#27272a]'}`}>
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isExceeded
                ? 'bg-red-500'
                : isNearLimit
                ? 'bg-amber-500'
                : 'bg-emerald-500'
            }`}
            style={{ width: isUnlimited ? '100%' : `${percentage}%`, opacity: isUnlimited ? 0.3 : 1 }}
          />
        </div>
      </div>
    );
  };

  if (loading && !billingState) {
    return (
      <div className="p-12 text-center text-xs font-mono text-zinc-400 animate-pulse">
        Fetching server subscription status and quotas...
      </div>
    );
  }

  const currentPlanId = billingState?.subscription?.planId;
  const currentStatus = billingState?.subscription?.status;
  const cancelAtEnd = billingState?.subscription?.cancelAtPeriodEnd;
  const limits = billingState?.entitlements?.limits || { maxUsers: 0, maxDevices: 0, maxCampaigns: 0, maxApiKeys: 0, maxLeads: 0 };
  const usage = billingState?.usage || { users: 0, devices: 0, campaigns: 0, apiKeys: 0, leads: 0 };

  return (
    <div className="space-y-8 select-none text-left max-w-6xl mx-auto p-2 pb-16">
      {/* Header */}
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-5 ${isLight ? 'border-slate-200' : 'border-[#18181b]'}`}>
        <div>
          <h1 className={`text-xl font-black font-display flex items-center gap-2.5 ${isLight ? 'text-slate-900' : 'text-white'}`}>
            <CreditCard className="w-6 h-6 text-amber-500" />
            <span>Billing & Subscription Lifecycle</span>
          </h1>
          <p className={`text-xs mt-1 ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>
            Server-authoritative subscription management, quota enforcement, and plan upgrades
          </p>
        </div>
        <button
          onClick={fetchBillingData}
          disabled={actionLoading}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-mono font-bold rounded-xl border transition cursor-pointer ${
            isLight ? 'bg-white hover:bg-slate-50 text-slate-800 border-slate-300 shadow-sm' : 'bg-[#18181b] hover:bg-[#27272a] text-zinc-300 border-[#27272a]'
          }`}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${actionLoading ? 'animate-spin text-amber-500' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Toast Notification */}
      {message && (
        <div className={`p-4 rounded-2xl text-xs font-mono font-bold flex items-center justify-between border ${
          message.type === 'success'
            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
            : 'bg-red-500/10 text-red-400 border-red-500/30'
        }`}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="text-xs hover:underline opacity-80 cursor-pointer">Dismiss</button>
        </div>
      )}

      {/* Current Subscription & Resource Quota Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Plan Overview */}
        <div className={`lg:col-span-1 border rounded-2xl p-6 shadow-2xl space-y-5 ${
          isLight ? 'bg-white border-slate-200 shadow-slate-200/50' : 'bg-[#09090b] border-[#18181b]'
        }`}>
          <div className="flex justify-between items-start">
            <div>
              <span className={`text-[10px] uppercase tracking-wider font-mono font-bold ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>Current Plan</span>
              <h2 className={`text-2xl font-black mt-0.5 capitalize ${isLight ? 'text-slate-900' : 'text-white'}`}>
                {billingState?.plan?.name || billingState?.entitlements?.planName || currentPlanId || 'No Plan'}
              </h2>
            </div>
            {getStatusBadge(currentStatus, cancelAtEnd)}
          </div>

          <div className={`border-t pt-4 space-y-3 text-xs ${isLight ? 'border-slate-200 text-slate-700' : 'border-[#18181b] text-zinc-300'}`}>
            <div className="flex justify-between py-1 font-mono">
              <span className={isLight ? 'text-slate-500' : 'text-zinc-400'}>Monthly Price:</span>
              <span className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                ${billingState?.plan?.priceMonthly ?? 0} / month
              </span>
            </div>
            <div className="flex justify-between py-1 font-mono">
              <span className={isLight ? 'text-slate-500' : 'text-zinc-400'}>Current Period End:</span>
              <span className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                {billingState?.subscription?.currentPeriodEnd
                  ? new Date(billingState.subscription.currentPeriodEnd).toLocaleDateString()
                  : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between py-1 font-mono">
              <span className={isLight ? 'text-slate-500' : 'text-zinc-400'}>Payment Provider:</span>
              <span className={`font-bold uppercase ${isLight ? 'text-slate-800' : 'text-zinc-300'}`}>{billingState?.subscription?.provider || 'manual'}</span>
            </div>
          </div>

          {/* Cancellation warning or actions */}
          <div className={`border-t pt-4 ${isLight ? 'border-slate-200' : 'border-[#18181b]'}`}>
            {cancelAtEnd ? (
              <div className="space-y-3">
                <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 p-3 rounded-xl border border-amber-500/30">
                  Your subscription will expire at the end of this billing cycle.
                </p>
                <button
                  onClick={handleReactivate}
                  disabled={actionLoading}
                  className="w-full py-2.5 px-3 text-xs font-mono font-bold bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl transition cursor-pointer"
                >
                  Reactivate Subscription
                </button>
              </div>
            ) : currentStatus === 'active' || currentStatus === 'trialing' ? (
              <button
                onClick={handleCancelSubscription}
                disabled={actionLoading}
                className="w-full py-2.5 px-3 text-xs font-mono font-bold text-red-500 hover:bg-red-500/10 rounded-xl border border-red-500/30 transition cursor-pointer"
              >
                Cancel Subscription at Period End
              </button>
            ) : null}
          </div>
        </div>

        {/* Real-Time Plan Quota & Usage */}
        <div className={`lg:col-span-2 border rounded-2xl p-6 shadow-2xl space-y-5 ${
          isLight ? 'bg-white border-slate-200 shadow-slate-200/50' : 'bg-[#09090b] border-[#18181b]'
        }`}>
          <div className="flex justify-between items-center">
            <h3 className={`text-xs font-mono font-black uppercase tracking-wider flex items-center gap-2 ${isLight ? 'text-slate-900' : 'text-white'}`}>
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span>Server-Enforced Resource Quotas</span>
            </h3>
            <span className={`text-[10px] font-mono ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>Live DB Metrics</span>
          </div>

          <div className="space-y-4 pt-2">
            {renderUsageBar('Team Users', usage.users, limits.maxUsers)}
            {renderUsageBar('Paired Mobile Devices', usage.devices, limits.maxDevices)}
            {renderUsageBar('Dialer Campaigns', usage.campaigns, limits.maxCampaigns)}
            {renderUsageBar('Scraped & Uploaded Leads', usage.leads, limits.maxLeads)}
            {renderUsageBar('API Keys', usage.apiKeys, limits.maxApiKeys)}
          </div>

          {billingState?.overLimit && Object.keys(billingState.overLimit).length > 0 && (
            <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-600 dark:text-amber-400 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
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
          <h2 className={`text-lg font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>Available Subscription Plans</h2>
          <p className={`text-xs mt-1 ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>Upgrade or modify your plan tier with instant server-side entitlement recalculation</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {availablePlans.map((plan) => {
            const isCurrent = plan.id === currentPlanId;
            const isPro = plan.id === 'plan_pro';

            return (
              <div
                key={plan.id}
                className={`relative rounded-2xl p-6 border transition-all duration-300 flex flex-col justify-between shadow-2xl ${
                  isLight ? 'bg-white shadow-slate-200/50' : 'bg-[#09090b]'
                } ${
                  isCurrent
                    ? 'border-amber-500'
                    : isPro
                    ? 'border-amber-500/50'
                    : isLight
                    ? 'border-slate-200 hover:border-slate-300'
                    : 'border-[#18181b] hover:border-[#27272a]'
                }`}
              >
                {isPro && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-amber-500 text-black font-black text-[10px] uppercase tracking-wider rounded-full shadow-sm">
                    Most Popular
                  </span>
                )}

                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className={`text-base font-bold capitalize ${isLight ? 'text-slate-900' : 'text-white'}`}>{plan.name}</h3>
                    {isCurrent && (
                      <span className="px-2.5 py-0.5 text-[9px] font-mono font-bold uppercase bg-amber-500/10 text-amber-500 dark:text-amber-400 rounded-full border border-amber-500/30">
                        Current
                      </span>
                    )}
                  </div>

                  <div className="flex items-baseline gap-1">
                    <span className={`text-3xl font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>${plan.priceMonthly}</span>
                    <span className={`text-xs ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>/ month</span>
                  </div>

                  <p className={`text-xs min-h-[32px] ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>{plan.description || `Ideal for teams requiring ${plan.name} capabilities.`}</p>

                  <div className={`border-t pt-4 space-y-2 text-xs ${isLight ? 'border-slate-200 text-slate-700' : 'border-[#18181b] text-zinc-300'}`}>
                    <div className={`font-bold text-xs mb-2 ${isLight ? 'text-slate-900' : 'text-white'}`}>Features & Quotas:</div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>{plan.id === 'plan_starter' ? '2 Users & 1 Mobile Device' : plan.id === 'plan_pro' ? '10 Users & 5 Mobile Devices' : '100 Users & 50 Mobile Devices'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>{plan.id === 'plan_starter' ? '1,000 Scraped Leads' : plan.id === 'plan_pro' ? '25,000 Scraped Leads' : '500,000 Scraped Leads'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>{plan.id === 'plan_starter' ? 'OCTAL Dialer & Google Scraper' : 'All Scrapers + Auto Emailer + FB Poster'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>{plan.id === 'plan_starter' ? 'Standard Analytics' : 'Custom Roles & Advanced Analytics'}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-6">
                  {isCurrent ? (
                    <button
                      disabled
                      className={`w-full py-2.5 px-4 text-xs font-mono font-bold rounded-xl cursor-default border ${
                        isLight ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-[#121215] text-zinc-500 border-[#18181b]'
                      }`}
                    >
                      Active Plan
                    </button>
                  ) : (
                    <button
                      onClick={() => handlePlanChange(plan.id)}
                      disabled={actionLoading}
                      className="w-full py-2.5 px-4 text-xs font-mono font-bold rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer bg-amber-500 hover:bg-amber-400 text-black shadow-sm"
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
