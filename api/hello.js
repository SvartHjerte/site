const chromium = require("@sparticuz/chromium");
const puppeteer = require("puppeteer-core");

module.exports = async function (req, res) {
  let browser;

  try {
    const executablePath = await chromium.executablePath();

    browser = await puppeteer.launch({
      args: [...chromium.args, "--no-sandbox"],
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: true
    });

    const page = await browser.newPage();

    await page.setContent(`
      <!doctype html>
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

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="test.pdf"');
    res.end(pdf);
  } catch (error) {
    console.error("PDF generation failed:", error);

    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        ok: false,
        message: "PDF generation failed",
        error: String(error && error.message ? error.message : error)
      })
    );
  } finally {
    if (browser) {
      await browser.close();
    }
  }
};