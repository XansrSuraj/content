import { z } from "zod";
import { dedupeHashtags } from "@/lib/domain/hashtags";
import { fetchJson, SourceFetchError, type FetchedObservation, type TrendSourceConnector } from "./types";

const ResponseSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      snippet: z.object({
        title: z.string(),
        description: z.string().optional().default(""),
        channelTitle: z.string().optional(),
        defaultAudioLanguage: z.string().optional(),
        defaultLanguage: z.string().optional(),
      }),
    }),
  ),
});

export function extractHashtags(text: string): string[] {
  return dedupeHashtags(text.match(/#[\p{L}\p{M}\p{N}_]+/gu) ?? []);
}

/**
 * YouTube Data API v3 videos.list chart=mostPopular. Only snippet data is
 * requested; no statistics are stored, and no derived metrics are computed.
 * Stored rows expire after 30 days per the YouTube API Services policies.
 */
export class YouTubeMostPopularConnector implements TrendSourceConnector {
  key = "youtube_most_popular_in";
  minIntervalMinutes = 120;
  constructor(
    private apiKey: string,
    private regionCode = "IN",
  ) {}

  async fetch(signal: AbortSignal, now: Date): Promise<FetchedObservation[]> {
    const params = new URLSearchParams({
      part: "snippet",
      chart: "mostPopular",
      regionCode: this.regionCode,
      maxResults: "50",
      key: this.apiKey,
    });
    const json = await fetchJson(`https://www.googleapis.com/youtube/v3/videos?${params}`, { signal });
    if (json === null) return [];
    const parsed = ResponseSchema.safeParse(json);
    if (!parsed.success) throw new SourceFetchError("Unexpected YouTube response shape", false);
    const expiresAt = new Date(now.getTime() + 29 * 86_400_000);
    return parsed.data.items.map((v, i) => ({
      externalId: v.id,
      title: v.snippet.title,
      url: `https://www.youtube.com/watch?v=${encodeURIComponent(v.id)}`,
      observedAt: now,
      geo: this.regionCode,
      language: v.snippet.defaultAudioLanguage ?? v.snippet.defaultLanguage ?? null,
      platform: "youtube",
      rank: i + 1,
      metricName: "chart_position",
      metricValue: i + 1,
      coverageNote: `YouTube Most Popular chart, region ${this.regionCode}, at retrieval time. Sample of up to 50 videos. Source: YouTube.`,
      hashtags: extractHashtags(`${v.snippet.title} ${v.snippet.description}`),
      expiresAt,
    }));
  }
}
