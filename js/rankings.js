// Personal lists remain local. Only provider IDs are sent to the ranking API.
const rankingSync = (() => {
  const SNAPSHOT = 'cheatListSelectionSnapshot';
  const SYNC = 'cheatListRankingSync';
  let client, started = false, starting = false, timer, retryDelay = 1000, conflictRevision = null;
  let sharedPeople = [], message = 'Shared rankings are unavailable.', failed = false;
  function read(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  }
  function snapshot() {
    return { her: herList.map(p => p.id), his: hisList.map(p => p.id) };
  }
  function status(value, error = false) {
    message = value; failed = error; updateRankings();
  }
  function changed() {
    localStorage.setItem(SNAPSHOT, JSON.stringify(snapshot()));
    conflictRevision = null;
    schedule(350);
  }
  function schedule(delay = 350) {
    if (!started || !client) return;
    clearTimeout(timer);
    timer = setTimeout(() => synchronize().catch(() => {
      status('Your lists are saved on this device. Shared rankings will retry when a connection is available.', true);
      schedule(retryDelay = Math.min(retryDelay * 2, 60000));
    }), delay);
  }
  async function refresh() {
    const response = await fetch('/api/rankings', { cache: 'no-store' });
    if (!response.ok) throw new Error('Rankings unavailable');
    const data = await response.json();
    sharedPeople = data.rankings;
    // Keep the existing add-to-list and search suggestion functions working.
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
    status('Complete the visitor check to include your selections in shared rankings.');
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
  async function synchronize() {
    // One network writer across tabs. Supabase's SDK separately locks session
    // refreshes. Never silently fall back to unlocked revision updates.
    await navigator.locks.request('cheatlist-ranking-writer', async () => {
      const { data: { session }, error } = await client.auth.getSession();
      if (error || !session) {
        status('Your lists are saved on this device. The visitor session is unavailable.', true);
        return; // Do not create a new identity on a transient session failure.
      }
      let state = read(SYNC);
      if (!state || state.visitor !== session.user.id)
        state = { visitor: session.user.id, revision: 0, confirmed: null, pending: null };
      const latest = read(SNAPSHOT) || snapshot();
      if (!state.pending && JSON.stringify(latest) === JSON.stringify(state.confirmed)) {
        await refresh(); status('Rankings reflect current visitor selections.'); return;
      }
      if (!state.pending) {
        state.pending = { ...latest, revision: state.revision, requestId: crypto.randomUUID() };
        localStorage.setItem(SYNC, JSON.stringify(state));
      }
      status('Updating shared rankings...');
      const response = await fetch('/api/selections', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(state.pending)
      });
      const result = await response.json();
      if (response.status === 409) {
        conflictRevision = result.revision;
        status('Another update reached shared rankings first. Your lists remain saved here. Retry to use your current lists.', true);
        return; // Never automatically rebase a rejected stale write.
      }
      if (response.status === 429) {
        status('Your lists are saved here. Shared rankings will update shortly.'); schedule(60000); return;
      }
      if (!response.ok) {
        if (response.status >= 500) throw new Error('Sync unavailable');
        if (response.status !== 401) {
          state.pending = null; localStorage.setItem(SYNC, JSON.stringify(state));
        }
        status('Your lists are saved here. Shared rankings could not validate this update. Please retry.', true); return;
      }
      state.revision = result.revision;
      state.confirmed = { her: state.pending.her, his: state.pending.his };
      state.pending = null;
      localStorage.setItem(SYNC, JSON.stringify(state));
      retryDelay = 1000;
      status('Rankings reflect current visitor selections.');
      await refresh();
      if (JSON.stringify(read(SNAPSHOT) || snapshot()) !== JSON.stringify(state.confirmed)) schedule();
    });
  }
  async function start() {
    if (starting) return;
    starting = true;
    try {
      const cfg = await refresh();
      if (!navigator.locks) { status('Shared rankings are available. Use an updated browser to include your selections.'); return; }
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.118.0');
      client = createClient(cfg.supabaseUrl, cfg.publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
      });
      // Serialize first sign-in too, preventing two tabs from creating identities.
      await navigator.locks.request('cheatlist-ranking-writer', async () => {
        const { data: { session }, error } = await client.auth.getSession();
        if (error) throw error;
        if (!session) {
          const token = cfg.turnstileSiteKey ? await captcha(cfg.turnstileSiteKey) : undefined;
          const { error: signInError } = await client.auth.signInAnonymously({ options: { captchaToken: token } });
          if (signInError) throw signInError;
        }
      });
      started = true;
      if (!read(SNAPSHOT)) localStorage.setItem(SNAPSHOT, JSON.stringify(snapshot()));
      schedule();
    } catch {
      status('Your lists are saved on this device. Shared rankings are currently unavailable.', true);
    } finally { starting = false; }
  }
  function retry() {
    if (!started) { start(); return; }
    navigator.locks.request('cheatlist-ranking-writer', () => {
      const state = read(SYNC);
      if (state && conflictRevision !== null) {
        state.revision = conflictRevision; state.pending = null;
        localStorage.setItem(SYNC, JSON.stringify(state)); conflictRevision = null;
      }
    }).then(() => schedule(0));
  }
  window.addEventListener('online', () => started ? schedule(0) : start());
  window.addEventListener('storage', event => {
    if (event.key === SNAPSHOT) { loadLists(); renderLists(); schedule(); }
  });
  setInterval(() => {
    if (started && !document.hidden) refresh().catch(() => {
      status('Shared rankings could not be refreshed. Your lists are saved on this device.', true);
    });
  }, 60000);
  return { start, changed, retry, get people() { return sharedPeople; },
    get message() { return message; }, get failed() { return failed; } };
})();
