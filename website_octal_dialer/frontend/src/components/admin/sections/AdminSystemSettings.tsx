import React, { useState, useEffect } from 'react';
import {
  Settings, Save, AlertCircle, CheckCircle2, RefreshCw, Shield, Phone, Mail, Bot, Sliders
} from 'lucide-react';

interface AdminSystemSettingsProps {
  isLight?: boolean;
  serverUrl: string;
  authToken: string;
}

export const AdminSystemSettings: React.FC<AdminSystemSettingsProps> = ({
  isLight,
  serverUrl,
  authToken
}) => {
  const [settings, setSettings] = useState<Record<string, any>>({
    ringTimeoutSecs: 35,
    dialDelaySecs: 3,
    maxConcurrentDials: 1,
    sessionTimeoutMins: 60,
    dailyScrapeLimit: 5000,
    autoDropVoicemail: true,
    enforceStrictDnc: true,
    allowRegistration: false
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/api/admin/settings`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.settings && typeof data.settings === 'object') {
          setSettings(prev => ({ ...prev, ...data.settings }));
        }
      }
    } catch {
      // Keep defaults if not configured
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, [serverUrl, authToken]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/api/admin/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ settings })
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess('System configuration parameters saved successfully.');
        setTimeout(() => setSuccess(null), 4000);
      } else {
        setError(data.error || 'Failed to save system settings');
      }
    } catch (err: any) {
      setError(err.message || 'Connection error while saving settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 text-left">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className={`text-xl font-black font-display tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
            System & Engine Configuration
          </h2>
          <p className={`text-xs mt-1 font-medium ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
            Platform default operational parameters, telephony thresholds, and automation safety limits.
          </p>
        </div>

        <button
          onClick={fetchSettings}
          disabled={loading}
          className={`p-2 rounded-xl border transition-all cursor-pointer self-start sm:self-auto ${
            isLight ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700' : 'bg-[#18181b] hover:bg-[#27272a] border-[#18181b] text-slate-300'
          }`}
          title="Reload settings"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-500' : ''}`} />
        </button>
      </div>

      {error && (
        <div className={`p-3.5 border text-xs rounded-xl flex items-start gap-2.5 shadow-sm ${
          isLight ? 'bg-red-50 border-red-200 text-red-700' : 'bg-red-950/30 border-red-900/50 text-red-400'
        }`}>
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className={`p-3.5 border text-xs rounded-xl flex items-start gap-2.5 shadow-sm ${
          isLight ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-emerald-950/30 border-emerald-900/50 text-emerald-400'
        }`}>
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{success}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Category 1: Telephony Engine Defaults */}
        <div className={`border rounded-2xl p-5 shadow-xl space-y-4 ${
          isLight ? 'bg-white border-slate-200 text-slate-900 shadow-sm' : 'bg-[#09090b] border-[#18181b] text-white'
        }`}>
          <div className={`flex items-center gap-2 border-b pb-3 ${isLight ? 'border-slate-200' : 'border-[#18181b]'}`}>
            <Phone className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-bold font-display uppercase tracking-wider text-amber-500">
              Telephony Engine Safeguards
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 font-mono text-xs">
            <div>
              <label className={`block text-[10px] uppercase font-bold mb-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                Default Ring Timeout (seconds)
              </label>
              <input
                type="number"
                min={10}
                max={90}
                value={settings.ringTimeoutSecs}
                onChange={e => setSettings({ ...settings, ringTimeoutSecs: Number(e.target.value) })}
                className={`w-full px-3 py-2 rounded-xl border outline-none ${
                  isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-[#18181b] border-[#18181b] text-white focus:border-amber-500'
                }`}
              />
              <span className="text-[9px] text-slate-500 mt-0.5 block">Time before call auto-drops as NO_ANSWER</span>
            </div>

            <div>
              <label className={`block text-[10px] uppercase font-bold mb-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                Delay Between Leads (seconds)
              </label>
              <input
                type="number"
                min={1}
                max={30}
                value={settings.dialDelaySecs}
                onChange={e => setSettings({ ...settings, dialDelaySecs: Number(e.target.value) })}
                className={`w-full px-3 py-2 rounded-xl border outline-none ${
                  isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-[#18181b] border-[#18181b] text-white focus:border-amber-500'
                }`}
              />
              <span className="text-[9px] text-slate-500 mt-0.5 block">Cooldown between auto-dialed queue calls</span>
            </div>

            <div>
              <label className={`block text-[10px] uppercase font-bold mb-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                Strict DNC Enforcement
              </label>
              <select
                value={settings.enforceStrictDnc ? 'true' : 'false'}
                onChange={e => setSettings({ ...settings, enforceStrictDnc: e.target.value === 'true' })}
                className={`w-full px-3 py-2 rounded-xl border outline-none cursor-pointer ${
                  isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-[#18181b] border-[#18181b] text-white'
                }`}
              >
                <option value="true">Enabled (Block all suppression list numbers)</option>
                <option value="false">Disabled</option>
              </select>
              <span className="text-[9px] text-slate-500 mt-0.5 block">Zero-tolerance blacklisted phone number skip</span>
            </div>
          </div>
        </div>

        {/* Category 2: Automation & Session Controls */}
        <div className={`border rounded-2xl p-5 shadow-xl space-y-4 ${
          isLight ? 'bg-white border-slate-200 text-slate-900 shadow-sm' : 'bg-[#09090b] border-[#18181b] text-white'
        }`}>
          <div className={`flex items-center gap-2 border-b pb-3 ${isLight ? 'border-slate-200' : 'border-[#18181b]'}`}>
            <Sliders className="w-4 h-4 text-purple-500" />
            <h3 className="text-sm font-bold font-display uppercase tracking-wider text-purple-500">
              Automation & Session Governance
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 font-mono text-xs">
            <div>
              <label className={`block text-[10px] uppercase font-bold mb-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                Session Idle Timeout (minutes)
              </label>
              <input
                type="number"
                min={15}
                max={480}
                value={settings.sessionTimeoutMins}
                onChange={e => setSettings({ ...settings, sessionTimeoutMins: Number(e.target.value) })}
                className={`w-full px-3 py-2 rounded-xl border outline-none ${
                  isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-[#18181b] border-[#18181b] text-white focus:border-amber-500'
                }`}
              />
              <span className="text-[9px] text-slate-500 mt-0.5 block">JWT token expiration window</span>
            </div>

            <div>
              <label className={`block text-[10px] uppercase font-bold mb-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                Daily Scraper Safeguard Limit
              </label>
              <input
                type="number"
                min={100}
                max={50000}
                value={settings.dailyScrapeLimit}
                onChange={e => setSettings({ ...settings, dailyScrapeLimit: Number(e.target.value) })}
                className={`w-full px-3 py-2 rounded-xl border outline-none ${
                  isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-[#18181b] border-[#18181b] text-white focus:border-amber-500'
                }`}
              />
              <span className="text-[9px] text-slate-500 mt-0.5 block">Max business records extractable per day</span>
            </div>
          </div>
        </div>

        {/* Save Bar */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl transition flex items-center gap-2 cursor-pointer shadow-lg"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving...' : 'Save Configuration Changes'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
