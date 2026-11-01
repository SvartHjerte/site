-- READ ONLY. Review the results before enabling anonymous Auth or applying SQL.
-- Anonymous Auth users share the authenticated role with registered users.
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies order by schemaname, tablename, policyname;

select table_schema, table_name, grantee, privilege_type
from information_schema.role_table_grants
where grantee in ('anon', 'authenticated', 'PUBLIC')
order by table_schema, table_name, grantee, privilege_type;

select routine_schema, routine_name, grantee, privilege_type
from information_schema.role_routine_grants
where grantee in ('anon', 'authenticated', 'PUBLIC')
order by routine_schema, routine_name, grantee;

select n.nspname as schema_name, c.relname as table_name, c.relrowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r','p') and n.nspname not in ('pg_catalog','information_schema')
order by schema_name, table_name;
