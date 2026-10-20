import type { AppConfig } from "@/lib/config";

/**
 * Every data source TrendSaathi knows about, including the ones it cannot use.
 * Status is computed from configuration — nothing here claims a connection
 * that does not exist.
 */

export type SourceStatus = "enabled" | "needs_config" | "disabled" | "unavailable" | "demo";

export interface SourceInfo {
  key: string;
  name: string;
  platform: string;
  kind: "trend_topics" | "chart_sample" | "hashtag" | "audio" | "search_interest" | "demo";
  coverage: string;
  requirements: string[];
  policyNotes: string[];
  docsUrl: string | null;
  ingestible: boolean;
}

export const SOURCES: SourceInfo[] = [
  {
    key: "wikimedia_top_in",
    name: "Wikipedia pageviews (Wikimedia, India)",
    platform: "wikipedia",
    kind: "trend_topics",
    coverage:
      "Most-read Wikipedia articles by readers in India, per day, across all Wikipedia language editions. Shows reading interest — not Instagram, YouTube, Facebook or TikTok popularity.",
    requirements: ["On by default (no key). SOURCE_WIKIMEDIA_ENABLED=false turns it off."],
    policyNotes: [
      "Public Wikimedia REST API; no key. Respect the User-Agent policy and rate limits.",
      "Counts are rounded up by Wikimedia for privacy (views_ceil). Shown as-is with that label.",
      "Confirm Wikimedia terms for your commercial use before launch.",
    ],
    docsUrl: "https://doc.wikimedia.org/generated-data-platform/aqs/analytics-api/reference/page-views.html",
    ingestible: true,
  },
  {
    key: "youtube_most_popular_in",
    name: "YouTube Most Popular chart (India)",
    platform: "youtube",
    kind: "chart_sample",
    coverage:
      "Up to 50 videos in the YouTube Data API 'mostPopular' chart for region IN at retrieval time. A chart sample, not all of YouTube, and not specific to Shorts.",
    requirements: ["YOUTUBE_API_KEY (Google Cloud project with YouTube Data API v3 enabled)", "Accept YouTube API Services Terms"],
    policyNotes: [
      "Stored data is refreshed or deleted within 30 days (enforced via expires_at).",
      "No derived scores from YouTube data; we show chart position and titles only, with YouTube attribution.",
      "Default quota 10,000 units/day; one chart call costs 1 unit.",
      "YouTube's keyless channel RSS (/feeds/videos.xml) is disallowed for automated fetching by youtube.com/robots.txt, and Invidious/Piped mirrors scrape YouTube — neither is used.",
    ],
    docsUrl: "https://developers.google.com/youtube/v3/docs/videos/list",
    ingestible: true,
  },
  {
    key: "instagram_hashtag",
    name: "Instagram hashtag search (Meta Graph API)",
    platform: "instagram",
    kind: "hashtag",
    coverage: "Not connected.",
    requirements: [
      "Instagram professional account linked to a Facebook Page",
      "Meta app with Instagram Public Content Access approved through App Review",
    ],
    policyNotes: [
      "Hashtag search returns top/recent media for a tag, not popularity counts; limited to 30 unique tags per 7 days per account.",
      "Scraping Instagram is not permitted and is not implemented.",
    ],
    docsUrl: "https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-hashtag-search",
    ingestible: false,
  },
  {
    key: "tiktok",
    name: "TikTok trends",
    platform: "tiktok",
    kind: "hashtag",
    coverage: "Not connected. TikTok is not available in India.",
    requirements: ["TikTok Research API is limited to approved non-commercial academic research"],
    policyNotes: ["TikTok Creative Center is a website, not a licensed API; it is not scraped."],
    docsUrl: "https://developers.tiktok.com/products/research-api/",
    ingestible: false,
  },
  {
    key: "facebook",
    name: "Facebook trends",
    platform: "facebook",
    kind: "hashtag",
    coverage: "Not connected. No permitted public trend endpoint is available.",
    requirements: ["None available for general commercial use"],
    policyNotes: [],
    docsUrl: null,
    ingestible: false,
  },
  {
    key: "google_trends_rss_in",
    name: "Google search interest (India) — Trending now RSS",
    platform: "google_search",
    kind: "search_interest",
    coverage:
      "About 10 Google Search queries in India with a recent surge in interest, from Google Trends' official “Trending now” RSS export, with Google's approximate traffic bucket. Search interest only — not Instagram, YouTube, Facebook or TikTok popularity, and never used to mark a hashtag as observed.",
    requirements: ["On by default (no key, no account). SOURCE_GOOGLE_TRENDS_RSS_ENABLED=false turns it off."],
    policyNotes: [
      "Google: “You can use any information from Google Trends, subject to the Google Terms of Service.” Reuse requires the citation “Data source: Google Trends”.",
      "Fetched anonymously (no cookies) at most every 30 minutes; robots.txt does not disallow the feed. Stored rows expire after 7 days.",
      "Google's terms do not clearly address commercial display at scale — get legal review before launch.",
    ],
    docsUrl: "https://support.google.com/trends/answer/3076011",
    ingestible: true,
  },
  {
    key: "google_trends",
    name: "Google Trends API",
    platform: "google_search",
    kind: "search_interest",
    coverage: "Not connected.",
    requirements: ["Google Trends API access (limited alpha programme at the time of writing)"],
    policyNotes: ["Search interest does not prove social-platform hashtag popularity, and would be labeled that way."],
    docsUrl: "https://developers.google.com/search/apis/trends",
    ingestible: false,
  },
  {
    key: "apple_music_top_in",
    name: "Top songs in India (Apple Music chart)",
    platform: "apple_music",
    kind: "audio",
    coverage:
      "The 50 most-played songs on Apple Music in India, from Apple's public chart feed, refreshed hourly. A music-streaming chart — not Instagram Reels or YouTube Shorts audio popularity.",
    requirements: ["On by default (no key, no account). SOURCE_APPLE_MUSIC_ENABLED=false turns it off."],
    policyNotes: [
      "Apple's public marketing RSS feed (rss.marketingtools.apple.com); each song links back to Apple Music.",
      "A chart grants no rights to use a song. Creators should pick songs from the platform's own in-app music library.",
    ],
    docsUrl: "https://rss.marketingtools.apple.com/",
    ingestible: true,
  },
  {
    key: "apple_podcasts_top_in",
    name: "Top podcasts in India (Apple Podcasts chart)",
    platform: "apple_podcasts",
    kind: "chart_sample",
    coverage: "The 50 top shows on Apple Podcasts in India, from Apple's public chart feed, refreshed hourly. Listening interest — not YouTube or Instagram data.",
    requirements: ["On by default (no key, no account). SOURCE_APPLE_PODCASTS_ENABLED=false turns it off."],
    policyNotes: ["Apple's public marketing RSS feed; each show links back to Apple Podcasts."],
    docsUrl: "https://rss.marketingtools.apple.com/",
    ingestible: true,
  },
  {
    key: "bluesky_trends",
    name: "Bluesky trending topics (worldwide)",
    platform: "bluesky",
    kind: "trend_topics",
    coverage:
      "Up to 25 topics trending on Bluesky right now, with Bluesky's post counts, from its public API. Worldwide and English-heavy — a real social-network signal, but not Indian audiences and not Instagram or YouTube.",
    requirements: ["On by default (no key, no account). SOURCE_BLUESKY_ENABLED=false turns it off."],
    policyNotes: [
      "Public AppView API (public.api.bsky.app), fetched anonymously every 30 minutes.",
      "The endpoint is in Bluesky's 'unspecced' namespace and may change; responses are validated strictly.",
    ],
    docsUrl: "https://docs.bsky.app/docs/advanced-guides/api-directory",
    ingestible: true,
  },
  {
    key: "mastodon_trending_tags",
    name: "Mastodon trending hashtags (worldwide)",
    platform: "mastodon",
    kind: "hashtag",
    coverage:
      "Up to 20 hashtags trending on mastodon.social, with today's use counts, from Mastodon's public trends API. Worldwide, Mastodon only — never used as evidence for Instagram, YouTube or TikTok hashtags.",
    requirements: ["On by default (no key, no account). SOURCE_MASTODON_ENABLED=false turns it off."],
    policyNotes: ["Public REST API (GET /api/v1/trends/tags), fetched anonymously every 30 minutes."],
    docsUrl: "https://docs.joinmastodon.org/methods/trends/",
    ingestible: true,
  },
  {
    key: "trending_audio",
    name: "In-app trending audio (Reels / Shorts)",
    platform: "multi",
    kind: "audio",
    coverage: "Not connected. Instagram and YouTube do not offer their in-app trending-audio lists through any permitted API.",
    requirements: ["Not offered by the platforms"],
    policyNotes: ["Scraping in-app audio charts breaks platform terms and is not implemented."],
    docsUrl: null,
    ingestible: false,
  },
  {
    key: "demo_sample",
    name: "Demo sample data",
    platform: "multi",
    kind: "demo",
    coverage: "Hand-written sample observations for demonstration. Not real data.",
    requirements: ["TRENDSAATHI_DEMO_MODE=true"],
    policyNotes: [],
    docsUrl: null,
    ingestible: false,
  },
];

