# TrendSaathi — implementation progress

Keep this file current so work can resume across sessions.

## Decisions
- Stack: Next.js 16.4 (App Router, Turbopack, Cache Components **off**), React 19, TypeScript, Tailwind v4, Drizzle ORM, zod 4, Anthropic SDK 0.135.
- DB: embedded PGlite (`.data/pglite`) locally and in demo; `DATABASE_URL` Postgres in production. Same schema and migrations (`drizzle/`).
- Auth: first-party email + password (scrypt), DB sessions (hashed tokens), httpOnly cookie `ts_session`. Admin via `ADMIN_EMAILS`. `src/proxy.ts` only does optimistic redirects; authorization lives in `requireUser`/`requireAdmin` and the repos.
- Demo: an isolated demo user per visitor. Production disables demo unless two flags are set. Demo sessions die when demo is disabled.
- AI: `beta.messages.parse` + `betaZodOutputFormat`. The model ID comes from `ANTHROPIC_MODEL`. Template preview (labeled, not AI) when unconfigured. No silent fallback.
- Trend sources: Wikimedia top-per-country (verified live), YouTube mostPopular (key needed, unverified). Others show as unavailable with requirements.
- How the user's feature notes were handled:
  - Trend score → comparable observation history only.
  - Best posting time → the creator's own manual log only.
  - Trending audio → unavailable connector.
  - Per-platform copy → configurable rules with sources.

## Status
- [x] Phase A: foundation, design system, app shell, demo mode, preferences, Caption Studio, AI adapter, validation, follow-ups, copy/edit/save/delete
- [x] Phase B: feed and filters, evidence detail, freshness/provider status, briefs, saved, admin/research tools, ingestion (CLI + endpoint)
- [x] Phase C: auth + ownership, private histories, published links + manual feedback, profile ranking, quotas, deletion flows, consent
- [x] Phase D: lint, typecheck, 51 unit/integration tests, production build, bundle scan, 6 Playwright E2E tests (dev and production builds), desktop + mobile screenshots
- [x] README, .env.example, docs/FUTURE.md

## Verification log (2026-10-20)
- `npm run lint`: clean. `tsc --noEmit`: clean.
- `npm test`: 51 passed.
- `npm run build`: success, no warnings. `check:bundle`: no secrets or server-only markers in client chunks.
- Playwright: 6/6 passed against `next dev` and against `next start` (with `TRENDSAATHI_ALLOW_DEMO_IN_PRODUCTION=true`).
- Production without the allow flag: the demo button is not rendered.
- Real Wikimedia ingestion: 60 fetched; the second run was skipped by the freshness check. A filter gap was found (adult titles, localized namespace pages) and fixed, with tests.
- Not verified: live Anthropic generation, the YouTube API (no credentials).

## Session 2 (2026-10-20): free local AI, caption eval, Google Trends RSS
- **Ollama provider** (`src/lib/providers/ai/ollama.ts`): `AI_PROVIDER=ollama`, JSON-schema `format`, the same strict zod validation, one repair attempt, and recoverable errors (`local_unavailable`, `timeout`, `invalid_output`). It never swaps in the template. UI label: "Local AI (development)". Model: `llama3.2:3b` (2.0 GB; Meta lists Hindi as supported). Installed Ollama 0.40.6 via winget.
  - **Verified:** Ollama down → the UI shows "Local AI unavailable" + Retry, with 0 template outputs.
- **Caption eval** (`npm run eval:captions`, writes to `eval-output/`, gitignored, not in CI). Baseline and post-change runs on llama3.2:3b (CPU only, Ryzen 7735HS):

  | Metric | Baseline | After changes |
  |---|---|---|
  | Turns passing validation | 11/11 | 9/11 |
  | Median latency | 86 s | 110 s |

  The 2 failures were 180 s timeouts while the app was using the model at the same time. Ollama serves one request at a time.
  - **Bugs found and fixed (with tests):**
    - a locked first line re-added emoji after "emoji hata do";
    - the lock dropped the rest of the model's first line, so all three options became just that line;
    - hashtags were duplicated inside caption text;
    - "shorter" requests that the model ignored are now flagged instead of hidden.
  - **Prompt changes:**
    - Shared: write in the creator's voice, keep stated facts (aaj/kal), make options differ, clarify what a locked first line means, apply follow-ups visibly, no platform-performance claims, no hashtags in caption text.
    - Ollama only: an end-of-prompt checklist.
    - A copyable example sentence leaked into outputs; it was removed.
  - **Model limits (not prompt issues):** clumsy Hinglish grammar, options too similar, occasional invented details. Hindi Devanagari was correct.
