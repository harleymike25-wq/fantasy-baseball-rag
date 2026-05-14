#!/usr/bin/env node
/**
 * One-time PDF ingestion script.
 * Usage: npm run ingest /path/to/cocktails.pdf
 *
 * Requires env vars: ANTHROPIC_API_KEY, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
 * (or SUPABASE_SERVICE_KEY for writes that bypass RLS)
 *
 * Load them from a .env file with: node --env-file=.env scripts/ingest-pdf.js cocktails.pdf
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function require_env(name) {
  const val = process.env[name];
  if (!val) {
    console.error(`Missing env var: ${name}`);
    process.exit(1);
  }
  return val;
}

const PDF_PATH = path.resolve(process.argv[2] || path.join(__dirname, "cocktails.pdf"));

const client = new Anthropic({ apiKey: require_env("ANTHROPIC_API_KEY") });
const supabase = createClient(
  require_env("VITE_SUPABASE_URL"),
  process.env.SUPABASE_SERVICE_KEY || require_env("VITE_SUPABASE_ANON_KEY")
);

async function ingest() {
  if (!fs.existsSync(PDF_PATH)) {
    console.error(`File not found: ${PDF_PATH}`);
    console.error("Usage: npm run ingest /path/to/cocktails.pdf");
    process.exit(1);
  }

  console.log(`Reading ${path.basename(PDF_PATH)}…`);
  const base64 = fs.readFileSync(PDF_PATH).toString("base64");

  console.log("Sending to Claude for recipe extraction (this may take a minute)…");

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
            text: `Extract ALL cocktail recipes from this document. Return ONLY a JSON array:

[
  {
    "name": "Cocktail Name",
    "ingredients": [
      { "amount": "1.5", "unit": "oz", "ingredient": "gin", "category": "gin", "optional": false }
    ],
    "instructions": "Full method text",
    "glassware": "coupe",
    "garnish": "lemon twist",
    "spirit_categories": ["gin", "sweet vermouth", "campari"],
    "tags": ["classic", "stirred", "spirit-forward"],
    "notes": "history, tips, variations"
  }
]

Rules:
- spirit_categories: all spirits, liqueurs, and key modifiers — lowercase, no amounts
- ingredients: parse each line into amount + unit + ingredient
- Include every recipe, even simple ones
- Return ONLY the JSON array`,
          },
        ],
      },
    ],
  });

  const text = response.content[0].text.trim();
  let recipes;
  try {
    const match = text.match(/\[[\s\S]*\]/);
    recipes = JSON.parse(match ? match[0] : text);
  } catch (err) {
    console.error("Failed to parse Claude's response:", err.message);
    console.error("Raw (first 1000 chars):", text.slice(0, 1000));
    process.exit(1);
  }

  if (!Array.isArray(recipes) || recipes.length === 0) {
    console.error("No recipes extracted. Check the PDF and try again.");
    process.exit(1);
  }

  console.log(`Extracted ${recipes.length} recipes. Inserting into Supabase…`);

  const BATCH = 20;
  let inserted = 0;
  for (let i = 0; i < recipes.length; i += BATCH) {
    const batch = recipes.slice(i, i + BATCH);
    const { error } = await supabase.from("recipes").insert(batch);
    if (error) {
      console.error(`Batch ${Math.floor(i / BATCH) + 1} error:`, error.message);
    } else {
      inserted += batch.length;
      process.stdout.write(`\r${inserted}/${recipes.length} inserted`);
    }
  }

  console.log(`\nDone! ${inserted}/${recipes.length} recipes ingested.`);
}

ingest().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
