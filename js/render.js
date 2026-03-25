// =========================
// The Cheat List - render.js
// =========================

function renderSearchResults(results) {
  const container = document.getElementById("results");
  if (!container) return;

  const input = document.getElementById("searchInput");
  const query = input ? input.value.trim() : "";

  if (!results || results.length === 0) {
    const suggestions = getClosestPeopleMatches(query, 5);

    container.innerHTML = `
      <h2>Search Results</h2>
      <p>No exact results found.</p>
      ${
        suggestions.length
          ? `
            <div class="search-suggestions">
              <p><strong>Did you mean:</strong></p>
              <div class="suggestion-buttons">
                ${suggestions.map((person) => `
                  <button class="suggestion-btn" onclick="useSuggestedSearch('${escapeHtml(person.name)}')">
                    ${escapeHtml(person.name)}
                  </button>
                `).join("")}
              </div>
            </div>
          `
          : ""
      }
    `;
    return;
  }

  container.innerHTML = `
    <h2>Search Results</h2>
    ${results.map((person) => `
      <div class="ranking-card search-ranking-card">
        <div class="ranking-rank">+</div>

        <div class="ranking-photo-wrap">
          ${
            person.image
              ? `<img src="${escapeHtml(person.image)}" alt="${escapeHtml(person.name)}" class="ranking-photo">`
              : `<div class="ranking-photo ranking-no-image">No Image</div>`
          }
        </div>

        <div class="ranking-main">
          <div class="ranking-name">${escapeHtml(person.name)}</div>
          <div class="ranking-votes">${escapeHtml(person.subtitle || "Celebrity")}</div>
          <div>Source: ${escapeHtml(person.source)}</div>
          ${
            person.tmdbUrl
              ? `<a href="${escapeHtml(person.tmdbUrl)}" target="_blank" rel="noopener noreferrer" class="source-link">View on TMDB</a>`
              : ""
          }
        </div>

        <div class="ranking-actions">
          <button onclick="addToCheatList('${escapeHtml(person.id)}', 'her')">
            Add to ${escapeHtml(getHerLabel())} List
          </button>
          <button onclick="addToCheatList('${escapeHtml(person.id)}', 'his')">
            Add to ${escapeHtml(getHisLabel())} List
          </button>
        </div>
      </div>
    `).join("")}
  `;
}

function renderLists() {
  const herContainer = document.getElementById("herList");
  const hisContainer = document.getElementById("hisList");

  if (herContainer) {
    herContainer.innerHTML = 
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
                  <button onclick="removeFromHerList('${escapeHtml(person.name)}')">Remove</button>
                </div>
              </div>
            `).join("")
      }
    `;
  }

  if (hisContainer) {
    hisContainer.innerHTML = 
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
                  <button onclick="removeFromHisList('${escapeHtml(person.name)}')">Remove</button>
                </div>
              </div>
            `).join("")
      }
    `;
  }
}

function updateRankings() {
  const rankingsContainer = document.getElementById("rankings");
  if (!rankingsContainer) return;

  const ranked = [...people]
    .sort((a, b) => b.votes - a.votes)
    .slice(0, 10);

  rankingsContainer.innerHTML = `
    <h2>Top Celebrity Cheat List</h2>
    ${
      ranked.length === 0
        ? "<p>No rankings yet.</p>"
        : ranked.map((person, index) => {
            const sourceLink = getSourceLink(person);
            const sourceLabel = getSourceLabel(person.source);

            return `
              <div class="ranking-card">
                <div class="ranking-rank">#${index + 1}</div>

                <div class="ranking-photo-wrap">
                  ${
                    person.image
                      ? `<img src="${escapeHtml(person.image)}" alt="${escapeHtml(person.name)}" class="ranking-photo">`
                      : `<div class="ranking-photo ranking-no-image">No Image</div>`
                  }
                </div>

                <div class="ranking-main">
                  <div class="ranking-name">${escapeHtml(person.name)}</div>
                  <div class="ranking-votes">${person.votes} vote${person.votes === 1 ? "" : "s"}</div>
                  <div>${escapeHtml(person.subtitle || "")}</div>
                  ${
                    sourceLink
                      ? `<a href="${escapeHtml(sourceLink)}" target="_blank" rel="noopener noreferrer" class="source-link">View on ${escapeHtml(sourceLabel)}</a>`
                      : ""
                  }
                </div>

                <div class="ranking-actions">
                  <button onclick='addTopPersonToList(${JSON.stringify(person.name)}, "her")'>Add to ${escapeHtml(getHerLabel())} List</button>
                  <button onclick='addTopPersonToList(${JSON.stringify(person.name)}, "his")'>Add to ${escapeHtml(getHisLabel())} List</button>
                </div>
              </div>
            `;
          }).join("")
    }
  `;
}

function toggleInfo(panelId) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  panel.classList.toggle("hidden");
}