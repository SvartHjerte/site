// =========================
// The Cheat List - config.js
// =========================

const TMDB_API_KEY = "17797942e8460857423e2b19eaafd1fe";
const SPORTSDB_API_KEY = "123";
const MUSIC_API_KEY = "123";

const MAX_LIST_ITEMS = 5;

const SOURCE_PRIORITY = {
  tmdb: 3,
  sportsdb: 2,
  audiodb: 1,
  starter: 0
};

const defaultPeople = [
  { id: "tmdb-1245", name: "Scarlett Johansson", category: "woman", votes: 128, source: "tmdb", image: "", subtitle: "Actor" },
  { id: "tmdb-234352", name: "Margot Robbie", category: "woman", votes: 140, source: "tmdb", image: "", subtitle: "Actor" },
  { id: "tmdb-505710", name: "Zendaya", category: "woman", votes: 110, source: "tmdb", image: "", subtitle: "Actor" },
  { id: "tmdb-224513", name: "Ana de Armas", category: "woman", votes: 95, source: "tmdb", image: "", subtitle: "Actor" },
  { id: "tmdb-115440", name: "Sydney Sweeney", category: "woman", votes: 90, source: "tmdb", image: "", subtitle: "Actor" },

  { id: "tmdb-74568", name: "Chris Hemsworth", category: "man", votes: 119, source: "tmdb", image: "", subtitle: "Actor" },
  { id: "tmdb-10859", name: "Ryan Reynolds", category: "man", votes: 135, source: "tmdb", image: "", subtitle: "Actor" },
  { id: "tmdb-73968", name: "Henry Cavill", category: "man", votes: 100, source: "tmdb", image: "", subtitle: "Actor" },
  { id: "tmdb-16828", name: "Chris Evans", category: "man", votes: 98, source: "tmdb", image: "", subtitle: "Actor" },
  { id: "tmdb-135651", name: "Michael B. Jordan", category: "man", votes: 92, source: "tmdb", image: "", subtitle: "Actor" }
];