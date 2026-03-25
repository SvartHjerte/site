function renderLists() {
  const herContainer = document.getElementById("herList");
  const hisContainer = document.getElementById("hisList");

  if (herContainer) {
    herContainer.innerHTML = `
      ${
        herList.length === 0
          ? "<p>No celebrities selected yet.</p>"
          : herList.map((person) => `
              <div class="cheat-list-card">
                <div class="cheat-list-image">${getImageHtml(person)}</div>

                <div class="cheat-list-info">
                  <strong>${escapeHtml(person.name)}</strong>
                  <div>${escapeHtml(person.subtitle || "")}</div>
                </div>

                <div class="cheat-list-actions">
                  <button onclick="removeFromHerList('${escapeHtml(person.name)}')">
                    Remove
                  </button>
                </div>
              </div>
            `).join("")
      }
    `;
  }

  if (hisContainer) {
    hisContainer.innerHTML = `
      ${
        hisList.length === 0
          ? "<p>No celebrities selected yet.</p>"
          : hisList.map((person) => `
              <div class="cheat-list-card">
                <div class="cheat-list-image">${getImageHtml(person)}</div>

                <div class="cheat-list-info">
                  <strong>${escapeHtml(person.name)}</strong>
                  <div>${escapeHtml(person.subtitle || "")}</div>
                </div>

                <div class="cheat-list-actions">
                  <button onclick="removeFromHisList('${escapeHtml(person.name)}')">
                    Remove
                  </button>
                </div>
              </div>
            `).join("")
      }
    `;
  }
}