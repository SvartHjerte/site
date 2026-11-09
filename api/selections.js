const { HttpError, config, rpc, visitor, parseSync, validateItems, fail } = require('../lib/rankings');
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).end(); }
  try {
    const cfg = config();
    if (req.headers.origin !== cfg.origin) throw new HttpError(403, 'Request origin is not allowed.');
    if (!(req.headers['content-type'] || '').startsWith('application/json')) throw new HttpError(415, 'JSON required.');
    const payload = parseSync(req.body);
    // Never accept a visitor ID from the request body or decode-only JWT claims.
    const id = await visitor(req, cfg);
    const gate = await rpc(cfg, 'selection_sync_gate', { p_visitor: id });
    if (gate.status === 'rate_limited') throw new HttpError(429, 'Please wait before synchronizing again.');
    const items = await validateItems(payload.items, cfg);
    const result = await rpc(cfg, 'sync_visitor_selections', {
      p_visitor: id, p_revision: payload.revision, p_request_id: payload.requestId, p_items: items
    });
    return res.status(result.status === 'conflict' ? 409 : 200).json(result);
  } catch (error) { return fail(res, error); }
};
