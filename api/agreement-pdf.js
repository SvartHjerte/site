const chromium = require("@sparticuz/chromium");
const puppeteer = require("puppeteer-core");

module.exports = async function (req, res) {
  let browser;

  try {
const body = req.body || {};
const type = String(body.type || req.query.type || "her").toLowerCase();
const herName = String(body.herName || "Her");
const hisName = String(body.hisName || "His");
const herList = Array.isArray(body.herList) ? body.herList : [];
const hisList = Array.isArray(body.hisList) ? body.hisList : [];const type = (req.query.type || "her").toLowerCase();

let title = "The Cheat List Agreement";
let subtitle = `${herName}'s Agreement`;
let intro = "This playful agreement certifies the following impossible celebrity exceptions.";
let bodyHtml = `
  <div class="list-box">
    <ul>
      ${buildListItems(herList)}
    </ul>
  </div>
`;

if (type === "his") {
  subtitle = `${hisName}'s Agreement`;
  bodyHtml = `
    <div class="list-box">
      <ul>
        ${buildListItems(hisList)}
      </ul>
    </div>
  `;
}

if (type === "couples") {
  subtitle = "Couples Agreement";
  intro = `This agreement certifies that ${escapeHtml(hisName)} and ${escapeHtml(herName)} have mutually approved the following celebrity exemptions.`;
  bodyHtml = `
    <div style="display:flex; gap:24px; margin-top:10px;">
      <div class="list-box" style="flex:1;">
        <h3 style="margin-top:0;">${escapeHtml(herName)}'s Cheat List</h3>
        <ul>
          ${buildListItems(herList)}
        </ul>
      </div>

      <div class="list-box" style="flex:1;">
        <h3 style="margin-top:0;">${escapeHtml(hisName)}'s Cheat List</h3>
        <ul>
          ${buildListItems(hisList)}
        </ul>
      </div>
    </div>
  `;
}

function getPersonSubtitle(person) {
  if (!person) return "";
  return person.subtitle || person.category || person.genre || person.sport || "";
}

function buildListItems(list) {
  if (!list || list.length === 0) {
    return "<li>No celebrities selected yet.</li>";
  }

  return list.map((person, index) => {
    const name = escapeHtml(person.name || "Unnamed Celebrity");
    const subtitle = escapeHtml(getPersonSubtitle(person));

    return `
      <li>
        ${index + 1}. ${name}${subtitle ? ` <span style="font-size:13px;color:#5f4b2f;">(${subtitle})</span>` : ""}
      </li>
    `;
  }).join("");
}

    if (type === "his") {
      subtitle = "His Edition";
      names = [
        "1. Scarlett Johansson",
        "2. Margot Robbie",
        "3. Zendaya",
        "4. Ana de Armas",
        "5. Sydney Sweeney"
      ];
    }

    if (type === "couples") {
      subtitle = "Couples Edition";
      intro = "This playful agreement records both sides of the celebrity cheat list understanding.";
      names = [
        "Her List: Ryan Reynolds, Chris Hemsworth, Chris Evans",
        "His List: Margot Robbie, Zendaya, Ana de Armas"
      ];
    }

    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${title}</title>
          <style>
            body {
              font-family: Georgia, serif;
              margin: 0;
              padding: 0;
              background: #f8f3e8;
              color: #2f2417;
            }

            .page {
              width: 11in;
              min-height: 8.5in;
              box-sizing: border-box;
              padding: 0.45in 0.55in;
              background: #f8f3e8;
            }

            .agreement {
              border: 3px solid #8a6a3d;
              padding: 0.35in 0.45in;
              min-height: 7.2in;
              box-sizing: border-box;
              position: relative;
            }

            h1 {
              text-align: center;
              margin: 0 0 8px;
              font-size: 28px;
              letter-spacing: 1px;
            }

            .subtitle {
              text-align: center;
              font-size: 16px;
              margin-bottom: 18px;
            }

            .intro {
              text-align: center;
              font-size: 14px;
              margin: 0 auto 22px;
              max-width: 8.5in;
              line-height: 1.4;
            }

            .list-box {
              margin: 0 auto 26px;
              max-width: 7.6in;
              background: rgba(255,255,255,0.35);
              border: 1px solid #b69766;
              padding: 18px 24px;
            }

            .list-box ul {
              margin: 0;
              padding-left: 22px;
              font-size: 16px;
              line-height: 1.7;
            }

            .signatures {
              display: flex;
              justify-content: space-between;
              gap: 30px;
              margin-top: 40px;
            }

            .sig {
              flex: 1;
              text-align: center;
              font-size: 13px;
            }

            .line {
              border-top: 1px solid #2f2417;
              margin-bottom: 8px;
              height: 22px;
            }

            .footer {
              position: absolute;
              left: 0.45in;
              right: 0.45in;
              bottom: 0.28in;
              text-align: center;
              font-size: 11px;
              line-height: 1.35;
              color: #5f4b2f;
            }
          </style>
        </head>
        <body>
          <div class="page">
            <div class="agreement">
              <h1>${title}</h1>
              <div class="subtitle">${subtitle}</div>
              <div class="intro">${intro}</div>

              <div class="list-box">
                <ul>
                  ${names.map(name => `<li>${name}</li>`).join("")}
                </ul>
              </div>

              <div class="signatures">
                <div class="sig">
                  <div class="line"></div>
                  Approved By
                </div>
                <div class="sig">
                  <div class="line"></div>
                  Witnessed With Mild Jealousy
                </div>
              </div>

              <div class="footer">
                For entertainment purposes only.<br>
                Not endorsed by any celebrity, studio, league, label, or sensible legal authority.
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
    res.end(
      JSON.stringify({
        ok: false,
        message: "Agreement PDF generation failed",
        error: String(error && error.message ? error.message : error)
      })
    );
  } finally {
    if (browser) {
      await browser.close();
    }
  }
};