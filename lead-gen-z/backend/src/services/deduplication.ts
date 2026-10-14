import { localDb, Prospect } from './localDb';

export function normalizeEmail(email?: string): string {
  if (!email) return '';
  return email.trim().toLowerCase();
}

export function normalizePhoneDigits(phone?: string): string {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
}

export function extractDomain(url?: string): string {
  if (!url) return '';
  let clean = url.trim().toLowerCase();
  clean = clean.replace(/^https?:\/\//, '').replace(/^www\./, '');
  return clean.split('/')[0].split('?')[0];
}

export interface DedupeResult {
  status: 'NEW' | 'ALREADY SENT TO ZESTIFY' | 'ALREADY SAVED' | 'POSSIBLE DUPLICATE';
  reason?: string;
  matchedProspectId?: string;
}

export function evaluateDeduplication(candidate: Partial<Prospect>, existingProspects?: Prospect[]): DedupeResult {
  const settings = localDb.getSettings();
  const pool = existingProspects || localDb.getProspects();

  const cEmail = normalizeEmail(candidate.email);
  const cPhoneDigits = normalizePhoneDigits(candidate.phone);
  const cDomain = extractDomain(candidate.website);
  const cName = (candidate.name || '').trim().toLowerCase();

  for (const p of pool) {
    const pEmail = normalizeEmail(p.email);
    const pPhoneDigits = normalizePhoneDigits(p.phone);
    const pDomain = extractDomain(p.website);
    const pName = (p.name || '').trim().toLowerCase();

    // 1. Exact Email Match
    if (settings.dedupeMatchEmail && cEmail && pEmail && cEmail === pEmail) {
      if (p.sentToZestify) {
        return { status: 'ALREADY SENT TO ZESTIFY', reason: `Matches sent lead by email: ${p.email}`, matchedProspectId: p.id };
      }
      if (p.saved) {
        return { status: 'ALREADY SAVED', reason: `Matches saved lead by email: ${p.email}`, matchedProspectId: p.id };
      }
      return { status: 'POSSIBLE DUPLICATE', reason: `Duplicate email detected: ${p.email}`, matchedProspectId: p.id };
    }

    // 2. Exact or Suffix Phone Match (min 7 digits)
    if (settings.dedupeMatchPhone && cPhoneDigits.length >= 7 && pPhoneDigits.length >= 7) {
      const cSuffix = cPhoneDigits.slice(-8);
      const pSuffix = pPhoneDigits.slice(-8);
      if (cPhoneDigits === pPhoneDigits || (cSuffix.length >= 7 && cSuffix === pSuffix)) {
        if (p.sentToZestify) {
          return { status: 'ALREADY SENT TO ZESTIFY', reason: `Matches sent lead by phone: ${p.phone}`, matchedProspectId: p.id };
        }
        if (p.saved) {
          return { status: 'ALREADY SAVED', reason: `Matches saved lead by phone: ${p.phone}`, matchedProspectId: p.id };
        }
        return { status: 'POSSIBLE DUPLICATE', reason: `Matching phone digits: ${p.phone}`, matchedProspectId: p.id };
      }
    }

    // 3. Domain Match
    if (settings.dedupeMatchDomain && cDomain && pDomain && cDomain === pDomain) {
      if (p.sentToZestify) {
        return { status: 'ALREADY SENT TO ZESTIFY', reason: `Matches website domain: ${pDomain}`, matchedProspectId: p.id };
      }
      if (p.saved) {
        return { status: 'ALREADY SAVED', reason: `Matches saved website: ${pDomain}`, matchedProspectId: p.id };
      }
      return { status: 'POSSIBLE DUPLICATE', reason: `Duplicate company domain: ${pDomain}`, matchedProspectId: p.id };
    }

    // 4. Name Match
    if (settings.dedupeMatchNameAddress && cName && pName && cName.length > 5 && cName === pName) {
      return { status: 'POSSIBLE DUPLICATE', reason: `Matching business name: "${p.name}"`, matchedProspectId: p.id };
    }
  }

  return { status: 'NEW' };
}
