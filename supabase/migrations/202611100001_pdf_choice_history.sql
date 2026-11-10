-- Count a visitor's choices only after a PDF is generated successfully.
-- Run once in the existing project's Supabase SQL Editor as postgres.
-- Existing current selections are intentionally NOT counted as generated PDFs.
begin;

create table if not exists public.pdf_choice_history (
  -- Deliberately no Auth FK: clearing an anonymous session must not erase totals.
  visitor_id uuid not null,
  celebrity_id uuid not null references public.celebrities(id),
  first_generated_at timestamptz not null default now(),
  primary key (visitor_id, celebrity_id)
);
create index if not exists pdf_choice_history_celebrity_idx
  on public.pdf_choice_history(celebrity_id, visitor_id);
alter table public.pdf_choice_history enable row level security;
revoke all on public.pdf_choice_history from public, anon, authenticated, service_role;

create or replace function public.record_pdf_choices(p_visitor uuid, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare item jsonb; cid uuid;
begin
  perform pg_advisory_xact_lock_shared(741992816025::bigint);
  if p_visitor is null or not exists (select 1 from auth.users where id=p_visitor)
    or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)>10
    then raise exception 'Invalid PDF choices'; end if;
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
  -- Serialize this visitor's PDF requests, including concurrent retries.
  insert into public.visitor_sync_state(visitor_id) values (p_visitor) on conflict do nothing;
  perform 1 from public.visitor_sync_state where visitor_id=p_visitor for update;
  for item in select value from jsonb_array_elements(p_items)
    order by value->>'provider', value->>'provider_id', value->>'slot'
  loop
    perform pg_advisory_xact_lock(hashtextextended((item->>'provider') || ':' || (item->>'provider_id'), 0));
  end loop;
  for item in select value from jsonb_array_elements(p_items) loop
    select celebrity_id into cid from public.celebrity_sources
      where provider=item->>'provider' and provider_id=item->>'provider_id';
    if cid is null then
      insert into public.celebrities(name, category, image, subtitle)
        values (item->>'name',item->>'category',item->>'image',item->>'subtitle') returning id into cid;
      insert into public.celebrity_sources(provider,provider_id,celebrity_id)
        values (item->>'provider',item->>'provider_id',cid);
    end if;
    insert into public.pdf_choice_history(visitor_id,celebrity_id)
      values (p_visitor,cid) on conflict do nothing;
  end loop;
  return jsonb_build_object('status','ok');
end;
$$;
revoke all on function public.record_pdf_choices(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.record_pdf_choices(uuid,jsonb) to service_role;

create or replace function public.selection_rankings()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(r) order by r.votes desc, r.name, r.id), '[]'::jsonb)
  from (
    select src.provider || '-' || src.provider_id as id, c.id as canonical_id,
      c.name, c.category, c.image, c.subtitle, src.provider as source,
      count(distinct s.visitor_id) as votes
    from public.celebrities c
    join public.pdf_choice_history s on s.celebrity_id = c.id
    join lateral (
      select provider, provider_id from public.celebrity_sources
      where celebrity_id = c.id
      order by case provider when 'tmdb' then 0 when 'sportsdb' then 1 else 2 end, provider_id
      limit 1
    ) src on true
    group by c.id, src.provider, src.provider_id
    order by votes desc, c.name, id limit 10
  ) r;
$$;


create or replace function public.merge_celebrity_alias(p_keep uuid, p_duplicate uuid)
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
  insert into public.pdf_choice_history(visitor_id, celebrity_id, first_generated_at)
    select visitor_id, p_keep, first_generated_at from public.pdf_choice_history
    where celebrity_id = p_duplicate
    on conflict (visitor_id, celebrity_id) do update
      set first_generated_at = least(public.pdf_choice_history.first_generated_at, excluded.first_generated_at);
  delete from public.pdf_choice_history where celebrity_id = p_duplicate;
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
