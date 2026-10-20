import { z } from "zod";
import { isSafeTitle } from "./filters";
import { fetchJson, SourceFetchError, type FetchedObservation, type TrendSourceConnector } from "./types";

const ResponseSchema = z.object({
  items: z.array(
    z.object({
      country: z.string(),
      year: z.string(),
      month: z.string(),
      day: z.string(),
      articles: z.array(
        z.object({
          article: z.string(),
          project: z.string(),
          views_ceil: z.number(),
          rank: z.number(),
        }),
      ),
    }),
  ),
});

/** Pages that are navigation, not topics, or not suitable as creator opportunities. */
const EXCLUDED_PREFIX = /^(Main_Page|Special:|Wikipedia:|File:|Portal:|Help:|Category:|Template:|Talk:|User:|मुखपृष्ठ)/i;
/**
 * Namespace pages in any language ("Speciel:Søgning", "Especial:Cerca") have a
 * colon directly followed by a letter. Real titles use "Title:_Subtitle".
 */
const NAMESPACE_LIKE = /^[^:_]+:[^_]/u;

export function filterArticle(article: string): boolean {
  if (EXCLUDED_PREFIX.test(article)) return false;
  if (NAMESPACE_LIKE.test(article)) return false;
  if (!isSafeTitle(article)) return false;
  return true;
}

function ymd(d: Date) {
  return {
    y: String(d.getUTCFullYear()),
    m: String(d.getUTCMonth() + 1).padStart(2, "0"),
    d: String(d.getUTCDate()).padStart(2, "0"),
  };
}

export class WikimediaTopInConnector implements TrendSourceConnector {
  key = "wikimedia_top_in";
  minIntervalMinutes = 60;
  constructor(
    private userAgent: string,
    private country = "IN",
    private limit = 60,
  ) {}

  async fetch(signal: AbortSignal, now: Date): Promise<FetchedObservation[]> {
    // Daily data is published with a delay; try yesterday, then the day before.
    for (const offset of [1, 2]) {
      const day = new Date(now.getTime() - offset * 86_400_000);
      const { y, m, d } = ymd(day);
      const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/top-per-country/${this.country}/all-access/${y}/${m}/${d}`;
      const json = await fetchJson(url, { signal, headers: { "User-Agent": this.userAgent, Accept: "application/json" } });
      if (json === null) continue;
      const parsed = ResponseSchema.safeParse(json);
      if (!parsed.success) throw new SourceFetchError("Unexpected Wikimedia response shape", false);
      const item = parsed.data.items[0];
      if (!item) continue;
      const observedAt = new Date(Date.UTC(Number(item.year), Number(item.month) - 1, Number(item.day)));
      return item.articles
        .filter((a) => filterArticle(a.article))
        .slice(0, this.limit)
        .map((a) => ({
          externalId: `${a.project}:${a.article}`,
          title: decodeURIComponent(a.article).replace(/_/g, " "),
          url: `https://${a.project}.org/wiki/${a.article}`,
          observedAt,
          geo: this.country,
          language: a.project.split(".")[0] ?? null,
          platform: "wikipedia",
          rank: a.rank,
          metricName: "views_ceil",
          metricValue: a.views_ceil,
          coverageNote: `Wikipedia readers in ${this.country}, all devices, full day ${y}-${m}-${d} (UTC). Views rounded up by Wikimedia. Reading interest only, not social-media data.`,
          hashtags: [],
          expiresAt: null,
        }));
    }
    return [];
  }
}
