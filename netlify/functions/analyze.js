const { default: Anthropic } = require("@anthropic-ai/sdk");
const path = require("path");
const fs = require("fs");

const {
  getTodayAndTomorrowSchedule,
  searchPlayer,
  getSeasonStats,
  getRecentGameLog,
} = require("./mlb");
const { getWeather } = require("./weather");

const client = new Anthropic();

function loadStatcast() {
  try {
    const dir = path.join(__dirname, "../../data/statcast");
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
    const merged = {};
    for (const file of files) {
      const data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
      for (const [id, stats] of Object.entries(data)) {
        if (!merged[id]) merged[id] = {};
        Object.assign(merged[id], stats);
      }
    }
    return merged;
  } catch {
    return {};
  }
}

function parseRoster(rosterStr) {
  if (!rosterStr) return [];
  return rosterStr.split(",").map((entry) => {
    const m = entry.trim().match(/^(\w+):\s*(.+?)\s*\(([^)]+)\)$/);
    if (!m) return null;
    return { slot: m[1], name: m[2].trim(), team: m[3].trim() };
  }).filter(Boolean);
}

const KENNY_VOICE = `You are Kenny Powers — the foul-mouthed, wildly overconfident, trash-talking former MLB pitcher from Eastbound & Down. You give expert fantasy baseball advice delivered exactly like Kenny Powers would: profane, self-aggrandizing, brutally honest, zero filter. Stay in character at all times. Never fabricate statistics — use only data provided to you.`;

// ── Light player fetch: ~3 API calls total (search + stats + log), no pitcher lookup ──
async function fetchPlayerLight(name, schedule, statcastCache) {
  const player = await searchPlayer(name);
  if (!player) return { error: `Player not found: ${name}`, name };

  const season = new Date().getFullYear();
  const position = player.primaryPosition?.abbreviation;
  const teamName = player.currentTeam?.name?.toLowerCase() ?? "";

  const [seasonStats, recentLog] = await Promise.all([
    getSeasonStats(player.id, season, position).catch(() => []),
    getRecentGameLog(player.id, season).catch(() => []),
  ]);

  // Find game from already-fetched schedule — no extra API call
  function findGame(games) {
    if (!teamName) return undefined;
    return games.find(
      (g) =>
        g.teams?.away?.team?.name?.toLowerCase().includes(teamName) ||
        g.teams?.home?.team?.name?.toLowerCase().includes(teamName)
    );
  }

  const todayGame = findGame(schedule.today);
  const tomorrowGame = findGame(schedule.tomorrow);
  const nextGame = todayGame ?? tomorrowGame;
  const nextGameDay = todayGame ? "today" : tomorrowGame ? "tomorrow" : null;

  let todayGameInfo = null;
  if (nextGame) {
    const isHome = nextGame.teams?.home?.team?.name?.toLowerCase().includes(teamName);
    const opp = isHome ? nextGame.teams?.away : nextGame.teams?.home;
    const pitcher = isHome
      ? nextGame.teams?.away?.probablePitcher
      : nextGame.teams?.home?.probablePitcher;

    todayGameInfo = {
      when: nextGameDay,
      opponent: opp?.team?.name,
      venue: nextGame.venue?.name,
      // Pitcher name + handedness from schedule — no extra API call needed
      probablePitcher: pitcher
        ? { name: pitcher.fullName, throws: pitcher.pitchHand?.code }
        : null,
    };
  }

  return {
    player: {
      id: player.id,
      name: player.fullName,
      team: player.currentTeam?.name ?? "Free Agent",
      position,
      bats: player.batSide?.code,
    },
    seasonStats: seasonStats?.[0]?.splits?.[0]?.stat ?? {},
    recentLog: recentLog.slice(-7).map((g) => ({ date: g.date, opponent: g.opponent?.name, stat: g.stat })),
    statcast: player.id ? (statcastCache[player.id] ?? null) : null,
    todayGame: todayGameInfo,
  };
}

// ── Start / Sit ───────────────────────────────────────────────────────────────
async function handleStartSit(players, roster, statcastCache) {
  const schedule = await getTodayAndTomorrowSchedule().catch(() => ({ today: [], tomorrow: [] }));

  // Fetch both players in parallel — light fetch only (~3 calls each)
  const playerData = await Promise.all(
    players.map((p) => fetchPlayerLight(p.name, schedule, statcastCache).catch((e) => ({ error: e.message, name: p.name })))
  );

  // Fetch weather for each player's venue in parallel
  const enriched = await Promise.all(
    playerData.map(async (pd) => {
      if (pd.error) return pd;
      const venue = pd.todayGame?.venue;
      const weather = venue ? await getWeather(venue).catch(() => null) : null;
      return { ...pd, weather };
    })
  );

  const system = `${KENNY_VOICE}

<my_roster>${roster}</my_roster>
<player_data>${JSON.stringify(enriched, null, 2)}</player_data>

For EACH player give:
1. 📊 Score: [X]/100 — [START / LEAN START / NEUTRAL / LEAN SIT / SIT]
2. Season stats: AVG/OPS/HR/RBI/SB or ERA/WHIP/K9
3. Last 7 days: hot or cold streak
4. Matchup: opponent, probable pitcher name & handedness
5. Weather: temp, wind, indoor/outdoor
6. Statcast: xBA, barrel%, hard hit% (if available)

End with a clear final verdict on who to start.`;

  return {
    system,
    userMsg: `Compare these two players and tell me who to start: ${players.map((p) => p.name).join(" vs ")}`,
  };
}

