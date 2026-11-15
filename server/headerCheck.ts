import { lookup as dnsLookup } from 'node:dns';
import type { LookupAddress, LookupAllOptions, LookupOptions } from 'node:dns';
import http from 'node:http';
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http';
import https from 'node:https';
import { BlockList, isIP } from 'node:net';
import type { LiveCheck, LiveCheckError, ObservedHeaders } from '../src/domain/types.ts';
import { validateExampleUrl } from '../src/domain/validation.ts';

export const CHECK_PATH = '/api/header-check';
export const MAX_REDIRECTS = 5;
export const DEFAULT_TIMEOUT_MS = 8000;
const MAX_HEADER_LENGTH = 4000;
const MAX_BODY_BYTES = 4096;
const MAX_CONCURRENT = 2;
const USER_AGENT = 'Parapet header check (ISOM1400 teaching prototype)';

export type CheckError = Exclude<LiveCheckError, 'unavailable'>;

export class CheckFailure extends Error {
  readonly code: CheckError;
  constructor(code: CheckError) {
    super(code);
    this.code = code;
  }
}

const BLOCKED = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  BLOCKED.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
  ['2001::', 32],
  ['2001:db8::', 32],
  ['100::', 64],
] as const) {
  BLOCKED.addSubnet(network, prefix, 'ipv6');
}

function ipv6Bytes(address: string): number[] | null {
  let text = address.toLowerCase().split('%')[0]!;
  let tail: number[] = [];
  const dotted = /^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text);
  if (dotted) {
    tail = dotted[2]!.split('.').map(Number);
    if (tail.some((p) => p > 255)) return null;
    text = dotted[1]!.endsWith('::') ? dotted[1]! : dotted[1]!.slice(0, -1);
  }
  const groupsNeeded = tail.length ? 6 : 8;
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const split = (s: string) => (s ? s.split(':') : []);
  const head = split(halves[0]!);
  const rest = halves.length === 2 ? split(halves[1]!) : [];
  const fill = halves.length === 2 ? groupsNeeded - head.length - rest.length : 0;
  if (fill < 0) return null;
  const groups = [...head, ...Array<string>(fill).fill('0'), ...rest];
  if (groups.length !== groupsNeeded || !groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
  return [...groups.flatMap((g) => [parseInt(g, 16) >> 8, parseInt(g, 16) & 0xff]), ...tail];
}

/** Rejects loopback, private, link-local, shared, documentation and multicast ranges, including IPv4 embedded in IPv6. */
export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return BLOCKED.check(address, 'ipv4');
  if (family !== 6) return true;
  const bytes = ipv6Bytes(address);
  if (!bytes || bytes.length !== 16) return true;
  const v4 = (offset: number) => bytes.slice(offset, offset + 4).join('.');
  const zeros = (from: number, to: number) => bytes.slice(from, to).every((b) => b === 0);
  if (zeros(0, 10) && bytes[10] === 0xff && bytes[11] === 0xff) return isBlockedAddress(v4(12));
  if (zeros(0, 12)) return isBlockedAddress(v4(12));
  if (bytes[0] === 0x00 && bytes[1] === 0x64 && bytes[2] === 0xff && bytes[3] === 0x9b && zeros(4, 12)) {
    return isBlockedAddress(v4(12));
  }
  if (bytes[0] === 0x20 && bytes[1] === 0x02) return isBlockedAddress(v4(2));
  const canonical = Array.from({ length: 8 }, (_, i) => ((bytes[2 * i]! << 8) | bytes[2 * i + 1]!).toString(16)).join(':');
  return BLOCKED.check(canonical, 'ipv6');
}

export interface CheckPolicy {
  isBlockedAddress: (address: string) => boolean;
  /** `port` is the URL's explicit port, or '' for the scheme default. */
  isAllowedPort: (port: string) => boolean;
  timeoutMs: number;
}

export const DEFAULT_POLICY: CheckPolicy = {
  isBlockedAddress,
  isAllowedPort: (port) => port === '',
  timeoutMs: DEFAULT_TIMEOUT_MS,
};

/** Validates one hop. Called for the submitted address and again for every redirect target. */
export function validateTarget(raw: string, policy: CheckPolicy = DEFAULT_POLICY): URL {
  const error = validateExampleUrl(raw);
  if (error === 'urlCredentials') throw new CheckFailure('credentials');
  if (error === 'urlScheme') throw new CheckFailure('scheme');
  if (error) throw new CheckFailure('invalidUrl');
  const url = new URL(raw.trim());
  if (!policy.isAllowedPort(url.port)) throw new CheckFailure('port');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) && policy.isBlockedAddress(host)) throw new CheckFailure('blockedAddress');
  return url;
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/** DNS lookup used for the actual connection, so the address that is checked is the address that is dialled. */
function guardedLookup(policy: CheckPolicy) {
  return (hostname: string, options: LookupOptions | LookupAllOptions, callback: LookupCallback) => {
    dnsLookup(hostname, { all: true, verbatim: true, family: options.family }, (err, addresses) => {
      if (err) return callback(err, []);
      if (addresses.length === 0) {
        return callback(Object.assign(new Error('No address'), { code: 'ENOTFOUND' }), []);
      }
      if (addresses.some((a) => policy.isBlockedAddress(a.address))) {
        return callback(Object.assign(new Error('Blocked address'), { code: 'EBLOCKED' }), []);
      }
      if (options.all) return callback(null, addresses);
      return callback(null, addresses[0]!.address, addresses[0]!.family);
    });
  };
}

