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

/**
 * Apple Music "most played" songs in one country, from Apple's public marketing
 * RSS feed (rss.marketingtools.apple.com) — no key, no account. It is a
 * streaming chart, not Instagram Reels or YouTube Shorts audio popularity.
 */
export class AppleMusicTopConnector implements TrendSourceConnector {
  key = "apple_music_top_in";
  minIntervalMinutes = 60;
  constructor(
    private userAgent: string,
    private country = "in",
    private limit = 50,
  ) {}

  async fetch(signal: AbortSignal, now: Date): Promise<FetchedObservation[]> {
    const url = `https://rss.marketingtools.apple.com/api/v2/${this.country}/music/most-played/${this.limit}/songs.json`;
    const json = await fetchJson(url, { signal, headers: { "User-Agent": this.userAgent, Accept: "application/json" }, credentials: "omit" });
    if (json === null) return [];
    const parsed = FeedSchema.safeParse(json);
    if (!parsed.success) throw new SourceFetchError("Unexpected Apple Music feed shape", false);
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
      platform: "apple_music",
      rank: i + 1,
      metricName: null,
      metricValue: null,
      coverageNote: `Apple Music most-played songs in ${geo} (chart updated ${observedAt.toISOString()}). A music-streaming chart — not Instagram Reels or YouTube Shorts audio data.`,
      hashtags: [],
      expiresAt: null,
    }));
  }
}
