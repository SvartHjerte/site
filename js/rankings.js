// Editing lists stays local. Only successfully generated PDFs contribute votes.
const rankingSync = (() => {
  let client, starting, message = 'Rankings count choices from generated PDFs.', failed = false;
  let sharedPeople = [];
  function status(value, error = false) {
    message = value; failed = error; updateRankings();
  }
  async function refresh() {
    const response = await fetch('/api/rankings', { cache: 'no-store' });
    if (!response.ok) throw new Error('Rankings unavailable');
    const data = await response.json();
    sharedPeople = data.rankings;
    for (const person of sharedPeople) {
      const index = people.findIndex(p => p.id === person.id);
      if (index < 0) people.push(person); else people[index] = person;
    }
    updateRankings();
    return data;
  }
  async function captcha(siteKey) {
    const container = document.getElementById('rankingCaptcha');
    container.hidden = false;
    if (!window.turnstile) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.onload = resolve; script.onerror = reject; document.head.appendChild(script);
      });
    }
    return new Promise((resolve, reject) => {
      const widget = window.turnstile.render(container, {
        sitekey: siteKey,
        callback: token => { window.turnstile.remove(widget); container.hidden = true; resolve(token); },
        'error-callback': () => { window.turnstile.remove(widget); reject(new Error('Visitor check failed')); },
        'expired-callback': () => { window.turnstile.remove(widget); reject(new Error('Visitor check expired')); }
      });
    });
  }
  async function start() {
    if (starting) return starting;
    starting = (async () => {
      try { await refresh(); status('Rankings count choices from generated PDFs. Each visitor counts once per celebrity.'); }
      catch { status('Shared rankings are unavailable. Your lists remain saved on this device.', true); }
    })();
    try { await starting; } finally { starting = null; }
  }
  async function preparePDF() {
    try {
      const cfg = await refresh();
      if (!browserLock.supported) throw new Error('Browser storage unavailable');
      if (!client) {
        const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.118.0');
        client = createClient(cfg.supabaseUrl, cfg.publishableKey, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, lock: browserLock.request }
        });
      }
      return await browserLock.request('cheatlist-ranking-writer', -1, async () => {
        const { data: { session }, error } = await client.auth.getSession();
        if (error) throw error;
        if (session) return `Bearer ${session.access_token}`;
        const token = cfg.turnstileSiteKey ? await captcha(cfg.turnstileSiteKey) : undefined;
        const result = await client.auth.signInAnonymously({ options: { captchaToken: token } });
        if (result.error || !result.data?.session) throw result.error || new Error('Visitor session unavailable');
        return `Bearer ${result.data.session.access_token}`;
      });
    } catch {
      status('Your PDF can still be generated, but shared rankings are currently unavailable.', true);
      return null;
    }
  }
  function pdfCompleted(counted) {
    if (!counted) {
      status('Your PDF was generated, but its choices could not be counted. Generate it again to retry; duplicates are not counted.', true);
      return;
    }
    status('Your PDF choices have been counted. Each visitor counts once per celebrity.');
    refresh().catch(() => status('Your PDF choices were counted. Rankings could not be refreshed yet.', true));
  }
  function changed() {
    status('Generate a PDF to count these choices. Previous PDF choices stay in the running totals.');
  }
  window.addEventListener('online', start);
  window.addEventListener('storage', event => {
    if (event.key === 'cheatListHerList' || event.key === 'cheatListHisList') { loadLists(); renderLists(); }
  });
  setInterval(() => { if (!document.hidden) refresh().catch(() => {}); }, 60000);
  return { start, changed, retry: start, preparePDF, pdfCompleted,
    get people() { return sharedPeople; }, get message() { return message; }, get failed() { return failed; } };
})();
