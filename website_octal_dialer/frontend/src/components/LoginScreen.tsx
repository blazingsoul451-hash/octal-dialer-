import React, { useState } from 'react';
import { PhoneCall, Lock, User, Eye, EyeOff, Shield, Building, UserPlus, LogIn } from 'lucide-react';

interface LoginScreenProps {
  serverUrl: string;
  onLogin: (token: string, username: string) => void;
}

export function LoginScreen({ serverUrl, onLogin }: LoginScreenProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [companyName, setCompanyName] = useState('');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'signup') {
      if (!companyName.trim() || companyName.trim().length < 2) {
        setError('Company name must be at least 2 characters.');
        return;
      }
      if (!username.trim() || username.trim().length < 3) {
        setError('Username must be at least 3 characters.');
        return;
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
    }

    setLoading(true);

    try {
      const candidateUrls = Array.from(new Set([
        serverUrl,
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        `http://${window.location.hostname}:3000`
      ]));

      let res: Response | null = null;

      for (const baseUrl of candidateUrls) {
        try {
          const endpoint = mode === 'signup' ? `${baseUrl}/auth/signup` : `${baseUrl}/auth/login`;
          const payload = mode === 'signup' 
            ? { companyName: companyName.trim(), username: username.trim(), password }
            : { username: username.trim(), password };

          res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          if (res) break;
        } catch (e: any) {
          // Try next url
        }
      }

      if (!res) {
        setError('Cannot reach backend server on port 3000. Please ensure server is active.');
        return;
      }

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || (mode === 'signup' ? 'Signup failed.' : 'Login failed. Check your credentials.'));
        return;
      }

      const token = data.token;
      const returnedUser = data.user?.username || data.username || username;

      localStorage.setItem('octal_auth_token', token);
      localStorage.setItem('octal_auth_user', returnedUser);
      onLogin(token, returnedUser);
    } catch {
      setError('Cannot reach server. Make sure the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-slate-950">
      {/* Video Background */}
      <video
        autoPlay
        muted
        loop
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
        style={{ backgroundColor: '#0f172a' }}
        onError={(e) => console.error('Video load error:', e)}
      >
        <source src="/merged-galaxy.webm" type="video/webm" />
        <source src="/merged-galaxy.mp4" type="video/mp4" />
        Your browser does not support the video tag.
      </video>

      {/* Overlay to ensure text readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/40 via-slate-950/60 to-slate-950/40 pointer-events-none" />

      <div className="w-full max-w-sm relative z-10">
        {/* Card */}
        <div className="w-full max-w-xs mx-auto">
          <div className="bg-slate-900/85 backdrop-blur-md border border-slate-700/50 rounded-2xl p-6 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-center gap-2 mb-4">
              <Shield className="w-4 h-4 text-amber-500" />
              <h1 className="text-sm font-bold text-amber-400">OCTAL DIALER SAAS</h1>
            </div>

            {/* Mode Switcher */}
            <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 mb-4">
              <button
                type="button"
                onClick={() => { setMode('login'); setError(null); }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-mono font-bold rounded-md transition-all ${
                  mode === 'login'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <LogIn className="w-3 h-3" />
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { setMode('signup'); setError(null); }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-mono font-bold rounded-md transition-all ${
                  mode === 'signup'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <UserPlus className="w-3 h-3" />
                New Tenant
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              {/* Company Name (Signup only) */}
              {mode === 'signup' && (
                <div>
                  <label className="block text-[10px] font-mono text-slate-400 mb-1 uppercase tracking-wider font-bold">Company / Organization</label>
                  <div className="relative">
                    <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                    <input
                      id="signup-company"
                      type="text"
                      value={companyName}
                      onChange={e => setCompanyName(e.target.value)}
                      placeholder="Acme Global"
                      required
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-xs text-white font-mono placeholder-slate-600 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all"
                    />
                  </div>
                </div>
              )}

              {/* Username */}
              <div>
                <label className="block text-[10px] font-mono text-slate-400 mb-1 uppercase tracking-wider font-bold">
                  {mode === 'signup' ? 'Admin Username' : 'Username'}
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                  <input
                    id="login-username"
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder={mode === 'signup' ? 'admin_john' : 'admin'}
                    autoComplete="username"
                    required
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-xs text-white font-mono placeholder-slate-600 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-[10px] font-mono text-slate-400 mb-1 uppercase tracking-wider font-bold">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    required
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-9 py-2 text-xs text-white font-mono placeholder-slate-600 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Confirm Password (Signup only) */}
              {mode === 'signup' && (
                <div>
                  <label className="block text-[10px] font-mono text-slate-400 mb-1 uppercase tracking-wider font-bold">Confirm Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                    <input
                      id="signup-confirm-password"
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      required
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-xs text-white font-mono placeholder-slate-600 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all"
                    />
                  </div>
                </div>
              )}

              {/* Error message */}
              {error && (
                <div className="bg-red-950/40 border border-red-500/30 rounded-lg px-3 py-2 text-[10px] font-mono text-red-300">
                  ⚠ {error}
                </div>
              )}

              {/* Submit */}
              <button
                id="login-submit"
                type="submit"
                disabled={loading}
                className="w-full bg-amber-500 hover:bg-amber-400 disabled:bg-slate-700 disabled:text-slate-500 text-slate-950 font-black text-xs rounded-lg py-2.5 transition-all duration-200 uppercase tracking-wider mt-1 cursor-pointer disabled:cursor-not-allowed"
              >
                {loading
                  ? (mode === 'signup' ? 'Provisioning Tenant...' : 'Authenticating...')
                  : (mode === 'signup' ? 'Create Tenant & Admin' : 'Sign In')}
              </button>
            </form>

            {/* Footer hint */}
            {mode === 'login' && (
              <p className="text-center text-[9px] font-mono text-slate-600 mt-3">
                Default credentials in backend terminal
              </p>
            )}
          </div>
        </div>

        {/* APK Download */}
        <div className="flex justify-center mt-4">
          <a
            href="/download/apk"
            className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg px-4 py-2 shadow-lg shadow-amber-500/30 transition-all duration-200 uppercase tracking-wider cursor-pointer"
          >
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M17.5 12.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5m-11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5m10.3-4.72l1.9-3.29a.498.498 0 00-.18-.68.498.498 0 00-.68.18l-1.92 3.32C14.73 6.47 13.41 6 12 6s-2.73.47-3.92 1.31L6.16 3.99a.498.498 0 00-.68-.18.498.498 0 00-.18.68l1.9 3.29C4.54 9.17 3 11.9 3 15h18c0-3.1-1.54-5.83-4.2-7.22z"/>
            </svg>
            Download APK
          </a>
        </div>
      </div>
    </div>
  );
}
