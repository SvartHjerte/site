function getStoredList(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Error reading list from localStorage:", key, error);
    return [];
  }
}

function getPersonSubtitle(person) {
  if (!person) return "";
  return person.subtitle || person.category || person.genre || person.sport || "";
}

function escapeAgreementHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildCertificateList(list) {
  if (!list || list.length === 0) {
    return `<p class="agreement-empty">No celebrities selected yet.</p>`;
  }

  const items = list.map((person, index) => {
    const name = escapeAgreementHtml(person.name || "Unnamed Celebrity");
    const subtitle = escapeAgreementHtml(getPersonSubtitle(person));

    return `
      <li>
        <span class="certificate-name">${index + 1}. ${name}</span>
        ${subtitle ? `<span class="certificate-person-subtitle">${subtitle}</span>` : ""}
      </li>
    `;
  }).join("");

  return `<ol class="certificate-list">${items}</ol>`;
}

function buildStandardCertificate({
  subtitle,
  intro = "",
  bodyHtml = "",
  signatureName = "Approved By"
}) {
  return `
    <div class="certificate-page">
      <div class="certificate-inner">
        <div class="certificate-top">
          <img src="images/logo.png" alt="The Cheat List logo" class="certificate-logo">
          <h1 class="certificate-title">The Cheat List Agreement</h1>
          <h2 class="certificate-subtitle">${subtitle}</h2>
        </div>

        ${getCertificationText()}

        ${intro ? `<p class="certificate-intro">${intro}</p>` : ""}

        <div class="certificate-body">
          ${bodyHtml}
        </div>

        <div class="certificate-signatures single-certificate-signatures">
          <div class="certificate-sign-block">
            <div class="certificate-sign-line"></div>
            <div class="certificate-sign-label">${signatureName}</div>
          </div>

          <div class="certificate-sign-block date-block">
            <div class="certificate-sign-line"></div>
            <div class="certificate-sign-label">Date</div>
          </div>
        </div>

        <div class="certificate-footer">
          For entertainment purposes only. Not endorsed by any celebrity, studio, team, league, label, or public figure.
        </div>
      </div>
    </div>
  `;
}

function showAgreementPreview(type) {
  const preview = document.getElementById("agreementPreview");
  const content = document.getElementById("agreementContent");
  const herNameInput = document.getElementById("herName");
  const hisNameInput = document.getElementById("hisName");

  if (!preview || !content) {
    alert("Agreement HTML not found.");
    return;
  }

  const herList = getStoredList("cheatListHerList");
  const hisList = getStoredList("cheatListHisList");

  const herName = herNameInput && herNameInput.value.trim()
    ? escapeAgreementHtml(herNameInput.value.trim())
    : "Her";

  const hisName = hisNameInput && hisNameInput.value.trim()
    ? escapeAgreementHtml(hisNameInput.value.trim())
    : "His";

  if (type === "her") {
    content.innerHTML = buildStandardCertificate({
      subtitle: `${herName}'s Agreement`,
      bodyHtml: buildCertificateList(herList),
      signatureName: `${hisName} Approval Signature`
    });
  } else if (type === "his") {
    content.innerHTML = buildStandardCertificate({
      subtitle: `${hisName}'s Agreement`,
      bodyHtml: buildCertificateList(hisList),
      signatureName: `${herName} Approval Signature`
    });
  } else {
    content.innerHTML = `
      <div class="certificate-page couples-page">
        <div class="certificate-inner">
          <div class="certificate-top">
            <img src="images/logo.png" alt="The Cheat List logo" class="certificate-logo">
            <h1 class="certificate-title">The Cheat List Agreement</h1>
            <h2 class="certificate-subtitle">Couples Agreement</h2>
          </div>

          <p class="certificate-intro">
            This agreement certifies that ${hisName} and ${herName}
            have mutually approved the following celebrity exemptions.
          </p>

          <div class="certificate-couples-grid">
            <div class="certificate-panel">
              <h3>${herName}'s Cheat List</h3>
              ${buildCertificateList(herList)}

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

            <div class="certificate-panel">
              <h3>${hisName}'s Cheat List</h3>
              ${buildCertificateList(hisList)}

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

          <div class="certificate-footer">
            For entertainment purposes only. Not endorsed by any celebrity, studio, team, league, label, or public figure.
          </div>
        </div>
      </div>
    `;
  }

  preview.classList.remove("hidden");
  preview.scrollIntoView({ behavior: "smooth", block: "start" });
}

function generateHerPDF() {
  openAgreementPDF("her");
}

function generateHisPDF() {
  openAgreementPDF("his");
}

function generateCouplesPDF() {
  openAgreementPDF("couples");
}

function openAgreementPDF(type) {
  const herNameInput = document.getElementById("herName");
  const hisNameInput = document.getElementById("hisName");

  const herName = herNameInput && herNameInput.value.trim()
    ? herNameInput.value.trim()
    : "Her";

  const hisName = hisNameInput && hisNameInput.value.trim()
    ? hisNameInput.value.trim()
    : "His";

  const herList = getStoredList("cheatListHerList");
  const hisList = getStoredList("cheatListHisList");

  const payload = {
    type,
    herName,
    hisName,
    herList,
    hisList
  };

  fetch("/api/agreement-pdf", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  })
    .then(async (response) => {
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to generate PDF.");
      }

      return response.blob();
    })
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    })
    .catch((error) => {
      console.error("PDF generation failed:", error);
      alert("Could not generate PDF.");
    });
}