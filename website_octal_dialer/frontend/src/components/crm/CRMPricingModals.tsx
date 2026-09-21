import React, { useState, useEffect } from 'react';
import {
  X, AlertCircle, CheckCircle2, DollarSign, Calculator, Settings,
  ShieldCheck, Tag, Percent
} from 'lucide-react';
import type {
  CrmPricingRules,
  PricingPackage,
  PricingAddon,
  CrmCompany,
  CrmContact
} from '../../types/crm';

interface ModalBaseProps {
  isOpen: boolean;
  onClose: () => void;
  serverUrl: string;
  authToken: string;
}

// -------------------------------------------------------------
// 1. QUOTE BUILDER & PRICE CALCULATOR MODAL
// -------------------------------------------------------------
interface QuoteBuilderModalProps extends ModalBaseProps {
  userRole: string;
  companies: CrmCompany[];
  contacts: CrmContact[];
  leads: any[];
  defaultCompanyId?: string;
  defaultContactId?: string;
  defaultLeadId?: string;
  onSuccess: () => void;
}

export const QuoteBuilderModal: React.FC<QuoteBuilderModalProps> = ({
  isOpen,
  userRole,
  companies,
  contacts,
  leads,
  defaultCompanyId,
  defaultContactId,
  defaultLeadId,
  onClose,
  onSuccess,
  serverUrl,
  authToken
}) => {
  const [rules, setRules] = useState<CrmPricingRules | null>(null);

  const [crmCompanyId, setCrmCompanyId] = useState(defaultCompanyId || '');
  const [contactId, setContactId] = useState(defaultContactId || '');
  const [leadId, setLeadId] = useState(defaultLeadId || '');
  const [packageId, setPackageId] = useState('');
  const [userCount, setUserCount] = useState(1);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);
  const [discountPct, setDiscountPct] = useState(0);
  const [notes, setNotes] = useState('');
  const [validDays, setValidDays] = useState(30);

  // Calculation State
  const [calculation, setCalculation] = useState<{
    subtotal: number;
    discountPct: number;
    discountAmount: number;
    taxRate: number;
    taxAmount: number;
    totalAmount: number;
    currency: string;
  } | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOwner = userRole === 'platform_admin' || userRole === 'company_owner' || userRole === 'superadmin' || userRole === 'admin';
  const isTeamLead = userRole === 'team_lead' || userRole === 'lead';

  const maxAllowedDiscount = isOwner
    ? 100
    : isTeamLead
    ? (rules?.teamLeadMaxDiscountPct ?? 25)
    : (rules?.agentMaxDiscountPct ?? 10);

  // Fetch Pricing Rules
  useEffect(() => {
    if (!isOpen) return;
    fetch(`${serverUrl}/api/crm/pricing-rules`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.rules) {
          setRules(data.rules);
          if (data.rules.packages?.length > 0 && !packageId) {
            setPackageId(data.rules.packages[0].id);
          }
        }
      })
      .catch(err => {
        console.error('Failed to load pricing rules', err);
      });
  }, [isOpen, serverUrl, authToken]);

  // Sync default IDs
  useEffect(() => {
    if (isOpen) {
      setCrmCompanyId(defaultCompanyId || '');
      setContactId(defaultContactId || '');
      setLeadId(defaultLeadId || '');
      setDiscountPct(0);
      setNotes('');
      setError(null);
    }
  }, [isOpen, defaultCompanyId, defaultContactId, defaultLeadId]);

  // Recalculate Quote whenever inputs change
  useEffect(() => {
    if (!isOpen || !packageId) return;

    const performCalc = async () => {
      try {
        const res = await fetch(`${serverUrl}/api/crm/quotes/calculate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify({
            packageId,
            userCount,
            billingCycle,
            addonIds: selectedAddonIds,
            discountPct
          })
        });
        if (res.ok) {
          const data = await res.json();
          setCalculation(data);
          setError(null);
        } else {
          const err = await res.json();
          setError(err.error);
        }
      } catch (err: any) {
        console.error('Calculation error', err);
      }
    };

    const timer = setTimeout(performCalc, 150);
    return () => clearTimeout(timer);
  }, [packageId, userCount, billingCycle, selectedAddonIds, discountPct, isOpen, serverUrl, authToken]);

  if (!isOpen) return null;

  const toggleAddon = (addonId: string) => {
    setSelectedAddonIds(prev =>
      prev.includes(addonId) ? prev.filter(id => id !== addonId) : [...prev, addonId]
    );
  };

  const handleDiscountChange = (val: number) => {
    if (val > maxAllowedDiscount) {
      setError(`Discount exceeds your authorized role cap of ${maxAllowedDiscount}%.`);
      setDiscountPct(maxAllowedDiscount);
    } else if (val < 0) {
      setDiscountPct(0);
    } else {
      setError(null);
      setDiscountPct(val);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!packageId) {
      setError('Please select a pricing package.');
      return;
    }
    if (discountPct > maxAllowedDiscount) {
      setError(`Your role maximum discount is ${maxAllowedDiscount}%.`);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const validUntil = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000).toISOString();
      const res = await fetch(`${serverUrl}/api/crm/quotes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          crmCompanyId: crmCompanyId || undefined,
          contactId: contactId || undefined,
          leadId: leadId || undefined,
          packageId,
          userCount,
          billingCycle,
          addonIds: selectedAddonIds,
          discountPct,
          notes: notes.trim() || undefined,
          validUntil
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create quote');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save quote');
    } finally {
      setSubmitting(false);
    }
  };

  const currencySymbol = calculation?.currency === 'USD' ? '$' : calculation?.currency || '$';

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in select-none"
    >
      <div className="w-full max-w-2xl bg-[#0e0e11] border border-[#27272a] rounded-2xl shadow-2xl overflow-hidden flex flex-col text-left">
        {/* Header */}
        <div className="p-5 border-b border-[#1f1f23] flex items-center justify-between bg-[#121216]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-white tracking-tight">Sales Price Calculator & Quote Builder</h2>
                {isOwner ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> Owner Tier
                  </span>
                ) : isTeamLead ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center gap-1">
                    <Tag className="w-3 h-3" /> Team Lead (Cap {maxAllowedDiscount}%)
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                    <Tag className="w-3 h-3" /> Agent (Cap {maxAllowedDiscount}%)
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400">Configure customer plan, calculate line totals, and save formal quote</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg border border-[#27272a] text-zinc-400 hover:text-white hover:bg-[#1f1f23]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Client Links */}
          <div className="grid grid-cols-3 gap-3 p-3 bg-[#141418] border border-[#27272a] rounded-xl">
            <div>
              <label className="block text-[11px] font-mono font-bold uppercase text-zinc-400 mb-1">
                Company
              </label>
              <select
                value={crmCompanyId}
                onChange={(e) => setCrmCompanyId(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-[#18181b] border border-[#27272a] rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
              >
                <option value="">None / Direct</option>
                {companies.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-mono font-bold uppercase text-zinc-400 mb-1">
                Contact
              </label>
              <select
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-[#18181b] border border-[#27272a] rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
              >
                <option value="">None</option>
                {contacts.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-mono font-bold uppercase text-zinc-400 mb-1">
                Lead
              </label>
              <select
                value={leadId}
                onChange={(e) => setLeadId(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-[#18181b] border border-[#27272a] rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
              >
                <option value="">None</option>
                {leads.map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Package Selection */}
          <div>
            <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-2">
              Select Package Tier <span className="text-amber-500">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              {rules?.packages.map((pkg) => {
                const isSelected = packageId === pkg.id;
                const pkgPrice = billingCycle === 'annual' ? pkg.priceAnnual : pkg.priceMonthly;
                return (
                  <div
                    key={pkg.id}
                    onClick={() => setPackageId(pkg.id)}
                    className={`p-3 rounded-xl border cursor-pointer transition flex flex-col justify-between ${
                      isSelected
                        ? 'bg-amber-500/10 border-amber-500/50 shadow-md shadow-amber-500/10'
                        : 'bg-[#18181b] border-[#27272a] hover:border-zinc-600'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-black text-white">{pkg.name}</span>
                        {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />}
                      </div>
                      <p className="text-[11px] text-zinc-400 line-clamp-2 mb-2">{pkg.description}</p>
                    </div>
                    <div className="border-t border-[#27272a] pt-1.5 flex items-baseline justify-between">
                      <span className="text-sm font-black text-amber-400">
                        {currencySymbol}{pkgPrice.toLocaleString()}
                      </span>
                      <span className="text-[10px] text-zinc-500">
                        /{billingCycle === 'annual' ? 'yr' : 'mo'} ({pkg.includedUsers} seats)
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Seats & Billing Cycle */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
                Total Team Seats / Users
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={userCount}
                  onChange={(e) => setUserCount(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                />
                <span className="text-xs text-zinc-500 shrink-0">users</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
                Billing Cycle
              </label>
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#18181b] border border-[#27272a] rounded-xl">
                <button
                  type="button"
                  onClick={() => setBillingCycle('monthly')}
                  className={`py-1.5 text-xs font-bold rounded-lg transition ${
                    billingCycle === 'monthly'
                      ? 'bg-amber-500 text-black shadow'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setBillingCycle('annual')}
                  className={`py-1.5 text-xs font-bold rounded-lg transition ${
                    billingCycle === 'annual'
                      ? 'bg-amber-500 text-black shadow'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Annual (Discounted)
                </button>
              </div>
            </div>
          </div>

          {/* Add-ons Checklist */}
          {rules?.addons && rules.addons.length > 0 && (
            <div>
              <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-2">
                Available Add-ons
              </label>
              <div className="grid grid-cols-3 gap-2">
                {rules.addons.map(addon => {
                  const checked = selectedAddonIds.includes(addon.id);
                  const price = billingCycle === 'annual' ? addon.priceAnnual : addon.priceMonthly;
                  return (
                    <label
                      key={addon.id}
                      className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition ${
                        checked
                          ? 'bg-amber-500/10 border-amber-500/40 text-white'
                          : 'bg-[#18181b] border-[#27272a] text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleAddon(addon.id)}
                        className="w-3.5 h-3.5 rounded border-zinc-700 text-amber-500 focus:ring-amber-500/20 bg-zinc-900"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-bold truncate">{addon.name}</div>
                        <div className="text-[10px] text-zinc-500">
                          +{currencySymbol}{price}/{billingCycle === 'annual' ? 'yr' : 'mo'}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Discount & Validity */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-mono font-bold uppercase text-zinc-400">
                  Sales Discount (%)
                </label>
                <span className="text-[10px] text-zinc-500 font-mono">
                  Cap: {maxAllowedDiscount}%
                </span>
              </div>
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  max={maxAllowedDiscount}
                  value={discountPct}
                  onChange={(e) => handleDiscountChange(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 pr-8 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                />
                <Percent className="w-3.5 h-3.5 text-zinc-500 absolute right-3 top-2.5" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
                Quote Validity (Days)
              </label>
              <select
                value={validDays}
                onChange={(e) => setValidDays(parseInt(e.target.value))}
                className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
              >
                <option value={7}>7 Days</option>
                <option value={14}>14 Days</option>
                <option value={30}>30 Days (Standard)</option>
                <option value={60}>60 Days</option>
                <option value={90}>90 Days</option>
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-mono font-bold uppercase text-zinc-400 mb-1.5">
              Quote Scope & Payment Terms
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Net 15 days upon signature. Dedicated account onboarding included."
              className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 resize-none"
            />
          </div>

          {/* Live Financial Summary Banner */}
          {calculation && (
            <div className="p-4 bg-gradient-to-br from-amber-500/10 via-[#18181b] to-[#121216] border border-amber-500/30 rounded-2xl space-y-2.5">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Subtotal ({billingCycle}):</span>
                <span className="font-mono text-zinc-200">
                  {currencySymbol}{calculation.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              {calculation.discountAmount > 0 && (
                <div className="flex items-center justify-between text-xs text-emerald-400">
                  <span>Discount ({calculation.discountPct}%):</span>
                  <span className="font-mono">
                    -{currencySymbol}{calculation.discountAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Tax ({(calculation.taxRate * 100).toFixed(0)}%):</span>
                <span className="font-mono text-zinc-200">
                  +{currencySymbol}{calculation.taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="border-t border-amber-500/20 pt-2 flex items-center justify-between">
                <div>
                  <span className="text-xs font-mono uppercase text-amber-400 font-bold">Total Quote Price:</span>
                  <p className="text-[10px] text-zinc-500">Includes seats, base tier & add-ons</p>
                </div>
                <div className="text-xl font-black text-amber-400 font-mono">
                  {currencySymbol}{calculation.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-3 border-t border-[#1f1f23] flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs font-bold text-zinc-300 hover:text-white hover:bg-[#202025] transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !packageId}
              className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-extrabold text-xs rounded-xl shadow-lg shadow-amber-500/20 transition disabled:opacity-50 flex items-center gap-1.5"
            >
              <DollarSign className="w-4 h-4" />
              {submitting ? 'Generating...' : 'Save & Issue Quote'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// 2. OWNER PRICING RULES MODAL
// -------------------------------------------------------------
interface PricingRulesModalProps extends ModalBaseProps {
  onSuccess: () => void;
}

export const PricingRulesModal: React.FC<PricingRulesModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  serverUrl,
  authToken
}) => {
  const [currency, setCurrency] = useState('USD');
  const [taxRate, setTaxRate] = useState(0.10);
  const [agentMaxDiscountPct, setAgentMaxDiscountPct] = useState(10);
  const [teamLeadMaxDiscountPct, setTeamLeadMaxDiscountPct] = useState(25);
  const [perUserPriceMonthly, setPerUserPriceMonthly] = useState(25);
  const [perUserPriceAnnual, setPerUserPriceAnnual] = useState(240);
  const [packages, setPackages] = useState<PricingPackage[]>([]);
  const [addons, setAddons] = useState<PricingAddon[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    fetch(`${serverUrl}/api/crm/pricing-rules`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.rules) {
          const r = data.rules;
          setCurrency(r.currency || 'USD');
          setTaxRate(r.taxRate ?? 0.10);
          setAgentMaxDiscountPct(r.agentMaxDiscountPct ?? 10);
          setTeamLeadMaxDiscountPct(r.teamLeadMaxDiscountPct ?? 25);
          setPerUserPriceMonthly(r.perUserPriceMonthly ?? 25);
          setPerUserPriceAnnual(r.perUserPriceAnnual ?? 240);
          setPackages(r.packages || []);
          setAddons(r.addons || []);
        }
      })
      .catch(err => {
        setError('Failed to load rules: ' + err.message);
      });
  }, [isOpen, serverUrl, authToken]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/api/crm/pricing-rules`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          currency,
          taxRate,
          agentMaxDiscountPct,
          teamLeadMaxDiscountPct,
          perUserPriceMonthly,
          perUserPriceAnnual,
          packages,
          addons
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update pricing rules');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error updating rules');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in select-none"
    >
      <div className="w-full max-w-2xl bg-[#0e0e11] border border-[#27272a] rounded-2xl shadow-2xl overflow-hidden flex flex-col text-left">
        <div className="p-5 border-b border-[#1f1f23] flex items-center justify-between bg-[#121216]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-white tracking-tight">Owner Sales Pricing Control</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  Company Owner Only
                </span>
              </div>
              <p className="text-xs text-zinc-400">Define base seat prices, agent discount ceilings, and catalog tiers</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg border border-[#27272a] text-zinc-400 hover:text-white hover:bg-[#1f1f23]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Core Controls */}
          <div className="p-4 bg-[#141418] border border-[#27272a] rounded-xl space-y-3">
            <h3 className="text-xs font-mono font-bold uppercase text-amber-400">Discount Ceilings & Currency</h3>
            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-mono font-bold text-zinc-400 mb-1">
                  Currency
                </label>
                <input
                  type="text"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  className="w-full px-2.5 py-1.5 bg-[#18181b] border border-[#27272a] rounded-lg text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono font-bold text-zinc-400 mb-1">
                  Tax Rate (%)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  max={1}
                  value={taxRate}
                  onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 bg-[#18181b] border border-[#27272a] rounded-lg text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono font-bold text-zinc-400 mb-1">
                  Agent Max Disc (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={agentMaxDiscountPct}
                  onChange={(e) => setAgentMaxDiscountPct(parseInt(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 bg-[#18181b] border border-[#27272a] rounded-lg text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono font-bold text-zinc-400 mb-1">
                  Lead Max Disc (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={teamLeadMaxDiscountPct}
                  onChange={(e) => setTeamLeadMaxDiscountPct(parseInt(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 bg-[#18181b] border border-[#27272a] rounded-lg text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>
            </div>
          </div>

          {/* Seat Rates */}
          <div className="p-4 bg-[#141418] border border-[#27272a] rounded-xl space-y-3">
            <h3 className="text-xs font-mono font-bold uppercase text-amber-400">Additional Seat Pricing</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-mono font-bold text-zinc-400 mb-1">
                  Per Additional Seat (Monthly $/seat)
                </label>
                <input
                  type="number"
                  min={0}
                  value={perUserPriceMonthly}
                  onChange={(e) => setPerUserPriceMonthly(parseFloat(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 bg-[#18181b] border border-[#27272a] rounded-lg text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono font-bold text-zinc-400 mb-1">
                  Per Additional Seat (Annual $/seat)
                </label>
                <input
                  type="number"
                  min={0}
                  value={perUserPriceAnnual}
                  onChange={(e) => setPerUserPriceAnnual(parseFloat(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 bg-[#18181b] border border-[#27272a] rounded-lg text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>
            </div>
          </div>

          {/* Packages Overview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-mono font-bold uppercase text-zinc-400">Defined Packages ({packages.length})</h3>
            </div>
            <div className="space-y-2">
              {packages.map((pkg) => (
                <div key={pkg.id} className="p-3 bg-[#18181b] border border-[#27272a] rounded-xl flex items-center justify-between">
                  <div>
                    <div className="text-xs font-black text-white">{pkg.name}</div>
                    <div className="text-[11px] text-zinc-400">Includes {pkg.includedUsers} seats, up to {pkg.maxCallsPerMonth.toLocaleString()} calls</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-mono font-bold text-amber-400">${pkg.priceMonthly}/mo</div>
                    <div className="text-[10px] font-mono text-zinc-500">${pkg.priceAnnual}/yr</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-3 border-t border-[#1f1f23] flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs font-bold text-zinc-300 hover:text-white hover:bg-[#202025] transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-extrabold text-xs rounded-xl shadow-lg shadow-amber-500/20 transition disabled:opacity-50"
            >
              {submitting ? 'Saving...' : 'Save Pricing Rules'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
