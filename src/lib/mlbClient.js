const MLB = "https://statsapi.mlb.com/api/v1";

async function mlbGet(path) {
  const res = await fetch(`${MLB}${path}`);
  if (!res.ok) throw new Error(`MLB API error ${res.status}`);
  return res.json();
}

export async function getSeasonStats(playerId, position) {
  const season = new Date().getFullYear();
  const group = ["SP", "RP", "P"].includes(position) ? "pitching" : "hitting";
  const data = await mlbGet(
    `/people/${playerId}/stats?stats=season&season=${season}&sportId=1&group=${group}`
  );
  return data.stats?.[0]?.splits?.[0]?.stat ?? {};
}

export async function getGameLog(playerId) {
  const season = new Date().getFullYear();
  const data = await mlbGet(
    `/people/${playerId}/stats?stats=gameLog&season=${season}&sportId=1&group=hitting,pitching`
  );
  return (data.stats?.[0]?.splits ?? []).slice(-7).map((g) => ({
    date: g.date,
    opponent: g.opponent?.name,
    stat: g.stat,
  }));
}

export async function getTodayAndTomorrowSchedule() {
  const fmt = (d) => d.toISOString().split("T")[0];
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const [t, tm] = await Promise.all([
    mlbGet(`/schedule?sportId=1&date=${fmt(today)}&hydrate=probablePitcher,venue,weather`),
    mlbGet(`/schedule?sportId=1&date=${fmt(tomorrow)}&hydrate=probablePitcher,venue,weather`),
  ]);
  return {
    today: t.dates?.[0]?.games ?? [],
    tomorrow: tm.dates?.[0]?.games ?? [],
  };
}

function findGame(games, teamName) {
  if (!teamName) return null;
  const t = teamName.toLowerCase();
  return (
    games.find(
      (g) =>
        g.teams?.away?.team?.name?.toLowerCase().includes(t) ||
        g.teams?.home?.team?.name?.toLowerCase().includes(t)
    ) ?? null
  );
}

export async function buildPlayerData(player, schedule) {
  const [stats, log] = await Promise.all([
    getSeasonStats(player.id, player.position).catch(() => ({})),
    getGameLog(player.id).catch(() => []),
  ]);

  const teamName = player.team ?? "";
  const todayMatch = findGame(schedule.today, teamName);
  const tomorrowMatch = findGame(schedule.tomorrow, teamName);
  const game = todayMatch ?? tomorrowMatch;
  const when = todayMatch ? "today" : tomorrowMatch ? "tomorrow" : null;

  let todayGame = null;
  if (game) {
    const isHome = game.teams?.home?.team?.name
      ?.toLowerCase()
      .includes(teamName.toLowerCase());
    const pitcher = isHome
      ? game.teams?.away?.probablePitcher
      : game.teams?.home?.probablePitcher;
    const w = game.weather;
    todayGame = {
      when,
      opponent: (isHome ? game.teams?.away : game.teams?.home)?.team?.name,
      venue: game.venue?.name,
      probablePitcher: pitcher
        ? { name: pitcher.fullName, throws: pitcher.pitchHand?.code }
        : null,
      weather: w
        ? {
            temp: w.temp ? `${w.temp}°F` : null,
            wind: w.wind,
            condition: w.condition,
          }
        : null,
    };
  }

  return { player, seasonStats: stats, recentLog: log, todayGame };
}
