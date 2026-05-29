const KENNY =
  `You are Kenny Powers — foul-mouthed, overconfident, trash-talking former MLB pitcher from Eastbound & Down. Expert fantasy baseball advice delivered in his voice: profane, self-aggrandizing, brutally honest. Never fabricate statistics — use only data provided.`;

function trimLog(log = []) {
  return log.slice(-5).map((g) => ({
    date: g.date,
    opponent: g.opponent,
    stat: g.stat
      ? {
          hits: g.stat.hits, atBats: g.stat.atBats,
          homeRuns: g.stat.homeRuns, rbi: g.stat.rbi,
          strikeOuts: g.stat.strikeOuts, baseOnBalls: g.stat.baseOnBalls,
          inningsPitched: g.stat.inningsPitched, earnedRuns: g.stat.earnedRuns,
        }
      : {},
  }));
}

function trimPlayer(pd) {
  return { player: pd.player, seasonStats: pd.seasonStats, recentLog: trimLog(pd.recentLog), todayGame: pd.todayGame };
}

export function buildStartSitRequest(playerData, roster) {
  const data = playerData.map(trimPlayer);
  return {
    system: `${KENNY}\n\n<roster>${roster || "none"}</roster>\n<players>${JSON.stringify(data, null, 2)}</players>\n\nFor EACH player:\n1. 📊 Score: [X]/100 — START / LEAN START / NEUTRAL / LEAN SIT / SIT\n2. Season stats\n3. Last 5 games: hot or cold\n4. Matchup: opponent + pitcher name & handedness\n5. Weather if available\n\nEnd with a clear final verdict.`,
    messages: [{ role: "user", content: `Who do I start: ${data.map((d) => d.player.name).join(" vs ")}?` }],
  };
}

function trimTradeLog(log = []) {
  return log.slice(-14).map((g) => ({
    date: g.date,
    opp: g.opponent,
    stat: g.stat
      ? {
          H: g.stat.hits, AB: g.stat.atBats,
          HR: g.stat.homeRuns, RBI: g.stat.rbi,
          K: g.stat.strikeOuts, BB: g.stat.baseOnBalls,
          IP: g.stat.inningsPitched, ER: g.stat.earnedRuns,
        }
      : {},
  }));
}

export function buildTradeRequest(giveData, getData, roster) {
  const shape = (players) =>
    players.map((p) => ({
      player: p.player,
      seasonStats: p.seasonStats,
      last14Games: trimTradeLog(p.recentLog),
    }));

  const give = shape(giveData);
  const get = shape(getData);

  return {
    system: `${KENNY}

<roster>${roster || "none"}</roster>
<give>${JSON.stringify(give, null, 2)}</give>
<get>${JSON.stringify(get, null, 2)}</get>

REDRAFT LEAGUE. This season's production is all that matters — no keeper value, no age, no dynasty talk.

For each player:
1. 📊 Season stats: rate stats + counting stats pace
2. 🔥 Last 14 games: hot, cold, or steady? Cite specifics from the game log
3. 📈 Trend vs season average: is this a second-half resurgence or a slump? Explicitly say which
4. Positional scarcity + roster fit for the rest of THIS season
5. Buy-high / sell-high risk based on recent trend

End with ACCEPT / DECLINE / COUNTER verdict.`,
    messages: [{ role: "user", content: `Trade: I give ${giveData.map((d) => d.player.name).join(", ")} — I get ${getData.map((d) => d.player.name).join(", ")}` }],
  };
}

export function buildWaiverRequest(playerData, position, roster) {
  const data = playerData.map(trimPlayer);
  return {
    system: `${KENNY}\n\n<roster>${roster || "none"}</roster>\n${position ? `<need>${position}</need>\n` : ""}<candidates>${JSON.stringify(data, null, 2)}</candidates>\n\nRank each:\n1. Pick Priority #1, #2...\n2. Season stats\n3. Recent form\n4. Upcoming matchup\n\nGive a clear #1 pickup recommendation.`,
    messages: [{ role: "user", content: `Rank these waiver candidates${position ? ` for ${position}` : ""}: ${data.map((d) => d.player.name).join(", ")}` }],
  };
}

export function buildRosterCheckRequest(playerData, roster) {
  const data = playerData.map((pd) => ({ slot: pd.slot, player: pd.player, seasonStats: pd.seasonStats }));
  return {
    system: `${KENNY}\n\n<roster>${JSON.stringify(data, null, 2)}</roster>\n\nFull audit:\n1. Grade each player A/B/C/D/F vs positional average — one line each\n2. 🏆 Top 3 assets\n3. 💩 3 biggest busts\n4. Overall grade A–F with one-sentence verdict\n5. 2-3 actionable moves\n\nBe brutal.`,
    messages: [{ role: "user", content: "Audit my roster and grade every player." }],
  };
}
