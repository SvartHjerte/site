// =========================
// The Cheat List - api.js
// =========================

async function searchTMDB(query) {
  try {
    const url = `https://api.themoviedb.org/3/search/person?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.results) return [];

    return data.results.slice(0, 12).map((person) => ({
      id: `tmdb-${person.id}`,
      name: person.name,
      source: "tmdb",
      category: inferCategory(person.name),
      image: person.profile_path
        ? `https://image.tmdb.org/t/p/w185${person.profile_path}`
        : "",
      subtitle: person.known_for_department || "Actor",
      votes: 0
    }));
  } catch (error) {
    console.error("TMDB search failed:", error);
    return [];
  }
}

async function searchSportsDB(query) {
  try {
    const url = `https://www.thesportsdb.com/api/v1/json/${SPORTSDB_API_KEY}/searchplayers.php?p=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.player) return [];

    return data.player.slice(0, 12).map((player) => ({
      id: `sportsdb-${player.idPlayer}`,
      name: player.strPlayer,
      source: "sportsdb",
      category: inferCategory(player.strPlayer),
      image: player.strThumb || player.strCutout || player.strRender || "",
      subtitle: `${player.strSport || "Sport"}${player.strTeam ? " • " + player.strTeam : ""}`,
      votes: 0
    }));
  } catch (error) {
    console.error("SportsDB search failed:", error);
    return [];
  }
}

async function searchAudioDB(query) {
  try {
    const url = `https://www.theaudiodb.com/api/v1/json/${MUSIC_API_KEY}/search.php?s=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.artists) return [];

    return data.artists.slice(0, 12).map((artist) => ({
      id: `audiodb-${artist.idArtist}`,
      name: artist.strArtist,
      source: "audiodb",
      category: inferCategory(artist.strArtist),
      image: artist.strArtistThumb || artist.strArtistFanart || "",
      subtitle: `${artist.strGenre || "Music"}${artist.strStyle ? " • " + artist.strStyle : ""}`,
      votes: 0
    }));
  } catch (error) {
    console.error("AudioDB search failed:", error);
    return [];
  }
}

async function searchAllSources(query) {
  const [tmdbResults, sportsResults, musicResults] = await Promise.all([
    searchTMDB(query),
    searchSportsDB(query),
    searchAudioDB(query)
  ]);

  const combined = [...tmdbResults, ...sportsResults, ...musicResults];
  const uniqueById = new Map();

  combined.forEach((item) => {
    if (!uniqueById.has(item.id)) {
      uniqueById.set(item.id, item);
    }
  });

  const results = Array.from(uniqueById.values());
  const queryKey = slugifyName(query);

  results.sort((a, b) => {
    const aExact = slugifyName(a.name) === queryKey ? 1 : 0;
    const bExact = slugifyName(b.name) === queryKey ? 1 : 0;

    if (bExact !== aExact) return bExact - aExact;
    return (SOURCE_PRIORITY[b.source] || 0) - (SOURCE_PRIORITY[a.source] || 0);
  });

  return results.slice(0, 24);
}

async function fetchTmdbPersonImage(tmdbId) {
  try {
    const url = `https://api.themoviedb.org/3/person/${tmdbId}?api_key=${TMDB_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data && data.profile_path) {
      return `https://image.tmdb.org/t/p/w185${data.profile_path}`;
    }

    return "";
  } catch (error) {
    console.error(`TMDB person fetch failed for ${tmdbId}:`, error);
    return "";
  }
}

async function hydrateDefaultPeopleImages() {
  const updates = await Promise.all(
    people.map(async (person) => {
      if (person.source !== "tmdb") return person;
      if (person.image) return person;

      const tmdbId = getRawTmdbId(person.id);
      if (!tmdbId) return person;

      const image = await fetchTmdbPersonImage(tmdbId);
      return image ? { ...person, image } : person;
    })
  );

  people = updates;
  saveVotes();
}