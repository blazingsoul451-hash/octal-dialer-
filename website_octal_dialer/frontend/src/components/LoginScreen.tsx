import React, { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react';
import { type AuthIdentity, tryNormalizeStructuralRole } from '../utils/roleUtils';

interface LoginScreenProps {
  serverUrl: string;
  onLogin: (token: string, identity: AuthIdentity) => void;
}

interface AuthConfig {
  googleClientId: string | null;
  captchaSiteKey: string | null;
  captchaEnabled: boolean;
}

interface GooglePromptError {
  code: 'ACCOUNT_NOT_FOUND' | 'ACCOUNT_EXISTS' | 'GOOGLE_ACCOUNT_NOT_FOUND' | 'GOOGLE_ACCOUNT_ALREADY_EXISTS';
  email?: string;
  message?: string;
}

export function LoginScreen({ serverUrl, onLogin }: LoginScreenProps) {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');

  // Sign In fields
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Sign Up fields
  const [businessName, setBusinessName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Common form state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Google Explicit Intent Error Modal
  const [googlePromptError, setGooglePromptError] = useState<GooglePromptError | null>(null);

  // Auth config (Google OAuth & CAPTCHA)
  const [authConfig, setAuthConfig] = useState<AuthConfig>({
    googleClientId: '276074980527-6d3r4q4e013ts65tpfq7d8971k6p99ct.apps.googleusercontent.com',
    captchaSiteKey: null,
    captchaEnabled: false
  });
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileWidgetId = useRef<string | null>(null);
  const turnstileContainerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const applySlowPlayback = () => {
    if (videoRef.current) {
      videoRef.current.playbackRate = 0.5; // Smooth cinematic slow motion
    }
  };

  useEffect(() => {
    applySlowPlayback();
  }, [mode]);

  // Check URL parameters for OAuth callbacks and errors
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const authError = params.get('auth_error');
      const authEmail = params.get('email');
      const authMessage = params.get('message');

      if (authError === 'ACCOUNT_NOT_FOUND' || authError === 'GOOGLE_ACCOUNT_NOT_FOUND') {
        setGooglePromptError({
          code: 'ACCOUNT_NOT_FOUND',
          email: authEmail || undefined,
          message: authMessage ? decodeURIComponent(authMessage) : undefined
        });
        window.history.replaceState({}, document.title, window.location.pathname);
      } else if (authError === 'ACCOUNT_EXISTS' || authError === 'GOOGLE_ACCOUNT_ALREADY_EXISTS') {
        setGooglePromptError({
          code: 'ACCOUNT_EXISTS',
          email: authEmail || undefined,
          message: authMessage ? decodeURIComponent(authMessage) : undefined
        });
        window.history.replaceState({}, document.title, window.location.pathname);
      } else if (authError) {
        setError(authMessage ? decodeURIComponent(authMessage) : decodeURIComponent(authError));
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } catch (_) {}
  }, []);

  // Fetch auth config on mount & load Google GSI immediately
  useEffect(() => {
    loadGoogleGsi('276074980527-6d3r4q4e013ts65tpfq7d8971k6p99ct.apps.googleusercontent.com');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    fetch(`${serverUrl}/auth/config`, { signal: controller.signal })
      .then(res => res.json())
      .then((data: AuthConfig) => {
        clearTimeout(timeoutId);
        setAuthConfig(data);
        if (data.googleClientId) {
          loadGoogleGsi(data.googleClientId);
        }
        if (data.captchaSiteKey) {
          loadTurnstile(data.captchaSiteKey);
        }
      })
      .catch(() => {
        clearTimeout(timeoutId);
      });
  }, [serverUrl]);

  // Load Google Identity Services (GSI) script dynamically
  const loadGoogleGsi = (clientId: string) => {
    if (document.getElementById('google-gsi-script')) return;
    const script = document.createElement('script');
    script.id = 'google-gsi-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if ((window as any).google?.accounts?.id) {
        (window as any).google.accounts.id.initialize({
          client_id: clientId,
          callback: handleGoogleCredentialResponse,
          auto_select: false,
          cancel_on_tap_outside: true,
        });
      }
    };
    document.head.appendChild(script);
  };

  // Load Cloudflare Turnstile script
  const loadTurnstile = (siteKey: string) => {
    if (document.getElementById('turnstile-script')) return;
    const script = document.createElement('script');
    script.id = 'turnstile-script';
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      renderTurnstile(siteKey);
    };
    document.head.appendChild(script);
  };

  // Render Turnstile widget
  const renderTurnstile = (siteKey: string) => {
    if ((window as any).turnstile && turnstileContainerRef.current) {
      try {
        if (turnstileWidgetId.current !== null) {
          (window as any).turnstile.remove(turnstileWidgetId.current);
        }
        turnstileWidgetId.current = (window as any).turnstile.render(turnstileContainerRef.current, {
          sitekey: siteKey,
          theme: 'dark',
          callback: (token: string) => {
            setCaptchaToken(token);
          },
          'expired-callback': () => {
            setCaptchaToken(null);
          },
          'error-callback': () => {
            setCaptchaToken(null);
          }
        });
      } catch (e) {
        console.warn('Turnstile render warning:', e);
      }
    }
  };

  // Google OAuth credential callback from One Tap / Pop-up
  const handleGoogleCredentialResponse = async (response: { credential?: string }) => {
    if (!response.credential) return;
    const intent = mode === 'register' ? 'signup' : 'signin';
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/auth/google/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential, intent, captchaToken })
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === 'ACCOUNT_NOT_FOUND' || data.code === 'GOOGLE_ACCOUNT_NOT_FOUND') {
          setGooglePromptError({ code: 'ACCOUNT_NOT_FOUND', email: data.email, message: data.error });
          return;
        }
        if (data.code === 'ACCOUNT_EXISTS' || data.code === 'GOOGLE_ACCOUNT_ALREADY_EXISTS') {
          setGooglePromptError({ code: 'ACCOUNT_EXISTS', email: data.email, message: data.error });
          return;
        }
        throw new Error(data.error || 'Google authentication failed.');
      }

      const rawRole = data.user?.role || data.role;
      const normalizedRole = tryNormalizeStructuralRole(rawRole);
      if (!normalizedRole) {
        throw new Error('Authentication initialization failed: Account role is unrecognized or missing.');
      }
      const identity: AuthIdentity = {
        username: data.user?.username || data.username,
        role: normalizedRole,
        displayName: data.user?.displayName,
        tenantId: data.user?.tenantId || data.tenantId,
        userId: data.user?.id || data.id,
        email: data.user?.email || data.email,
        needsOnboarding: data.needsOnboarding,
        pendingInvitation: data.pendingInvitation
      };

      localStorage.setItem('octal_auth_token', data.token);
      localStorage.setItem('octal_auth_user', identity.username);
      onLogin(data.token, identity);
    } catch (err: any) {
      setError(err.message || 'Google authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  // Trigger Google Login with Authoritative Intent (signin vs signup)
  const handleGoogleLoginClick = async (targetIntent?: 'signin' | 'signup') => {
    const intent: 'signin' | 'signup' = targetIntent || (mode === 'register' ? 'signup' : 'signin');
    const effectiveClientId = authConfig.googleClientId || '276074980527-6d3r4q4e013ts65tpfq7d8971k6p99ct.apps.googleusercontent.com';

    if (!effectiveClientId) {
      setError('Google authentication is currently unavailable.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const isLocal = typeof window !== 'undefined' &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

      const candidateUrls = isLocal
        ? Array.from(new Set(['', serverUrl, 'http://127.0.0.1:5000', `http://${window.location.hostname}:5000`].filter(Boolean)))
        : Array.from(new Set(['', serverUrl, 'http://140.245.215.156', `http://${window.location.hostname}`].filter(Boolean)));

      let res: Response | null = null;
      for (const baseUrl of candidateUrls) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2500);
          res = await fetch(`${baseUrl}/auth/google/initiate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ intent, captchaToken }),
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          if (res && res.ok) break;
        } catch {}
      }

      if (res && res.ok) {
        const data = await res.json();
        if (data.authUrl) {
          window.location.href = data.authUrl;
          return;
        }
      }

      window.location.href = `${serverUrl}/auth/google?intent=${intent}`;
    } catch (err: any) {
      setError(err.message || 'Failed to initiate Google authentication.');
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (mode === 'register') {
      if (!businessName.trim()) {
        setError('Please enter your Business Name.');
        return;
      }
      if (!firstName.trim()) {
        setError('Please enter your First Name.');
        return;
      }
      if (!lastName.trim()) {
        setError('Please enter your Last Name.');
        return;
      }
      if (!email.trim()) {
        setError('Please enter your Email Address.');
        return;
      }
      if (!password || password.length < 6) {
        setError('Password must be at least 6 characters.');
        return;
      }
      if (!mobile.trim()) {
        setError('Please enter your Mobile number.');
        return;
      }

      // Persist business name & mobile for seamless onboarding wizard prefill
      localStorage.setItem('pending_business_name', businessName.trim());
      localStorage.setItem('pending_mobile', mobile.trim());
    } else if (mode === 'forgot') {
      if (!username.trim() && !email.trim()) {
        setError('Please provide your email address or username.');
        return;
      }
    } else {
      if (!username.trim()) {
        setError('Please enter your User Name / Email.');
        return;
      }
      if (!password) {
        setError('Please enter your password.');
        return;
      }
    }

    setLoading(true);

    try {
      const isLocal = typeof window !== 'undefined' &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

      const candidateUrls = isLocal
        ? Array.from(new Set(['', serverUrl, 'http://127.0.0.1:5000', `http://${window.location.hostname}:5000`].filter(Boolean)))
        : Array.from(new Set(['', serverUrl, `http://${window.location.hostname}:5000`, 'http://140.245.215.156:5000'].filter(Boolean)));

      let res: Response | null = null;

      for (const baseUrl of candidateUrls) {
        try {
          let endpoint = `${baseUrl}/auth/login`;
          let payload: any = { username: username.trim(), password, captchaToken };

          if (mode === 'register') {
            const finalFullName = `${firstName.trim()} ${lastName.trim()}`.trim();
            endpoint = `${baseUrl}/auth/register`;
            payload = {
              name: finalFullName,
              fullName: finalFullName,
              email: email.trim(),
              password,
              businessName: businessName.trim(),
              mobile: mobile.trim(),
              captchaToken
            };
          } else if (mode === 'forgot') {
            endpoint = `${baseUrl}/auth/forgot-password`;
            payload = { identifier: (email || username).trim(), captchaToken };
          }

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2500);

          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          res = response;
          if (res) break;
        } catch {}
      }

      if (!res) {
        setError('Cannot reach backend server. Please ensure backend is running.');
        return;
      }

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Operation failed.');
        return;
      }

      if (mode === 'forgot') {
        setSuccessMsg(data.message || 'Password reset link issued. Check your email.');
        return;
      }

      // Successful Login / Register -> Authenticate user
      const token = data.token;
      const returnedUser = data.user?.username || data.username || username || (email ? email.split('@')[0] : 'user');
      const rawRole = data.user?.role || data.role || 'user';
      const normalizedRole = tryNormalizeStructuralRole(rawRole) || 'user';
      const identity: AuthIdentity = {
        username: returnedUser,
        role: normalizedRole,
        displayName: data.user?.displayName || (firstName && lastName ? `${firstName} ${lastName}` : returnedUser),
        tenantId: data.user?.tenantId || data.tenantId,
        userId: data.user?.id || data.id,
        email: data.user?.email || data.email || email,
        needsOnboarding: data.needsOnboarding,
        pendingInvitation: data.pendingInvitation
      };

      localStorage.setItem('octal_auth_token', token);
      localStorage.setItem('octal_auth_user', returnedUser);
      onLogin(token, identity);
    } catch (err: any) {
      setError(err.message || 'Cannot reach server. Make sure the backend is active.');
    } finally {
      setLoading(false);
    }
  };

  const currentVideoSrc = mode === 'register' 
    ? '/signup-bg.mp4' 
    : mode === 'forgot' 
    ? '/forgot-bg.mp4' 
    : '/login-bg.mp4';

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 relative overflow-hidden bg-[#05070f] select-none font-sans">
      {/* ── Background Video (Dynamic by Screen Mode: Login, Sign Up, Forgot Password) ── */}
      <video
        key={currentVideoSrc}
        ref={videoRef}
        autoPlay
        muted
        loop
        playsInline
        onLoadedMetadata={applySlowPlayback}
        onPlay={applySlowPlayback}
        onCanPlay={applySlowPlayback}
        className="absolute inset-0 w-full h-full object-cover z-0 pointer-events-none transition-opacity duration-500"
        style={{ backgroundColor: '#05070f' }}
      >
        <source src={currentVideoSrc} type="video/mp4" />
      </video>

      {/* Subtle darkening vignette for vivid starfield contrast */}
      <div className="absolute inset-0 bg-black/25 pointer-events-none z-0" />

      {/* ── Google Explicit Intent Error Modal ── */}
      {googlePromptError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-amber-500/50 rounded-2xl p-6 shadow-2xl max-w-md w-full text-center space-y-4">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-500/20 text-amber-400 mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {(googlePromptError.code === 'ACCOUNT_NOT_FOUND' || googlePromptError.code === 'GOOGLE_ACCOUNT_NOT_FOUND')
                  ? 'No Account Found'
                  : 'Account Already Exists'}
              </h3>
              <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                {googlePromptError.message || ((googlePromptError.code === 'ACCOUNT_NOT_FOUND' || googlePromptError.code === 'GOOGLE_ACCOUNT_NOT_FOUND')
                  ? `No account was found for ${googlePromptError.email || 'this Google account'}. Please sign up first.`
                  : `An account already exists with ${googlePromptError.email || 'this Google account'}. Please sign in instead.`)}
              </p>
            </div>
            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                id="google-signup-prompt-btn"
                onClick={() => {
                  const isNotFound = googlePromptError.code === 'ACCOUNT_NOT_FOUND' || googlePromptError.code === 'GOOGLE_ACCOUNT_NOT_FOUND';
                  setGooglePromptError(null);
                  setMode(isNotFound ? 'register' : 'login');
                  handleGoogleLoginClick(isNotFound ? 'signup' : 'signin');
                }}
                className="w-full bg-[#00b050] hover:bg-[#009b45] text-white font-bold text-xs py-2.5 rounded-xl transition-all shadow-md cursor-pointer"
              >
                {(googlePromptError.code === 'ACCOUNT_NOT_FOUND' || googlePromptError.code === 'GOOGLE_ACCOUNT_NOT_FOUND')
                  ? 'Proceed to Sign Up with Google'
                  : 'Proceed to Sign In with Google'}
              </button>
              <button
                type="button"
                onClick={() => setGooglePromptError(null)}
                className="text-xs text-slate-400 hover:text-white cursor-pointer py-1"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SCREEN 1: LOGIN MODE (Octal Dialer Style) ── */}
      {/* ── SCREEN 1: LOGIN MODE (Exact 1:1 Match to o1.octalaccounts.com) ── */}
      {mode === 'login' && !googlePromptError && (
        <div className="w-full max-w-[960px] mx-auto flex flex-col md:flex-row items-center justify-center relative z-10 px-4 transition-all duration-300">
          
          {/* Left Panel: Dark Translucent Card (rounded-[25px], bg-black/60, box-shadow white glow, -mr-14 overlap) */}
          <div className="w-full md:w-[540px] bg-black/60 backdrop-blur-md rounded-[25px] p-8 md:p-12 md:pr-20 shadow-[0_0_25px_rgba(255,255,255,0.2)] md:-mr-14 z-0 text-white flex flex-col justify-center min-h-[428px]">
            <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2 font-display">
              Octal <span className="bg-gradient-to-r from-amber-400 to-amber-500 bg-clip-text text-transparent">Dialer</span>
            </h1>
            <h2 className="text-lg sm:text-xl font-bold text-white mb-4">
              The Complete Outbound Telephony & CRM Platform:
            </h2>
            <p className="text-gray-200 text-sm leading-relaxed max-w-[380px]">
              Streamlined features to supercharge your sales operations. Seamlessly connect, call, and convert leads with precision, live analytics, and automated workflows.
            </p>
          </div>

          {/* Right Panel: White Card (rounded-[25px], width 445px, padding 30px) */}
          <div className="w-full max-w-[445px] bg-white rounded-[25px] shadow-2xl p-[30px] z-10 flex flex-col justify-center min-h-[428px]">
            <form onSubmit={handleSubmit} className="w-full">
              {/* User Name */}
              <div className="mb-4">
                <label className="block text-sm font-normal text-gray-800 mb-1.5">
                  User Name
                </label>
                <input
                  id="login-username"
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Email"
                  autoComplete="username"
                  required
                  className="w-full px-3 h-[38px] rounded-[4px] border border-gray-300 text-gray-800 text-sm placeholder-gray-400 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-400/30 transition-all shadow-sm"
                />
              </div>

              {/* Password */}
              <div className="mb-4">
                <label className="block text-sm font-normal text-gray-800 mb-1.5">
                  Password
                </label>
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Password"
                  autoComplete="current-password"
                  required
                  className="w-full px-3 h-[38px] rounded-[4px] border border-gray-300 text-gray-800 text-sm placeholder-gray-400 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-400/30 transition-all shadow-sm"
                />
              </div>

              {/* Error Alert */}
              {error && (
                <div className="mb-3 p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                  <span>{error}</span>
                </div>
              )}

              {/* Centered Login Pill Button (w-[163px], h-[44px], rounded-full) */}
              <div className="flex justify-center mb-4">
                <button
                  id="login-submit"
                  type="submit"
                  disabled={loading}
                  className="w-[163px] h-[44px] rounded-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 active:from-amber-600 text-slate-950 font-bold text-base shadow-sm transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center"
                >
                  {loading ? 'Logging in...' : 'Login'}
                </button>
              </div>

              {/* Horizontal Divider */}
              <div className="relative flex items-center justify-center my-4">
                <div className="border-t border-gray-200 w-full" />
                <span className="bg-white px-3 text-xs text-gray-400 font-normal absolute">or</span>
              </div>

              {/* Login with Google Button */}
              <button
                id="google-signin-btn"
                type="button"
                onClick={() => handleGoogleLoginClick('signin')}
                disabled={loading}
                className="w-full h-[38px] px-4 rounded-[4px] border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium flex items-center justify-center gap-2.5 shadow-sm transition-all mb-4 cursor-pointer disabled:opacity-50"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>Login with Google</span>
              </button>

              {/* Bottom Switch Links */}
              <div className="flex items-center justify-center gap-3 text-sm font-medium">
                <button
                  id="tab-signup-btn"
                  type="button"
                  onClick={() => { setMode('register'); setError(null); setSuccessMsg(null); }}
                  className="text-amber-600 hover:text-amber-700 font-semibold hover:underline cursor-pointer"
                >
                  Sign Up Now
                </button>
                <span className="text-gray-300">|</span>
                <button
                  id="forgot-password-link"
                  type="button"
                  onClick={() => { setMode('forgot'); setError(null); setSuccessMsg(null); }}
                  className="text-amber-600 hover:text-amber-700 font-semibold hover:underline cursor-pointer"
                >
                  Forgot password?
                </button>
              </div>

              {/* Quick Fill Testing shortcuts */}
              <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-center gap-2 text-[11px] text-gray-400">
                <span>Quick Fill:</span>
                <button
                  type="button"
                  id="quick-fill-admin-btn"
                  onClick={() => { setUsername('admin'); setPassword('AdminPassword1234!'); setError(null); }}
                  className="hover:text-amber-600 underline cursor-pointer"
                >
                  Admin
                </button>
                <span>•</span>
                <button
                  type="button"
                  id="quick-fill-owner-btn"
                  onClick={() => { setUsername('owner'); setPassword('OwnerPassword1234!'); setError(null); }}
                  className="hover:text-amber-600 underline cursor-pointer"
                >
                  Owner
                </button>
              </div>

              {/* Hidden accessibility hooks for scripts */}
              <div className="hidden">
                <button id="tab-signin-btn" onClick={() => setMode('login')} />
                <button id="switch-to-signin-link" onClick={() => setMode('login')} />
                <button id="switch-to-signup-link" onClick={() => setMode('register')} />
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── SCREEN 2: SIGN UP MODE (Exact 1:1 Match to o1.octalaccounts.com) ── */}
      {mode === 'register' && !googlePromptError && (
        <div className="w-full max-w-[1280px] mx-auto flex flex-col md:flex-row items-center justify-center relative z-10 px-4 transition-all duration-300">
          
          {/* Left Panel: White Card with Sign Up Form (rounded-[25px], width 650px, padding 30px) */}
          <div className="w-full md:w-[650px] bg-white rounded-[25px] shadow-2xl p-[30px] z-10 flex flex-col justify-center min-h-[378px]">
            <form onSubmit={handleSubmit} className="w-full">
              
              {/* Business Name * */}
              <div className="mb-3">
                <label className="block text-sm font-normal text-gray-700 mb-1">
                  Business Name <span className="text-red-500 font-bold">*</span>
                </label>
                <input
                  id="register-business-name"
                  type="text"
                  value={businessName}
                  onChange={e => setBusinessName(e.target.value)}
                  placeholder="Business Name"
                  required
                  className="w-full px-3 h-[38px] rounded-[4px] border border-gray-300 text-gray-800 text-sm placeholder-gray-400 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-400/30 transition-all shadow-sm"
                />
              </div>

              {/* Row 2: First Name * & Last Name * */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-sm font-normal text-gray-700 mb-1">
                    First Name <span className="text-red-500 font-bold">*</span>
                  </label>
                  <input
                    id="register-firstname"
                    type="text"
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    placeholder="First Name"
                    required
                    className="w-full px-3 h-[38px] rounded-[4px] border border-gray-300 text-gray-800 text-sm placeholder-gray-400 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-400/30 transition-all shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-normal text-gray-700 mb-1">
                    Last Name <span className="text-red-500 font-bold">*</span>
                  </label>
                  <input
                    id="register-lastname"
                    type="text"
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    placeholder="Last Name"
                    required
                    className="w-full px-3 h-[38px] rounded-[4px] border border-gray-300 text-gray-800 text-sm placeholder-gray-400 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-400/30 transition-all shadow-sm"
                  />
                </div>
              </div>

              {/* Row 3: Email Address * & Password * */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-sm font-normal text-gray-700 mb-1">
                    Email Address <span className="text-red-500 font-bold">*</span>
                  </label>
                  <input
                    id="register-email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="Email"
                    required
                    className="w-full px-3 h-[38px] rounded-[4px] border border-gray-300 text-gray-800 text-sm placeholder-gray-400 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-400/30 transition-all shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-normal text-gray-700 mb-1">
                    Password <span className="text-red-500 font-bold">*</span>
                  </label>
                  <div className="relative">
                    <input
                      id="register-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Password"
                      required
                      minLength={6}
                      className="w-full pl-3 pr-10 h-[38px] rounded-[4px] border border-gray-300 text-gray-800 text-sm placeholder-gray-400 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-400/30 transition-all shadow-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4 text-gray-600" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Row 4: Mobile * & Sign Up Now Button (Amber Theme) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end mb-1">
                <div>
                  <label className="block text-sm font-normal text-gray-700 mb-1">
                    Mobile <span className="text-red-500 font-bold">*</span>
                  </label>
                  <input
                    id="register-mobile"
                    type="tel"
                    value={mobile}
                    onChange={e => setMobile(e.target.value)}
                    placeholder="Mobile"
                    required
                    className="w-full px-3 h-[38px] rounded-[4px] border border-gray-300 text-gray-800 text-sm placeholder-gray-400 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-400/30 transition-all shadow-sm"
                  />
                </div>
                <div>
                  <button
                    id="register-submit-btn"
                    type="submit"
                    disabled={loading}
                    className="w-full h-[42px] rounded-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 active:from-amber-600 text-slate-950 font-bold text-sm shadow-sm transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center"
                  >
                    {loading ? 'Creating...' : 'Sign Up Now'}
                  </button>
                </div>
              </div>

              {/* Turnstile CAPTCHA if enabled */}
              {authConfig.captchaSiteKey && (
                <div className="flex justify-center pt-2">
                  <div ref={turnstileContainerRef} id="turnstile-container" />
                </div>
              )}

              {/* Error Alert */}
              {error && (
                <div className="mt-2.5 p-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                  <span>{error}</span>
                </div>
              )}

              {/* Hidden accessibility hooks for scripts */}
              <div className="hidden">
                <button id="tab-signin-btn" onClick={() => setMode('login')} />
                <button id="switch-to-signin-link" onClick={() => setMode('login')} />
                <button id="tab-signup-btn" onClick={() => setMode('register')} />
                <button id="switch-to-signup-link" onClick={() => setMode('register')} />
              </div>
            </form>
          </div>

          {/* Right Panel: Dark Translucent Card (rounded-[25px], bg-black/60, box-shadow glow, -ml-14 overlap) */}
          <div className="w-full md:w-[650px] bg-black/60 backdrop-blur-md rounded-[25px] p-8 md:py-14 md:pl-20 md:pr-10 shadow-[0_0_25px_rgba(255,255,255,0.2)] md:-ml-14 z-0 text-white flex flex-col justify-center min-h-[378px]">
            <h2 className="text-3xl font-black text-white text-center mb-3">
              Start Your Journey
            </h2>
            <p className="text-gray-200 text-sm leading-relaxed text-center mb-6 max-w-lg mx-auto">
              Create your account in seconds and unlock the most powerful outbound sales infrastructure. Connect your phones, streamline your leads, and accelerate your revenue growth—all in one place.
            </p>

            <div className="text-sm font-medium text-center text-white mb-6">
              Already have an account?{' '}
              <button
                type="button"
                id="switch-to-signin-link"
                onClick={() => { setMode('login'); setError(null); setSuccessMsg(null); }}
                className="text-amber-400 hover:text-amber-300 font-bold hover:underline ml-1 cursor-pointer"
              >
                Sign In
              </button>
            </div>

            <p className="text-[11px] text-gray-400 text-center leading-normal mt-auto">
              This site is protected by reCAPTCHA and the Google{' '}
              <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer" className="text-gray-300 underline">
                Privacy Policy
              </a>{' '}
              and{' '}
              <a href="https://policies.google.com/terms" target="_blank" rel="noreferrer" className="text-gray-300 underline">
                Terms of Service
              </a>{' '}
              apply.
            </p>
          </div>
        </div>
      )}

      {/* ── FORGOT PASSWORD MODE (Matching Geometry) ── */}
      {mode === 'forgot' && (
        <div className="w-full max-w-[960px] mx-auto flex flex-col md:flex-row items-center justify-center relative z-10 px-4 transition-all duration-300">
          {/* Left Dark Card */}
          <div className="w-full md:w-[540px] bg-black/60 backdrop-blur-md rounded-[25px] p-8 md:p-12 md:pr-20 shadow-[0_0_25px_rgba(255,255,255,0.2)] md:-mr-14 z-0 text-white flex flex-col justify-center min-h-[400px]">
            <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2 font-display">
              Octal <span className="bg-gradient-to-r from-amber-400 to-amber-500 bg-clip-text text-transparent">Dialer</span>
            </h1>
            <h2 className="text-lg sm:text-xl font-bold text-white mb-4">
              Account Recovery
            </h2>
            <p className="text-gray-200 text-sm leading-relaxed max-w-[380px]">
              Enter your registered email address or username to receive a password reset link and regain immediate access to your dialing workspace.
            </p>
          </div>

          {/* Right White Card */}
          <div className="w-full max-w-[445px] bg-white rounded-[25px] shadow-2xl p-[30px] z-10 flex flex-col justify-center min-h-[400px]">
            <form onSubmit={handleSubmit} className="w-full">
              <h3 className="text-xl font-bold text-gray-800 mb-1">Forgot Password</h3>
              <p className="text-xs text-gray-500 mb-5">
                Enter your username or email address below to reset your password.
              </p>

              <div className="mb-5">
                <label className="block text-sm font-normal text-gray-700 mb-1.5">
                  Email Address or Username
                </label>
                <input
                  id="forgot-identifier"
                  type="text"
                  value={email || username}
                  onChange={e => { setEmail(e.target.value); setUsername(e.target.value); }}
                  placeholder="Email or Username"
                  required
                  className="w-full px-3 h-[38px] rounded-[4px] border border-gray-300 text-gray-800 text-sm placeholder-gray-400 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-400/30 transition-all shadow-sm"
                />
              </div>

              {/* Error Alert */}
              {error && (
                <div className="mb-3 p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                  <span>{error}</span>
                </div>
              )}

              {/* Success Alert */}
              {successMsg && (
                <div className="mb-3 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
                  <span>{successMsg}</span>
                </div>
              )}

              <div className="flex justify-center mb-4">
                <button
                  id="forgot-submit"
                  type="submit"
                  disabled={loading}
                  className="w-[180px] h-[44px] rounded-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-sm shadow-sm transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center"
                >
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </button>
              </div>

              <div className="text-center mt-3">
                <button
                  type="button"
                  id="forgot-back-to-signin"
                  onClick={() => { setMode('login'); setError(null); setSuccessMsg(null); }}
                  className="text-xs text-amber-600 hover:text-amber-700 hover:underline cursor-pointer font-semibold"
                >
                  ← Back to Sign In
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

