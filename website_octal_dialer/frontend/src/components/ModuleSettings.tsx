import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Save, RefreshCw } from 'lucide-react';

interface ModuleSettingsProps {
  isLight?: boolean;
  serverUrl: string;
  authToken: string;
  moduleId: string;
  moduleName: string;
  isAdmin: boolean;
}

export const ModuleSettings: React.FC<ModuleSettingsProps> = ({
  isLight,
  serverUrl,
  authToken,
  moduleId,
  moduleName,
  isAdmin
}) => {
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/settings/${moduleId}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      } else {
        const errorData = await res.json();
        setError(errorData.error || 'Failed to fetch settings');
      }
    } catch {
      setError('Connection error while fetching settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, [moduleId, serverUrl, authToken]);

  const handleSaveSettings = async () => {
    setError(null);
    setSuccess(null);
    try {
      const endpoint = isAdmin ? `/settings/${moduleId}` : `/settings/${moduleId}/mine`;
      const res = await fetch(`${serverUrl}${endpoint}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(settings)
      });

      const data = await res.json();
      if (res.ok) {
        setSuccess(isAdmin ? 'Global settings updated' : 'Your settings updated');
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(data.error || 'Failed to save settings');
      }
    } catch {
      setError('Connection error while saving settings');
    }
  };

  const handleChange = (key: string, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  // Define settings schemas per module
  const getModuleSchema = () => {
    switch (moduleId) {
      case 'octalDialer':
        return [
          { key: 'maxConcurrentCalls', label: 'Max Concurrent Calls', type: 'number', default: 3 },
          { key: 'retryAttempts', label: 'Retry Attempts', type: 'number', default: 2 },
          { key: 'retryDelaySeconds', label: 'Retry Delay (seconds)', type: 'number', default: 60 },
          { key: 'autoDialMode', label: 'Auto Dial Mode', type: 'boolean', default: false },
          { key: 'callRecordingEnabled', label: 'Call Recording', type: 'boolean', default: false },
        ];
      case 'googleScraper':
        return [
          { key: 'resultsPerQuery', label: 'Results Per Query', type: 'number', default: 20 },
          { key: 'delayBetweenRequestsMs', label: 'Delay Between Requests (ms)', type: 'number', default: 2000 },
          { key: 'duplicateHandling', label: 'Duplicate Handling', type: 'select', options: ['skip', 'update'], default: 'skip' },
        ];
      case: 'autoEmailer':
        return [
          { key: 'sendRatePerHour', label: 'Send Rate Per Hour', type: 'number', default: 50 },
          { key: 'unsubscribeLinkRequired', label: 'Unsubscribe Link Required', type: 'boolean', default: true },
        ];
      case 'facebookScraper':
        return [
          { key: 'delayBetweenRequestsMs', label: 'Delay Between Requests (ms)', type: 'number', default: 3000 },
          { key: 'sessionExpiryWarningDays', label: 'Session Expiry Warning (days)', type: 'number', default: 7 },
        ];
      case 'facebookPoster':
        return [
          { key: 'maxPostsPerDay', label: 'Max Posts Per Day', type: 'number', default: 10 },
          { key: 'requireApprovalBeforePosting', label: 'Require Approval', type: 'boolean', default: false },
        ];
      default:
        return [];
    }
  };

  const schema = getModuleSchema();

  return (
    <div className={`p-6 ${isLight ? 'bg-white' : 'bg-slate-900'}`}>
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <SettingsIcon className={`w-6 h-6 ${isLight ? 'text-amber-600' : 'text-amber-400'}`} />
            <h2 className={`text-2xl font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
              {moduleName} Settings
            </h2>
          </div>
          <div className="flex gap-2">
            <button
              onClick={fetchSettings}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                isLight
                  ? 'bg-slate-200 hover:bg-slate-300 text-slate-900'
                  : 'bg-slate-700 hover:bg-slate-600 text-white'
              }`}
            >
              <RefreshCw className="w-4 h-4" />
              Reset
            </button>
            <button
              onClick={handleSaveSettings}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-lg transition-colors"
            >
              <Save className="w-4 h-4" />
              Save
            </button>
          </div>
        </div>

        {/* Success/Error Messages */}
        {success && (
          <div className="mb-4 bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-3 text-sm text-green-600 dark:text-green-400">
            {success}
          </div>
        )}
        {error && (
          <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Settings Form */}
        <div className={`rounded-lg border ${isLight ? 'bg-white border-slate-200' : 'bg-slate-800 border-slate-700'} p-6`}>
          {loading ? (
            <div className="text-center py-8 text-slate-500">Loading settings...</div>
          ) : schema.length === 0 ? (
            <div className="text-center py-8 text-slate-500">No configurable settings for this module</div>
          ) : (
            <div className="space-y-4">
              {isAdmin && (
                <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg px-4 py-3 mb-4">
                  <div className="text-sm font-medium text-purple-700 dark:text-purple-400">
                    Admin Mode: These are global defaults for all users
                  </div>
                </div>
              )}

              {schema.map(field => {
                const value = settings[field.key] !== undefined ? settings[field.key] : field.default;

                if (field.type === 'boolean') {
                  return (
                    <div key={field.key} className="flex items-center justify-between">
                      <label className={`text-sm font-medium ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                        {field.label}
                      </label>
                      <button
                        onClick={() => handleChange(field.key, !value)}
                        className={`relative w-12 h-6 rounded-full transition-colors ${
                          value ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-600'
                        }`}
                      >
                        <div
                          className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                            value ? 'transform translate-x-6' : ''
                          }`}
                        />
                      </button>
                    </div>
                  );
                }

                if (field.type === 'number') {
                  return (
                    <div key={field.key}>
                      <label className={`block text-sm font-medium mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                        {field.label}
                      </label>
                      <input
                        type="number"
                        value={value}
                        onChange={e => handleChange(field.key, parseInt(e.target.value, 10) || 0)}
                        className={`w-full px-3 py-2 rounded border ${
                          isLight
                            ? 'bg-white border-slate-300 text-slate-900'
                            : 'bg-slate-900 border-slate-600 text-white'
                        }`}
                      />
                    </div>
                  );
                }

                if (field.type === 'select') {
                  return (
                    <div key={field.key}>
                      <label className={`block text-sm font-medium mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                        {field.label}
                      </label>
                      <select
                        value={value}
                        onChange={e => handleChange(field.key, e.target.value)}
                        className={`w-full px-3 py-2 rounded border ${
                          isLight
                            ? 'bg-white border-slate-300 text-slate-900'
                            : 'bg-slate-900 border-slate-600 text-white'
                        }`}
                      >
                        {field.options?.map((opt: string) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                }

                return null;
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
