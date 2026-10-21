import { z } from "zod";
import { dedupeHashtags } from "@/lib/domain/hashtags";
import { isSportsTopic } from "@/lib/domain/sports/intent";
import { fetchJson, SourceFetchError, type FetchedObservation, type TrendSourceConnector } from "./types";

const ResponseSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      snippet: z.object({
        title: z.string(),
        description: z.string().optional().default(""),
        channelTitle: z.string().optional(),
        categoryId: z.string().optional(),
        defaultAudioLanguage: z.string().optional(),
        defaultLanguage: z.string().optional(),
      }),
    }),
  ),
});

export function extractHashtags(text: string): string[] {
  return dedupeHashtags(text.match(/#[\p{L}\p{M}\p{N}_]+/gu) ?? []);
}

/** YouTube's "Sports" video category. */
export const YOUTUBE_SPORTS_CATEGORY = "17";

/**
 * YouTube Data API v3 videos.list chart=mostPopular for the Sports category. Only snippet
 * data is requested; no statistics are stored, and no derived metrics are computed.
 * The category chart also returns some videos from other categories; only Sports-category
 * videos or sports titles are kept, at their real chart position.
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
      videoCategoryId: YOUTUBE_SPORTS_CATEGORY,
      maxResults: "50",
      key: this.apiKey,
    });
    const json = await fetchJson(`https://www.googleapis.com/youtube/v3/videos?${params}`, { signal });
    if (json === null) return [];
    const parsed = ResponseSchema.safeParse(json);
    if (!parsed.success) throw new SourceFetchError("Unexpected YouTube response shape", false);
    const expiresAt = new Date(now.getTime() + 29 * 86_400_000);
    return parsed.data.items
      .map((v, i) => ({ v, position: i + 1 }))
      .filter(({ v }) => v.snippet.categoryId === YOUTUBE_SPORTS_CATEGORY || isSportsTopic(v.snippet.title))
      .map(({ v, position }) => ({
      externalId: v.id,
      title: v.snippet.title,
      url: `https://www.youtube.com/watch?v=${encodeURIComponent(v.id)}`,
      observedAt: now,
      geo: this.regionCode,
      language: v.snippet.defaultAudioLanguage ?? v.snippet.defaultLanguage ?? null,
      platform: "youtube",
      rank: position,
      metricName: "chart_position",
      metricValue: position,
      coverageNote: `YouTube Most Popular chart, Sports category, region ${this.regionCode}, at retrieval time. Sample of up to 50 videos. Source: YouTube.`,
      hashtags: extractHashtags(`${v.snippet.title} ${v.snippet.description}`),
      expiresAt,
    }));
  }
}
