/**
 * urlFetcher.js — server-side fetching for reference URLs.
 *
 * Implements the "Politica De Fetch De URLs" from docs/WEBRIEF_MCP_PLAN.md:
 *   - Only http/https schemes
 *   - 10 second hard timeout per URL
 *   - 2 MB max body size (response is truncated above that)
 *   - No redirects (manual: any redirect aborts; prevents SSRF via redirect)
 *   - No private/localhost hostnames (RFC 1918, loopback, link-local, ULA)
 *   - No Authorization or Cookie headers forwarded
 *
 * The handlers receive URLs as user input and must NEVER hit the backend or
 * any internal service. This module is the chokepoint that enforces that.
 */

import dns from 'node:dns/promises';
import net from 'node:net';
// Se importa TAMBIEN fetch de undici (no el global de Node) a proposito: el
// `dispatcher` tiene que venir del mismo paquete que el fetch que lo consume.
// Mezclar el Agent de la dependencia con el fetch global (que usa el undici
// embebido en Node, de otra version) falla con "invalid onRequestStart method".
import { Agent, fetch as undiciFetch } from 'undici';

// Implementacion de fetch usada por el modulo. Es una variable y no una
// referencia directa para que los tests puedan sustituirla: antes stubbeaban
// `globalThis.fetch`, que ya no aplica porque produccion usa el fetch de undici
// (necesario para que el `dispatcher` con IP fijada sea compatible).
let fetchImpl = undiciFetch;

/**
 * Costura de test: sustituye la implementacion de fetch.
 * @param {Function | null} fn  null restaura la original
 * @returns {() => void} funcion para restaurar la anterior
 */
export function __setFetchImplForTests(fn) {
  const previous = fetchImpl;
  fetchImpl = fn || undiciFetch;
  return () => {
    fetchImpl = previous;
  };
}

const TIMEOUT_MS = 10_000;
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const USER_AGENT = 'WeBrief-MCP/0.1 (+server-side reference fetcher)';

/**
 * Returns true when the given IPv4/IPv6 address is in a range that must not
 * leave the server (loopback, link-local, RFC 1918, ULA, etc.).
 *
 * @param {string} address
 * @returns {boolean}
 */
export function isPrivateAddress(address) {
  if (!address) return true;
  const family = net.isIP(address);
  if (family === 0) return true; // unparseable → reject

  if (family === 4) {
    const parts = address.split('.').map(Number);
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a >= 224) return true; // multicast + reserved
    return false;
  }

  // IPv6
  const lower = address.toLowerCase();
  if (lower === '::' || lower === '::1') return true;
  if (lower.startsWith('fe80:')) return true; // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // ULA
  if (lower.startsWith('ff')) return true; // multicast
  if (lower.startsWith('::ffff:')) {
    // IPv4-mapped — recurse on the embedded v4
    const v4 = lower.slice('::ffff:'.length);
    return isPrivateAddress(v4);
  }
  return false;
}

/**
 * Resolve every A/AAAA record for `hostname` and ensure none of them point
 * to a private range. Returns null if safe; otherwise an error reason string.
 *
 * Hostnames that look like literal IPs are checked directly.
 *
 * @param {string} hostname
 * @returns {Promise<string | null>}  null = safe, otherwise reason
 */
export async function checkHostnameSafe(hostname) {
  const { error } = await resolveSafeAddresses(hostname);
  return error ?? null;
}

/**
 * Resolve a hostname and validate every returned address, returning the
 * validated addresses so the caller can PIN them for the actual connection.
 *
 * Why this returns the addresses instead of just a verdict (auditoria 2026-08,
 * hallazgo M5): validating the hostname and then calling fetch() on that same
 * hostname leaves a check-then-connect (TOCTOU) gap — undici performs its own
 * DNS resolution at connect time, so an attacker controlling authoritative DNS
 * can answer with a public IP for the check and a private one (169.254.169.254,
 * 127.0.0.1) milliseconds later for the connection. That is DNS rebinding.
 * Pinning the already-validated address closes the window.
 *
 * @param {string} hostname
 * @returns {Promise<{ error?: string, addresses?: Array<{address: string, family: number}> }>}
 */
export async function resolveSafeAddresses(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (host === 'localhost') return { error: 'host is localhost' };

  // Literal IPs short-circuit DNS.
  if (net.isIP(host) !== 0) {
    if (isPrivateAddress(host)) return { error: 'host resolves to a private/local IP' };
    return { addresses: [{ address: host, family: net.isIP(host) }] };
  }

  let records = [];
  try {
    records = await dns.lookup(host, { all: true, verbatim: true });
  } catch (err) {
    return { error: `dns lookup failed: ${err.code ?? err.message ?? 'unknown'}` };
  }

  for (const rec of records) {
    if (isPrivateAddress(rec.address)) {
      return { error: `host resolves to a private/local IP (${rec.address})` };
    }
  }
  if (records.length === 0) return { error: 'dns lookup returned no records' };

  return { addresses: records.map((r) => ({ address: r.address, family: r.family })) };
}

