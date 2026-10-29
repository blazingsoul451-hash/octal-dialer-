/**
 * services/redirectGuard.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Guards against open redirects on endpoints that take a destination from the
 * request.
 *
 * Two different problems, two different answers:
 *
 *  - OAuth `returnUrl` should only ever come back to one of our own origins,
 *    so it is checked against the CORS allowlist.
 *  - Email click-tracking legitimately forwards to arbitrary customer landing
 *    pages, so an allowlist cannot apply. Instead every tracked link carries an
 *    HMAC over (token, url) and the redirector refuses anything it did not
 *    mint itself.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import crypto from 'crypto';

/** Protocol-relative and backslash forms that browsers normalise to a host. */
const OFF_ORIGIN_RELATIVE = /^\/[\\/]/;

/**
 * Build a redirect guard bound to an origin allowlist.
 *
 * Returns `fallback` for anything that is not a same-origin relative path or
 * an absolute http(s) URL on an allowed origin.
 */
export function makeSafeRedirectTarget(
  isOriginAllowed: (origin: string | undefined) => boolean
): (candidate: string | undefined | null, fallback: string) => string {
  return function safeRedirectTarget(candidate: string | undefined | null, fallback: string): string {
    if (!candidate) return fallback;

    const raw = String(candidate).trim();
    if (!raw) return fallback;

    // Relative paths are same-origin by definition, but "//evil.com" and
    // "/\evil.com" are not relative at all.
    if (raw.startsWith('/')) {
      return OFF_ORIGIN_RELATIVE.test(raw) ? fallback : raw;
    }

    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      return fallback;
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return fallback;
    if (!isOriginAllowed(parsed.origin)) return fallback;
    return parsed.toString();
  };
}

/** Deterministic, truncated HMAC binding a tracking token to its destination. */
export function signTrackedUrl(secret: string, trackingToken: string, targetUrl: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(`${trackingToken}\n${targetUrl}`)
    .digest('base64url')
    .slice(0, 32);
}

/** Constant-time check that we are the ones who generated this tracked link. */
export function isTrackedUrlSignatureValid(
  secret: string,
  trackingToken: string,
  targetUrl: string,
  signature: string | undefined | null
): boolean {
  if (!signature) return false;

  const expected = Buffer.from(signTrackedUrl(secret, trackingToken, targetUrl));
  const provided = Buffer.from(String(signature));
  if (expected.length !== provided.length) return false;
  return crypto.timingSafeEqual(expected, provided);
}
