const chromium = require("@sparticuz/chromium");
const puppeteer = require("puppeteer-core");

const { buildAgreement, fitAgreement } = require('../lib/agreement-design');
const { recordPDFChoices } = require('../lib/pdf-rankings');

function parseRequestBody(body) {
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body === 'string') {
    try { body = body.trim() ? JSON.parse(body) : {}; }
    catch { throw new Error('Invalid JSON body'); }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new Error('JSON body must be an object');
  return body;
}

async function readRequestBody(req) {
  // Vercel parses JSON before invoking the handler; its stream is consumed.
  if (req.body !== undefined) return parseRequestBody(req.body);
  // Plain local Node servers still provide an unread request stream.
  if (req.readableEnded) return {};
  return new Promise((resolve, reject) => {
    let data = "";

    req.on("data", (chunk) => {
      data += chunk;
    });

    req.on("end", () => {
      if (!data) {
        resolve({});
        return;
      }

      try {
        resolve(parseRequestBody(data));
      } catch (error) {
        reject(new Error("Invalid JSON body"));
      }
    });

    req.on("error", reject);
  });
}

module.exports = async function (req, res) {
  let browser;

  try {
    let body = {};

    if (req.method === "POST") {
      body = await readRequestBody(req);
    }

    const type = String(body.type || req.query?.type || "her").toLowerCase();

    if (!['her', 'his', 'couples'].includes(type)) throw new Error('Invalid agreement type');
    const html = buildAgreement(body, type);

    const executablePath = await chromium.executablePath();

    browser = await puppeteer.launch({
      args: [...chromium.args, "--no-sandbox"],
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: true
    });

    const page = await browser.newPage();

    await page.setContent(html, {
      waitUntil: "load"
    });

    // Measure the actual print layout, including wrapped names/subtitles. Keep
    // the border full size and scale only the content when it needs more room.
    await page.emulateMediaType('print');
    await page.evaluate(fitAgreement);

    const pdf = await page.pdf({
      landscape: true,
      format: "Letter",
      preferCSSPageSize: true,
      printBackground: true,
      margin: {
        top: "0in",
        right: "0in",
        bottom: "0in",
        left: "0in"
      }
    });

    let rankingStatus = 'unavailable';
    try { rankingStatus = await recordPDFChoices(req, body, type); }
    catch { console.warn('PDF generated, but its ranking choices could not be recorded.'); }
    res.setHeader('X-Ranking-Status', rankingStatus);
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${type}-agreement.pdf"`);
    res.end(pdf);
  } catch (error) {
    console.error("Agreement PDF generation failed:", error);

    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({
      ok: false,
      message: "Agreement PDF generation failed",
      error: String(error && error.message ? error.message : error)
    }));
  } finally {
    if (browser) {
      await browser.close();
    }
  }
};
