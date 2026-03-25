const chromium = require("@sparticuz/chromium");
const puppeteer = require("puppeteer-core");

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getPersonSubtitle(person) {
  if (!person) return "";
  return person.subtitle || person.category || person.genre || person.sport || "";
}

function buildListItems(list) {
  if (!Array.isArray(list) || list.length === 0) {
    return "<li>No celebrities selected yet.</li>";
  }

  return list.map((person, index) => {
    const name = escapeHtml(person.name || "Unnamed Celebrity");
    const subtitle = escapeHtml(getPersonSubtitle(person));

    return `
      <li>
        <span class="person-name">${index + 1}. ${name}</span>
        ${subtitle ? `<span class="person-subtitle">${subtitle}</span>` : ""}
      </li>
    `;
  }).join("");
}

function readRequestBody(req) {
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
        resolve(JSON.parse(data));
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

    const type = String(body.type || req.query.type || "her").toLowerCase();

    const herName = escapeHtml(body.herName || "Her");
    const hisName = escapeHtml(body.hisName || "His");

    const herList = Array.isArray(body.herList) ? body.herList : [];
    const hisList = Array.isArray(body.hisList) ? body.hisList : [];

    const title = "The Cheat List Agreement";

    let subtitle = `${herName}'s Agreement`;
    let intro = "This playful agreement certifies the following impossible celebrity exceptions.";
    let bodyHtml = `
      <div class="list-box">
        <ol class="certificate-list">
          ${buildListItems(herList)}
        </ol>
      </div>
    `;
    let signatureHtml = `
      <div class="certificate-signatures">
        <div class="certificate-sign-block">
          <div class="certificate-sign-line"></div>
          <div class="certificate-sign-label">${hisName} Approval Signature</div>
        </div>

        <div class="certificate-sign-block date-block">
          <div class="certificate-sign-line"></div>
          <div class="certificate-sign-label">Date</div>
        </div>
      </div>
    `;

    if (type === "his") {
      subtitle = `${hisName}'s Agreement`;
      bodyHtml = `
        <div class="list-box">
          <ol class="certificate-list">
            ${buildListItems(hisList)}
          </ol>
        </div>
      `;
      signatureHtml = `
        <div class="certificate-signatures">
          <div class="certificate-sign-block">
            <div class="certificate-sign-line"></div>
            <div class="certificate-sign-label">${herName} Approval Signature</div>
          </div>

          <div class="certificate-sign-block date-block">
            <div class="certificate-sign-line"></div>
            <div class="certificate-sign-label">Date</div>
          </div>
        </div>
      `;
    }

    if (type === "couples") {
      subtitle = "Couples Agreement";
      intro = `This agreement certifies that ${hisName} and ${herName} have mutually approved the following celebrity exemptions.`;
      bodyHtml = `
        <div class="couples-grid">
          <div class="list-box couples-box">
            <h3>${herName}'s Cheat List</h3>
            <ol class="certificate-list">
              ${buildListItems(herList)}
            </ol>

            <div class="certificate-signatures panel-certificate-signatures">
              <div class="certificate-sign-block">
                <div class="certificate-sign-line"></div>
                <div class="certificate-sign-label">${hisName} Approval Signature</div>
              </div>

              <div class="certificate-sign-block date-block">
                <div class="certificate-sign-line"></div>
                <div class="certificate-sign-label">Date</div>
              </div>
            </div>
          </div>

          <div class="list-box couples-box">
            <h3>${hisName}'s Cheat List</h3>
            <ol class="certificate-list">
              ${buildListItems(hisList)}
            </ol>

            <div class="certificate-signatures panel-certificate-signatures">
              <div class="certificate-sign-block">
                <div class="certificate-sign-line"></div>
                <div class="certificate-sign-label">${herName} Approval Signature</div>
              </div>

              <div class="certificate-sign-block date-block">
                <div class="certificate-sign-line"></div>
                <div class="certificate-sign-label">Date</div>
              </div>
            </div>
          </div>
        </div>
      `;
      signatureHtml = "";
    }

    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${title}</title>
          <style>
            body {
              font-family: Georgia, "Times New Roman", serif;
              margin: 0;
              padding: 0;
              background: #f4ecd8;
              color: #2f2417;
            }

            .page {
              width: 11in;
              min-height: 8.5in;
              box-sizing: border-box;
              padding: 0.35in 0.45in;
              background: #f4ecd8;
            }

            .agreement {
              border: 6px double #8a6a3d;
              padding: 0.35in 0.45in;
              min-height: 7.3in;
              box-sizing: border-box;
              position: relative;
              background:
                radial-gradient(rgba(255,255,255,0.3), rgba(255,255,255,0.15)),
                #f4ecd8;
            }

            .certificate-top {
              text-align: center;
              margin-bottom: 10px;
            }

            .certificate-logo {
              display: block;
              margin: 0 auto 10px;
              max-width: 260px;
              max-height: 90px;
              object-fit: contain;
            }

            .certificate-title {
              margin: 0;
              font-size: 36px;
              letter-spacing: 2px;
              font-weight: bold;
              text-transform: uppercase;
            }

            .certificate-subtitle {
              margin: 6px 0 0;
              font-size: 18px;
              font-weight: normal;
              color: #5f4b2f;
            }

            .intro {
              text-align: center;
              font-size: 14px;
              margin: 12px auto 20px;
              max-width: 8.3in;
              line-height: 1.35;
            }

            .list-box {
              margin: 0 auto 22px;
              max-width: 7.7in;
              background: rgba(255,255,255,0.35);
              border: 2px solid #b69766;
              padding: 18px 24px;
              box-sizing: border-box;
              border-radius: 6px;
            }

            .certificate-list {
              margin: 0;
              padding-left: 20px;
              font-size: 16px;
              line-height: 1.45;
            }

            .certificate-list li {
              margin-bottom: 8px;
            }

            .person-name {
              display: block;
              font-weight: bold;
            }

            .person-subtitle {
              display: block;
              font-size: 12px;
              color: #5f4b2f;
              margin-top: 2px;
            }

            .certificate-signatures {
              display: flex;
              justify-content: space-between;
              gap: 40px;
              margin-top: 40px;
            }

            .certificate-sign-block {
              flex: 1;
              text-align: center;
            }

            .certificate-sign-line {
              border-top: 1px solid #2f2417;
              height: 20px;
              margin-bottom: 6px;
            }

            .certificate-sign-label {
              font-size: 13px;
            }

            .couples-grid {
              display: flex;
              gap: 20px;
              margin-top: 6px;
            }

            .couples-box {
              flex: 1;
              max-width: none;
              margin-bottom: 0;
            }

            .couples-box h3 {
              margin: 0 0 10px;
              text-align: center;
              font-size: 18px;
            }

            .panel-certificate-signatures {
              margin-top: 18px;
            }

            .footer {
              position: absolute;
              left: 0.38in;
              right: 0.38in;
              bottom: 0.20in;
              text-align: center;
              font-size: 10px;
              line-height: 1.3;
              color: #5f4b2f;
            }
          </style>
        </head>
        <body>
          <div class="page">
            <div class="agreement">
              <div class="certificate-top">
                <img
                  src="https://thecheatlist.com/images/logo.png"
                  alt="The Cheat List logo"
                  class="certificate-logo"
                >
                <h1 class="certificate-title">${title}</h1>
                <h2 class="certificate-subtitle">${subtitle}</h2>
              </div>

              <div class="intro">${intro}</div>

              ${bodyHtml}

              ${signatureHtml}

              <div class="footer">
                For entertainment purposes only.<br>
                Not endorsed by any celebrity, studio, team, league, label, or public figure.
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    const executablePath = await chromium.executablePath();

    browser = await puppeteer.launch({
      args: [...chromium.args, "--no-sandbox"],
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: true
    });

    const page = await browser.newPage();

    await page.setContent(html, {
      waitUntil: "domcontentloaded"
    });

    const pdf = await page.pdf({
      landscape: true,
      format: "Letter",
      printBackground: true,
      margin: {
        top: "0in",
        right: "0in",
        bottom: "0in",
        left: "0in"
      }
    });

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