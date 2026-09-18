import http from 'http';
import https from 'https';
import tls from 'tls';
import dns from 'dns';
import net from 'net';

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfError';
  }
}

/**
 * Checks whether an IPv4 numeric representation falls into a private/reserved subnet.
 */
export function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(p => parseInt(p, 10));
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
    return true; // Malformed IPv4 treated as unsafe
  }

  const [b0, b1, b2, b3] = parts;

  // 0.0.0.0/8 (Broadcast/Current network)
  if (b0 === 0) return true;

  // 10.0.0.0/8 (Private)
  if (b0 === 10) return true;

  // 100.64.0.0/10 (Carrier-grade NAT)
  if (b0 === 100 && b1 >= 64 && b1 <= 127) return true;

  // 127.0.0.0/8 (Loopback)
  if (b0 === 127) return true;

  // 169.254.0.0/16 (Link-Local, AWS/GCP/Azure Metadata: 169.254.169.254)
  if (b0 === 169 && b1 === 254) return true;

  // 172.16.0.0/12 (Private)
  if (b0 === 172 && b1 >= 16 && b1 <= 31) return true;

  // 192.0.0.0/24 (IETF assignments)
  if (b0 === 192 && b1 === 0 && b2 === 0) return true;

  // 192.0.2.0/24 (TEST-NET-1)
  if (b0 === 192 && b1 === 0 && b2 === 2) return true;

  // 192.88.99.0/24 (6to4 Relay)
  if (b0 === 192 && b1 === 88 && b2 === 99) return true;

  // 192.168.0.0/16 (Private)
  if (b0 === 192 && b1 === 168) return true;

  // 198.18.0.0/15 (Benchmark testing)
  if (b0 === 198 && (b1 === 18 || b1 === 19)) return true;

  // 198.51.100.0/24 (TEST-NET-2)
  if (b0 === 198 && b1 === 51 && b2 === 100) return true;

  // 203.0.113.0/24 (TEST-NET-3)
  if (b0 === 203 && b1 === 0 && b2 === 113) return true;

  // 224.0.0.0/4 (Multicast)
  if (b0 >= 224 && b0 <= 239) return true;

  // 240.0.0.0/4 (Reserved / Future use)
  if (b0 >= 240) return true;

  // 255.255.255.255 (Broadcast)
  if (b0 === 255 && b1 === 255 && b2 === 255 && b3 === 255) return true;

  return false;
}

/**
 * Robust parser for IPv6 addresses converting any valid representation into 8 16-bit words.
 * Strips brackets, expands '::' zero compression, and handles embedded IPv4 dotted-quads.
 */
export function parseIPv6Words(ip: string): number[] | null {
  const clean = ip.replace(/^\[|\]$/g, '').trim().toLowerCase();
  if (!clean || clean.includes(':::')) return null;

  // Check for embedded IPv4 at the end (e.g. ::ffff:192.168.1.1 or 64:ff9b::127.0.0.1)
  let ipv4Words: number[] = [];
  let v6Part = clean;

  const lastColon = clean.lastIndexOf(':');
  if (lastColon !== -1 && clean.slice(lastColon + 1).includes('.')) {
    const v4Str = clean.slice(lastColon + 1);
    const v4Parts = v4Str.split('.').map(p => parseInt(p, 10));
    if (v4Parts.length !== 4 || v4Parts.some(p => isNaN(p) || p < 0 || p > 255)) {
      return null;
    }
    ipv4Words = [
      ((v4Parts[0] << 8) | v4Parts[1]) >>> 0,
      ((v4Parts[2] << 8) | v4Parts[3]) >>> 0
    ];
    v6Part = clean.slice(0, lastColon);
  }

  const parts = v6Part.split('::');
  if (parts.length > 2) return null; // Only one '::' permitted

  const neededV6Words = 8 - ipv4Words.length;

  if (parts.length === 1) {
    // No compression
    const hexGroups = parts[0].split(':').filter(Boolean);
    if (hexGroups.length !== neededV6Words) return null;
    const words: number[] = [];
    for (const h of hexGroups) {
      if (!/^[0-9a-f]{1,4}$/i.test(h)) return null;
      words.push(parseInt(h, 16));
    }
    return [...words, ...ipv4Words];
  } else {
    // Compression with '::'
    const leftGroups = parts[0] ? parts[0].split(':').filter(Boolean) : [];
    const rightGroups = parts[1] ? parts[1].split(':').filter(Boolean) : [];

    for (const h of [...leftGroups, ...rightGroups]) {
      if (!/^[0-9a-f]{1,4}$/i.test(h)) return null;
    }

    const leftWords = leftGroups.map(h => parseInt(h, 16));
    const rightWords = rightGroups.map(h => parseInt(h, 16));
    const missingCount = neededV6Words - (leftWords.length + rightWords.length);
    if (missingCount < 0) return null;

    const zeros = new Array(missingCount).fill(0);
    return [...leftWords, ...zeros, ...rightWords, ...ipv4Words];
  }
}

