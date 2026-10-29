/**
 * utils/spreadsheetSafety.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Neutralise spreadsheet formula injection (CWE-1236) in exported data.
 *
 * Lead names, addresses and campaign names come from scraping and from customer
 * CSV imports, so a value like `=cmd|'/c calc'!A1` would be executed by Excel
 * when the export is opened. CSV quoting does not help — the leading operator
 * has to go.
 *
 * This lives in its own module with no side effects so both the API server and
 * the forked scraper worker can import it. (Importing it from scraperWorker.ts
 * would also register that module's IPC `message` listener in whichever process
 * pulled it in.)
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Characters Excel/Sheets treat as the start of a formula. */
const FORMULA_LEAD_IN = /^[=+\-@\t\r]/;

/** E.164 phone numbers legitimately start with '+' and must survive intact. */
const E164 = /^\+\d[\d\s\-()]{6,20}$/;

/**
 * Prefix a formula-leading value with an apostrophe so spreadsheet software
 * treats it as text. Non-strings and safe strings are returned unchanged.
 */
export function sanitizeSpreadsheetValue(val: any): any {
  if (typeof val !== 'string') return val;

  const trimmed = val.trim();
  if (FORMULA_LEAD_IN.test(val) || FORMULA_LEAD_IN.test(trimmed)) {
    if (E164.test(trimmed)) return trimmed;
    return `'${val}`;
  }
  return val;
}

/**
 * Render one CSV field: neutralise formulas, then quote and escape.
 */
export function csvField(value: unknown): string {
  const safe = sanitizeSpreadsheetValue(value === null || value === undefined ? '' : String(value));
  return `"${String(safe).replace(/"/g, '""')}"`;
}
