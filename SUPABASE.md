# Shared celebrity rankings

The live site currently counts active selections. The prepared PDF-choice update
requires `supabase/migrations/202611100001_pdf_choice_history.sql` before the
matching application release is published.

## PDF-choice counting

- Loading the site, searching, editing and clearing lists never adds votes.
- After Chromium successfully generates a PDF, the server records only the
  provider IDs actually included in that agreement: her, his, or both lists.
- Each anonymous visitor counts once per canonical celebrity, including across
  repeated PDFs and both lists. Totals persist after list changes or Auth cleanup.
- Browser identity is device-specific. Clearing storage or switching browsers can
  create a new anonymous identity; this is not a verified-person voting system.
- Past PDFs were not logged, so their exact choices cannot be reconstructed.
  Current selections are not automatically relabeled as generated PDFs.

## Architecture

`/api/agreement-pdf` generates the PDF first, then calls `lib/pdf-rankings.js`.
The helper verifies the exact request origin and anonymous bearer token, applies
`selection_sync_gate`, validates IDs through trusted provider metadata, and calls
`record_pdf_choices`. The private `pdf_choice_history` table has RLS enabled and
no browser or direct service-role table privileges. Only server RPCs write it.
`selection_rankings` returns aggregates from this history; no visitor identity,
partner name, signature or private agreement field is exposed or stored in it.

The response header `X-Ranking-Status` reports whether choices were counted.
A ranking outage does not prevent PDF delivery. The page explicitly tells the
visitor if the PDF could not be counted; regenerating safely retries without
adding duplicate votes. A PDF render failure never calls the vote recorder.

Legacy `/api/selections` still supports revision-safe current-list replacement
for older tabs, but it does not contribute to PDF-history rankings. New browser
code keeps editing local and creates/reuses anonymous Auth only when generating
a PDF. Web Locks and the IndexedDB fallback serialize cross-tab Auth access.

Reviewed provider aliases share a canonical ID. The administrator-only merge
function combines PDF history while preserving one vote per visitor. No
name-based automatic alias matching is performed.

## Activation

Run the new migration in the existing project as postgres, then publish the
matching application branch. The migration preserves the old current selections,
creates an empty PDF history, and changes aggregates to use that history. It is
transactional and safe to run again. Do not substitute a public/service key for
an administrator database connection. No database credentials belong in Git.

## Configuration for a later approved rollout

1. Run and review `supabase/preflight.sql` against the hosted project **only when
   authorized**. Inspect policies/grants across schemas, including Storage and
   existing functions, because anonymous users get the `authenticated` role.
2. Review the migration and apply it only after approval. Do not run
   `supabase db push`, migrations, deployment commands, or enable anonymous Auth
   as part of local development.
3. Configure anonymous sign-ins and Auth rate limits after the security audit
   and separate authorization. CAPTCHA is optional in every environment; no
   Cloudflare account is required. Leave `TURNSTILE_SITE_KEY` blank for the
   selected rollout without CAPTCHA.
4. Copy `.env.example` into your local server environment. Set the project's
   public key in `SUPABASE_ANON_KEY` (legacy anon key) or
   `SUPABASE_PUBLISHABLE_KEY` (takes precedence when nonempty), server-only service-role key and
   server-side TMDB key. Never commit real `.env` files. The service-role key is
   read by server modules only. Set `SITE_ORIGIN` to the exact browser origin
   (no trailing slash), separately for local, preview, and production servers.
5. Add platform firewall/IP rate limits for `/api/selections` and
   `/api/rankings` before public rollout. The DB enforces 30 authenticated sync
   attempts per minute per visitor across all server instances, including
   requests that fail provider validation. Auth signup rate limits
   also help limit creation of anonymous identities. Application
   limits alone do not prevent distributed abuse. Origin checks are additional
   defense, not a substitute for authentication or rate limits.
6. Set `RANKINGS_ENABLED=true` in the server environment only when ready.
   The selected rollout uses anonymous Auth and rate limits without CAPTCHA.
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
`TURNSTILE_SITE_KEY` is blank, including in production. Authentication, origin checks,
payload validation, database rate limits, RLS and service-only RPC permissions
remain in place. CAPTCHA is an optional additional control.

Future end-to-end sync testing needs a separately authorized isolated Supabase
test environment with all migrations installed, anonymous sign-ins enabled, and
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
staging test against Supabase Auth, the real providers and Vercel.

Clearing browser storage loses the anonymous identity. Its selections remain
until an authorized server cleanup removes that Auth user (FK cascade removes
selections), or an explicit retention policy is implemented. Identity loss is
not treated as a removal; no reliable browser-close callback exists. Define
anonymous-user retention and disclose this before launch.

References: [anonymous authentication](https://supabase.com/docs/guides/auth/auth-anonymous),
[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits),
[CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha).