/**
 * Checks parsed 128-bit IPv6 words against private, reserved, loopback, and embedded IPv4 ranges.
 */
export function isPrivateIPv6FromWords(w: number[]): boolean {
  if (!w || w.length !== 8) return true;

  // Loopback (::1)
  if (w[0] === 0 && w[1] === 0 && w[2] === 0 && w[3] === 0 && w[4] === 0 && w[5] === 0 && w[6] === 0 && w[7] === 1) {
    return true;
  }

  // Unspecified (::)
  if (w.every(val => val === 0)) {
    return true;
  }

  // IPv4-mapped IPv6 (::ffff:0:0/96)
  if (w[0] === 0 && w[1] === 0 && w[2] === 0 && w[3] === 0 && w[4] === 0 && w[5] === 0xffff) {
    const ip4 = `${(w[6] >> 8) & 0xff}.${w[6] & 0xff}.${(w[7] >> 8) & 0xff}.${w[7] & 0xff}`;
    return isPrivateIPv4(ip4);
  }

  // IPv4-compatible IPv6 (::0:0/96, deprecated)
  if (w[0] === 0 && w[1] === 0 && w[2] === 0 && w[3] === 0 && w[4] === 0 && w[5] === 0 && (w[6] !== 0 || w[7] > 1)) {
    const ip4 = `${(w[6] >> 8) & 0xff}.${w[6] & 0xff}.${(w[7] >> 8) & 0xff}.${w[7] & 0xff}`;
    return isPrivateIPv4(ip4);
  }

  // NAT64 Well-Known Prefix (64:ff9b::/96)
  if (w[0] === 0x0064 && w[1] === 0xff9b && w[2] === 0 && w[3] === 0 && w[4] === 0 && w[5] === 0) {
    const ip4 = `${(w[6] >> 8) & 0xff}.${w[6] & 0xff}.${(w[7] >> 8) & 0xff}.${w[7] & 0xff}`;
    return isPrivateIPv4(ip4);
  }

  // Unique Local Address fc00::/7 (fc00... or fd00...)
  if ((w[0] & 0xfe00) === 0xfc00) {
    return true;
  }

  // Link-Local Unicast fe80::/10 (fe80... to febf...)
  if ((w[0] & 0xffc0) === 0xfe80) {
    return true;
  }

  // Multicast ff00::/8
  if ((w[0] & 0xff00) === 0xff00) {
    return true;
  }

  // Discard Prefix 100::/64
  if (w[0] === 0x0100 && w[1] === 0 && w[2] === 0 && w[3] === 0) {
    return true;
  }

  // Documentation 2001:db8::/32
  if (w[0] === 0x2001 && w[1] === 0x0db8) {
    return true;
  }

  // Benchmarking 2001:2::/48
  if (w[0] === 0x2001 && w[1] === 0x0002 && w[2] === 0) {
    return true;
  }

  return false;
}

export function isPrivateOrBlockedIP(ip: string): boolean {
  const clean = ip.replace(/^\[|\]$/g, '').trim();
  const family = net.isIP(clean);
  if (family === 4) {
    return isPrivateIPv4(clean);
  }
  if (family === 6) {
    const words = parseIPv6Words(clean);
    return words ? isPrivateIPv6FromWords(words) : true;
  }
  // Fallback parse attempt
  const words = parseIPv6Words(clean);
  if (words) {
    return isPrivateIPv6FromWords(words);
  }
  // Malformed / unclassified IP treated as unsafe
  return true;
}

/**
 * Validates a candidate URL string against SSRF attack vectors.
 * Rejects credentials in URL, unsupported protocols, and private hostnames/IPs.
 * Strips and normalizes IPv6 bracketed literals ([::1], [::ffff:127.0.0.1]).
 */
