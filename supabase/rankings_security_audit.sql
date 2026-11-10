-- MANUAL READ-ONLY AUDIT: paste this whole file into Supabase SQL Editor.
-- Run as postgres in the intended project. ONE catalog SELECT, no mutations,
-- application RPC calls, application rows, function bodies, tokens or secrets.
-- Missing objects are reported, so this also works before migrations are applied.
-- See SECURITY-AUDIT.md. Run storage_bucket_audit.sql separately as well.
with recursive
expected_tables(name, service_select) as (values
  ('celebrities', true), ('celebrity_sources', true),
  ('visitor_selections', false), ('visitor_sync_state', false), ('pdf_choice_history', false)
),
expected_rpc(signature, service_execute) as (values
  ('public.selection_rankings()', true),
  ('public.record_pdf_choices(uuid,jsonb)', true),
  ('public.selection_sync_gate(uuid)', true),
  ('public.sync_visitor_selections(uuid,bigint,uuid,jsonb)', true),
  ('public.merge_celebrity_alias(uuid,uuid)', false)
),
expected_roles(name) as (values ('anon'), ('authenticated'), ('service_role'), ('public')),
roles as (
  select e.name, r.oid, r.rolsuper, r.rolbypassrls, r.rolcreaterole, r.rolcreatedb,
    e.name = 'public' or r.oid is not null as present
  from expected_roles e left join pg_catalog.pg_roles r on r.rolname = e.name
),
schema_permissions as (
  select r.name as role, r.present,
    case when r.present then pg_catalog.has_schema_privilege(r.name, 'public', 'USAGE') end as schema_usage,
    case when r.present then pg_catalog.has_schema_privilege(r.name, 'public', 'CREATE') end as can_create
  from roles r
),
tables as (
  select e.*, c.oid, c.relkind, c.relrowsecurity, c.relforcerowsecurity,
    pg_catalog.pg_get_userbyid(c.relowner) as owner
  from expected_tables e
  left join pg_catalog.pg_namespace n on n.nspname = 'public'
  left join pg_catalog.pg_class c on c.relnamespace = n.oid and c.relname = e.name
),
rpc as (
  select e.*, p.oid, p.prosecdef, p.proconfig, p.proowner,
    pg_catalog.pg_get_userbyid(p.proowner) as owner,
    pg_catalog.md5(p.prosrc) as body_fingerprint
  from expected_rpc e left join pg_catalog.pg_proc p
    on p.oid = pg_catalog.to_regprocedure(e.signature)
),
table_permissions as (
  select t.name as relation, r.name as role, perm.privilege,
    case when t.oid is not null and r.present then
      pg_catalog.has_table_privilege(r.name, t.oid, perm.privilege) end as table_allowed,
    case when t.oid is not null and r.present and perm.privilege in ('SELECT','INSERT','UPDATE','REFERENCES')
      then pg_catalog.has_any_column_privilege(r.name, t.oid, perm.privilege) end as any_column_allowed,
    r.name = 'service_role' and t.service_select and perm.privilege = 'SELECT' as expected,
    t.oid is not null and r.present as present
  from tables t cross join roles r
  cross join (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) perm(privilege)
),
rpc_permissions as (
  select f.signature, r.name as role,
    case when f.oid is not null and r.present then
      pg_catalog.has_function_privilege(r.name, f.oid, 'EXECUTE') end as allowed,
    r.name = 'service_role' and f.service_execute as expected,
    f.oid is not null and r.present as present
  from rpc f cross join roles r
),
-- Catalog dependency traversal finds views of views without reading any rows.
dependent_relations(root_oid, oid, path) as (
  select oid, oid, array[oid] from tables where oid is not null
  union all
  select d.root_oid, v.oid, d.path || v.oid
  from dependent_relations d
  join pg_catalog.pg_depend dep on dep.refclassid = 'pg_catalog.pg_class'::pg_catalog.regclass
    and dep.refobjid = d.oid and dep.classid = 'pg_catalog.pg_rewrite'::pg_catalog.regclass
  join pg_catalog.pg_rewrite rw on rw.oid = dep.objid
  join pg_catalog.pg_class v on v.oid = rw.ev_class and v.relkind in ('v','m')
  where not v.oid = any(d.path)
),
exposed_views as (
  select distinct n.nspname as schema, c.relname as name, c.relkind,
    coalesce('security_invoker=true' = any(c.reloptions), false) as security_invoker,
    r.name as role, t.name as rankings_dependency
  from dependent_relations d join tables t on t.oid = d.root_oid
  join pg_catalog.pg_class c on c.oid = d.oid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  cross join roles r
  where d.oid <> d.root_oid and r.name in ('anon','authenticated','public') and r.present
    and pg_catalog.has_any_column_privilege(r.name, c.oid, 'SELECT')
),
policies as (
  select p.schemaname as schema, p.tablename as relation, p.policyname as name,
    p.roles, p.cmd as command, p.permissive,
    p.qual is not null as has_using, p.with_check is not null as has_with_check,
    pg_catalog.md5(coalesce(p.qual,'') || chr(10) || coalesce(p.with_check,'')) as expression_fingerprint
  from pg_catalog.pg_policies p
  where p.schemaname !~ '^pg_' and p.schemaname <> 'information_schema'
),
storage_relations as (
  select c.oid, c.relname as name, c.relkind, c.relrowsecurity as rls_enabled,
    c.relforcerowsecurity as rls_forced
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'storage' and c.relkind in ('r','p','v','m','f')
),
storage_permissions as (
  select s.name, r.name as role,
    pg_catalog.has_schema_privilege(r.name, 'storage', 'USAGE') as schema_usage,
    pg_catalog.has_any_column_privilege(r.name, s.oid, 'SELECT') as select_any_column,
    pg_catalog.has_any_column_privilege(r.name, s.oid, 'INSERT') as insert_any_column,
    pg_catalog.has_any_column_privilege(r.name, s.oid, 'UPDATE') as update_any_column,
    pg_catalog.has_table_privilege(r.name, s.oid, 'DELETE') as delete,
    pg_catalog.has_table_privilege(r.name, s.oid, 'TRUNCATE') as truncate
  from storage_relations s cross join roles r where r.present
),
browser_functions as (
  select n.nspname as schema, p.proname as name,
    pg_catalog.oidvectortypes(p.proargtypes) as argument_types,
    p.prosecdef as security_definer, pg_catalog.pg_get_userbyid(p.proowner) as owner,
    pg_catalog.md5(p.prosrc) as body_fingerprint, r.name as role,
    exists (select 1 from rpc f where f.oid = p.oid) as expected_rankings_rpc
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  cross join roles r
  where n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
    and p.prokind in ('f','p') and r.name in ('anon','authenticated','public') and r.present
    and pg_catalog.has_function_privilege(r.name, p.oid, 'EXECUTE')
    and (p.prosecdef or p.proname in ('selection_rankings','selection_sync_gate','sync_visitor_selections','merge_celebrity_alias'))
),
checks(status, check_name, object_name, detail) as (
  select case when oid is null then 'MISSING' when relkind not in ('r','p') or not relrowsecurity then 'FAIL' else 'PASS' end,
    'rankings_rls', 'public.' || name, 'Expected a table with RLS enabled; FORCE RLS is informational.' from tables
  union all
  select case when not present then 'MISSING'
    when coalesce(table_allowed,false) <> expected or (coalesce(any_column_allowed,false) <> expected
      and privilege in ('SELECT','INSERT','UPDATE','REFERENCES')) then 'FAIL' else 'PASS' end,
    'rankings_table_permission', 'public.' || relation || ':' || role || ':' || privilege,
    'Expected allowed=' || expected::text || '; checks effective table AND column grants, including inherited/PUBLIC access.'
  from table_permissions
  union all
  select case when not present then 'MISSING' when allowed <> expected then 'FAIL' else 'PASS' end,
    'rankings_rpc_permission', signature || ':' || role, 'Expected EXECUTE=' || expected::text from rpc_permissions
  union all
  select case when oid is null then 'MISSING'
    when not prosecdef or not coalesce(proconfig @> array['search_path=""'], false) then 'FAIL'
    when owner <> 'postgres' then 'REVIEW' else 'PASS' end,
    'rankings_rpc_hardening', signature,
    'Expected SECURITY DEFINER, empty search_path and reviewed postgres owner; bodies are fingerprinted, not executed or printed.' from rpc
  union all
  select case when not present then 'MISSING'
    when rolsuper or rolcreaterole or rolcreatedb or (name in ('anon','authenticated') and rolbypassrls) then 'FAIL'
    when name = 'service_role' and not rolbypassrls then 'REVIEW' else 'PASS' end,
    'role_safety', name, 'No API role should be superuser/create-role/create-database. Only service_role BYPASSRLS is expected; it does not itself grant table access.'
  from roles where name <> 'public'
  union all
  select case when not present then 'MISSING' when can_create then 'FAIL'
    when role = 'service_role' and not schema_usage then 'FAIL' else 'PASS' end,
    'public_schema_permission', role,
    'Browser/PUBLIC/service roles should not CREATE in public; service_role needs USAGE for cache reads and RPC calls.'
  from schema_permissions
  union all
  select 'FAIL', 'unexpected_rankings_policy', 'public.' || relation || ':' || name,
    'The server-only rankings design expects no RLS policies on rankings tables.'
  from policies where schema = 'public' and relation in (select name from expected_tables)
  union all
  select 'REVIEW', 'browser_view_of_rankings', schema || '.' || name || ':' || role,
    'SELECT grant on a view depending on ' || rankings_dependency || '; check view ownership, invoker mode, columns and API exposure.' from exposed_views
  union all
  select 'REVIEW', 'browser_privileged_or_rankings_function', schema || '.' || name || '(' || argument_types || '):' || role,
    'Review implementation privately for indirect data access; SQL/dynamic function dependencies are not fully discoverable.' from browser_functions
  union all
  select case when exists (select 1 from storage_relations where name = target.name) then 'REVIEW' else 'MISSING' end,
    'storage_inventory', 'storage.' || target.name,
    'Review Storage grants/policies and run the separate bucket audit; rankings and agreements require no Storage access.'
  from (values ('objects'),('buckets')) target(name)
  union all
  select 'FAIL', 'storage_rls_disabled', 'storage.' || name, 'RLS is disabled on a Storage table.'
  from storage_relations where relkind in ('r','p') and not rls_enabled
)
select pg_catalog.jsonb_pretty(pg_catalog.jsonb_build_object(
  'context', pg_catalog.jsonb_build_object(
    'audit_version', 1, 'time_utc', pg_catalog.timezone('UTC', pg_catalog.statement_timestamp()),
    'server_version', pg_catalog.current_setting('server_version'),
    'catalog_only', true, 'scope', 'Rankings migrations plus existing database and Storage permissions',
    'limitations', pg_catalog.jsonb_build_array(
      'MISSING is expected before installation but never means ready for activation.',
      'Privileges are effective, including inherited and PUBLIC grants; grants do not alone prove rows are readable under RLS.',
      'An anonymous Auth visitor uses authenticated, not the anon API role.',
      'Policy expressions/function bodies are omitted to avoid exposing embedded secrets; fingerprints detect changes, not correctness.',
      'Existing policies and privileged functions require private source review; indirect/dynamic SQL, custom API roles and copied data cannot be fully audited here.',
      'Public Storage buckets bypass download RLS; run storage_bucket_audit.sql separately.',
      'No overall production-safe verdict: confirm Data API exposed schemas, Auth/CAPTCHA/rate limits and real staging requests separately.'
    )
  ),
  'summary', (select pg_catalog.jsonb_object_agg(status, n) from (select status, count(*) n from checks group by status) s),
  'checks', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(c) order by status, check_name, object_name) from checks c), '[]'::jsonb),
  'roles', (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) order by name) from roles r),
  'public_schema_permissions', (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(s) order by role) from schema_permissions s),
  'rankings_tables', (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) order by name) from tables t),
  'rankings_table_permissions', (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(p) order by relation, role, privilege) from table_permissions p),
  'rankings_rpc', (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(f) - 'proconfig' order by signature) from rpc f),
  'rankings_rpc_permissions', (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(p) order by signature, role) from rpc_permissions p),
  'existing_policies', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(p) order by schema, relation, name) from policies p), '[]'::jsonb),
  'browser_accessible_views_of_rankings', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(v) order by schema, name, role) from exposed_views v), '[]'::jsonb),
  'browser_callable_privileged_or_rankings_functions', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(f) order by schema, name, role) from browser_functions f), '[]'::jsonb),
  'storage_relations', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(s) order by name) from storage_relations s), '[]'::jsonb),
  'storage_permissions', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(s) order by name, role) from storage_permissions s), '[]'::jsonb),
  'role_memberships', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'role', r.name, 'member_of', parent.rolname,
    'inherited_now', pg_catalog.pg_has_role(r.oid, parent.oid, 'USAGE')
  ) order by r.name, parent.rolname) from roles r cross join pg_catalog.pg_roles parent
    where r.oid is not null and r.oid <> parent.oid and pg_catalog.pg_has_role(r.oid, parent.oid, 'MEMBER')), '[]'::jsonb)
)) as rankings_security_audit;
