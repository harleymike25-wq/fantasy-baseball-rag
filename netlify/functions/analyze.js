const { default: Anthropic } = require("@anthropic-ai/sdk");
const path = require("path");
const fs = require("fs");

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

const KENNY_VOICE = `You are Kenny Powers — the foul-mouthed, wildly overconfident, trash-talking former MLB pitcher from Eastbound & Down. You give expert fantasy baseball advice delivered exactly like Kenny Powers would: profane, self-aggrandizing, brutally honest, zero filter. Stay in character at all times. Never fabricate statistics — use only data provided to you.`;

// ── Start / Sit ───────────────────────────────────────────────────────────────
function handleStartSit(playerData, roster, statcastCache) {
  const enriched = playerData.map((pd) => ({
    ...pd,
    statcast: pd.player?.id ? (statcastCache[String(pd.player.id)] ?? null) : null,
  }));

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
    userMsg: `Compare these two players and tell me who to start: ${enriched.map((pd) => pd.player.name).join(" vs ")}`,
  };
}

// ── Trade ─────────────────────────────────────────────────────────────────────
function handleTrade(giveData, getData, roster) {
  const system = `${KENNY_VOICE}

<my_roster>${roster}</my_roster>
<trade>
YOU GIVE: ${JSON.stringify(giveData, null, 2)}
YOU GET: ${JSON.stringify(getData, null, 2)}
</trade>

Analyze: current season production, positional scarcity, age/trajectory, roster fit.
End with a clear verdict: ACCEPT / DECLINE / COUNTER (and if counter, suggest what).`;

  const giveNames = giveData.map((d) => d.player.name).join(", ");
  const getNames = getData.map((d) => d.player.name).join(", ");
  return {
    system,
    userMsg: `Analyze this trade: I give ${giveNames} — I get ${getNames}`,
  };
}

// ── Waiver Wire ───────────────────────────────────────────────────────────────
function handleWaiver(playerData, position, roster, statcastCache) {
  const enriched = playerData.map((pd) => ({
    ...pd,
    statcast: pd.player?.id ? (statcastCache[String(pd.player.id)] ?? null) : null,
  }));

  const system = `${KENNY_VOICE}

<my_roster>${roster}</my_roster>
<waiver_candidates>${JSON.stringify(enriched, null, 2)}</waiver_candidates>
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
    userMsg: `Rank these waiver wire candidates${position ? ` for ${position}` : ""}: ${enriched.map((pd) => pd.player.name).join(", ")}`,
  };
}

// ── Roster Check ──────────────────────────────────────────────────────────────
function handleRosterCheck(playerData, roster) {
  const system = `${KENNY_VOICE}

<roster_data>${JSON.stringify(playerData, null, 2)}</roster_data>

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
  const { mode, roster, playerData, giveData, getData, position } = body;

  try {
    const statcastCache =
      mode === "start-sit" || mode === "waiver" ? loadStatcast() : {};
    let systemPrompt, userMsg;

    switch (mode) {
      case "start-sit": {
        if (!playerData?.length) return { statusCode: 400, body: JSON.stringify({ error: "No player data provided" }) };
        ({ system: systemPrompt, userMsg } = handleStartSit(playerData, roster, statcastCache));
        break;
      }
      case "trade": {
        if (!giveData?.length || !getData?.length) return { statusCode: 400, body: JSON.stringify({ error: "Provide players for both sides" }) };
        ({ system: systemPrompt, userMsg } = handleTrade(giveData, getData, roster));
        break;
      }
      case "waiver": {
        if (!playerData?.length) return { statusCode: 400, body: JSON.stringify({ error: "No candidates provided" }) };
        ({ system: systemPrompt, userMsg } = handleWaiver(playerData, position, roster, statcastCache));
        break;
      }
      case "roster-check": {
        if (!playerData?.length) return { statusCode: 400, body: JSON.stringify({ error: "No roster data provided" }) };
        ({ system: systemPrompt, userMsg } = handleRosterCheck(playerData, roster));
        break;
      }
      default:
        return { statusCode: 400, body: JSON.stringify({ error: "Unknown mode" }) };
    }

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
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
