import React, { useState, useEffect } from 'react';
import {
  Key, Plus, Trash2, Copy, Check, AlertCircle, CheckCircle2
} from 'lucide-react';

interface ApiKeyItem {
  id: string;
  name: string;
  keyPrefix: string;
  status: 'active' | 'revoked';
  createdAt: string;
  lastUsedAt?: string | null;
  expiresAt?: string | null;
}

interface AdminAPIKeysProps {
  isLight?: boolean;
  serverUrl: string;
  authToken: string;
}

export const AdminAPIKeys: React.FC<AdminAPIKeysProps> = ({
  isLight,
  serverUrl,
  authToken
}) => {
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Generate Key Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [creatingKey, setCreatingKey] = useState(false);

  // One-time Secret Modal State
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Revoke Key Confirmation State
  const [keyToRevoke, setKeyToRevoke] = useState<ApiKeyItem | null>(null);
  const [revoking, setRevoking] = useState(false);

  const fetchKeys = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/admin/api-keys`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setKeys(Array.isArray(data) ? data : (data.keys || []));
      } else {
        const errData = await res.json();
        setError(errData.error || 'Failed to fetch API keys');
      }
    } catch (err: any) {
      setError(err.message || 'Connection error while fetching API keys');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, [serverUrl, authToken]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowCreateModal(false);
        setCreatedSecret(null);
        setKeyToRevoke(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleGenerateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    setCreatingKey(true);
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/admin/api-keys`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ name: newKeyName.trim() })
      });
      const data = await res.json();
      if (res.ok) {
        setShowCreateModal(false);
        setNewKeyName('');
        // Store raw one-time secret in state for display modal
        setCreatedSecret(data.secret || data.apiKey || data.key);
        fetchKeys();
      } else {
        setError(data.error || 'Failed to generate API key');
      }
    } catch (err: any) {
      setError(err.message || 'Connection error while generating API key');
    } finally {
      setCreatingKey(false);
    }
  };

  const handleRevokeKey = async () => {
    if (!keyToRevoke) return;
    setRevoking(true);
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/admin/api-keys/${keyToRevoke.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(`API Key "${keyToRevoke.name}" revoked successfully.`);
        setKeyToRevoke(null);
        fetchKeys();
        setTimeout(() => setSuccess(null), 4000);
      } else {
        setError(data.error || 'Failed to revoke API key');
      }
    } catch (err: any) {
      setError(err.message || 'Connection error while revoking API key');
    } finally {
      setRevoking(false);
    }
  };

  const copyToClipboard = () => {
    if (!createdSecret) return;
    navigator.clipboard.writeText(createdSecret);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <div className="space-y-6 text-left">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className={`text-xl font-black font-display tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
            API Access Keys
          </h2>
          <p className={`text-xs mt-1 font-medium ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
            Create and manage programmatic API credentials for external CRM webhooks and telephony integrations.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-md self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Generate New API Key</span>
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

      {/* Keys Table */}
      {loading && keys.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-xs font-mono text-slate-500">
          Loading integration keys...
        </div>
      ) : keys.length === 0 ? (
        <div className="h-40 border border-dashed rounded-2xl flex flex-col items-center justify-center text-center p-6 text-slate-500 text-xs font-mono border-[#18181b]">
          No API access keys generated yet. Click "Generate New API Key" above.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#18181b]">
          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead>
              <tr className={`border-b text-[9px] uppercase tracking-wider ${
                isLight ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-[#18181b] text-slate-400 border-[#18181b]'
              }`}>
                <th className="p-3">Key Name</th>
                <th className="p-3">Key Token Prefix</th>
                <th className="p-3">Status</th>
                <th className="p-3">Created</th>
                <th className="p-3">Last Used</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isLight ? 'divide-slate-200 text-slate-800' : 'divide-[#18181b] text-slate-300'}`}>
              {keys.map((k) => {
                const createdDate = k.createdAt ? new Date(k.createdAt).toLocaleDateString() : '—';
                const lastUsed = k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : 'Never';
                const isRevoked = k.status === 'revoked';

                return (
                  <tr key={k.id} className={isLight ? 'hover:bg-slate-50' : 'hover:bg-[#121215]'}>
                    <td className={`p-3 font-bold font-body text-sm ${isLight ? 'text-slate-900' : 'text-white'}`}>
                      {k.name}
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded text-[11px] font-mono font-bold ${
                        isLight ? 'bg-amber-50 border border-amber-200 text-amber-700' : 'bg-[#18181b] border border-[#18181b] text-amber-400'
                      }`}>
                        {k.keyPrefix || 'oct_live_••••'}••••••••
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded border text-[9px] font-bold uppercase ${
                        isRevoked
                          ? isLight ? 'bg-red-50 text-red-700 border-red-200' : 'bg-red-950/40 text-red-400 border-red-800'
                          : isLight ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-emerald-950/40 text-emerald-400 border-emerald-800'
                      }`}>
                        {k.status || 'active'}
                      </span>
                    </td>
                    <td className="p-3 text-[10px] text-slate-500">{createdDate}</td>
                    <td className="p-3 text-[10px] text-slate-500">{lastUsed}</td>
                    <td className="p-3 text-right">
                      {!isRevoked && (
                        <button
                          onClick={() => setKeyToRevoke(k)}
                          className={`p-1.5 rounded-lg border transition cursor-pointer ${
                            isLight ? 'border-slate-200 text-slate-400 hover:text-red-600 hover:bg-red-50' : 'border-[#18181b] text-slate-400 hover:text-red-400 hover:bg-red-950/20'
                          }`}
                          title="Revoke Key"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modal: Create Key ── */}
      {showCreateModal && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setShowCreateModal(false); }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs"
        >
          <div className={`w-full max-w-md border rounded-2xl p-6 shadow-2xl space-y-4 ${
            isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#121215] border-[#18181b] text-white'
          }`}>
            <div className={`flex items-center justify-between border-b pb-3 ${isLight ? 'border-slate-200' : 'border-[#18181b]'}`}>
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-amber-500" />
                <h3 className="text-base font-bold font-display">Generate API Key</h3>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white text-lg cursor-pointer">×</button>
            </div>

            <form onSubmit={handleGenerateKey} className="space-y-4 font-mono text-xs">
              <div>
                <label className={`block text-[10px] uppercase font-bold mb-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Key Description / Client Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Zapier Webhook CRM"
                  value={newKeyName}
                  onChange={e => setNewKeyName(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border outline-none ${
                    isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-[#18181b] border-[#18181b] text-white focus:border-amber-500'
                  }`}
                />
              </div>

              <div className="p-3 rounded-xl border border-amber-500/20 bg-amber-500/5 text-[10px] text-amber-600 dark:text-amber-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
                <span>The raw API secret key will only be shown once after creation. Be prepared to copy and store it securely.</span>
              </div>

              <div className={`flex items-center justify-end gap-2 pt-2 border-t ${isLight ? 'border-slate-200' : 'border-[#18181b]'}`}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-[#18181b] text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingKey}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl transition cursor-pointer"
                >
                  {creatingKey ? 'Generating...' : 'Generate Key'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: One-Time Secret Display ── */}
      {createdSecret && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setCreatedSecret(null); }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs"
        >
          <div className={`w-full max-w-lg border rounded-2xl p-6 shadow-2xl space-y-4 border-amber-500/40 ${
            isLight ? 'bg-white text-slate-900' : 'bg-[#121215] text-white'
          }`}>
            <div className={`flex items-center gap-2 text-amber-500 border-b pb-3 ${isLight ? 'border-slate-200' : 'border-[#18181b]'}`}>
              <Key className="w-5 h-5" />
              <h3 className="text-base font-bold font-display">Your New API Key Secret</h3>
            </div>

            <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-xs">
              <p className="font-bold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" />
                Important: Copy this key now!
              </p>
              <p className="mt-1 text-[11px]">
                This secret will <span className="font-bold underline">NEVER</span> be displayed again. If you lose this key, you will have to revoke it and generate a new one.
              </p>
            </div>

            <div className="space-y-1">
              <label className={`block text-[10px] uppercase font-bold ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>API Secret Key</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={createdSecret}
                  className={`flex-1 px-3 py-2.5 rounded-xl border font-mono text-xs outline-none select-all ${
                    isLight ? 'bg-slate-50 border-slate-300 text-amber-700 font-bold' : 'border-[#18181b] bg-[#18181b] text-amber-400'
                  }`}
                />
                <button
                  onClick={copyToClipboard}
                  className="px-3.5 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copied ? 'Copied!' : 'Copy'}</span>
                </button>
              </div>
            </div>

            <div className={`flex justify-end pt-3 border-t ${isLight ? 'border-slate-200' : 'border-[#18181b]'}`}>
              <button
                onClick={() => setCreatedSecret(null)}
                className={`px-5 py-2 font-mono text-xs rounded-xl transition cursor-pointer border ${
                  isLight ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800' : 'bg-[#18181b] hover:bg-[#27272a] border-[#18181b] text-white'
                }`}
              >
                I have saved this secret
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Revoke Key Confirmation ── */}
      {keyToRevoke && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setKeyToRevoke(null); }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs"
        >
          <div className={`w-full max-w-sm border rounded-2xl p-6 shadow-2xl space-y-4 ${
            isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#121215] border-[#18181b] text-white'
          }`}>
            <div className="flex items-center gap-2 text-red-500">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <h3 className="text-base font-bold font-display">Revoke API Key</h3>
            </div>
            <p className="text-xs text-slate-400 font-sans">
              Are you sure you want to revoke key <span className="font-bold text-white font-mono">"{keyToRevoke.name}"</span>? Any automated scripts or webhook integrations using this key will immediately fail with 401 Unauthorized.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#18181b] font-mono text-xs">
              <button
                type="button"
                onClick={() => setKeyToRevoke(null)}
                className="px-4 py-2 rounded-xl border border-[#18181b] text-slate-400 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleRevokeKey}
                disabled={revoking}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition cursor-pointer"
              >
                {revoking ? 'Revoking...' : 'Revoke Key'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