// ── Trade ─────────────────────────────────────────────────────────────────────
async function handleTrade(give, get, roster) {
  const season = new Date().getFullYear();
  const allPlayers = [...give, ...get];

  const stats = await Promise.all(
    allPlayers.map(async (p) => {
      const found = await searchPlayer(p.name).catch(() => null);
      if (!found) return { name: p.name, error: "not found" };
      const position = found.primaryPosition?.abbreviation;
      const seasonStats = await getSeasonStats(found.id, season, position).catch(() => []);
      return {
        name: found.fullName,
        team: found.currentTeam?.name ?? "Free Agent",
        position,
        age: found.currentAge,
        stats: seasonStats?.[0]?.splits?.[0]?.stat ?? {},
      };
    })
  );

  const giveData = stats.slice(0, give.length);
  const getData = stats.slice(give.length);

  const system = `${KENNY_VOICE}

<my_roster>${roster}</my_roster>
<trade>
YOU GIVE: ${JSON.stringify(giveData, null, 2)}
YOU GET: ${JSON.stringify(getData, null, 2)}
</trade>

Analyze: current season production, positional scarcity, age/trajectory, roster fit.
End with a clear verdict: ACCEPT / DECLINE / COUNTER (and if counter, suggest what).`;

  const giveNames = give.map((p) => p.name).join(", ");
  const getNames = get.map((p) => p.name).join(", ");
  return {
    system,
    userMsg: `Analyze this trade: I give ${giveNames} — I get ${getNames}`,
  };
}

// ── Waiver Wire ───────────────────────────────────────────────────────────────
async function handleWaiver(candidates, position, roster, statcastCache) {
  const schedule = await getTodayAndTomorrowSchedule().catch(() => ({ today: [], tomorrow: [] }));

  // Light fetch for each candidate — same fast path as start/sit
  const playerData = await Promise.all(
    candidates.map((p) => fetchPlayerLight(p.name, schedule, statcastCache).catch((e) => ({ error: e.message, name: p.name })))
  );

  const system = `${KENNY_VOICE}

<my_roster>${roster}</my_roster>
<waiver_candidates>${JSON.stringify(playerData, null, 2)}</waiver_candidates>
${position ? `<target_position>${position}</target_position>` : ""}

Rank each candidate with:
1. 📋 Pick Priority: #1, #2, etc.
2. Season stats
3. Recent form (last 7 days)
4. Upcoming matchup
5. Verdict: pick up or pass and why

End with a clear #1 recommendation.`;

  return {
    system,
    userMsg: `Rank these waiver wire candidates${position ? ` for ${position}` : ""}: ${candidates.map((p) => p.name).join(", ")}`,
  };
}

// ── Roster Check ──────────────────────────────────────────────────────────────
async function handleRosterCheck(roster) {
  const season = new Date().getFullYear();
  const players = parseRoster(roster);

  const playerStats = await Promise.all(
    players.map(async ({ slot, name }) => {
      const found = await searchPlayer(name).catch(() => null);
      if (!found) return { slot, name, error: "not found" };
      const position = found.primaryPosition?.abbreviation;
      const seasonStats = await getSeasonStats(found.id, season, position).catch(() => []);
      return {
        slot,
        name: found.fullName,
        team: found.currentTeam?.name ?? "Free Agent",
        position,
        age: found.currentAge,
        stats: seasonStats?.[0]?.splits?.[0]?.stat ?? {},
      };
    })
  );

  const system = `${KENNY_VOICE}

<roster_data>${JSON.stringify(playerStats, null, 2)}</roster_data>

Conduct a full roster audit. Include:
1. Grade each player A/B/C/D/F based on production vs positional average this season — one line each
2. 🏆 Top 3 assets (keepers)
3. 💩 3 biggest weaknesses or busts
4. Overall roster grade A–F with a one-sentence verdict
5. 2–3 specific actionable moves to improve (trades, drops, pickups by position)

Be brutal. Kenny doesn't sugarcoat.`;

  return {
    system,
    userMsg: "Audit my entire roster. Grade every player and tell me where I stand.",
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  const body = JSON.parse(event.body || "{}");
  const { mode, roster } = body;

  try {
    const statcastCache = (mode === "start-sit" || mode === "waiver") ? loadStatcast() : {};
    let systemPrompt, userMsg;

    switch (mode) {
      case "start-sit": {
        const { players } = body;
        if (!players?.length) return { statusCode: 400, body: JSON.stringify({ error: "Provide 2 players" }) };
        ({ system: systemPrompt, userMsg } = await handleStartSit(players, roster, statcastCache));
        break;
      }
      case "trade": {
        const { give, get } = body;
        if (!give?.length || !get?.length) return { statusCode: 400, body: JSON.stringify({ error: "Provide players for both sides" }) };
        ({ system: systemPrompt, userMsg } = await handleTrade(give, get, roster));
        break;
      }
      case "waiver": {
        const { candidates, position } = body;
        if (!candidates?.length) return { statusCode: 400, body: JSON.stringify({ error: "Add at least one candidate" }) };
        ({ system: systemPrompt, userMsg } = await handleWaiver(candidates, position, roster, statcastCache));
        break;
      }
      case "roster-check": {
        if (!roster) return { statusCode: 400, body: JSON.stringify({ error: "No roster found — build your team first" }) };
        ({ system: systemPrompt, userMsg } = await handleRosterCheck(roster));
        break;
      }
      default:
        return { statusCode: 400, body: JSON.stringify({ error: "Unknown mode" }) };
    }

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userMsg }],
    });

    const reply = response.content.find((b) => b.type === "text")?.text ?? "";
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reply, usage: response.usage }),
    };
  } catch (err) {
    console.error("[analyze] error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
