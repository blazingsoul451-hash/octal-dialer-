import React, { useState } from 'react';
import { PhoneCall, Lock, User, Eye, EyeOff, Shield } from 'lucide-react';

interface LoginScreenProps {
  serverUrl: string;
  onLogin: (token: string, username: string) => void;
}

export function LoginScreen({ serverUrl, onLogin }: LoginScreenProps) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('octal93HMJL');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const candidateUrls = Array.from(new Set([
        serverUrl,
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        `http://${window.location.hostname}:3000`
      ]));

      let res: Response | null = null;
      let lastErrMessage = '';

      for (const baseUrl of candidateUrls) {
        try {
          res = await fetch(`${baseUrl}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username.trim(), password })
          });
          if (res) break;
        } catch (e: any) {
          lastErrMessage = e?.message || '';
        }
      }

      if (!res) {
        setError('Cannot reach backend server on port 3000. Please ensure server is active.');
        return;
      }

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Login failed. Check your credentials.');
        return;
      }

      localStorage.setItem('octal_auth_token', data.token);
      localStorage.setItem('octal_auth_user', data.username);
      onLogin(data.token, data.username);
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

      {/* Floating particles */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes twinkle {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.5); }
        }
        @keyframes float {
          0% { transform: translateY(0) translateX(0); opacity: 0; }
          10% { opacity: 0.5; }
          90% { opacity: 0.5; }
          100% { transform: translateY(-100vh) translateX(20px); opacity: 0; }
        }
        @keyframes pulse-slow {
          0%, 100% { opacity: 0.05; transform: scale(1); }
          50% { opacity: 0.15; transform: scale(1.1); }
        }
        .animate-pulse-slow {
          animation: pulse-slow 8s ease-in-out infinite;
        }
        @keyframes rotate-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-rotate-slow {
          animation: rotate-slow 20s linear infinite;
        }
      `}} />

      <div className="w-full max-w-sm relative z-10">
        {/* Login card - Compact Clean */}
        <div className="w-full max-w-xs">
          <div className="bg-slate-900/85 backdrop-blur-md border border-slate-700/50 rounded-2xl p-6 shadow-2xl">
            {/* Compact header */}
            <div className="flex items-center justify-center gap-2 mb-5">
              <Shield className="w-4 h-4 text-amber-500" />
              <h1 className="text-sm font-bold text-amber-400">OCTAL DIALER</h1>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5">
              {/* Username */}
              <div>
                <label className="block text-[10px] font-mono text-slate-400 mb-1 uppercase tracking-wider font-bold">Username</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                  <input
                    id="login-username"
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="admin"
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
                    autoComplete="current-password"
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
                {loading ? 'Authenticating...' : 'Sign In'}
              </button>
            </form>

            {/* Footer hint */}
            <p className="text-center text-[9px] font-mono text-slate-600 mt-4">
              Default credentials in backend terminal
            </p>
          </div>
        </div>

        {/* APK Download - Centered with Amber Theme */}
        <div className="flex justify-center mt-6">
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
