-- MANUAL, READ-ONLY inspection for project zintkdgpbueciyyydzzp.
-- Run in the Supabase SQL Editor as postgres and export the single JSON result.
-- This reads catalog metadata and function SOURCE; it DOES NOT CALL the function.
-- Every overload named public.rls_auto_enable is included. No rows means no match.
-- Review the definition before sharing: redact any embedded credentials/secrets.
-- No ALTER, REVOKE, GRANT, migrations, or application/user data reads occur here.

with targets as (
  select p.*
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'rls_auto_enable'
    and p.prokind in ('f', 'p')
)
select pg_catalog.jsonb_pretty(coalesce((
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'schema', 'public',
    'name', p.proname,
    'identity_arguments', pg_catalog.pg_get_function_identity_arguments(p.oid),
    'return_type', pg_catalog.pg_get_function_result(p.oid),
    'is_event_trigger_function', p.prorettype = 'pg_catalog.event_trigger'::pg_catalog.regtype,
    'is_row_trigger_function', p.prorettype = 'pg_catalog.trigger'::pg_catalog.regtype,
    'security_definer', p.prosecdef,
    'owner', owner_role.rolname,
    'owner_is_superuser', owner_role.rolsuper,
    'owner_bypasses_rls', owner_role.rolbypassrls,
    'language', lang.lanname,
    'search_path', (
      select pg_catalog.substr(cfg, 13)
      from pg_catalog.unnest(p.proconfig) cfg
      where pg_catalog.left(cfg, 12) = 'search_path=' limit 1
    ),
    'effective_browser_permissions', (
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'role', r.rolname,
        'execute', pg_catalog.has_function_privilege(r.oid, p.oid, 'EXECUTE'),
        'public_schema_usage', pg_catalog.has_schema_privilege(r.oid, 'public', 'USAGE'),
        'public_schema_create', pg_catalog.has_schema_privilege(r.oid, 'public', 'CREATE')
      ) order by r.rolname)
      from pg_catalog.pg_roles r where r.rolname in ('anon', 'authenticated')
    ),
    'direct_execute_grants', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'grantee', case when a.grantee = 0 then 'PUBLIC'
          else pg_catalog.pg_get_userbyid(a.grantee)::text end,
        'grantor', pg_catalog.pg_get_userbyid(a.grantor),
        'privilege', a.privilege_type,
        'grantable', a.is_grantable
      ) order by a.grantee, a.privilege_type)
      from pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
    ), '[]'::jsonb),
    'extension_membership', coalesce((
      select pg_catalog.jsonb_agg(e.extname order by e.extname)
      from pg_catalog.pg_depend d
      join pg_catalog.pg_extension e on e.oid = d.refobjid
      where d.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
        and d.refclassid = 'pg_catalog.pg_extension'::pg_catalog.regclass
        and d.objid = p.oid and d.deptype = 'e'
    ), '[]'::jsonb),
    'attached_event_triggers', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'name', e.evtname,
        'event', e.evtevent,
        'owner', pg_catalog.pg_get_userbyid(e.evtowner),
        'enabled_mode', e.evtenabled,
        'command_tags', e.evttags
      ) order by e.evtname)
      from pg_catalog.pg_event_trigger e where e.evtfoid = p.oid
    ), '[]'::jsonb),
    'attached_table_triggers', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'schema', ns.nspname,
        'table', c.relname,
        'trigger', t.tgname,
        'enabled_mode', t.tgenabled,
        'internal', t.tgisinternal
      ) order by ns.nspname, c.relname, t.tgname)
      from pg_catalog.pg_trigger t
      join pg_catalog.pg_class c on c.oid = t.tgrelid
      join pg_catalog.pg_namespace ns on ns.oid = c.relnamespace
      where t.tgfoid = p.oid
    ), '[]'::jsonb),
    'definition', pg_catalog.pg_get_functiondef(p.oid)
  ) order by p.oid)
  from targets p
  join pg_catalog.pg_roles owner_role on owner_role.oid = p.proowner
  join pg_catalog.pg_language lang on lang.oid = p.prolang
), '[]'::jsonb)) as rls_auto_enable_inspection;
