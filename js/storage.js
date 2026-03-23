// =========================
// The Cheat List - storage.js
// =========================

function saveVotes() {
  localStorage.setItem("cheatListPeople", JSON.stringify(people));
}

function loadVotes() {
  const saved = localStorage.getItem("cheatListPeople");

  if (!saved) {
    people = [...defaultPeople];
    return;
  }

  try {
    const parsed = JSON.parse(saved);
    people = Array.isArray(parsed) ? mergeDefaultMetadata(parsed) : [...defaultPeople];
  } catch (error) {
    console.error("Failed to load saved votes:", error);
    people = [...defaultPeople];
  }
}

function saveLists() {
  localStorage.setItem("cheatListHerList", JSON.stringify(herList));
  localStorage.setItem("cheatListHisList", JSON.stringify(hisList));
}

function loadLists() {
  const savedHer = localStorage.getItem("cheatListHerList");
  const savedHis = localStorage.getItem("cheatListHisList");

  try {
    herList = savedHer ? JSON.parse(savedHer) : [];
  } catch (error) {
    console.error("Failed to load her list:", error);
    herList = [];
  }

  try {
    hisList = savedHis ? JSON.parse(savedHis) : [];
  } catch (error) {
    console.error("Failed to load his list:", error);
    hisList = [];
  }
}