# Pending PDF-choice ranking release

The update counts one vote per anonymous visitor and canonical celebrity only
after a successful PDF render. Editing or clearing lists does not change totals.

Before release, apply `supabase/migrations/202611100001_pdf_choice_history.sql`
in the existing project, then deploy the matching application commit. The older
PDF generator never logged choices, so past generated PDFs cannot be backfilled
accurately. The migration does not treat active selections as PDF evidence.

Validation: API, browser behavior, PostgreSQL migrations, alias merges, access
permissions and read-only security audits are covered by automated tests. The
real-browser IndexedDB test requires a browser-capable environment. Hosted PDF
vote testing must wait for the migration; use an isolated test database to avoid
permanent test votes in public totals.

## Earlier launch checks (historical)

# Rankings production readiness

Prepared on feature/supabase-rankings; master merged locally on 2026-11-02.
No deployment, hosted SQL, Auth changes, or production environment changes were
performed. `RANKINGS_ENABLED=false` remains the example configuration.

## Cross-provider duplicates

The new **unapplied** alias-maintenance migration adds
`merge_celebrity_alias(keep_uuid, duplicate_uuid)`. As the database administrator,
after verifying both provider records identify the same human, use it inside a
reviewed transaction. Record both provider IDs, authoritative evidence URLs,
reviewer, and chosen canonical ID in the change ticket before execution. Inspect
the result before committing. Back up affected rows before maintenance: a merge
cannot be safely reversed without the original selection/source mapping.

The function moves existing selections and every provider alias atomically,
deduplicates same-slot overlap, and removes the duplicate canonical row. Distinct
visitor counting also prevents double counts across slots. Subsequent syncs
using either original provider ID continue to resolve to the retained identity.
An exclusive advisory lock coordinates maintenance with shared locks in syncs.
Only the migration owner can call maintenance; PUBLIC, anon, authenticated and
service_role are explicitly denied. No public merge endpoint exists.

Do not merge on display name: unrelated people can share a name. There is no
verified cross-provider alias catalog in this repository. Reviewing actual
provider records and applying confirmed mappings remains a launch requirement.
The code now supports merging already-populated duplicate records safely; it
does not claim automatic worldwide identity resolution. Both original and new
migrations must be applied in order during a separately authorized rollout.

## Browser synchronization

Native Web Locks remain preferred. Without them, IndexedDB readwrite
transactions serialize both initial anonymous sign-in and selection writes
across tabs. The same adapter supplies Supabase Auth's custom lock, so token
refresh also uses cross-tab exclusion. Each lock name has a separate database
to permit nested writer/Auth locks without deadlock. A queued IndexedDB request
keeps the transaction open while asynchronous work finishes. Locks release on
completion, failure, or tab closure; no expiring localStorage lease is used.
IndexedDB cannot atomically try a lock without waiting, so the SDK's zero-wait
opportunistic background refresh is skipped with its expected timeout marker.
Foreground session reads still refresh tokens under a blocking lock.
If neither facility is available, local lists and PDF agreements remain usable
and shared writes fail closed. IndexedDB denial likewise reports unavailability.

The fallback holds a transaction through network requests and can be more
expensive than Web Locks. Validate it on target Safari/Firefox/mobile browsers,
including private browsing, suspension/resume and storage denial before launch.
Revision checks and persisted request UUIDs remain the server's final protection
against duplicate or stale writes.

## Anonymous retention and cleanup review

Proposed policy for approval: retain anonymous ranking identities/selections for
180 days after the latest Auth sign-in, successful sync, or sync attempt.
Returning visitors without edits still refresh rankings but do not necessarily
sync; reviewing only creation time would incorrectly classify active identities.
Before implementing this policy, add an authenticated activity heartbeat or
explicitly define inactivity as **selection synchronization**, and disclose it.
No cleanup schedule or destructive cleanup command is enabled by this change.

