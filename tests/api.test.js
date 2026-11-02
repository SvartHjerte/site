const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { parseSync, providerMetadata, config } = require('../lib/rankings');
const selections = require('../api/selections');
const rankings = require('../api/rankings');
const valid = () => ({ revision: 0, requestId: randomUUID(), her: ['tmdb-1245'], his: [] });
const response = () => ({ headers: {}, setHeader(k,v) { this.headers[k] = v; },
  status(s) { this.code = s; return this; }, json(b) { this.body = b; return this; }, end() { return this; } });
function configure() {
  process.env.RANKINGS_ENABLED = 'true'; process.env.SUPABASE_URL = 'https://zintkdgpbueciyyydzzp.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'server-secret';
  process.env.SITE_ORIGIN = 'https://thecheatlist.com'; process.env.TMDB_API_KEY = 'provider-test';
  process.env.TURNSTILE_SITE_KEY = 'site-key';
}

test('Supabase accepts the existing anon variable, preserves publishable precedence and rejects private keys', () => {
  configure(); const previousAnon = process.env.SUPABASE_ANON_KEY;
  const anon = `test.${Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url')}.test`;
  try {
    process.env.SUPABASE_ANON_KEY = anon;
    assert.equal(config().publicKey, 'sb_publishable_test');
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
    assert.equal(config().publicKey, anon);
    process.env.SUPABASE_PUBLISHABLE_KEY = '';
    assert.equal(config().publicKey, anon);
    for (const key of ['sb_secret_private', `test.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.test`]) {
      process.env.SUPABASE_ANON_KEY = key;
      assert.throws(config, error => error.status === 503);
    }
    delete process.env.SUPABASE_ANON_KEY;
    assert.throws(config, error => error.status === 503);
  } finally {
    if (previousAnon === undefined) delete process.env.SUPABASE_ANON_KEY;
    else process.env.SUPABASE_ANON_KEY = previousAnon;
    configure();
  }
});

