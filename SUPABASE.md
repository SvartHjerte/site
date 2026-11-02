# Shared celebrity rankings

This is a local implementation. No migration has been applied, no Auth settings
have been changed, and nothing has been deployed to the existing project
`zintkdgpbueciyyydzzp`. Rankings stay disabled until explicitly configured.

See [PRODUCTION-READINESS.md](PRODUCTION-READINESS.md) for the current alias
maintenance, browser fallback, retention review and remaining launch checklist.

## Architecture

The existing static website and PDF API remain in place. `/api/selections` is a
Vercel server function, the equivalent server-side mechanism in the approved
plan. It verifies the bearer token against Supabase Auth, accepts **only provider
IDs**, rate-limits the authenticated visitor, obtains trusted provider metadata,
and calls a service-only PostgreSQL function. No browser-supplied identity,
metadata, canonical ID, vote total, or counter is trusted.

The four tables are in `supabase/migrations/202610310001_rankings.sql`.
All have RLS enabled, no browser policies, and explicit browser privilege
revocations. Aggregate reads also go through the server; individual visitor
identities and lists are never exposed through the public ranking endpoint.

Both lists are replaced in one transaction with a revision compare-and-swap.
A request UUID and stored payload make exact retries idempotent, including a
lost HTTP response. Conflicts return HTTP 409 and never replace newer state.
Ranking totals use `count(distinct visitor_id)` across both slots. Empty arrays
clear active selections. No seeded or historical browser vote totals are used.

Provider aliases share a canonical UUID through `celebrity_sources`. Matching
provider IDs converge under transaction locks. **Different providers are not
automatically merged by display name**: names are not reliable identity proof.
Cross-provider aliases require a reviewed, authoritative mapping to the same
canonical UUID. Until such mappings exist, a person represented by different
providers can appear separately. The second, unapplied migration provides an
administrator-only atomic merge for confirmed aliases, including existing votes.
Review and record authoritative evidence before using it; no display-name
matching or unverified alias data is shipped.

Browser lists and PDF inputs keep their existing localStorage keys. The browser
uses the pinned Supabase JS SDK `2.118.0` from esm.sh for persisted anonymous
sessions and token refresh. Web Locks serialize initial sign-in and sync across
tabs, with an IndexedDB transaction fallback also used for SDK Auth locks.
Browsers with neither facility retain local lists/PDFs and aggregate reads, but
do not sync. No framework or build step is introduced.

Retries reuse persisted requests. Network failures back off to 60 seconds; HTTP
429 waits a minute. Rejected stale requests require an explicit retry before
rebasing current local lists to the returned revision. Edits while a request is
in flight are sent afterward. Personal names entered for the PDF never leave
the browser through the ranking integration.

## Configuration for a later approved rollout

1. Run and review `supabase/preflight.sql` against the hosted project **only when
   authorized**. Inspect policies/grants across schemas, including Storage and
   existing functions, because anonymous users get the `authenticated` role.
2. Review the migration and apply it only after approval. Do not run
   `supabase db push`, migrations, deployment commands, or enable anonymous Auth
   as part of local development.
3. Configure anonymous sign-ins and Auth rate limits after the security audit
   and separate authorization. CAPTCHA is optional for initial local testing;
   see below. For a later public rollout, configure the Turnstile secret in
   Supabase, never in a public file, and its site key in the server environment.
4. Copy `.env.example` into your local server environment. Set the project's
   public key in `SUPABASE_ANON_KEY` (legacy anon key) or
   `SUPABASE_PUBLISHABLE_KEY` (takes precedence when nonempty), server-only service-role key and
   server-side TMDB key. Never commit real `.env` files. The service-role key is
   read by server modules only. Set `SITE_ORIGIN` to the exact browser origin
   (no trailing slash), separately for local, preview, and production servers.
5. Add platform firewall/IP rate limits for `/api/selections` and
   `/api/rankings` before public rollout. The DB enforces 30 authenticated sync
   attempts per minute per visitor across all server instances, including
   requests that fail provider validation. CAPTCHA and Auth signup rate limits
   are needed to resist attackers creating many anonymous identities. Application
   limits alone do not prevent distributed abuse. Origin checks are additional
   defense, not a substitute for authentication or rate limits.
6. Set `RANKINGS_ENABLED=true` in the server environment only when ready.
   Production configuration fails closed without a Turnstile site key. A site
   key alone does not enable CAPTCHA in Supabase; step 3 is required.
7. Test via a local Vercel-compatible server. Opening `index.html` directly or
   using a static-only server cannot run `/api/*`; lists, search and printable
   agreements remain available, while shared rankings show an unavailable state.

The public GET returns only aggregates, the public Supabase URL/key, and the
Turnstile site key. The browser lazily loads the SDK only if the ranking API is
configured. Verify CSP/network access to esm.sh and the Turnstile domains for a
future deployment, or bundle the SDK before adopting a stricter CSP.

## Local validation

### Initial testing without CAPTCHA

1. Copy `.env.example` to `.env.local`. Keep `RANKINGS_ENABLED=false` and
   `TURNSTILE_SITE_KEY` blank. No Supabase credentials are needed for automated
   tests or for testing local lists and agreements with shared rankings disabled.
2. Run a local Vercel-compatible server on `http://localhost:3000`. Use a
   non-production environment (`NODE_ENV=development`). Set `TMDB_API_KEY` only
   in the server environment for celebrity search and images; these now use
   `/api/tmdb` so the key never appears in browser code. The provider demo keys
   `123` for SportsDB and AudioDB are public demo values.
3. Run `npm.cmd test`. Confirm local list editing and agreement preview work,
   and `/api/rankings` and `/api/selections` return 503 while disabled. No
   Turnstile script or anonymous sign-in is started when rankings are disabled.

The application already permits anonymous sign-in without a CAPTCHA token when
`TURNSTILE_SITE_KEY` is blank outside production. Authentication, origin checks,
payload validation, database rate limits, RLS and service-only RPC permissions
remain in place. Production still fails closed without a Turnstile site key.

Future end-to-end sync testing needs a separately authorized isolated Supabase
test environment with the schema installed, anonymous sign-ins enabled, and
Auth CAPTCHA disabled. A blank application site key cannot bypass CAPTCHA
required by Supabase Auth. Only in that isolated environment, after approval,
set its server credentials, exact `SITE_ORIGIN`, and `RANKINGS_ENABLED=true`.
Do not change the existing hosted project, apply migrations, deploy, or enable
rankings as part of this initial test. Hosted Auth settings have not been
inspected or changed by these local checks.

The next manual step is to prepare the ignored `.env.local` and test the local
server with rankings disabled. Rotate the previously hardcoded TMDB key in its
provider dashboard before using a replacement; removing it here does not erase
it from existing Git history. This requires no Supabase database changes.

Run `npm.cmd test` from `site` on Windows (`npm test` on other platforms).
The dev-only PGlite dependency executes the actual migration and SQL functions
in an isolated, in-memory PostgreSQL engine with mock Supabase roles/Auth table.
No test contacts Supabase, changes Auth settings, or uses a hosted database.
API tests mock all network calls. This does not replace an eventual approved
staging test against Supabase Auth, the real providers, CAPTCHA and Vercel.

Clearing browser storage loses the anonymous identity. Its selections remain
until an authorized server cleanup removes that Auth user (FK cascade removes
selections), or an explicit retention policy is implemented. Identity loss is
not treated as a removal; no reliable browser-close callback exists. Define
anonymous-user retention and disclose this before launch.

References: [anonymous authentication](https://supabase.com/docs/guides/auth/auth-anonymous),
[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits),
[CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha).
