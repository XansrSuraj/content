import { z } from "zod";
import { isSafeTitle } from "./filters";
import { fetchJson, SourceFetchError, type FetchedObservation, type TrendSourceConnector } from "./types";

const BlueskySchema = z.object({
  trends: z.array(
    z.object({
      topic: z.string(),
      displayName: z.string(),
      link: z.string().optional(),
      postCount: z.number().optional(),
      status: z.string().optional(),
      category: z.string().optional(),
    }),
  ),
});

/**
 * Bluesky's public trending topics (public.api.bsky.app, no account). Worldwide
 * and English-heavy — a real social-network signal, but not Indian and not Instagram/YouTube.
 * The endpoint is in Bluesky's "unspecced" namespace, so its shape may change; parsing is strict.
 */
export class BlueskyTrendsConnector implements TrendSourceConnector {
  key = "bluesky_trends";
  minIntervalMinutes = 30;
  constructor(private userAgent: string) {}

  async fetch(signal: AbortSignal, now: Date): Promise<FetchedObservation[]> {
    const json = await fetchJson("https://public.api.bsky.app/xrpc/app.bsky.unspecced.getTrends?limit=25", {
      signal,
      credentials: "omit",
      headers: { "User-Agent": this.userAgent, Accept: "application/json" },
    });
    if (json === null) return [];
    const parsed = BlueskySchema.safeParse(json);
    if (!parsed.success) throw new SourceFetchError("Unexpected Bluesky response shape", false);
    return parsed.data.trends
      .filter((t) => isSafeTitle(t.displayName))
      .map((t, i) => ({
        externalId: t.topic,
        title: t.displayName,
        url: t.link ? `https://bsky.app${t.link}` : null,
        observedAt: now,
        geo: "WORLD",
        language: null,
        platform: "bluesky",
        rank: i + 1,
        metricName: t.postCount !== undefined ? "bluesky_posts" : null,
        metricValue: t.postCount ?? null,
        coverageNote: `Bluesky trending topics, worldwide, at ${now.toISOString()}${t.category ? ` (category: ${t.category})` : ""}. Bluesky only — not Instagram, YouTube or Indian audiences.`,
        hashtags: [],
        expiresAt: new Date(now.getTime() + 7 * 86_400_000),
      }));
  }
}

const MastodonSchema = z.array(
  z.object({
    name: z.string(),
    url: z.string().url(),
    history: z.array(z.object({ day: z.string(), uses: z.string(), accounts: z.string() })),
  }),
);

/** Trending hashtags on one Mastodon server (public API, no account). Worldwide, Mastodon only. */
export class MastodonTrendingTagsConnector implements TrendSourceConnector {
  key = "mastodon_trending_tags";
  minIntervalMinutes = 30;
  constructor(
    private userAgent: string,
    private instance = "mastodon.social",
  ) {}

  async fetch(signal: AbortSignal, now: Date): Promise<FetchedObservation[]> {
    const json = await fetchJson(`https://${this.instance}/api/v1/trends/tags?limit=20`, {
      signal,
      credentials: "omit",
      headers: { "User-Agent": this.userAgent, Accept: "application/json" },
    });
    if (json === null) return [];
    const parsed = MastodonSchema.safeParse(json);
    if (!parsed.success) throw new SourceFetchError("Unexpected Mastodon response shape", false);
    return parsed.data
      .filter((t) => isSafeTitle(t.name))
      .map((t, i) => {
        const today = t.history[0];
        return {
          externalId: t.name.toLowerCase(),
          title: `#${t.name}`,
          url: t.url,
          observedAt: now,
          geo: "WORLD",
          language: null,
          platform: "mastodon",
          rank: i + 1,
          metricName: today ? "mastodon_uses_today" : null,
          metricValue: today ? Number(today.uses) : null,
          coverageNote: `Trending hashtags on ${this.instance} (Mastodon), worldwide, at ${now.toISOString()}. Uses counted today by ${today?.accounts ?? "?"} accounts. Mastodon only — not Instagram, YouTube or TikTok.`,
          // Mastodon usage is not evidence for any target platform, so no hashtag evidence is stored.
          hashtags: [],
          expiresAt: new Date(now.getTime() + 7 * 86_400_000),
        };
      });
  }
}
