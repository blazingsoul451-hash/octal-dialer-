import http from 'http';
import https from 'https';
import zlib from 'zlib';
import { URL } from 'url';
import { validateUrlForSsrf, createSafeAgents, SsrfError } from './ssrfProtection';
import { EnrichedContactInfo } from './scraperTypes';

const MAX_HTTP_BODY_BYTES = 512 * 1024; // 512 KB raw payload ceiling
const MAX_DECOMPRESSED_BYTES = 1024 * 1024; // 1 MB decompression bomb guard
const DEFAULT_TIMEOUT_MS = 4000; // 4s hard timeout
const MAX_REDIRECTS = 3;

const JUNK_DOMAINS = new Set([
  'sentry.io', 'wix.com', 'wixpress.com', 'example.com', 'schema.org',
  'wordpress.org', 'wordpress.com', 'cloudflare.com', 'googleapis.com',
  'gstatic.com', 'google.com', 'gravatar.com', 'mysite.com', 'yourdomain.com'
]);

const IGNORED_EXTENSIONS = [
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico',
  '.css', '.js', '.woff', '.woff2', '.ttf', '.mp4', '.pdf'
];

export interface SafeFetchResult {
  statusCode: number;
  finalUrl: string;
  body: string;
  isBlocked: boolean;
}

/**
 * Performs an SSRF-safe, bounded, stream-safe HTTP/HTTPS GET request.
 */
export function safeHttpGet(
  targetUrl: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  redirectCount: number = 0,
  agents?: { httpAgent: http.Agent; httpsAgent: https.Agent }
): Promise<SafeFetchResult | null> {
  return new Promise((resolve) => {
    let resolved = false;
    const safeResolve = (val: SafeFetchResult | null) => {
      if (!resolved) {
        resolved = true;
        resolve(val);
      }
    };

    if (redirectCount > MAX_REDIRECTS) {
      return safeResolve(null);
    }

    let parsedUrl: URL;
    try {
      parsedUrl = validateUrlForSsrf(targetUrl);
    } catch (err) {
      // URL validation / SSRF check failed
      return safeResolve(null);
    }

    const { httpAgent, httpsAgent } = agents || createSafeAgents();
    const isHttps = parsedUrl.protocol === 'https:';
    const mod = isHttps ? https : http;
    const agent = isHttps ? httpsAgent : httpAgent;

    const req = mod.get(parsedUrl.href, {
      agent,
      timeout: timeoutMs,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 (Business Directory Crawler)',
        'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    }, (res) => {
      const statusCode = res.statusCode || 0;

      // Handle Redirects with re-validation
      if (statusCode >= 300 && statusCode < 400 && res.headers.location) {
        res.resume();
        try {
          const redirectUrl = new URL(res.headers.location, parsedUrl.href).href;
          safeHttpGet(redirectUrl, timeoutMs, redirectCount + 1, { httpAgent, httpsAgent }).then(safeResolve);
          return;
        } catch {
          return safeResolve(null);
        }
      }

      // Check for challenge / block status codes
      if (statusCode === 403 || statusCode === 429) {
        res.resume();
        return safeResolve({
          statusCode,
          finalUrl: parsedUrl.href,
          body: '',
          isBlocked: true
        });
      }

      if (statusCode !== 200) {
        res.resume();
        return safeResolve(null);
      }

      // Setup decompression with byte bounds
      const contentEncoding = (res.headers['content-encoding'] || '').toLowerCase();
      let stream: NodeJS.ReadableStream = res;
      if (contentEncoding === 'gzip') {
        stream = res.pipe(zlib.createGunzip());
      } else if (contentEncoding === 'deflate') {
        stream = res.pipe(zlib.createInflate());
      }

      let totalBytes = 0;
      let body = '';
      stream.setEncoding('utf-8');

      stream.on('data', (chunk: string) => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_DECOMPRESSED_BYTES) {
          req.destroy();
          safeResolve({
            statusCode,
            finalUrl: parsedUrl.href,
            body,
            isBlocked: false
          });
        } else {
          body += chunk;
        }
      });

      stream.on('end', () => {
        safeResolve({
          statusCode,
          finalUrl: parsedUrl.href,
          body,
          isBlocked: false
        });
      });

      stream.on('error', () => safeResolve(null));
      res.on('error', () => safeResolve(null));
    });

    req.on('timeout', () => {
      req.destroy();
      safeResolve(null);
    });

    req.on('error', () => safeResolve(null));
  });
}

/**
 * Extracts emails and social media links from raw HTML.
 */
