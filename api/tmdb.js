// Keep provider credentials on the server, independently of rankings activation.
const { HttpError, remote, fail } = require('../lib/rankings');
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).end(); }
  try {
    const { id, query } = req.query || {};
    let path;
    if (typeof id === 'string' && /^[1-9][0-9]{0,11}$/.test(id) && query === undefined)
      path = `person/${id}?`;
    else if (id === undefined && typeof query === 'string' && query.trim() && query.length <= 200)
      path = `search/person?query=${encodeURIComponent(query)}&`;
    else throw new HttpError(400, 'A valid person ID or search query is required.');
    if (!process.env.TMDB_API_KEY) throw new HttpError(503, 'Celebrity search is not configured.');
    const data = await remote(`https://api.themoviedb.org/3/${path}api_key=${encodeURIComponent(process.env.TMDB_API_KEY)}`);
    const person = p => ({ id: p.id, name: p.name, profile_path: p.profile_path,
      known_for_department: p.known_for_department });
    return res.status(200).json(id ? person(data) : { results: (data.results || []).slice(0, 12).map(person) });
  } catch (error) { return fail(res, error); }
};
