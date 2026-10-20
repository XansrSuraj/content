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

export async function fetchJson(url: string, init: RequestInit & { signal: AbortSignal }): Promise<unknown> {
  const res = await fetch(url, init);
  if (res.status === 404) return null;
  if (res.status === 429 || res.status >= 500) throw new SourceFetchError(`HTTP ${res.status}`, true);
  if (!res.ok) throw new SourceFetchError(`HTTP ${res.status}`, false);
  return res.json();
}
