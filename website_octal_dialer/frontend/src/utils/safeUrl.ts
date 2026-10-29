/**
 * safeUrl.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Guards for URLs that originate outside our own UI — scraped business
 * listings, harvested Facebook group links, values typed by a user.
 *
 * Rendering such a value straight into an `href` allows a `javascript:` (or
 * `data:`) URL to execute in the context of the dashboard the moment someone
 * clicks it. These helpers reduce anything that is not plain http(s) to a
 * harmless value.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Schemes we are willing to put in an anchor's href. */
const SAFE_PROTOCOLS = ['http:', 'https:', 'mailto:', 'tel:'];

/** Control characters can smuggle a broken-up "java\nscript:" past a check. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

/**
 * Return the URL when it is safe to link to, otherwise `undefined` so the
 * anchor renders inert instead of carrying an executable scheme.
 */
export function safeExternalHref(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;

  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (CONTROL_CHARS.test(trimmed)) return undefined;

  // Bare domains ("example.com/page") are common in scraped data.
  const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(candidate);
    return SAFE_PROTOCOLS.includes(parsed.protocol) ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** True when the value can be linked to safely. */
export function isSafeExternalHref(raw: unknown): boolean {
  return safeExternalHref(raw) !== undefined;
}
