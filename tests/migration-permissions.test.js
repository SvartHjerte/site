const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

test('migration revokes browser/PUBLIC access even with permissive object defaults', async () => {
  // Entirely local: no Supabase connection, credentials, or audit query execution.
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key);
      alter default privileges grant all on tables to public, anon, authenticated;
      alter default privileges in schema public grant all on tables to public, anon, authenticated;
      alter default privileges grant execute on functions to public, anon, authenticated;
      alter default privileges in schema public grant execute on functions to public, anon, authenticated;
      create table public.default_grant_probe(id integer);
      create function public.default_function_probe() returns integer language sql as 'select 1';
    `);
    for (const role of ['anon', 'authenticated']) {
      const probe = (await db.query(`select
        has_table_privilege($1, 'public.default_grant_probe', 'SELECT') as table_access,
        has_function_privilege($1, 'public.default_function_probe()', 'EXECUTE') as function_access`, [role])).rows[0];
      assert.equal(probe.table_access, true);
      assert.equal(probe.function_access, true);
    }
    await db.exec('drop table public.default_grant_probe; drop function public.default_function_probe();');
    await db.exec(readFileSync(join(__dirname, '../supabase/migrations/202610310001_rankings.sql'), 'utf8'));

    const tables = ['celebrities', 'celebrity_sources', 'visitor_selections', 'visitor_sync_state'];
    const functions = ['selection_rankings()', 'selection_sync_gate(uuid)', 'sync_visitor_selections(uuid,bigint,uuid,jsonb)'];
    for (const role of ['anon', 'authenticated']) {
      for (const table of tables) {
        for (const permission of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
          const result = await db.query('select has_table_privilege($1, $2, $3) as allowed', [role, `public.${table}`, permission]);
          assert.equal(result.rows[0].allowed, false, `${role} must not have ${permission} on ${table}`);
        }
      }
      for (const fn of functions) {
        const result = await db.query('select has_function_privilege($1, $2, $3) as allowed', [role, `public.${fn}`, 'EXECUTE']);
        assert.equal(result.rows[0].allowed, false, `${role} must not execute ${fn}`);
      }
    }
    const publicTableGrants = await db.query(`select c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      cross join lateral aclexplode(c.relacl) a
      where n.nspname = 'public' and c.relname = any($1::text[]) and a.grantee = 0`, [tables]);
    assert.deepEqual(publicTableGrants.rows, []);
    const publicFunctionGrants = await db.query(`select p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      cross join lateral aclexplode(p.proacl) a
      where n.nspname = 'public' and p.proname = any($1::text[]) and a.grantee = 0`,
      [['selection_rankings', 'selection_sync_gate', 'sync_visitor_selections']]);
    assert.deepEqual(publicFunctionGrants.rows, []);
    for (const fn of functions) {
      const result = await db.query('select has_function_privilege($1, $2, $3) as allowed', ['service_role', `public.${fn}`, 'EXECUTE']);
      assert.equal(result.rows[0].allowed, true);
    }
    await db.exec('set role service_role');
    assert.deepEqual((await db.query('select public.selection_rankings() as rankings')).rows[0].rankings, []);
    await db.exec('reset role');
  } finally { await db.close(); }
});
