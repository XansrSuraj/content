/**
 * Publishing destinations and their hashtag rules.
 *
 * Every rule carries its source and the date it was last checked. Rules that we
 * could not confirm from an official page are marked `unverified` and are shown
 * to creators with that label. Edit this file (or override via env later) when
 * platforms change their guidance — do not hardcode limits anywhere else.
 */

export type PlatformId = "youtube" | "youtube_shorts" | "instagram_reels" | "instagram_post" | "facebook_reels" | "facebook_post" | "tiktok";

export interface HashtagRule {
  /** A hard platform limit, if one is documented. */
  hardLimit: number | null;
  hardLimitNote: string | null;
  /** How many tags the one-click copy puts in by default (TrendSaathi editorial choice, not a platform rule). */
  copyDefault: number;
  placement: string;
  sourceUrl: string | null;
  checkedOn: string;
  status: "official" | "unverified" | "none_found";
}

export interface Platform {
  id: PlatformId;
  label: string;
  family: "youtube" | "instagram" | "facebook" | "tiktok";
  captionNoun: { hinglish: string; english: string };
  hashtagRule: HashtagRule;
  /** Is there any permitted live trend feed TrendSaathi can use for this destination? */
  trendFeed: "available_with_key" | "not_available";
  availabilityNote?: string;
}

const YT_RULE: HashtagRule = {
  hardLimit: 60,
  hardLimitNote:
    "YouTube Help: if a video has more than 60 hashtags, YouTube ignores all of them. Up to 3 hashtags from the description may appear near the title.",
  copyDefault: 3,
  placement: "Description (top 3 may show near the title) or title",
  sourceUrl: "https://support.google.com/youtube/answer/6390658",
  checkedOn: "2026-10-20",
  status: "official",
};

const IG_RULE: HashtagRule = {
  hardLimit: 5,
  hardLimitNote:
    "Multiple reports say Instagram now allows up to 5 hashtags per post/Reel (announced Dec 2025). Some Meta developer pages still mention 30. Confirm in the Instagram app before relying on it.",
  copyDefault: 5,
  placement: "Caption",
  sourceUrl: "https://help.instagram.com/",
  checkedOn: "2026-10-20",
  status: "unverified",
};

const FB_RULE: HashtagRule = {
  hardLimit: null,
  hardLimitNote: "No official hashtag-count limit found for Facebook posts or Reels.",
  copyDefault: 3,
  placement: "Post text / Reel description",
  sourceUrl: null,
  checkedOn: "2026-10-20",
  status: "none_found",
};

const TT_RULE: HashtagRule = {
  hardLimit: null,
  hardLimitNote: "No official hashtag-count limit confirmed. Hashtags count toward the caption character limit.",
  copyDefault: 4,
  placement: "Caption",
  sourceUrl: null,
  checkedOn: "2026-10-20",
  status: "none_found",
};

export const PLATFORMS: Platform[] = [
  {
    id: "instagram_reels",
    label: "Instagram Reels",
    family: "instagram",
    captionNoun: { hinglish: "Reel caption", english: "Reel caption" },
    hashtagRule: IG_RULE,
    trendFeed: "not_available",
    availabilityNote:
      "Instagram Graph API hashtag search needs a Business account plus Meta app review, and does not give popularity counts.",
  },
  {
    id: "instagram_post",
    label: "Instagram Post",
    family: "instagram",
    captionNoun: { hinglish: "Post caption", english: "Post caption" },
    hashtagRule: IG_RULE,
    trendFeed: "not_available",
  },
  {
    id: "youtube_shorts",
    label: "YouTube Shorts",
    family: "youtube",
    captionNoun: { hinglish: "Shorts title + description", english: "Shorts title + description" },
    hashtagRule: YT_RULE,
    trendFeed: "available_with_key",
    availabilityNote: "YouTube Data API 'mostPopular' chart (needs YOUTUBE_API_KEY). Chart covers regular videos; it is not a Shorts trend list.",
  },
  {
    id: "youtube",
    label: "YouTube (long video)",
    family: "youtube",
    captionNoun: { hinglish: "Title + description", english: "Title + description" },
    hashtagRule: YT_RULE,
    trendFeed: "available_with_key",
  },
  {
    id: "facebook_reels",
    label: "Facebook Reels",
    family: "facebook",
    captionNoun: { hinglish: "Reel description", english: "Reel description" },
    hashtagRule: FB_RULE,
    trendFeed: "not_available",
    availabilityNote: "No permitted public trend API for Facebook is connected.",
  },
  {
    id: "facebook_post",
    label: "Facebook Post",
    family: "facebook",
    captionNoun: { hinglish: "Post text", english: "Post text" },
    hashtagRule: FB_RULE,
    trendFeed: "not_available",
  },
  {
    id: "tiktok",
    label: "TikTok (where available)",
    family: "tiktok",
    captionNoun: { hinglish: "Caption", english: "Caption" },
    hashtagRule: TT_RULE,
    trendFeed: "not_available",
    availabilityNote:
      "TikTok is not available in India. TikTok's Research API is limited to approved non-commercial research, so no trend feed is connected.",
  },
];

export const PLATFORM_IDS = PLATFORMS.map((p) => p.id) as [PlatformId, ...PlatformId[]];

export function getPlatform(id: string): Platform {
  return PLATFORMS.find((p) => p.id === id) ?? PLATFORMS[0];
}

export function isPlatformId(id: string): id is PlatformId {
  return PLATFORMS.some((p) => p.id === id);
}
