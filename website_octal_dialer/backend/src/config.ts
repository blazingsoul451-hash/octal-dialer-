/**
 * Centralized Configuration & Production Environment Validation (Phase 10 & 11)
 *
 * Enforces fail-fast startup on missing/weak secrets in production,
 * provides secure defaults for development/test, and centralizes config.
 */

import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../.env') });

export interface AppConfig {
  nodeEnv: string;
  isProduction: boolean;
  isTest: boolean;
  port: number;
  jwtSecret: string;
  webhookSecret: string;
  sessionTtlHours: number;
  corsAllowedOrigins: string[];
  dbPath: string;
  trustProxy: string | boolean | number;
  googleClientId: string;
  googleClientSecret: string;
  googleRedirectUri: string;
  microsoftClientId: string;
  microsoftClientSecret: string;
  yahooClientId: string;
  yahooClientSecret: string;
  captchaSiteKey: string;
  captchaSecretKey: string;
  emailProvider: string;
  emailFrom: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassword: string;
  smtpSecure: boolean;
}

function loadConfig(): AppConfig {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';
  const isTest = nodeEnv === 'test';

  const port = parseInt(process.env.PORT || '3000', 10);
  const sessionTtlHours = parseInt(process.env.SESSION_TTL_HOURS || '24', 10);

  // JWT Secret validation
  let jwtSecret = process.env.JWT_SECRET || '';
  if (!jwtSecret) {
    if (isProduction) {
      throw new Error('FATAL: JWT_SECRET environment variable is required in production.');
    }
    jwtSecret = 'octal_dev_jwt_secret_minimum_32_characters_long_12345';
  } else if (isProduction && jwtSecret.length < 32) {
    throw new Error('FATAL: JWT_SECRET must be at least 32 characters in production.');
  }

  // Webhook Secret validation
  let webhookSecret = process.env.BILLING_WEBHOOK_SECRET || '';
  if (!webhookSecret) {
    if (isProduction) {
      throw new Error('FATAL: BILLING_WEBHOOK_SECRET environment variable is required in production.');
    }
    webhookSecret = 'octal_webhook_default_secret_change_me';
  } else if (isProduction && webhookSecret === 'octal_webhook_default_secret_change_me') {
    throw new Error('FATAL: Default BILLING_WEBHOOK_SECRET cannot be used in production.');
  }

  // CORS Allowed Origins
  const rawOrigins = process.env.ALLOWED_ORIGINS || process.env.CORS_ORIGIN || '';
  const corsAllowedOrigins = rawOrigins
    ? rawOrigins.split(',').map(s => s.trim()).filter(Boolean)
    : ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173', 'http://127.0.0.1:3000'];

  const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/octal_dialer.db');

  // Trust Proxy configuration (Phase 11): default false, configurable via TRUST_PROXY
  let trustProxy: string | boolean | number = false;
  if (process.env.TRUST_PROXY) {
    const tp = process.env.TRUST_PROXY.trim();
    if (tp === 'true' || tp === '1') trustProxy = 1;
    else if (tp === 'false' || tp === '0') trustProxy = false;
    else if (!isNaN(Number(tp))) trustProxy = Number(tp);
    else trustProxy = tp;
  }

  // Google OAuth configuration
  const googleClientId = process.env.GOOGLE_CLIENT_ID || '';
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  const googleRedirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback';

  // Microsoft OAuth configuration
  const microsoftClientId = process.env.MICROSOFT_CLIENT_ID || process.env.AZURE_CLIENT_ID || '';
  const microsoftClientSecret = process.env.MICROSOFT_CLIENT_SECRET || process.env.AZURE_CLIENT_SECRET || '';

  // Yahoo OAuth configuration
  const yahooClientId = process.env.YAHOO_CLIENT_ID || '';
  const yahooClientSecret = process.env.YAHOO_CLIENT_SECRET || '';

  // Cloudflare Turnstile / CAPTCHA configuration
  const captchaSiteKey = process.env.CAPTCHA_SITE_KEY || process.env.TURNSTILE_SITE_KEY || '';
  const captchaSecretKey = process.env.CAPTCHA_SECRET_KEY || process.env.TURNSTILE_SECRET_KEY || '';

  // Email / SMTP Dispatcher configuration
  const emailProvider = process.env.EMAIL_PROVIDER || 'smtp';
  const emailFrom = process.env.EMAIL_FROM || 'no-reply@octaldialer.com';
  const smtpHost = process.env.SMTP_HOST || '';
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
  const smtpUser = process.env.SMTP_USER || '';
  const smtpPassword = process.env.SMTP_PASSWORD || '';
  const smtpSecure = process.env.SMTP_SECURE === 'true' || smtpPort === 465;

  return {
    nodeEnv,
    isProduction,
    isTest,
    port,
    jwtSecret,
    webhookSecret,
    sessionTtlHours,
    corsAllowedOrigins,
    dbPath,
    trustProxy,
    googleClientId,
    googleClientSecret,
    googleRedirectUri,
    microsoftClientId,
    microsoftClientSecret,
    yahooClientId,
    yahooClientSecret,
    captchaSiteKey,
    captchaSecretKey,
    emailProvider,
    emailFrom,
    smtpHost,
    smtpPort,
    smtpUser,
    smtpPassword,
    smtpSecure
  };
}

export const config = loadConfig();
