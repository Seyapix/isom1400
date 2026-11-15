import { readLiveCheck } from './storage.ts';
import { LIVE_CHECK_ERRORS } from './types.ts';
import type { LiveCheck, LiveCheckError } from './types.ts';

export const CHECK_ENDPOINT = '/api/header-check';
const CLIENT_TIMEOUT_MS = 15000;

export type CheckOutcome = { ok: true; result: LiveCheck } | { ok: false; error: LiveCheckError };

/** Asks the local server to read the four headers. The browser itself never contacts the address. */
export async function requestLiveCheck(url: string, fetcher: typeof fetch = fetch): Promise<CheckOutcome> {
  let body: unknown;
  try {
    const response = await fetcher(CHECK_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      cache: 'no-store',
      credentials: 'omit',
      signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
    });
    if (!/^application\/json\b/i.test(response.headers.get('content-type') ?? '')) {
      return { ok: false, error: 'unavailable' };
    }
    body = await response.json();
  } catch (err) {
    return { ok: false, error: (err as Error)?.name === 'TimeoutError' ? 'timeout' : 'unavailable' };
  }
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'unavailable' };
  const data = body as { ok?: unknown; result?: unknown; error?: unknown };
  if (data.ok === true) {
    const result = readLiveCheck(data.result);
    return result ? { ok: true, result } : { ok: false, error: 'unavailable' };
  }
  const error = LIVE_CHECK_ERRORS.find((e) => e === data.error);
  return { ok: false, error: error ?? 'unavailable' };
}
