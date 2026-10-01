import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Building2, User, Users, ArrowRight, ArrowLeft, Check, Sparkles,
  ShieldCheck, CheckCircle2, AlertCircle, Briefcase, Shield, Clock,
  Search, ChevronDown, X
} from 'lucide-react';
import type { AuthIdentity } from '../../utils/roleUtils';
import {
  TIMEZONE_LIST,
  getShortTimeForZone,
  getLiveTimeWithSeconds,
  getGmtOffset,
  detectUserTimezone
} from '../../utils/timezoneUtils';
import { ALL_COUNTRIES } from '../../utils/countries';

interface CustomerOnboardingModalProps {
  serverUrl: string;
  authToken: string;
  currentUser: AuthIdentity;
  onComplete: (token: string, identity: AuthIdentity, tenant: any) => void;
  onLogout: () => void;
}

export const CustomerOnboardingModal: React.FC<CustomerOnboardingModalProps> = ({
  serverUrl,
  authToken,
  currentUser,
  onComplete,
  onLogout
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [workspaceType, setWorkspaceType] = useState<'COMPANY' | 'PERSONAL'>('COMPANY');

  // Live timer for live timezone display
  const [currentTime, setCurrentTime] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const detectedTz = useMemo(() => detectUserTimezone(), []);

  // Form Fields
  const [companyName, setCompanyName] = useState(() => localStorage.getItem('pending_business_name') || '');
  const [workspaceName, setWorkspaceName] = useState(
    currentUser.username ? `${currentUser.username}'s Workspace` : 'My Workspace'
  );
  const [fullName, setFullName] = useState(currentUser.displayName || currentUser.username || '');
  const [country, setCountry] = useState(() => {
    if (detectedTz === 'Asia/Karachi') return 'PK';
    if (detectedTz === 'Asia/Dubai') return 'AE';
    if (detectedTz === 'Europe/London') return 'GB';
    return 'US';
  });
  const [timezone, setTimezone] = useState(() => detectedTz);
  const [teamSize, setTeamSize] = useState('1-5');
  const [industry, setIndustry] = useState('Technology & SaaS');
  const [customIndustry, setCustomIndustry] = useState('');
  const [phone, setPhone] = useState(() => localStorage.getItem('pending_mobile') || '');
  const [planId, setPlanId] = useState<'plan_starter' | 'plan_pro' | 'plan_enterprise'>('plan_starter');

  // Country Picker State (Searchable, max 5 items visible, rest scrolls)
  const [isCountryOpen, setIsCountryOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const countryPickerRef = useRef<HTMLDivElement>(null);

  // Timezone Picker State (Searchable, max 5 items visible, rest scrolls)
  const [isTimezoneOpen, setIsTimezoneOpen] = useState(false);
  const [timezoneSearch, setTimezoneSearch] = useState('');
  const timezonePickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (countryPickerRef.current && !countryPickerRef.current.contains(e.target as Node)) {
        setIsCountryOpen(false);
      }
      if (timezonePickerRef.current && !timezonePickerRef.current.contains(e.target as Node)) {
        setIsTimezoneOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredCountries = useMemo(() => {
    const q = countrySearch.trim().toLowerCase();
    if (!q) return ALL_COUNTRIES;
    return ALL_COUNTRIES.filter(
      c => c.name.toLowerCase().includes(q) ||
           c.iso.toLowerCase().includes(q) ||
           c.dialCode.includes(q)
    );
  }, [countrySearch]);

  const filteredTimezones = useMemo(() => {
    const q = timezoneSearch.trim().toLowerCase();
    if (!q) return TIMEZONE_LIST;
    return TIMEZONE_LIST.filter(
      t => t.label.toLowerCase().includes(q) ||
           t.value.toLowerCase().includes(q) ||
           t.cities.toLowerCase().includes(q) ||
           t.region.toLowerCase().includes(q)
    );
  }, [timezoneSearch]);

  const selectedCountryItem = useMemo(() => {
    return ALL_COUNTRIES.find(c => c.iso.toUpperCase() === country.toUpperCase()) || {
      iso: country,
      name: country,
      dialCode: ''
    };
  }, [country]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedTzItem = useMemo(() => {
    return TIMEZONE_LIST.find(t => t.value === timezone) || {
      value: timezone,
      label: timezone,
      cities: 'Local Timezone',
      region: 'Custom'
    };
  }, [timezone]);

  const selectedLiveTime = useMemo(() => {
    return getLiveTimeWithSeconds(timezone, currentTime);
  }, [timezone, currentTime]);

  const selectedOffset = useMemo(() => {
    return getGmtOffset(timezone, currentTime);
  }, [timezone, currentTime]);

  const handleStep1Next = () => {
    if (workspaceType === 'PERSONAL' && !workspaceName) {
      setWorkspaceName(`${fullName || currentUser.username}'s Workspace`);
    }
    setStep(2);
  };

  const handleStep2Next = () => {
    setError(null);
    if (workspaceType === 'COMPANY' && !companyName.trim()) {
      setError('Please enter your Company / Organization name.');
      return;
    }
    if (workspaceType === 'PERSONAL' && !workspaceName.trim()) {
      setError('Please enter your Workspace name.');
      return;
    }
    if (!fullName.trim()) {
      setError('Please enter your full name.');
      return;
    }
    setStep(3);
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = {
        workspaceType,
        companyName: companyName.trim(),
        workspaceName: workspaceName.trim(),
        fullName: fullName.trim(),
        country,
        timezone,
        teamSize,
        industry: industry === 'Other' ? (customIndustry.trim() || 'Other') : industry,
        phone: phone.trim(),
        planId
      };

      const res = await fetch(`${serverUrl}/api/onboarding/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to complete workspace onboarding.');
      }

      const newToken = data.token || authToken;
      const newTenant = data.tenant;
      const updatedUser = data.user;

      const updatedIdentity: AuthIdentity = {
        username: updatedUser.username,
        role: 'admin', // Company Owner
        displayName: updatedUser.displayName || fullName,
        tenantId: newTenant.id,
        userId: updatedUser.id,
        email: updatedUser.email
      };

      localStorage.setItem('octal_auth_token', newToken);
      localStorage.setItem('octal_auth_user', updatedIdentity.username);

      onComplete(newToken, updatedIdentity, newTenant);
    } catch (err: any) {
      setError(err.message || 'Error completing onboarding. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/95 backdrop-blur-xl select-none overflow-y-auto font-sans">
      <div className="w-full max-w-3xl bg-slate-900/95 border-2 border-slate-700/90 rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.9)] overflow-hidden my-auto transition-all">
        
        {/* Dominant Top Header */}
        <div className="bg-slate-950 px-8 py-5 border-b-2 border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border-2 border-amber-500/40 text-amber-400 flex items-center justify-center shadow-lg shadow-amber-500/10">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black tracking-widest text-amber-400 uppercase bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/25">
                  ZESTIFY SAAS ONBOARDING
                </span>
                <span className="text-xs font-bold text-slate-400">
                  Step {step} of 3
                </span>
              </div>
              <h2 className="text-lg font-black text-white tracking-tight mt-0.5">
                {step === 1 && 'Select Your Workspace Structure'}
                {step === 2 && 'Organization & Regional Settings'}
                {step === 3 && 'Choose Subscription Plan'}
              </h2>
            </div>
          </div>

          {/* Dominant Stepper */}
          <div className="flex items-center gap-2.5">
            {[
              { num: 1, label: 'Type' },
              { num: 2, label: 'Details' },
              { num: 3, label: 'Plan' }
            ].map(s => (
              <div key={s.num} className="flex items-center gap-1.5">
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black transition-all ${
                    step === s.num
                      ? 'bg-amber-400 text-slate-950 shadow-lg shadow-amber-400/30 scale-105'
                      : step > s.num
                      ? 'bg-emerald-500/20 text-emerald-300 border-2 border-emerald-500/40'
                      : 'bg-slate-800/80 text-slate-500 border border-slate-700'
                  }`}
                >
                  {step > s.num ? <Check className="w-4 h-4 stroke-[3]" /> : s.num}
                </div>
                <span className={`text-xs font-bold hidden md:inline ${step === s.num ? 'text-amber-400' : 'text-slate-500'}`}>
                  {s.label}
                </span>
                {s.num < 3 && <div className="w-3 h-0.5 bg-slate-800 hidden md:block" />}
              </div>
            ))}
          </div>
        </div>

        <div className="p-6 sm:p-8">
          {error && (
            <div className="mb-6 bg-red-950/60 border-2 border-red-500/50 rounded-2xl px-5 py-4 text-xs font-bold text-red-200 flex items-start gap-3 shadow-lg shadow-red-950/30">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div className="leading-relaxed">{error}</div>
            </div>
          )}

          {/* ── STEP 1: WORKSPACE TYPE SELECTION ── */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="text-center space-y-1.5">
                <h3 className="text-2xl font-black text-white tracking-tight">Welcome to Zestify!</h3>
                <p className="text-sm font-semibold text-slate-300 max-w-lg mx-auto">
                  Choose the workspace model that best fits your workflow. You can expand seats and invite team members anytime.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-3">
                {/* Option 1: Company Workspace */}
                <div
                  id="workspace-type-company"
                  onClick={() => setWorkspaceType('COMPANY')}
                  className={`p-6 rounded-3xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                    workspaceType === 'COMPANY'
                      ? 'bg-amber-500/[0.08] border-amber-400 shadow-2xl shadow-amber-500/15 ring-2 ring-amber-400/20'
                      : 'bg-slate-950/80 border-slate-800 hover:border-slate-700 hover:bg-slate-950'
                  }`}
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border-2 border-amber-500/40 flex items-center justify-center text-amber-400 shadow-lg shadow-amber-500/10">
                        <Building2 className="w-7 h-7" />
                      </div>
                      <span className="text-[11px] bg-amber-400 text-slate-950 px-3 py-1 rounded-full font-black uppercase tracking-wider shadow-md">
                        Recommended
                      </span>
                    </div>
                    <div>
                      <h4 className="text-lg font-black text-white flex items-center gap-2">
                        For My Company
                      </h4>
                      <p className="text-xs font-medium text-slate-300 mt-1.5 leading-relaxed">
                        Create a full multi-user organization workspace with multi-agent teams, team lead assignments, seat licenses, and automated lead distribution.
                      </p>
                    </div>
                  </div>
                  <div className="mt-6 pt-4 border-t border-slate-800/80 text-xs text-amber-300 font-bold flex items-center gap-2">
                    <Users className="w-4 h-4 text-amber-400" />
                    <span>Teams • Lead Pools • Super Admin Hierarchy</span>
                  </div>
                </div>

                {/* Option 2: Personal Workspace */}
                <div
                  id="workspace-type-personal"
                  onClick={() => setWorkspaceType('PERSONAL')}
                  className={`p-6 rounded-3xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                    workspaceType === 'PERSONAL'
                      ? 'bg-amber-500/[0.08] border-amber-400 shadow-2xl shadow-amber-500/15 ring-2 ring-amber-400/20'
                      : 'bg-slate-950/80 border-slate-800 hover:border-slate-700 hover:bg-slate-950'
                  }`}
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="w-14 h-14 rounded-2xl bg-blue-500/20 border-2 border-blue-500/40 flex items-center justify-center text-blue-400 shadow-lg shadow-blue-500/10">
                        <User className="w-7 h-7" />
                      </div>
                      <span className="text-[11px] bg-slate-800 text-slate-300 border border-slate-700 px-3 py-1 rounded-full font-bold uppercase tracking-wider">
                        Solo Operator
                      </span>
                    </div>
                    <div>
                      <h4 className="text-lg font-black text-white">Just Me</h4>
                      <p className="text-xs font-medium text-slate-300 mt-1.5 leading-relaxed">
                        Solo practitioner workspace with a focused, streamlined interface. Full CRM, OCTAL Dialer, Email Campaigns, and automations without team hierarchy clutter.
                      </p>
                    </div>
                  </div>
                  <div className="mt-6 pt-4 border-t border-slate-800/80 text-xs text-blue-300 font-bold flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-blue-400" />
                    <span>Solo CRM • Dialer • Sequence Automation</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-6 border-t-2 border-slate-800">
                <button
                  type="button"
                  onClick={onLogout}
                  className="text-xs font-bold text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  Sign Out / Switch Account
                </button>
                <button
                  type="button"
                  id="step1-next-btn"
                  onClick={handleStep1Next}
                  className="px-7 py-3.5 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-xl shadow-amber-500/20 flex items-center gap-2 transition-all cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0"
                >
                  <span>Continue</span>
                  <ArrowRight className="w-4 h-4 stroke-[3]" />
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 2: DETAILS & METADATA (WITH LIVE EXACT TIMEZONE CLOCK) ── */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-black text-white tracking-tight">
                  {workspaceType === 'COMPANY' ? 'Organization Profile & Regional Settings' : 'Personal Workspace Details'}
                </h3>
                <p className="text-xs font-medium text-slate-300 mt-1">
                  Configure your business identity and time zone. Exact live time in your chosen zone will synchronize call logs and campaign dispatches.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Organization / Workspace Name */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-100 uppercase tracking-wider mb-2">
                    {workspaceType === 'COMPANY' ? 'Company / Organization Name *' : 'Workspace Name *'}
                  </label>
                  <input
                    id="input-company-name"
                    type="text"
                    value={workspaceType === 'COMPANY' ? companyName : workspaceName}
                    onChange={e =>
                      workspaceType === 'COMPANY'
                        ? setCompanyName(e.target.value)
                        : setWorkspaceName(e.target.value)
                    }
                    placeholder={workspaceType === 'COMPANY' ? 'e.g. Apex Global Solutions Ltd.' : "Alex's Studio"}
                    className="w-full bg-slate-950 border-2 border-slate-700 rounded-xl px-4 py-3 text-sm font-semibold text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 shadow-inner"
                    required
                  />
                </div>

                {/* Full Name */}
                <div>
                  <label className="block text-xs font-bold text-slate-100 uppercase tracking-wider mb-2">
                    Your Full Name *
                  </label>
                  <input
                    id="input-full-name"
                    type="text"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="w-full bg-slate-950 border-2 border-slate-700 rounded-xl px-4 py-3 text-sm font-semibold text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 shadow-inner"
                    required
                  />
                </div>

                {/* Country / Region (Searchable dropdown with max 5 items visible, rest scrolls) */}
                <div className="relative" ref={countryPickerRef}>
                  <label className="block text-xs font-bold text-slate-100 uppercase tracking-wider mb-2 flex items-center justify-between">
                    <span>Country / Region</span>
                    <span className="text-[10px] text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                      Searchable ({ALL_COUNTRIES.length} Countries)
                    </span>
                  </label>

                  {/* Trigger Button */}
                  <button
                    type="button"
                    id="select-country-trigger"
                    onClick={() => {
                      setIsCountryOpen(!isCountryOpen);
                      setCountrySearch('');
                    }}
                    className={`w-full bg-slate-950 border-2 rounded-xl px-4 py-3 text-sm font-semibold text-white flex items-center justify-between shadow-inner transition-all cursor-pointer ${
                      isCountryOpen
                        ? 'border-amber-400 ring-2 ring-amber-400/20'
                        : 'border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <span className="w-7 h-6 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-400 font-mono text-[11px] font-black flex items-center justify-center shrink-0">
                        {selectedCountryItem.iso}
                      </span>
                      <span className="truncate font-bold">{selectedCountryItem.name}</span>
                      {selectedCountryItem.dialCode && (
                        <span className="text-xs text-slate-400 font-mono">({selectedCountryItem.dialCode})</span>
                      )}
                    </div>
                    <ChevronDown
                      className={`w-4 h-4 text-slate-400 transition-transform duration-200 shrink-0 ${
                        isCountryOpen ? 'rotate-180 text-amber-400' : ''
                      }`}
                    />
                  </button>

                  {/* Popover Dropdown (Max 5 items visible, rest scroll) */}
                  {isCountryOpen && (
                    <div className="absolute left-0 right-0 top-full mt-2 z-50 bg-slate-900 border-2 border-slate-700/90 rounded-2xl shadow-2xl shadow-black/95 overflow-hidden backdrop-blur-2xl">
                      {/* Search Bar at Top */}
                      <div className="p-2.5 border-b border-slate-800 bg-slate-950/95 sticky top-0 z-10">
                        <div className="relative">
                          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            type="text"
                            value={countrySearch}
                            onChange={(e) => setCountrySearch(e.target.value)}
                            placeholder="Type to search all countries..."
                            className="w-full bg-slate-900 border border-slate-700 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 rounded-xl pl-9 pr-8 py-2 text-xs font-semibold text-white placeholder-slate-500 outline-none"
                            autoFocus
                          />
                          {countrySearch && (
                            <button
                              type="button"
                              onClick={() => setCountrySearch('')}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer p-0.5"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Country Items: Max 5 items visible (~210px), rest scroll smoothly */}
                      <div className="max-h-[210px] overflow-y-auto divide-y divide-slate-800/40">
                        {filteredCountries.length > 0 ? (
                          filteredCountries.map((c) => {
                            const isSelected = c.iso.toUpperCase() === country.toUpperCase();
                            return (
                              <button
                                key={c.iso}
                                type="button"
                                onClick={() => {
                                  setCountry(c.iso);
                                  setIsCountryOpen(false);
                                  setCountrySearch('');
                                }}
                                className={`w-full px-3.5 py-2.5 flex items-center justify-between text-left transition-colors cursor-pointer ${
                                  isSelected
                                    ? 'bg-amber-500/15 text-amber-300 font-bold border-l-4 border-amber-400'
                                    : 'hover:bg-slate-800 text-slate-200'
                                }`}
                              >
                                <div className="flex items-center gap-2.5 truncate">
                                  <span className="w-6 h-5 rounded bg-slate-800 border border-slate-700 text-slate-300 text-[10px] font-mono font-bold flex items-center justify-center shrink-0">
                                    {c.iso}
                                  </span>
                                  <span className="text-xs truncate font-medium">{c.name}</span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0 ml-2">
                                  <span className="text-[11px] text-slate-400 font-mono">{c.dialCode}</span>
                                  {isSelected && <Check className="w-3.5 h-3.5 text-amber-400 stroke-[3]" />}
                                </div>
                              </button>
                            );
                          })
                        ) : (
                          <div className="py-6 px-4 text-center text-xs text-slate-400 font-medium">
                            No country found matching "{countrySearch}"
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Timezone (Searchable dropdown with max 5 items visible, rest scrolls) */}
                <div className="sm:col-span-2 relative" ref={timezonePickerRef}>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
                      <Clock className="w-4 h-4 text-amber-400" />
                      <span>Operating Time Zone (Live Clock Sync)</span>
                    </label>
                    <span className="text-[10px] text-amber-400 font-bold bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20">
                      Searchable ({TIMEZONE_LIST.length} Zones)
                    </span>
                  </div>

                  {/* Trigger Button */}
                  <button
                    type="button"
                    id="select-timezone-trigger"
                    onClick={() => {
                      setIsTimezoneOpen(!isTimezoneOpen);
                      setTimezoneSearch('');
                    }}
                    className={`w-full bg-slate-950 border-2 rounded-xl px-4 py-3 text-sm font-semibold text-white flex items-center justify-between shadow-inner transition-all cursor-pointer ${
                      isTimezoneOpen
                        ? 'border-amber-400 ring-2 ring-amber-400/20'
                        : 'border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <span className="w-8 h-6 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-400 font-mono text-[10px] font-black flex items-center justify-center shrink-0">
                        {selectedOffset}
                      </span>
                      <span className="truncate font-bold">{selectedTzItem.label}</span>
                      <span className="text-xs text-amber-400 font-mono hidden sm:inline">
                        — {getShortTimeForZone(timezone, currentTime)}
                      </span>
                    </div>
                    <ChevronDown
                      className={`w-4 h-4 text-slate-400 transition-transform duration-200 shrink-0 ${
                        isTimezoneOpen ? 'rotate-180 text-amber-400' : ''
                      }`}
                    />
                  </button>

                  {/* Popover Dropdown (Max 5 items visible, rest scroll) */}
                  {isTimezoneOpen && (
                    <div className="absolute left-0 right-0 top-full mt-2 z-50 bg-slate-900 border-2 border-slate-700/90 rounded-2xl shadow-2xl shadow-black/95 overflow-hidden backdrop-blur-2xl">
                      {/* Search Bar at Top */}
                      <div className="p-2.5 border-b border-slate-800 bg-slate-950/95 sticky top-0 z-10">
                        <div className="relative">
                          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            type="text"
                            value={timezoneSearch}
                            onChange={(e) => setTimezoneSearch(e.target.value)}
                            placeholder="Type to search timezone, city, or offset..."
                            className="w-full bg-slate-900 border border-slate-700 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 rounded-xl pl-9 pr-8 py-2 text-xs font-semibold text-white placeholder-slate-500 outline-none"
                            autoFocus
                          />
                          {timezoneSearch && (
                            <button
                              type="button"
                              onClick={() => setTimezoneSearch('')}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer p-0.5"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Timezone Items: Max 5 items visible (~220px), rest scroll smoothly */}
                      <div className="max-h-[220px] overflow-y-auto divide-y divide-slate-800/40">
                        {filteredTimezones.length > 0 ? (
                          filteredTimezones.map((tz) => {
                            const isSelected = tz.value === timezone;
                            const liveShort = getShortTimeForZone(tz.value, currentTime);
                            const offset = getGmtOffset(tz.value, currentTime);
                            return (
                              <button
                                key={tz.value}
                                type="button"
                                onClick={() => {
                                  setTimezone(tz.value);
                                  setIsTimezoneOpen(false);
                                  setTimezoneSearch('');
                                }}
                                className={`w-full px-3.5 py-2.5 flex items-center justify-between text-left transition-colors cursor-pointer ${
                                  isSelected
                                    ? 'bg-amber-500/15 text-amber-300 font-bold border-l-4 border-amber-400'
                                    : 'hover:bg-slate-800 text-slate-200'
                                }`}
                              >
                                <div className="truncate">
                                  <div className="text-xs truncate font-bold text-white flex items-center gap-2">
                                    <span>{tz.label}</span>
                                    <span className="text-[10px] text-slate-400 font-mono font-normal">
                                      ({offset})
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-slate-400 truncate mt-0.5 font-medium">
                                    {tz.cities}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0 ml-3">
                                  <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                                    {liveShort}
                                  </span>
                                  {isSelected && <Check className="w-3.5 h-3.5 text-amber-400 stroke-[3]" />}
                                </div>
                              </button>
                            );
                          })
                        ) : (
                          <div className="py-6 px-4 text-center text-xs text-slate-400 font-medium">
                            No timezone found matching "{timezoneSearch}"
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* DOMINANT LIVE TIME DISPLAY CARD */}
                  <div className="mt-3 p-4 bg-slate-950/90 border-2 border-amber-500/40 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xl shadow-black/50">
                    <div className="flex items-center gap-3.5">
                      <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border-2 border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                        <Clock className="w-6 h-6 animate-pulse" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest">
                            CURRENT LIVE TIME IN SELECTED ZONE
                          </span>
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                          </span>
                        </div>
                        <div className="text-sm font-black text-white flex items-center gap-2 mt-0.5">
                          <span>{selectedTzItem.label}</span>
                        </div>
                        <div className="text-xs text-slate-400 font-medium mt-0.5">
                          Major Cities: {selectedTzItem.cities}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-start sm:items-end bg-slate-900/90 border border-slate-800 px-4 py-2.5 rounded-xl">
                      <div className="text-xl font-black text-amber-400 font-mono tracking-widest tabular-nums drop-shadow-sm">
                        {selectedLiveTime}
                      </div>
                      <div className="text-[11px] font-black text-emerald-400 flex items-center gap-1 mt-0.5">
                        <span>Offset: {selectedOffset}</span>
                      </div>
                    </div>
                  </div>

                  {timezone !== detectedTz && (
                    <button
                      type="button"
                      onClick={() => setTimezone(detectedTz)}
                      className="mt-2 text-xs font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <span>⚡ Detected local location: Set to {detectedTz} ({getShortTimeForZone(detectedTz, currentTime)})</span>
                    </button>
                  )}
                </div>

                {/* Team Size (Company only) */}
                {workspaceType === 'COMPANY' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-100 uppercase tracking-wider mb-2">
                      Approximate Team Size
                    </label>
                    <select
                      id="select-team-size"
                      value={teamSize}
                      onChange={e => setTeamSize(e.target.value)}
                      className="w-full bg-slate-950 border-2 border-slate-700 rounded-xl px-4 py-3 text-sm font-semibold text-white focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 shadow-inner"
                    >
                      <option value="1-5">1 – 5 team members</option>
                      <option value="6-15">6 – 15 team members</option>
                      <option value="16-50">16 – 50 team members</option>
                      <option value="50+">50+ team members</option>
                    </select>
                  </div>
                )}

                {/* Industry */}
                {workspaceType === 'COMPANY' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-100 uppercase tracking-wider mb-2 flex items-center justify-between">
                      <span>Industry</span>
                      {industry === 'Other' && (
                        <span className="text-[10px] text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                          Custom Industry Enabled
                        </span>
                      )}
                    </label>
                    <select
                      id="select-industry"
                      value={industry}
                      onChange={e => setIndustry(e.target.value)}
                      className="w-full bg-slate-950 border-2 border-slate-700 rounded-xl px-4 py-3 text-sm font-semibold text-white focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 shadow-inner"
                    >
                      <option value="Technology & SaaS">Technology & SaaS</option>
                      <option value="Real Estate">Real Estate</option>
                      <option value="Marketing / Sales Agency">Marketing / Sales Agency</option>
                      <option value="Financial Services">Financial Services</option>
                      <option value="Healthcare & Medical">Healthcare & Medical</option>
                      <option value="Retail / E-Commerce">Retail / E-Commerce</option>
                      <option value="Logistics & Transportation">Logistics & Transportation</option>
                      <option value="Legal Services">Legal Services</option>
                      <option value="Education / EdTech">Education / EdTech</option>
                      <option value="Hospitality & Travel">Hospitality & Tourism</option>
                      <option value="Manufacturing & Engineering">Manufacturing & Engineering</option>
                      <option value="Construction & Contracting">Construction & Contracting</option>
                      <option value="Insurance Services">Insurance Services</option>
                      <option value="Solar & Renewable Energy">Solar & Renewable Energy</option>
                      <option value="Automotive">Automotive</option>
                      <option value="Call Center / BPO">Call Center / BPO</option>
                      <option value="Non-Profit & NGO">Non-Profit & NGO</option>
                      <option value="Other">Other / Custom Industry (Type Custom)</option>
                    </select>

                    {/* Custom Industry Input Field */}
                    {industry === 'Other' && (
                      <div className="mt-2.5 animate-in fade-in duration-200">
                        <input
                          type="text"
                          id="input-custom-industry"
                          value={customIndustry}
                          onChange={e => setCustomIndustry(e.target.value)}
                          placeholder="Type your custom industry name..."
                          className="w-full bg-slate-950 border-2 border-amber-500/70 rounded-xl px-4 py-2.5 text-xs font-semibold text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 shadow-inner"
                          autoFocus
                          required
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Phone */}
                <div className={workspaceType === 'COMPANY' ? 'sm:col-span-2' : ''}>
                  <label className="block text-xs font-bold text-slate-100 uppercase tracking-wider mb-2">
                    Contact Phone Number (Optional)
                  </label>
                  <input
                    id="input-phone"
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="+92 300 1234567 or +1 (555) 000-0000"
                    className="w-full bg-slate-950 border-2 border-slate-700 rounded-xl px-4 py-3 text-sm font-semibold text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 shadow-inner"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-6 border-t-2 border-slate-800">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-5 py-2.5 text-xs font-black text-slate-300 hover:text-white flex items-center gap-2 cursor-pointer bg-slate-800/60 hover:bg-slate-800 rounded-xl border border-slate-700 transition-all"
                >
                  <ArrowLeft className="w-4 h-4 stroke-[3]" />
                  <span>Back</span>
                </button>
                <button
                  type="button"
                  id="step2-next-btn"
                  onClick={handleStep2Next}
                  className="px-7 py-3.5 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-xl shadow-amber-500/20 flex items-center gap-2 transition-all cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0"
                >
                  <span>Continue to Plan Selection</span>
                  <ArrowRight className="w-4 h-4 stroke-[3]" />
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 3: PLAN SELECTION ── */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="text-center space-y-1.5">
                <h3 className="text-2xl font-black text-white tracking-tight">Select Subscription Plan</h3>
                <p className="text-sm font-semibold text-slate-300">
                  Every plan includes a 14-day full-featured trial. You won't be charged today.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Plan 1: Starter */}
                <div
                  id="plan-starter-card"
                  onClick={() => setPlanId('plan_starter')}
                  className={`p-5 rounded-3xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                    planId === 'plan_starter'
                      ? 'bg-amber-500/[0.08] border-amber-400 shadow-2xl shadow-amber-500/15 ring-2 ring-amber-400/20'
                      : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-black text-slate-300 uppercase tracking-wider">Starter</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        14-DAY TRIAL
                      </span>
                      {planId === 'plan_starter' && (
                        <CheckCircle2 className="w-5 h-5 text-amber-400" />
                      )}
                    </div>
                    <div className="text-3xl font-black text-white">
                      $0 <span className="text-xs text-slate-400 font-bold">today</span>
                    </div>
                    <div className="text-[11px] text-slate-400 font-medium">then $29/mo after 14 days</div>
                    <div className="text-xs text-amber-400 font-extrabold mt-1">Up to 5 Seats</div>
                    <ul className="text-xs text-slate-200 font-medium space-y-2.5 mt-4 pt-4 border-t-2 border-slate-800">
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0 stroke-[3]" />
                        <span>Core CRM Suite</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0 stroke-[3]" />
                        <span>OCTAL Dialer & GSM</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0 stroke-[3]" />
                        <span>Auto Emailer (SMTP)</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0 stroke-[3]" />
                        <span>FB Auto Poster</span>
                      </li>
                    </ul>
                  </div>
                </div>

                {/* Plan 2: Professional */}
                <div
                  id="plan-pro-card"
                  onClick={() => setPlanId('plan_pro')}
                  className={`p-5 rounded-3xl border-2 relative transition-all cursor-pointer flex flex-col justify-between ${
                    planId === 'plan_pro'
                      ? 'bg-amber-500/[0.08] border-amber-400 shadow-2xl shadow-amber-500/15 ring-2 ring-amber-400/20'
                      : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-400 text-slate-950 px-3 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider shadow-md">
                    Most Popular • Recommended
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-black text-amber-400 uppercase tracking-wider">Professional</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/15 text-amber-300 border border-amber-500/40">
                        14-DAY TRIAL
                      </span>
                      {planId === 'plan_pro' && (
                        <CheckCircle2 className="w-5 h-5 text-amber-400" />
                      )}
                    </div>
                    <div className="text-3xl font-black text-white">
                      $0 <span className="text-xs text-slate-400 font-bold">today</span>
                    </div>
                    <div className="text-[11px] text-slate-400 font-medium">then $79/mo after 14 days</div>
                    <div className="text-xs text-amber-400 font-extrabold mt-1">Up to 20 Seats</div>
                    <ul className="text-xs text-slate-200 font-medium space-y-2.5 mt-4 pt-4 border-t-2 border-slate-800">
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0 stroke-[3]" />
                        <span>All Starter Features</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0 stroke-[3]" />
                        <span>Team Hierarchy & Leads</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0 stroke-[3]" />
                        <span>Team Lead Workspaces</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0 stroke-[3]" />
                        <span>Priority Support</span>
                      </li>
                    </ul>
                  </div>
                </div>

                {/* Plan 3: Enterprise */}
                <div
                  id="plan-enterprise-card"
                  onClick={() => setPlanId('plan_enterprise')}
                  className={`p-5 rounded-3xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                    planId === 'plan_enterprise'
                      ? 'bg-amber-500/[0.08] border-amber-400 shadow-2xl shadow-amber-500/15 ring-2 ring-amber-400/20'
                      : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-black text-purple-400 uppercase tracking-wider">Enterprise</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-500/15 text-purple-300 border border-purple-500/40">
                        14-DAY TRIAL
                      </span>
                      {planId === 'plan_enterprise' && (
                        <CheckCircle2 className="w-5 h-5 text-amber-400" />
                      )}
                    </div>
                    <div className="text-3xl font-black text-white">
                      $0 <span className="text-xs text-slate-400 font-bold">today</span>
                    </div>
                    <div className="text-[11px] text-slate-400 font-medium">then $199/mo after 14 days</div>
                    <div className="text-xs text-purple-400 font-extrabold mt-1">1000 Seats / Unlimited</div>
                    <ul className="text-xs text-slate-200 font-medium space-y-2.5 mt-4 pt-4 border-t-2 border-slate-800">
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0 stroke-[3]" />
                        <span>Unlimited Team Structure</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0 stroke-[3]" />
                        <span>Custom GSM Dialing Pools</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0 stroke-[3]" />
                        <span>Dedicated Database Tenant</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0 stroke-[3]" />
                        <span>24/7 SLA Guarantee</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Core Boundary Notice */}
              <div className="bg-slate-950 border-2 border-slate-800 rounded-2xl p-4 text-xs font-semibold text-slate-300 flex items-start gap-3 shadow-lg">
                <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <span className="leading-relaxed">
                  <strong className="text-white">Core Zestify Product Boundary:</strong> Your 14-day trial includes full CRM, OCTAL Dialer, Email Sequences, and Facebook Auto Poster. Scraper modules are partitioned to standalone utility suites.
                </span>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t-2 border-slate-800">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="px-5 py-2.5 text-xs font-black text-slate-300 hover:text-white flex items-center gap-2 cursor-pointer bg-slate-800/60 hover:bg-slate-800 rounded-xl border border-slate-700 transition-all"
                >
                  <ArrowLeft className="w-4 h-4 stroke-[3]" />
                  <span>Back</span>
                </button>
                <div className="flex flex-col items-center sm:items-end gap-1.5">
                  <button
                    type="button"
                    id="complete-onboarding-btn"
                    onClick={handleSubmit}
                    disabled={loading}
                    className="px-8 py-4 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-xl shadow-amber-500/25 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 transform hover:-translate-y-0.5 active:translate-y-0"
                  >
                    {loading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
                        <span>Starting 14-Day Free Trial...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>⚡ Start 14-Day Free Trial & Open Workspace →</span>
                      </>
                    )}
                  </button>
                  <span className="text-[11px] text-slate-400 font-medium">
                    🔒 No credit card required today • Instant full access
                  </span>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
