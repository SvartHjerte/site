const { randomUUID } = require('node:crypto');
const { config, visitor, rpc, parseSync, validateItems, HttpError } = require('./rankings');

// Called only after Chromium has returned a complete PDF. Agreement names,
// signatures and client metadata never enter the ranking request.
async function recordPDFChoices(req, body, type) {
  if (!req.headers?.authorization) return 'not_requested';
  const cfg = config();
  if (req.headers.origin !== cfg.origin) throw new HttpError(403, 'Request origin is not allowed.');
  const ids = key => Array.isArray(body[key]) ? body[key].map(person => person?.id) : [];
  const payload = parseSync({ revision: 0, requestId: randomUUID(),
    her: type === 'his' ? [] : ids('herList'), his: type === 'her' ? [] : ids('hisList') });
  const id = await visitor(req, cfg);
  const gate = await rpc(cfg, 'selection_sync_gate', { p_visitor: id });
  if (gate.status === 'rate_limited') throw new HttpError(429, 'Please wait before generating again.');
  const items = await validateItems(payload.items, cfg);
  const result = await rpc(cfg, 'record_pdf_choices', { p_visitor: id, p_items: items });
  if (result.status !== 'ok') throw new Error('PDF choices were not acknowledged');
  return 'counted';
}
module.exports = { recordPDFChoices };
