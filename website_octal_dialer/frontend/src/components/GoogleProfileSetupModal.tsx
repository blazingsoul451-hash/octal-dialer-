import React, { useState, useEffect } from 'react';
import { User, Lock, Eye, EyeOff, Shield, ArrowRight, Check, X, Sparkles } from 'lucide-react';

interface GoogleProfileSetupModalProps {
  serverUrl: string;
  authToken: string;
  currentUsername: string;
  userEmail?: string;
  onComplete: (newToken: string, newUsername: string) => void;
}

export function GoogleProfileSetupModal({
  serverUrl,
  authToken,
  currentUsername,
  userEmail,
  onComplete
}: GoogleProfileSetupModalProps) {
  const suggestedUsername = currentUsername.includes('_')
    ? currentUsername.split('_')[0]
    : currentUsername;

  const [username, setUsername] = useState(suggestedUsername);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) {
        handleSkip();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [loading, authToken, currentUsername]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanUsername = username.trim().toLowerCase();
    if (!cleanUsername || cleanUsername.length < 3) {
      setError('Username must be at least 3 characters long.');
      return;
    }
    if (!/^[a-z0-9_.-]+$/.test(cleanUsername)) {
      setError('Username can only contain lowercase letters, numbers, underscores, dots, and hyphens.');
      return;
    }

    if (password) {
      if (password.length < 6) {
        setError('Password must be at least 6 characters long.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
    }

    setLoading(true);

    try {
      const res = await fetch(`${serverUrl}/auth/complete-google-profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          username: cleanUsername,
          password: password ? password : undefined,
          skip: false
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update profile.');
      }

      if (data.token && data.user) {
        localStorage.setItem('octal_auth_token', data.token);
        localStorage.setItem('octal_auth_user', data.user.username);
        onComplete(data.token, data.user.username);
      }
    } catch (err: any) {
      setError(err.message || 'Error completing profile setup.');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/auth/complete-google-profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ skip: true })
      });

      const data = await res.json();
      if (data.token && data.user) {
        localStorage.setItem('octal_auth_token', data.token);
        localStorage.setItem('octal_auth_user', data.user.username);
        onComplete(data.token, data.user.username);
      } else {
        onComplete(authToken, currentUsername);
      }
    } catch (err: any) {
      setError(err.message || 'Error skipping profile setup.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl p-7 max-w-md w-full shadow-2xl shadow-black/90 relative">

        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 mb-3 shadow-inner">
            <Sparkles className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-black text-white tracking-tight">
            Complete Your Profile
          </h2>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            Personalize your username and optionally create a password to enable email & password sign-in.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} className="space-y-4">

          {/* Username Field */}
          <div>
            <label className="block text-[10px] font-mono text-slate-400 mb-1 uppercase tracking-wider font-bold">
              Choose Username
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                id="setup-profile-username"
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="johndoe"
                required
                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white font-mono placeholder-slate-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 transition-all"
              />
            </div>
            <p className="text-[10px] text-slate-500 mt-1 font-mono">
              Letters, numbers, underscores, dots, or hyphens (min 3 chars).
            </p>
          </div>

          {/* Optional Password Field */}
          <div>
            <label className="block text-[10px] font-mono text-slate-400 mb-1 uppercase tracking-wider font-bold">
              Set Password <span className="text-slate-500 lowercase font-normal">(optional)</span>
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                id="setup-profile-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Create a password"
                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-9 pr-10 py-2.5 text-xs text-white font-mono placeholder-slate-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Confirm Password (if password is entered) */}
          {password && (
            <div>
              <label className="block text-[10px] font-mono text-slate-400 mb-1 uppercase tracking-wider font-bold">
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  id="setup-profile-confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Repeat your password"
                  required
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white font-mono placeholder-slate-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 transition-all"
                />
              </div>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="bg-red-950/50 border border-red-500/40 rounded-xl p-2.5 text-xs font-mono text-red-300">
              {error}
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-2 space-y-2">
            <button
              id="save-profile-btn"
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 text-slate-950 font-black text-xs rounded-xl py-3 transition-all duration-200 uppercase tracking-wider cursor-pointer disabled:cursor-not-allowed shadow-lg shadow-amber-500/10 flex items-center justify-center gap-2"
            >
              {loading ? 'Saving...' : 'Save & Continue'}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>

            <button
              id="skip-profile-btn"
              type="button"
              onClick={handleSkip}
              disabled={loading}
              className="w-full text-center text-xs font-mono text-slate-400 hover:text-white py-1.5 transition-colors cursor-pointer"
            >
              Skip for now
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
