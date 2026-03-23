// =========================
// The Cheat List - main.js
// =========================

let herList = [];
let hisList = [];
let lastSearchResults = [];
let people = [...defaultPeople];

function addTopPersonToList(name, listType) {
  const person = people.find((p) => slugifyName(p.name) === slugifyName(name));
  if (!person) return;

  const targetList = listType === "her" ? herList : hisList;
  const alreadyExists = targetList.some((p) => slugifyName(p.name) === slugifyName(name));

  if (alreadyExists) {
    alert(`Already on ${listType === "her" ? getHerLabel() : getHisLabel()} list.`);
    return;
  }

  if (targetList.length >= MAX_LIST_ITEMS) {
    alert(`${listType === "her" ? getHerLabel() : getHisLabel()} list already has ${MAX_LIST_ITEMS} people.`);
    return;
  }

  targetList.push(person);
  saveLists();
  renderLists();
}

async function handleSearch() {
  const input = document.getElementById("searchInput");
  const query = input ? input.value.trim() : "";

  if (!query) {
    alert("Please enter a celebrity name to search.");
    return;
  }

  const container = document.getElementById("results");
  if (container) {
    container.innerHTML = "<p>Searching actors, athletes, and musicians...</p>";
  }

  try {
    lastSearchResults = await searchAllSources(query);
    renderSearchResults(lastSearchResults);
  } catch (error) {
    console.error("Search failed:", error);
    if (container) {
      container.innerHTML = "<p>Search failed. Check browser console.</p>";
    }
  }
}

function searchCelebrity() {
  handleSearch();
}

function addToCheatList(personId, listType) {
  const person = lastSearchResults.find((p) => p.id === personId);
  if (!person) return;

  const targetList = listType === "her" ? herList : hisList;
  const alreadyExists = targetList.some((p) => p.id === person.id);

  if (alreadyExists) {
    alert(`Already on ${listType === "her" ? getHerLabel() : getHisLabel()} list.`);
    return;
  }

  if (targetList.length >= MAX_LIST_ITEMS) {
    alert(`${listType === "her" ? getHerLabel() : getHisLabel()} list already has ${MAX_LIST_ITEMS} people.`);
    return;
  }

  targetList.push(person);

  if (!people.some((p) => p.id === person.id)) {
    people.push({
      id: person.id,
      name: person.name,
      category: person.category,
      votes: 0,
      source: person.source,
      image: person.image,
      subtitle: person.subtitle || ""
    });
  }

  saveLists();
  saveVotes();
  renderLists();
  updateRankings();
  renderSearchResults(lastSearchResults);
}

function removeFromHerList(name) {
  herList = herList.filter((person) => slugifyName(person.name) !== slugifyName(name));
  saveLists();
  renderLists();
}

function removeFromHisList(name) {
  hisList = hisList.filter((person) => slugifyName(person.name) !== slugifyName(name));
  saveLists();
  renderLists();
}

function clearLists() {
  herList = [];
  hisList = [];
  saveLists();
  renderLists();
}

function voteForPerson(name) {
  const person = findPersonByName(name);
  if (!person) return;

  person.votes += 1;
  saveVotes();
  updateRankings();
}

document.addEventListener("DOMContentLoaded", async () => {
  loadVotes();
  loadLists();
  renderLists();
  updateRankings();

  await hydrateDefaultPeopleImages();
  updateRankings();

  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        handleSearch();
      }
    });
  }

  const herInput = document.getElementById("herName");
  const hisInput = document.getElementById("hisName");

  if (herInput) {
    herInput.addEventListener("input", () => {
      renderLists();
      updateRankings();
      if (lastSearchResults.length) renderSearchResults(lastSearchResults);
    });
  }

  if (hisInput) {
    hisInput.addEventListener("input", () => {
      renderLists();
      updateRankings();
      if (lastSearchResults.length) renderSearchResults(lastSearchResults);
    });
  }
});
document.addEventListener("DOMContentLoaded", () => {

  updateAgreementButtons();

  document.getElementById("herName").addEventListener("input", updateAgreementButtons);
  document.getElementById("hisName").addEventListener("input", updateAgreementButtons);

});