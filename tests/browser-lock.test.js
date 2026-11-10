const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const http = require('node:http');
const puppeteer = require('puppeteer-core');

const executablePath = [process.env.TEST_BROWSER_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium', '/usr/bin/google-chrome'].find(p => p && existsSync(p));

test('real IndexedDB fallback serializes tabs, nested Auth locks, failures, timeouts and tab closure',
  { skip: !executablePath && 'Set TEST_BROWSER_PATH to run real-browser tests', timeout: 30000 }, async () => {
    const source = readFileSync(join(__dirname, '../js/browser-lock.js'), 'utf8');
    const server = http.createServer((_req, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.end('<script>Object.defineProperty(navigator,"locks",{value:undefined});</script><script>' + source + '</script>');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let browser;
    try {
      browser = await puppeteer.launch({ executablePath, headless: true, timeout: 10000 });

      const url = `http://127.0.0.1:${server.address().port}`;
      const a = await browser.newPage(), b = await browser.newPage();
      await Promise.all([a.goto(url), b.goto(url)]);

      const run = page => page.evaluate(() => browserLock.request('writer', -1, async () => {
        const count = Number(localStorage.getItem('count') || 0);
        await browserLock.request('auth', -1, () => new Promise(resolve => setTimeout(resolve, 40)));
        localStorage.setItem('count', String(count + 1));
      }));
      await Promise.all([run(a), run(b), run(a), run(b)]);

      assert.equal(await a.evaluate(() => localStorage.getItem('count')), '4');
      assert.equal(await b.evaluate(async () => {
        try { await browserLock.request('writer', -1, () => { throw new Error('expected'); }); }
        catch (error) { return error.message; }
      }), 'expected');
      await a.evaluate(() => {
        window.held = browserLock.request('writer', -1, async () => {
          window.entered = true;
          await new Promise(resolve => { window.release = resolve; });
        });
      });

      await a.waitForFunction('window.entered === true', { polling: 100, timeout: 5000 });
      assert.equal(await b.evaluate(async () => {
        try { await browserLock.request('writer', 20, () => 'unexpected'); }
        catch (error) { return error.message; }
      }), 'Cross-tab lock timed out');
      await a.evaluate(() => { window.release(); return window.held; });
      assert.equal(await b.evaluate(() => browserLock.request('writer', -1, () => 'recovered')), 'recovered');
      await a.evaluate(() => {
        window.entered = false;
        browserLock.request('writer', -1, async () => {
          window.entered = true; await new Promise(() => {});
        });
      });
      await a.waitForFunction('window.entered === true', { polling: 100, timeout: 5000 });
      const waiting = b.evaluate(() => browserLock.request('writer', 5000, () => 'after-close'));

      await a.close();
      assert.equal(await waiting, 'after-close');
      assert.equal(await b.evaluate(async () => {
        try { await browserLock.request('writer', 0, () => { throw new Error('must not run'); }); }
        catch (error) { return error.isAcquireTimeout; }
      }), true);

      // Exercise actual ranking startup and its injected SDK lock across tabs.
      // No network Auth: this fake persists a session with intentionally slow sign-in.
      const c = await browser.newPage(); await c.goto(url);
      const rankings = readFileSync(join(__dirname, '../js/rankings.js'), 'utf8').replace(
        "const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.118.0');",
        'const createClient = fakeCreateClient;');
      const fixture = `
        var people = [], herList = [{ id: 'tmdb-1', name: 'PRIVATE_PERSON' }], hisList = [];
        function updateRankings() {} function loadLists() {} function renderLists() {}
        function fakeCreateClient(_url, _key, options) {
          return { auth: {
            getSession: () => options.auth.lock('test-sdk-auth', -1, async () => ({ data: {
              session: JSON.parse(localStorage.getItem('test-session') || 'null') } })),
            signInAnonymously: () => options.auth.lock('test-sdk-auth', -1, async () => {
              await new Promise(resolve => setTimeout(resolve, 50));
              localStorage.setItem('sign-ins', String(Number(localStorage.getItem('sign-ins') || 0) + 1));
              localStorage.setItem('test-session', JSON.stringify({ user: { id: 'same-visitor' }, access_token: 'test-token' }));
              return { data: { session: JSON.parse(localStorage.getItem('test-session')) } };
            })
          } };
        }
        window.fetch = async (url, options) => {
          if (url === '/api/rankings') return { ok: true, json: async () => ({ rankings: [] }) };
          const body = JSON.parse(options.body);
          localStorage.setItem('posts', String(Number(localStorage.getItem('posts') || 0) + 1));
          if (JSON.stringify(body).includes('PRIVATE_')) throw new Error('Privacy leak');
          return { ok: true, status: 200, json: async () => ({ revision: body.revision + 1 }) };
        };
      `;
      await Promise.all([b.addScriptTag({ content: fixture + rankings }), c.addScriptTag({ content: fixture + rankings })]);
      await Promise.all([b.evaluate(() => rankingSync.start()), c.evaluate(() => rankingSync.start())]);
      assert.equal(await b.evaluate(() => localStorage.getItem('sign-ins')), null);
      const sessions = await Promise.all([b.evaluate(() => rankingSync.preparePDF()), c.evaluate(() => rankingSync.preparePDF())]);
      assert.deepEqual(sessions, ['Bearer test-token', 'Bearer test-token']);
      assert.equal(await b.evaluate(() => localStorage.getItem('sign-ins')), '1');
      assert.equal(await b.evaluate(() => localStorage.getItem('posts')), null);

    } finally {
      if (browser) await browser.close();
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  });
