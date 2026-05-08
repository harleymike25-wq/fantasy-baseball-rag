#!/usr/bin/env node
/**
 * Pre-fetches Statcast leaderboard data from Baseball Savant for 2022–2024.
 * Run once locally: node scripts/fetch-statcast.js
 * Outputs JSON files to data/statcast/ keyed by MLBAM player ID.
 */

const fs = require("fs");
const path = require("path");

const OUTPUT_DIR = path.join(__dirname, "../data/statcast");
const SEASONS = [2022, 2023, 2024];

// Baseball Savant Statcast leaderboard CSV endpoint
function buildUrl(season) {
  return (
    `https://baseballsavant.mlb.com/leaderboard/statcast?` +
    `type=batter&year=${season}&position=&team=&min=25` +
    `&csv=true`
  );
}

function parseCSV(csv) {
  const lines = csv.trim().split("\n");
  const headers = lines[0].split(",").map((h) => h.trim().replace(/"/g, ""));
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim().replace(/"/g, ""));
    return Object.fromEntries(headers.map((h, i) => [h, values[i]]));
  });
}

const FIELDS = [
  "player_id",
  "last_name, first_name",
  "xba",
  "xslg",
  "xwoba",
  "barrel_batted_rate",
  "hard_hit_percent",
  "launch_speed",
  "launch_angle",
  "sprint_speed",
  "oz_swing_percent",
  "iz_contact_percent",
  "k_percent",
  "bb_percent",
];

async function fetchSeason(season) {
  console.log(`Fetching Statcast leaderboard for ${season}...`);
  const url = buildUrl(season);
  const res = await fetch(url);

  if (!res.ok) {
    console.error(`  Failed: HTTP ${res.status}`);
    return {};
  }

  const csv = await res.text();
  const rows = parseCSV(csv);
  console.log(`  Got ${rows.length} players`);

  const byId = {};
  for (const row of rows) {
    const id = row["player_id"] || row["mlbam_id"];
    if (!id) continue;
    byId[id] = {};
    for (const field of FIELDS) {
      if (row[field] !== undefined) byId[id][field] = row[field];
    }
    byId[id]["season"] = season;
  }
  return byId;
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  for (const season of SEASONS) {
    const data = await fetchSeason(season);
    const outPath = path.join(OUTPUT_DIR, `statcast_${season}.json`);
    fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
    console.log(`  Saved → ${outPath} (${Object.keys(data).length} players)`);
  }

  console.log("\nDone! Statcast data cached to data/statcast/");
}

main().catch(console.error);
