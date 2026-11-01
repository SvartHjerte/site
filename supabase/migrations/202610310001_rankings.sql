-- Local migration only. Do not apply to the hosted project without approval.
begin;

create table public.celebrities (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 200),
  category text not null check (category in ('woman', 'man', 'other')),
  image text not null default '' check (image = '' or image ~ '^https://'),
  subtitle text not null default '' check (length(subtitle) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.celebrity_sources (
  provider text not null check (provider in ('tmdb', 'sportsdb', 'audiodb')),
  provider_id text not null check (provider_id ~ '^[1-9][0-9]{0,11}$'),
  celebrity_id uuid not null references public.celebrities(id),
  created_at timestamptz not null default now(),
  primary key (provider, provider_id)
);
create index celebrity_sources_celebrity_idx on public.celebrity_sources(celebrity_id);
create table public.visitor_sync_state (
  visitor_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 0 check (revision >= 0),
  last_request_id uuid,
  last_payload jsonb,
  rate_window timestamptz not null default now(),
  rate_count integer not null default 0,
  updated_at timestamptz not null default now()
);
create table public.visitor_selections (
  visitor_id uuid not null references auth.users(id) on delete cascade,
  slot text not null check (slot in ('her', 'his')),
  celebrity_id uuid not null references public.celebrities(id),
  created_at timestamptz not null default now(),
  primary key (visitor_id, slot, celebrity_id)
);
create index visitor_selections_celebrity_idx on public.visitor_selections(celebrity_id, visitor_id);

alter table public.celebrities enable row level security;
alter table public.celebrity_sources enable row level security;
alter table public.visitor_selections enable row level security;
alter table public.visitor_sync_state enable row level security;
-- No browser table grants or policies. Only the server may access these tables.
revoke all on public.celebrities, public.celebrity_sources,
  public.visitor_selections, public.visitor_sync_state from public, anon, authenticated, service_role;
-- Reset service_role defaults too: the server only reads the metadata cache
-- directly. All selection/state access and writes use the owner privileges of
-- the SECURITY DEFINER RPCs below (run this migration as postgres).
grant select on public.celebrities, public.celebrity_sources to service_role;

create function public.selection_rankings()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(r) order by r.votes desc, r.name, r.id), '[]'::jsonb)
  from (
    select src.provider || '-' || src.provider_id as id, c.id as canonical_id,
      c.name, c.category, c.image, c.subtitle, src.provider as source,
      count(distinct s.visitor_id) as votes
    from public.celebrities c
    join public.visitor_selections s on s.celebrity_id = c.id
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

-- Called before provider lookups. Committed separately so failed validation also
-- consumes a rate-limit attempt. Row locking serializes serverless instances.
create function public.selection_sync_gate(p_visitor uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.visitor_sync_state;
begin
  insert into public.visitor_sync_state(visitor_id) values (p_visitor) on conflict do nothing;
  select * into s from public.visitor_sync_state where visitor_id = p_visitor for update;
  if s.rate_window <= now() - interval '1 minute' then
    s.rate_window := now(); s.rate_count := 0;
  end if;
  if s.rate_count >= 30 then return jsonb_build_object('status', 'rate_limited'); end if;
  update public.visitor_sync_state set rate_window = s.rate_window, rate_count = s.rate_count + 1
    where visitor_id = p_visitor;
  return jsonb_build_object('status', 'ok', 'revision', s.revision);
end;
$$;

-- p_items contains only server-validated provider data, never browser metadata.
-- Compare-and-swap revision + request UUID makes retries idempotent. The full
-- replacement of BOTH slots is one PostgreSQL transaction.
create function public.sync_visitor_selections(
  p_visitor uuid, p_revision bigint, p_request_id uuid, p_items jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.visitor_sync_state;
  item jsonb;
  cid uuid;
begin
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

revoke all on function public.selection_rankings(), public.selection_sync_gate(uuid),
  public.sync_visitor_selections(uuid,bigint,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.selection_rankings(), public.selection_sync_gate(uuid),
  public.sync_visitor_selections(uuid,bigint,uuid,jsonb) to service_role;
commit;
