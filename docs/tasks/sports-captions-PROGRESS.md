# Sports Caption Optimiser — PROGRESS

**Current phase:** 2 — Match data providers (Phase 0 approved by owner 2026-10-20; Phase 1 done)
**Spec:** `docs/tasks/sports-captions.md`
**Last updated:** 2026-10-20

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
