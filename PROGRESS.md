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

## Next steps
- Set `ADMIN_EMAILS` on Render to the owner's email.
- Optional: make the GitHub repo private; add GitHub Actions secrets for background trend refresh.
- Multi-platform pack (Reels caption + Shorts title/description in one go) once generation is faster.
- Optional bigger local model on GPU (e.g. a 7B) if RAM allows; compare with the eval.
- See docs/FUTURE.md → "Next priorities".
