// Server-only helpers. This directory is never imported by browser scripts.
const PROVIDERS = new Set(['tmdb', 'sportsdb', 'audiodb']);
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function config() {
  const url = process.env.SUPABASE_URL;
  const publicKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const origin = process.env.SITE_ORIGIN;
  if (process.env.RANKINGS_ENABLED !== 'true' || !url || !publicKey || !secret || !origin)
    throw new HttpError(503, 'Shared rankings are not configured yet.');
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url))
    throw new HttpError(503, 'Invalid Supabase configuration.');
  let publicRole;
  try { publicRole = JSON.parse(Buffer.from(publicKey.split('.')[1], 'base64url')).role; } catch { /* New publishable key format. */ }
  if (!publicKey.startsWith('sb_publishable_') && publicRole !== 'anon')
    throw new HttpError(503, 'A public Supabase key is required.');
  // CAPTCHA is optional in every environment. Anonymous Auth, exact-origin
  // checks and the database rate gate remain required for selection writes.
  return { url, publicKey, secret, origin };
}
async function remote(url, options = {}, missingStatus = 503) {
  let response;
  try { response = await fetch(url, { ...options, signal: AbortSignal.timeout(8000) }); }
  catch { throw new HttpError(503, 'A ranking service is temporarily unavailable.'); }
  if (!response.ok) {
    if (response.status === 429) throw new HttpError(429, 'Please wait before trying again.');
    if (response.status === 404 && missingStatus === 422) throw new HttpError(422, 'Celebrity could not be validated.');
    throw new HttpError(503, 'A ranking service is temporarily unavailable.');
  }
  return response.json();
}
async function rpc(cfg, name, payload = {}) {
  return remote(`${cfg.url}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: { apikey: cfg.secret, Authorization: `Bearer ${cfg.secret}`,
      'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
}
async function visitor(req, cfg) {
  const authorization = req.headers.authorization || '';
  if (!/^Bearer [A-Za-z0-9._-]+$/.test(authorization) || authorization.length > 8192)
    throw new HttpError(401, 'A visitor session is required.');
  let response;
  try {
    response = await fetch(`${cfg.url}/auth/v1/user`, {
      headers: { apikey: cfg.publicKey, Authorization: authorization }, signal: AbortSignal.timeout(8000)
    });
  } catch { throw new HttpError(503, 'Visitor authentication is temporarily unavailable.'); }
  if (response.status === 401 || response.status === 403) throw new HttpError(401, 'Visitor session expired.');
  if (!response.ok) throw new HttpError(503, 'Visitor authentication is temporarily unavailable.');
  const user = await response.json();
  if (!/^[0-9a-f-]{36}$/i.test(user.id || '') || user.is_anonymous !== true)
    throw new HttpError(403, 'An anonymous visitor session is required.');
  return user.id;
}
function parseSync(body) {
  if (typeof body === 'string') {
    if (Buffer.byteLength(body) > 8192) throw new HttpError(413, 'Request too large.');
    try { body = JSON.parse(body); } catch { throw new HttpError(400, 'Invalid JSON.'); }
  }
  if (!body || Buffer.byteLength(JSON.stringify(body)) > 8192) throw new HttpError(400, 'Invalid request.');
  if (!Number.isSafeInteger(body.revision) || body.revision < 0 || body.revision >= Number.MAX_SAFE_INTEGER ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId || ''))
    throw new HttpError(400, 'Invalid synchronization revision or request ID.');
  const items = [];
  for (const slot of ['her', 'his']) {
    if (!Array.isArray(body[slot]) || body[slot].length > 5) throw new HttpError(400, 'Each list allows at most five celebrities.');
    const seen = new Set();
    for (const id of body[slot]) {
      const match = typeof id === 'string' && /^(tmdb|sportsdb|audiodb)-([1-9][0-9]{0,11})$/.exec(id);
      if (!match || !PROVIDERS.has(match[1]) || seen.has(id)) throw new HttpError(400, 'Invalid or duplicate celebrity ID.');
      seen.add(id); items.push({ slot, provider: match[1], provider_id: match[2] });
    }
  }
  return { revision: body.revision, requestId: body.requestId, items };
}
function text(value, required = false) {
  const result = typeof value === 'string' ? value.trim() : '';
  if ((required && !result) || result.length > 200 || /[\u0000-\u001f\u007f]/.test(result))
    throw new HttpError(422, 'Provider returned invalid celebrity metadata.');
  return result;
}
function image(value, hosts) {
  if (!value) return '';
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password && !url.port &&
        hosts.includes(url.hostname) && value.length <= 2048) return url.href;
  } catch { /* Ignore untrusted images; never use them as server fetch targets. */ }
  return '';
}
async function providerMetadata(provider, id) {
  let data, person, name, subtitle, photo, category = 'other';
  if (provider === 'tmdb') {
    const key = process.env.TMDB_API_KEY;
    if (!key) throw new HttpError(503, 'TMDB validation is not configured.');
    data = await remote(`https://api.themoviedb.org/3/person/${id}?api_key=${encodeURIComponent(key)}`, {}, 422);
    if (String(data.id) !== id || data.adult === true) throw new HttpError(422, 'Celebrity could not be validated.');
    name = data.name; subtitle = data.known_for_department || 'Actor';
    category = data.gender === 1 ? 'woman' : data.gender === 2 ? 'man' : 'other';
    photo = image(data.profile_path ? `https://image.tmdb.org/t/p/w185${data.profile_path}` : '', ['image.tmdb.org']);
  } else if (provider === 'sportsdb') {
    const key = encodeURIComponent(process.env.SPORTSDB_API_KEY || '123');
    data = await remote(`https://www.thesportsdb.com/api/v1/json/${key}/lookupplayer.php?id=${id}`, {}, 422);
    person = data.players?.find(p => String(p.idPlayer) === id);
    if (!person) throw new HttpError(422, 'Athlete could not be validated.');
    name = person.strPlayer; subtitle = person.strSport || 'Sport';
    category = person.strGender === 'Female' ? 'woman' : person.strGender === 'Male' ? 'man' : 'other';
    photo = image(person.strThumb || person.strCutout, ['www.thesportsdb.com', 'r2.thesportsdb.com']);
  } else if (provider === 'audiodb') {
    const key = encodeURIComponent(process.env.MUSIC_API_KEY || '123');
    data = await remote(`https://www.theaudiodb.com/api/v1/json/${key}/artist.php?i=${id}`, {}, 422);
    person = data.artists?.find(p => String(p.idArtist) === id);
    if (!person) throw new HttpError(422, 'Artist could not be validated.');
    name = person.strArtist; subtitle = person.strGenre || 'Music';
    photo = image(person.strArtistThumb, ['www.theaudiodb.com', 'r2.theaudiodb.com']);
  } else throw new HttpError(400, 'Unknown celebrity provider.');
  return { provider, provider_id: id, name: text(name, true), subtitle: text(subtitle), category, image: photo };
}
async function validateItems(items, cfg) {
  const unique = new Map(items.map(item => [`${item.provider}-${item.provider_id}`, item]));
  const validated = new Map();
  await Promise.all([...unique].map(async ([id, item]) => {
    // Trusted database cache avoids repeatedly fetching metadata and makes exact
    // sync retries independent of provider outages or later metadata changes.
    const rows = await remote(`${cfg.url}/rest/v1/celebrity_sources?provider=eq.${item.provider}&provider_id=eq.${item.provider_id}&select=celebrities(name,category,image,subtitle)`, {
      headers: { apikey: cfg.secret, Authorization: `Bearer ${cfg.secret}` }
    });
    validated.set(id, rows[0]?.celebrities || await providerMetadata(item.provider, item.provider_id));
  }));
  return items.map(item => ({ ...validated.get(`${item.provider}-${item.provider_id}`), ...item }));
}
function fail(res, error) {
  const status = error instanceof HttpError ? error.status : 500;
  if (status === 429) res.setHeader('Retry-After', '60');
  return res.status(status).json({ error: error instanceof HttpError ? error.message : 'Ranking request failed.' });
}
module.exports = { HttpError, config, remote, rpc, visitor, parseSync, providerMetadata, validateItems, fail };
