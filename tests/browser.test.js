const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const SNAPSHOT = 'cheatListSelectionSnapshot', SYNC = 'cheatListRankingSync';
function browser() {
  const saved = new Map(), timers = [], events = {}, posts = [];
  const client = { auth: { getSession: async () => ({ data: { session: { user: { id: 'visitor' }, access_token: 'token' } } }) } };
  const context = vm.createContext({
    console, crypto: { randomUUID }, setInterval() {},
    setTimeout(fn) { timers.push(fn); return timers.length; }, clearTimeout() {},
    localStorage: { getItem: key => saved.get(key) || null, setItem: (key, value) => saved.set(key, value) },
    navigator: { locks: { request: async (_name, _options, fn) => fn({}) } },
    document: { hidden: false }, window: { addEventListener: (name, fn) => { events[name] = fn; } },
    people: [], herList: [], hisList: [], updateRankings() {}, renderLists() {}, loadLists() {},
    fetch: async (url, options) => {
      if (url === '/api/rankings') return { ok: true, json: async () => ({ rankings: [] }) };
      posts.push(JSON.parse(options.body));
      return { ok: true, status: 200, json: async () => ({ revision: JSON.parse(options.body).revision + 1 }) };
    }
  });
  // Inject only the SDK creation seam; execute all production queue/retry code.
  const source = readFileSync(join(__dirname, '../js/rankings.js'), 'utf8').replace(
    "const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.118.0');",
    'const createClient = () => sdk;');
  context.sdk = client;
  vm.runInContext(readFileSync(join(__dirname, '../js/browser-lock.js'), 'utf8'), context);
  vm.runInContext(source, context);
  return { context, saved, timers, posts,
    run: code => vm.runInContext(code, context),
    flush: async () => { const fn = timers.shift(); if (fn) { await fn(); await new Promise(resolve => setImmediate(resolve)); } } };
}
test('first synchronization imports local lists, additions in both slots send once, clear sends empty lists', async () => {
  const b = browser(); b.context.herList = [{ id: 'tmdb-1' }]; b.context.hisList = [{ id: 'tmdb-1' }];
  await b.run('rankingSync.start()'); await b.flush();
  assert.deepEqual(b.posts[0].her, ['tmdb-1']); assert.deepEqual(b.posts[0].his, ['tmdb-1']);
  assert.equal(JSON.parse(b.saved.get(SYNC)).revision, 1);
  b.context.herList = []; b.context.hisList = [];
  b.run('rankingSync.changed()'); await b.flush();
  assert.deepEqual(b.posts[1].her, []); assert.deepEqual(b.posts[1].his, []);
});

