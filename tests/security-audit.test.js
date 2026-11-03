const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const directory = join(__dirname, '../supabase');
const sql = readFileSync(join(directory, 'rankings_security_audit.sql'), 'utf8');
const buckets = readFileSync(join(directory, 'storage_bucket_audit.sql'), 'utf8');
async function audit(db) {
  // PostgreSQL enforces read-only execution, beyond a text-based SQL check.
  await db.exec('begin read only');
  try { return JSON.parse((await db.query(sql)).rows[0].rankings_security_audit); }
  finally { await db.exec('rollback'); }
}
async function install(db) {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create schema storage; create table storage.buckets(id text primary key, public boolean);
    create table storage.objects(id uuid, bucket_id text, private_metadata text);
    alter table storage.buckets enable row level security;
    alter table storage.objects enable row level security;
    grant usage on schema public, storage to anon, authenticated, service_role;
    grant select,insert,update,delete on storage.objects to authenticated;
    create policy example_storage_policy on storage.objects for select to authenticated
      using (private_metadata <> 'DO_NOT_EXPOSE_POLICY_SECRET');
    insert into storage.buckets values ('public-assets',true),('private-agreements',false);`);
  for (const file of readdirSync(join(directory, 'migrations')).sort()) {
    await db.exec(readFileSync(join(directory, 'migrations', file), 'utf8'));
  }
}

test('audit reports missing installation and roles without errors or a false PASS', async () => {
  const db = new PGlite();
  try {
    const report = await audit(db);
    assert.ok(report.summary.MISSING > 0);
    assert.equal(report.checks.filter(c => c.check_name === 'rankings_rls' && c.status === 'MISSING').length, 4);
    assert.equal(report.rankings_tables.length, 4);
    assert.equal(report.storage_relations.length, 0);
  } finally { await db.close(); }
});

test('audit matches installed migrations, preserves read-only execution and excludes secrets', async () => {
  const db = new PGlite();
  try {
    await install(db);
    const report = await audit(db);
    assert.equal(report.summary.FAIL, undefined);
    assert.equal(report.summary.MISSING, undefined);
    assert.equal(report.checks.filter(c => c.check_name === 'rankings_rpc_hardening' && c.status === 'PASS').length, 4);
    assert.equal(report.rankings_table_permissions.find(p => p.role === 'service_role' && p.relation === 'celebrities' && p.privilege === 'SELECT').expected, true);
    assert.equal(report.existing_policies[0].name, 'example_storage_policy');
    assert.ok(!JSON.stringify(report).includes('DO_NOT_EXPOSE'));
    assert.ok(report.storage_permissions.some(p => p.name === 'objects' && p.role === 'authenticated' && p.select_any_column));
    await db.exec('begin read only');
    const bucketReport = JSON.parse((await db.query(buckets)).rows[0].storage_bucket_audit);
    await db.exec('rollback');
    assert.equal(bucketReport.public_bucket_count, 1);
    assert.equal(bucketReport.private_bucket_count, 1);
    assert.equal(bucketReport.public_bucket_review[0].bucket_id, 'public-assets');
    assert.ok(!JSON.stringify(bucketReport).includes('private-agreements'));
  } finally { await db.close(); }
});

test('audit detects unsafe RLS, PUBLIC/column/inherited grants, RPCs, policies and nested views', async () => {
  const db = new PGlite();
  try {
    await install(db);
    await db.exec(`
      alter table public.visitor_selections disable row level security;
      grant select(visitor_id) on public.visitor_selections to public;
      create role leaked_reader;
      grant select on public.visitor_sync_state to leaked_reader;
      grant leaked_reader to authenticated;
      grant delete on public.celebrities to service_role;
      grant execute on function public.sync_visitor_selections(uuid,bigint,uuid,jsonb) to public;
      grant execute on function public.merge_celebrity_alias(uuid,uuid) to service_role;
      alter function public.selection_sync_gate(uuid) security invoker;
      alter function public.selection_sync_gate(uuid) set search_path = public;
      grant create on schema public to authenticated;
      alter role service_role createrole;
      create policy unexpected_public_policy on public.visitor_sync_state for select to public using (true);
      create view public.leaked_view as select visitor_id from public.visitor_selections;
      create view public.leaked_nested_view as select * from public.leaked_view;
      grant select on public.leaked_nested_view to anon;
      create function public.indirect_leak() returns text language sql security definer
        as $$ select 'DO_NOT_EXPOSE_FUNCTION_SECRET'::text $$;
      create function public.selection_rankings(integer) returns integer language sql as 'select 1';
      alter table storage.objects disable row level security;
    `);
    const report = await audit(db);
    const fails = report.checks.filter(c => c.status === 'FAIL');
    const failed = (name, object) => fails.some(c => c.check_name === name && c.object_name === object);
    assert.ok(failed('rankings_rls', 'public.visitor_selections'));
    assert.ok(failed('rankings_table_permission', 'public.visitor_selections:public:SELECT'));
    assert.ok(failed('rankings_table_permission', 'public.visitor_sync_state:authenticated:SELECT'));
    assert.ok(failed('rankings_table_permission', 'public.celebrities:service_role:DELETE'));
    assert.ok(failed('rankings_rpc_permission', 'public.sync_visitor_selections(uuid,bigint,uuid,jsonb):public'));
    assert.ok(failed('rankings_rpc_permission', 'public.merge_celebrity_alias(uuid,uuid):service_role'));
    assert.ok(failed('rankings_rpc_hardening', 'public.selection_sync_gate(uuid)'));
    assert.ok(failed('public_schema_permission', 'authenticated'));
    assert.ok(failed('role_safety', 'service_role'));
    assert.ok(fails.some(c => c.check_name === 'unexpected_rankings_policy'));
    assert.ok(failed('storage_rls_disabled', 'storage.objects'));
    assert.ok(report.browser_accessible_views_of_rankings.some(v => v.name === 'leaked_nested_view' && v.role === 'anon'));
    assert.ok(report.browser_callable_privileged_or_rankings_functions.some(f => f.name === 'indirect_leak'));
    assert.ok(report.browser_callable_privileged_or_rankings_functions.some(f => f.name === 'selection_rankings' && f.argument_types === 'integer'));
    assert.ok(!JSON.stringify(report).includes('DO_NOT_EXPOSE'));
  } finally { await db.close(); }
});
