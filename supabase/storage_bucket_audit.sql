-- READ ONLY. Companion to rankings_security_audit.sql, run as postgres.
-- Reads bucket configuration only, never object names, URLs, owners or contents.
-- Requires the standard Supabase storage.buckets table. Missing-table errors
-- mean this check is incomplete, not that Storage is safe or disabled.
select pg_catalog.jsonb_pretty(pg_catalog.jsonb_build_object(
  'public_bucket_count', count(*) filter (where public),
  'private_bucket_count', count(*) filter (where not public),
  'public_bucket_review', coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'bucket_id', id, 'status', 'REVIEW',
    'reason', 'Public downloads bypass RLS. Verify this bucket contains only intentionally public assets; agreements/private ranking data must not be stored here.'
  ) order by id) filter (where public), '[]'::jsonb),
  'limitations', 'Public asset buckets may be legitimate. Private bucket safety still depends on Storage policies, signed URLs and server key handling; no objects are inspected.'
)) as storage_bucket_audit
from storage.buckets;
