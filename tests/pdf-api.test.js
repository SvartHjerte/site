const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Readable } = require('node:stream');
const vm = require('node:vm');

function endpoint() {
  const rendered = [], options = []; let closed = 0, launched = 0; let pdfFailure = false, counted = 0, extractions = 0, busy = false;
  const context = {
    Buffer, setTimeout, console: { error() {} }, module: { exports: {} },
    fetch() { assert.fail('PDF generation must not send agreement data to Supabase or any other service'); },
    require(name) {
      if (name === '../lib/pdf-rankings') return { recordPDFChoices: async () => { counted++; return 'counted'; } };
      if (name === '../lib/agreement-design') return require('../lib/agreement-design');
      if (name === '@sparticuz/chromium') return { executablePath: async () => { extractions++; await Promise.resolve(); return '/test/chromium'; }, args: [] };
      if (name === 'puppeteer-core') return { launch: async () => {
        launched++;
        if (busy) { busy = false; throw new Error("spawn ETXTBSY"); }
        return { newPage: async () => ({ setContent: async html => rendered.push(html),
          emulateMediaType: async type => assert.equal(type, 'print'), evaluate: async () => {},
          pdf: async config => { options.push(config); if (pdfFailure) throw new Error('Chromium failed'); return Buffer.from('%PDF-test'); } }),
        close: async () => { closed++; } };
      } };
      throw new Error(`Unexpected module ${name}`);
    }
  };
  vm.runInNewContext(readFileSync(join(__dirname, '../api/agreement-pdf.js'), 'utf8'), context);
  return { handler: context.module.exports, rendered, options, get closed() { return closed; }, get launched() { return launched; }, get counted() { return counted; }, failPDF() { pdfFailure = true; }, busyOnce() { busy = true; }, get extractions() { return extractions; } };
}
function response() {
  return { headers: {}, setHeader(name, value) { this.headers[name] = value; }, end(body) { this.body = body; } };
}
const payload = type => ({ type, herName: 'Alice <script>', hisName: 'Bob',
  herList: [{ name: 'Her celebrity', subtitle: 'Actor' }], hisList: [{ name: 'His celebrity', sport: 'Sport' }] });

test('Vercel parsed objects and serialized bodies render all agreement types without reading the stream', async () => {
  const e = endpoint();
  for (const type of ['her', 'his', 'couples']) {
    for (const body of [payload(type), JSON.stringify(payload(type)), Buffer.from(JSON.stringify(payload(type)))]) {
      const res = response();
      await e.handler({ method: 'POST', body, on() { assert.fail('Parsed body must not read the stream'); } }, res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.headers['Content-Type'], 'application/pdf');
      assert.equal(res.headers['Content-Disposition'], `inline; filename="${type}-agreement.pdf"`);
      assert.equal(res.body.toString(), '%PDF-test');
      const html = e.rendered.at(-1);
      assert.ok(html.includes('Alice &lt;script&gt;')); assert.ok(!html.includes('Alice <script>'));
      if (type !== 'his') assert.ok(html.includes('Her celebrity'));
      if (type !== 'her') assert.ok(html.includes('His celebrity'));
      assert.equal(e.options.at(-1).landscape, true);
    }
  }
  assert.equal(e.closed, 9);
});

test('local raw JSON streams and empty GET requests retain PDF support', async () => {
  const e = endpoint(); const req = Readable.from([JSON.stringify(payload('couples')).slice(0, 20), JSON.stringify(payload('couples')).slice(20)]);
  req.method = 'POST';
  const res = response(); await e.handler(req, res);
  assert.equal(res.statusCode, 200); assert.ok(e.rendered[0].includes('Couples Agreement'));
  const empty = response(); await e.handler({ method: 'GET', query: { type: 'his' } }, empty);
  assert.equal(empty.statusCode, 200); assert.ok(e.rendered[1].includes('No celebrities selected yet.'));
  assert.equal(e.closed, 2);
});

test('malformed JSON and non-object bodies fail before launching Chromium', async () => {
  const e = endpoint();
  for (const body of ['{bad', 'null', '[]', '42', null, []]) {
    const res = response(); await e.handler({ method: 'POST', body }, res);
    assert.equal(res.statusCode, 500); assert.equal(JSON.parse(res.body).ok, false);
  }
  const req = Readable.from(['{bad']); req.method = 'POST';
  const res = response(); await e.handler(req, res); assert.equal(res.statusCode, 500);
  assert.equal(e.launched, 0);
});

test('agreement designs embed the original logo, escape every field and keep distinct branded layouts', () => {
  const { buildAgreement } = require('../lib/agreement-design');
  const original = readFileSync(join(__dirname, '../images/logo.png')).toString('base64');
  const body = { herName: '<img src="https://evil.test">', hisName: 'Bob & Co',
    herList: [{ name: '<script>bad()</script>', subtitle: '<iframe src="https://evil.test">' }],
    hisList: [{ name: 'Other celebrity', sport: 'Sport' }] };
  for (const [type, edition] of [['her', 'The Golden Marquee'], ['his', 'The High Roller'], ['couples', 'The Double Headliner']]) {
    const html = buildAgreement(body, type);
    assert.ok(html.includes(`src="data:image/png;base64,${original}"`));
    assert.ok(html.includes(edition));
    assert.ok(html.includes('&lt;img')); assert.ok(html.includes('Bob &amp; Co'));
    assert.ok(!html.includes('<script>')); assert.ok(!html.includes('<iframe'));
    assert.ok(!/(?:src|href)="https?:/.test(html), 'assets must be self-contained');
    if (type !== 'his') assert.ok(html.includes('&lt;script&gt;bad()&lt;/script&gt;'));
    assert.equal((html.match(/class="selection-panel"/g) || []).length, type === 'couples' ? 2 : 1);
  }
  const compact = buildAgreement({ ...body, herName: 'A'.repeat(60) }, 'couples');
  assert.ok(compact.includes('class="couples compact"'));
});

test('invalid agreement types cannot enter HTML or download headers', async () => {
  const e = endpoint(), res = response();
  await e.handler({ method: 'POST', body: { type: '<script>bad()</script>' } }, res);
  assert.equal(res.statusCode, 500); assert.equal(e.launched, 0);
  assert.equal(res.headers['Content-Disposition'], undefined);
});


test('only successfully rendered PDFs call the vote recorder', async () => {
  const e = endpoint(); e.failPDF(); const failed = response();
  await e.handler({ method: 'POST', body: payload('couples') }, failed);
  assert.equal(failed.statusCode, 500); assert.equal(e.counted, 0);
  const ok = endpoint(), res = response();
  await ok.handler({ method: 'POST', body: payload('her') }, res);
  assert.equal(res.statusCode, 200); assert.equal(ok.counted, 1);
  assert.equal(res.headers['X-Ranking-Status'], 'counted');
});


test('concurrent PDF requests share Chromium extraction and transient busy launches retry', async () => {
 const e = endpoint(); const responses = [response(), response()];
 await Promise.all(responses.map(res => e.handler({method:'POST',body:payload('couples')},res)));
 assert.equal(e.extractions, 1); assert.ok(responses.every(res => res.statusCode === 200));
 const busy = endpoint(); busy.busyOnce(); const res = response();
 await busy.handler({method:'POST',body:payload('her')},res);
 assert.equal(res.statusCode,200);assert.equal(busy.launched,2);assert.equal(busy.counted,1);
});
