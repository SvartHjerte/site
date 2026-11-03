# Read-only rankings security audit

Use `rankings_security_audit.sql` for checks against the exact permissions in
both rankings migrations. It complements the existing `security_audit.sql`,
which is a broad catalog inventory but does not compare service-role access to
the application's requirements. Neither script installs or fixes anything.

## Run in Supabase SQL Editor

1. Select the intended TheCheatList project in the Supabase Dashboard. Confirm
   the project reference yourself; the SQL does not prove project identity.
2. Open SQL Editor, choose the database's `postgres` role, and paste the **entire**
   contents of `rankings_security_audit.sql` into a new query. Run that file
   alone. Do not paste either migration or the alias-maintenance function.
3. The result is one row, with one JSON text cell named
   `rankings_security_audit`. Expand or download the complete cell; a truncated
   UI preview is not the complete report.
4. In a separate query, run the whole `storage_bucket_audit.sql` file. It returns
   one JSON text cell named `storage_bucket_audit`. This reads bucket settings
   only. It does not list objects or read files.
5. Review all `FAIL`, `MISSING` and `REVIEW` items before considering activation.
   Save the reports privately with the audit time and branch/commit reviewed.

No credentials, bearer tokens, database URLs or environment variables are
required in either script. The main script is a single SELECT over PostgreSQL
catalogs using built-in inspection functions. It does not read ranking rows,
Auth users, sessions, Vault secrets, function bodies, or policy expression text.
It does not invoke any application RPC, set roles, create temporary objects,
change settings, or modify grants/policies. Function/policy fingerprints are
hashes only. The companion SELECT reads `storage.buckets.id` and `public` flags,
never Storage objects or contents. Reports still contain internal object/role
names and public bucket IDs: treat them as internal configuration information.

The old `security_audit.sql` includes raw policy expressions and selected API
settings; review/redact that older report privately before sharing. The new
focused report deliberately omits those texts in case they embed secrets.

## Interpret statuses

| Status | Meaning | Action |
| --- | --- | --- |
| `PASS` | This particular catalog check matches the migration's expectations. | Keep reviewing; this is not a functional test or global security approval. |
| `FAIL` | Permissions, RLS, RPC hardening or rankings policies differ from the expected server-only design. | Block activation and investigate. No repairs are performed by the audit. |
| `MISSING` | An expected role, table, function or Storage component is absent. | Expected for unapplied migrations; still a rollout blocker. Never interpret absence as safe installation. |
| `REVIEW` | Human review is necessary, including existing Storage and privileged functions. | Verify the intended access and record the decision. Not every review item is a vulnerability. |

`summary` counts individual checks, so one grant can produce multiple failures
(for PUBLIC and every role inheriting it). Counts need not be zero for an
intentionally uninstalled feature. A missing status key means zero such checks,
not a missing part of the report.

## Expected rankings permissions

| Object | PUBLIC, anon, authenticated | service_role |
| --- | --- | --- |
| `public.celebrities` | No direct table or column privileges | SELECT only |
| `public.celebrity_sources` | No direct table or column privileges | SELECT only |
| `public.visitor_selections` | No direct privileges, including SELECT | No direct privileges |
| `public.visitor_sync_state` | No direct privileges, including SELECT | No direct privileges |
| `selection_rankings()` | No EXECUTE | EXECUTE |
| `selection_sync_gate(uuid)` | No EXECUTE | EXECUTE |
| `sync_visitor_selections(uuid,bigint,uuid,jsonb)` | No EXECUTE | EXECUTE |
| `merge_celebrity_alias(uuid,uuid)` | No EXECUTE | No EXECUTE; migration owner only |

All four tables should have RLS enabled and **no RLS policies**. Browser reads
of aggregate rankings go through the application's server, not a direct public
database RPC. All four functions should be SECURITY DEFINER, owned by the
reviewed migration owner (`postgres`), with an explicitly empty search_path.
The service role reads cached celebrity metadata directly and writes/reads
private visitor state only through the three server RPCs. BYPASSRLS on
service_role is normal, but does not grant access on its own. FORCE RLS is
reported for context and is not required by these migrations.

