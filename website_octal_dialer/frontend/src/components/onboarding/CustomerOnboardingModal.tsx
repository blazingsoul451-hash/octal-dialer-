import React, { useState } from 'react';
import {
  Building2, User, Users, ArrowRight, ArrowLeft, Check, Sparkles,
  ShieldCheck, CheckCircle2, AlertCircle, Briefcase, Shield
} from 'lucide-react';
import type { AuthIdentity } from '../../utils/roleUtils';

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

  // Form Fields
  const [companyName, setCompanyName] = useState(() => localStorage.getItem('pending_business_name') || '');
  const [workspaceName, setWorkspaceName] = useState(
    currentUser.username ? `${currentUser.username}'s Workspace` : 'My Workspace'
  );
  const [fullName, setFullName] = useState(currentUser.displayName || currentUser.username || '');
  const [country, setCountry] = useState('US');
  const [timezone, setTimezone] = useState('America/New_York');
  const [teamSize, setTeamSize] = useState('1-5');
  const [industry, setIndustry] = useState('Technology');
  const [phone, setPhone] = useState(() => localStorage.getItem('pending_mobile') || '');
  const [planId, setPlanId] = useState<'plan_starter' | 'plan_pro' | 'plan_enterprise'>('plan_starter');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        industry,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md select-none overflow-y-auto">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl shadow-black/80 overflow-hidden my-8">
        
        {/* Top Progress Bar */}
        <div className="bg-slate-950/60 px-8 py-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-amber-400">
                ZESTIFY SAAS ONBOARDING
              </span>
              <h2 className="text-sm font-bold text-white">Setup Your Customer Workspace</h2>
            </div>
          </div>

          {/* Stepper Dots */}
          <div className="flex items-center gap-2">
            {[1, 2, 3].map(s => (
              <div
                key={s}
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono font-bold transition-all ${
                  step === s
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                    : step > s
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-slate-800 text-slate-500 border border-slate-700'
                }`}
              >
                {step > s ? <Check className="w-3.5 h-3.5" /> : s}
              </div>
            ))}
          </div>
        </div>

        <div className="p-8">
          {error && (
            <div className="mb-6 bg-red-950/40 border border-red-500/40 rounded-xl px-4 py-3 text-xs text-red-300 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* ── STEP 1: WORKSPACE TYPE SELECTION ── */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="text-center space-y-1.5">
                <h3 className="text-xl font-bold text-white">Welcome to Zestify!</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  How will you be using Zestify? Choose the workspace model that best fits your workflow.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                {/* Option 1: Company Workspace */}
                <div
                  id="workspace-type-company"
                  onClick={() => setWorkspaceType('COMPANY')}
                  className={`p-6 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                    workspaceType === 'COMPANY'
                      ? 'bg-amber-500/10 border-amber-500 shadow-xl shadow-amber-500/10'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                      <Building2 className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="text-base font-bold text-white flex items-center gap-2">
                        For My Company
                        {workspaceType === 'COMPANY' && (
                          <span className="text-[10px] bg-amber-500 text-slate-950 px-2 py-0.5 rounded-full font-bold">
                            Recommended
                          </span>
                        )}
                      </h4>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                        Create an organization workspace with multi-agent teams, role permissions, and company seat licensing.
                      </p>
                    </div>
                  </div>
                  <div className="mt-5 pt-3 border-t border-slate-800/60 text-[11px] text-slate-400 font-mono flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 text-amber-400" />
                    <span>Teams • Leads • Roles • Seats</span>
                  </div>
                </div>

                {/* Option 2: Personal Workspace */}
                <div
                  id="workspace-type-personal"
                  onClick={() => setWorkspaceType('PERSONAL')}
                  className={`p-6 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                    workspaceType === 'PERSONAL'
                      ? 'bg-amber-500/10 border-amber-500 shadow-xl shadow-amber-500/10'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                      <User className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="text-base font-bold text-white">Just Me</h4>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                        Solo practitioner or single-operator workspace. Simplified interface without team management clutter.
                      </p>
                    </div>
                  </div>
                  <div className="mt-5 pt-3 border-t border-slate-800/60 text-[11px] text-slate-400 font-mono flex items-center gap-2">
                    <Briefcase className="w-3.5 h-3.5 text-blue-400" />
                    <span>Solo CRM • Dialer • Automation</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={onLogout}
                  className="text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                >
                  Sign Out / Switch Account
                </button>
                <button
                  type="button"
                  id="step1-next-btn"
                  onClick={handleStep1Next}
                  className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-amber-500/20 flex items-center gap-2 transition-all cursor-pointer"
                >
                  <span>Continue</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 2: DETAILS & METADATA ── */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h3 className="text-lg font-bold text-white">
                  {workspaceType === 'COMPANY' ? 'Company Details' : 'Workspace Details'}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {workspaceType === 'COMPANY'
                    ? 'Tell us about your company to tailor your workspace.'
                    : 'Name your personal workspace.'}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Organization / Workspace Name */}
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-mono font-bold text-slate-300 uppercase tracking-wider mb-1.5">
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
                    placeholder={workspaceType === 'COMPANY' ? 'Acme Global Corp' : "Alex's Studio"}
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>

                {/* Full Name */}
                <div>
                  <label className="block text-[11px] font-mono font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    Your Full Name *
                  </label>
                  <input
                    id="input-full-name"
                    type="text"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="Jane Doe"
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>

                {/* Country */}
                <div>
                  <label className="block text-[11px] font-mono font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    Country
                  </label>
                  <select
                    id="select-country"
                    value={country}
                    onChange={e => setCountry(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="US">United States (US)</option>
                    <option value="GB">United Kingdom (UK)</option>
                    <option value="CA">Canada (CA)</option>
                    <option value="AU">Australia (AU)</option>
                    <option value="IN">India (IN)</option>
                    <option value="DE">Germany (DE)</option>
                    <option value="FR">France (FR)</option>
                    <option value="OTHER">Other Country</option>
                  </select>
                </div>

                {/* Timezone */}
                <div>
                  <label className="block text-[11px] font-mono font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    Timezone
                  </label>
                  <select
                    id="select-timezone"
                    value={timezone}
                    onChange={e => setTimezone(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="America/New_York">Eastern Time (US/New York)</option>
                    <option value="America/Chicago">Central Time (US/Chicago)</option>
                    <option value="America/Denver">Mountain Time (US/Denver)</option>
                    <option value="America/Los_Angeles">Pacific Time (US/Los Angeles)</option>
                    <option value="Europe/London">Greenwich Mean Time (London)</option>
                    <option value="Europe/Paris">Central European Time (Paris)</option>
                    <option value="Asia/Kolkata">India Standard Time (IST)</option>
                    <option value="Asia/Dubai">Gulf Standard Time (Dubai)</option>
                    <option value="UTC">UTC / Universal Time</option>
                  </select>
                </div>

                {/* Team Size (Company only) */}
                {workspaceType === 'COMPANY' && (
                  <div>
                    <label className="block text-[11px] font-mono font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                      Approximate Team Size
                    </label>
                    <select
                      id="select-team-size"
                      value={teamSize}
                      onChange={e => setTeamSize(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
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
                    <label className="block text-[11px] font-mono font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                      Industry
                    </label>
                    <select
                      id="select-industry"
                      value={industry}
                      onChange={e => setIndustry(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
                    >
                      <option value="Technology">Technology & SaaS</option>
                      <option value="Real Estate">Real Estate</option>
                      <option value="Agency">Marketing / Sales Agency</option>
                      <option value="Financial">Financial Services</option>
                      <option value="Healthcare">Healthcare</option>
                      <option value="E-commerce">Retail / E-Commerce</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                )}

                {/* Phone */}
                <div>
                  <label className="block text-[11px] font-mono font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    Phone Number (Optional)
                  </label>
                  <input
                    id="input-phone"
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>
                <button
                  type="button"
                  id="step2-next-btn"
                  onClick={handleStep2Next}
                  className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-amber-500/20 flex items-center gap-2 transition-all cursor-pointer"
                >
                  <span>Continue to Plan Selection</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 3: PLAN SELECTION ── */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="text-center space-y-1">
                <h3 className="text-lg font-bold text-white">Select Your Subscription Plan</h3>
                <p className="text-xs text-slate-400">
                  Every plan includes a 14-day full-featured trial. You won't be charged today.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                {/* Plan 1: Starter */}
                <div
                  id="plan-starter-card"
                  onClick={() => setPlanId('plan_starter')}
                  className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                    planId === 'plan_starter'
                      ? 'bg-amber-500/10 border-amber-500 shadow-lg shadow-amber-500/10'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-mono font-bold text-slate-400 uppercase">Starter</span>
                      {planId === 'plan_starter' && (
                        <CheckCircle2 className="w-4 h-4 text-amber-400" />
                      )}
                    </div>
                    <div className="text-xl font-extrabold text-white font-mono">
                      $49 <span className="text-xs text-slate-400 font-normal">/mo</span>
                    </div>
                    <div className="text-[11px] text-amber-400 font-bold mt-1">Up to 5 Seats</div>
                    <ul className="text-[11px] text-slate-300 space-y-1.5 mt-3 pt-3 border-t border-slate-800/80">
                      <li className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>Core CRM Suite</span>
                      </li>
                      <li className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>OCTAL Dialer & GSM</span>
                      </li>
                      <li className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>Auto Emailer (SMTP)</span>
                      </li>
                      <li className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>FB Auto Poster</span>
                      </li>
                    </ul>
                  </div>
                </div>

                {/* Plan 2: Professional */}
                <div
                  id="plan-pro-card"
                  onClick={() => setPlanId('plan_pro')}
                  className={`p-4 rounded-2xl border-2 relative transition-all cursor-pointer flex flex-col justify-between ${
                    planId === 'plan_pro'
                      ? 'bg-amber-500/10 border-amber-500 shadow-lg shadow-amber-500/10'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-amber-500 text-slate-950 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider">
                    Most Popular
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-mono font-bold text-amber-400 uppercase">Professional</span>
                      {planId === 'plan_pro' && (
                        <CheckCircle2 className="w-4 h-4 text-amber-400" />
                      )}
                    </div>
                    <div className="text-xl font-extrabold text-white font-mono">
                      $149 <span className="text-xs text-slate-400 font-normal">/mo</span>
                    </div>
                    <div className="text-[11px] text-amber-400 font-bold mt-1">Up to 20 Seats</div>
                    <ul className="text-[11px] text-slate-300 space-y-1.5 mt-3 pt-3 border-t border-slate-800/80">
                      <li className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>All Starter Features</span>
                      </li>
                      <li className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>Team Hierarchy & Leads</span>
                      </li>
                      <li className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>Team Lead Workspaces</span>
                      </li>
                      <li className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>Priority Support</span>
                      </li>
                    </ul>
                  </div>
                </div>

                {/* Plan 3: Enterprise */}
                <div
                  id="plan-enterprise-card"
                  onClick={() => setPlanId('plan_enterprise')}
                  className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                    planId === 'plan_enterprise'
                      ? 'bg-amber-500/10 border-amber-500 shadow-lg shadow-amber-500/10'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-mono font-bold text-purple-400 uppercase">Enterprise</span>
                      {planId === 'plan_enterprise' && (
                        <CheckCircle2 className="w-4 h-4 text-amber-400" />
                      )}
                    </div>
                    <div className="text-xl font-extrabold text-white font-mono">
                      $499 <span className="text-xs text-slate-400 font-normal">/mo</span>
                    </div>
                    <div className="text-[11px] text-purple-400 font-bold mt-1">1000 Seats / Unlimited</div>
                    <ul className="text-[11px] text-slate-300 space-y-1.5 mt-3 pt-3 border-t border-slate-800/80">
                      <li className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>Unlimited Team Structure</span>
                      </li>
                      <li className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>Custom GSM Dialing Pools</span>
                      </li>
                      <li className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>Dedicated Database Tenant</span>
                      </li>
                      <li className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>24/7 SLA Guarantee</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Core Boundary Notice */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 text-[11px] text-slate-400 flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong className="text-white">Core Zestify Product Boundary:</strong> Your tenant includes full CRM, OCTAL Dialer, Email Sequences, and Facebook Auto Poster. Scraper modules are partitioned to standalone utility suites.
                </span>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>
                <button
                  type="button"
                  id="complete-onboarding-btn"
                  onClick={handleSubmit}
                  disabled={loading}
                  className="px-7 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-xl shadow-amber-500/20 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
                      <span>Provisioning Workspace...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Complete Setup & Launch Workspace</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