function mapError(err: unknown): CheckFailure {
  if (err instanceof CheckFailure) return err;
  const code = (err as NodeJS.ErrnoException)?.code ?? '';
  const name = (err as Error)?.name ?? '';
  if (code === 'EBLOCKED') return new CheckFailure('blockedAddress');
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || code === 'ENODATA') return new CheckFailure('dns');
  if (code === 'ETIMEDOUT' || name === 'TimeoutError' || name === 'AbortError' || code === 'ABORT_ERR') {
    return new CheckFailure('timeout');
  }
  if (/CERT|TLS|SSL|SELF_SIGNED|UNABLE_TO_VERIFY|HOSTNAME_MISMATCH/i.test(code)) return new CheckFailure('tls');
  return new CheckFailure('network');
}

function header(headers: IncomingHttpHeaders, name: string): string | null {
  const value = headers[name];
  if (value === undefined) return null;
  const text = (Array.isArray(value) ? value.join(', ') : value).trim();
  return text.slice(0, MAX_HEADER_LENGTH);
}

export function pickHeaders(headers: IncomingHttpHeaders): ObservedHeaders {
  return {
    hsts: header(headers, 'strict-transport-security'),
    csp: header(headers, 'content-security-policy'),
    cspReportOnly: header(headers, 'content-security-policy-report-only'),
    xcto: header(headers, 'x-content-type-options'),
    referrer: header(headers, 'referrer-policy'),
  };
}

function requestOnce(url: URL, policy: CheckPolicy, signal: AbortSignal) {
  const client = url.protocol === 'https:' ? https : http;
  return new Promise<{ status: number; headers: IncomingHttpHeaders }>((resolve, reject) => {
    const req = client.request(
      url,
      {
        method: 'GET',
        agent: false,
        lookup: guardedLookup(policy) as never,
        signal,
        headers: { 'user-agent': USER_AGENT, accept: 'text/html,*/*;q=0.8' },
      },
      (res: IncomingMessage) => {
        resolve({ status: res.statusCode ?? 0, headers: res.headers });
        res.destroy();
      },
    );
    req.on('error', reject);
    req.end();
  });
}

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

/** Fetches response headers only. Nothing from the body is read or returned. */
export async function checkHeaders(raw: string, policy: CheckPolicy = DEFAULT_POLICY): Promise<LiveCheck> {
  let url = validateTarget(raw, policy);
  const signal = AbortSignal.timeout(policy.timeoutMs);
  const requestedUrl = url.href;
  try {
    for (let redirects = 0; ; redirects += 1) {
      const { status, headers } = await requestOnce(url, policy, signal);
      const location = headers.location;
      if (REDIRECTS.has(status) && typeof location === 'string' && location) {
        if (redirects >= MAX_REDIRECTS) throw new CheckFailure('tooManyRedirects');
        let next: string;
        try {
          next = new URL(location, url).href;
        } catch {
          throw new CheckFailure('network');
        }
        url = validateTarget(next, policy);
        continue;
      }
      return {
        requestedUrl,
        finalUrl: url.href,
        status,
        redirects,
        checkedAt: new Date().toISOString(),
        headers: pickHeaders(headers),
      };
    }
  } catch (err) {
    throw mapError(err);
  }
}

const FAILURE_STATUS: Record<CheckError, number> = {
  badRequest: 400,
  invalidUrl: 400,
  credentials: 400,
  scheme: 400,
  port: 400,
  blockedAddress: 403,
  dns: 502,
  timeout: 504,
  tooManyRedirects: 502,
  tls: 502,
  network: 502,
  busy: 429,
};

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    if (Number(req.headers['content-length'] ?? 0) > MAX_BODY_BYTES) {
      req.resume();
      reject(new CheckFailure('badRequest'));
      return;
    }
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        req.removeAllListeners('data');
        req.resume();
        reject(new CheckFailure('badRequest'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * Connect-style middleware for the Vite dev and preview servers. Only same-origin
 * JSON POSTs to the exact loopback host are accepted, which blocks other sites and
 * DNS-rebinding pages from using this machine as a relay.
 */
export function headerCheckMiddleware(expectedHost: string, policy: CheckPolicy = DEFAULT_POLICY) {
  let active = 0;
  return async (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
    if ((req.url ?? '').split('?')[0] !== CHECK_PATH) return next();
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return send(res, 405, { ok: false, error: 'badRequest' });
    }
    const origin = req.headers.origin;
    const site = req.headers['sec-fetch-site'];
    if (req.headers.host !== expectedHost || (origin !== undefined && origin !== `http://${expectedHost}`) || (site !== undefined && site !== 'same-origin')) {
      return send(res, 403, { ok: false, error: 'badRequest' });
    }
    if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) {
      return send(res, 415, { ok: false, error: 'badRequest' });
    }
    if (active >= MAX_CONCURRENT) return send(res, 429, { ok: false, error: 'busy' });
    active += 1;
    try {
      let url: unknown;
      try {
        url = (JSON.parse(await readBody(req)) as { url?: unknown })?.url;
      } catch {
        throw new CheckFailure('badRequest');
      }
      if (typeof url !== 'string') throw new CheckFailure('badRequest');
      send(res, 200, { ok: true, result: await checkHeaders(url, policy) });
    } catch (err) {
      const failure = mapError(err);
      send(res, FAILURE_STATUS[failure.code], { ok: false, error: failure.code });
    } finally {
      active -= 1;
    }
  };
}
