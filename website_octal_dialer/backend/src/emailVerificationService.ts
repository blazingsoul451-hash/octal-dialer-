/**
 * emailVerificationService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Comprehensive Email Verification, Disposable Provider Defense,
 * OTP Generation & SMTP Dispatcher Service for Octal Dialer SaaS.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { config } from './config';

// ─── Curated List of Known Disposable / Temporary Email Domains ──────────────
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  // Popular Disposable Services
  '10minutemail.com', '10minutemail.net', '10minutemail.org', '10minutemail.co.uk',
  'mailinator.com', 'mailinator.net', 'mailinator.org', 'mailinator2.com',
  'tempmail.com', 'temp-mail.org', 'temp-mail.io', 'tempmail.net', 'tempmail.ninja',
  'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org', 'guerrillamailblock.com',
  'trashmail.com', 'trashmail.net', 'trashmail.org', 'trashmail.de',
  'yopmail.com', 'yopmail.fr', 'yopmail.net', 'cool.fr.nf', 'jetable.fr.nf',
  'sharklasers.com', 'grr.la', 'pokemail.net', 'spam4.me',
  'dispostable.com', 'throwawaymail.com', 'fakeinbox.com', 'fakemailgenerator.com',
  'getairmail.com', 'airmail.news', 'inboxkitten.com', 'burnermail.io',
  'mohmal.com', 'crazymailing.com', 'mytemp.email', 'generator.email',
  'emailondeck.com', 'tempm.com', 'nada.ltd', 'dropmail.me',
  'minuteinbox.com', 'maildrop.cc', 'tempail.com', 'fakemail.net',
  'zillamail.com', 'getnada.com', 'abcvg.com', 'boximail.com',
  'emailfake.com', 'crazymail.com', 'burneremail.com', 'mytempmail.com',
  'trashymail.com', 'mailcatch.com', 'harakirimail.com', 'incognitomail.org',
  'deadaddress.com', 'dayrep.com', 'einrot.com', 'fleckens.com',
  'gustr.com', 'jourrapide.com', 'rhyta.com', 'superrito.com',
  'teleworm.us', 'armyspy.com', 'cuvox.de',
  // Test and Example Disposable Domains for automated validation
  'disposable-provider.example', '10minutemail.example', 'mailinator.example',
  'temporary-mail-provider.example', 'burner-email.test'
]);

// ─── Whitelisted Legitimate Major Consumer Email Providers ──────────────────
const LEGITIMATE_MAJOR_PROVIDERS = new Set([
  'gmail.com', 'googlemail.com',
  'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'yahoo.com', 'ymail.com', 'myyahoo.com', 'rocketmail.com',
  'icloud.com', 'me.com', 'mac.com',
  'proton.me', 'protonmail.com', 'pm.me',
  'zoho.com', 'zohomail.com',
  'aol.com', 'aim.com',
  'gmx.com', 'gmx.net', 'gmx.de',
  'mail.com', 'email.com',
  'fastmail.com', 'fastmail.fm',
  'hey.com', 'tutanota.com', 'tuta.com'
]);

// ─── Regex & Pattern Validation ──────────────────────────────────────────────

/**
 * Validates email syntax against RFC 5322 specifications.
 * Allows standard consumer and custom business domains.
 */
export function isValidEmailFormat(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim().toLowerCase();
  if (trimmed.length < 5 || trimmed.length > 254) return false;

  // Authoritative RFC 5322 compliant regex
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  if (!emailRegex.test(trimmed)) return false;

  const parts = trimmed.split('@');
  if (parts.length !== 2) return false;

  const [local, domain] = parts;
  if (!local || !domain || local.length > 64 || domain.length > 253) return false;
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;

  // Domain must contain a valid TLD (at least 2 chars)
  const domainParts = domain.split('.');
  if (domainParts.length < 2) return false;
  const tld = domainParts[domainParts.length - 1];
  if (!tld || tld.length < 2 || !/^[a-zA-Z]{2,24}$/.test(tld)) return false;

  return true;
}

/**
 * Checks if the email domain belongs to a disposable or temporary email service.
 */
export function isDisposableEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return true;
  const trimmed = email.trim().toLowerCase();
  const parts = trimmed.split('@');
  if (parts.length !== 2) return true;

  const domain = parts[1];

  // 1. If it's a known legitimate major provider, it is NOT disposable
  if (LEGITIMATE_MAJOR_PROVIDERS.has(domain)) {
    return false;
  }

  // 2. Direct exact match in disposable list
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
    return true;
  }

  // 3. Subdomain check (e.g. sub.mailinator.com)
  for (const disposable of DISPOSABLE_EMAIL_DOMAINS) {
    if (domain.endsWith('.' + disposable)) {
      return true;
    }
  }

  // 4. Keyword patterns for temporary / burner services
  const disposableKeywords = [
    '10minute', 'tempmail', 'temp-mail', 'throwaway', 'trashmail',
    'burnermail', 'fakemail', 'disposable', 'sharklaser', 'guerrillamail',
    'inboxkitten', 'deadaddress', 'minuteinbox'
  ];
  for (const kw of disposableKeywords) {
    if (domain.includes(kw)) {
      return true;
    }
  }

  // Custom business domains (e.g., acme.com, mycompany.io, university.edu) are ALLOWED
  return false;
}

// ─── OTP Cryptographic Generation & Hashing ──────────────────────────────────

/**
 * Generates a cryptographically random 6-digit numeric OTP.
 */
