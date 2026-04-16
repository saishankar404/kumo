# Kumo

## Production Verification

- `npm run verify:prod`
  - runs lint, unit tests, production build, and bundle-budget checks
- `npm run test:e2e`
  - runs Playwright end-to-end tests for:
    - search -> open PDF flow
    - collections + bookmarks + bulk BibTeX export
    - dead PDF link session metric behavior
- `npm run smoke:staging`
  - run smoke checks against a deployed environment:
  - `STAGING_URL=https://your-staging.example.com npm run smoke:staging`

## API Security and Abuse Controls

- Shared API guardrails now apply to `/api/*` handlers:
  - method enforcement (`GET` only for search/proxy endpoints)
  - strict input validation (query length, DOI format, URL parsing)
  - host/protocol allowlisting for upstream proxy routes
  - no-store caching on error responses
  - security headers (`X-Content-Type-Options`, `Referrer-Policy`, `Cross-Origin-Resource-Policy`)
  - token-bucket rate limiting with `429` + `Retry-After`

- Environment flags:
  - `RATE_LIMIT_MODE=off|soft|enforce`
  - `STRICT_ORIGIN_CHECK=true|false`
  - `ALLOWED_ORIGINS=<comma-separated origins>`

- Security regression tests:
  - `npm test -- src/test/api-security.test.ts`

### Vercel Edge status

- A lightweight `middleware.ts` edge prefilter now blocks obvious UA/path anomalies for `/api/*` before handlers run.
- Authoritative validation/rate limiting still remains in API handlers to avoid bypass and keep behavior consistent across environments.
- If you later enable Cloudflare proxy or allow shared infra (Redis/KV), add global edge counters/rate limits as a first layer.

## Bundle Budget

Bundle budgets are enforced by `scripts/check-bundle-budget.mjs`.

Defaults:
- main JS raw: `750000` bytes
- main JS gzip: `245000` bytes
- main CSS raw: `130000` bytes

Override with env vars:
- `BUDGET_MAIN_JS_BYTES`
- `BUDGET_MAIN_JS_GZIP_BYTES`
- `BUDGET_CSS_BYTES`
