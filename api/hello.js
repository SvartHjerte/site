const chromium = require("@sparticuz/chromium");
const puppeteer = require("puppeteer-core");

module.exports = async function (req, res) {
  let browser;

  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: true
    });

    const page = await browser.newPage();

    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>PDF Test</title>
        </head>
        <body style="font-family: Georgia, serif; text-align: center; padding: 80px;">
          <h1>The Cheat List Agreement</h1>
          <p>This is a test PDF generated on the server.</p>
        </body>
      </html>
    `);

    const pdf = await page.pdf({
      format: "Letter",
      printBackground: true
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline; filename=\"test.pdf\"");
    res.status(200).send(pdf);
  } catch (error) {
    console.error("PDF generation failed:", error);

    res.status(500).json({
      ok: false,
      error: String(error && error.message ? error.message : error)
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
};