const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const { randomUUID } = require('node:crypto');
const { join } = require('node:path');
const db = new PGlite();
const item = (slot = 'her', id = '1') => ({ slot, provider: 'tmdb', provider_id: id,
  name: `Celebrity ${id}`, category: 'other', image: '', subtitle: 'Actor' });
async function user() { const id = randomUUID(); await db.query('insert into auth.users values ($1)', [id]); return id; }
async function sync(id, revision, items) {
  return (await db.query('select public.sync_visitor_selections($1,$2,$3,$4::jsonb) as r',
    [id, revision, randomUUID(), JSON.stringify(items)])).rows[0].r;
}
async function record(id, items) { return (await db.query('select public.record_pdf_choices($1,$2::jsonb) as r', [id, JSON.stringify(items)])).rows[0].r; }
async function rankings() { return (await db.query('select public.selection_rankings() as r')).rows[0].r; }
async function votes(id) { return (await rankings()).find(p => p.id === 'tmdb-' + id)?.votes || 0; }
before(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);`);
  for (const file of readdirSync(join(__dirname, '../supabase/migrations')).sort())
    await db.exec(readFileSync(join(__dirname, '../supabase/migrations', file), 'utf8'));
});
after(async () => { await db.close(); });
test('editing, replacing and clearing lists never contributes PDF votes', async () => {
  const id = await user();
  await sync(id, 0, [item()]); assert.equal(await votes('1'), 0);
  await sync(id, 1, [item('his', '2')]); assert.equal(await votes('2'), 0);
  await sync(id, 2, []); assert.deepEqual(await rankings(), []);
});
test('PDF choices accumulate once per visitor and survive edits, repeat PDFs and identity deletion', async () => {
  const a = await user(), b = await user();
  await record(a, [item(), item('his')]); assert.equal(await votes('1'), 1);
  await record(a, [item()]); assert.equal(await votes('1'), 1);
  await record(b, [item()]); assert.equal(await votes('1'), 2);
  await record(a, [item('her', '2')]); assert.equal(await votes('2'), 1);
  await sync(a, 0, []); assert.equal(await votes('1'), 2);
  await record(a, []); assert.equal(await votes('1'), 2);
  await db.query('delete from auth.users where id=$1', [a]);
  assert.equal(await votes('1'), 2); assert.equal(await votes('2'), 1);
  await assert.rejects(record(a, [item('her', '3')]));
});
test('invalid PDF data rolls back all metadata and votes; list limits remain enforced', async () => {
  const id = await user();
  await assert.rejects(record(id, [item('her', '3'), { ...item('his', '4'), category: 'invalid' }]));
  assert.equal(await votes('3'), 0);
  assert.equal((await db.query("select count(*)::int n from public.celebrity_sources where provider_id='3'")).rows[0].n, 0);
  await assert.rejects(record(id, Array.from({length:6}, (_,i) => item('her', String(i+10)))));
  await assert.rejects(record(id, [item(), item()]));
});
test('canonical aliases merge historical PDF votes without double-counting overlapping visitors', async () => {
  const a = await user(), b = await user();
  const audio = { ...item('his', '9002'), provider: 'audiodb' };
  await record(a, [item('her', '9001'), audio]); await record(b, [audio]);
  const ids = (await db.query("select celebrity_id from public.celebrity_sources where provider_id in ('9001','9002') order by provider_id")).rows;
  await db.query('select public.merge_celebrity_alias($1,$2)', [ids[0].celebrity_id,ids[1].celebrity_id]);
  assert.equal(await votes('9001'), 2);
  await record(a, [audio]); assert.equal(await votes('9001'), 2);
});
test('rate gate limits requests and browser roles cannot read history or invoke vote recording', async () => {
  const id = await user();
  for(let n=0;n<30;n++) assert.equal((await db.query('select public.selection_sync_gate($1) r',[id])).rows[0].r.status,'ok');
  assert.equal((await db.query('select public.selection_sync_gate($1) r',[id])).rows[0].r.status,'rate_limited');
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.pdf_choice_history'::regclass")).rows[0].relrowsecurity,true);
  for(const role of ['anon','authenticated']) {
    await db.exec(`set role ${role}`);
    try {
      await assert.rejects(db.query('select * from public.pdf_choice_history'));
      await assert.rejects(record(id,[item()]));
    } finally { await db.exec('reset role'); }
  }
});
test('upgrade does not reinterpret existing selections as PDFs and is repeatable', async () => {
  const other = new PGlite();
  try {
    await other.exec('create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key);');
    for(const file of ['202610310001_rankings.sql','202611020001_alias_maintenance.sql'])
      await other.exec(readFileSync(join(__dirname,'../supabase/migrations',file),'utf8'));
    const id=randomUUID(); await other.query('insert into auth.users values ($1)',[id]);
    await other.query('select public.sync_visitor_selections($1,0,$2,$3::jsonb)',[id,randomUUID(),JSON.stringify([item()])]);
    const migration=readFileSync(join(__dirname,'../supabase/migrations/202611100001_pdf_choice_history.sql'),'utf8');
    await other.exec(migration); await other.exec(migration);
    assert.deepEqual((await other.query('select public.selection_rankings() r')).rows[0].r,[]);
    assert.equal((await other.query('select count(*)::int n from public.visitor_selections')).rows[0].n,1);
  } finally { await other.close(); }
});