test('CAPTCHA is optional in development, production stays protected, and unset enable flag disables both APIs', async () => {
  configure(); const oldNodeEnv = process.env.NODE_ENV; const original = global.fetch;
  try {
    delete process.env.TURNSTILE_SITE_KEY;
    process.env.NODE_ENV = 'development';
    assert.ok(config());
    global.fetch = async () => ({ ok: true, json: async () => [] });
    const res = response(); await rankings({ method: 'GET' }, res);
    assert.equal(res.code, 200); assert.equal(res.body.turnstileSiteKey, '');
    assert.deepEqual(Object.keys(res.body).sort(), ['publishableKey', 'rankings', 'supabaseUrl', 'turnstileSiteKey']);
    process.env.NODE_ENV = 'production'; assert.throws(config);
    process.env.NODE_ENV = 'development'; delete process.env.RANKINGS_ENABLED;
    global.fetch = async () => { assert.fail('Disabled APIs must not contact Supabase'); };
    for (const [handler, method] of [[rankings, 'GET'], [selections, 'POST']]) {
      const disabled = response(); await handler({ method }, disabled); assert.equal(disabled.code, 503);
    }
  } finally {
    global.fetch = original;
    if (oldNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldNodeEnv;
    configure();
  }
});

test('TMDB proxy restricts endpoints and never returns provider credentials or upstream error details', async () => {
  configure(); const original = global.fetch; const handler = require('../api/tmdb');
  try {
    global.fetch = async url => {
      const parsed = new URL(url);
      assert.equal(parsed.origin, 'https://api.themoviedb.org');
      assert.equal(parsed.pathname, '/3/search/person');
      assert.equal(parsed.searchParams.get('query'), 'Name & test');
      assert.equal(parsed.searchParams.get('api_key'), 'provider-test');
      return { ok: true, json: async () => ({ results: [{ id: 1, name: 'Name', secret: 'provider-test' }] }) };
    };
    const res = response(); await handler({ method: 'GET', query: { query: 'Name & test' } }, res);
    assert.equal(res.code, 200); assert.ok(!JSON.stringify(res.body).includes('provider-test'));
    global.fetch = async () => { throw new Error('provider-test'); };
    const invalid = response(); await handler({ method: 'GET', query: { id: '../secrets' } }, invalid);
    assert.equal(invalid.code, 400);
    const failed = response(); await handler({ method: 'GET', query: { id: '1' } }, failed);
    assert.equal(failed.code, 503); assert.ok(!JSON.stringify(failed.body).includes('provider-test'));
  } finally { global.fetch = original; }
});
test('payload accepts IDs only; rejects duplicates, invalid revisions, IDs and list sizes', () => {
  const body = valid(); body.visitorId = 'attacker'; body.metadata = { votes: 999999 };
  assert.deepEqual(parseSync(body).items, [{ slot: 'her', provider: 'tmdb', provider_id: '1245' }]);
  for (const patch of [{ revision: -1 }, { revision: Number.MAX_SAFE_INTEGER }, { revision: '1' },
    { requestId: 'bad' }, { her: ['tmdb-1', 'tmdb-1'] }, { her: ['tmdb-01'] },
    { her: ['https://evil.test'] }, { her: Array(6).fill('tmdb-1') }, { his: null }]) {
    assert.throws(() => parseSync({ ...valid(), ...patch }));
  }
});
test('provider metadata is fetched from fixed endpoints and unsafe images discarded', async () => {
  configure(); const original = global.fetch;
  try {
    global.fetch = async url => {
      assert.ok(url.startsWith('https://api.themoviedb.org/3/person/1245?'));
      return { ok: true, json: async () => ({ id: 1245, name: 'Trusted name', gender: 1, profile_path: null }) };
    };
    assert.equal((await providerMetadata('tmdb', '1245')).name, 'Trusted name');
    await assert.rejects(providerMetadata('unknown', '1'));
    global.fetch = async () => ({ ok: true, json: async () => ({ players: [{
      idPlayer: '7', strPlayer: 'Athlete', strThumb: 'https://attacker.test/track.png'
    }] }) });
    assert.equal((await providerMetadata('sportsdb', '7')).image, '');
    global.fetch = async () => ({ ok: false, status: 404 });
    await assert.rejects(providerMetadata('tmdb', '1245'), error => error.status === 422);
  } finally { global.fetch = original; }
});
test('server authenticates via Auth before any privileged calls and ignores caller identity', async () => {
  configure(); const original = global.fetch; const visitorId = randomUUID(); const calls = [];
  global.fetch = async (url, options) => {
    calls.push(url);
    if (url.endsWith('/auth/v1/user')) return { ok: true, json: async () => ({ id: visitorId, is_anonymous: true }) };
    if (url.endsWith('/selection_sync_gate')) return { ok: true, json: async () => ({ status: 'ok', revision: 0 }) };
    if (url.includes('/celebrity_sources?')) return { ok: true, json: async () => [{ celebrities: { name: 'Validated', category: 'other', image: '', subtitle: '' } }] };
    if (url.endsWith('/sync_visitor_selections')) {
      const body = JSON.parse(options.body);
      assert.equal(body.p_visitor, visitorId); assert.equal(body.p_items[0].name, 'Validated');
      return { ok: true, json: async () => ({ status: 'ok', revision: 1 }) };
    }
    throw new Error('Unexpected URL');
  };
  try {
    const req = { method: 'POST', headers: { origin: process.env.SITE_ORIGIN,
      'content-type': 'application/json', authorization: 'Bearer visitor-token' }, body: { ...valid(), visitorId: randomUUID() } };
    const res = response(); await selections(req, res); assert.equal(res.code, 200);
    assert.ok(calls[0].endsWith('/auth/v1/user'));
    const badOrigin = response(); await selections({ ...req, headers: { ...req.headers, origin: 'https://evil.test' } }, badOrigin);
    assert.equal(badOrigin.code, 403);
    const missingAuth = response(); await selections({ ...req, headers: { ...req.headers, authorization: '' } }, missingAuth);
    assert.equal(missingAuth.code, 401);
    global.fetch = async () => ({ ok: false, status: 401 });
    const expired = response(); await selections(req, expired); assert.equal(expired.code, 401);
    global.fetch = async () => ({ ok: true, json: async () => ({ id: visitorId, is_anonymous: false }) });
    const registered = response(); await selections(req, registered); assert.equal(registered.code, 403);
  } finally { global.fetch = original; }
});
test('public response never exposes service keys; disabled configuration fails closed', async () => {
  configure(); const original = global.fetch;
  try {
    global.fetch = async () => ({ ok: true, json: async () => [] });
    const res = response(); await rankings({ method: 'GET' }, res);
    assert.equal(res.code, 200); assert.ok(!JSON.stringify(res.body).includes('server-secret'));
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_secret_should-never-be-public'; assert.throws(config);
    process.env.RANKINGS_ENABLED = 'false';
    const disabled = response(); await rankings({ method: 'GET' }, disabled); assert.equal(disabled.code, 503);
  } finally { global.fetch = original; }
});

test('all outbound Supabase requests exclude injected agreement names, signatures and PDF contents', async () => {
  configure(); const original = global.fetch; const outbound = []; const id = randomUUID();
  try {
    global.fetch = async (url, options) => {
      outbound.push({ url, options });
      if (url.endsWith('/auth/v1/user')) return { ok: true, json: async () => ({ id, is_anonymous: true }) };
      if (url.includes('/celebrity_sources?')) return { ok: true, json: async () => [{ celebrities: {
        name: 'Provider celebrity', category: 'other', image: '', subtitle: '' } }] };
      return { ok: true, json: async () => ({ status: 'ok', revision: 1 }) };
    };
    const res = response();
    await selections({ method: 'POST', headers: { origin: process.env.SITE_ORIGIN,
      'content-type': 'application/json', authorization: 'Bearer visitor-token' }, body: {
      ...valid(), herName: 'PRIVATE_PERSON', hisName: 'PRIVATE_PARTNER', signature: 'PRIVATE_SIGNATURE',
      pdf: 'PRIVATE_PDF', metadata: { name: 'PRIVATE_PERSON' }, visitorId: 'PRIVATE_ID' } }, res);
    assert.equal(res.code, 200); assert.equal(outbound.length, 4);
    assert.ok(!JSON.stringify(outbound).includes('PRIVATE_'));
    const rpc = JSON.parse(outbound[3].options.body);
    assert.equal(rpc.p_visitor, id);
    assert.deepEqual(Object.keys(rpc.p_items[0]).sort(), ['category','image','name','provider','provider_id','slot','subtitle']);
  } finally { global.fetch = original; }
});
