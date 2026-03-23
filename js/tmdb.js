function guessCategoryFromGender(gender) {
  if (gender === 1) return "woman";
  if (gender === 2) return "man";
  return "unknown";
}

async function searchCelebrity() {
  const searchInput = document.getElementById("searchInput");
  const resultsDiv = document.getElementById("results");

  if (!searchInput || !resultsDiv) return;

  const query = searchInput.value.trim();

  if (!query) {
    resultsDiv.innerHTML = `<p>Please enter a celebrity name.</p>`;
    return;
  }

  if (typeof apiKey === "undefined" || !apiKey) {
    resultsDiv.innerHTML = `
      <p>TMDB API key missing.</p>
      <p>Add this near the top of script.js:</p>
      <pre>const apiKey = "YOUR_TMDB_API_KEY";</pre>
    `;
    return;
  }

  resultsDiv.innerHTML = `<p>Searching...</p>`;

  try {
    const url = `https://api.themoviedb.org/3/search/person?api_key=${encodeURIComponent(apiKey)}&query=${encodeURIComponent(query)}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`TMDB request failed: ${response.status}`);
    }

    const data = await response.json();
    lastSearchResults = Array.isArray(data.results) ? data.results : [];

    if (!lastSearchResults.length) {
      resultsDiv.innerHTML = `<p>No celebrities found.</p>`;
      return;
    }

    resultsDiv.innerHTML = lastSearchResults
      .slice(0, 10)
      .map((person) => {
        const name = person.name || "Unknown";
        const category = guessCategoryFromGender(person.gender);
        const profilePath = person.profile_path || "";
        const imageUrl = profilePath
          ? `https://image.tmdb.org/t/p/w300${profilePath}`
          : "";
        const knownFor = Array.isArray(person.known_for)
          ? person.known_for
              .map((item) => item.title || item.name)
              .filter(Boolean)
              .slice(0, 3)
              .join(", ")
          : "";
        const tmdbUrl = person.id
          ? `https://www.themoviedb.org/person/${person.id}`
          : "";

        const safePersonData = JSON.stringify({
          id: person.id || null,
          name,
          category,
          imageUrl,
          profile_path: profilePath,
          votes: 0
        });

        return `
          <div class="result-card">
            ${
              imageUrl
                ? `<img class="result-image" src="${imageUrl}" alt="${escapeHtml(name)}">`
                : `<div class="result-no-image">No Image</div>`
            }

            <div class="result-content">
              <h3>${escapeHtml(name)}</h3>
              <p><strong>Category:</strong> ${escapeHtml(category)}</p>
              ${knownFor ? `<p><strong>Known for:</strong> ${escapeHtml(knownFor)}</p>` : ""}
              ${
                tmdbUrl
                  ? `<p><a href="${tmdbUrl}" target="_blank" rel="noopener noreferrer">View on TMDB</a></p>`
                  : ""
              }

              <div class="result-buttons">
                <button onclick='addToHerList(${safePersonData})'>Add to Her List</button>
                <button onclick='addToHisList(${safePersonData})'>Add to His List</button>
              </div>
            </div>
          </div>
        `;
      })
      .join("");
  } catch (error) {
    console.error(error);
    resultsDiv.innerHTML = `<p>Search failed. Check your TMDB API key and internet connection.</p>`;
  }
}