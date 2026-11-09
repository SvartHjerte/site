// Cross-tab exclusion for both the selection writer and Supabase Auth.
// IndexedDB readwrite transactions serialize across tabs and release on crash.
// Unlike a timed localStorage lease, a suspended tab cannot outlive its lock.
const browserLock = (() => {
  function timeoutError() {
    const error = new Error('Cross-tab lock timed out');
    error.isAcquireTimeout = true; // Supabase Auth recognizes this contract.
    return error;
  }
  async function request(name, acquireTimeout, callback) {
    if (navigator.locks) {
      const controller = acquireTimeout > 0 ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), acquireTimeout) : null;
      try {
        return await navigator.locks.request(name, acquireTimeout === 0
          ? { ifAvailable: true } : controller ? { signal: controller.signal } : {}, lock => {
          if (!lock) throw timeoutError();
          return callback();
        });
      } catch (error) {
        if (controller?.signal.aborted) throw timeoutError();
        throw error;
      } finally { clearTimeout(timer); }
    }
    if (!globalThis.indexedDB) throw new Error('Cross-tab storage is unavailable');
    // IndexedDB has no atomic try-lock. Skip SDK opportunistic background work;
    // foreground getSession/token refresh still acquires a blocking lock.
    if (acquireTimeout === 0) throw timeoutError();
    // Separate databases allow the writer to call Auth (a different lock name).
    const db = await new Promise((resolve, reject) => {
      const open = indexedDB.open(`cheatlist-lock:${name}`, 1);
      open.onupgradeneeded = () => open.result.createObjectStore('mutex');
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
      open.onblocked = () => reject(new Error('Cross-tab storage is blocked'));
    });
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('mutex', 'readwrite');
        const store = tx.objectStore('mutex');
        let entered = false, finished = false, value, failure;
        const timeout = acquireTimeout >= 0 ? setTimeout(() => {
          if (!entered) { failure = timeoutError(); tx.abort(); }
        }, acquireTimeout) : null;
        tx.oncomplete = () => { clearTimeout(timeout); resolve(value); };
        tx.onabort = tx.onerror = () => {
          clearTimeout(timeout); reject(failure || tx.error || new Error('Cross-tab lock interrupted'));
        };
        function pump() {
          // Keep a request queued until async work finishes, preventing auto-commit.
          const read = store.get('lock');
          read.onsuccess = () => {
            if (!entered) {
              entered = true; clearTimeout(timeout);
              Promise.resolve().then(callback).then(result => {
                value = result; finished = true;
              }, error => { failure = error; finished = true; tx.abort(); });
            }
            if (!finished) pump();
          };
        }
        pump();
      });
    } finally { db.close(); }
  }
  return { request, get supported() { return !!(navigator.locks || globalThis.indexedDB); } };
})();
