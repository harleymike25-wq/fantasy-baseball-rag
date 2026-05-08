const MLB_BASE = "https://statsapi.mlb.com/api/v1";

const fetchWithTimeout = (url, ms = 4000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
};

async function searchPlayer(name) {
  // Use hydrate=currentTeam in a single call instead of two round trips
  const res = await fetchWithTimeout(
    `${MLB_BASE}/people/search?names=${encodeURIComponent(name)}&sportId=1&hydrate=currentTeam`
  );
  const data = await res.json();
  return data.people?.[0] ?? null;
}

async function getSeasonStats(playerId, season, position) {
  const group = ["SP", "RP", "P"].includes(position) ? "pitching" : "hitting";
  const res = await fetchWithTimeout(
    `${MLB_BASE}/people/${playerId}/stats?stats=season&season=${season}&sportId=1&group=${group}`
  );
  const data = await res.json();
  return data.stats ?? [];
}

async function getRecentGameLog(playerId, season) {
  const res = await fetchWithTimeout(
    `${MLB_BASE}/people/${playerId}/stats?stats=gameLog&season=${season}&sportId=1&group=hitting,pitching`
  );
  const data = await res.json();
  const splits = data.stats?.[0]?.splits ?? [];
  return splits.slice(-14);
}

async function getSchedule(date) {
  const res = await fetchWithTimeout(
    `${MLB_BASE}/schedule?sportId=1&date=${date}&hydrate=probablePitcher,venue,weather`
  );
  const data = await res.json();
  return data.dates?.[0]?.games ?? [];
}

async function getTodayAndTomorrowSchedule() {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const fmt = (d) => d.toISOString().split("T")[0];
  const [todayGames, tomorrowGames] = await Promise.all([
    getSchedule(fmt(today)),
    getSchedule(fmt(tomorrow)),
  ]);
  return { today: todayGames, tomorrow: tomorrowGames };
}

// Keep old export name for compatibility
async function getTodaySchedule() {
  const { today } = await getTodayAndTomorrowSchedule();
  return today;
}

async function getPitcherStats(playerId, season) {
  const res = await fetchWithTimeout(
    `${MLB_BASE}/people/${playerId}/stats?stats=season&season=${season}&sportId=1&group=pitching`
  );
  const data = await res.json();
  return data.stats?.[0]?.splits?.[0]?.stat ?? {};
}

async function getPlatoonSplits(playerId, season) {
  const res = await fetchWithTimeout(
    `${MLB_BASE}/people/${playerId}/stats?stats=statSplits&season=${season}&sportId=1&group=hitting&sitCodes=vl,vr`
  );
  const data = await res.json();
  const splits = data.stats?.[0]?.splits ?? [];
  const vsL = splits.find((s) => s.split?.code === "vl")?.stat ?? null;
  const vsR = splits.find((s) => s.split?.code === "vr")?.stat ?? null;
  return { vsL, vsR };
}

async function getBatterVsPitcher(batterId, pitcherId) {
  const res = await fetchWithTimeout(
    `${MLB_BASE}/people/${batterId}/stats?stats=vsPlayer&opposingPlayerId=${pitcherId}&group=hitting&sportId=1`
  );
  const data = await res.json();
  return data.stats?.[0]?.splits?.[0]?.stat ?? null;
}

async function getPlayerData(playerName, schedule) {
  const currentSeason = new Date().getFullYear();
  const player = await searchPlayer(playerName);
  if (!player) return { error: `Player not found: ${playerName}` };

  const position = player.primaryPosition?.abbreviation;
  const teamName = player.currentTeam?.name?.toLowerCase() ?? "";

  // Use pre-fetched schedule if provided, otherwise fetch it
  const schedulePromise = schedule
    ? Promise.resolve(schedule)
    : getTodayAndTomorrowSchedule();

  const [seasonStats, recentLog, { today: todayGames, tomorrow: tomorrowGames }] = await Promise.all([
    getSeasonStats(player.id, currentSeason, position),
    getRecentGameLog(player.id, currentSeason),
    schedulePromise,
  ]);

  function findGame(games) {
    return games.find(
      (g) =>
        g.teams?.away?.team?.name?.toLowerCase().includes(teamName) ||
        g.teams?.home?.team?.name?.toLowerCase().includes(teamName)
    );
  }

  const todayGame = findGame(todayGames);
  const tomorrowGame = findGame(tomorrowGames);
  const nextGame = todayGame ?? tomorrowGame;
  const nextGameDay = todayGame ? "today" : tomorrowGame ? "tomorrow" : null;

  let pitcherStats = null;
  let platoonSplits = null;
  let batterVsPitcher = null;
  const isPitcher = ["SP", "RP", "P"].includes(position);

  if (nextGame) {
    const isHome = nextGame.teams?.home?.team?.name?.toLowerCase().includes(teamName);
    const opposingPitcher = isHome
      ? nextGame.teams?.away?.probablePitcher
      : nextGame.teams?.home?.probablePitcher;

    if (opposingPitcher?.id) {
      const [pStats, bvp] = await Promise.all([
        getPitcherStats(opposingPitcher.id, currentSeason),
        !isPitcher ? getBatterVsPitcher(player.id, opposingPitcher.id) : Promise.resolve(null),
      ]);
      pitcherStats = pStats;
      pitcherStats._name = opposingPitcher.fullName;
      pitcherStats._throws = opposingPitcher.pitchHand?.code;
      batterVsPitcher = bvp;
    }
  }

  if (!isPitcher) {
    platoonSplits = await getPlatoonSplits(player.id, currentSeason).catch(() => null);
  }

  return {
    player: {
      id: player.id,
      name: player.fullName,
      team: player.currentTeam?.name,
      position: player.primaryPosition?.abbreviation,
      bats: player.batSide?.code,
    },
    seasonStats: seasonStats?.[0]?.splits?.[0]?.stat ?? {},
    platoonSplits,
    batterVsPitcher,
    recentLog: recentLog.map((g) => ({
      date: g.date,
      opponent: g.opponent?.name,
      stat: g.stat,
    })),
    todayGame: nextGame
      ? {
          when: nextGameDay,
          opponent: nextGame.teams?.away?.team?.name?.toLowerCase() === teamName
            ? nextGame.teams?.home?.team?.name
            : nextGame.teams?.away?.team?.name,
          venue: nextGame.venue?.name,
          gameTime: nextGame.gameDate,
          probablePitcher: pitcherStats,
        }
      : null,
  };
}

exports.handler = async (event) => {
  const { players } = JSON.parse(event.body || "{}");
  if (!players?.length) {
    return { statusCode: 400, body: JSON.stringify({ error: "No players provided" }) };
  }

  try {
    const results = await Promise.all(players.map(getPlayerData));
    return {
      statusCode: 200,
      body: JSON.stringify(results),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

module.exports.getPlayerData = getPlayerData;
module.exports.getTodaySchedule = getTodaySchedule;
module.exports.getTodayAndTomorrowSchedule = getTodayAndTomorrowSchedule;