- **Google Trends "Trending now" RSS** (`google-trends-rss.ts`, `SOURCE_GOOGLE_TRENDS_RSS_ENABLED`):
  - **Feed:** the official export, fetched anonymously.
  - **Terms:** robots.txt allows the path. Google says Trends info may be used "subject to the Google Terms of Service", with the citation "Data source: Google Trends". Commercial display at scale is not explicitly covered, so it needs legal review.
  - **Ingest:** 10 real observations stored with correct `observed_at` (feed pubDate), geo IN, `expires_at` (+7 days), and no hashtags. It can never verify a hashtag.
  - **Feed:** one item curated through `/admin` appears in the Ideas feed with honest evidence.
- **Checks:** lint clean, typecheck clean, 75 unit tests passing, build OK, `check:bundle` OK, Playwright 6/6 on a production build.

## Session 3 (2026-10-20): speed, trend-aware captions, Trending now
- **Speed** (measured on the same request): 96 s → 42 s with `llama3.2:3b`. The first caption text is visible after ~4–15 s via streaming.
  - Enabled the Radeon 680M iGPU: user env `OLLAMA_IGPU_ENABLE=1`; Ollama now runs the model 100% on GPU (Vulkan). To undo, delete the variable and restart Ollama.
  - Compact local output format (`LocalCaptionSchema`, expanded and validated by code).
  - No pasted JSON schema in the prompt.
  - `num_ctx` 4096; output budget by requested length (600/900/1200, +300 for Devanagari); `keep_alive` 30m.
  - Streaming: NDJSON from `/api/captions/turn` (`Accept: application/x-ndjson`) with a live Option A preview.
  - `llama3.2:1b` tested: 2× faster but it changed the topic in Hindi and invented advice. Rejected as default (still downloaded).
- **Trend-aware captions** (`src/lib/services/trend-context.ts`):
  - Matches the caption text against fresh (48 h) Google Trends RSS + Wikipedia observations.
  - Refreshes Google RSS when older than 2 h (6 s cap).
  - Matches go to the model labeled "search interest, not social virality"; stored in `messages.context_used` (migration 0001) and shown as "Trend context used".
  - Violent/tragic titles are excluded (`needsReview`). Toggle: "Use current trends as context".
- **Trending now page** (`/app/trending`): fresh real trends with one-click Caption/Brief. Sensitive items are hidden with a count. The prefill asks the creator for their own angle.
- **Packaging check** per option: opening-line length, hashtag count vs the platform rule, current-topic mention. Labeled "not a prediction". No virality probability is shown, by design.
- **Engagement-bait filter:** e.g. "Comment karo warna…", "99% log…" are removed and reported as a limitation.
- **Checks:** lint clean, typecheck clean, 87 unit tests, build OK, `check:bundle` OK, Playwright 7/7 (production build). Live run on Ollama+GPU: trending page → caption with trend context in ~45–100 s.

## Session 4 (2026-10-20): reliability fix + production readiness
- **Bug fixed:** "Something went wrong" while generating. The long-running dev server never applied migration 0001 (new column), so every save failed.
  - Dev/embedded DB now auto-applies new migrations on access. Production still migrates explicitly.
  - Stream errors are now logged (type + stack, no captions). Verified on the user's running server without restart: caption in 31 s.
- **Open-source AI for production:** `src/lib/providers/ai/openai-compatible.ts` (`AI_PROVIDER=groq`).
  - Strict JSON schema, bearer auth, `reasoning_effort=low` for gpt-oss, repair once, typed errors (auth / 429 / 404 / 5xx / network / timeout).
  - Wire-tested against Ollama's /v1. 7 unit tests.
  - UI label "Open-source AI"; mode `open_model`.
- **Production kit:**
  - `/api/health`.
  - Production refuses the embedded DB without `DATABASE_URL`.
  - `render.yaml`: build with dev deps, migrate on start, health check.
  - `.node-version`, an optional GitHub Actions trend refresh, and `DEPLOY.md` (Groq + Neon + Render, all free).
