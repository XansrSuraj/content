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

## Next steps
See docs/FUTURE.md → "Next priorities".
