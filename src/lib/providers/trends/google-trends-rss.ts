import { isSafeTitle } from "./filters";
import { fetchText, SourceFetchError, type FetchedObservation, type TrendSourceConnector } from "./types";

/**
 * Google Trends "Trending now" RSS feed (official export on trends.google.com,
 * no key, no cookies). It lists searches with a recent surge in Google Search
 * interest for a country. This is search interest only — never social-media or
 * hashtag popularity — so observations carry no hashtags.
 *
 * Stored per item: the trend term, Google's approximate-traffic bucket, the
 * feed's publish time and the first related publisher name. News images and
 * headlines are not copied; the evidence links back to Google Trends.
 */

export interface RssTrendItem {
  title: string;
  approxTraffic: string | null;
  pubDate: Date | null;
  newsSource: string | null;
  newsUrl: string | null;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function decodeXml(s: string): string {
  return s
    .replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, "$1")
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
      if (e[0] === "#") {
        const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : "";
      }
      return ENTITIES[e.toLowerCase()] ?? "";
    })
    .trim();
}

function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decodeXml(m[1]) : null;
}

/** Parses the feed's <item> blocks. Throws if the document is not this RSS feed. */
export function parseTrendingRss(xml: string): RssTrendItem[] {
  if (!/<rss[\s>]/i.test(xml) || !/<channel[\s>]/i.test(xml)) {
    throw new SourceFetchError("Response is not the Google Trends RSS feed", false);
  }
  const items: RssTrendItem[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const block = m[1];
    const title = tag(block, "title");
    if (!title) continue;
    const pub = tag(block, "pubDate");
    const date = pub ? new Date(pub) : null;
    const news = block.match(/<ht:news_item>([\s\S]*?)<\/ht:news_item>/i)?.[1] ?? "";
    items.push({
      title,
      approxTraffic: tag(block, "ht:approx_traffic"),
      pubDate: date && !Number.isNaN(date.getTime()) ? date : null,
      newsSource: news ? tag(news, "ht:news_item_source") : null,
      newsUrl: news ? tag(news, "ht:news_item_url") : null,
    });
  }
  return items;
}

/** "200+" → 200, "2,000+" → 2000, "10K+" → 10000. Lower bound of Google's bucket. */
export function parseTrafficBucket(raw: string | null): number | null {
  if (!raw) return null;
  const m = raw.replace(/,/g, "").match(/^(\d+(?:\.\d+)?)\s*([KM])?\+?$/i);
  if (!m) return null;
  const mult = m[2]?.toUpperCase() === "M" ? 1_000_000 : m[2]?.toUpperCase() === "K" ? 1_000 : 1;
  return Math.round(Number(m[1]) * mult);
}

const STORE_DAYS = 7;

export class GoogleTrendsRssConnector implements TrendSourceConnector {
  key = "google_trends_rss_in";
  /** Google refreshes the page often; we fetch politely at most every 2 hours. */
  minIntervalMinutes = 120;
  constructor(
    private userAgent: string,
    private geo = "IN",
  ) {}

  async fetch(signal: AbortSignal, now: Date): Promise<FetchedObservation[]> {
    const url = `https://trends.google.com/trending/rss?geo=${encodeURIComponent(this.geo)}`;
    const xml = await fetchText(url, {
      signal,
      headers: { "User-Agent": this.userAgent, Accept: "application/rss+xml, application/xml;q=0.9" },
    });
    if (xml === null) return [];
    const expiresAt = new Date(now.getTime() + STORE_DAYS * 86_400_000);
    return parseTrendingRss(xml)
      .filter((i) => isSafeTitle(i.title))
      .map((i, idx) => ({
        externalId: i.title.toLowerCase(),
        title: i.title.slice(0, 300),
        url: `https://trends.google.com/trending?geo=${encodeURIComponent(this.geo)}`,
        // The feed's publish time for the trend; fall back to retrieval time (still a real observation time).
        observedAt: i.pubDate && i.pubDate.getTime() <= now.getTime() + 60_000 ? i.pubDate : now,
        geo: this.geo,
        language: null,
        platform: "google_search",
        rank: idx + 1,
        metricName: i.approxTraffic ? "approx_traffic" : null,
        metricValue: parseTrafficBucket(i.approxTraffic),
        coverageNote:
          `Google Search "Trending now" feed for ${this.geo}: searches with a recent surge in interest, at retrieval time (about 10 items).` +
          (i.approxTraffic ? ` Google's approximate traffic bucket: ${i.approxTraffic}.` : "") +
          (i.newsSource ? ` Related news: ${i.newsSource}.` : "") +
          " Search interest only, not social-media or hashtag popularity. Data source: Google Trends.",
        hashtags: [],
        expiresAt,
      }));
  }
}
