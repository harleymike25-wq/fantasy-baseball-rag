const ODDS_BASE = "https://api.the-odds-api.com/v4";

function americanToImplied(odds) {
  if (odds > 0) return +(100 / (odds + 100) * 100).toFixed(1);
  return +(Math.abs(odds) / (Math.abs(odds) + 100) * 100).toFixed(1);
}

function findGame(games, teamName) {
  if (!teamName) return null;
  const t = teamName.toLowerCase();
  return games.find((g) => {
    const home = g.home_team?.toLowerCase() ?? "";
    const away = g.away_team?.toLowerCase() ?? "";
    return home.includes(t) || away.includes(t) || t.includes(home) || t.includes(away);
  });
}

async function getGameOdds(apiKey, teamName) {
  const res = await fetch(
    `${ODDS_BASE}/sports/baseball_mlb/odds/?apiKey=${apiKey}&regions=us&markets=h2h,totals&oddsFormat=american`
  );
  if (!res.ok) return null;
  const games = await res.json();
  if (!Array.isArray(games)) return null;

  const game = findGame(games, teamName);
  if (!game) return null;

  // Different bookmakers offer different markets — search across all
  let h2h = null, totals = null, bookmakerKey = null;
  for (const bk of game.bookmakers ?? []) {
    if (!h2h) { h2h = bk.markets?.find((m) => m.key === "h2h") ?? null; if (h2h) bookmakerKey = bk.key; }
    if (!totals) { totals = bk.markets?.find((m) => m.key === "totals") ?? null; if (totals && !bookmakerKey) bookmakerKey = bk.key; }
    if (h2h && totals) break;
  }

  const isHome = game.home_team?.toLowerCase().includes(teamName?.toLowerCase()) ||
    teamName?.toLowerCase().includes(game.home_team?.toLowerCase());
  const homeOutcome = h2h?.outcomes?.find((o) => o.name === game.home_team);
  const awayOutcome = h2h?.outcomes?.find((o) => o.name === game.away_team);
  const teamOutcome = isHome ? homeOutcome : awayOutcome;

  const over = totals?.outcomes?.find((o) => o.name === "Over");

  return {
    matchup: `${game.away_team} @ ${game.home_team}`,
    team_moneyline: teamOutcome?.price ?? null,
    team_win_implied: teamOutcome ? `${americanToImplied(teamOutcome.price)}%` : null,
    run_total: over?.point ?? null,
    bookmaker: bookmakerKey,
    note: "Player props (HR, hits, Ks) require a paid Odds API plan. Showing game-level odds.",
  };
}

exports.handler = async (event) => {
  const { teamName } = JSON.parse(event.body || "{}");
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return { statusCode: 500, body: JSON.stringify({ error: "Missing ODDS_API_KEY" }) };

  try {
    const result = await getGameOdds(apiKey, teamName);
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

module.exports.getPlayerOdds = async (_playerName, teamName) => {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return null;
  try {
    return await getGameOdds(apiKey, teamName);
  } catch {
    return null;
  }
};
