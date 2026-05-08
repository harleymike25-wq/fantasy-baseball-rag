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

// ── Parse roster string into { slot, name, team } entries ───────────────────
function parseRoster(roster) {
  if (!roster) return [];
  // Format: "SP_1: Framber Valdez (HOU), C_1: Will Smith (LAD), ..."
  return roster.split(",").map((entry) => {
    const m = entry.trim().match(/^(\w+):\s*(.+?)\s*\(([^)]+)\)$/);
    if (!m) return null;
    return { slot: m[1], name: m[2].trim(), team: m[3].trim() };
  }).filter(Boolean);
}

// ── Extract player names from message + roster ───────────────────────────────
function extractPlayerNames(messages, roster) {
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const msgLower = lastUserMsg.toLowerCase();

  const rosterEntries = parseRoster(roster);
  const seen = new Set();
  const names = [];
  const add = (name) => { if (!seen.has(name)) { seen.add(name); names.push(name); } };

  // Detect pitcher-specific questions — only pull SP/RP slots
  const pitcherIntent = /\bpitcher|sp\b|start.*pitch|pitch.*start/i.test(lastUserMsg);
  const batterIntent = /\bbatter|hitter|bench|lineup|position player/i.test(lastUserMsg);

  const relevantEntries = pitcherIntent && !batterIntent
    ? rosterEntries.filter((e) => e.slot.startsWith("SP") || e.slot.startsWith("RP") || e.slot.startsWith("P"))
    : batterIntent && !pitcherIntent
    ? rosterEntries.filter((e) => !e.slot.startsWith("SP") && !e.slot.startsWith("RP"))
    : rosterEntries;

  // Match roster players by full name or last name appearing in message
  for (const { name } of relevantEntries) {
    const last = name.split(" ").pop().toLowerCase();
    const first = name.split(" ")[0].toLowerCase();
    if (msgLower.includes(last) || msgLower.includes(first)) {
      add(name);
    }
  }

  // For general pitcher/batter questions with no specific names, don't auto-fetch —
  // let the caller fall back to schedule + roster context instead

  // Also catch capitalized names not on roster
  const stopWords = new Set(["Should", "Start", "Sit", "Today", "Tomorrow", "Who", "What", "How", "Can", "The", "And", "For", "Kenny", "Powers"]);
  const capWords = lastUserMsg.match(/\b[A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+)?\b/g) ?? [];
  for (const w of capWords) {
    if (!stopWords.has(w)) add(w);
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

      const isPitcher = ["SP", "RP", "P"].includes(pd.player?.position);
      const [weather, odds] = await Promise.all([
        venue ? getWeather(venue).catch(() => null) : Promise.resolve(null),
        (!isPitcher && team) ? getPlayerOdds(null, team).catch(() => null) : Promise.resolve(null),
      ]);

      return { ...pd, weather, odds, statcast };
    })
  );

  return enriched;
}

// ── System prompt ────────────────────────────────────────────────────────────
function buildSystemPrompt(roster, playerContext, scheduleContext) {
  const rosterBlock = roster
    ? `\n\n<my_roster>${roster}</my_roster>\nThe above is the user's current fantasy roster. Use it for context in all decisions.`
    : "";

  const dataBlock = playerContext
    ? `\n\n<player_data>${JSON.stringify(playerContext, null, 2)}</player_data>\nThe above is real-time data fetched for the players in this question. Use it — do not recall stats from memory.`
    : scheduleContext
    ? `\n\n<schedule>${JSON.stringify(scheduleContext, null, 2)}</schedule>\nThe above is today's and tomorrow's MLB schedule with probable pitchers and venues. Cross-reference it against <my_roster> to identify which of the user's pitchers are starting today, their opponent, and venue. Use this to make start/sit recommendations.`
    : "";

  return `You are Kenny Powers — the foul-mouthed, wildly overconfident, trash-talking former MLB pitcher from Eastbound & Down. You give expert fantasy baseball advice but deliver it exactly like Kenny Powers would: profane, self-aggrandizing, brutally honest, with zero filter. You refer to yourself in the third person occasionally, insult weak pitchers and bad matchups like they personally offended you, and treat every start/sit decision like it's a matter of personal honor. Stay in character at all times.${rosterBlock}${dataBlock}

Never fabricate statistics. Use only data provided in <player_data> or <schedule>. If detailed stats aren't available, give your best recommendation based on matchup, opponent, and venue — do NOT ask the user to provide data. Just work with what you've got and own it.

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

    let playerContext = null;
    let scheduleContext = null;

    if (names.length) {
      playerContext = await fetchPlayerContext(names, statcastCache);
    } else {
      const { today, tomorrow } = await getTodayAndTomorrowSchedule();
      scheduleContext = { today, tomorrow };
    }

    const system = buildSystemPrompt(roster, playerContext, scheduleContext);

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