export const SOURCE_NAMES: Record<string, string> = Object.fromEntries(SOURCES.map((s) => [s.key, s.name]));

export function sourceStatus(key: string, cfg: AppConfig): { status: SourceStatus; missing: string[] } {
  switch (key) {
    case "wikimedia_top_in": {
      const missing: string[] = [];
      if (!cfg.sources.wikimediaEnabled) missing.push("SOURCE_WIKIMEDIA_ENABLED=true");
      if (!cfg.sources.wikimediaUserAgent) missing.push("WIKIMEDIA_USER_AGENT");
      return { status: missing.length ? "disabled" : "enabled", missing };
    }
    case "google_trends_rss_in":
      return cfg.sources.googleTrendsRssEnabled
        ? { status: "enabled", missing: [] }
        : { status: "disabled", missing: ["SOURCE_GOOGLE_TRENDS_RSS_ENABLED=true"] };
    case "apple_podcasts_top_in":
      return cfg.sources.applePodcastsEnabled ? { status: "enabled", missing: [] } : { status: "disabled", missing: ["SOURCE_APPLE_PODCASTS_ENABLED=true"] };
    case "bluesky_trends":
      return cfg.sources.blueskyEnabled ? { status: "enabled", missing: [] } : { status: "disabled", missing: ["SOURCE_BLUESKY_ENABLED=true"] };
    case "mastodon_trending_tags":
      return cfg.sources.mastodonEnabled ? { status: "enabled", missing: [] } : { status: "disabled", missing: ["SOURCE_MASTODON_ENABLED=true"] };
    case "apple_music_top_in":
      return cfg.sources.appleMusicEnabled ? { status: "enabled", missing: [] } : { status: "disabled", missing: ["SOURCE_APPLE_MUSIC_ENABLED=true"] };
    case "youtube_most_popular_in":
      return cfg.sources.youtubeApiKeyPresent
        ? { status: "enabled", missing: [] }
        : { status: "needs_config", missing: ["YOUTUBE_API_KEY"] };
    case "demo_sample":
      return cfg.demoEnabled ? { status: "demo", missing: [] } : { status: "disabled", missing: ["TRENDSAATHI_DEMO_MODE=true"] };
    default:
      return { status: "unavailable", missing: SOURCES.find((s) => s.key === key)?.requirements ?? [] };
  }
}
