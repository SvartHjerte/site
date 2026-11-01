const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Readable } = require('node:stream');
const vm = require('node:vm');

function endpoint() {
  const rendered = [], options = []; let closed = 0, launched = 0;
  const context = {
    Buffer, console: { error() {} }, module: { exports: {} },
    require(name) {
      if (name === '@sparticuz/chromium') return { executablePath: async () => '/test/chromium', args: [] };
      if (name === 'puppeteer-core') return { launch: async () => {
        launched++;
        return { newPage: async () => ({ setContent: async html => rendered.push(html),
          pdf: async config => { options.push(config); return Buffer.from('%PDF-test'); } }),
        close: async () => { closed++; } };
      } };
      throw new Error(`Unexpected module ${name}`);
    }
  };
  vm.runInNewContext(readFileSync(join(__dirname, '../api/agreement-pdf.js'), 'utf8'), context);
  return { handler: context.module.exports, rendered, options, get closed() { return closed; }, get launched() { return launched; } };
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
