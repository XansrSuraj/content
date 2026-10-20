# Sports Caption Optimiser — PROGRESS

**Current phase:** Final — eval, deploy, live verification (Phases 0–10 done)
**Spec:** `docs/tasks/sports-captions.md`
**Last updated:** 2026-10-21

---

## Phase 0 — Audit

### Critical check: production database — OK (not critical)
- Production uses **persistent Neon Postgres** through `DATABASE_URL`, which is set on Render (key present; value not read).
- `/api/health` on https://trendsaathi.onrender.com reports `"db":"postgres"`. Checked 2026-10-20.
- The app refuses embedded PGlite in production unless `TRENDSAATHI_ALLOW_EMBEDDED_DB_IN_PRODUCTION=true`, which is not set on Render.
- Migrations run on every start (`render.yaml`: `npm run db:migrate && npm start`).
- No data loss on restart.

### Architecture and caption flow (as built)
- **Stack:** Next.js 16 App Router, React 19, Drizzle ORM (node-postgres in production, PGlite in dev/tests), zod everywhere, Tailwind tokens, i18n in English/Hinglish/Hindi.
- **Flow:** `POST /api/captions/turn` (NDJSON stream) → `runCaptionTurn` in `src/lib/services/captions.ts`:
  1. Profile and context are merged, and the follow-up parser applies chip constraints.
  2. AI quota check (`security/rate-limit.ts`).
  3. `buildSportsContext`: deterministic intent → **bounded 6 s fixture refresh** → resolver → evidence notes.
  4. `findTrendContext`: Google/Wikipedia matcher, also with a bounded refresh.
  5. **One** structured LLM call: 3 variants, hooks, hashtags, `platformVersions`.
  6. `enforceConstraints`: emoji, locked first line, engagement bait, preserved terms, platform hashtag limits.
  7. Saved per user.
  8. Hashtag status is computed at read time from stored evidence (platform trend / search interest / suggestion).
- **AI in production:** OpenAI-compatible provider → **Groq `openai/gpt-oss-20b`**, strict JSON schema, `reasoning_effort` low.
  - Live-measured latency ≈ 2–4 s per caption (earlier sessions); cost ₹0 on the Groq free plan.
  - Groq free-plan limits for this model were **not verifiable**: the docs page shows only Developer-plan base limits (30 RPM / 1K RPD / 8K TPM / 200K TPD), https://console.groq.com/docs/rate-limits, checked 2026-10-20. Treat them as unverified and configurable.
  - Anthropic and Ollama providers exist but are not used in production.
- **Sports work already present** (built last session and live):
  - Hard-coded aliases in `src/lib/domain/sports/entities.ts`, intent parser, resolver, `matchStage`, `STAGE_GUIDANCE`.
  - Tables `sports_matches`, `platform_references`, `creator_profiles.sports`, `messages.sports`.
  - Connectors: openfootball (keyless), football-data.org (key), CricAPI (key).
  - Creator add-match form, which-match picker, copy-time freshness check, admin manual observations, Google Trends CSV import, three hashtag labels.
  - This spec builds on that. Gaps are listed per phase below.

