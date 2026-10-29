/**
 * services/secretVault.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Envelope encryption for credentials at rest (AES-256-GCM).
 *
 * Protects values that are useless to us in plaintext but catastrophic in a
 * database dump: mailbox passwords, OAuth refresh/access tokens, and Facebook
 * session cookie jars.
 *
 * Stored format:  v1:<iv b64>:<authTag b64>:<ciphertext b64>
 *
 * Values that do not carry the `v1:` prefix are returned untouched by
 * `decryptSecret`, so rows written before this module existed keep working and
 * are transparently upgraded the next time they are saved.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import crypto from 'crypto';
import { config } from '../config';

const PREFIX = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;

let cachedKey: Buffer | null = null;

/** Derive (once) a stable 256-bit key from the configured secret material. */
function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  cachedKey = crypto.scryptSync(config.secretsKey, 'octal-secret-vault-v1', KEY_BYTES);
  return cachedKey;
}

/** True when a stored value is already in envelope form. */
export function isEncrypted(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(`${PREFIX}:`);
}

/**
 * Encrypt a secret for storage. Empty/absent values pass through as-is so that
 * optional columns stay NULL/'' instead of holding an encrypted empty string.
 */
export function encryptSecret(plain: string | null | undefined): string {
  if (plain === null || plain === undefined || plain === '') return plain ?? '';
  if (isEncrypted(plain)) return plain; // already sealed — never double-wrap

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [PREFIX, iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join(':');
}

/**
 * Decrypt a stored secret. Legacy plaintext is returned verbatim, and a value
 * that fails to authenticate returns '' rather than throwing, so one unreadable
 * row cannot take down a campaign run or an IMAP watcher.
 */
export function decryptSecret(stored: string | null | undefined): string {
  if (stored === null || stored === undefined || stored === '') return '';
  if (!isEncrypted(stored)) return String(stored); // pre-vault plaintext

  const parts = String(stored).split(':');
  if (parts.length !== 4) {
    console.warn('[SecretVault] Malformed envelope encountered; treating as empty.');
    return '';
  }

  try {
    const [, ivB64, tagB64, dataB64] = parts;
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
  } catch (err: any) {
    console.warn(`[SecretVault] Failed to decrypt secret: ${err.message}. Treating as empty.`);
    return '';
  }
}

/** Decrypt the credential-bearing columns of an email_accounts row in place. */
export function decryptEmailAccount<T extends Record<string, any>>(account: T | undefined): T | undefined {
  if (!account) return account;
  const out: Record<string, any> = { ...account };
  for (const field of ['password', 'refreshToken', 'accessToken']) {
    if (field in out) out[field] = decryptSecret(out[field]);
  }
  return out as T;
}

/** Decrypt a list of email_accounts rows. */
export function decryptEmailAccounts<T extends Record<string, any>>(accounts: T[]): T[] {
  return (accounts || []).map((a) => decryptEmailAccount(a) as T);
}