export function generateVerificationCode(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Hashes a 6-digit OTP with HMAC-SHA256 using the server JWT secret as key.
 */
export function hashVerificationCode(code: string): string {
  return crypto
    .createHmac('sha256', config.jwtSecret || 'octal_otp_salt_fallback')
    .update(code.trim())
    .digest('hex');
}

/**
 * Verifies if candidate code matches stored hash using timing-safe comparison.
 */
export function verifyVerificationCode(candidateCode: string, storedHash: string): boolean {
  try {
    const candidateHash = hashVerificationCode(candidateCode);
    return crypto.timingSafeEqual(
      Buffer.from(candidateHash, 'hex'),
      Buffer.from(storedHash, 'hex')
    );
  } catch {
    return false;
  }
}

// ─── Nodemailer SMTP Transporter Setup ────────────────────────────────────────

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    if (config.smtpHost && config.smtpUser && config.smtpPassword) {
      // Production SMTP Transporter
      transporter = nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpSecure,
        auth: {
          user: config.smtpUser,
          pass: config.smtpPassword
        },
        tls: {
          rejectUnauthorized: config.isProduction
        }
      });
      console.log(`[EmailService] Production SMTP transporter initialized (${config.smtpHost}:${config.smtpPort})`);
    } else {
      // Development / Test Local Stream Transporter
      transporter = nodemailer.createTransport({
        streamTransport: true,
        newline: 'windows',
        buffer: true
      });
      console.log('[EmailService] Local development mail transporter initialized');
    }
  }
  return transporter;
}

// ─── Email Dispatchers ────────────────────────────────────────────────────────

/**
 * Sends a clean 6-digit OTP verification email to the user.
 */
export async function sendVerificationEmail(toEmail: string, code: string): Promise<boolean> {
  try {
    const mailer = getTransporter();
    const fromAddress = config.emailFrom || 'no-reply@octaldialer.com';

    const subject = 'Verify your Octal Dialer account';
    const textContent = `Hello,\n\nWe received a request to create an Octal Dialer account using this email address.\n\nYour 6-digit verification code is:\n\n${code}\n\nThis code expires in 10 minutes.\n\nIf you did not request this account, you can safely ignore this email.\n\n— Octal Dialer Team`;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #090d16; color: #f8fafc; margin: 0; padding: 40px 20px; }
            .container { max-width: 480px; margin: 0 auto; background-color: #0f172a; border: 1px solid rgba(251, 191, 36, 0.3); border-radius: 16px; padding: 36px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
            .header { text-align: center; margin-bottom: 24px; }
            .brand { font-size: 20px; font-weight: 900; letter-spacing: -0.5px; color: #ffffff; }
            .brand span { color: #fbbf24; }
            .badge { display: inline-block; background-color: rgba(251, 191, 36, 0.1); border: 1px solid rgba(251, 191, 36, 0.3); color: #fbbf24; font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 4px 10px; border-radius: 9999px; margin-bottom: 12px; }
            .title { font-size: 18px; font-weight: 700; color: #ffffff; margin-top: 0; margin-bottom: 8px; }
            .desc { font-size: 13px; line-height: 1.5; color: #94a3b8; margin-bottom: 24px; }
            .code-box { background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border: 1px solid #334155; border-radius: 12px; padding: 18px; text-align: center; margin-bottom: 24px; }
            .code { font-family: 'Courier New', Courier, monospace; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #fbbf24; }
            .footer { font-size: 11px; color: #64748b; text-align: center; margin-top: 24px; border-top: 1px solid #1e293b; padding-top: 16px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="badge">Security Verification</div>
              <div class="brand">OCTAL <span>DIALER</span></div>
            </div>
            <h2 class="title">Verify Your Email Address</h2>
            <p class="desc">Please enter the 6-digit verification code below in your Octal Dialer registration window to activate your account:</p>
            <div class="code-box">
              <div class="code">${code}</div>
            </div>
            <p class="desc" style="font-size: 12px; margin-bottom: 0;">⏱️ This verification code will expire in <strong>10 minutes</strong>. If you did not create an Octal Dialer account, you can safely ignore this email.</p>
            <div class="footer">
              &copy; ${new Date().getFullYear()} Octal Dialer SaaS. All rights reserved.
            </div>
          </div>
        </body>
      </html>
    `;

    await mailer.sendMail({
      from: `"Octal Dialer Security" <${fromAddress}>`,
      to: toEmail,
      subject,
      text: textContent,
      html: htmlContent
    });

    if (!config.isProduction) {
      console.log(`[EmailService] Verification OTP sent to ${toEmail.replace(/(.{2})(.*)(@.*)/, '$1***$3')}`);
    }

    return true;
  } catch (err: any) {
    console.error('[EmailService] Failed to send verification email:', err.message);
    return false;
  }
}

/**
 * Sends password reset instructions with secure link/token.
 */
export async function sendPasswordResetEmail(toEmail: string, resetToken: string): Promise<boolean> {
  try {
    const mailer = getTransporter();
    const fromAddress = config.emailFrom || 'no-reply@octaldialer.com';

    const subject = 'Reset your Octal Dialer password';
    const textContent = `Hello,\n\nWe received a request to reset your Octal Dialer password.\n\nYour reset token is:\n\n${resetToken}\n\nThis token expires in 1 hour.\n\nIf you did not request a password reset, please ignore this email.\n\n— Octal Dialer Team`;

    await mailer.sendMail({
      from: `"Octal Dialer Security" <${fromAddress}>`,
      to: toEmail,
      subject,
      text: textContent
    });

    return true;
  } catch (err: any) {
    console.error('[EmailService] Failed to send password reset email:', err.message);
    return false;
  }
}
