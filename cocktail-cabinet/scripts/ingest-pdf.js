#!/usr/bin/env node
/**
 * One-time PDF ingestion script.
 * Usage: node --env-file=.env scripts/ingest-pdf.js /path/to/cocktails.pdf
 *   or:  npm run ingest /path/to/cocktails.pdf
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function requireEnv(name) {
  const val = process.env[name];
  if (!val) { console.error(`Missing env var: ${name}`); process.exit(1); }
  return val;
}

const PDF_PATH = path.resolve(process.argv[2] || path.join(__dirname, "cocktails.pdf"));
const client = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
const supabase = createClient(
  requireEnv("VITE_SUPABASE_URL"),
  process.env.SUPABASE_SERVICE_KEY || requireEnv("VITE_SUPABASE_ANON_KEY")
);

function salvageRecipes(jsonStr) {
  const recipes = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;

  for (let i = 0; i < jsonStr.length; i++) {
    const c = jsonStr[i];
    if (escape) { escape = false; continue; }
    if (c === '\\' && inString) { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (c === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        try {
          const obj = JSON.parse(jsonStr.slice(start, i + 1));
          if (obj.name && obj.ingredients) recipes.push(obj);
        } catch { /* skip malformed */ }
        start = -1;
      }
    }
  }
  return recipes;
}

async function ingest() {
  if (!fs.existsSync(PDF_PATH)) {
    console.error(`File not found: ${PDF_PATH}`);
    console.error("Usage: npm run ingest /path/to/cocktails.pdf");
    process.exit(1);
  }

  console.log(`Reading ${path.basename(PDF_PATH)}...`);
  const base64 = fs.readFileSync(PDF_PATH).toString("base64");

  console.log("Sending to Claude for recipe extraction (may take a minute)...");
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8000,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: base64 },
          },
          {
            type: "text",
            text: `Extract ALL cocktail recipes from this document. Return ONLY a JSON array:\n\n[\n  {\n    "name": "Cocktail Name",\n    "ingredients": [\n      { "amount": "1.5", "unit": "oz", "ingredient": "gin", "category": "gin", "optional": false }\n    ],\n    "instructions": "Full method text",\n    "glassware": "coupe",\n    "garnish": "lemon twist",\n    "spirit_categories": ["gin", "sweet vermouth", "campari"],\n    "tags": ["classic", "stirred", "spirit-forward"],\n    "notes": "history, tips, variations"\n  }\n]\n\nRules:\n- spirit_categories: all spirits, liqueurs, key modifiers - lowercase, no amounts\n- Include every recipe\n- Return ONLY the JSON array`,
          },
        ],
      },
    ],
  });

  const text = response.content[0].text.trim();
  let recipes;
  try {
    const stripped = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```\s*$/m, '');
    const match = stripped.match(/\[[\s\S]*\]/);
    const jsonStr = match ? match[0] : stripped;
    try {
      recipes = JSON.parse(jsonStr);
    } catch {
      console.warn("Full JSON parse failed, salvaging partial results...");
      recipes = salvageRecipes(jsonStr);
      if (recipes.length === 0) throw new Error("No valid recipes could be extracted");
      console.warn(`Salvaged ${recipes.length} recipes (some may have been skipped due to formatting issues)`);
    }
  } catch (err) {
    console.error("Failed to parse Claude's response:", err.message);
    console.error("Raw (first 500 chars):", text.slice(0, 500));
    process.exit(1);
  }

  if (!Array.isArray(recipes) || recipes.length === 0) {
    console.error("No recipes extracted.");
    process.exit(1);
  }

  console.log(`Extracted ${recipes.length} recipes. Inserting into Supabase...`);
  let inserted = 0;
  for (let i = 0; i < recipes.length; i += 20) {
    const batch = recipes.slice(i, i + 20);
    const { error } = await supabase.from("recipes").insert(batch);
    if (error) console.error(`Batch error:`, error.message);
    else { inserted += batch.length; console.log(`${inserted}/${recipes.length} inserted`); }
  }
  console.log(`Done! ${inserted}/${recipes.length} recipes ingested.`);
}

ingest().catch((err) => { console.error("Fatal:", err.message); process.exit(1); });
