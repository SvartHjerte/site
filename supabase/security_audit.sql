-- TheCheatList: MANUAL, READ-ONLY security audit.
-- Intended project: zintkdgpbueciyyydzzp
-- Run this entire file in that project's Supabase SQL Editor as postgres.
-- Returns ONE row containing a JSON report; download/export that result.
-- No application records, user identities, passwords, tokens, or function
-- bodies are selected. Review policy expressions before sharing the report.
-- Nothing here creates objects, changes grants, invokes application functions,
-- changes Auth settings, or executes migrations.
-- This is a single catalog SELECT, with no transaction/session setting changes.
-- Keep it as a single statement so SQL Editor displays the JSON result directly.

with
audit_schemas as (
  select n.oid, n.nspname, n.nspowner, n.nspacl,
    n.nspname not in (
      'auth', 'storage', 'realtime', 'extensions', 'vault',
      'graphql', 'graphql_public', 'supabase_functions', 'supabase_migrations',
      '_analytics', '_realtime', 'supabase_admin', 'cron', 'net', 'pgbouncer'
    ) as application_candidate
  from pg_catalog.pg_namespace n
  where n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
),
audit_relations as (
  select c.*, n.nspname, n.application_candidate
  from pg_catalog.pg_class c
  join audit_schemas n on n.oid = c.relnamespace
  where c.relkind in ('r', 'p', 'v', 'm', 'f')
),
browser_roles as (
  select r.oid, r.rolname from pg_catalog.pg_roles r
  where r.rolname in ('anon', 'authenticated')
),
audit_functions as (
  select p.*, n.nspname, n.application_candidate,
    pg_catalog.pg_get_userbyid(p.proowner) as owner_name,
    exists (
      select 1 from pg_catalog.pg_depend d
      where d.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
        and d.objid = p.oid and d.deptype = 'e'
    ) as extension_managed
  from pg_catalog.pg_proc p
  join audit_schemas n on n.oid = p.pronamespace
  where p.prokind in ('f', 'p')
),
stored_api_settings as (
  select case when s.setdatabase = 0 then 'ALL DATABASES'
      else (select d.datname::text from pg_catalog.pg_database d where d.oid = s.setdatabase) end as database_name,
    case when s.setrole = 0 then 'ALL ROLES'
      else pg_catalog.pg_get_userbyid(s.setrole)::text end as role_name,
    pg_catalog.split_part(setting.value, '=', 1) as setting_name,
    pg_catalog.substr(setting.value, pg_catalog.strpos(setting.value, '=') + 1) as setting_value
  from pg_catalog.pg_db_role_setting s
  cross join lateral pg_catalog.unnest(s.setconfig) as setting(value)
  where pg_catalog.split_part(setting.value, '=', 1) in (
    'pgrst.db_schemas', 'pgrst.db_extra_search_path',
    'pgrst.db_pre_request', 'pgrst.db_pre_config'
  )
)
select pg_catalog.jsonb_pretty(pg_catalog.jsonb_build_object(
  '01_context', pg_catalog.jsonb_build_object(
    'intended_project', 'zintkdgpbueciyyydzzp',
    'database_name', pg_catalog.current_database(),
    'query_role', current_user,
    'postgres_version', pg_catalog.current_setting('server_version'),
    'session_transaction_read_only', pg_catalog.current_setting('transaction_read_only'),
    'audit_time_utc', pg_catalog.timezone('UTC', pg_catalog.statement_timestamp()),
    'limitations', pg_catalog.jsonb_build_array(
      'Application candidate is a classification hint; managed schemas are also included in this report.',
      'Session transaction_read_only may be off; this script itself is only a catalog SELECT with built-in inspection functions.',
      'Effective privileges include inherited and PUBLIC grants; schema USAGE must also allow access.',
      'RLS enabled alone does not prove access is safe: review policies, view ownership, and SECURITY DEFINER functions.',
      'PostgREST settings visible to SQL Editor may be absent, stale, or different from the active API service.',
      'Confirm active exposed schemas and extra search paths in Dashboard Project Settings > Data API.',
      'Auth anonymous sign-in, CAPTCHA, signup rate limits, and redirect configuration require a separate Auth settings inspection.',
      'Function bodies are deliberately omitted. Flagged custom privileged functions need a separate source review.',
      'An empty array means no matching visible catalog entries; it does not certify the project as safe.'
    )
  ),
  '02_schemas', coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'schema', n.nspname,
      'owner', pg_catalog.pg_get_userbyid(n.nspowner),
      'application_candidate', n.application_candidate,
      'effective_browser_privileges', (
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'role', r.rolname,
          'usage', pg_catalog.has_schema_privilege(r.oid, n.oid, 'USAGE'),
          'create', pg_catalog.has_schema_privilege(r.oid, n.oid, 'CREATE')
        ) order by r.rolname) from browser_roles r
      )
    ) order by n.nspname) from audit_schemas n
  ), '[]'::jsonb),
  '03_tables_and_views', coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'schema', c.nspname, 'name', c.relname,
      'kind', case c.relkind when 'r' then 'table' when 'p' then 'partitioned_table'
        when 'v' then 'view' when 'm' then 'materialized_view' when 'f' then 'foreign_table' end,
      'owner', pg_catalog.pg_get_userbyid(c.relowner),
      'application_candidate', c.application_candidate,
      'rls_enabled', c.relrowsecurity, 'rls_forced', c.relforcerowsecurity,
      'view_security_invoker', case when c.relkind = 'v'
        then coalesce('security_invoker=true' = any(c.reloptions), false) else null end,
      'effective_browser_privileges', (
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'role', r.rolname,
          'select', pg_catalog.has_table_privilege(r.oid, c.oid, 'SELECT'),
          'insert', pg_catalog.has_table_privilege(r.oid, c.oid, 'INSERT'),
          'update', pg_catalog.has_table_privilege(r.oid, c.oid, 'UPDATE'),
          'delete', pg_catalog.has_table_privilege(r.oid, c.oid, 'DELETE'),
          'truncate', pg_catalog.has_table_privilege(r.oid, c.oid, 'TRUNCATE'),
          'references', pg_catalog.has_table_privilege(r.oid, c.oid, 'REFERENCES'),
          'trigger', pg_catalog.has_table_privilege(r.oid, c.oid, 'TRIGGER')
        ) order by r.rolname) from browser_roles r
      )
    ) order by c.nspname, c.relname) from audit_relations c
  ), '[]'::jsonb),
  '04_rls_policies', coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'schema', p.schemaname, 'table', p.tablename, 'policy', p.policyname,
      'permissive', p.permissive, 'roles', p.roles, 'command', p.cmd,
      'using_expression', p.qual, 'with_check_expression', p.with_check
    ) order by p.schemaname, p.tablename, p.policyname)
    from pg_catalog.pg_policies p
    join audit_schemas n on n.nspname = p.schemaname
  ), '[]'::jsonb),
  '05_direct_relation_grants', coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'schema', c.nspname, 'relation', c.relname,
      'grantee', case when a.grantee = 0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(a.grantee)::text end,
      'grantor', pg_catalog.pg_get_userbyid(a.grantor),
      'privilege', a.privilege_type, 'grantable', a.is_grantable
    ) order by c.nspname, c.relname, a.grantee, a.privilege_type)
    from audit_relations c
    cross join lateral pg_catalog.aclexplode(coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))) a
    where a.grantee = 0 or a.grantee in (select oid from browser_roles)
  ), '[]'::jsonb),
  '06_direct_column_grants', coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'schema', c.nspname, 'relation', c.relname, 'column', col.attname,
      'grantee', case when a.grantee = 0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(a.grantee)::text end,
      'privilege', a.privilege_type, 'grantable', a.is_grantable
    ) order by c.nspname, c.relname, col.attnum, a.grantee, a.privilege_type)
    from audit_relations c
    join pg_catalog.pg_attribute col on col.attrelid = c.oid
      and col.attnum > 0 and not col.attisdropped
    cross join lateral pg_catalog.aclexplode(col.attacl) a
    where a.grantee = 0 or a.grantee in (select oid from browser_roles)
  ), '[]'::jsonb),
  '07_direct_schema_grants', coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'schema', n.nspname,
      'grantee', case when a.grantee = 0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(a.grantee)::text end,
      'privilege', a.privilege_type, 'grantable', a.is_grantable
    ) order by n.nspname, a.grantee, a.privilege_type)
    from audit_schemas n
    cross join lateral pg_catalog.aclexplode(coalesce(n.nspacl, pg_catalog.acldefault('n', n.nspowner))) a
    where a.grantee = 0 or a.grantee in (select oid from browser_roles)
  ), '[]'::jsonb),
  '08_privileged_and_custom_functions', coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'schema', p.nspname, 'name', p.proname,
      'signature', pg_catalog.oidvectortypes(p.proargtypes),
      'kind', case p.prokind when 'p' then 'procedure' else 'function' end,
      'owner', p.owner_name,
      'owner_superuser', owner_role.rolsuper, 'owner_bypasses_rls', owner_role.rolbypassrls,
      'security_definer', p.prosecdef, 'extension_managed', p.extension_managed,
      'language', l.lanname,
      'search_path', (select pg_catalog.substr(cfg, 13) from pg_catalog.unnest(p.proconfig) cfg
        where pg_catalog.left(cfg, 12) = 'search_path=' limit 1),
      'row_security_setting', (select cfg from pg_catalog.unnest(p.proconfig) cfg
        where pg_catalog.left(cfg, 13) = 'row_security=' limit 1),
      'effective_browser_execute', (
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'role', r.rolname, 'execute', pg_catalog.has_function_privilege(r.oid, p.oid, 'EXECUTE')
        ) order by r.rolname) from browser_roles r
      ),
      'direct_relevant_grants', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'grantee', case when a.grantee = 0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(a.grantee)::text end,
          'privilege', a.privilege_type, 'grantable', a.is_grantable
        ) order by a.grantee, a.privilege_type)
        from pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
        where a.grantee = 0 or a.grantee in (select oid from browser_roles)
      ), '[]'::jsonb)
    ) order by p.nspname, p.proname, p.oid)
    from audit_functions p
    join pg_catalog.pg_roles owner_role on owner_role.oid = p.proowner
    join pg_catalog.pg_language l on l.oid = p.prolang
    where p.prosecdef or not p.extension_managed
      or exists (select 1 from browser_roles r where pg_catalog.has_function_privilege(r.oid, p.oid, 'EXECUTE'))
  ), '[]'::jsonb),
  '09_future_object_default_grants', coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'object_creator_role', pg_catalog.pg_get_userbyid(d.defaclrole),
      'schema', coalesce(n.nspname::text, 'ALL SCHEMAS'),
      'object_type', case d.defaclobjtype when 'r' then 'tables' when 'S' then 'sequences'
        when 'f' then 'functions' when 'T' then 'types' when 'n' then 'schemas' else d.defaclobjtype::text end,
      'grantee', case when a.grantee = 0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(a.grantee)::text end,
      'privilege', a.privilege_type, 'grantable', a.is_grantable
    ) order by d.defaclrole, d.defaclnamespace, d.defaclobjtype, a.grantee, a.privilege_type)
    from pg_catalog.pg_default_acl d
    left join pg_catalog.pg_namespace n on n.oid = d.defaclnamespace
    cross join lateral pg_catalog.aclexplode(d.defaclacl) a
    where a.grantee = 0 or a.grantee in (select oid from browser_roles)
  ), '[]'::jsonb),
  '10_browser_roles_and_inherited_memberships', coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'role', r.rolname, 'superuser', r.rolsuper, 'bypass_rls', r.rolbypassrls,
      'can_login', r.rolcanlogin, 'create_role', r.rolcreaterole, 'create_database', r.rolcreatedb,
      'inherits_privileges', r.rolinherit,
      'memberships', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'member_of', parent.rolname,
          'privileges_available_without_set_role', pg_catalog.pg_has_role(r.oid, parent.oid, 'USAGE'),
          'parent_superuser', parent.rolsuper, 'parent_bypass_rls', parent.rolbypassrls
        ) order by parent.rolname)
        from pg_catalog.pg_roles parent
        where parent.oid <> r.oid and pg_catalog.pg_has_role(r.oid, parent.oid, 'MEMBER')
      ), '[]'::jsonb)
    ) order by r.rolname)
    from pg_catalog.pg_roles r where r.rolname in ('anon', 'authenticated', 'authenticator', 'service_role')
  ), '[]'::jsonb),
  '11_exposed_schema_settings_discoverable_from_sql', pg_catalog.jsonb_build_object(
    'sql_editor_session_db_schemas', pg_catalog.current_setting('pgrst.db_schemas', true),
    'sql_editor_session_extra_search_path', pg_catalog.current_setting('pgrst.db_extra_search_path', true),
    'stored_database_role_settings', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(s) order by s.database_name, s.role_name, s.setting_name)
      from stored_api_settings s
    ), '[]'::jsonb),
    'manual_confirmation_required', 'Dashboard Project Settings > Data API: Exposed schemas and Extra search path. Null/empty SQL results do not mean no schemas are exposed.'
  ),
  '12_sequences_accessible_to_browser_roles', coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'schema', n.nspname, 'sequence', c.relname, 'role', r.rolname,
      'usage', pg_catalog.has_sequence_privilege(r.oid, c.oid, 'USAGE'),
      'select', pg_catalog.has_sequence_privilege(r.oid, c.oid, 'SELECT'),
      'update', pg_catalog.has_sequence_privilege(r.oid, c.oid, 'UPDATE')
    ) order by n.nspname, c.relname, r.rolname)
    from pg_catalog.pg_class c
    join audit_schemas n on n.oid = c.relnamespace
    cross join browser_roles r
    where c.relkind = 'S' and pg_catalog.has_sequence_privilege(r.oid, c.oid, 'USAGE,SELECT,UPDATE')
  ), '[]'::jsonb),
  '13_installed_extensions', coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'name', e.extname, 'version', e.extversion, 'schema', n.nspname
    ) order by e.extname)
    from pg_catalog.pg_extension e
    join pg_catalog.pg_namespace n on n.oid = e.extnamespace
  ), '[]'::jsonb)
)) as security_audit;
