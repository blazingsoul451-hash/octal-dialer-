import React, { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, AlertCircle, CheckCircle2, ChevronDown, Search, ShieldAlert, Mail, Send, X, MessageSquare } from 'lucide-react';
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

interface SuspendedAccountInfo {
  email?: string;
  tenantName?: string;
  message?: string;
}

const COUNTRY_CODES = [
  { iso: 'PK', code: '+92', name: 'Pakistan' },
  { iso: 'US', code: '+1', name: 'United States / Canada' },
  { iso: 'GB', code: '+44', name: 'United Kingdom' },
  { iso: 'AE', code: '+971', name: 'United Arab Emirates' },
  { iso: 'SA', code: '+966', name: 'Saudi Arabia' },
  { iso: 'AU', code: '+61', name: 'Australia' },
  { iso: 'DE', code: '+49', name: 'Germany' },
  { iso: 'FR', code: '+33', name: 'France' },
  { iso: 'IN', code: '+91', name: 'India' },
  { iso: 'SG', code: '+65', name: 'Singapore' },
  { iso: 'MY', code: '+60', name: 'Malaysia' },
  { iso: 'TR', code: '+90', name: 'Turkey' },
  { iso: 'ES', code: '+34', name: 'Spain' },
  { iso: 'IT', code: '+39', name: 'Italy' },
  { iso: 'NL', code: '+31', name: 'Netherlands' },
  { iso: 'CH', code: '+41', name: 'Switzerland' },
  { iso: 'SE', code: '+46', name: 'Sweden' },
  { iso: 'NO', code: '+47', name: 'Norway' },
  { iso: 'DK', code: '+45', name: 'Denmark' },
  { iso: 'IE', code: '+353', name: 'Ireland' },
  { iso: 'ZA', code: '+27', name: 'South Africa' },
  { iso: 'EG', code: '+20', name: 'Egypt' },
  { iso: 'NG', code: '+234', name: 'Nigeria' },
  { iso: 'KE', code: '+254', name: 'Kenya' },
  { iso: 'BR', code: '+55', name: 'Brazil' },
  { iso: 'MX', code: '+52', name: 'Mexico' },
  { iso: 'NZ', code: '+64', name: 'New Zealand' },
  { iso: 'JP', code: '+81', name: 'Japan' },
  { iso: 'KR', code: '+82', name: 'South Korea' },
  { iso: 'CN', code: '+86', name: 'China' },
  { iso: 'HK', code: '+852', name: 'Hong Kong' },
  { iso: 'PH', code: '+63', name: 'Philippines' },
  { iso: 'ID', code: '+62', name: 'Indonesia' },
  { iso: 'TH', code: '+66', name: 'Thailand' },
  { iso: 'VN', code: '+84', name: 'Vietnam' },
  { iso: 'BD', code: '+880', name: 'Bangladesh' },
  { iso: 'LK', code: '+94', name: 'Sri Lanka' },
  { iso: 'NP', code: '+977', name: 'Nepal' },
  { iso: 'QA', code: '+974', name: 'Qatar' },
  { iso: 'OM', code: '+968', name: 'Oman' },
  { iso: 'BH', code: '+973', name: 'Bahrain' },
  { iso: 'KW', code: '+965', name: 'Kuwait' },
  { iso: 'JO', code: '+962', name: 'Jordan' },
  { iso: 'LB', code: '+961', name: 'Lebanon' },
  { iso: 'KZ', code: '+7', name: 'Kazakhstan' },
  { iso: '🌐', code: '', name: 'Other / Custom' },
];

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
  const [countryCode, setCountryCode] = useState('+92');
  const [isCountryPickerOpen, setIsCountryPickerOpen] = useState(false);
  const [countrySearchQuery, setCountrySearchQuery] = useState('');
  const countryPickerRef = useRef<HTMLDivElement>(null);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (countryPickerRef.current && !countryPickerRef.current.contains(e.target as Node)) {
        setIsCountryPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentCountry = COUNTRY_CODES.find(c => c.code === countryCode) || COUNTRY_CODES[0];
  const filteredCountries = COUNTRY_CODES.filter(c =>
    c.name.toLowerCase().includes(countrySearchQuery.toLowerCase()) ||
    c.code.includes(countrySearchQuery) ||
    c.iso.toLowerCase().includes(countrySearchQuery.toLowerCase())
  );

  // Common form state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Google Explicit Intent Error Modal
  const [googlePromptError, setGooglePromptError] = useState<GooglePromptError | null>(null);

  // Suspended Account & Workspace Reactivation State
  const [suspendedInfo, setSuspendedInfo] = useState<SuspendedAccountInfo | null>(null);
  const [reactivateMessage, setReactivateMessage] = useState<string>('Hello Administrator, our workspace account was suspended. We would like to reactivate our account and resume using our dialer. Please review and restore our access.');
  const [reactivateName, setReactivateName] = useState<string>('');
  const [reactivateEmail, setReactivateEmail] = useState<string>('');
  const [reactivateSubmitting, setReactivateSubmitting] = useState<boolean>(false);
  const [reactivateSuccess, setReactivateSuccess] = useState<boolean>(false);
  const [reactivateError, setReactivateError] = useState<string | null>(null);

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
      const authTenant = params.get('tenant');

      if (authError === 'ACCOUNT_SUSPENDED' || authError === 'WORKSPACE_SUSPENDED' || (authMessage && authMessage.toLowerCase().includes('suspended'))) {
        setSuspendedInfo({
          email: authEmail || undefined,
          tenantName: authTenant || undefined,
          message: authMessage ? decodeURIComponent(authMessage) : 'Your workspace or account has been suspended by the platform administrator.'
        });
        if (authEmail) setReactivateEmail(authEmail);
        window.history.replaceState({}, document.title, window.location.pathname);
      } else if (authError === 'ACCOUNT_NOT_FOUND' || authError === 'GOOGLE_ACCOUNT_NOT_FOUND') {
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
      .then(res => res.ok ? res.json() : null)
      .then((data: AuthConfig | null) => {
        clearTimeout(timeoutId);
        if (!data) return;
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
      let data: any = {};
      try {
        const text = await res.text();
        data = JSON.parse(text);
      } catch {
        throw new Error('Invalid authentication response from server.');
      }
      if (!res.ok) {
        if (data.code === 'ACCOUNT_SUSPENDED' || data.code === 'WORKSPACE_SUSPENDED' || (data.error && data.error.toLowerCase().includes('suspended'))) {
          setSuspendedInfo({
            email: data.email,
            tenantName: data.tenantName,
            message: data.error || 'Your workspace or account has been suspended by the platform administrator.'
          });
          if (data.email) setReactivateEmail(data.email);
          return;
        }
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

      const roleLower = (normalizedRole || '').toLowerCase();
      if (roleLower === 'platform_admin' || roleLower === 'superadmin' || roleLower === 'master_admin' || roleLower === 'super_admin') {
        sessionStorage.setItem('octal_platform_auth_token', data.token);
        sessionStorage.setItem('octal_platform_auth_user', identity.username);
        localStorage.removeItem('octal_platform_auth_token');
        localStorage.removeItem('octal_platform_auth_user');
        localStorage.removeItem('octal_auth_token');
        localStorage.removeItem('octal_auth_user');
      } else {
        localStorage.setItem('octal_customer_auth_token', data.token);
        localStorage.setItem('octal_customer_auth_user', identity.username);
        localStorage.setItem('octal_auth_token', data.token);
        localStorage.setItem('octal_auth_user', identity.username);
      }
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
        try {
          const data = await res.json();
          if (data.authUrl) {
            window.location.href = data.authUrl;
            return;
          }
        } catch {}
      }

      window.location.href = `${serverUrl}/auth/google?intent=${intent}`;
    } catch (err: any) {
      setError(err.message || 'Failed to initiate Google authentication.');
      setLoading(false);
    }
  };

  const handleSendReactivationRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reactivateEmail || !reactivateEmail.includes('@')) {
      setReactivateError('Please enter a valid email address.');
      return;
    }
    if (!reactivateMessage.trim()) {
      setReactivateError('Please enter a message for the administrator.');
      return;
    }
    setReactivateSubmitting(true);
    setReactivateError(null);
    try {
      const res = await fetch(`${serverUrl}/auth/contact-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: reactivateEmail.trim(),
          name: reactivateName.trim(),
          message: reactivateMessage.trim(),
          tenantName: suspendedInfo?.tenantName
        })
      });
      let data: any = {};
      try {
        const text = await res.text();
        data = JSON.parse(text);
      } catch {
        throw new Error('Unable to submit request. Please try again.');
      }
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit request.');
      }
      setReactivateSuccess(true);
    } catch (err: any) {
      setReactivateError(err.message || 'Failed to send reactivation request.');
    } finally {
      setReactivateSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    let normalizedMobile = mobile.trim();

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
      if (email.includes('+')) {
        setError('Email alias addresses containing "+" are not allowed. Please enter your primary work email.');
        return;
      }
      if (!password || password.length < 6) {
        setError('Password must be at least 6 characters.');
        return;
      }
      const rawMobile = mobile.trim();
      if (!rawMobile) {
        setError('Please enter your Mobile number.');
        return;
      }

      let finalMobile = rawMobile;
      if (countryCode && !rawMobile.startsWith('+')) {
        const stripped = rawMobile.startsWith('0') ? rawMobile.slice(1) : rawMobile;
        finalMobile = `${countryCode}${stripped}`;
      }
      normalizedMobile = finalMobile;

      const digitsOnly = finalMobile.replace(/\D/g, '');
      if (digitsOnly.length < 7 || digitsOnly.length > 15) {
        setError('Please enter a valid phone number (between 7 and 15 digits).');
        return;
      }

      // Persist business name & mobile for seamless onboarding wizard prefill
      localStorage.setItem('pending_business_name', businessName.trim());
      localStorage.setItem('pending_mobile', finalMobile);
    } else if (mode === 'forgot') {
      if (!username.trim() && !email.trim()) {
        setError('Please provide your email address or username.');
        return;
      }
    } else {
      if (!username.trim()) {
        setError('Please enter your Email Address.');
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

      const candidateUrls: string[] = [''];
      if (serverUrl && !candidateUrls.includes(serverUrl)) {
        candidateUrls.push(serverUrl);
      }
      if (typeof window !== 'undefined' && window.location.origin && !candidateUrls.includes(window.location.origin)) {
        candidateUrls.push(window.location.origin);
      }
      if (isLocal) {
        candidateUrls.push('http://127.0.0.1:5000');
        candidateUrls.push(`http://${window.location.hostname}:5000`);
      }

      let res: Response | null = null;

      for (const baseUrl of candidateUrls) {
        try {
          const cleanBase = baseUrl ? baseUrl.replace(/\/$/, '') : '';
          let endpoint = `${cleanBase}/auth/login`;
          let payload: any = { username: username.trim(), password, captchaToken };

          if (mode === 'register') {
            const finalFullName = `${firstName.trim()} ${lastName.trim()}`.trim();
            endpoint = `${cleanBase}/auth/register`;
            payload = {
              name: finalFullName,
              fullName: finalFullName,
              email: email.trim(),
              password,
              businessName: businessName.trim(),
              mobile: normalizedMobile,
              captchaToken
            };
          } else if (mode === 'forgot') {
            endpoint = `${cleanBase}/auth/forgot-password`;
            payload = { identifier: (email || username).trim(), captchaToken };
          }

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);

          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          res = response;
          if (res) break;
        } catch (fetchErr: any) {
          console.warn('[LoginScreen] Candidate endpoint unreachable:', baseUrl, fetchErr?.message || fetchErr);
        }
      }

      if (!res) {
        setError('Cannot reach backend server. Please ensure backend is running.');
        return;
      }

      let data: any = {};
      try {
        const rawText = await res.text();
        data = JSON.parse(rawText);
      } catch {
        setError(res.status >= 500
          ? 'Server communication error. Please try again shortly.'
          : 'Invalid response from server. Please verify your connection.');
        return;
      }

      if (!res.ok) {
        if (data.code === 'ACCOUNT_SUSPENDED' || (data.error && data.error.toLowerCase().includes('suspended'))) {
          setSuspendedInfo({
            email: data.email || (username.includes('@') ? username : email || undefined),
            tenantName: data.tenantName,
            message: data.error || 'Your workspace or account has been suspended by the platform administrator.'
          });
          if (data.email || username.includes('@')) {
            setReactivateEmail(data.email || username);
          } else if (email) {
            setReactivateEmail(email);
          }
          return;
        }
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

      const roleLower = (normalizedRole || '').toLowerCase();
      if (roleLower === 'platform_admin' || roleLower === 'superadmin' || roleLower === 'master_admin' || roleLower === 'super_admin') {
        sessionStorage.setItem('octal_platform_auth_token', token);
        sessionStorage.setItem('octal_platform_auth_user', returnedUser);
        localStorage.removeItem('octal_platform_auth_token');
        localStorage.removeItem('octal_platform_auth_user');
        localStorage.removeItem('octal_auth_token');
        localStorage.removeItem('octal_auth_user');
      } else {
        localStorage.setItem('octal_customer_auth_token', token);
        localStorage.setItem('octal_customer_auth_user', returnedUser);
        localStorage.setItem('octal_auth_token', token);
        localStorage.setItem('octal_auth_user', returnedUser);
      }
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

      {/* ── Suspended Account / Workspace Contact Admin Modal ── */}
      {suspendedInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-[#0b0e14] border border-amber-500/40 rounded-2xl p-6 sm:p-7 shadow-2xl max-w-lg w-full text-slate-100 space-y-5 relative">
            <button
              type="button"
              onClick={() => {
                setSuspendedInfo(null);
                setReactivateSuccess(false);
                setReactivateError(null);
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header Icon + Title */}
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0 shadow-lg shadow-amber-500/10">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div className="min-w-0 pr-6">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg font-bold text-white tracking-wide">
                    Workspace Suspended
                  </h3>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 font-mono">
                    Access Paused
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  This workspace or account is currently paused by the platform administrator.
                </p>
              </div>
            </div>

            {/* Context Details Card */}
            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2 text-xs">
              {suspendedInfo.tenantName && (
                <div className="flex items-center justify-between text-slate-300">
                  <span className="text-slate-400 font-medium">Workspace:</span>
                  <span className="font-bold text-white truncate max-w-[240px]">{suspendedInfo.tenantName}</span>
                </div>
              )}
              {suspendedInfo.email && (
                <div className="flex items-center justify-between text-slate-300">
                  <span className="text-slate-400 font-medium">Account Email:</span>
                  <span className="font-mono font-semibold text-amber-400 truncate max-w-[240px]">{suspendedInfo.email}</span>
                </div>
              )}
              <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-800/80 leading-relaxed">
                {suspendedInfo.message || 'Users associated with this workspace cannot log in or make calls until it is reactivated by the administrator.'}
              </div>
            </div>

            {reactivateSuccess ? (
              /* Success confirmation view */
              <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-200 text-xs space-y-3">
                <div className="flex items-center gap-2 font-bold text-sm text-emerald-400">
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                  <span>Reactivation Request Submitted!</span>
                </div>
                <p className="text-slate-300 leading-relaxed">
                  The platform administrator has been notified. We will review your account and contact you at <strong className="text-white">{reactivateEmail}</strong>.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSuspendedInfo(null);
                    setReactivateSuccess(false);
                  }}
                  className="w-full mt-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-2.5 rounded-xl transition cursor-pointer"
                >
                  Return to Sign In
                </button>
              </div>
            ) : (
              /* Interactive Contact Form */
              <form onSubmit={handleSendReactivationRequest} className="space-y-3.5">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
                  <span>Contact Administrator to Reactivate</span>
                </div>

                {reactivateError && (
                  <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>{reactivateError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">Your Name</label>
                    <input
                      type="text"
                      value={reactivateName}
                      onChange={(e) => setReactivateName(e.target.value)}
                      placeholder="e.g. John Doe"
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">Your Email</label>
                    <input
                      type="email"
                      required
                      value={reactivateEmail}
                      onChange={(e) => setReactivateEmail(e.target.value)}
                      placeholder="e.g. user@gmail.com"
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-amber-500 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Message to Administrator</label>
                  <textarea
                    rows={3}
                    required
                    value={reactivateMessage}
                    onChange={(e) => setReactivateMessage(e.target.value)}
                    placeholder="Describe your request..."
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-amber-500 resize-none"
                  />
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={reactivateSubmitting}
                    className="w-full sm:flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs py-2.5 rounded-xl transition shadow-lg shadow-amber-500/20 disabled:opacity-50 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{reactivateSubmitting ? 'Sending Request...' : 'Send Reactivation Request'}</span>
                  </button>

                  <a
                    href={`mailto:blazingsoul451@gmail.com?subject=${encodeURIComponent(`Workspace Reactivation Request - ${suspendedInfo.email || ''}`)}&body=${encodeURIComponent(`Hello Administrator,\n\nOur workspace account (${suspendedInfo.tenantName || 'Workspace'}) associated with email ${suspendedInfo.email || reactivateEmail} was suspended.\n\nWe would like to request account reactivation.\n\nMessage: ${reactivateMessage}`)}`}
                    className="w-full sm:w-auto px-3.5 py-2.5 rounded-xl border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition text-center cursor-pointer"
                    title="Send Email Directly"
                  >
                    <Mail className="w-3.5 h-3.5 text-amber-400" />
                    <span>Direct Email</span>
                  </a>
                </div>
              </form>
            )}

            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
              <span>Admin contact: <span className="font-mono text-slate-300">blazingsoul451@gmail.com</span></span>
              <button
                type="button"
                onClick={() => {
                  setSuspendedInfo(null);
                  setReactivateSuccess(false);
                }}
                className="text-amber-400 hover:underline cursor-pointer"
              >
                Sign in with another account
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
              {/* Email Address */}
              <div className="mb-4">
                <label className="block text-sm font-normal text-gray-800 mb-1.5">
                  Email Address
                </label>
                <input
                  id="login-username"
                  name="email"
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="name@company.com"
                  autoComplete="email"
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

              {/* Quick Fill Testing shortcuts (DEV ONLY) */}
              {import.meta.env.DEV && (
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
              )}

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
                  name="organization"
                  type="text"
                  autoComplete="organization"
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
                    name="given-name"
                    type="text"
                    autoComplete="given-name"
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
                    name="family-name"
                    type="text"
                    autoComplete="family-name"
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
                    name="email"
                    type="email"
                    autoComplete="email"
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
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
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
                  <div className="relative flex gap-1.5" ref={countryPickerRef}>
                    {/* Custom Styled Country Dropdown Trigger */}
                    <button
                      type="button"
                      id="register-country-trigger"
                      onClick={() => setIsCountryPickerOpen(!isCountryPickerOpen)}
                      className="w-[115px] shrink-0 h-[38px] px-2.5 rounded-[4px] border border-gray-300 bg-white hover:bg-amber-50/50 hover:border-amber-500 transition-all flex items-center justify-between text-xs cursor-pointer shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30 select-none"
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="px-1.5 py-0.5 rounded bg-slate-950 text-amber-400 font-mono font-bold text-[10px]">
                          {currentCountry.iso}
                        </span>
                        <span className="font-bold text-slate-900 text-[13px]">
                          {currentCountry.code || 'Other'}
                        </span>
                      </div>
                      <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${isCountryPickerOpen ? 'rotate-180 text-amber-600' : ''}`} />
                    </button>

                    {/* Popover Dropdown Panel */}
                    {isCountryPickerOpen && (
                      <div className="absolute top-[42px] left-0 z-50 w-[290px] bg-white border border-slate-200 rounded-xl shadow-2xl p-2.5 text-left animate-in fade-in-50 duration-150">
                        {/* Search Input */}
                        <div className="relative mb-2">
                          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                          <input
                            type="text"
                            value={countrySearchQuery}
                            onChange={e => setCountrySearchQuery(e.target.value)}
                            placeholder="Search country or code..."
                            className="w-full pl-9 pr-3 py-2 text-xs font-medium bg-slate-50 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-400/20 transition-all"
                            autoFocus
                          />
                        </div>

                        {/* List of Countries */}
                        <div className="max-h-[210px] overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                          {filteredCountries.length === 0 ? (
                            <div className="p-4 text-center text-xs text-slate-500 font-medium">
                              No matching countries found
                            </div>
                          ) : (
                            filteredCountries.map((c, i) => {
                              const isSelected = c.code === countryCode;
                              return (
                                <button
                                  key={i}
                                  type="button"
                                  onClick={() => {
                                    setCountryCode(c.code);
                                    setIsCountryPickerOpen(false);
                                    setCountrySearchQuery('');
                                  }}
                                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-all cursor-pointer ${
                                    isSelected
                                      ? 'bg-amber-500 text-slate-950 font-extrabold shadow-sm'
                                      : 'text-slate-800 hover:bg-slate-100 hover:text-slate-950'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 truncate">
                                    <span className={`px-1.5 py-0.5 rounded font-mono font-bold text-[10px] ${
                                      isSelected
                                        ? 'bg-slate-950 text-amber-400'
                                        : 'bg-slate-200/80 text-slate-700'
                                    }`}>
                                      {c.iso}
                                    </span>
                                    <span className={`truncate text-[13px] ${isSelected ? 'font-black text-slate-950' : 'font-semibold text-slate-900'}`}>
                                      {c.name}
                                    </span>
                                  </div>
                                  <span className={`font-mono text-xs shrink-0 ml-2 ${isSelected ? 'text-slate-950 font-black' : 'text-slate-500 font-bold'}`}>
                                    {c.code}
                                  </span>
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}

                    <input
                      id="register-mobile"
                      name="tel"
                      type="tel"
                      autoComplete="tel"
                      value={mobile}
                      onChange={e => setMobile(e.target.value)}
                      placeholder="328 8144064"
                      required
                      className="flex-1 min-w-0 px-3 h-[38px] rounded-[4px] border border-gray-300 text-gray-800 text-sm placeholder-gray-400 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-400/30 transition-all shadow-sm"
                    />
                  </div>
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

