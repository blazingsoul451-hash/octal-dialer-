import React, { useState, useEffect, useRef } from 'react';
import { Lock, User, Eye, EyeOff, Shield, Building, UserPlus, LogIn, Mail, ArrowRight, KeyRound, CheckCircle2, AlertCircle, RefreshCw, ArrowLeft, ShieldCheck, X } from 'lucide-react';

interface LoginScreenProps {
  serverUrl: string;
  onLogin: (token: string, username: string) => void;
}

interface AuthConfig {
  googleClientId: string | null;
  captchaSiteKey: string | null;
  captchaEnabled: boolean;
}

interface GooglePromptError {
  code: 'GOOGLE_ACCOUNT_NOT_FOUND' | 'GOOGLE_ACCOUNT_ALREADY_EXISTS';
  email?: string;
}

export function LoginScreen({ serverUrl, onLogin }: LoginScreenProps) {
  const [mode, setMode] = useState<'login' | 'register' | 'verify' | 'signup' | 'forgot'>('login');
  const [companyName, setCompanyName] = useState('');
  const [username, setUsername] = useState('admin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Email Verification OTP State
  const [signupId, setSignupId] = useState<string>('');
  const [otpCode, setOtpCode] = useState<string>('');
  const [resendCooldown, setResendCooldown] = useState<number>(0);
  const [resending, setResending] = useState<boolean>(false);

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

  // Check URL parameters for OAuth callbacks and errors
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const authError = params.get('auth_error');
      const authEmail = params.get('email');

      if (authError === 'GOOGLE_ACCOUNT_NOT_FOUND') {
        setGooglePromptError({ code: 'GOOGLE_ACCOUNT_NOT_FOUND', email: authEmail || undefined });
        window.history.replaceState({}, document.title, window.location.pathname);
      } else if (authError === 'GOOGLE_ACCOUNT_ALREADY_EXISTS') {
        setGooglePromptError({ code: 'GOOGLE_ACCOUNT_ALREADY_EXISTS', email: authEmail || undefined });
        window.history.replaceState({}, document.title, window.location.pathname);
      } else if (authError) {
        setError(decodeURIComponent(authError));
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } catch (_) {}
  }, []);

  // Countdown timer for resend cooldown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

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
        if (data.code === 'GOOGLE_ACCOUNT_NOT_FOUND') {
          setGooglePromptError({ code: 'GOOGLE_ACCOUNT_NOT_FOUND', email: data.email });
          return;
        }
        if (data.code === 'GOOGLE_ACCOUNT_ALREADY_EXISTS') {
          setGooglePromptError({ code: 'GOOGLE_ACCOUNT_ALREADY_EXISTS', email: data.email });
          return;
        }
        throw new Error(data.error || 'Google authentication failed.');
      }

      localStorage.setItem('octal_auth_token', data.token);
      localStorage.setItem('octal_auth_user', data.username);
      onLogin(data.token, data.username);
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

    // If intent is signup, enforce CAPTCHA if enabled
    if (intent === 'signup' && authConfig.captchaEnabled && authConfig.captchaSiteKey && !captchaToken) {
      setError('Please complete the CAPTCHA before signing up with Google.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const candidateUrls = Array.from(new Set([
        serverUrl,
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        ''
      ]));

      let res: Response | null = null;
      for (const baseUrl of candidateUrls) {
        try {
          res = await fetch(`${baseUrl}/auth/google/initiate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ intent, captchaToken })
          });
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

      // Direct fallback
      window.location.href = `${serverUrl}/auth/google?intent=${intent}`;
    } catch (err: any) {
      setError(err.message || 'Failed to initiate Google authentication.');
      setLoading(false);
    }
  };

  // Handle Resend OTP Code
  const handleResendOtp = async () => {
    if (resendCooldown > 0 || resending) return;
    setResending(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`${serverUrl}/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signupId, email: email.trim(), captchaToken })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to resend verification code.');
      }

      setSuccessMsg(data.message || 'A new verification code has been sent.');
      setResendCooldown(data.cooldownSeconds || 45);
    } catch (err: any) {
      setError(err.message || 'Failed to resend code.');
    } finally {
      setResending(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    // Form Validations
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
    } else if (mode === 'register') {
      if (!email.trim() || !email.includes('@')) {
        setError('Please enter a valid email address.');
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
    } else if (mode === 'verify') {
      if (!otpCode.trim() || otpCode.trim().length !== 6) {
        setError('Please enter the 6-digit verification code sent to your email.');
        return;
      }
    } else if (mode === 'forgot') {
      if (!username.trim() && !email.trim()) {
        setError('Please provide your username or email address.');
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
          let endpoint = `${baseUrl}/auth/login`;
          let payload: any = { username: username.trim(), password, captchaToken };

          if (mode === 'signup') {
            endpoint = `${baseUrl}/auth/signup`;
            payload = { companyName: companyName.trim(), username: username.trim(), password, email: email.trim(), captchaToken };
          } else if (mode === 'register') {
            endpoint = `${baseUrl}/auth/initiate-signup`;
            payload = { email: email.trim(), password, captchaToken };
          } else if (mode === 'verify') {
            endpoint = `${baseUrl}/auth/verify-email`;
            payload = { signupId, email: email.trim(), code: otpCode.trim() };
          } else if (mode === 'forgot') {
            endpoint = `${baseUrl}/auth/forgot-password`;
            payload = { identifier: (email || username).trim(), captchaToken };
          }

          res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          if (res) break;
        } catch {
          // try next url
        }
      }

      if (!res) {
        setError('Cannot reach backend server. Please ensure backend is running.');
        return;
      }

      const data = await res.json();

      if (!res.ok) {
        if (data.code === 'EMAIL_NOT_VERIFIED') {
          setError(data.error || 'Your email is not verified.');
          setMode('verify');
          return;
        }
        setError(data.error || 'Operation failed.');
        return;
      }

      // Handle Step 1 Register -> Move to Verify Screen
      if (mode === 'register') {
        setSignupId(data.signupId || '');
        setMode('verify');
        setResendCooldown(45);
        setSuccessMsg(data.message || `We sent a 6-digit verification code to ${email.trim()}`);
        return;
      }

      if (mode === 'forgot') {
        setSuccessMsg(data.message || 'Password reset link issued. Check your email or console logs.');
        return;
      }

      // Successful Login or Verify -> Authenticate user
      const token = data.token;
      const returnedUser = data.user?.username || data.username || username;

      localStorage.setItem('octal_auth_token', token);
      localStorage.setItem('octal_auth_user', returnedUser);
      onLogin(token, returnedUser);
    } catch (err: any) {
      setError(err.message || 'Cannot reach server. Make sure the backend is active.');
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
      >
        <source src="/merged-galaxy.webm" type="video/webm" />
        <source src="/merged-galaxy.mp4" type="video/mp4" />
      </video>

      {/* Overlay for optimal contrast & focus */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/60 via-slate-950/75 to-slate-950/60 backdrop-blur-[2px] pointer-events-none" />

      <div className="w-full max-w-md relative z-10 mx-auto">
        {/* Main Card */}
        <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-700/60 rounded-3xl p-7 shadow-2xl shadow-black/80">
          
          {/* Brand Header */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 mb-3 shadow-inner">
              {mode === 'verify' ? <ShieldCheck className="w-6 h-6 text-amber-400" /> : <Shield className="w-6 h-6" />}
            </div>
            <h1 className="text-xl font-black text-white tracking-tight font-display">
              OCTAL <span className="text-amber-400">DIALER</span>
            </h1>
            <p className="text-xs text-slate-400 mt-1 font-medium">
              {mode === 'login' && 'Welcome back! Sign in to continue.'}
              {mode === 'register' && 'Create your user account with email verification.'}
              {mode === 'verify' && 'Verify your email address to activate your account.'}
              {mode === 'signup' && 'Register a new enterprise tenant.'}
              {mode === 'forgot' && 'Reset your account password.'}
            </p>
          </div>

          {/* Explicit Google Intent Prompt Error Alert Card */}
          {googlePromptError && (
            <div className="mb-5 bg-slate-950/90 border border-amber-500/50 rounded-2xl p-5 shadow-xl text-center space-y-3">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 mx-auto">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">
                  {googlePromptError.code === 'GOOGLE_ACCOUNT_NOT_FOUND' ? 'No Account Found' : 'Account Already Exists'}
                </h3>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  {googlePromptError.code === 'GOOGLE_ACCOUNT_NOT_FOUND' ? (
                    <>
                      There is no Octal Dialer account associated with{' '}
                      <span className="text-amber-300 font-mono font-bold">{googlePromptError.email || 'this Google account'}</span>.
                      Please sign up first.
                    </>
                  ) : (
                    <>
                      An Octal Dialer account already exists with{' '}
                      <span className="text-amber-300 font-mono font-bold">{googlePromptError.email || 'this Google account'}</span>.
                      Please sign in instead.
                    </>
                  )}
                </p>
              </div>

              <div className="pt-2 flex flex-col gap-2">
                {googlePromptError.code === 'GOOGLE_ACCOUNT_NOT_FOUND' ? (
                  <>
                    <button
                      type="button"
                      id="google-signup-prompt-btn"
                      onClick={() => {
                        setGooglePromptError(null);
                        setMode('register');
                        handleGoogleLoginClick('signup');
                      }}
                      className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs py-2.5 rounded-xl transition-all cursor-pointer shadow-md flex items-center justify-center gap-2"
                    >
                      <span>Sign Up With Google</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setGooglePromptError(null);
                        setMode('login');
                      }}
                      className="text-xs font-mono text-slate-400 hover:text-white transition-colors cursor-pointer py-1"
                    >
                      Back to Sign In
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      id="google-signin-prompt-btn"
                      onClick={() => {
                        setGooglePromptError(null);
                        setMode('login');
                        handleGoogleLoginClick('signin');
                      }}
                      className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs py-2.5 rounded-xl transition-all cursor-pointer shadow-md flex items-center justify-center gap-2"
                    >
                      <span>Sign In With Google</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setGooglePromptError(null);
                        setMode('register');
                      }}
                      className="text-xs font-mono text-slate-400 hover:text-white transition-colors cursor-pointer py-1"
                    >
                      Back to Sign Up
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Mode Switcher */}
          {mode !== 'forgot' && mode !== 'verify' && (
            <div className="flex bg-slate-950/80 p-1 rounded-xl border border-slate-800 mb-5">
              <button
                type="button"
                onClick={() => { setMode('login'); setError(null); setSuccessMsg(null); setGooglePromptError(null); }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-mono font-bold rounded-lg transition-all cursor-pointer ${
                  mode === 'login'
                    ? 'bg-amber-500 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <LogIn className="w-3.5 h-3.5" />
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { setMode('register'); setError(null); setSuccessMsg(null); setGooglePromptError(null); }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-mono font-bold rounded-lg transition-all cursor-pointer ${
                  mode === 'register'
                    ? 'bg-amber-500 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                Sign Up
              </button>
              <button
                type="button"
                onClick={() => { setMode('signup'); setError(null); setSuccessMsg(null); setGooglePromptError(null); }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-mono font-bold rounded-lg transition-all cursor-pointer ${
                  mode === 'signup'
                    ? 'bg-amber-500 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Building className="w-3.5 h-3.5" />
                Tenant
              </button>
            </div>
          )}

          {/* ── GOOGLE AUTHENTICATION (Intent-Specific: Sign In vs Sign Up) ── */}
          {mode !== 'forgot' && mode !== 'verify' && !googlePromptError && (
            <div className="space-y-4 mb-5">
              <button
                type="button"
                id={mode === 'register' ? 'google-signup-btn' : 'google-signin-btn'}
                onClick={() => handleGoogleLoginClick(mode === 'register' ? 'signup' : 'signin')}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-100 text-slate-900 font-bold text-xs py-3 px-4 rounded-xl shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed border border-slate-200"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>{mode === 'register' ? 'Sign Up with Google' : 'Continue with Google'}</span>
              </button>

              {/* Divider */}
              <div className="relative flex items-center justify-center">
                <div className="border-t border-slate-800 w-full" />
                <span className="bg-slate-900 px-3 text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider shrink-0">
                  OR
                </span>
                <div className="border-t border-slate-800 w-full" />
              </div>
            </div>
          )}

          {/* ── EMAIL OTP VERIFICATION SCREEN ── */}
          {mode === 'verify' ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-center">
                <p className="text-xs text-amber-200 font-medium">
                  We sent a 6-digit verification code to:
                </p>
                <p className="text-sm text-white font-mono font-bold mt-1 break-all">
                  {email}
                </p>
              </div>

              <div>
                <label className="block text-[10px] font-mono text-slate-400 mb-1.5 uppercase tracking-wider font-bold text-center">
                  Enter 6-Digit Verification Code
                </label>
                <input
                  id="otp-code-input"
                  type="text"
                  maxLength={6}
                  value={otpCode}
                  onChange={e => setOtpCode(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="123456"
                  autoFocus
                  required
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-4 py-3 text-center text-xl tracking-[0.5em] font-mono text-amber-400 font-bold placeholder-slate-700 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30 transition-all"
                />
              </div>

              {/* Error Alert */}
              {error && (
                <div className="bg-red-950/40 border border-red-500/40 rounded-xl px-3.5 py-2.5 text-[11px] font-mono text-red-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Success Alert */}
              {successMsg && (
                <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-xl px-3.5 py-2.5 text-[11px] font-mono text-emerald-300 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{successMsg}</span>
                </div>
              )}

              {/* Submit Verify Button */}
              <button
                id="verify-email-submit"
                type="submit"
                disabled={loading || otpCode.length !== 6}
                className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 text-slate-950 font-black text-xs rounded-xl py-3 transition-all duration-200 uppercase tracking-wider cursor-pointer disabled:cursor-not-allowed shadow-lg shadow-amber-500/10 flex items-center justify-center gap-2"
              >
                {loading ? 'Activating Account...' : 'Verify Email & Log In'}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              {/* Resend Code & Change Email Controls */}
              <div className="pt-2 space-y-2 text-center">
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={resendCooldown > 0 || resending}
                  className="text-xs font-mono text-slate-400 hover:text-amber-300 disabled:text-slate-600 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 mx-auto transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${resending ? 'animate-spin' : ''}`} />
                  {resendCooldown > 0
                    ? `Resend code in ${resendCooldown}s`
                    : 'Didn\'t receive code? Resend'}
                </button>

                <button
                  type="button"
                  onClick={() => { setMode('register'); setError(null); setSuccessMsg(null); }}
                  className="text-[11px] font-mono text-slate-500 hover:text-slate-300 flex items-center justify-center gap-1 mx-auto transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-3 h-3" />
                  Change email address
                </button>
              </div>
            </form>
          ) : (
            /* ── STANDARD AUTH FORMS ── */
            <form onSubmit={handleSubmit} className="space-y-3.5">

              {/* Company Name (Tenant Signup only) */}
              {mode === 'signup' && (
                <div>
                  <label className="block text-[10px] font-mono text-slate-400 mb-1 uppercase tracking-wider font-bold">Company / Organization</label>
                  <div className="relative">
                    <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      id="signup-company"
                      type="text"
                      value={companyName}
                      onChange={e => setCompanyName(e.target.value)}
                      placeholder="Acme Global Inc"
                      required
                      className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white font-mono placeholder-slate-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 transition-all"
                    />
                  </div>
                </div>
              )}

              {/* Email Address (Register / Forgot) */}
              {(mode === 'register' || mode === 'forgot') && (
                <div>
                  <label className="block text-[10px] font-mono text-slate-400 mb-1 uppercase tracking-wider font-bold">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      id="auth-email"
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@gmail.com, you@outlook.com, etc."
                      required
                      className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white font-mono placeholder-slate-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 transition-all"
                    />
                  </div>
                </div>
              )}

              {/* Username (Login / Tenant Signup) */}
              {(mode === 'login' || mode === 'signup') && (
                <div>
                  <label className="block text-[10px] font-mono text-slate-400 mb-1 uppercase tracking-wider font-bold">
                    {mode === 'login' ? 'Username or Email' : 'Username'}
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      id="login-username"
                      type="text"
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                      placeholder={mode === 'login' ? 'admin or user@domain.com' : 'johndoe'}
                      autoComplete="username"
                      required
                      className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white font-mono placeholder-slate-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 transition-all"
                    />
                  </div>
                </div>
              )}

              {/* Password (Login / Register / Signup) */}
              {mode !== 'forgot' && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider font-bold">Password</label>
                    {mode === 'login' && (
                      <button
                        type="button"
                        onClick={() => { setMode('forgot'); setError(null); setSuccessMsg(null); }}
                        className="text-[10px] font-mono text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      required
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
              )}

              {/* Confirm Password (Register / Signup only) */}
              {(mode === 'signup' || mode === 'register') && (
                <div>
                  <label className="block text-[10px] font-mono text-slate-400 mb-1 uppercase tracking-wider font-bold">Confirm Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      id="signup-confirm-password"
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      required
                      className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white font-mono placeholder-slate-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 transition-all"
                    />
                  </div>
                </div>
              )}

              {/* Turnstile CAPTCHA Container */}
              {authConfig.captchaSiteKey && (
                <div className="flex justify-center pt-2">
                  <div ref={turnstileContainerRef} id="turnstile-container" />
                </div>
              )}

              {/* Error Alert */}
              {error && (
                <div className="bg-red-950/40 border border-red-500/40 rounded-xl px-3.5 py-2.5 text-[11px] font-mono text-red-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Success Alert */}
              {successMsg && (
                <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-xl px-3.5 py-2.5 text-[11px] font-mono text-emerald-300 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{successMsg}</span>
                </div>
              )}

              {/* Submit Button */}
              <button
                id="login-submit"
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 text-slate-950 font-black text-xs rounded-xl py-3 transition-all duration-200 uppercase tracking-wider cursor-pointer disabled:cursor-not-allowed shadow-lg shadow-amber-500/10 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <span>Processing...</span>
                ) : mode === 'login' ? (
                  <><span>Sign In</span> <ArrowRight className="w-3.5 h-3.5" /></>
                ) : mode === 'register' ? (
                  <><span>Send Verification Code</span> <Mail className="w-3.5 h-3.5" /></>
                ) : mode === 'signup' ? (
                  <><span>Provision Tenant</span> <Building className="w-3.5 h-3.5" /></>
                ) : (
                  <><span>Send Reset Link</span> <KeyRound className="w-3.5 h-3.5" /></>
                )}
              </button>

              {/* Back to Login link from Forgot mode */}
              {mode === 'forgot' && (
                <button
                  type="button"
                  onClick={() => { setMode('login'); setError(null); setSuccessMsg(null); }}
                  className="w-full text-center text-xs font-mono text-slate-400 hover:text-white pt-2 transition-colors cursor-pointer"
                >
                  ← Back to Sign In
                </button>
              )}
            </form>
          )}

          {/* Footer toggle note */}
          {mode === 'login' && (
            <p className="text-center text-xs text-slate-400 mt-5">
              Don't have an account?{' '}
              <button
                type="button"
                onClick={() => { setMode('register'); setError(null); setSuccessMsg(null); setGooglePromptError(null); }}
                className="font-bold text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
              >
                Sign up
              </button>
            </p>
          )}

          {mode === 'register' && (
            <p className="text-center text-xs text-slate-400 mt-5">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => { setMode('login'); setError(null); setSuccessMsg(null); setGooglePromptError(null); }}
                className="font-bold text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
              >
                Sign in
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