export function validateUrlForSsrf(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch (err) {
    throw new SsrfError(`Invalid URL format: ${rawUrl}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SsrfError(`Blocked protocol '${parsed.protocol}'. Only http: and https: are permitted.`);
  }

  if (parsed.username || parsed.password) {
    throw new SsrfError(`Embedded credentials in URL are forbidden.`);
  }

  const hostname = parsed.hostname.toLowerCase().trim();
  const cleanHost = hostname.replace(/^\[|\]$/g, '').trim();
  if (!cleanHost) {
    throw new SsrfError('Missing hostname.');
  }

  // Block localhost and standard loopback hostnames
  if (
    cleanHost === 'localhost' ||
    cleanHost.endsWith('.localhost') ||
    cleanHost.endsWith('.local') ||
    cleanHost.endsWith('.internal')
  ) {
    throw new SsrfError(`Blocked private host name '${hostname}'.`);
  }

  // If hostname is directly a literal IP address (IPv4 or IPv6 with/without brackets)
  if (net.isIP(cleanHost) || parseIPv6Words(cleanHost) !== null) {
    if (isPrivateOrBlockedIP(cleanHost)) {
      throw new SsrfError(`Destination IP ${hostname} is in a private/blocked subnet.`);
    }
  }

  // Port restrictions: permit standard web ports or standard non-privileged ports
  const port = parsed.port ? parseInt(parsed.port, 10) : (parsed.protocol === 'https:' ? 443 : 80);
  if (isNaN(port) || port <= 0 || port > 65535) {
    throw new SsrfError(`Invalid port '${parsed.port}'.`);
  }
  // Block common internal infrastructure ports (SSH, Redis, DBs, internal management)
  const blockedPorts = new Set([22, 23, 25, 110, 143, 389, 445, 1433, 1521, 3306, 5432, 6379, 11211, 27017, 28017]);
  if (blockedPorts.has(port)) {
    throw new SsrfError(`Target port ${port} is restricted.`);
  }

  return parsed;
}

/**
 * Custom DNS lookup function that resolves hostnames and validates that
 * EVERY returned IP address is a public, non-private IP.
 * Passed to http.Agent / https.Agent to prevent DNS rebinding (TOCTOU).
 */
export function createSafeLookup(): (
  hostname: string,
  options: dns.LookupOptions,
  callback: (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void
) => void {
  return (hostname, options, callback) => {
    const cleanHost = hostname.replace(/^\[|\]$/g, '').trim();

    // If hostname is an IP string, validate directly
    if (net.isIP(cleanHost) || parseIPv6Words(cleanHost) !== null) {
      if (isPrivateOrBlockedIP(cleanHost)) {
        return callback(new SsrfError(`Direct IP ${hostname} is private/blocked`), '', 4);
      }
      return callback(null, cleanHost, net.isIP(cleanHost) || 6);
    }

    dns.lookup(cleanHost, { all: true }, (err, addresses) => {
      if (err) return callback(err, '', 4);
      if (!addresses || addresses.length === 0) {
        return callback(new SsrfError(`DNS returned no addresses for ${hostname}`), '', 4);
      }

      for (const entry of addresses) {
        if (isPrivateOrBlockedIP(entry.address)) {
          return callback(
            new SsrfError(`SSRF blocked: ${hostname} resolved to private/blocked IP ${entry.address}`),
            '',
            4
          );
        }
      }

      // Safe: return the first validated address
      const chosen = addresses[0];
      if (options && (options as any).all) {
        callback(null, addresses);
      } else {
        callback(null, chosen.address, chosen.family);
      }
    });
  };
}

/**
 * Creates preconfigured SSRF-safe HTTP and HTTPS agents with strict TLS, custom DNS lookup,
 * and transport-layer socket intercept preventing direct TCP connections to private IPs.
 */
export function createSafeAgents(): { httpAgent: http.Agent; httpsAgent: https.Agent } {
  const safeLookup = createSafeLookup();

  function verifyHostBeforeConnect(rawHost: string) {
    const clean = String(rawHost || '').replace(/^\[|\]$/g, '').trim();
    if (net.isIP(clean) || parseIPv6Words(clean) !== null) {
      if (isPrivateOrBlockedIP(clean)) {
        throw new SsrfError(`Direct transport connection to blocked IP ${rawHost} aborted`);
      }
    }
  }

  const httpAgent = new http.Agent({
    keepAlive: false,
    maxSockets: 8,
    lookup: safeLookup as any
  });

  // Transport intercept for HTTP
  const origHttpCreateConn = httpAgent.createConnection.bind(httpAgent);
  httpAgent.createConnection = function (options: any, oncreate?: any) {
    verifyHostBeforeConnect(options.host || options.hostname);
    return origHttpCreateConn(options, oncreate);
  };

  const httpsAgent = new https.Agent({
    keepAlive: false,
    maxSockets: 8,
    rejectUnauthorized: true, // Strict TLS verification
    lookup: safeLookup as any
  });

  // Transport intercept for HTTPS
  const origHttpsCreateConn = httpsAgent.createConnection.bind(httpsAgent);
  httpsAgent.createConnection = function (options: any, oncreate?: any) {
    verifyHostBeforeConnect(options.host || options.hostname);
    return origHttpsCreateConn(options, oncreate);
  };

  return { httpAgent, httpsAgent };
}