/**
 * Build an undici Agent whose DNS resolution is pinned to already-validated
 * addresses. Re-checks each address at connect time as defense in depth, so a
 * bug upstream cannot turn into an outbound connection to a private range.
 *
 * @param {Array<{address: string, family: number}>} addresses
 * @returns {Agent}
 */
function createPinnedAgent(addresses) {
  const safe = addresses.filter((a) => !isPrivateAddress(a.address));

  return new Agent({
    connect: {
      lookup(_hostname, options, callback) {
        if (safe.length === 0) {
          callback(new Error('no safe address available for host'), null, null);
          return;
        }
        // Node calls `lookup` with { all } depending on the caller; honour both
        // shapes or the connection fails with an opaque error.
        if (options?.all) {
          callback(null, safe.map((a) => ({ address: a.address, family: a.family })));
          return;
        }
        const first = safe[0];
        callback(null, first.address, first.family);
      },
    },
  });
}

/**
 * @typedef {Object} FetchedReference
 * @property {string}  url
 * @property {boolean} ok
 * @property {number=} status
 * @property {string=} contentType
 * @property {string=} body
 * @property {number=} bytesRead
 * @property {boolean=} truncated
 * @property {string=} error      Present iff ok === false
 * @property {string=} reason     Machine-readable failure code
 */

/**
 * Fetch a single URL under the reference-fetch policy.
 *
 * @param {string} rawUrl
 * @returns {Promise<FetchedReference>}
 */
export async function fetchReferenceUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { url: rawUrl, ok: false, error: 'invalid URL', reason: 'invalid_url' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      url: rawUrl,
      ok: false,
      error: `protocol ${parsed.protocol} is not allowed`,
      reason: 'protocol_not_allowed',
    };
  }

  const { error: safetyError, addresses } = await resolveSafeAddresses(parsed.hostname);
  if (safetyError) {
    return { url: rawUrl, ok: false, error: safetyError, reason: 'private_host' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  // Fija las IPs ya validadas para la conexion real: sin esto undici resolveria
  // DNS de nuevo y quedaria abierta la ventana de rebinding (ver M5).
  const dispatcher = createPinnedAgent(addresses);

  try {
    const res = await fetchImpl(parsed.toString(), {
      method: 'GET',
      redirect: 'error', // any 3xx aborts → SSRF defense
      signal: controller.signal,
      dispatcher,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,text/plain,application/json,*/*;q=0.5',
      },
    });

    const contentType = res.headers.get('content-type') ?? '';
    const declaredLength = Number(res.headers.get('content-length') ?? '0');
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BYTES) {
      return {
        url: rawUrl,
        ok: false,
        status: res.status,
        error: `response too large (${declaredLength} > ${MAX_BYTES} bytes)`,
        reason: 'response_too_large',
      };
    }

    // Stream and cap at MAX_BYTES so a chunked-encoded oversized body still aborts.
    const reader = res.body?.getReader();
    if (!reader) {
      return {
        url: rawUrl,
        ok: false,
        status: res.status,
        error: 'response body is not readable',
        reason: 'no_body',
      };
    }

    const chunks = [];
    let bytesRead = 0;
    let truncated = false;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      const remaining = MAX_BYTES - bytesRead;
      if (value.byteLength > remaining) {
        chunks.push(value.subarray(0, remaining));
        bytesRead += remaining;
        truncated = true;
        try {
          await reader.cancel();
        } catch {
          /* ignore */
        }
        break;
      }
      chunks.push(value);
      bytesRead += value.byteLength;
    }

    const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    const body = buf.toString('utf8');

    return {
      url: rawUrl,
      ok: res.ok,
      status: res.status,
      contentType,
      body,
      bytesRead,
      truncated,
    };
  } catch (err) {
    if (err?.name === 'AbortError') {
      return {
        url: rawUrl,
        ok: false,
        error: `timeout after ${TIMEOUT_MS}ms`,
        reason: 'timeout',
      };
    }
    // Redirect attempts surface as TypeError with cause.code === 'UND_ERR_RES_EXCEEDED_MAX_REDIRECTIONS'
    // or 'unexpected redirect' depending on runtime. Treat any redirect-flagged
    // error as a redirect refusal.
    const msg = String(err?.message ?? err);
    if (/redirect/i.test(msg)) {
      return {
        url: rawUrl,
        ok: false,
        error: 'server responded with a redirect (not followed)',
        reason: 'redirect_refused',
      };
    }
    return {
      url: rawUrl,
      ok: false,
      error: msg,
      reason: 'fetch_failed',
    };
  } finally {
    clearTimeout(timer);
    // Un Agent por request: cerrarlo evita acumular sockets abiertos.
    try {
      await dispatcher.close();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Fetch a list of reference URLs in parallel.
 *
 * @param {string[] | undefined} urls
 * @returns {Promise<FetchedReference[]>}
 */
export async function fetchReferenceUrls(urls) {
  if (!Array.isArray(urls) || urls.length === 0) return [];
  return Promise.all(urls.map(fetchReferenceUrl));
}

export const URL_FETCH_LIMITS = Object.freeze({
  TIMEOUT_MS,
  MAX_BYTES,
});
