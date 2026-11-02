const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const { randomUUID } = require('node:crypto');
const { join } = require('node:path');
const db = new PGlite();
const a = randomUUID(), b = randomUUID();
const item = (slot = 'her', id = '1') => ({ slot, provider: 'tmdb', provider_id: id,
  name: `Celebrity ${id}`, category: 'other', image: '', subtitle: 'Actor' });
async function sync(visitor, revision, items, requestId = randomUUID()) {
  return (await db.query('select public.sync_visitor_selections($1,$2,$3,$4::jsonb) as result',
    [visitor, revision, requestId, JSON.stringify(items)])).rows[0].result;
}
async function rankings() { return (await db.query('select public.selection_rankings() as result')).rows[0].result; }
before(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key,
      is_anonymous boolean default true, created_at timestamptz default now(), last_sign_in_at timestamptz);`);
  await db.query('insert into auth.users(id) values ($1), ($2)', [a, b]);
  for (const file of readdirSync(join(__dirname, '../supabase/migrations')).sort()) {
    await db.exec(readFileSync(join(__dirname, '../supabase/migrations', file), 'utf8'));
  }
});
after(async () => { await db.close(); });
test('distinct visitor counts, retries, removals, clearing, stale writes and rollback', async () => {
  const requestId = randomUUID();
  assert.equal((await sync(a, 0, [item('her'), item('his')], requestId)).revision, 1);
  assert.equal((await rankings())[0].votes, 1);
  assert.equal((await sync(a, 0, [item('her'), item('his')], requestId)).revision, 1);
  assert.equal((await rankings())[0].votes, 1);
  assert.equal((await sync(a, 0, [], requestId)).status, 'conflict');
  assert.equal((await sync(a, 0, [])).status, 'conflict');
  await sync(b, 0, [item()]);
  assert.equal((await rankings())[0].votes, 2);
  await sync(a, 1, [item('his')]);
  assert.equal((await rankings())[0].votes, 2);
  await sync(a, 2, []);
  assert.equal((await rankings())[0].votes, 1);
  await assert.rejects(sync(b, 1, [item(), { ...item('his', '2'), category: 'invalid' }]));
  assert.equal((await rankings())[0].votes, 1, 'invalid replacement must roll back deletion');
  assert.equal((await db.query('select revision from public.visitor_sync_state where visitor_id=$1', [b])).rows[0].revision, 1);
  await assert.rejects(sync(b, 1, Array.from({ length: 6 }, (_, i) => item('her', String(i + 1)))));
  await assert.rejects(sync(b, 1, [item(), item()]));
  await sync(b, 1, []);
  assert.deepEqual(await rankings(), []);
});
test('reviewed provider aliases count against the same canonical celebrity', async () => {
  const c = randomUUID();
  await db.query('insert into auth.users(id) values ($1)', [c]);
  await sync(c, 0, [item('her', '7')]);
  await db.exec(`insert into public.celebrity_sources(provider,provider_id,celebrity_id)
    select 'audiodb','77',celebrity_id from public.celebrity_sources where provider='tmdb' and provider_id='7'`);
  await sync(c, 1, [item('her', '7'), { ...item('his', '77'), provider: 'audiodb' }]);
  assert.equal((await rankings())[0].votes, 1);
  await sync(c, 2, [{ ...item('his', '77'), provider: 'audiodb' }]);
  assert.equal((await rankings())[0].votes, 1);
  await sync(c, 3, []);
});
test('database rate gate persists and limits attempts', async () => {
  for (let n = 0; n < 30; n++) {
    const result = (await db.query('select public.selection_sync_gate($1) as result', [a])).rows[0].result;
    assert.equal(result.status, 'ok');
  }
  assert.equal((await db.query('select public.selection_sync_gate($1) as result', [a])).rows[0].result.status, 'rate_limited');
});
test('all four tables have RLS, browser roles cannot read/write tables or invoke RPCs', async () => {
  const tables = (await db.query(`select relrowsecurity from pg_class where oid in (
    'public.celebrities'::regclass, 'public.celebrity_sources'::regclass,
    'public.visitor_selections'::regclass, 'public.visitor_sync_state'::regclass)`)).rows;
  assert.equal(tables.length, 4); assert.ok(tables.every(row => row.relrowsecurity));
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    try {
      for (const table of ['celebrities', 'celebrity_sources', 'visitor_selections', 'visitor_sync_state']) {
        await assert.rejects(db.query(`select * from public.${table}`));
        await assert.rejects(db.query(`delete from public.${table}`));
      }
      await assert.rejects(db.query('select public.selection_rankings()'));
      await assert.rejects(db.query('select public.selection_sync_gate($1)', [a]));
      await assert.rejects(sync(a, 0, []));
    } finally { await db.exec('reset role'); }
  }
});

test('admin alias merge preserves distinct visitors, overlapping slots and future source-ID updates', async () => {
  const x = randomUUID(), y = randomUUID();
  await db.query('insert into auth.users(id) values ($1),($2)', [x, y]);
  const audio = { ...item('her', '9002'), provider: 'audiodb' };
  await sync(x, 0, [item('her', '9001'), audio, { ...audio, slot: 'his' }]);
  await sync(y, 0, [audio]);
  const ids = (await db.query(`select provider_id, celebrity_id from public.celebrity_sources
    where provider_id in ('9001','9002') order by provider_id`)).rows;
  const keep = ids[0].celebrity_id, duplicate = ids[1].celebrity_id;
  await assert.rejects(db.query('select public.merge_celebrity_alias($1,$2)', [keep, randomUUID()]));
  await assert.rejects(db.query('select public.merge_celebrity_alias($1,$1)', [keep]));
  await db.query('select public.merge_celebrity_alias($1,$2)', [keep, duplicate]);
  assert.equal((await db.query('select count(*)::int as n from public.celebrities where id=$1', [duplicate])).rows[0].n, 0);
  const result = (await rankings()).filter(r => r.canonical_id === keep);
  assert.equal(result.length, 1); assert.equal(result[0].votes, 2);
  assert.equal((await db.query('select count(*)::int as n from public.visitor_selections where visitor_id=$1', [x])).rows[0].n, 2);
  await sync(x, 1, [audio]);
  assert.equal((await rankings()).find(r => r.canonical_id === keep).votes, 2);
  await sync(y, 1, []);
  assert.equal((await rankings()).find(r => r.canonical_id === keep).votes, 1);
  await sync(x, 2, []);
  assert.ok(!(await rankings()).some(r => r.canonical_id === keep));
});

test('retention review excludes recent activity and registered users; deletion cascades only for its target', async () => {
  const old = randomUUID(), active = randomUUID(), registered = randomUUID();
  await db.query(`insert into auth.users(id, is_anonymous, created_at)
    values ($1,true,now()-interval '181 days'),($2,true,now()-interval '181 days'),
    ($3,false,now()-interval '181 days')`, [old, active, registered]);
  for (const id of [old, active, registered]) await sync(id, 0, [item('her', '9100')]);
  await db.query(`update public.visitor_sync_state set updated_at=now()-interval '181 days',
    rate_window=now()-interval '181 days' where visitor_id in ($1,$2)`, [old, registered]);
  const review = readFileSync(join(__dirname, '../supabase/retention_review.sql'), 'utf8');
  const counts = (await db.query(review)).rows[0];
  assert.equal(Number(counts.candidate_users), 1); assert.equal(Number(counts.affected_selections), 1);
  await db.query('delete from auth.users where id=$1', [old]);
  assert.equal((await db.query('select count(*)::int as n from public.visitor_sync_state where visitor_id=$1', [old])).rows[0].n, 0);
  assert.equal((await db.query('select count(*)::int as n from public.visitor_selections where visitor_id=$1', [old])).rows[0].n, 0);
  assert.equal((await rankings()).find(r => r.id === 'tmdb-9100').votes, 2);
  assert.equal((await db.query('select count(*)::int as n from auth.users where id=$1', [registered])).rows[0].n, 1);
});
