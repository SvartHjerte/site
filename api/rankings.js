const { config, rpc, fail } = require('../lib/rankings');
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).end(); }
  try {
    const cfg = config();
    const rankings = await rpc(cfg, 'selection_rankings');
    return res.status(200).json({ rankings, supabaseUrl: cfg.url, publishableKey: cfg.publicKey,
      turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || '' });
  } catch (error) { return fail(res, error); }
};
