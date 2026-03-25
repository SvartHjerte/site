const chromium = require("@sparticuz/chromium");
const puppeteer = require("puppeteer-core");

module.exports = async function (req, res) {
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless
  });

  const page = await browser.newPage();

  await page.setContent(`
    <html>
      <body style="font-family: serif; text-align:center; padding:80px;">
        <h1>The Cheat List Agreement</h1>
        <p>This is a test PDF generated on the server.</p>
      </body>
    </html>
  `);

  const pdf = await page.pdf({
    format: "Letter",
    printBackground: true
  });

  await browser.close();

  res.setHeader("Content-Type", "application/pdf");
  res.send(pdf);
};