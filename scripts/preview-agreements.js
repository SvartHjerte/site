// Local-only: node scripts/preview-agreements.js <Chrome executable path>
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const puppeteer = require('puppeteer-core');
const { buildAgreement, fitAgreement } = require('../lib/agreement-design');
async function main() {
  const executablePath = process.argv[2];
  if (!executablePath) throw new Error('Pass the path to a local Chrome executable.');
  const output = join(__dirname, '../artifacts/pdf-samples');
  mkdirSync(output, { recursive: true });
  const browser = await puppeteer.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1056, height: 816, deviceScaleFactor: 1 });
    for (const stress of [false, true]) {
      for (const type of ['her', 'his', 'couples']) {
        const names = ['Scarlett Johansson', 'Margot Robbie', 'Zendaya', 'Ana de Armas', 'Sydney Sweeney'];
        const others = ['Chris Hemsworth', 'Ryan Reynolds', 'Henry Cavill', 'Chris Evans', 'Michael B. Jordan'];
        const body = { herName: stress ? 'Alexandra Catherine Montgomery-Wellington' : 'Alexandra',
          hisName: stress ? 'Christopher Alexander Montgomery-Wellington' : 'Christopher',
          herList: names.map(name => ({ name: stress ? name + ' — A very long celebrity display name' : name, subtitle: 'Actor / Screen & stage' })),
          hisList: others.map(name => ({ name, subtitle: 'Actor / Screen & stage' })) };
        await page.setContent(buildAgreement(body, type), { waitUntil: 'load' });
        await page.emulateMediaType('print');
        await page.evaluate(fitAgreement);
        const fit = await page.evaluate(() => {
          const article = document.querySelector('.agreement').getBoundingClientRect();
          return { bottom: article.bottom, width: document.documentElement.scrollWidth,
            logo: document.querySelector('.logo').naturalWidth > 0,
            contentBottom: document.querySelector('.agreement-content').getBoundingClientRect().bottom };
        });
        if (fit.bottom > 789 || fit.width > 1056 || fit.contentBottom > 765 || !fit.logo) throw new Error(`${type} ${stress ? 'long' : 'normal'} layout failed: ${JSON.stringify(fit)}`);
        const file = `${type}${stress ? '-long-names' : ''}`;
        const pdf = await page.pdf({ path: join(output, `${file}.pdf`), format: 'Letter', landscape: true, printBackground: true });
        const pages = Buffer.from(pdf).toString('latin1').match(/\/Type\s*\/Page\b/g) || [];
        if (pages.length !== 1) throw new Error(`${file}: expected one PDF page, got ${pages.length}`);
        await page.screenshot({ path: join(output, `${file}.png`), fullPage: true });
        writeFileSync(join(output, `${file}.html`), buildAgreement(body, type));
        console.log(`${file}: page fits, logo loaded (${Math.round(fit.bottom)}px / 816px)`);
      }
    }
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
