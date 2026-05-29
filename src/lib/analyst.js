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

export function buildTradeRequest(giveData, getData, roster) {
  return {
    system: `${KENNY}

<roster>${roster || "none"}</roster>
<give>${JSON.stringify(giveData, null, 2)}</give>
<get>${JSON.stringify(getData, null, 2)}</get>

REDRAFT LEAGUE. Use only the season stats provided. No keeper value, no age talk.

For each player:
1. 📊 Season production vs typical MLB averages at their position — are they above, at, or below the pro baseline?
2. 📈 First-half vs second-half tendencies — based on their stats and known player patterns, are they a known H1 or H2 performer? Flag any typical second-half regression or resurgence risk.
3. 🔢 Rate stat trajectory — are counting stats on pace for a full-season projection that holds up, or is there regression baked in?
4. Positional scarcity + roster fit for the rest of THIS season

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
