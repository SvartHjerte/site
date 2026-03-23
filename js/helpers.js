// =========================
// The Cheat List - helpers.js
// =========================

function escapeHtml(text) {
  if (text === null || text === undefined) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function slugifyName(name) {
  return String(name).trim().toLowerCase();
}

function inferCategory(name) {
  const lower = String(name).toLowerCase();

  const womenHints = [
    "scarlett","margot","zendaya","ana","sydney","taylor",
    "rihanna","beyonce","ariana","dua","selena","jennifer",
    "emma","gal","sabrina","adele","billie","doja","miley",
    "katy","shakira","nicki"
  ];

  const menHints = [
    "chris","ryan","henry","michael","brad","tom",
    "drake","harry","bad bunny","the weeknd","justin",
    "travis","jason","leo","bruno","ed sheeran",
    "post malone","eminem","usher"
  ];

  if (womenHints.some(hint => lower.includes(hint))) return "woman";
  if (menHints.some(hint => lower.includes(hint))) return "man";

  return "other";
}

function findPersonByName(name) {
  return people.find((p) => slugifyName(p.name) === slugifyName(name));
}

function getRawTmdbId(idValue) {
  if (!idValue) return "";
  return String(idValue).replace(/^tmdb-/, "");
}

function mergeDefaultMetadata(savedPeople) {
  return savedPeople.map((person) => {

    const match = defaultPeople.find(
      (d) =>
        (person.id && d.id === person.id) ||
        slugifyName(d.name) === slugifyName(person.name)
    );

    if (!match) return person;

    return {
      ...match,
      ...person,
      id: person.id || match.id,
      source: person.source || match.source,
      image: person.image || match.image || "",
      subtitle: person.subtitle || match.subtitle || ""
    };

  });
}

function getImageHtml(person) {

  if (person.image) {
    return `<img src="${escapeHtml(person.image)}" alt="${escapeHtml(person.name)}" class="person-photo">`;
  }

  return `<div class="person-photo placeholder">No Photo</div>`;
}

function getHerLabel() {
  const value = document.getElementById("herName")?.value.trim();
  return value || "Her";
}

function getHisLabel() {
  const value = document.getElementById("hisName")?.value.trim();
  return value || "His";
}

/* -------------------------
   Source Links
------------------------- */

function getSourceLink(person) {

  if (!person || !person.source || !person.id) return "";

  if (person.source === "tmdb") {
    const id = String(person.id).replace("tmdb-", "");
    return `https://www.themoviedb.org/person/${id}`;
  }

  if (person.source === "sportsdb") {
    const id = String(person.id).replace("sportsdb-", "");
    return `https://www.thesportsdb.com/player/${id}`;
  }

  if (person.source === "audiodb") {
    const id = String(person.id).replace("audiodb-", "");
    return `https://www.theaudiodb.com/artist/${id}`;
  }

  return "";
}

function getSourceLabel(source) {

  if (source === "tmdb") return "TMDB";
  if (source === "sportsdb") return "TheSportsDB";
  if (source === "audiodb") return "TheAudioDB";

  return "Source";
}
function getCertificationText() {
  return `
    <div class="certificate-certification">
      This certificate acknowledges the following Celebrity Cheat List.
      It grants no real privileges, permissions, or guarantees of success.
      <br><br>
      Should the impossible occur and one of the following celebrities express
      interest, the undersigned partner agrees to pretend this agreement
      was always meant to be taken seriously.
    </div>
  `;
}

function updateAgreementButtons() {
  const herInput = document.getElementById("herName");
  const hisInput = document.getElementById("hisName");
  const herBtn = document.getElementById("previewHerBtn");
  const hisBtn = document.getElementById("previewHisBtn");

  const herName = herInput ? herInput.value.trim() : "";
  const hisName = hisInput ? hisInput.value.trim() : "";

  if (herBtn) {
    herBtn.textContent = herName
      ? `Preview ${herName}'s Agreement`
      : "Preview Her Agreement";
  }

  if (hisBtn) {
    hisBtn.textContent = hisName
      ? `Preview ${hisName}'s Agreement`
      : "Preview His Agreement";
  }
}
let liveSearchTimer = null;

function handleLiveSearch() {
  clearTimeout(liveSearchTimer);

  liveSearchTimer = setTimeout(() => {
    const input = document.getElementById("searchInput");
    if (!input) return;

    const query = input.value.trim();

    if (query.length < 2) {
      const results = document.getElementById("results");
      if (results) results.innerHTML = "";
      return;
    }

    searchCelebrity();
  }, 300);
}

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getClosestPeopleMatches(query, maxResults = 5) {
  const q = normalizeName(query);
  if (!q) return [];

  const scored = people.map((person) => {
    const name = normalizeName(person.name);

    let score = 0;

    if (name === q) score += 1000;
    if (name.includes(q)) score += 200;
    if (name.startsWith(q)) score += 100;

    const parts = q.split(" ");
    for (const part of parts) {
      if (part && name.includes(part)) score += 40;
    }

    const compactName = name.replace(/\s/g, "");
    const compactQuery = q.replace(/\s/g, "");

    if (compactName.includes(compactQuery)) score += 60;

    return { person, score };
  });

  return scored
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map(item => item.person);
}

function useSuggestedSearch(name) {
  const input = document.getElementById("searchInput");
  if (!input) return;

  input.value = name;
  searchCelebrity();
}
function shareSite() {
  const url = "https://thecheatlist.com";
  const title = "The Cheat List";
  const text = "Build a funny celebrity cheat list agreement.";

  if (navigator.share) {
    navigator.share({
      title: title,
      text: text,
      url: url
    }).catch(() => {});
  } else {
    const subject = title;
    const body = `${text}\n\n${url}`;

    window.location.href =
      `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }
}