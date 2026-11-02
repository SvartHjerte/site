-- Prepared only. Apply later with the original migration after authorization.
begin;
create or replace function public.sync_visitor_selections(
  p_visitor uuid, p_revision bigint, p_request_id uuid, p_items jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.visitor_sync_state;
  item jsonb;
  cid uuid;
begin
  -- Shared with all syncs; alias maintenance takes the exclusive counterpart.
  perform pg_advisory_xact_lock_shared(741992816025::bigint);
  if p_revision is null or p_revision < 0 or p_revision >= 9007199254740991
     or p_request_id is null or jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) > 10 then raise exception 'Invalid sync payload'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) i
    where (i->>'slot') is null or (i->>'slot') not in ('her','his')
      or (i->>'provider') is null or (i->>'provider') not in ('tmdb','sportsdb','audiodb')
      or (i->>'provider_id') is null or (i->>'provider_id') !~ '^[1-9][0-9]{0,11}$'
  ) then raise exception 'Invalid source or slot'; end if;
  if exists (select 1 from jsonb_array_elements(p_items) i group by i->>'slot' having count(*) > 5)
    then raise exception 'List limit exceeded'; end if;
  if exists (select 1 from jsonb_array_elements(p_items) i
    group by i->>'slot', i->>'provider', i->>'provider_id' having count(*) > 1)
    then raise exception 'Duplicate source'; end if;
  insert into public.visitor_sync_state(visitor_id) values (p_visitor) on conflict do nothing;
  select * into s from public.visitor_sync_state where visitor_id = p_visitor for update;
  if s.last_request_id = p_request_id then
    if s.last_payload is distinct from p_items or s.revision <> p_revision + 1 then
      return jsonb_build_object('status','conflict','revision',s.revision);
    end if;
    return jsonb_build_object('status','ok','revision',s.revision);
  end if;
  if s.revision <> p_revision then
    return jsonb_build_object('status','conflict','revision',s.revision);
  end if;
  -- A consistent global source lock order avoids deadlocks between visitors.
  for item in select value from jsonb_array_elements(p_items)
    order by value->>'provider', value->>'provider_id', value->>'slot'
  loop
    perform pg_advisory_xact_lock(hashtextextended((item->>'provider') || ':' || (item->>'provider_id'), 0));
  end loop;
  delete from public.visitor_selections where visitor_id = p_visitor;
  for item in select value from jsonb_array_elements(p_items) loop
    select celebrity_id into cid from public.celebrity_sources
      where provider = item->>'provider' and provider_id = item->>'provider_id';
    if cid is null then
      insert into public.celebrities(name, category, image, subtitle)
        values (item->>'name', item->>'category', item->>'image', item->>'subtitle') returning id into cid;
      insert into public.celebrity_sources(provider, provider_id, celebrity_id)
        values (item->>'provider', item->>'provider_id', cid);
    end if;
    -- Multiple provider aliases may already map to one canonical celebrity.
    insert into public.visitor_selections(visitor_id, slot, celebrity_id)
      values (p_visitor, item->>'slot', cid) on conflict do nothing;
  end loop;
  update public.visitor_sync_state set revision = s.revision + 1,
    last_request_id = p_request_id, last_payload = p_items, updated_at = now()
    where visitor_id = p_visitor;
  return jsonb_build_object('status','ok','revision',s.revision + 1);
end;
$$;

-- A human must confirm both provider identities from authoritative evidence.
-- No name-based matching, browser access, or service-role maintenance access.
create function public.merge_celebrity_alias(p_keep uuid, p_duplicate uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(741992816025::bigint);
  if p_keep is null or p_duplicate is null or p_keep = p_duplicate then
    raise exception 'Two distinct canonical IDs are required';
  end if;
  if not exists (select 1 from public.celebrities where id = p_keep)
     or not exists (select 1 from public.celebrities where id = p_duplicate) then
    raise exception 'Both canonical celebrities must exist';
  end if;
  insert into public.visitor_selections(visitor_id, slot, celebrity_id, created_at)
    select visitor_id, slot, p_keep, created_at from public.visitor_selections
    where celebrity_id = p_duplicate on conflict do nothing;
  delete from public.visitor_selections where celebrity_id = p_duplicate;
  update public.celebrity_sources set celebrity_id = p_keep where celebrity_id = p_duplicate;
  delete from public.celebrities where id = p_duplicate;
end;
$$;
revoke all on function public.merge_celebrity_alias(uuid,uuid) from public, anon, authenticated, service_role;
commit;
