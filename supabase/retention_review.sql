-- READ ONLY. Proposed 180-day inactivity threshold, not an enabled policy.
-- PDF-choice history is deliberately retained; deleting Auth users does not reduce totals.
-- Counts only: no identities, tokens, private lists or application records.
-- Recent successful syncs OR rate-gate attempts count as activity. Do not use
-- created_at alone: an old anonymous identity can still be in daily use.
with candidates as (
  select u.id
  from auth.users u
  join public.visitor_sync_state s on s.visitor_id = u.id
  where u.is_anonymous is true
    and greatest(u.created_at, u.last_sign_in_at, s.updated_at, s.rate_window)
      < now() - interval '180 days'
)
select count(*) as candidate_users,
  (select count(*) from public.visitor_selections v
    where v.visitor_id in (select id from candidates)) as affected_selections
from candidates;