test('a new anonymous session signs in without a CAPTCHA token when no site key is supplied', async () => {
  const b = browser(); let signedIn = false;
  const existingSession = b.context.sdk.auth.getSession;
  b.context.sdk.auth.getSession = async () => signedIn ? existingSession() : { data: { session: null } };
  b.context.sdk.auth.signInAnonymously = async args => {
    assert.equal(args.options.captchaToken, undefined);
    signedIn = true; return { error: null };
  };
  await b.run('rankingSync.start()'); await b.flush();
  assert.equal(signedIn, true); assert.equal(b.posts.length, 1);
});
test('a lost response retries the exact persisted request UUID and revision', async () => {
  const b = browser(); const normal = b.context.fetch; let failOnce = true;
  b.context.fetch = async (url, options) => {
    const result = await normal(url, options);
    if (url === '/api/selections' && failOnce) { failOnce = false; throw new Error('Lost response'); }
    return result;
  };
  await b.run('rankingSync.start()'); await b.flush();
  const pending = JSON.parse(b.saved.get(SYNC)).pending;
  assert.ok(pending);
  await b.flush();
  assert.deepEqual(b.posts[0], b.posts[1]); assert.equal(b.posts[1].requestId, pending.requestId);
  assert.equal(JSON.parse(b.saved.get(SYNC)).pending, null);
});
test('409 does not rebase automatically; explicit retry uses current lists and returned revision', async () => {
  const b = browser(); const normal = b.context.fetch; let conflict = true;
  b.context.fetch = async (url, options) => {
    if (url === '/api/selections' && conflict) {
      b.posts.push(JSON.parse(options.body));
      return { ok: false, status: 409, json: async () => ({ revision: 8, status: 'conflict' }) };
    }
    return normal(url, options);
  };
  await b.run('rankingSync.start()'); await b.flush();
  assert.equal(b.posts.length, 1); assert.equal(b.timers.length, 0);
  conflict = false;
  b.saved.set(SNAPSHOT, JSON.stringify({ her: ['tmdb-3'], his: [] }));
  b.run('rankingSync.retry()'); await new Promise(resolve => setImmediate(resolve)); await b.flush();
  assert.equal(b.posts[1].revision, 8); assert.deepEqual(b.posts[1].her, ['tmdb-3']);
  assert.notEqual(b.posts[1].requestId, b.posts[0].requestId);
});
test('edits during an in-flight sync are sent after its acknowledgment', async () => {
  const b = browser(); const normal = b.context.fetch; let first = true;
  b.context.fetch = async (url, options) => {
    if (url === '/api/selections' && first) {
      first = false;
      b.saved.set(SNAPSHOT, JSON.stringify({ her: ['tmdb-5'], his: [] }));
    }
    return normal(url, options);
  };
  await b.run('rankingSync.start()'); await b.flush(); await b.flush();
  assert.equal(b.posts.length, 2); assert.deepEqual(b.posts[1].her, ['tmdb-5']);
  assert.equal(b.posts[1].revision, 1);
});
test('a provider validation failure cannot permanently block later corrected lists', async () => {
  const b = browser(); const normal = b.context.fetch; let invalid = true;
  b.context.fetch = async (url, options) => url === '/api/selections' && invalid
    ? { ok: false, status: 422, json: async () => ({ error: 'No such person' }) }
    : normal(url, options);
  await b.run('rankingSync.start()'); await b.flush();
  assert.equal(JSON.parse(b.saved.get(SYNC)).pending, null);
  invalid = false; b.context.herList = [{ id: 'tmdb-1' }];
  b.run('rankingSync.changed()'); await b.flush();
  assert.deepEqual(b.posts[0].her, ['tmdb-1']);
});
test('unavailable rankings or unsupported browser leaves local lists intact without writes', async () => {
  const b = browser(); b.context.herList = [{ id: 'tmdb-1' }];
  b.context.fetch = async () => ({ ok: false, status: 503 });
  await b.run('rankingSync.start()');
  assert.equal(b.context.herList[0].id, 'tmdb-1'); assert.equal(b.posts.length, 0);
  assert.equal(b.run('rankingSync.people.length'), 0);
  const unsupported = browser(); unsupported.context.navigator = {};
  unsupported.context.herList = [{ id: 'tmdb-1' }];
  await unsupported.run('rankingSync.start()');
  assert.equal(unsupported.posts.length, 0); assert.equal(unsupported.context.herList[0].id, 'tmdb-1');
});

test('private agreement fields in local lists, snapshots and persisted retries never enter ranking requests', async () => {
  const b = browser();
  b.context.herList = [{ id: 'tmdb-1', name: 'PRIVATE_PERSON', signature: 'PRIVATE_SIGNATURE', pdf: 'PRIVATE_PDF' }];
  await b.run('rankingSync.start()'); await b.flush();
  const state = JSON.parse(b.saved.get(SYNC));
  state.pending = { her: ['tmdb-1'], his: [], revision: state.revision, requestId: randomUUID(),
    herName: 'PRIVATE_PERSON', signature: 'PRIVATE_SIGNATURE', pdf: 'PRIVATE_PDF' };
  b.saved.set(SYNC, JSON.stringify(state));
  b.saved.set(SNAPSHOT, JSON.stringify({ her: ['tmdb-1'], his: [], herName: 'PRIVATE_PERSON' }));
  b.run('rankingSync.retry()'); await new Promise(resolve => setImmediate(resolve)); await b.flush();
  assert.equal(b.posts.length, 2);
  for (const post of b.posts) {
    assert.deepEqual(Object.keys(post).sort(), ['her', 'his', 'requestId', 'revision']);
    assert.ok(!JSON.stringify(post).includes('PRIVATE_'));
  }
});
