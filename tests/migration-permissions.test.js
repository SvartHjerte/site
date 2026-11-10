const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { randomUUID } = require('node:crypto');

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
      alter default privileges grant all on tables to service_role;
      alter default privileges in schema public grant all on tables to service_role;
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
    for (const file of readdirSync(join(__dirname, '../supabase/migrations')).sort()) {
      await db.exec(readFileSync(join(__dirname, '../supabase/migrations', file), 'utf8'));
    }
    for (const role of ['anon', 'authenticated', 'service_role']) {
      assert.equal((await db.query('select has_function_privilege($1, $2, $3) as allowed',
        [role, 'public.merge_celebrity_alias(uuid,uuid)', 'EXECUTE'])).rows[0].allowed, false);
    }

    const tables = ['celebrities', 'celebrity_sources', 'visitor_selections', 'visitor_sync_state', 'pdf_choice_history'];
    const functions = ['selection_rankings()', 'selection_sync_gate(uuid)', 'sync_visitor_selections(uuid,bigint,uuid,jsonb)', 'record_pdf_choices(uuid,jsonb)'];
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
    for (const table of tables) {
      for (const permission of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
        const expected = permission === 'SELECT' && ['celebrities', 'celebrity_sources'].includes(table);
        const result = await db.query('select has_table_privilege($1, $2, $3) as allowed',
          ['service_role', `public.${table}`, permission]);
        assert.equal(result.rows[0].allowed, expected, `service_role ${permission} on ${table}`);
      }
    }
    for (const fn of functions) {
      const result = await db.query('select has_function_privilege($1, $2, $3) as allowed', ['service_role', `public.${fn}`, 'EXECUTE']);
      assert.equal(result.rows[0].allowed, true);
    }
    const visitor = randomUUID();
    await db.query('insert into auth.users values ($1)', [visitor]);
    await db.exec('set role service_role');
    assert.deepEqual((await db.query('select public.selection_rankings() as rankings')).rows[0].rankings, []);
    assert.equal((await db.query('select public.selection_sync_gate($1) as result', [visitor])).rows[0].result.status, 'ok');
    const items = [{ slot: 'her', provider: 'tmdb', provider_id: '1245',
      name: 'Test celebrity', category: 'woman', image: '', subtitle: 'Actor' }];
    const sync = async (revision, payload) => (await db.query(
      'select public.sync_visitor_selections($1,$2,$3,$4::jsonb) as result',
      [visitor, revision, randomUUID(), JSON.stringify(payload)])).rows[0].result;
    assert.equal((await sync(0, items)).revision, 1, 'RPC can write all four tables without caller write grants');
    const cached = await db.query(`select c.name from public.celebrity_sources s
      join public.celebrities c on c.id = s.celebrity_id
      where s.provider = 'tmdb' and s.provider_id = '1245'`);
    assert.equal(cached.rows[0].name, 'Test celebrity', 'server metadata cache join remains readable');
    assert.deepEqual((await db.query('select public.selection_rankings() as rankings')).rows[0].rankings, [], 'editing lists cannot vote');
    await db.query('select public.record_pdf_choices($1,$2::jsonb)', [visitor, JSON.stringify(items)]);
    assert.equal((await db.query('select public.selection_rankings() as rankings')).rows[0].rankings[0].votes, 1);
    for (const table of ['visitor_selections', 'visitor_sync_state', 'pdf_choice_history']) {
      await assert.rejects(db.query(`select * from public.${table}`), error => error.code === '42501');
    }
    for (const table of tables) {
      await assert.rejects(db.query(`delete from public.${table}`), error => error.code === '42501');
    }
    assert.equal((await sync(1, [])).revision, 2, 'RPC can remove selections and update state');
    assert.equal((await db.query('select public.selection_rankings() as rankings')).rows[0].rankings[0].votes, 1, 'clearing lists keeps PDF votes');
    await db.exec('reset role');
  } finally { await db.close(); }
});