### Scheduled refresh — does NOT survive Render sleep
- Refresh runs only **in-process**: `after()` in `src/app/app/layout.tsx` on each signed-in page view, plus bounded refreshes inside caption and Trending requests.
- Render free web services **spin down after 15 minutes without traffic**, and spin-up takes about 1 minute. There are **750 free instance hours per month**, and services are suspended when they run out (https://render.com/docs/free, checked 2026-10-20).
- Nothing refreshes while asleep. The first visitor after sleep gets data up to hours old, which is then refreshed in the background.
- `.github/workflows/refresh-trends.yml` exists and is "active", but the GitHub API shows **0 runs ever** (checked 2026-10-20), and its repository secrets (`APP_URL`, `INGEST_SECRET`) are not set, so it would skip anyway.
- GitHub Actions: the shortest schedule is 5 minutes, runs may be delayed or dropped under load, and scheduled workflows in public repos are disabled after 60 days without repo activity. Source: https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows#schedule, checked 2026-10-20.

### Existing sources: what each one actually measures

| Source | Measures | Region | Freshness (our refresh) |
|---|---|---|---|
| Google Trends "Trending now" RSS | Google web-search surges, approximate traffic bucket | India | Feed updates continuously; we refresh at most every 30 min |
| Wikimedia pageviews (top per country) | Wikipedia reading interest, whole days, rounded up | India | Daily data, about 1 day behind; checked hourly |
| Apple Music most-played | Streaming chart | India | Hourly |
| Apple Podcasts top shows | Podcast listening chart | India | Hourly |
| Bluesky `getTrends` | Topics trending on Bluesky, with post counts | Worldwide, English-heavy | 30 min |
| Mastodon `trends/tags` | Trending tags on **mastodon.social only** (not all of Mastodon) | Worldwide | 30 min |

Only Google and Wikipedia are given to the caption model; the rest are display-only.

### Platforms already in the app
`instagram_reels`, `instagram_post`, `youtube_shorts`, `youtube` (long-form), `facebook_reels`, `facebook_post`, `tiktok`. Hashtag rules are stored per platform with a status (official/unverified); caption and title limits are **not** yet modelled per field.

### Tests today
- 136 unit/integration tests (vitest + PGlite with real migrations).
- 10 Playwright E2E tests (desktop, plus one mobile layout test).
- LLM eval script: `scripts/eval-captions.ts`; `eval-output/` is gitignored.
- **Gaps against the spec's test list:**
  - Ambiguous aliases (MI, "United", "Real", Ronaldo CR7/R9).
  - Same two teams twice in 7 days.
  - Historical highlights ("2016 wali century").
  - The 23:50 IST and UTC/IST-boundary cases.
  - Scheduled post after expected finish.
  - Postponed/cancelled matches.
  - 429 + Retry-After; failed refresh must not overwrite good cache.
  - The RCB-vs-MI irrelevant-trend case.
  - YouTube title/description and platform CTA switching.
  - Output validator, language consistency.
  - Mobile E2E of the full sports flow.
  - Sports eval cases.

### Provider research (official pages, checked 2026-10-20)

| Provider | Coverage relevant to us | Free tier | Delay | Commercial use | Signup |
|---|---|---|---|---|---|
| **CricketData.org (CricAPI)** — https://cricketdata.org/pricing/ | Cricket; coverage per competition (IPL/WPL/women's) **not stated** on the pages checked | **100 hits/day** ("Lifetime Free"); next tier $5.99/mo for 2,000/day | "always a few minutes behind real-time" | **Not stated** on the pages checked (Terms page not readable) → unverified | Required (owner must sign up) |
| **football-data.org** — https://www.football-data.org/pricing, https://www.football-data.org/coverage | Free: Champions League, Premier League, La Liga, Bundesliga, Serie A, Ligue 1, Eredivisie, Primeira Liga, Championship, Brazil Serie A, World Cup, Euros (12). **No ISL.** | **10 calls/minute**; no daily cap stated | Free tier: "Scores delayed", "Schedules delayed" (live = €12/mo) | **Not stated** (terms URL 404) → unverified | Required (owner must sign up) |
| **OpenLigaDB** — https://www.openligadb.de/ | Community-maintained. Current seasons include **Premier League (`pl` 2026), LaLiga (`la1` 2026), Champions League (`ucl` 2026)**, Bundesliga. No cricket. | Free, **no key, no signup**; no rate limit stated | Varies by league. Live check: UCL results updated about 30 min after kick-off; PL and LaLiga matches from 18–19 Oct had **no results yet** | Data under **ODbL** (attribution + share-alike for derived databases); full terms page not readable → treat as attribution required | None |

- **Decision:** include **OpenLigaDB** as the keyless football source. It covers the Champions League (fresh) plus Premier League and LaLiga schedules, which our audience follows.
- Results from OpenLigaDB and openfootball are labelled "community data, may lag". "Live" is never inferred from them.
- openfootball stays as a schedule backup.
- **Cricket:** no keyless official source exists. Cricsheet blocks automated downloads behind a bot check, and the alternatives are scrapers or ESPN's undocumented endpoints, which are not allowed. Cricket fixtures need the owner's free CricAPI key; until then, creators can enter the match themselves.

### Free-tier budget plan (shared cache: fetch per match, generate per creator)
- **CricAPI**, hard cap **90/day** of 100:
  - Fixture lists (`matches`, `currentMatches`): 2 calls every 3 h = 16/day.
  - Status for matches creators have attached that are inside their play window: 1 call every 10 min, at most 36/day.
  - Details reserve 20, retries reserve 10.
  - Live polling frequency is halved automatically as the cap approaches.
- **football-data.org**, self-cap **150/day**, at most 6/min:
  - One `/v4/matches` call (all 12 competitions) every 30 min = 48/day.
  - 10-minute polling during attached match windows, at most 60/day.
- **OpenLigaDB** (no stated limit, polite self-cap 120/day): 4 leagues every 2 h = 48/day; 10-minute polling only for leagues with an attached match in its window.
- **Groq:** 1 generation per request. An LLM extraction call happens **only** when deterministic confidence is low, and repairs are capped at 2. Expected about 1.1 calls per caption, with existing per-user daily caps.
- Usage is tracked in Postgres (`provider_usage` per provider per UTC day/minute) and shown in Admin.

---

## Plan (phases from the spec, adjusted to what exists)

1. **Domain model + entity resolution**
   - Additive tables: `sports`, `competitions` (season, format, category), `teams`, `players`, `entity_aliases` (alias, script, type, id, `ambiguous`).
   - New columns on the existing `sports_matches` (`competition_id`, `season`, `category`, `venue`, `provider_ids`, `fetched_at`, `verified_at`, `freshness_policy`). These are added to the existing table rather than a new `matches` table, to avoid two sources of truth.
   - Seed data moves into a reviewable file `src/lib/domain/sports/seed/*.ts`: all IPL and **WPL** franchises, men's and women's national teams, star players, and clubs, with ambiguity flags for MI, United, Real, City, King and Ronaldo.
   - Intent v2:
     - Intents: preview, prediction, analysis, reaction, recap, historical_highlight, meme, fan_opinion.
     - Time words: parso, aaj raat, tonight; explicit years → historical.
     - Per-field confidence, missing fields, language detection.
   - The resolver gets scoring and confidence; when the subject is unclear it asks one question.
2. **Providers**
   - Common adapter (`listFixtures`, `getMatch`, `getStatus`, `health`) for CricAPI, football-data.org and **OpenLigaDB** (new), with openfootball as backup.
   - Postgres quota ledger, status mapping, freshness per data type.
3. **Evidence bundle + relevance gates**
   - An `evidence_observations` view/model with the 5 categories and the full metadata.
   - Gates: same entity, timeframe, region, no misleading claim, sensitive facts only from verified match facts.
   - "No relevant current trend found" note with the reason.
4. **Platform adapters + pipeline**
   - Config-driven adapters with **officially verified limits and source URLs**. Unverified values stay configurable and flagged.
   - **New result schema v2:** per platform, a recommended result plus 2 typed alternatives (original-improved / search-focused / conversation-focused), each with a "why". YouTube gets `title` + `description`; Instagram/Facebook/TikTok get `caption`.
   - Older stored results keep rendering with the v1 card.
   - Caption requests stop doing live provider calls: cached data only (moved from today's bounded refresh).
   - Facts and match identity are carried into every follow-up.
5. **Hashtags:** candidates from confirmed entities; two groups ("Relevant suggestions" / "Seen in a source"); de-duplication and case-variant removal; filler blocklist (#viral, #fyp, #trending, #explore…); per-platform count from the adapter.
6. **Validator:** deterministic checks for entities, extra names, numbers not in the evidence, tense versus stage and publish time, language/script, field limits and platform terminology, banned claims. Up to 2 targeted repairs, then a conservative fallback.
7. **Resilience + scheduling**
   - Last-known-good snapshots; per-source jobs with timeout, backoff with jitter, Retry-After, DB lock, circuit breaker.
   - "Empty" is distinguished from "error", and good cache is never overwritten by a failed fetch.
   - **Scheduler:** fix the GitHub Actions workflow, which calls the secret-protected ingest endpoint. **The owner must add 2 repo secrets** (steps will be in the report).
   - With an active 24/7 schedule the service stays awake about 744 h in a 31-day month, under the 750 h limit, with one free service in the workspace.
8. **UX:** paste → platforms (multi, required) → "More details" (collapsed) → editable interpretation chip → match selector/one question only when needed → per-platform tabs, alternatives collapsed, two hashtag groups, per-field copy. Mobile-first, all 3 UI languages.
9. **Feedback + diagnostics:** ID-only events (generation_succeeded, match_corrected, recommended_copied, hashtags_copied, caption_edited, marked_useful/not_useful). Admin per-source diagnostics: last success/failure, latency, cache age, circuit state, quota used/remaining.
10. **Manual references:** CSV import and admin observations already exist; a pasted URL will now **require a short description** and be labelled creator-provided/admin-observed. Tests will be added.

## Riskiest parts
1. **Result schema v2 plus the validator/repair loop.** It's the biggest change to the core flow and could raise Groq usage; repairs are bounded and older results stay readable.
2. **Groq free-plan limits are unverified.** Extra calls (extraction, repairs) could hit them; everything is configurable and has a fallback.
3. **Community football data (OpenLigaDB/openfootball) lags for PL/LaLiga.** Labelled "may lag"; never treated as live.
4. **Cricket without the owner's key:** creators enter matches, labelled "entered by you".
5. **The scheduler depends on the owner adding GitHub secrets.** Without them, refresh is still only on page views.
6. **UX restructure of Caption Studio** while keeping chat history, follow-ups and E2E working.
7. **Alias ambiguity (MI, United, Real):** a wrong auto-pick would be the most damaging error, so ambiguous aliases always go through the selector.

## Decisions
- OpenLigaDB included: keyless, and covers UCL/PL/LaLiga, which our audience needs.
- Extend `sports_matches` rather than create a parallel `matches` table: additive, and one source of truth.
- No Cloudflare Workers/D1: the GitHub Actions scheduler plus the existing Neon Postgres covers it at ₹0 with no new account.

## Open issues (need owner)
- Owner OK on this plan (checkpoint).
- Later: owner-created free keys (`CRICAPI_KEY`, `FOOTBALL_DATA_TOKEN`) and 2 GitHub repo secrets for the scheduler.

---

## Phase 1 — Domain model + entity resolution: DONE (2026-10-20)
- **Seed files** (reviewable data, no logic): `src/lib/domain/sports/seed/{types,cricket,football}.ts`.
  - Cricket:
    - men's and women's national teams;
    - all 10 IPL and 5 WPL franchises;
    - MI Emirates, MI Cape Town and MI New York (the reason plain "MI" is ambiguous);
    - 39 players with nicknames ("Thala", "Hitman", "King Kohli", "Virat bhai", "कोहली").
  - Football: every 2026/27 Premier League club, the big LaLiga/Bundesliga/Serie A/Ligue 1/UCL clubs, ISL clubs, national teams and stars (CR7, R9, Messi…).
  - Competitions: IPL, WPL, international men's and women's, World Cups, Asia Cup, PL, LaLiga, UCL, ISL…
  - `~` marks weak aliases (everyday words). The `AMBIGUOUS_ALIASES` list (MI, King, United, City, Real, Ronaldo) carries per-candidate context clues.
- `entities.ts` is now only an index over the seed files. Provider-name matching ignores club affixes ("FC Arsenal" = "Arsenal FC") and handles women's teams.
- **Intent v2** (`intent.ts`):
  - Intents: preview, prediction, analysis, reaction, recap, historical_highlight, meme, fan_opinion.
  - Time: aaj, aaj raat/tonight, kal and parso (decided by tense, else ambiguous), last/next match, explicit dates, past years → historical.
  - Also: competition, category (men/women/youth, mapping teams to their women's versions), language detection, per-field confidence, ambiguities, at most one targeted question.
  - Common-word ambiguous aliases (real, city, united, king) need a sport-specific signal.
- **Resolver v2** (`resolve.ts`):
  - Never picks the nearest fixture; two candidates go to the selector, and only an explicit "next/last match" picks the nearest.
  - Historical highlights never attach; recap, reaction and analysis need a match that has started; preview and prediction need one that hasn't.
  - An unresolved ambiguous alias always goes to the selector.
  - Competition filter.
  - `writingStage`: a post scheduled after kick-off with an unknown result is written neutrally.
  - Freshness: provider "live" is trusted for 20 minutes; "scheduled" data older than 48 hours becomes unknown.
- **DB** (migration `0003_sports_entities`, additive):
  - New tables: `sports`, `competitions`, `teams`, `players`, `entity_aliases` (alias, script, type, entity, weak, ambiguous), synced from the seed on every migrate.
  - New `sports_matches` columns: `competition_id`, `season`, `category`, `venue`, `provider_ids`, `fetched_at`, `verified_at`, `freshness_policy`.
- **Tests:** 159 unit tests passing. New `tests/sports-resolution.test.ts` covers every ambiguous case in the spec:
  - MI; Man U vs United; Ronaldo CR7/R9;
  - Ind vs Aus men's and women's in the same week; same teams twice in 7 days;
  - the 2016 century; kal at 23:50 IST; the UTC/IST boundary;
  - post after kick-off; postponed, cancelled and stale status;
  - common-word aliases; seed sync.
- **Open issue for Phase 2:** the same match from two providers must merge into one canonical row (otherwise it would look like "same teams twice").

## Phase 2 — Match data providers: DONE (2026-10-20)
- **Common adapter `MatchProvider`** (`src/lib/providers/sports/connectors.ts`):
  - Methods: `listFixtures(range)` and `getMatch(providerId)`; `health()` is the catalog's `sourceStatus` (enabled / requires configuration).
  - Each provider declares its budget (day/minute), its intervals (normal / in-play) and whether it reports live status.
- **`getJson` semantics:** 404 = empty; 429 = `RateLimitedError` carrying Retry-After seconds; 5xx = retryable; other errors fail.
- **Providers:**

  | Provider | Status | Evidence |
  |---|---|---|
  | OpenLigaDB (keyless, new) | **VERIFIED LIVE** 2026-10-20 18:12 UTC | 138 fixtures (PL 34, LaLiga 37, UCL 38, Bundesliga 29). After adding German-name aliases, 100% of PL/LaLiga/Bundesliga and 30/38 UCL fixtures map to known teams. UCL results ~30 min after full time; PL/LaLiga results lag days (community). Treated as `schedule_only`, never live. |
  | openfootball (keyless backup) | **VERIFIED LIVE** 2026-10-20 18:12 UTC | 182 fixtures; schedules only (last data update 2026-09-22). |
  | football-data.org | **IMPLEMENTED, NEEDS KEY** (`FOOTBALL_DATA_TOKEN`) | Unit-tested against the documented v4 shape (list + `getMatch`, status mapping, competition codes). Not called live. |
  | CricAPI / CricketData.org | **IMPLEMENTED, NEEDS KEY** (`CRICAPI_KEY`) | Unit-tested (`currentMatches` + `matches`, `match_info`, women's mapping, IPL/WPL/intl competition detection). Not called live. |

- **Quota ledger:** table `provider_usage` (migration `0004`); `reserveCalls()` enforces day and minute budgets shared by all users before every fetch. Budgets: OpenLigaDB 120/day, openfootball 40/day, football-data 150/day + 6/min, CricAPI 90/day.
- **Scheduling per provider:**
  - Normal interval: OpenLigaDB 2 h, openfootball 6 h, football-data 30 min, CricAPI 3 h.
  - In-play interval (a stored match of that provider is within kick-off − 15 min … + expected duration): 15 / – / 10 / 10 min.
  - The interval doubles once 80% of the day's budget is used.
- **Canonical matches:**
  - The same fixture from two providers (same sport, category and team pair either way round, start within 6 h) is one row with `provider_ids` holding both.
  - Status follows authority (live-status provider > schedule-only > creator), so community data can never override football-data.org's live status.
- **Failure handling:** a failed refresh keeps last-known-good rows and `last_success_at`; an empty response counts as a success with 0 items.
- **Tests:** 168 unit tests passing (new `tests/sports-providers.test.ts`).

## Phase 3 — Evidence bundle + relevance gates: DONE (2026-10-20)
- **Categories** (`src/lib/domain/evidence.ts`): `match_fact`, `search_interest`, `platform_observation`, `creator_reference`, `generated_suggestion` (the model's hashtags, shown in the hashtag section).
- **Fields on every evidence item:** source, source URL, platform, region, language, metric {name, value, **scope** — what the number actually measures}, observed_at, checked_at, expires_at, origin (auto/creator/admin), related entities (match/teams/players/competition).
- The bundle is stored per answer in `messages.evidence` (migration `0005`) and shown grouped by category in the new "Evidence used" section.
- **Metric scopes, stated honestly:**
  - Google = "web searches in India, approximate bucket";
  - Wikipedia = "pageviews from India for one UTC day, rounded up";
  - Mastodon = "mastodon.social only";
  - Bluesky = "Bluesky only".
- **Relevance gates** (`gateEvidence`), all of which must pass:
  1. not expired at the posting time;
  2. not too old for the posting time (Google 48 h, Wikipedia 72 h, references 14 days);
  3. audience region;
  4. charts/social (Apple Music/Podcasts, Bluesky, Mastodon) only when the caption names that exact item;
  5. sports: same entity (team, player or competition), and no extra team or player — this is what rejects an unrelated star or another team's tag on an RCB vs MI caption;
  6. never an unverifiable claim (injury, lineup, transfer, record…);
  7. result-type claims only with a verified, completed provider match.
- Keyword overlap alone never passes for sports captions, which are matched on entities.
- **Rejected items** that looked related are listed under "Left out (n)" with the reason, and are never sent to the model.
- **No relevant trend:** "No relevant current trend found" plus the reason (turned off / left out because … / nothing about this subject).
- **References:** they moved from `sports-context` into the bundle. A creator's reference topic is read in the caption's sport. Search titles keep strict reading, so "India at the Asian Para Games" can't attach to a cricket caption.
- The caption path reads search data from the cache only (no refresh call), and `match notes` now use `writingStage` (posting time).
- **Tests:** 175 unit tests passing (new `tests/evidence.test.ts`); E2E 10/10.

## Phase 4 — Platform adapters + generation pipeline: DONE (2026-10-21)
- **Platform adapters** (`src/lib/domain/platform-adapters.ts`), one per in-app platform: output fields, length limits with source and check date, hashtag placement, CTA style, tone notes, forbidden other-platform wording.
- **Verified limits** (checked 2026-10-21):
  - YouTube title 100 / description 5,000 — official, https://support.google.com/youtube/answer/57404.
  - Instagram caption 2,200 characters, 30 hashtags, 20 mentions — official, https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media. The Instagram hashtag rule was updated from "5, unverified" to "30, official"; copy still defaults to 5 because of reports of a newer in-app limit of 5.
  - Facebook text 63,206 and TikTok caption 2,200 — **unverified** (only third-party sources); configurable, shown with "limit not officially confirmed".
- **Result v2** (`captions.ts`): the model returns `platforms[]` (primary first). Each platform has `recommended` and exactly 3 options: `original_improved`, `search_focused`, `conversation_focused`, each with title/description/caption, hashtags and why. YouTube fills title + description; other platforms fill a caption.
  - `CaptionResultSchema` preprocesses v2 into the older fields (variants A/B/C, platformVersions), so history, saving, the compact view and old stored results keep working.
  - `enforceConstraints` keeps only the requested platforms (primary first) and cleans every option: bait, in-text hashtags, emoji, locked first line, per-platform hashtag limit.
- **Prompt:** each platform's rules (fields, maxLength, hashtag max and placement, CTA, tone, `neverSay`) go into `<context>`. The system prompt covers the 3 option kinds, per-platform fields, never using another platform's wording, keeping the language everywhere (including Devanagari/Hinglish purity), and no invented experiences, giveaways, shoutouts, insider access or #viral/#fyp-style filler.
- **Pipeline:**
  - The caption request no longer calls any fixture or trend provider: cached data only. A test asserts that `fetch` is never called during a caption.
  - A confidently resolved match is pinned to the conversation (`context.matchId`), so follow-ups keep the same match and facts.
  - An unclear subject (e.g. "MI") becomes **one targeted question**: an UNCLEAR SUBJECT note to the model, with the options stored on the message.
  - **Decision:** no separate LLM extraction call. Deterministic extraction plus one question covers the spec's cases, and this saves Groq quota — about 1 generation per caption, with up to 2 repairs coming in Phase 6.
- **Follow-up chips** (all 3 languages): Shorter · More natural Hinglish · Keep my first line · Remove emoji · Less promotional · "Focus on <player>" (when the video names one) · Change platform (opens the platform picker). The parser handles natural-Hinglish and focus notes.
- **UI:** platform tabs; recommended option first, 2 alternatives collapsed; YouTube title + description fields; character counter against the verified limit (marked when unverified); "why"; copy per field (title, description, caption, hashtags, all); edit and save. Match facts in the evidence list now show start time, status-checked time and source.
- **Tests:** 183 unit (new `pipeline-v2.test.ts`, `platform-adapters.test.ts`); E2E 10/10 (updated for v2: "Recommended" badge, YouTube tab with title/description copy buttons).

## Phase 5 — Hashtags: DONE (2026-10-21)
- `src/lib/domain/hashtag-builder.ts`:
  - **Candidates from confirmed content:** fixture tag (#RCBvsMI), both teams, competition, players the creator mentions, video type (#MatchPreview / #MatchPrediction / #MatchHighlights / #MatchAnalysis / throwback), sport.
  - **Cleaning:** case-variant duplicates removed; a filler blocklist (#viral, #fyp, #foryou, #trending, #explore, #explorepage, #reels, #instagood, like4like…); `#Shorts` only on YouTube.
  - **Mismatched entities:** each tag is split into words (#CSKvsDC → "CSK vs DC") and read with the entity rules; a tag naming a team or player the video isn't about is removed.
  - **Count per platform** = the platform's editorial copy default, never above its hard limit (Instagram 5, YouTube 3, Facebook 3, TikTok 4).
- `finalizeHashtags` runs on every answer: each platform option gets entity tags first plus the model's surviving tags. Suggestions get the same cleaning and keep their reasons ("Team in your video", "Competition", "Player you mention", or the model's reason). The older variant/platformVersion fields are re-derived.
- **UI:** two separate groups. "Relevant suggestions" has expandable "Why these hashtags". "Seen in a source" holds platform evidence, search interest and demo items, each with its source and time. There are no counts or volume anywhere.
- **Tests:** 188 unit tests passing (new `tests/hashtag-builder.test.ts`).

## Phase 6 — Output validation: DONE (2026-10-21)
- **`src/lib/domain/validate-output.ts`**: deterministic checks on every option of every platform.
  - `extra_entity`: a team or player not in the video/resolved match.
  - `result_claim`: a result or score when no verified result exists for the posting-time stage (allowed only with a verified completed provider match, or when the creator's own text states it).
  - `timing_claim`: "live" or "aaj ka match" when the stage is unknown or upcoming.
  - `unsupported_number`: any 2+ digit number, or a number with a sports/stat unit, that is not in the caption or evidence.
  - `language_mix`: Devanagari in Hinglish output unless the creator used it; an English sentence (5+ Latin words) in Hindi output.
  - `missing_field` / `too_long` against official limits only; `platform_wording` from the adapter's forbidden list.
  - `hashtag_issue`: duplicates or filler.
  - `banned_claim`: giveaway, shoutout/follow-back, insider access, virality promises, invented first-person experiences, or an injury/lineup/transfer/record not in the caption or evidence.
- **Repair:** for AI output (`live_ai` / `open_model`), up to **2** targeted repair calls. Each sends `<validation_issues>` (platform / option / field / problem / sentence) plus the previous answer; the attempt with the fewest issues is kept, and repair calls are recorded in usage.
- **Fallback:** if issues remain, or for template/local output, `safeResult` removes only the failing sentences, trims over-long fields, drops filler/duplicate tags, never leaves a required field empty (falls back to the creator's own words) and adds a limitation note. `syncLegacyFields` re-derives the older fields.
- **Tests:** 198 unit tests passing (new `tests/validate-output.test.ts` covering every spec validator case plus the repair loop); E2E 10/10.

## Phase 7 — Resilience + scheduling: DONE (2026-10-21)
- **Requests never wait on external sources.** Captions (Phase 4) and now the Trending page read last-known-good data from Postgres; tests assert that no `fetch` happens.
- **`src/lib/jobs/guard.ts`**, used by trend and sports ingestion:
  - DB lock (`sources.locked_until`), so a source is never refreshed twice at once, even across instances.
  - Exponential backoff with ±50% jitter between attempts.
  - 429 → `RateLimitedError` (now shared by trend feeds too): never retried immediately; the source is paused for exactly its Retry-After.
  - Circuit breaker: after 3 consecutive failures the source pauses 30 min, doubling up to 6 h; a success resets it. Manual admin runs ignore the pause.
  - `last_latency_ms`, `last_failure_at` and `consecutive_failures` are recorded (shown in admin diagnostics in Phase 9).
- **No overwriting good cache:** a failure only changes counters, `last_error` and `paused_until`; `last_success_at` changes only on real success; empty ≠ error.
- **Per-source independence:** each source runs its own job (parallel, separate lock and circuit); one failing source doesn't affect the others (tested).
- **Freshness:** live status is trusted for 20 min, scheduled data for 48 h, final results long-term (`matchStage`); expired observations are gated out (Phase 3).
- **Scheduler:** `.github/workflows/refresh-trends.yml` calls `POST /api/jobs/ingest` every 10 min, waits for a sleeping instance to wake (150 s timeout, one retry), prints only per-source statuses, and doesn't overlap runs.
  - Checked: `INGEST_SECRET` is set on Render and ≥ 32 chars, so the endpoint is enabled (value not read out).
  - **NEEDS OWNER:** add repo secrets `APP_URL` and `INGEST_SECRET`. Until then each run exits with "Secrets not set; skipping" (status: IMPLEMENTED, NOT YET RUNNING).
  - Render free tier: a 10-min ping keeps the service awake ~744 h in a 31-day month (limit 750 h per workspace; https://render.com/docs/free) — so no second always-on free service in that workspace.
  - GitHub may delay scheduled runs and disables schedules after 60 days without repo activity.
- **Data scope:** public match/source data is shared; captions, evidence bundles and references stay user-scoped (isolation test added).
- **Tests:** 207 unit tests passing (new `tests/resilience.test.ts`).

## Phase 8 — UX flow: DONE (2026-10-21)
- **First turn** (`flow.tsx` `StartPanel`):
  - Paste caption (composer, required).
  - "Post to" platform multi-select: required, up to 3, the first pick is the main platform. It keeps at least one selected and stays in sync with the settings panel.
  - Collapsed "More details (optional)": one-line video description, transcript, post now/schedule, team or competition to focus on, a reference/trend to use (described in words, labelled creator-provided), and language/tone/region overrides.
- **Details** live in `context.details` and are kept for follow-ups. They feed entity/intent extraction and go to the model as `<video_details>` (treated as data); the reference becomes a "creator-provided, not verified" evidence line.
- **Interpretation chip** above the newest answer ("Understood as: Cricket · RCB vs MI · Match preview · Hinglish"). Every part can be tapped:
  - sport (Cricket / Football / Not sports → `sportOverride`, clears the pinned match);
  - match (scrolls to the match panel: selector / add match);
  - intent (8 intents → `intentOverride`);
  - language.
  - Each correction regenerates.
- **One targeted question**, only when needed (e.g. "Which “mi” do you mean?"), with tappable options. The answer is stored as `context.aliasChoices`, which the parser honours deterministically.
- **Results:** platform tabs, recommended first, alternatives collapsed, hashtags in two groups, "why" shown, evidence collapsed ("Evidence used (n)") with the no-trend note visible, copy per field.
- Generic tags (#match, #preview, #video…) were added to the filler list.
- **Tests:** 208 unit; E2E 12/12. New `e2e/flow.spec.ts` runs the spec's flow on **desktop and mobile** (390 px): choose platforms → details → caption → answer the "which MI" question → correct intent via the chip → platform tabs → open alternatives → refine with a chip → copy; it also checks there's no horizontal overflow.

## Phase 9 — Feedback + diagnostics: DONE (2026-10-21)
- **Events** (ids and enums only, never caption text — tested by planting text and checking payloads):
  - Server: `generation_succeeded` {conversationId, messageId, mode, platforms, matchAttached, repairs, safeFallback}; `match_corrected` {conversationId, field: sportOverride | intentOverride | matchId | aliasChoices}.
  - Client, via `POST /api/events` (session, same-origin, only for the creator's own answers — `messageOwnedBy`): `recommended_copied` (any field of the recommended option), `hashtags_copied`, `caption_edited` (on save after a change), `marked_useful` / `marked_not_useful` (new thumbs buttons in the answer header, all 3 languages).
- **Published-post feedback:** unchanged existing feature — manual links, the creator's own outcome rating and metrics, labelled "Manually entered by you · not platform data". Nothing claims a caption caused views.
- **Admin diagnostics** per source: last success + cache age, last failure, latency, circuit state (closed / N recent failures / paused until …), and quota used/left today for budgeted fixtures providers. A "Creator actions (last 7 days, counts only)" card was added. Only setting names are shown, never values (tested with planted values).
- **Tests:** 211 unit tests passing (new `tests/feedback-diagnostics.test.ts`).

## Phase 10 — Manual reference imports: DONE (2026-10-21)
- Already built earlier: Google Trends "related queries" CSV import (YouTube Search or Web Search), admin observations from TikTok Creative Center / Reddit Pro Trends / YouTube Studio Trends / Instagram Reels trends, and creator-provided Reel/audio/trend references.
- **New:** `src/lib/domain/references.ts`, shared by the creator API and the admin form. A pasted URL alone is rejected (a description in words is required); links must be http(s).
- **CSV validation:** only real Trends exports are imported (TOP/RISING section or "Category:" header), and only rows whose query has words.
- **Labels everywhere:** "creator-provided — not verified" / "<tool> (admin-observed)"; never "live".
- **Never used:** cookie scrapers, private endpoints, scraping mirrors or trial-only services.
- **Tests:** 213 unit tests passing.

## Final — eval, deploy, live verification (2026-10-21)
- **Fixes from eval run 3:**
  - A community or schedule-only result (OpenLigaDB/openfootball) now goes to the model as "MATCH RESULT NOT VERIFIED — do not state score or winner". Only a live-status provider's result is a fact.
  - The validator's question exemption is narrowed to who/which questions with no score and no "won/haraya". "2-1 se haraya, kya match tha?" is now a result claim.
  - New `duplicate_option` check (it is repairable).
  - When the subject is unclear, the model is told to still fill every platform with all three options.
- **Tests:** 221 unit passing; E2E 12 passed / 1 skipped (template server on :3300 with demo flags). Lint, typecheck, build and bundle check are clean.
- **Deploy:** `09a147b` is live on Render (deploy `dep-dbbstnrl9sls73ffa6a0`); `/api/health` reports ok, postgres, `openai/gpt-oss-20b`, and all sources fresh.
- **Live check (real Groq, real data, throwaway account deleted afterwards):**
  - Input: "Bayern Munich ke next match ka preview video…".
  - The result came back in 5.0 s and resolved to **FC Bayern München vs FC Arsenal, UEFA Champions League, upcoming, starts 22 Oct 2026 00:30 IST**.
  - Source shown: OpenLigaDB, "fixture list only — no live status".
  - The caption used only that date and those teams.
  - Hashtags: #BAYvsARS #BayernMunich #Arsenal #MatchPreview #Football (5 of max 30).
  - Trend note: "No relevant current trend found".