export function extractContactsFromHtml(html: string, pageUrl: string): {
  emails: { email: string; method: 'mailto' | 'body_regex'; score: number }[];
  socials: EnrichedContactInfo['socialLinks'];
  description?: string;
} {
  const emailCandidates = new Map<string, { email: string; method: 'mailto' | 'body_regex'; score: number }>();
  const socials: EnrichedContactInfo['socialLinks'] = {};

  if (!html || typeof html !== 'string') {
    return { emails: [], socials };
  }

  // 1. Mailto links (Highest trust)
  const mailtoRegex = /mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4})/gi;
  let match: RegExpExecArray | null;
  while ((match = mailtoRegex.exec(html)) !== null) {
    const email = match[1].toLowerCase().trim();
    if (isValidEmail(email)) {
      emailCandidates.set(email, { email, method: 'mailto', score: 20 });
    }
  }

  // 2. Body regex scan (Conservative)
  const bodyEmailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,4}\b/g;
  while ((match = bodyEmailRegex.exec(html)) !== null) {
    const email = match[0].toLowerCase().trim();
    if (isValidEmail(email) && !emailCandidates.has(email)) {
      let score = 5;
      if (email.startsWith('info@') || email.startsWith('contact@') || email.startsWith('sales@') || email.startsWith('support@')) {
        score = 15;
      }
      emailCandidates.set(email, { email, method: 'body_regex', score });
    }
  }

  // 3. Social Media Links
  const fbMatch = html.match(/https?:\/\/(?:www\.)?facebook\.com\/([a-zA-Z0-9._-]+)\/?/i);
  if (fbMatch && !['sharer', 'share', 'dialog'].includes(fbMatch[1].toLowerCase())) {
    socials.facebook = fbMatch[0].split('"')[0].split("'")[0];
  }

  const instaMatch = html.match(/https?:\/\/(?:www\.)?instagram\.com\/([a-zA-Z0-9._-]+)\/?/i);
  if (instaMatch && !['p', 'explore', 'reel'].includes(instaMatch[1].toLowerCase())) {
    socials.instagram = instaMatch[0].split('"')[0].split("'")[0];
  }

  const liMatch = html.match(/https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in)\/([a-zA-Z0-9._-]+)\/?/i);
  if (liMatch) {
    socials.linkedin = liMatch[0].split('"')[0].split("'")[0];
  }

  const twMatch = html.match(/https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/([a-zA-Z0-9._-]+)\/?/i);
  if (twMatch && !['share', 'intent', 'privacy'].includes(twMatch[1].toLowerCase())) {
    socials.twitter = twMatch[0].split('"')[0].split("'")[0];
  }

  // 4. Meta Description
  let description: string | undefined;
  const metaDescMatch = html.match(/<meta\s+name=["']description["']\s+content=["'](.*?)["']/i);
  if (metaDescMatch && metaDescMatch[1]) {
    description = metaDescMatch[1].slice(0, 300).trim();
  }

  const sortedEmails = Array.from(emailCandidates.values()).sort((a, b) => b.score - a.score);

  return { emails: sortedEmails, socials, description };
}

function isValidEmail(email: string): boolean {
  if (!email || email.length < 5 || email.length > 100) return false;
  const parts = email.split('@');
  if (parts.length !== 2) return false;
  const domain = parts[1].toLowerCase();

  if (JUNK_DOMAINS.has(domain)) return false;
  for (const ext of IGNORED_EXTENSIONS) {
    if (email.endsWith(ext)) return false;
  }
  return true;
}

/**
 * High-level website enrichment orchestrator.
 * Visits homepage and at most 1 contact subpage.
 */
export async function enrichCompanyWebsite(websiteUrl: string): Promise<{
  contactInfo: EnrichedContactInfo;
  description?: string;
  status: 'enriched' | 'failed' | 'blocked';
}> {
  const result: EnrichedContactInfo = {
    emails: [],
    socialLinks: {},
    sources: []
  };

  if (!websiteUrl || websiteUrl === 'N/A') {
    return { contactInfo: result, status: 'failed' };
  }

  const agents = createSafeAgents();
  const homeResp = await safeHttpGet(websiteUrl, 4000, 0, agents);

  if (!homeResp) {
    return { contactInfo: result, status: 'failed' };
  }

  if (homeResp.isBlocked) {
    return { contactInfo: result, status: 'blocked' };
  }

  const homeContacts = extractContactsFromHtml(homeResp.body, homeResp.finalUrl);
  let description = homeContacts.description;

  for (const item of homeContacts.emails) {
    result.emails.push(item.email);
    result.sources.push({
      url: homeResp.finalUrl,
      method: item.method,
      extractedAt: new Date().toISOString()
    });
  }
  result.socialLinks = { ...homeContacts.socials };

  // If no email was found on homepage, try 1 candidate contact page
  if (result.emails.length === 0 && homeResp.body) {
    const contactPathMatch = homeResp.body.match(/href=["'](\/(?:contact|contact-us|about|about-us|reach-us)[^"'>\s]*)["']/i);
    if (contactPathMatch && contactPathMatch[1]) {
      try {
        const subUrl = new URL(contactPathMatch[1], homeResp.finalUrl).href;
        const subResp = await safeHttpGet(subUrl, 3000, 0, agents);
        if (subResp && !subResp.isBlocked) {
          const subContacts = extractContactsFromHtml(subResp.body, subResp.finalUrl);
          for (const item of subContacts.emails) {
            if (!result.emails.includes(item.email)) {
              result.emails.push(item.email);
              result.sources.push({
                url: subResp.finalUrl,
                method: item.method,
                extractedAt: new Date().toISOString()
              });
            }
          }
          result.socialLinks = { ...result.socialLinks, ...subContacts.socials };
        }
      } catch (_) {}
    }
  }

  return {
    contactInfo: result,
    description,
    status: result.emails.length > 0 || Object.keys(result.socialLinks).length > 0 ? 'enriched' : 'failed'
  };
}