`supabase/retention_review.sql` is a count-only, read-only estimate using existing
timestamps. It is not authorization to delete its candidates. Review other app
usage, live Auth sessions, Storage ownership, converted/registered accounts, and
project retention requirements first. Scope cleanup to anonymous users with a
ranking sync record; never delete unrelated or registered users. Supabase does
not currently provide automatic anonymous-user cleanup:
[official documentation](https://supabase.com/docs/guides/auth/auth-anonymous).

For a future approved job: use bounded batches, a fixed cutoff, dry-run counts,
backup/recovery plan, and recheck anonymity/activity immediately before deletion.
Serialize deletion with syncs and abort on unexpected dependencies or errors.
Use a server/admin identity, never expose cleanup as a browser RPC or public
HTTP endpoint. Deleting an Auth user cascades to both ranking state and
selections; database tests verify aggregates decrease and registered users are
unaffected when a different anonymous user is deleted. An expired identity's
browser must explicitly establish a new anonymous session and resubmit current
local lists; do not silently replace identity on a transient Auth error.

Storage clearing and other devices create independent anonymous identities.
Deduplication is per Auth identity, not one vote per human. Browser closure
does not remove votes. These facts and the final retention period need a public
privacy disclosure before activation.

## Privacy boundary

The ranking browser request contains only `her`/`his` provider-ID arrays,
`revision`, and `requestId`, with a bearer token. Server parsing constructs a
new allowlisted payload; agreement names, signatures, PDF content, arbitrary
metadata and caller-provided visitor identities are discarded. Supabase receives
the verified anonymous Auth ID and trusted provider celebrity metadata, plus
selection slots and synchronization state. The public API returns aggregates,
not individual visitor lists. Supabase Auth/network services also receive normal
technical request metadata; selected celebrities are not anonymous to the server.

Agreement names and list contents are sent to `/api/agreement-pdf` for PDF
generation, separately from Supabase. The PDF handler imports no ranking/Auth
helpers and sends nothing to Supabase. Privacy regression tests inject private
sentinel values into browser records and incoming API extras, then inspect all
outbound ranking/Supabase bodies. PDFs continue using the production design
merged from master.

## Remaining activation requirements

- Review hosted database/Storage policies and grants using the existing security
  audit. Anonymous Auth sessions have the `authenticated` database role.
- Apply reviewed migrations only with separate authorization; verify owner and
  grants against the actual project and test representative alias merges.
- Configure server-only service credentials, public key, exact `SITE_ORIGIN`,
  provider keys, anonymous Auth, Auth signup limits, and platform/IP request
  limits. The selected rollout does not require CAPTCHA or Cloudflare. Keep
  rankings disabled until the rollout is approved. No environment values were changed here.
- Rotate the TMDB key exposed on master/in Git history. Confirm production
  access/quotas for SportsDB and AudioDB rather than relying on public demo keys.
- Confirm CSP/network access to the pinned Supabase SDK CDN.
- Complete hosted staging checks for real Auth, providers, multi-tab
  sessions, token refresh, offline retries, and deployment-platform PDF rendering.
- Approve the alias review process, retention policy, cleanup implementation and
  user-facing disclosure; exercise recovery after identity expiration.

IndexedDB transaction behavior follows the
[IndexedDB standard](https://www.w3.org/TR/IndexedDB/).

## Validation performed

- `npm.cmd test`: **30 passed, 0 failed, 0 skipped** on 2026-11-02.
  Includes both SQL migrations in isolated in-memory PGlite, permissions under
  permissive default grants, alias merges, retention counts/cascades, privacy
  boundaries, and list/PDF regression tests. No hosted database was contacted.
- Real Chrome with Web Locks disabled: cross-tab mutual exclusion, nested Auth
  locks, callback failures, acquisition timeouts, tab-closure recovery, and two
  concurrent ranking startups resulting in one anonymous sign-in and one sync.
  Auth and ranking endpoints are simulated on a localhost test origin.
- `node scripts/preview-agreements.js <local Chrome path>`: six real PDFs
  generated (her, his and couples; normal and long names), each one page with
  the original logo loaded and layout within the page bounds. Output is ignored
  under `artifacts/pdf-samples/`. The API tests separately check request parsing.
- PDF API and agreement-design sources match the updated GitHub master.

Set `TEST_BROWSER_PATH` to a local Chromium-based browser where auto-detection
is unavailable. The real-browser test reports a skip if no browser is installed;
release validation must include a run with this test executed, as above.
