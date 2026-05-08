const { default: Anthropic } = require("@anthropic-ai/sdk");
const path = require("path");
const fs = require("fs");

const { getPlayerData, getTodayAndTomorrowSchedule } = require("./mlb");
const { getWeather } = require("./weather");
const { getPlayerOdds } = require("./odds");

const client = new Anthropic();

// ── Statcast lookup ──────────────────────────────────────────────────────────
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

// ── Extract player names from message + roster ───────────────────────────────
function extractPlayerNames(messages, roster) {
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";

  // Collect known roster names for cross-reference
  const rosterNames = [];
  if (roster) {
    const matches = roster.match(/[A-Z][a-z]+ [A-Z][a-z]+/g) ?? [];
    rosterNames.push(...matches);
  }

  // Words that look like player names (capitalized, 2+ chars) in the user message
  const words = lastUserMsg.match(/\b[A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+)?\b/g) ?? [];

  // Also check lowercase tokens against roster last names
  const tokens = lastUserMsg.toLowerCase().split(/\W+/);
  for (const rn of rosterNames) {
    const last = rn.split(" ").pop().toLowerCase();
    if (tokens.includes(last) && !words.includes(rn)) {
      words.push(rn);
    }
  }

  // Deduplicate, skip common non-name words
  const stopWords = new Set(["Should", "Start", "Sit", "Today", "Tomorrow", "Who", "What", "How", "Can", "The", "And", "For"]);
  const seen = new Set();
  const names = [];
  for (const w of words) {
    if (!stopWords.has(w) && !seen.has(w)) {
      seen.add(w);
      names.push(w);
    }
  }
  return names;
}

// ── Fetch all data for detected players ─────────────────────────────────────
async function fetchPlayerContext(names, statcastCache) {
  if (!names.length) return null;

  const playerDataList = await Promise.all(
    names.map((n) => getPlayerData(n).catch((e) => ({ error: e.message, name: n })))
  );

  // Fetch weather + odds in parallel for players that have a game
  const enriched = await Promise.all(
    playerDataList.map(async (pd) => {
      if (pd.error) return pd;

      const venue = pd.todayGame?.venue;
      const team = pd.player?.team;
      const playerId = pd.player?.id;
      const statcast = playerId ? (statcastCache[playerId] ?? null) : null;

      const [weather, odds] = await Promise.all([
        venue ? getWeather(venue).catch(() => null) : Promise.resolve(null),
        team ? getPlayerOdds(null, team).catch(() => null) : Promise.resolve(null),
      ]);

      return { ...pd, weather, odds, statcast };
    })
  );

  return enriched;
}

// ── System prompt ────────────────────────────────────────────────────────────
function buildSystemPrompt(roster, playerContext) {
  const rosterBlock = roster
    ? `\n\n<my_roster>${roster}</my_roster>\nThe above is the user's current fantasy roster. Use it for context in all decisions.`
    : "";

  const dataBlock = playerContext
    ? `\n\n<player_data>${JSON.stringify(playerContext, null, 2)}</player_data>\nThe above is real-time data fetched for the players in this question. Use it — do not recall stats from memory.`
    : "";

  return `You are Kenny Powers — the foul-mouthed, wildly overconfident, trash-talking former MLB pitcher from Eastbound & Down. You give expert fantasy baseball advice but deliver it exactly like Kenny Powers would: profane, self-aggrandizing, brutally honest, with zero filter. You refer to yourself in the third person occasionally, insult weak pitchers and bad matchups like they personally offended you, and treat every start/sit decision like it's a matter of personal honor. Stay in character at all times.${rosterBlock}${dataBlock}

Never fabricate statistics. Use only the data provided in <player_data>. If a field is missing, say so briefly and move on.

For EVERY player start/sit writeup include these sections:
1. 📊 Score: [X]/100 — [START / LEAN START / NEUTRAL / LEAN SIT / SIT]
2. Season stats: AVG / OPS / HR / RBI / SB (or ERA / WHIP / K9 for pitchers)
3. Last 7 days: hot or cold streak, specific highlights
4. Matchup: opposing pitcher name, ERA, WHIP, handedness
5. Platoon edge: batter splits vs L/R — favorable or unfavorable?
6. History vs pitcher: career AB, AVG, HR — or "first meeting" if no data
7. Weather: temp, wind, indoor/outdoor — note any power park impact
8. Statcast: xBA, barrel%, hard hit% — does underlying talent match results?

For simple conversation (greetings, thanks, clarifications) — respond directly without data.`;
}

// ── Main handler ─────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const { messages, roster } = JSON.parse(event.body || "{}");
  if (!messages?.length) {
    return { statusCode: 400, body: JSON.stringify({ error: "No messages provided" }) };
  }

  try {
    const statcastCache = loadStatcast();
    const names = extractPlayerNames(messages, roster);
    const playerContext = names.length ? await fetchPlayerContext(names, statcastCache) : null;
    const system = buildSystemPrompt(roster, playerContext);

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: messages.slice(-10),
    });

    const reply = response.content.find((b) => b.type === "text")?.text ?? "";
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reply, usage: response.usage }),
    };
  } catch (err) {
    console.error("[chat] error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
