const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
test('existing list controls, five-person limit and agreement preview survive ranking integration', () => {
  const saved = new Map(), alerts = [], nodes = new Map(); let changes = 0;
  for (const id of ['herList', 'hisList', 'rankings', 'herName', 'hisName', 'agreementPreview', 'agreementContent']) {
    nodes.set(id, { innerHTML: '', value: '', classList: { remove() {}, add() {} }, scrollIntoView() {} });
  }
  const context = vm.createContext({ console, alert: text => alerts.push(text),
    localStorage: { getItem: key => saved.get(key) || null, setItem: (key, value) => saved.set(key, value) },
    document: { getElementById: id => nodes.get(id), addEventListener() {},
      createElement: () => ({ textContent: '', get innerHTML() {
        return this.textContent.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
      } }) },
    rankingSync: { changed: () => changes++, people: [], message: 'Shared rankings unavailable', failed: false }
  });
  for (const file of ['config', 'helpers', 'storage', 'render', 'pdf', 'main']) {
    vm.runInContext(readFileSync(join(__dirname, `../js/${file}.js`), 'utf8'), context);
  }
  const run = code => vm.runInContext(code, context);
  run(`loadVotes(); loadLists();
    lastSearchResults = Array.from({length: 6}, (_, i) => ({
      id: 'tmdb-' + (i+1), source: 'tmdb', name: 'Person ' + (i+1), image: '', subtitle: 'Actor'
    }));
    addToCheatList('tmdb-1', 'her'); addToCheatList('tmdb-1', 'her');
    addToCheatList('tmdb-1', 'his');
    for (let i=2; i<=6; i++) addToCheatList('tmdb-'+i, 'her');`);
  assert.equal(JSON.parse(saved.get('cheatListHerList')).length, 5);
  assert.equal(JSON.parse(saved.get('cheatListHisList')).length, 1);
  assert.equal(alerts.length, 2, 'duplicate and sixth celebrity are rejected');
  nodes.get('herName').value = 'Alice <script>';
  run("showAgreementPreview('her')");
  const certificate = nodes.get('agreementContent').innerHTML;
  assert.ok(certificate.includes('Person 1')); assert.ok(certificate.includes('Person 5'));
  assert.ok(certificate.includes('Alice &lt;script&gt;')); assert.ok(!certificate.includes('Alice <script>'));
  run("removeFromHerList('Person 1')");
  assert.equal(JSON.parse(saved.get('cheatListHerList')).length, 4);
  assert.equal(JSON.parse(saved.get('cheatListHisList')).length, 1);
  run('clearLists()');
  assert.deepEqual(JSON.parse(saved.get('cheatListHerList')), []);
  assert.deepEqual(JSON.parse(saved.get('cheatListHisList')), []);
  assert.equal(changes, 8, 'each accepted mutation schedules shared sync');
  assert.ok(!nodes.get('rankings').innerHTML.includes('128 votes'), 'legacy totals are never shown');
});
