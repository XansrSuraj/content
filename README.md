# TrendSaathi

**Sahi trend. Apna original angle. Behtar content.**

TrendSaathi is an India-first workspace for creators who write in Hindi, Hinglish and English. It has three parts:

- **Caption Studio** — a conversational caption assistant.
- **Opportunity feed** — ideas where every item shows its evidence.
- **Brief builder** — turns an idea into a shootable plan.

Saved work, published links and manual feedback close the loop.

The product is built on one rule: **never claim more than the data shows.** Here's what that means in practice:

- No guaranteed virality.
- No invented trend scores or view counts.
- No universal "best posting time."
- A hashtag is only shown as *observed* when a stored source backs it.

---

## What works today

| Area | Status |
|---|---|
| Landing → demo or sign up → preferences → feed → evidence → brief → Caption Studio → save → published link → feedback | Implemented and covered by Playwright E2E tests |
| Caption Studio: 3 different options, recommended option + reason, hooks, hashtags, search phrases, improvements, assumptions/clarifying question, limitations | Implemented |
| Sticky follow-ups ("Aur short karo", "Emoji hata do", "Meri first line same rakho", "YouTube Shorts ke liye adapt karo", "Promotional kam rakho", "Sirf final caption aur hashtags do") | Implemented. These are deterministic and enforced after the model runs (emoji removal, locked first line, preserved-terms check) |
| Copy caption / hashtags / both (per-platform limit), edit, save, regenerate with a new tone, rename and delete conversations | Implemented. "Copied ✓" appears only when the clipboard write actually succeeds |
| Hashtag truthfulness: *suggested* vs *observed in a source sample* vs *demo*, with source, time, geography, platform and coverage | Implemented. Status comes from stored evidence, never from the model |
| Opportunity feed: filters by category, language, region, destination, search and freshness; grouped as Timely / Worth planning / Evergreen; evidence confidence; comparable-observation momentum | Implemented |
| Brief builder: angle, audience, hooks, opening shot, beats, CTA, titles, hashtags, facts to verify, source refs, low-effort version, platform packaging; editable | Implemented |
| Accounts: email + password (scrypt), DB sessions, ownership enforced in every query; admin via `ADMIN_EMAILS` | Implemented |
| Demo mode: an isolated account per visitor, clearly labeled sample data, off in production by default | Implemented |
| Live AI (Anthropic SDK, structured output + zod validation, timeouts, typed error mapping, refusal handling, usage records) | Implemented. **Not verified against the real API** (no key was available); the wire format is verified against a local fake endpoint |
| Template preview when AI isn't configured | Implemented, labeled "Template preview — not AI" |
| Real trend sources: Wikimedia pageviews (India) — **verified live**; YouTube Most Popular (India) — implemented, needs a key | See [Data sources](#data-sources) |
| Ingestion: dedupe, retries with backoff, timeouts, failure recording, freshness skip, expiry purge, CLI + protected endpoint | Implemented |
| Admin: source health, run ingestion, raw observations, curate into opportunities, archive, aggregate usage, demo cleanup | Implemented |
| Rate limits (per-minute and per-day AI quotas, auth attempts per IP), input/output caps | Implemented, stored in Postgres |
| Privacy: delete history, delete account, sign out everywhere, personalization consent toggle | Implemented |

---

## Quick start (local, no paid credentials)

Requirements: Node.js ≥ 20.9 (tested on Node 24) and npm.

```bash
npm install
cp .env.example .env.local      # demo mode is on by default in development
npm run dev                     # http://localhost:3000
```

There's no database to install. Without `DATABASE_URL`, the app uses **embedded PGlite** (real Postgres compiled to WASM) in `./.data/pglite`, and migrations run automatically on first connect.

- Click **Try the demo** for a private, temporary demo account with labeled sample data.
- Or **Create account** for a real account. Add your email to `ADMIN_EMAILS` before signing up to get `/admin`.

> PGlite is single-process. Don't run `npm run ingest` (direct mode) while `npm run dev` is running. Either stop the dev server or use `npm run ingest -- --via-http`.

---

## Enabling live AI

1. Create an Anthropic API key (console.anthropic.com).
2. In `.env.local`:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ANTHROPIC_MODEL=claude-opus-5-5     # pick a current id from the Anthropic models page
   ```
3. Restart the server. The header badge changes from "AI not configured · template preview" to "Live AI configured."

The model ID isn't hardcoded anywhere; it always comes from `ANTHROPIC_MODEL`. Optional settings:

| Variable | Default | What it does |
|---|---|---|
| `ANTHROPIC_EFFORT` | `low` | `low`/`medium`/`high`. Use `omit` for models that don't support the effort parameter |
| `ANTHROPIC_FALLBACKS` | `default` | Server-side refusal fallback (beta). Models that don't support it run alone. `off` disables it |
| `AI_TIMEOUT_MS` | 60000 | Per-request timeout |
| `AI_MAX_OUTPUT_TOKENS` | 8000 | Output cap per request |
| `AI_MAX_INPUT_CHARS` | 4000 | Maximum characters per creator message |

If the live provider fails (timeout, rate limit, bad key, invalid output), the user sees a recoverable error with **Retry**. The app never quietly falls back to template output.

---

## Environment variables

See [.env.example](.env.example) for the full list with comments. Key groups:

- **App:** `APP_URL`, `ADMIN_EMAILS`
- **Demo:**
  - `TRENDSAATHI_DEMO_MODE` defaults to on in development and off in production.
  - In production, demo stays off unless `TRENDSAATHI_ALLOW_DEMO_IN_PRODUCTION=true` is *also* set.
  - Turning demo off immediately invalidates existing demo sessions.
- **Database:** `DATABASE_URL` (Postgres), `PGLITE_DATA_DIR`, `DATABASE_SSL`, `DATABASE_SSL_STRICT`, `DATABASE_POOL_MAX`
- **AI:** see above
- **Limits:** `AI_REQUESTS_PER_USER_PER_MINUTE`, `AI_REQUESTS_PER_USER_PER_DAY`, `DEMO_AI_REQUESTS_PER_USER_PER_DAY`, `AUTH_ATTEMPTS_PER_IP_PER_15_MIN`
- **Sources:** `SOURCE_WIKIMEDIA_ENABLED`, `WIKIMEDIA_USER_AGENT`, `YOUTUBE_API_KEY`
- **Jobs:** `INGEST_SECRET` (≥ 32 chars; the endpoint is disabled without it)

---

## Database

- Schema: [src/lib/db/schema.ts](src/lib/db/schema.ts). Migrations: [drizzle/](drizzle/).
- After changing the schema, run `npm run db:generate`.
- Apply migrations: `npm run db:migrate`. This targets `DATABASE_URL` if set, otherwise PGlite. Production never migrates implicitly.
- Demo catalogue: `npm run db:seed-demo`. This is optional, because "Try the demo" seeds it on demand. Demo opportunities have stable IDs and are refreshed every 24 hours.

Entities: users, sessions, creator profiles (preferences), consents, sources, ingestion runs, source observations, opportunities (+ evidence links), conversations, messages, caption variants, briefs, saved items, published posts, feedback, events (IDs and enums only, never caption text), usage records, rate limits.

---

## Data sources

| Source | Status | What it can and can't say |
|---|---|---|
| **Wikipedia pageviews (Wikimedia), India** | Works without a key. Enable with `SOURCE_WIKIMEDIA_ENABLED=true` and a descriptive `WIKIMEDIA_USER_AGENT` that includes **your** contact URL or email | Daily most-read articles by readers in India. This is *reading interest*, not social-media popularity, and it can never mark a hashtag as observed. Navigation pages, localized namespace pages and adult titles are filtered out. Confirm Wikimedia's terms for your commercial use |
| **YouTube Most Popular chart (India)** | Needs `YOUTUBE_API_KEY` | Up to 50 chart videos at retrieval time, with titles and hashtags from titles/descriptions. Rows expire after 30 days to follow YouTube API policy. No derived scores; YouTube is attributed as the source. Not Shorts-specific. **Not verified live** (no key was available) |
| Instagram hashtag search | Not connected | Needs a professional account plus Meta App Review (Instagram Public Content Access). It returns media for a tag, not popularity |
| TikTok | Not connected | Not available in India; the Research API is for non-commercial research only |
| Facebook | Not connected | No permitted public trend endpoint |
| Google Trends | Not connected | API access is a limited alpha |
| Trending audio | Not connected | Needs a licensed provider |

No scraping is implemented. Real observations become feed opportunities only after an admin curates them in `/admin`, writing the summary, fit and original angles. Evidence confidence is computed from the attached observations, and momentum is shown only when at least two comparable observations exist (same source, item and geography).

Hashtag platform rules live in [src/lib/domain/platforms.ts](src/lib/domain/platforms.ts), each with its source and check date:

- **YouTube** (official help): up to 3 hashtags can show near the title, and all hashtags are ignored above 60.
- **Instagram**: the 5-tag limit comes from multiple reports but isn't officially confirmed, and is labeled that way in the UI.
- **Facebook / TikTok**: no official limit found.

---

## Ingestion jobs

```bash
npm run ingest                    # direct DB access (Postgres, or PGlite with the dev server stopped)
npm run ingest -- --force         # ignore the per-source minimum interval
npm run ingest -- --via-http      # call a running app (needs INGEST_SECRET)
```

Scheduled runs use `POST` or `GET /api/jobs/ingest` with `Authorization: Bearer $INGEST_SECRET`. The endpoint returns 404 when no secret is configured. Each run also removes demo accounts older than 3 days.

- **Vercel Cron:** set `CRON_SECRET` to the same value as `INGEST_SECRET`, then add to `vercel.json`:
  ```json
  { "crons": [{ "path": "/api/jobs/ingest", "schedule": "0 */6 * * *" }] }
  ```
- **Any other host:** `curl -X POST -H "Authorization: Bearer $INGEST_SECRET" https://your-app/api/jobs/ingest`

---

## Tests and checks

```bash
npm run lint
npm run typecheck
npm test                 # vitest: unit + integration against in-memory Postgres (PGlite)
npm run build
npm run check:bundle     # scans .next/static for secret values and server-only code markers
npm run test:e2e         # Playwright (starts or reuses the dev server); E2E_BASE_URL=... to target another server
```

The tests focus on the riskiest areas:

- ownership isolation (repos, services and HTTP)
- input and AI-response validation
- provider errors, timeouts and refusals
- the real SDK wire format against a fake server
- rate limits
- demo/live separation
- evidence required for observed-hashtag status
- ingestion: dedupe, retries, timeouts, expiry
- cross-site request blocking
- admin authorization
- mobile overflow

---

## Deployment

You need a Node host that supports Next.js 16 (e.g. Vercel, Render, Fly, or a VM) and managed Postgres (e.g. Supabase or Neon).

1. Create a Postgres database. Set `DATABASE_URL` (for Supabase, use the pooled connection string).
2. Run `npm run db:migrate` with that `DATABASE_URL`.
3. Set environment variables:
   - `APP_URL` (your https origin)
   - `ADMIN_EMAILS`
   - `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL`
   - `INGEST_SECRET`
   - source variables as needed
   - leave demo flags unset (demo stays off)
4. Build and start with `npm run build && npm start`, or use the platform's Next.js preset.
5. Configure the scheduler (see above).
6. Serve over HTTPS. Session cookies are `Secure` in production.

Notes:

- **PGlite is for local or single-process use only.** Don't use it on serverless platforms.
- Auth rate limiting uses `x-forwarded-for`, which is only trustworthy behind a proxy that sets it (Vercel and most PaaS do).
- The data-access layer filters by owner in every query. If you expose the database to other clients (e.g. Supabase's auto-generated API), add row-level-security policies too; the app itself connects as a single server role.

Nothing has been deployed publicly, and no paid service has been activated.

---

## Known limitations

- Live AI output quality is unverified: no API key was available while building. Prompts and schema are in [src/lib/providers/ai/](src/lib/providers/ai/).
- The YouTube connector is untested against the real API (no key).
- No email verification or password reset yet. Admin access depends on the email matching `ADMIN_EMAILS`.
- The real opportunity feed stays empty until an admin curates observations; there's no automatic topic-to-category mapping.
- UI microcopy is partly Hinglish and partly English. The language toggle covers navigation and key headings, not every string.
- Rate limiting uses fixed windows in Postgres, which is fine for modest scale.
- Hindi (Devanagari) captions rely on the model; the template preview doesn't transliterate.

See [docs/FUTURE.md](docs/FUTURE.md) for planned expansion and [PROGRESS.md](PROGRESS.md) for the build log.
