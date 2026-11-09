// =========================
// The Cheat List - storage.js
// =========================

function saveVotes() {
  // Popularity is server-owned; do not persist or upload browser vote totals.
}

function loadVotes() {
  people = defaultPeople.map(person => ({ ...person, votes: 0 }));
}

function saveLists() {
  localStorage.setItem("cheatListHerList", JSON.stringify(herList));
  localStorage.setItem("cheatListHisList", JSON.stringify(hisList));
  rankingSync.changed();
}

function loadLists() {
  const savedHer = localStorage.getItem("cheatListHerList");
  const savedHis = localStorage.getItem("cheatListHisList");

  try {
    herList = sanitizeSavedList(savedHer);
  } catch (error) {
    console.error("Failed to load her list:", error);
    herList = [];
  }

  try {
    hisList = sanitizeSavedList(savedHis);
  } catch (error) {
    console.error("Failed to load his list:", error);
    hisList = [];
  }
}

function sanitizeSavedList(raw) {
  const parsed = raw ? JSON.parse(raw) : [];
  if (!Array.isArray(parsed)) return [];
  const seen = new Set();
  return parsed.filter(person => {
    if (!person || typeof person.name !== 'string' ||
        !/^(tmdb|sportsdb|audiodb)-[1-9][0-9]{0,11}$/.test(person.id) || seen.has(person.id)) return false;
    seen.add(person.id); return true;
  }).slice(0, MAX_LIST_ITEMS);
}
