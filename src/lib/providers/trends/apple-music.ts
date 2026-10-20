import { z } from "zod";
import { fetchJson, SourceFetchError, type FetchedObservation, type TrendSourceConnector } from "./types";

const FeedSchema = z.object({
  feed: z.object({
    updated: z.string(),
    results: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        artistName: z.string(),
        url: z.string().url().optional(),
      }),
    ),
  }),
});

const CHARTS = {
  songs: { key: "apple_music_top_in", path: "music/most-played", file: "songs", platform: "apple_music", label: "Apple Music most-played songs" },
  podcasts: { key: "apple_podcasts_top_in", path: "podcasts/top", file: "podcasts", platform: "apple_podcasts", label: "Apple Podcasts top shows" },
} as const;

/**
 * Apple's public marketing RSS charts (rss.marketingtools.apple.com) — no key,
 * no account. Streaming/listening charts, not Instagram Reels or YouTube Shorts data.
 */
export class AppleChartConnector implements TrendSourceConnector {
  key: string;
  minIntervalMinutes = 60;
  private chart: (typeof CHARTS)[keyof typeof CHARTS];
  constructor(
    private userAgent: string,
    kind: keyof typeof CHARTS = "songs",
    private country = "in",
    private limit = 50,
  ) {
    this.chart = CHARTS[kind];
    this.key = this.chart.key;
  }

  async fetch(signal: AbortSignal, now: Date): Promise<FetchedObservation[]> {
    const url = `https://rss.marketingtools.apple.com/api/v2/${this.country}/${this.chart.path}/${this.limit}/${this.chart.file}.json`;
    const json = await fetchJson(url, { signal, headers: { "User-Agent": this.userAgent, Accept: "application/json" }, credentials: "omit" });
    if (json === null) return [];
    const parsed = FeedSchema.safeParse(json);
    if (!parsed.success) throw new SourceFetchError("Unexpected Apple chart feed shape", false);
    const updated = new Date(parsed.data.feed.updated);
    const observedAt = Number.isNaN(updated.getTime()) ? now : updated;
    const geo = this.country.toUpperCase();
    return parsed.data.feed.results.map((s, i) => ({
      externalId: s.id,
      title: `${s.name} — ${s.artistName}`,
      url: s.url ?? null,
      observedAt,
      geo,
      language: null,
      platform: this.chart.platform,
      rank: i + 1,
      metricName: null,
      metricValue: null,
      coverageNote: `${this.chart.label} in ${geo} (chart updated ${observedAt.toISOString()}). A ${this.chart.file === "songs" ? "music-streaming" : "podcast"} chart — not Instagram Reels or YouTube Shorts data.`,
      hashtags: [],
      expiresAt: null,
    }));
  }
}

/** Kept for readability at call sites: the India songs chart. */
export class AppleMusicTopConnector extends AppleChartConnector {
  constructor(userAgent: string, country = "in", limit = 50) {
    super(userAgent, "songs", country, limit);
  }
}
