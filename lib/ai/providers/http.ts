/**
 * Retries the transient failures every hosted LLM produces.
 *
 * 503/500 mean "the model is busy, come back" and are worth a second and third
 * try against the same model. 429 is deliberately absent: hammering an
 * exhausted quota never clears it. The caller handles 429 by moving to another
 * model instead (see `shouldTryAnotherModel`). Other 4xx are request bugs.
 *
 * Only the *response* is retried, never a stream that has already begun: once
 * the model has emitted a token, replaying the request would duplicate text.
 */
const RETRY_STATUSES = new Set([500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 700;

export async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  let last: Response | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch(url, init);
    if (res.ok || !RETRY_STATUSES.has(res.status)) return res;

    last = res;
    if (attempt === MAX_ATTEMPTS) break;

    // Drain the body so the socket can be reused.
    await res.arrayBuffer().catch(() => undefined);
    const delay = BASE_DELAY_MS * 2 ** (attempt - 1) + Math.random() * 200;
    await sleep(delay, init.signal ?? undefined);
  }

  return last!;
}

function sleep(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}
