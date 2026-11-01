// =========================
// The Cheat List - config.js
// =========================

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
  { id: "tmdb-1245", name: "Scarlett Johansson", category: "woman", votes: 0, source: "tmdb", image: "", subtitle: "Actor" },
  { id: "tmdb-234352", name: "Margot Robbie", category: "woman", votes: 0, source: "tmdb", image: "", subtitle: "Actor" },
  { id: "tmdb-505710", name: "Zendaya", category: "woman", votes: 0, source: "tmdb", image: "", subtitle: "Actor" },
  { id: "tmdb-224513", name: "Ana de Armas", category: "woman", votes: 0, source: "tmdb", image: "", subtitle: "Actor" },
  { id: "tmdb-115440", name: "Sydney Sweeney", category: "woman", votes: 0, source: "tmdb", image: "", subtitle: "Actor" },

  { id: "tmdb-74568", name: "Chris Hemsworth", category: "man", votes: 0, source: "tmdb", image: "", subtitle: "Actor" },
  { id: "tmdb-10859", name: "Ryan Reynolds", category: "man", votes: 0, source: "tmdb", image: "", subtitle: "Actor" },
  { id: "tmdb-73968", name: "Henry Cavill", category: "man", votes: 0, source: "tmdb", image: "", subtitle: "Actor" },
  { id: "tmdb-16828", name: "Chris Evans", category: "man", votes: 0, source: "tmdb", image: "", subtitle: "Actor" },
  { id: "tmdb-135651", name: "Michael B. Jordan", category: "man", votes: 0, source: "tmdb", image: "", subtitle: "Actor" },
];
