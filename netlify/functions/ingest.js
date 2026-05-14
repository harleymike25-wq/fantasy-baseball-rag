/**
 * Web-based PDF ingest endpoint.
 * Accepts { pdf: base64String } — frontend converts the file to base64 before sending.
 * For large PDFs (>50 pages), prefer the local script: npm run ingest path/to/file.pdf
 */
const Anthropic = require("@anthropic-ai/sdk");
const { createClient } = require("@supabase/supabase-js");

const client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  return createClient(url, key);
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { pdf } = body;
  if (!pdf) {
    return { statusCode: 400, body: JSON.stringify({ error: "pdf field required (base64)" }) };
  }

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8000,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: pdf },
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
    "tags": ["classic", "stirred"],
    "notes": "any history or tips"
  }
]

Rules:
- spirit_categories: all spirits, liqueurs, and key modifiers — lowercase, no amounts
- Include every recipe in the document
- Return ONLY the JSON array, no explanation`,
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
  } catch {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to parse recipes from PDF", raw: text.slice(0, 500) }),
    };
  }

  const supabase = getSupabase();
  const batchSize = 20;
  let inserted = 0;

  for (let i = 0; i < recipes.length; i += batchSize) {
    const batch = recipes.slice(i, i + batchSize);
    const { error } = await supabase.from("recipes").insert(batch);
    if (!error) inserted += batch.length;
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ count: inserted, source: "pdf" }),
  };
};