- **Production rehearsal (local):** `NODE_ENV=production` + real Postgres protocol (`@electric-sql/pglite-socket`) + `npm run db:migrate` + `next start`.
  - Health OK; Playwright 7/7.
  - Live caption via the open-model provider with trend refresh; guard verified.
- **Not verifiable here:** real Groq key, Neon, Render (needs the owner's free accounts).

## Session 5 (2026-10-20): LIVE deployment
- **Live:** https://trendsaathi.onrender.com (Render free, Ohio). Repo https://github.com/XansrSuraj/content (main, auto-deploy on push).
  - **DB:** Neon project `content` (frosty-shape-78382503, aws-us-east-2, Postgres 18), pooled connection; migrations applied.
  - **AI:** Groq `openai/gpt-oss-20b` (`AI_PROVIDER=groq`). Google Trends RSS enabled. Demo off. `ADMIN_EMAILS` not set yet (waiting for the owner's email).
- **Live verification** (throwaway account, deleted afterwards):
  - Health OK (postgres + open model).
  - Caption 3.9 s; follow-up "Emoji hata do" 2.0 s with emoji removed; copy + save OK.
  - Trending now shows 10 real items; brief 3.4 s; saved page OK; no page errors.
- Fix after live check: the packaging check measured the whole one-line caption; it now measures the opening sentence.
- Deploy keys live only in `.env.deploy` (gitignored).
- Known model issue (gpt-oss-20b): occasionally invents small facts (e.g. "Camera 7-star", "charge twice a day"). The UI keeps the "check facts before posting" note.

## Session 6 (2026-10-20): chat-app grade Caption Studio
- **Speed:** the creator's message appears instantly. The URL and sidebar update without a reload (`history.replaceState`).
- **Composer:** Enter sends, Shift+Enter adds a new line, and touch keyboards use Enter for a new line. Nothing sends while an IME (Hindi) is composing. The box auto-grows up to 220 px.
- **Stop:** the Stop button and Esc cancel the request. The cancel signal goes through the route, service and providers (Ollama / OpenAI-compatible fetch aborted); nothing is saved and the text goes back to the box.
- **Scrolling:** a separate chat scroll area pinned to the bottom with a ResizeObserver. It stops following when the user scrolls up, and a "↓" button appears.
- **History:** older replies collapse to the recommended caption plus "Show all 3 options & details". There's a "Copy all" button and "↻ Naye options" (regenerate, optional tone), starter prompts on an empty chat, and per-conversation drafts in localStorage.
- **Sidebar:** grouped Today / Yesterday / Previous 7 days / Older, with search. Rename and delete update instantly.
- **Server:** one hashtag-evidence query per conversation load (was one per message).
- **Tests:** the new E2E "chat composer behaves like a chat app" test, 8/8 E2E, 94 unit.

## Session 7 (2026-10-20): three-language UI + professional polish
- **Languages:** the whole app UI is available in English, Hinglish and Hindi (Devanagari). Dictionaries live in `src/lib/i18n/{en,hinglish,hindi}.ts`; `en.ts` is the master and the others are typed `Dict`, so a missing key fails typecheck.
- **How the language is chosen:** `getLang()` checks the `ts_lang` cookie, then `profile.uiLanguage`, then defaults to Hinglish. A switcher is in the landing header, the app header (compact) and Settings (segmented). `setLanguage` saves both the cookie and the profile.
- **App language vs caption language:** these are independent. The app language changes menus and messages; the caption language (in the profile and context panel) decides what the AI writes.
- **Quick-reply chips are translated.** The follow-up parser (`applyFollowUpToContext`) now understands Devanagari and more English phrasings, and a unit test checks that every chip in every language applies its constraint. The "Applied" chips are translated through `studio.appliedLabels`.
- **Polish:** unicode glyphs replaced with lucide icons; a single status indicator in the header; a new logo; settings panel dropdowns no longer truncated (wider panel on xl); chat list actions overlay on hover instead of taking up title width; one-line mobile settings strip; short mobile tab labels.
- **Not translated (intentional):** admin pages; source catalog descriptions; AI/template output metadata (written by the model or the template).
- **Tests:** 102 unit; 8/8 E2E (with `ts_lang=english` pinned through `e2e/fixtures.ts`), including a new test that switches English → Hindi → Hinglish and checks there is no horizontal overflow. Two E2E checks now accept either "trend source off" or real trend data, because the result depends on the env.

## Session 8 (2026-10-20): every free source on, self-refreshing
- **On by default, no keys:** Google Trends RSS, Wikipedia pageviews (India) and a new **Apple Music "Top songs in India"** connector (`src/lib/providers/trends/apple-music.ts`, Apple's public marketing RSS). Each can be turned off with `SOURCE_*_ENABLED=false`. Under `NODE_ENV=test` they default off, so unit tests never hit the network.
- **Wikipedia User-Agent:** Wikimedia asks for a contact URL, so it defaults to `TrendSaathi/1.0 (<APP_URL>; <repo URL>)`. No email is used.
- **Fresh without cron:** the app layout calls `after(() => refreshIfStale(db, …, 20s))`, so every page view refreshes any source past its interval (Google 30 min, Wikipedia 60 min, Apple 60 min), in parallel. Concurrent runs are shared, and a failed source retries after 5 minutes. The Trending page and captions also refresh before reading, with a 6 s limit.
- **Trending now:** Google searches first, then Wikipedia's top 24 in rank order, plus a "Top songs in India" chart (a sticky sidebar on xl screens) with Apple Music links. It's labelled as a streaming chart, not Reels/Shorts audio, and tells creators to pick songs from the platform's own music library.
- **Settings:** sources that no permitted free API can provide (Instagram hashtags, TikTok, Facebook, Google Trends API, in-app Reels/Shorts audio) are grouped under "Not possible without platform approval", with the reason.
- **Demo:** enabled in production through Render env (`TRENDSAATHI_DEMO_MODE` + `TRENDSAATHI_ALLOW_DEMO_IN_PRODUCTION`). It stays labelled and isolated to demo accounts.
- **Still keyed:** the YouTube Most Popular chart needs a free `YOUTUBE_API_KEY` (Google Cloud). There is no keyless official route, and the keyless "Invidious/Piped" mirrors scrape YouTube, so they are not used.
- **Tests:** 105 unit (new `tests/apple-music.test.ts`), 9/9 E2E (new `e2e/sources.spec.ts`).

## Session 9 (2026-10-20): more free, official sources
- **New keyless sources (all on by default, each with an `SOURCE_*_ENABLED=false` switch):**
  - **Apple Podcasts top shows in India.** `AppleChartConnector` now covers both songs and podcasts.
  - **Bluesky trending topics** (worldwide, with post counts), from the public AppView `app.bsky.unspecced.getTrends`.
  - **Mastodon trending hashtags** (mastodon.social, with today's uses).
- **Honesty:** Bluesky and Mastodon are labelled worldwide and "not Instagram/YouTube/Indian audiences". Mastodon rows store no hashtag evidence, so they can never mark an Instagram or YouTube hashtag as observed. Violence/tragedy titles stay hidden from these lists.
- **Rejected after checking:**
  - YouTube channel RSS: `youtube.com/robots.txt` disallows `/feeds/videos.xml` for all crawlers.
  - Invidious/Piped: they scrape YouTube.
  - GDELT: heavy rate limits.
  - Reddit: API terms and cloud-IP blocks.
  - Instagram/TikTok scrapers: they need logins/cookies and break the platforms' terms.
- **Speed:** Apple's feed sometimes takes 30 s or returns 504. The Trending page now waits only for Google and Wikipedia; every chart refreshes in the background via `after()` with 20 s and 2 attempts.
- **Trending page:** India searches and reading (main), songs and podcasts (sidebar), and "Worldwide social chatter" (Bluesky + Mastodon) at the bottom.
- **Tests:** 111 unit (new `tests/social.test.ts`), 9/9 E2E.

## Session 10 (2026-10-20): sports-aware captions (match identification → timing → relevant caption)
- **Domain** (`src/lib/domain/sports/`), pure and tested:
  - `entities.ts`: teams and players with English, Hindi and abbreviation aliases mapped to one id. Aliases marked `~` are weak: everyday words such as "virat", "hardik", "pant", "milan", and country/city names. They only count with a sports signal.
  - `intent.ts`: sport, teams, players, gender, content type (preview/prediction/reaction/analysis/highlights), time reference. "Kal" is resolved by verb tense, otherwise flagged ambiguous.
  - `resolve.ts`: `resolveMatch` filters by sport, gender and both teams, then by the creator's calendar day (timezone-aware) or by content direction. It returns single, ambiguous (ask the creator) or none, and never guesses.
  - `matchStage`: a match is never "live" from the clock alone; that needs a provider status under 20 minutes old.
  - `STAGE_GUIDANCE`: per-stage writing rules.
- **Data:** migration `0002_sports` adds `sports_matches` (shared provider fixtures plus private creator-entered ones), `platform_references` (creator references and admin tool observations/CSV imports, 14-day expiry), `creator_profiles.sports` (sports, favourite teams, timezone) and `messages.sports` (what was used).
- **Fixtures providers** (`src/lib/providers/sports/connectors.ts`, `src/lib/jobs/sports-ingest.ts`), each fetched once per match and shared, with a per-provider interval and daily call cap:
  - **openfootball** (keyless, CC0): Premier League, LaLiga, Bundesliga, Serie A and Ligue 1 schedules plus volunteer-updated results. It is schedule-only, so started matches without a result show as "status unknown". Every current Premier League club is mapped; in the other leagues only the big clubs are.
  - **football-data.org** (`FOOTBALL_DATA_TOKEN`) and **CricAPI** (`CRICAPI_KEY`) switch on automatically when a free key is set. Their mappings are unit-tested against documented shapes but have not been called live (no keys).
  - No keyless official cricket source exists: Cricsheet blocks automated downloads, and the alternatives are scrapers or ESPN's undocumented API. Cricket needs CricAPI or creator-entered matches.
- **Caption flow** (`services/sports-context.ts`): intent → bounded fixture refresh → resolve.
  - The model receives an evidence bundle: a MATCH line (source, checked time, IST start, verified stage), the result if confirmed, the MATCH RULE, a PUBLISH TIME note, "MATCH UNCONFIRMED" or "NO VERIFIED FIXTURE", and matching references.
  - New system-prompt sports rules: no invented scores, injuries, playing XI or records; a prediction is never turned into a result; no unmentioned players.
  - Team names also sharpen the search-trend match. The trend matcher now ignores generic words ("match", "india", "games") and needs at least half of a title's specific words.
- **Multi-platform:** the "Also create for" setting (up to 2) makes the same request return `platformVersions`, enforced per platform hashtag limit. The template copies option A; the local model returns none.
- **Hashtag labels:**
  - Platform trend = existing verified evidence, plus admin #tag observations from a platform tool for that platform, for 72 hours.
  - Search interest rising = the tag's letters equal a Google search trend from the last 48 hours.
  - Relevant suggestion = everything else.
- **UI:**
  - Profile: sports, favourite teams and timezone.
  - Studio settings: publish time (now/schedule), "Also create for", and a references box (labelled "your reference — not verified").
  - Result card:
    - Match context panel: stage badge, start time in the creator's timezone, source and checked time, and a "schedule only" or "entered by you" label.
    - "Which match?" picker; "Not listed? Add match details" form, which saves and regenerates with that match.
    - Freshness check: on copy, on window focus, and when the card loads, it re-reads the match stage and shows "Match context changed → Refresh caption".
  - Admin: "Platform evidence (manual)" form (TikTok Creative Center, Reddit Pro Trends, YouTube Studio Trends, Instagram Reels trends) and a Google Trends "related queries" CSV import (YouTube Search filter).
- **Not built:** Cloudflare Workers/D1. The existing `after()` refresh plus the shared Postgres already gives "fetch per match, generate per creator" at ₹0, and there's no extra account to manage.
- **Tests:** 136 unit (new `sports.test.ts` and `sports-pipeline.test.ts`), 10/10 E2E (new `e2e/sports.spec.ts`). A real openfootball fixture (Arsenal vs Everton) attaches automatically as "Upcoming · 24 Oct 7:30 pm IST".

## Session 11 (2026-10-21): sports-only product, Gemini, cleanup
- **AI:** production runs Gemini `gemini-3.5-flash-lite` through the OpenAI-compatible provider (details in docs/tasks/sports-captions-PROGRESS.md). The badge now says "Hosted AI", not "Open-source AI".
- **Sports only:**
  - Sports is the only selectable niche; every other niche shows as "Coming soon" (onboarding, settings).
  - Profiles always save `["sports"]`. The Ideas feed (and Home) only shows ideas tagged `sports`, and the Ideas category filter is gone.
- **Trending now:**
  - New "Upcoming matches" section with fixtures from OpenLigaDB/openfootball, each with a one-click caption link.
  - Google Trends, Wikipedia, Podcasts, Bluesky and Mastodon items are filtered by `isSportsTopic` (`src/lib/domain/sports/intent.ts`). Non-sports items are counted ("N other trends left out").
  - The Apple Music songs section was removed. Ingestion stays, because captions' evidence can still use it after relevance gates.
- **`isSportsTopic` rules:**
  - Counts as sports: unambiguous sport words, strong team/competition aliases, a player's full name, or two weak team names with "vs".
  - Does not count: a country name alone, or a lone surname ("Williamson", "माही").
  - Checked on live Google Trends and Wikipedia titles.
- **Home:** upcoming matches first; ideas only when there are any.
- **Demo data:**
  - Seven sports ideas plus a gully-cricket example conversation. All are generic: no real people, scores or news.
  - Old demo ideas are archived, not deleted, on reseed. The reseed also runs when the fixture list changes.
- **Copy:** landing page, Caption Studio starters and placeholder, and brief audience hints are sports examples in all 3 languages.
- **Cleanup:**
  - Removed unused code: `findTrendContext`, `applyDemoProfile`, `CONFIDENCE_COPY`, `NOT_VERIFIED_NOTICE`, `CaptionModelOutput`, `usageSince`, `topSongs`, `SPORTS_SOURCE_NAME`, plus unused i18n keys.
  - Removed the Next.js boilerplate SVGs from `public/`, and local logs, screenshots and test results.
  - Database tables are untouched (migrations stay additive).
- **Tests:** 250 unit (new `sports-topic.test.ts`, `sports-only.test.ts`); E2E 12 passed, 1 skipped.

- **YouTube (2026-10-21):**
  - `YOUTUBE_API_KEY` is set on Render. The connector asks for the Sports category (17) chart in India and keeps Sports-category or sports-titled videos at their real chart position.
  - The chart is shown on Trending as "Top sports videos on YouTube (India)", with YouTube attribution.
  - VERIFIED LIVE: 39 of 50 videos kept (ISL, LaLiga, UCL, cricket), and the source is fresh in `/api/health`.
- **Safety filter:** sports terms are no longer hidden as violent events ("Kerala Blasters", "death overs", "dead rubber", "attacking", "shooting drills"). Real event words are still hidden.
- **Tests:** 260 unit; E2E 12 passed, 1 skipped. One full E2E run timed out on a slow hotspot connection; the timed-out tests passed on rerun.

- **football-data.org (2026-10-21): VERIFIED LIVE.**
  - `FOOTBALL_DATA_TOKEN` is set on Render; the forced ingest stored 121 matches.
  - Fixed: the free tier's 10-day window was being spent on the past 10 days. It now covers yesterday plus the next 9 days.
  - Fixtures from different providers now merge by team name when teams are outside the seed (distinctive words, German city names mapped, generic words like "United" ignored, 3 h window).
  - Older duplicate rows are collapsed at read time (`dedupeFixtures`).
  - When a live-status provider takes over a row, it also becomes the row's source and supplies the names. Cards now read e.g. "FC Internazionale Milano vs FK Shakhtar Donetsk · Source: football-data.org".
- **CricAPI: NOT SET.** cricketdata.org rejected the key in `.env.deploy` ("Invalid API Key"); it is not in the usual UUID format. It was left off Render until the owner re-copies it.

## Next steps
- Optional free keys for live status: `CRICAPI_KEY` (cricketdata.org) and `FOOTBALL_DATA_TOKEN` (football-data.org).
- Optional: add a free `YOUTUBE_API_KEY` on Render to enable the YouTube chart.
- Set `ADMIN_EMAILS` on Render to the owner's email.
- Optional: make the GitHub repo private; add GitHub Actions secrets for background trend refresh.
- Multi-platform pack (Reels caption + Shorts title/description in one go) once generation is faster.
- Optional bigger local model on GPU (e.g. a 7B) if RAM allows; compare with the eval.
- See docs/FUTURE.md → "Next priorities".