The role and schema checks also flag API-role administrative attributes and
unexpected CREATE access in `public`. A service-role permission is checked
even if a browser-facing API happens to be disabled. Check role memberships
for unexpected ownership/SET ROLE paths as well as inherited access.

An anonymous **Auth session uses `authenticated`**, while a request without a
signed-in session uses `anon`. Existing policies intended for registered users
must therefore be reviewed before anonymous sign-ins are enabled. Checking
only grants to `anon` would miss this distinction.

## Inspect possible public/private data access

- `rankings_table_permissions` includes effective table privileges and privileges
  on any individual column, including inherited and PUBLIC grants. Unexpected
  grants are FAIL even when RLS currently blocks rows: both layers must match.
- `browser_accessible_views_of_rankings` follows catalog dependencies through
  nested views/materialized views. SELECT grants cause REVIEW because owner
  privileges or materialization can expose private rows. An invoker view still
  needs review; a grant alone does not prove that a row can be read.
- `browser_callable_privileged_or_rankings_functions` includes browser-callable
  SECURITY DEFINER functions across non-system schemas and every callable
  overload of a rankings function name. Unexpected overloads and custom
  privileged wrappers need private source review. A fingerprint detects a
  changed body, not whether it is secure or matches the repository.
- `existing_policies` inventories every non-system policy, with its target roles,
  command, permissive/restrictive mode and expression fingerprint. Unexpected
  rankings policies are FAIL; other policies require review in the Dashboard
  or private source inspection. Roles inherited by anon/authenticated matter,
  not only policies naming those roles directly. Hashes cannot establish that
  an expression safely distinguishes anonymous from registered users.

The audit never claims to find every indirect leak. It cannot prove arbitrary
function/dynamic SQL safety, detect data copied into unrelated tables, inspect
external services, or determine all runtime API roles. The public aggregate
endpoint's payload/privacy boundary remains covered by application tests.

## Storage review

`storage_relations` reports RLS on all visible Storage tables and views.
`storage_permissions` shows schema USAGE and effective column/table access for
PUBLIC, anon, authenticated and service_role. The Storage entries in
`existing_policies` show who each policy targets. Standard Supabase Storage
grants may be broad because RLS restricts operations; do not revoke managed
Storage permissions merely because they appear in this inventory. Review
actual USING/WITH CHECK expressions privately, with special attention to
`storage.objects`, `storage.buckets`, bucket restrictions and owner checks.

The companion report separately counts public and private buckets and lists
only public bucket IDs for REVIEW. Public asset buckets may be appropriate,
but their download URLs bypass RLS. Agreement PDFs and private ranking data
must not be stored in them. A private bucket alone does not prove safety:
review policies, signed URL generation and service-key access. This application
does not need Supabase Storage for rankings or PDF generation, so any relevant
existing bucket access must have an independently understood purpose.

If the companion fails because `storage.buckets` is absent or unreadable, mark
that check incomplete and inspect the project; do not create objects to make
the audit run. The catalog-only main audit works even without the Storage
schema or rankings installation.

## Scope and validation

This is a manual database configuration review, not an Auth settings or live
API penetration test. Confirm Data API exposed schemas/search paths, anonymous
Auth, CAPTCHA, signup and platform limits, SDK configuration, actual RPC
implementations and staging behavior separately. Rankings remain disabled;
neither these queries nor this document authorize migration or activation.

Automated tests execute both queries inside PostgreSQL read-only transactions
in isolated PGlite. They cover missing installations, the expected migrations,
and deliberately unsafe RLS, PUBLIC/column/inherited grants, RPC grants,
extra overloads, policies, nested views, Storage access and secret omission.
Nothing in these tests contacts the hosted project.

References: [PostgreSQL privilege inspection](https://www.postgresql.org/docs/16/functions-info.html),
[Supabase anonymous users](https://supabase.com/docs/guides/auth/auth-anonymous),
[Storage access control](https://supabase.com/docs/guides/storage/security/access-control),
[public buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals).
