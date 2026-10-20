@AGENTS.md

# TrendSaathi notes for agents
- Read PROGRESS.md first; keep it updated.
- Honesty rules are product requirements: never label a hashtag "trending" without stored evidence (src/lib/domain/hashtags.ts), never show invented metrics, keep demo data labeled and isolated (isDemo).
- Every private query takes `userId` and filters by it (src/lib/repo/*). Identity comes only from `getCurrentUser()`.
- Checks: `npm run lint && npm run typecheck && npm test && npm run build && npm run check:bundle`; E2E: `npm run test:e2e`.
