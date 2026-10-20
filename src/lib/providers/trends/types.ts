export interface FetchedObservation {
  externalId: string;
  title: string;
  url: string | null;
  observedAt: Date;
  geo: string;
  language: string | null;
  platform: string;
  rank: number | null;
  metricName: string | null;
  metricValue: number | null;
  coverageNote: string;
  hashtags: string[];
  expiresAt: Date | null;
}

export interface TrendSourceConnector {
  key: string;
  /** Minimum minutes between automatic runs, to respect source refresh cadence and quotas. */
  minIntervalMinutes: number;
  fetch(signal: AbortSignal, now: Date): Promise<FetchedObservation[]>;
}

export class SourceFetchError extends Error {
  constructor(
    message: string,
    public retryable: boolean,
  ) {
    super(message);
    this.name = "SourceFetchError";
  }
}

/** Thrown on HTTP 429; carries the provider's Retry-After so callers wait that long. */
export class RateLimitedError extends SourceFetchError {
  constructor(public retryAfterSeconds: number | null) {
    super("HTTP 429 (rate limited)", true);
    this.name = "RateLimitedError";
  }
}

export function retryAfterSeconds(res: Response): number | null {
  const v = res.headers.get("retry-after");
  if (!v) return null;
  const n = Number(v);
  if (Number.isFinite(n)) return Math.max(0, n);
  const at = Date.parse(v);
  return Number.isNaN(at) ? null : Math.max(0, Math.round((at - Date.now()) / 1000));
}

export async function fetchText(url: string, init: RequestInit & { signal: AbortSignal }): Promise<string | null> {
  // credentials are never sent; feeds are fetched anonymously.
  const res = await fetch(url, { ...init, credentials: "omit", redirect: "follow" });
  if (res.status === 404) return null;
  if (res.status === 429) throw new RateLimitedError(retryAfterSeconds(res));
  if (res.status >= 500) throw new SourceFetchError(`HTTP ${res.status}`, true);
  if (!res.ok) throw new SourceFetchError(`HTTP ${res.status}`, false);
  return res.text();
}

export async function fetchJson(url: string, init: RequestInit & { signal: AbortSignal }): Promise<unknown> {
  const res = await fetch(url, init);
  if (res.status === 404) return null;
  if (res.status === 429) throw new RateLimitedError(retryAfterSeconds(res));
  if (res.status >= 500) throw new SourceFetchError(`HTTP ${res.status}`, true);
  if (!res.ok) throw new SourceFetchError(`HTTP ${res.status}`, false);
  return res.json();
}
