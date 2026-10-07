import { ModelProviderError, type ProviderName } from "../types";

const RETRYABLE = new Set([408, 409, 429, 500, 502, 503, 504, 529]);
const MAX_ATTEMPTS = 2;
const MAX_WAIT_MS = 5_000;

/**
 * POST JSON with a timeout and one retry on rate limits / server errors.
 * Error messages carry the status and the provider's error text, never the request body
 * (it can contain guest messages).
 */
export async function postJson<T>(
  provider: ProviderName,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number,
): Promise<T> {
  let lastError: ModelProviderError | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      lastError = new ModelProviderError(
        timedOut ? `${provider} request timed out after ${timeoutMs} ms` : `${provider} request failed: network error`,
        provider,
        null,
        true,
      );
      if (attempt < MAX_ATTEMPTS) await sleep(500);
      continue;
    }

    if (res.ok) return (await res.json()) as T;

    const retryable = RETRYABLE.has(res.status);
    lastError = new ModelProviderError(
      `${provider} returned ${res.status}: ${await errorText(res)}`,
      provider,
      res.status,
      retryable,
    );
    if (!retryable || attempt === MAX_ATTEMPTS) break;
    await sleep(retryAfterMs(res.headers.get("retry-after")));
  }

  throw lastError ?? new ModelProviderError(`${provider} request failed`, provider, null, false);
}

async function errorText(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: { message?: string } | string };
    const message = typeof data.error === "string" ? data.error : data.error?.message;
    return (message ?? res.statusText).slice(0, 300);
  } catch {
    return res.statusText;
  }
}

function retryAfterMs(header: string | null): number {
  const seconds = header ? Number(header) : NaN;
  return Number.isFinite(seconds) ? Math.min(seconds * 1000, MAX_WAIT_MS) : 1_000;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
